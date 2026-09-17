import AsyncStorage from '@react-native-async-storage/async-storage';
import { isInstalledArtifactPresent } from '../../downloads/installed-artifact-presence';
import { reconcileInstalledSourceRead } from '../../storage/installed-source-presence';
import type { EmbeddingModelPackManifest, InstalledEmbeddingModel } from '../../types';
import {
  createEmbeddingModelRegistry,
  EMBEDDING_MODEL_REGISTRY_KEY,
  selectActiveEmbeddingModel,
} from './model-registry-store';

const registry = createEmbeddingModelRegistry(AsyncStorage);

/**
 * Reads the registry and reconciles it against the files on disk, so a record restored from backup
 * without its model files is reported as not installed rather than as a usable model.
 */
export async function readInstalledEmbeddingModelRegistry() {
  return reconcileInstalledSourceRead(await registry.read(), isInstalledArtifactPresent);
}

/** Throws InstalledSourceRegistryError when the registry is unreadable; it never reports an unreadable registry as empty. */
export async function listInstalledEmbeddingModels(): Promise<InstalledEmbeddingModel[]> {
  const result = await readInstalledEmbeddingModelRegistry();
  if (result.status === 'unreadable') {
    throw result.error;
  }
  return result.records;
}

/**
 * Every stored record, including ones whose files are absent. Installing reads this so it can carry
 * a restored record's enabled state over to the model the user reinstalls.
 */
export function listStoredInstalledEmbeddingModels(): Promise<InstalledEmbeddingModel[]> {
  return registry.list();
}

export async function getActiveEmbeddingModel(): Promise<InstalledEmbeddingModel | null> {
  return selectActiveEmbeddingModel(await listInstalledEmbeddingModels());
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
