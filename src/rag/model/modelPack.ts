import { fetch as expoFetch } from 'expo/fetch';
import { Directory, File, FileMode, Paths } from 'expo-file-system';
import type { EmbeddingModelPackFile, EmbeddingModelPackManifest, InstalledEmbeddingModel } from '../../types';
import { calculateFileSha256 } from '../../downloads/file-integrity';
import { nextByteRange, validateRangeResponse } from '../../downloads/http-range';
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
const RANGE_CHUNK_BYTES = 16 * 1024 * 1024;
const RANGE_REQUEST_TIMEOUT_MS = 90_000;
const MAX_RANGE_ATTEMPTS = 3;
const DOWNLOAD_STATE_NAME = '.model-download-state.json';

export interface ModelDownloadProgress {
  fileRole: string;
  fileName: string;
  completedFiles: number;
  totalFiles: number;
  completedBytes: number;
  totalBytes: number;
}

interface ModelDownloadState {
  schemaVersion: 'chishenme.model-download-state.v1';
  resumeKey: string;
}

export async function downloadEmbeddingModelPack(
  manifestUrl = OFFICIAL_BGE_M3_MODEL_PACK_URL,
  onProgress?: (progress: ModelDownloadProgress) => void,
): Promise<InstalledEmbeddingModel> {
  const normalizedManifestUrl = assertHttpsUrl(manifestUrl, 'Model manifest URL').toString();
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

      const fileBytes = await downloadAndVerifyModelFile(entry, remoteUrl, destination, (writtenBytes) => {
        onProgress?.({
          fileRole: entry.role,
          fileName: entry.path,
          completedFiles: index,
          totalFiles: manifest.files.length,
          completedBytes: completedBytes + writtenBytes,
          totalBytes,
        });
      });

      completedBytes += fileBytes;
      onProgress?.({
        fileRole: entry.role,
        fileName: entry.path,
        completedFiles: index + 1,
        totalFiles: manifest.files.length,
        completedBytes,
        totalBytes,
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
  onProgress: (writtenBytes: number) => void,
): Promise<number> {
  const expectedSha256 = normalizeSha256(entry.sha256, entry.path);
  let existingBytes = readExistingFileSize(destination);

  if (existingBytes > entry.sizeBytes) {
    destination.delete();
    existingBytes = 0;
  }

  if (existingBytes === entry.sizeBytes) {
    const existingSha256 = await calculateFileSha256(destination, existingBytes);
    if (existingSha256 === expectedSha256) {
      onProgress(existingBytes);
      return existingBytes;
    }
    destination.delete();
    existingBytes = 0;
  }

  if (!destination.exists) {
    destination.create({ intermediates: true });
  }

  let offset = existingBytes;
  onProgress(offset);
  while (offset < entry.sizeBytes) {
    const range = nextByteRange(offset, entry.sizeBytes, RANGE_CHUNK_BYTES);
    const bytes = await fetchRangeChunk(remoteUrl, range.start, range.end, entry.sizeBytes);
    appendBytes(destination, bytes);
    offset += bytes.byteLength;
    onProgress(offset);
  }

  const info = destination.info();
  if (info.size !== entry.sizeBytes) {
    throw new Error(`模型文件大小不匹配：${entry.path}`);
  }

  const actualSha256 = await calculateFileSha256(destination, entry.sizeBytes);
  if (actualSha256 !== expectedSha256) {
    destination.delete();
    throw new Error(`模型文件 SHA-256 校验失败，已删除损坏文件：${entry.path}`);
  }

  return entry.sizeBytes;
}

async function fetchRangeChunk(url: string, start: number, end: number, totalBytes: number): Promise<Uint8Array> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_RANGE_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RANGE_REQUEST_TIMEOUT_MS);

    try {
      const response = await expoFetch(url, {
        headers: { Range: `bytes=${start}-${end}` },
        signal: controller.signal,
      });
      assertHttpsUrl(response.url || url, 'Model file 最终 URL');

      if (isRetryableStatus(response.status) && attempt < MAX_RANGE_ATTEMPTS) {
        await response.body?.cancel();
        await delay(500 * 2 ** (attempt - 1));
        continue;
      }

      if (response.status === 200 && (start !== 0 || end !== totalBytes - 1)) {
        await response.body?.cancel();
        throw new Error('下载服务器不支持安全的断点续传。');
      }

      if (response.status !== 200 && response.status !== 206) {
        await response.body?.cancel();
        throw new Error(`模型分块下载失败 (${response.status})。`);
      }

      const bytes = await response.bytes();
      validateRangeResponse(response.status, response.headers.get('content-range'), { start, end }, totalBytes, bytes.byteLength);
      return bytes;
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_RANGE_ATTEMPTS || !isRetryableDownloadError(error)) {
        break;
      }
      await delay(500 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if (isAbortError(lastError)) {
    throw new Error(`模型分块下载超时（${start}-${end}）。`);
  }
  throw lastError instanceof Error ? lastError : new Error('模型分块下载失败。');
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

function appendBytes(file: File, bytes: Uint8Array) {
  const handle = file.open(FileMode.Append);
  try {
    handle.writeBytes(bytes);
  } finally {
    handle.close();
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


function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function isRetryableDownloadError(error: unknown) {
  if (isAbortError(error)) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return !/不支持安全的断点续传|无效的 Content-Range|拒绝|SHA-256/.test(message);
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
