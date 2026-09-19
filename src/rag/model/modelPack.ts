import { Directory, File, FileMode, Paths } from 'expo-file-system';
import type { EmbeddingModelPackFile, EmbeddingModelPackManifest, InstalledEmbeddingModel } from '../../types';
import { calculateFileSha256 } from '../../downloads/file-integrity';
import { nextByteRange } from '../../downloads/http-range';
import { createSingleFlight } from '../../downloads/single-flight';
import {
  assertHttpsUrl,
  isChildUri,
  normalizePackRelativePath,
  normalizeSha256,
  requiredAvailableBytes,
  resolveSecurePackFileUrl,
} from '../../downloads/pack-security';
import {
  backupDirectoryName,
  resumableStagingDirectoryName,
} from '../../downloads/temporary-download-artifacts';
import {
  createInstalledEmbeddingModelFromManifest,
  listStoredInstalledEmbeddingModels,
  saveInstalledEmbeddingModel,
} from './modelRegistry';
import { validateEmbeddingModelManifest } from './model-manifest';
import { assertValidTestEmbedding } from './model-runtime-validation';

export { validateEmbeddingModelManifest } from './model-manifest';

export const OFFICIAL_BGE_M3_MODEL_PACK_URL =
  'https://huggingface.co/datasets/Yatorou/ChiShenMe/resolve/main/models/bge-m3-query-onnx/model-pack.json';

const MAX_MANIFEST_CHARACTERS = 1024 * 1024;
const PREFLIGHT_TIMEOUT_MS = 30_000;
const MAX_DOWNLOAD_ATTEMPTS = 3;
// Bytes moved per read when a resumed range is appended. The model pack is measured in gigabytes,
// so nothing here may scale with the file size.
const COPY_BUFFER_BYTES = 1024 * 1024;
const PART_FILE_SUFFIX = '.part';
const DOWNLOAD_STATE_NAME = '.model-download-state.json';

/**
 * `verify` hashes a finished file and `runtime` loads it into ONNX Runtime. Both take minutes on a
 * multi-gigabyte pack, so they report separately instead of leaving the download stuck near 100%.
 */
export type ModelDownloadPhase = 'download' | 'verify' | 'runtime';

export interface ModelDownloadProgress {
  phase: ModelDownloadPhase;
  fileRole: string;
  fileName: string;
  completedFiles: number;
  totalFiles: number;
  completedBytes: number;
  totalBytes: number;
  /** Completion of the active phase from 0 to 1, or `null` when the phase cannot be measured. */
  phaseRatio: number | null;
}

interface ModelFileProgressReporter {
  onDownloaded: (writtenBytes: number) => void;
  onVerified: (hashedBytes: number) => void;
}

interface ModelDownloadState {
  schemaVersion: 'chishenme.model-download-state.v1';
  resumeKey: string;
}

const runExclusiveDownload = createSingleFlight<InstalledEmbeddingModel>();

/**
 * Concurrent calls for the same manifest join the running download instead of starting a second one
 * that would append into the same staging files.
 */
export function downloadEmbeddingModelPack(
  manifestUrl = OFFICIAL_BGE_M3_MODEL_PACK_URL,
  onProgress?: (progress: ModelDownloadProgress) => void,
): Promise<InstalledEmbeddingModel> {
  const normalizedManifestUrl = assertHttpsUrl(manifestUrl, 'Model manifest URL').toString();
  return runExclusiveDownload(normalizedManifestUrl, () =>
    installEmbeddingModelPack(normalizedManifestUrl, onProgress),
  );
}

export function isEmbeddingModelPackDownloading(manifestUrl = OFFICIAL_BGE_M3_MODEL_PACK_URL) {
  return runExclusiveDownload.isRunning(assertHttpsUrl(manifestUrl, 'Model manifest URL').toString());
}

