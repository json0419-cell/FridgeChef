import AsyncStorage from '@react-native-async-storage/async-storage';
import { isInstalledArtifactPresent } from '../../downloads/installed-artifact-presence';
import { createReconciledInstalledSourceReader } from '../../storage/installed-source-presence';
import type { EmbeddingModelPackManifest, InstalledEmbeddingModel } from '../../types';
import {
  createEmbeddingModelRegistry,
  EMBEDDING_MODEL_REGISTRY_KEY,
  selectActiveEmbeddingModel,
} from './model-registry-store';

const registry = createEmbeddingModelRegistry(AsyncStorage);
// Records are reconciled against the files on disk, so a record restored from backup without its
// model files is reported as not installed rather than as a usable model.
const installed = createReconciledInstalledSourceReader(registry, isInstalledArtifactPresent);

export const readInstalledEmbeddingModelRegistry = installed.read;

export const listInstalledEmbeddingModels = installed.list;

/** Installing reads this so a reinstall can carry a restored record's enabled state over. */
export const listStoredInstalledEmbeddingModels = installed.listStored;

export async function getActiveEmbeddingModel(): Promise<InstalledEmbeddingModel | null> {
  return selectActiveEmbeddingModel(await installed.list());
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
