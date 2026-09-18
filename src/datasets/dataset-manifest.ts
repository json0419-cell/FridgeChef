import type { DatasetPackManifest } from '../types';
import { validatePackFiles } from '../downloads/pack-security.ts';

export function validateDatasetManifest(manifest: unknown): asserts manifest is DatasetPackManifest {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Dataset manifest 格式无效。');
  }

  const value = manifest as Record<string, unknown>;
  if (value.schemaVersion !== 'chishenme.dataset-pack.v1') {
    throw new Error('不支持的 dataset pack schema。');
  }

  if (!isNonEmptyString(value.id) || !isNonEmptyString(value.name) || !isNonEmptyString(value.version)) {
    throw new Error('Dataset manifest 缺少 id/name/version。');
  }

  if (!Number.isSafeInteger(value.recipeCount) || (value.recipeCount as number) <= 0) {
    throw new Error('Dataset manifest 的 recipeCount 无效。');
  }

  if (!Number.isSafeInteger(value.chunkCount) || (value.chunkCount as number) <= 0) {
    throw new Error('Dataset manifest 的 chunkCount 无效。');
  }

  if (!value.embedding || typeof value.embedding !== 'object') {
    throw new Error('Dataset manifest 缺少 embedding 信息。');
  }

  const embedding = value.embedding as Record<string, unknown>;
  if (
    !isNonEmptyString(embedding.model) ||
    !Number.isSafeInteger(embedding.dimension) ||
    (embedding.dimension as number) <= 0 ||
    embedding.dtype !== 'float32'
  ) {
    throw new Error('Dataset manifest 缺少 App 可用的 float32 embedding 信息。');
  }

  validatePackFiles(value.files, ['vectors', 'metadata'], 'Dataset pack');
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