async function installEmbeddingModelPack(
  normalizedManifestUrl: string,
  onProgress?: (progress: ModelDownloadProgress) => void,
): Promise<InstalledEmbeddingModel> {
  const manifest = await fetchEmbeddingModelManifest(normalizedManifestUrl);
  // Read the registry before touching files so an unreadable registry refuses the install up front.
  const existingModels = await listStoredInstalledEmbeddingModels();
  const existingModel = existingModels.find((item) => item.id === manifest.id);
  const root = getModelsRootDirectory();
  ensureDirectory(root);

  const directoryName = sanitizePathSegment(`${manifest.id}_${manifest.version}`);
  const stagingDirectory = prepareStagingDirectory(root, directoryName, manifest, normalizedManifestUrl);
  const totalBytes = manifest.files.reduce((total, file) => total + file.sizeBytes, 0);
  const resumableBytes = countResumableBytes(stagingDirectory, manifest.files);
  assertSufficientDiskSpace(Math.max(0, totalBytes - resumableBytes));

  let completedBytes = 0;
  let backupDirectory: Directory | null = null;
  let committed = false;

  try {
    for (let index = 0; index < manifest.files.length; index += 1) {
      const entry = manifest.files[index];
      const destination = fileForRelativePath(stagingDirectory, entry.path);
      const remoteUrl = resolveSecurePackFileUrl(normalizedManifestUrl, entry, 'Model pack');
      const report = (phase: ModelDownloadPhase, fileBytes: number, phaseRatio: number | null) => {
        onProgress?.({
          phase,
          fileRole: entry.role,
          fileName: entry.path,
          completedFiles: index,
          totalFiles: manifest.files.length,
          completedBytes: completedBytes + fileBytes,
          totalBytes,
          phaseRatio,
        });
      };

      const fileBytes = await downloadAndVerifyModelFile(entry, remoteUrl, destination, {
        onDownloaded: (writtenBytes) => {
          report('download', writtenBytes, totalBytes > 0 ? (completedBytes + writtenBytes) / totalBytes : null);
        },
        onVerified: (hashedBytes) => {
          report('verify', entry.sizeBytes, entry.sizeBytes > 0 ? hashedBytes / entry.sizeBytes : null);
        },
      });

      completedBytes += fileBytes;
      onProgress?.({
        phase: 'download',
        fileRole: entry.role,
        fileName: entry.path,
        completedFiles: index + 1,
        totalFiles: manifest.files.length,
        completedBytes,
        totalBytes,
        phaseRatio: totalBytes > 0 ? completedBytes / totalBytes : null,
      });
    }

    removeFileIfPresent(new File(stagingDirectory, DOWNLOAD_STATE_NAME));
    writeTextFile(new File(stagingDirectory, 'model-pack.json'), JSON.stringify(manifest, null, 2));

    const previousDirectory = new Directory(root, directoryName);
    if (previousDirectory.exists) {
      backupDirectory = new Directory(root, backupDirectoryName(directoryName));
      previousDirectory.moveSync(backupDirectory);
    }

    const installedDirectory = new Directory(root, directoryName);
    stagingDirectory.moveSync(installedDirectory);
    committed = true;

    const installedCandidate = createInstalledEmbeddingModelFromManifest(
      manifest,
      installedDirectory.uri,
      new File(installedDirectory, 'model-pack.json').uri,
      normalizedManifestUrl,
      existingModel?.active ?? existingModels.length === 0,
    );
    onProgress?.({
      phase: 'runtime',
      fileRole: 'modelOnnx',
      fileName: manifest.id,
      completedFiles: manifest.files.length,
      totalFiles: manifest.files.length,
      completedBytes: totalBytes,
      totalBytes,
      phaseRatio: null,
    });
    await verifyEmbeddingModelRuntime(installedCandidate);
    const installed: InstalledEmbeddingModel = {
      ...installedCandidate,
      testEmbeddingVerifiedAt: new Date().toISOString(),
    };
    await saveInstalledEmbeddingModel(installed);

    try {
      removeDirectoryIfPresent(root, backupDirectory);
    } catch {
      // The verified model is already registered. A stale backup is safer than rolling it back.
    }
    return installed;
  } catch (error) {
    if (committed) {
      removeDirectoryIfPresent(root, new Directory(root, directoryName));
    }
    if (backupDirectory?.exists) {
      backupDirectory.moveSync(new Directory(root, directoryName));
    }

    // Before commit the isolated staging directory is deliberately kept as a resumable cache.
    throw error;
  }
}

