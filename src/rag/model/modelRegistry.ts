import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EmbeddingModelPackManifest, InstalledEmbeddingModel } from '../../types';
import { createEmbeddingModelRegistry, EMBEDDING_MODEL_REGISTRY_KEY } from './model-registry-store';

const registry = createEmbeddingModelRegistry(AsyncStorage);

export function readInstalledEmbeddingModelRegistry() {
  return registry.read();
}

/** Throws InstalledSourceRegistryError when the registry is unreadable; it never reports an unreadable registry as empty. */
export function listInstalledEmbeddingModels(): Promise<InstalledEmbeddingModel[]> {
  return registry.list();
}

export function getActiveEmbeddingModel(): Promise<InstalledEmbeddingModel | null> {
  return registry.getActive();
}

export function saveInstalledEmbeddingModel(model: InstalledEmbeddingModel): Promise<void> {
  return registry.save(model);
}

/** Explicit, user-confirmed destructive reset used by local data cleanup. */
export async function clearInstalledEmbeddingModelRegistry(): Promise<void> {
  await AsyncStorage.removeItem(EMBEDDING_MODEL_REGISTRY_KEY);
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
