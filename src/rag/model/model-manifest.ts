import type { EmbeddingModelPackManifest } from '../../types';
import { validatePackFiles } from '../../downloads/pack-security.ts';
import { UserFacingError } from '../../errors/user-facing-error.ts';

export function validateEmbeddingModelManifest(manifest: unknown): asserts manifest is EmbeddingModelPackManifest {
  if (!manifest || typeof manifest !== 'object') {
    throw new UserFacingError('MODEL_MANIFEST_INVALID', 'The model manifest is malformed.');
  }

  const value = manifest as Record<string, unknown>;
  if (value.schemaVersion !== 'chishenme.embedding-model-pack.v1') {
    throw new UserFacingError('MODEL_MANIFEST_SCHEMA_UNSUPPORTED', 'Unsupported embedding model pack schema.');
  }

  if (!isNonEmptyString(value.id) || !isNonEmptyString(value.name) || !isNonEmptyString(value.version)) {
    throw new UserFacingError('MODEL_MANIFEST_IDENTITY_MISSING', 'The model manifest is missing id, name, or version.');
  }

  if (!value.model || typeof value.model !== 'object') {
    throw new UserFacingError('MODEL_MANIFEST_MODEL_MISSING', 'The model manifest is missing model information.');
  }

  const model = value.model as Record<string, unknown>;
  if (
    !isNonEmptyString(model.name) ||
    !Number.isSafeInteger(model.dimension) ||
    (model.dimension as number) <= 0 ||
    !Number.isSafeInteger(model.maxLength) ||
    (model.maxLength as number) <= 0 ||
    (model.inputMode !== 'string-tokenizer-onnx' && model.inputMode !== 'token-ids')
  ) {
    throw new UserFacingError('MODEL_MANIFEST_QUERY_EMBEDDING_MISSING', 'The model manifest has no usable ONNX query embedding information.');
  }

  validatePackFiles(value.files, ['modelOnnx', 'tokenizerJson'], 'Model pack');
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