async function verifyEmbeddingModelRuntime(model: InstalledEmbeddingModel) {
  const { BgeM3OnnxEmbedder } = await import('../embedding/BgeM3OnnxEmbedder');
  const vector = await new BgeM3OnnxEmbedder(model).embed('今晚吃什么');
  assertValidTestEmbedding(vector, model.dimension);
}

export async function fetchEmbeddingModelManifest(manifestUrl: string): Promise<EmbeddingModelPackManifest> {
  const normalizedManifestUrl = assertHttpsUrl(manifestUrl, 'Model manifest URL').toString();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(normalizedManifestUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`无法下载 ONNX 模型 manifest (${response.status})`);
    }
    assertHttpsUrl(response.url || normalizedManifestUrl, 'Model manifest 最终 URL');

    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_MANIFEST_CHARACTERS) {
      throw new Error('Model manifest 超过允许大小。');
    }

    const text = await response.text();
    if (text.length > MAX_MANIFEST_CHARACTERS) {
      throw new Error('Model manifest 超过允许大小。');
    }

    const manifest = parseJsonResponseText(text, 'ONNX 模型 manifest');
    validateEmbeddingModelManifest(manifest);
    return manifest;
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('下载 ONNX 模型 manifest 超时。');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function getModelsRootDirectory() {
  return new Directory(Paths.document, 'models');
}

async function downloadAndVerifyModelFile(
  entry: EmbeddingModelPackFile,
  remoteUrl: string,
  destination: File,
  report: ModelFileProgressReporter,
): Promise<number> {
  const onProgress = report.onDownloaded;
  const expectedSha256 = normalizeSha256(entry.sha256, entry.path);
  const partFile = new File(destination.parentDirectory, `${destination.name}${PART_FILE_SUFFIX}`);
  // A leftover part file records no offset of its own, so it can never be appended blindly.
  removeFileIfPresent(partFile);

  let existingBytes = readExistingFileSize(destination);

  if (existingBytes > entry.sizeBytes) {
    destination.delete();
    existingBytes = 0;
  }

  if (existingBytes === entry.sizeBytes) {
    const existingSha256 = await calculateFileSha256(destination, existingBytes, report.onVerified);
    if (existingSha256 === expectedSha256) {
      onProgress(existingBytes);
      return existingBytes;
    }
    destination.delete();
    existingBytes = 0;
  }

  let offset = existingBytes;
  onProgress(offset);

  let attemptsWithoutProgress = 0;
  let lastError: unknown = null;

  while (offset < entry.sizeBytes) {
    if (attemptsWithoutProgress >= MAX_DOWNLOAD_ATTEMPTS) {
      throw lastError instanceof Error ? lastError : new Error(`模型文件下载失败：${entry.path}`);
    }

    const offsetBeforeAttempt = offset;
    try {
      offset = await downloadRemainingBytes(entry, remoteUrl, destination, partFile, offset, onProgress);
    } catch (error) {
      lastError = error;
      removeFileIfPresent(partFile);
      if (!isRetryableDownloadError(error)) {
        throw error;
      }

      // Bytes streamed into the destination before the failure stay on disk and are resumed.
      offset = readExistingFileSize(destination);
    }

    onProgress(offset);
    if (offset > offsetBeforeAttempt) {
      attemptsWithoutProgress = 0;
      continue;
    }

    attemptsWithoutProgress += 1;
    await delay(500 * 2 ** (attemptsWithoutProgress - 1));
  }

  const info = destination.info();
  if (info.size !== entry.sizeBytes) {
    throw new Error(`模型文件大小不匹配：${entry.path}`);
  }

  const actualSha256 = await calculateFileSha256(destination, entry.sizeBytes, report.onVerified);
  if (actualSha256 !== expectedSha256) {
    destination.delete();
    throw new Error(`模型文件 SHA-256 校验失败，已删除损坏文件：${entry.path}`);
  }

  return entry.sizeBytes;
}

