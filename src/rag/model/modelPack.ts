import { Directory, File, Paths } from 'expo-file-system';
import type { EmbeddingModelPackFile, EmbeddingModelPackManifest, InstalledEmbeddingModel } from '../../types';
import {
  createInstalledEmbeddingModelFromManifest,
  listInstalledEmbeddingModels,
  saveInstalledEmbeddingModel,
} from './modelRegistry';

export const OFFICIAL_BGE_M3_MODEL_PACK_URL =
  'https://huggingface.co/datasets/Yatorou/ChiShenMe/resolve/main/models/bge-m3-query-onnx/model-pack.json';

export interface ModelDownloadProgress {
  fileRole: string;
  fileName: string;
  completedFiles: number;
  totalFiles: number;
  completedBytes: number;
  totalBytes: number;
}

export async function downloadEmbeddingModelPack(
  manifestUrl = OFFICIAL_BGE_M3_MODEL_PACK_URL,
  onProgress?: (progress: ModelDownloadProgress) => void,
): Promise<InstalledEmbeddingModel> {
  const manifest = await fetchEmbeddingModelManifest(manifestUrl);
  validateEmbeddingModelManifest(manifest);

  const root = getModelsRootDirectory();
  ensureDirectory(root);

  const modelDirectory = new Directory(root, sanitizePathSegment(`${manifest.id}_${manifest.version}`));
  ensureDirectory(modelDirectory);

  const localManifestFile = new File(modelDirectory, 'model-pack.json');
  writeTextFile(localManifestFile, JSON.stringify(manifest, null, 2));

  const totalBytes = manifest.files.reduce((total, file) => total + file.sizeBytes, 0);
  let completedBytes = 0;

  for (let index = 0; index < manifest.files.length; index += 1) {
    const file = manifest.files[index];
    const destination = fileForRelativePath(modelDirectory, file.path);
    const remoteUrl = resolveModelFileUrl(manifestUrl, file);

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
      throw new Error(`模型文件大小不匹配：${file.path}`);
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

  const existing = await listInstalledEmbeddingModels();
  const installed = createInstalledEmbeddingModelFromManifest(
    manifest,
    modelDirectory.uri,
    localManifestFile.uri,
    manifestUrl,
    existing.length === 0,
  );
  await saveInstalledEmbeddingModel(installed);
  return installed;
}

export async function fetchEmbeddingModelManifest(manifestUrl: string): Promise<EmbeddingModelPackManifest> {
  const response = await fetch(manifestUrl);
  if (!response.ok) {
    throw new Error(`无法下载 ONNX 模型 manifest (${response.status})`);
  }

  return parseJsonResponseText(await response.text(), 'ONNX 模型 manifest') as EmbeddingModelPackManifest;
}

export function validateEmbeddingModelManifest(manifest: EmbeddingModelPackManifest): void {
  if (manifest.schemaVersion !== 'chishenme.embedding-model-pack.v1') {
    throw new Error('不支持的 embedding model pack schema。');
  }

  if (!manifest.id || !manifest.name || !manifest.version) {
    throw new Error('Model manifest 缺少 id/name/version。');
  }

  if (!manifest.model?.name || !manifest.model.dimension || manifest.model.inputMode !== 'string-tokenizer-onnx') {
    throw new Error('Model manifest 缺少可用的 ONNX query embedding 信息。');
  }

  const roles = new Set(manifest.files.map((file) => file.role));
  if (!roles.has('modelOnnx') || !roles.has('tokenizerOnnx')) {
    throw new Error('Model pack 必须包含 modelOnnx 和 tokenizerOnnx。');
  }
}

export function getModelsRootDirectory() {
  return new Directory(Paths.document, 'models');
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
    throw new Error('模型文件路径为空。');
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

function resolveModelFileUrl(manifestUrl: string, file: EmbeddingModelPackFile) {
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
