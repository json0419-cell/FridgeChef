import AsyncStorage from '@react-native-async-storage/async-storage';
import { isInstalledArtifactPresent } from '../downloads/installed-artifact-presence';
import { createReconciledInstalledSourceReader } from '../storage/installed-source-presence';
import type { DatasetPackManifest, InstalledDataset } from '../types';
import { createDatasetRegistry, DATASET_REGISTRY_KEY } from './dataset-registry-store';

const registry = createDatasetRegistry(AsyncStorage);
// Records are reconciled against the files on disk, so a record restored from backup without its
// pack is reported as not installed rather than as a usable recipe source.
const installed = createReconciledInstalledSourceReader(registry, isInstalledArtifactPresent);

export const readInstalledDatasetRegistry = installed.read;

export const listInstalledDatasets = installed.list;

/** Installing reads this so a reinstall can carry a restored record's enabled state over. */
export const listStoredInstalledDatasets = installed.listStored;

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