/**
 * Streams the bytes after `offset` to disk and returns the new destination size.
 *
 * `File.downloadFileAsync` writes the response body straight into the file with a small native
 * buffer. Nothing proportional to the transfer is held in memory, which `expo/fetch` cannot offer
 * because it queues the whole body before handing it to JS.
 */
async function downloadRemainingBytes(
  entry: EmbeddingModelPackFile,
  remoteUrl: string,
  destination: File,
  partFile: File,
  offset: number,
  onProgress: (writtenBytes: number) => void,
): Promise<number> {
  const range = nextByteRange(offset, entry.sizeBytes, entry.sizeBytes - offset);
  const remainingBytes = range.end - range.start + 1;
  const resolvedUrl = await resolveFinalFileUrl(remoteUrl, entry);

  // A fresh file is streamed straight to its destination; a resumed one lands beside it so the
  // bytes already on disk are never overwritten.
  const streamsToDestination = offset === 0;
  const target = streamsToDestination ? destination : partFile;
  removeFileIfPresent(target);

  const controller = new AbortController();
  let exceededRange = false;

  try {
    await File.downloadFileAsync(resolvedUrl, target, {
      headers: { Range: `bytes=${range.start}-${range.end}` },
      idempotent: true,
      signal: controller.signal,
      onProgress: (event) => {
        if (event.bytesWritten > remainingBytes || (event.totalBytes > 0 && event.totalBytes > remainingBytes)) {
          // The server ignored the Range header and is replaying bytes we already hold.
          exceededRange = true;
          controller.abort();
          return;
        }

        onProgress(offset + Math.max(0, event.bytesWritten));
      },
    });
  } catch (error) {
    if (exceededRange) {
      throw new Error(`下载服务器不支持安全的断点续传：${entry.path}`);
    }
    throw error;
  }

  if (exceededRange) {
    throw new Error(`下载服务器不支持安全的断点续传：${entry.path}`);
  }

  if (streamsToDestination) {
    return readExistingFileSize(destination);
  }

  const partBytes = readExistingFileSize(partFile);
  if (partBytes > remainingBytes) {
    removeFileIfPresent(partFile);
    throw new Error(`下载服务器不支持安全的断点续传：${entry.path}`);
  }

  appendFileContents(destination, partFile);
  removeFileIfPresent(partFile);
  return readExistingFileSize(destination);
}

/**
 * Resolves redirects up front so the transfer starts from a URL this app has checked.
 *
 * A failed preflight falls back to the manifest URL, which `resolveSecurePackFileUrl` already
 * asserted is HTTPS; every byte is still covered by the SHA-256 check before the model is used.
 */
