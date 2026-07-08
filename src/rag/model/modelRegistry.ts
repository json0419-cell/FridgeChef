import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EmbeddingModelPackManifest, InstalledEmbeddingModel } from '../../types';

const MODEL_REGISTRY_KEY = 'chi_shen_me.embedding_model_registry.v1';

export async function listInstalledEmbeddingModels(): Promise<InstalledEmbeddingModel[]> {
  const raw = await AsyncStorage.getItem(MODEL_REGISTRY_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isInstalledEmbeddingModel) : [];
  } catch {
    return [];
  }
}

export async function getActiveEmbeddingModel(): Promise<InstalledEmbeddingModel | null> {
  const models = await listInstalledEmbeddingModels();
  return models.find((model) => model.active) ?? models[0] ?? null;
}

export async function saveInstalledEmbeddingModel(model: InstalledEmbeddingModel): Promise<void> {
  const models = await listInstalledEmbeddingModels();
  const next = models.filter((item) => item.id !== model.id);
  next.push(model);
  await saveRegistry(normalizeActiveModel(next, model.active ? model.id : undefined));
}

export function createInstalledEmbeddingModelFromManifest(
  manifest: EmbeddingModelPackManifest,
  localRootUri: string,
  manifestUri: string,
  manifestUrl?: string,
  active = true,
): InstalledEmbeddingModel {
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    localRootUri,
    manifestUri,
    manifestUrl,
    installedAt: new Date().toISOString(),
    active,
    sizeBytes: manifest.files.reduce((total, file) => total + file.sizeBytes, 0),
    modelName: manifest.model.name,
    dimension: manifest.model.dimension,
    maxLength: manifest.model.maxLength,
  };
}

async function saveRegistry(models: InstalledEmbeddingModel[]) {
  await AsyncStorage.setItem(MODEL_REGISTRY_KEY, JSON.stringify(models));
}

function normalizeActiveModel(models: InstalledEmbeddingModel[], activeModelId?: string) {
  if (models.length === 0) {
    return [];
  }

  const activeId = activeModelId ?? models.find((item) => item.active)?.id ?? models[0].id;
  return models.map((item) => ({ ...item, active: item.id === activeId }));
}

function isInstalledEmbeddingModel(value: unknown): value is InstalledEmbeddingModel {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    typeof record.version === 'string' &&
    typeof record.localRootUri === 'string' &&
    typeof record.manifestUri === 'string' &&
    typeof record.dimension === 'number'
  );
}
