import { Directory, File, Paths } from 'expo-file-system';
import type { DatasetPackManifest, InstalledDataset } from '../types';
import { calculateFileSha256 } from '../downloads/file-integrity';
import {
  assertHttpsUrl,
  assertSha256Matches,
  isChildUri,
  normalizePackRelativePath,
  requiredAvailableBytes,
  resolveSecurePackFileUrl,
} from '../downloads/pack-security';
import {
  createInstalledDatasetFromManifest,
  listInstalledDatasets,
  removeInstalledDataset,
  saveInstalledDataset,
} from './datasetRegistry';
import { validateDatasetManifest } from './dataset-manifest';

export { validateDatasetManifest } from './dataset-manifest';

const MAX_MANIFEST_CHARACTERS = 1024 * 1024;

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
  const normalizedManifestUrl = assertHttpsUrl(manifestUrl, 'Dataset manifest URL').toString();
  const manifest = await fetchDatasetManifest(normalizedManifestUrl);
  // Read the registry before touching files so an unreadable registry refuses the install up front.
  const existingDatasets = await listInstalledDatasets();
  const existingDataset = existingDatasets.find((item) => item.id === manifest.id);

  const root = getDatasetsRootDirectory();
  ensureDirectory(root);

  const directoryName = sanitizePathSegment(`${manifest.id}_${manifest.version}`);
  const stagingDirectory = new Directory(root, `${directoryName}.download-${Date.now()}-${randomSuffix()}`);
  const totalBytes = manifest.files.reduce((total, file) => total + file.sizeBytes, 0);
  assertSufficientDiskSpace(totalBytes);
  ensureDirectory(stagingDirectory);

  let completedBytes = 0;
  let backupDirectory: Directory | null = null;
  let committed = false;

  try {
    for (let index = 0; index < manifest.files.length; index += 1) {
      const file = manifest.files[index];
      const destination = fileForRelativePath(stagingDirectory, file.path);
      const remoteUrl = resolveSecurePackFileUrl(normalizedManifestUrl, file, 'Dataset pack');
      const controller = new AbortController();
      let exceededDeclaredSize = false;

      try {
        await File.downloadFileAsync(remoteUrl, destination, {
          idempotent: false,
          signal: controller.signal,
          onProgress: (event) => {
            if (event.bytesWritten > file.sizeBytes || (event.totalBytes > 0 && event.totalBytes > file.sizeBytes)) {
              exceededDeclaredSize = true;
              controller.abort();
              return;
            }

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
      } catch (error) {
        if (exceededDeclaredSize) {
          throw new Error(`下载内容超过 manifest 声明大小：${file.path}`);
        }
        throw error;
      }

      if (exceededDeclaredSize) {
        throw new Error(`下载内容超过 manifest 声明大小：${file.path}`);
      }

      const info = destination.info();
      if (info.size === undefined || info.size !== file.sizeBytes) {
        throw new Error(`文件大小不匹配：${file.path}`);
      }

      const actualSha256 = await calculateFileSha256(destination, info.size);
      assertSha256Matches(file.sha256 ?? '', actualSha256, file.path);

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

    const stagingManifestFile = new File(stagingDirectory, 'dataset-pack.json');
    writeTextFile(stagingManifestFile, JSON.stringify(manifest, null, 2));

    const previousDirectory = new Directory(root, directoryName);
    if (previousDirectory.exists) {
      backupDirectory = new Directory(root, `${directoryName}.backup-${Date.now()}-${randomSuffix()}`);
      previousDirectory.move(backupDirectory);
    }

    stagingDirectory.move(new Directory(root, directoryName));
    committed = true;

    const localManifestFile = new File(stagingDirectory, 'dataset-pack.json');
    const installed = createInstalledDatasetFromManifest(
      manifest,
      stagingDirectory.uri,
      localManifestFile.uri,
      normalizedManifestUrl,
      existingDataset?.active ?? false,
    );
    await saveInstalledDataset(installed);

    try {
      removeDirectoryIfPresent(root, backupDirectory);
    } catch {
      // The new pack is already registered and usable; a stale backup is safer than rolling it back here.
    }
    return installed;
  } catch (error) {
    if (committed) {
      removeDirectoryIfPresent(root, new Directory(root, directoryName));
    } else {
      removeDirectoryIfPresent(root, stagingDirectory);
    }

    if (backupDirectory?.exists) {
      backupDirectory.move(new Directory(root, directoryName));
    }

    throw error;
  }
}

export async function fetchDatasetManifest(manifestUrl: string): Promise<DatasetPackManifest> {
  const normalizedManifestUrl = assertHttpsUrl(manifestUrl, 'Dataset manifest URL').toString();
  const response = await fetch(normalizedManifestUrl);
  if (!response.ok) {
    throw new Error(`无法下载 dataset manifest (${response.status})`);
  }

  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MANIFEST_CHARACTERS) {
    throw new Error('Dataset manifest 超过允许大小。');
  }

  const text = await response.text();
  if (text.length > MAX_MANIFEST_CHARACTERS) {
    throw new Error('Dataset manifest 超过允许大小。');
  }

  const manifest = parseJsonResponseText(text, 'dataset manifest');
  validateDatasetManifest(manifest);
  return manifest;
}

export function getDatasetsRootDirectory() {
  return new Directory(Paths.document, 'datasets');
}

export async function uninstallDataset(dataset: InstalledDataset): Promise<void> {
  const root = getDatasetsRootDirectory();
  const directory = new Directory(dataset.localRootUri);

  if (!isChildUri(root.uri, directory.uri)) {
    throw new Error('拒绝删除非 datasets 目录下的文件。');
  }

  // Refuse before deleting files when the registry cannot record the removal.
  await listInstalledDatasets();

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
  const parts = normalizePackRelativePath(relativePath, 'Dataset pack').split('/');

  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = new Directory(current, part);
    ensureDirectory(current);
  }

  const file = new File(current, parts[parts.length - 1]);
  if (!isChildUri(root.uri, file.uri)) {
    throw new Error(`拒绝写入 Dataset 目录之外的路径：${relativePath}`);
  }
  return file;
}

function assertSufficientDiskSpace(totalBytes: number) {
  const available = Paths.availableDiskSpace;
  const required = requiredAvailableBytes(totalBytes);
  if (Number.isFinite(available) && available > 0 && available < required) {
    throw new Error(`存储空间不足：下载和校验至少需要 ${formatBytes(required)} 可用空间。`);
  }
}

function removeDirectoryIfPresent(root: Directory, directory: Directory | null) {
  if (!directory?.exists) {
    return;
  }

  if (!isChildUri(root.uri, directory.uri)) {
    throw new Error('拒绝删除 datasets 目录之外的临时文件。');
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

function randomSuffix() {
  return Math.random().toString(36).slice(2, 10);
}

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
