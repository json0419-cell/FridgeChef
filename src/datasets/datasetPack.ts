import { Directory, File, Paths } from 'expo-file-system';
import type { DatasetPackFile, DatasetPackManifest, InstalledDataset } from '../types';
import {
  createInstalledDatasetFromManifest,
  removeInstalledDataset,
  saveInstalledDataset,
} from './datasetRegistry';

export interface DatasetDownloadProgress {
  fileRole: string;
  fileName: string;
  completedFiles: number;
  totalFiles: number;
  completedBytes: number;
  totalBytes: number;
}

export async function downloadDatasetPack(
  manifestUrl: string,
  onProgress?: (progress: DatasetDownloadProgress) => void,
): Promise<InstalledDataset> {
  const manifest = await fetchDatasetManifest(manifestUrl);
  validateDatasetManifest(manifest);

  const root = getDatasetsRootDirectory();
  ensureDirectory(root);

  const datasetDirectory = new Directory(root, sanitizePathSegment(`${manifest.id}_${manifest.version}`));
  ensureDirectory(datasetDirectory);

  const totalBytes = manifest.files.reduce((total, file) => total + file.sizeBytes, 0);
  let completedBytes = 0;

  const localManifestFile = new File(datasetDirectory, 'dataset-pack.json');
  writeTextFile(localManifestFile, JSON.stringify(manifest, null, 2));

  for (let index = 0; index < manifest.files.length; index += 1) {
    const file = manifest.files[index];
    const destination = fileForRelativePath(datasetDirectory, file.path);
    const remoteUrl = resolvePackFileUrl(manifestUrl, file);

    await File.downloadFileAsync(remoteUrl, destination, {
      idempotent: true,
      onProgress: (event) => {
        onProgress?.({
          fileRole: file.role,
          fileName: file.path,
          completedFiles: index,
          totalFiles: manifest.files.length,
          completedBytes: completedBytes + Math.max(0, event.bytesWritten),
          totalBytes,
        });
      },
    });

    const info = destination.info();
    if (file.sizeBytes > 0 && info.size !== undefined && info.size !== file.sizeBytes) {
      throw new Error(`文件大小不匹配：${file.path}`);
    }

    completedBytes += file.sizeBytes;
    onProgress?.({
      fileRole: file.role,
      fileName: file.path,
      completedFiles: index + 1,
      totalFiles: manifest.files.length,
      completedBytes,
      totalBytes,
    });
  }

  const installed = createInstalledDatasetFromManifest(
    manifest,
    datasetDirectory.uri,
    localManifestFile.uri,
    manifestUrl,
    false,
  );
  await saveInstalledDataset(installed);
  return installed;
}

export async function fetchDatasetManifest(manifestUrl: string): Promise<DatasetPackManifest> {
  const response = await fetch(manifestUrl);
  if (!response.ok) {
    throw new Error(`无法下载 dataset manifest (${response.status})`);
  }

  return parseJsonResponseText(await response.text(), 'dataset manifest') as DatasetPackManifest;
}

export function validateDatasetManifest(manifest: DatasetPackManifest): void {
  if (manifest.schemaVersion !== 'chishenme.dataset-pack.v1') {
    throw new Error('不支持的 dataset pack schema。');
  }

  if (!manifest.id || !manifest.name || !manifest.version) {
    throw new Error('Dataset manifest 缺少 id/name/version。');
  }

  if (!manifest.embedding?.model || !manifest.embedding.dimension) {
    throw new Error('Dataset manifest 缺少 embedding 信息。');
  }

  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error('Dataset manifest 缺少文件列表。');
  }

  const roles = new Set(manifest.files.map((file) => file.role));
  if (!roles.has('vectors') || !roles.has('metadata')) {
    throw new Error('Dataset pack 必须包含 vectors 和 metadata 文件。');
  }
}

export function getDatasetsRootDirectory() {
  return new Directory(Paths.document, 'datasets');
}

export async function uninstallDataset(dataset: InstalledDataset): Promise<void> {
  const root = getDatasetsRootDirectory();
  const directory = new Directory(dataset.localRootUri);

  if (!isDatasetDirectoryUri(root.uri, directory.uri)) {
    throw new Error('拒绝删除非 datasets 目录下的文件。');
  }

  if (directory.exists) {
    directory.delete();
  }

  await removeInstalledDataset(dataset.id);
}

function ensureDirectory(directory: Directory) {
  directory.create({ idempotent: true, intermediates: true });
}

function writeTextFile(file: File, text: string) {
  file.create({ overwrite: true, intermediates: true });
  file.write(text);
}

function fileForRelativePath(root: Directory, relativePath: string) {
  const parts = relativePath.split('/').filter(Boolean);
  if (parts.length === 0) {
    throw new Error('Dataset 文件路径为空。');
  }

  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = new Directory(current, part);
    ensureDirectory(current);
  }

  const file = new File(current, parts[parts.length - 1]);
  if (file.exists) {
    file.delete();
  }
  return file;
}

function resolvePackFileUrl(manifestUrl: string, file: DatasetPackFile) {
  if (file.url) {
    return file.url;
  }

  return new URL(file.path, manifestUrl).toString();
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

function isDatasetDirectoryUri(rootUri: string, candidateUri: string) {
  const normalizedRoot = rootUri.endsWith('/') ? rootUri : `${rootUri}/`;
  const normalizedCandidate = candidateUri.endsWith('/') ? candidateUri : `${candidateUri}/`;
  return normalizedCandidate.startsWith(normalizedRoot) && normalizedCandidate !== normalizedRoot;
}
