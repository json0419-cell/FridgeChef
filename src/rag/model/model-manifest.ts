import type { EmbeddingModelPackManifest } from '../../types';
import { validatePackFiles } from '../../downloads/pack-security.ts';

export function validateEmbeddingModelManifest(manifest: unknown): asserts manifest is EmbeddingModelPackManifest {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Model manifest 格式无效。');
  }

  const value = manifest as Record<string, unknown>;
  if (value.schemaVersion !== 'chishenme.embedding-model-pack.v1') {
    throw new Error('不支持的 embedding model pack schema。');
  }

  if (!isNonEmptyString(value.id) || !isNonEmptyString(value.name) || !isNonEmptyString(value.version)) {
    throw new Error('Model manifest 缺少 id/name/version。');
  }

  if (!value.model || typeof value.model !== 'object') {
    throw new Error('Model manifest 缺少 model 信息。');
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
    throw new Error('Model manifest 缺少可用的 ONNX query embedding 信息。');
  }

  validatePackFiles(value.files, ['modelOnnx', 'tokenizerJson'], 'Model pack');
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
