import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DatasetPackManifest, InstalledDataset } from '../types';
import { createDatasetRegistry, DATASET_REGISTRY_KEY } from './dataset-registry-store';

const registry = createDatasetRegistry(AsyncStorage);

export function readInstalledDatasetRegistry() {
  return registry.read();
}

/** Throws InstalledSourceRegistryError when the registry is unreadable; it never reports an unreadable registry as empty. */
export function listInstalledDatasets(): Promise<InstalledDataset[]> {
  return registry.list();
}

export function saveInstalledDataset(dataset: InstalledDataset): Promise<void> {
  return registry.save(dataset);
}

export function removeInstalledDataset(datasetId: string): Promise<void> {
  return registry.remove(datasetId);
}

/** Explicit, user-confirmed destructive reset used by local data cleanup. */
export async function clearInstalledDatasetRegistry(): Promise<void> {
  await AsyncStorage.removeItem(DATASET_REGISTRY_KEY);
}

export function setActiveDataset(datasetId: string): Promise<void> {
  return registry.setActive(datasetId);
}

export function clearActiveDataset(datasetId: string): Promise<void> {
  return registry.clearActive(datasetId);
}

export function createInstalledDatasetFromManifest(
  manifest: DatasetPackManifest,
  localRootUri: string,
  manifestUri: string,
  manifestUrl?: string,
  active = false,
): InstalledDataset {
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    level: manifest.level,
    recipeCount: manifest.recipeCount,
    chunkCount: manifest.chunkCount,
    localRootUri,
    manifestUri,
    manifestUrl,
    installedAt: new Date().toISOString(),
    active,
    status: 'installed',
    sizeBytes: manifest.files.reduce((total, file) => total + file.sizeBytes, 0),
    embeddingModel: manifest.embedding.model,
    embeddingDimension: manifest.embedding.dimension,
  };
}