async function resolveFinalFileUrl(remoteUrl: string, entry: EmbeddingModelPackFile): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PREFLIGHT_TIMEOUT_MS);

  try {
    const response = await fetch(remoteUrl, { method: 'HEAD', signal: controller.signal });
    if (!response.ok) {
      return remoteUrl;
    }

    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > 0 && declaredLength !== entry.sizeBytes) {
      throw new Error(`模型文件大小与 manifest 声明不一致：${entry.path}`);
    }

    return assertHttpsUrl(response.url || remoteUrl, 'Model file 最终 URL').toString();
  } catch (error) {
    if (isAbortError(error) || error instanceof TypeError) {
      return remoteUrl;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function prepareStagingDirectory(
  root: Directory,
  directoryName: string,
  manifest: EmbeddingModelPackManifest,
  manifestUrl: string,
) {
  let staging = new Directory(root, resumableStagingDirectoryName(directoryName));
  const resumeKey = createResumeKey(manifest, manifestUrl);

  if (staging.exists) {
    const state = readDownloadState(staging);
    if (state?.resumeKey !== resumeKey) {
      removeDirectoryIfPresent(root, staging);
      staging = new Directory(root, resumableStagingDirectoryName(directoryName));
    }
  }

  ensureDirectory(staging);
  writeTextFile(
    new File(staging, DOWNLOAD_STATE_NAME),
    JSON.stringify({ schemaVersion: 'chishenme.model-download-state.v1', resumeKey } satisfies ModelDownloadState),
  );
  return staging;
}

function readDownloadState(staging: Directory): ModelDownloadState | null {
  const file = new File(staging, DOWNLOAD_STATE_NAME);
  if (!file.exists) {
    return null;
  }

  try {
    const parsed = JSON.parse(file.textSync()) as Partial<ModelDownloadState>;
    return parsed.schemaVersion === 'chishenme.model-download-state.v1' && typeof parsed.resumeKey === 'string'
      ? (parsed as ModelDownloadState)
      : null;
  } catch {
    return null;
  }
}

function createResumeKey(manifest: EmbeddingModelPackManifest, manifestUrl: string) {
  return JSON.stringify({
    manifestUrl,
    id: manifest.id,
    version: manifest.version,
    files: manifest.files.map((file) => ({
      role: file.role,
      path: file.path,
      url: file.url ?? null,
      sizeBytes: file.sizeBytes,
      sha256: normalizeSha256(file.sha256, file.path),
    })),
  });
}

function countResumableBytes(root: Directory, files: EmbeddingModelPackFile[]) {
  return files.reduce((total, entry) => {
    const size = readExistingFileSize(fileForRelativePath(root, entry.path));
    return total + (size <= entry.sizeBytes ? size : 0);
  }, 0);
}

function readExistingFileSize(file: File) {
  if (!file.exists) {
    return 0;
  }
  const size = file.info().size;
  return typeof size === 'number' && Number.isSafeInteger(size) && size >= 0 ? size : 0;
}

function ensureDirectory(directory: Directory) {
  directory.create({ idempotent: true, intermediates: true });
}

function writeTextFile(file: File, text: string) {
  file.create({ overwrite: true, intermediates: true });
  file.write(text);
}

function fileForRelativePath(root: Directory, relativePath: string) {
  const parts = normalizePackRelativePath(relativePath, 'Model pack').split('/');
  let current = root;

  for (const part of parts.slice(0, -1)) {
    current = new Directory(current, part);
    ensureDirectory(current);
  }

  const file = new File(current, parts[parts.length - 1]);
  if (!isChildUri(root.uri, file.uri)) {
    throw new Error(`拒绝写入 Model 目录之外的路径：${relativePath}`);
  }
  return file;
}

function appendFileContents(destination: File, source: File) {
  const reader = source.open(FileMode.ReadOnly);
  const writer = destination.open(FileMode.Append);

  try {
    for (;;) {
      const bytes = reader.readBytes(COPY_BUFFER_BYTES);
      if (bytes.byteLength === 0) {
        break;
      }

      writer.writeBytes(bytes);
    }
  } finally {
    reader.close();
    writer.close();
  }
}

function assertSufficientDiskSpace(remainingBytes: number) {
  const available = Paths.availableDiskSpace;
  const required = requiredAvailableBytes(remainingBytes);
  if (Number.isFinite(available) && available > 0 && available < required) {
    throw new Error(`存储空间不足：完成模型下载至少需要 ${formatBytes(required)} 可用空间。`);
  }
}

function removeFileIfPresent(file: File) {
  if (file.exists) {
    file.delete();
  }
}

function removeDirectoryIfPresent(root: Directory, directory: Directory | null) {
  if (!directory?.exists) {
    return;
  }
  if (!isChildUri(root.uri, directory.uri)) {
    throw new Error('拒绝删除 models 目录之外的文件。');
  }
  directory.delete();
}

function parseJsonResponseText(text: string, label: string) {
  const normalized = text.replace(/^\uFEFF/, '').trim();
  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    throw new Error(`无法解析 ${label} JSON，返回内容开头：${normalized.slice(0, 80)}`);
  }
}

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}


function isRetryableDownloadError(error: unknown) {
  if (isAbortError(error)) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  // A server that contradicts the manifest will keep contradicting it, so those errors are final.
  return !/不支持安全的断点续传|无效的 Content-Range|manifest 声明不一致|拒绝|SHA-256/.test(message);
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
