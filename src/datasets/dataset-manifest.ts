import type { DatasetPackManifest } from '../types';
import { validatePackFiles } from '../downloads/pack-security.ts';
import { UserFacingError } from '../errors/user-facing-error.ts';

export function validateDatasetManifest(manifest: unknown): asserts manifest is DatasetPackManifest {
  if (!manifest || typeof manifest !== 'object') {
    throw new UserFacingError('DATASET_MANIFEST_INVALID', 'The dataset manifest is malformed.');
  }

  const value = manifest as Record<string, unknown>;
  if (value.schemaVersion !== 'chishenme.dataset-pack.v1') {
    throw new UserFacingError('DATASET_MANIFEST_SCHEMA_UNSUPPORTED', 'Unsupported dataset pack schema.');
  }

  if (!isNonEmptyString(value.id) || !isNonEmptyString(value.name) || !isNonEmptyString(value.version)) {
    throw new UserFacingError('DATASET_MANIFEST_IDENTITY_MISSING', 'The dataset manifest is missing id, name, or version.');
  }

  if (!Number.isSafeInteger(value.recipeCount) || (value.recipeCount as number) <= 0) {
    throw new UserFacingError('DATASET_MANIFEST_RECIPE_COUNT_INVALID', 'The dataset manifest declares an invalid recipeCount.');
  }

  if (!Number.isSafeInteger(value.chunkCount) || (value.chunkCount as number) <= 0) {
    throw new UserFacingError('DATASET_MANIFEST_CHUNK_COUNT_INVALID', 'The dataset manifest declares an invalid chunkCount.');
  }

  if (!value.embedding || typeof value.embedding !== 'object') {
    throw new UserFacingError('DATASET_MANIFEST_EMBEDDING_MISSING', 'The dataset manifest is missing embedding information.');
  }

  const embedding = value.embedding as Record<string, unknown>;
  if (
    !isNonEmptyString(embedding.model) ||
    !Number.isSafeInteger(embedding.dimension) ||
    (embedding.dimension as number) <= 0 ||
    embedding.dtype !== 'float32'
  ) {
    throw new UserFacingError('DATASET_MANIFEST_FLOAT32_EMBEDDING_MISSING', 'The dataset manifest has no float32 embedding this app can use.');
  }

  validatePackFiles(value.files, ['vectors', 'metadata'], 'Dataset pack');
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
