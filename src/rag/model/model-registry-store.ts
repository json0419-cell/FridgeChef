import type { InstalledEmbeddingModel } from '../../types';
import {
  createInstalledSourceRegistry,
  isCount,
  isString,
  type RegistryReadResult,
  type RegistryStore,
} from '../../storage/installed-source-registry.ts';

// The key name predates the in-value version; the stored envelope's `version` is authoritative.
export const EMBEDDING_MODEL_REGISTRY_KEY = 'chi_shen_me.embedding_model_registry.v1';

export interface EmbeddingModelRegistry {
  read(): Promise<RegistryReadResult<InstalledEmbeddingModel>>;
  list(): Promise<InstalledEmbeddingModel[]>;
  getActive(): Promise<InstalledEmbeddingModel | null>;
  save(model: InstalledEmbeddingModel): Promise<void>;
}

export function createEmbeddingModelRegistry(store: RegistryStore): EmbeddingModelRegistry {
  const registry = createInstalledSourceRegistry({
    name: 'modelRegistry',
    key: EMBEDDING_MODEL_REGISTRY_KEY,
    store,
    isRecord: isInstalledEmbeddingModel,
  });

  return {
    read: registry.read,
    list: registry.list,
    async getActive() {
      const models = await registry.list();
      return models.find((model) => model.active) ?? models[0] ?? null;
    },
    save: (model) =>
      registry.update((models) => {
        const next = models.filter((item) => item.id !== model.id);
        next.push(model);
        return normalizeActiveModel(next, model.active ? model.id : undefined);
      }),
  };
}

function normalizeActiveModel(models: InstalledEmbeddingModel[], activeModelId?: string) {
  if (models.length === 0) {
    return [];
  }

  const activeId = activeModelId ?? models.find((item) => item.active)?.id ?? models[0].id;
  return models.map((item) => ({ ...item, active: item.id === activeId }));
}

export function isInstalledEmbeddingModel(value: unknown): value is InstalledEmbeddingModel {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    isString(record.id) &&
    isString(record.name) &&
    isString(record.version) &&
    isString(record.description) &&
    isString(record.localRootUri) &&
    isString(record.manifestUri) &&
    (record.manifestUrl === undefined || isString(record.manifestUrl)) &&
    isString(record.installedAt) &&
    typeof record.active === 'boolean' &&
    isCount(record.sizeBytes) &&
    isString(record.modelName) &&
    isCount(record.dimension) &&
    isCount(record.maxLength) &&
    (record.testEmbeddingVerifiedAt === undefined || isString(record.testEmbeddingVerifiedAt))
  );
}
