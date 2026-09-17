import AsyncStorage from '@react-native-async-storage/async-storage';
import { isInstalledArtifactPresent } from '../downloads/installed-artifact-presence';
import { reconcileInstalledSourceRead } from '../storage/installed-source-presence';
import type { DatasetPackManifest, InstalledDataset } from '../types';
import { createDatasetRegistry, DATASET_REGISTRY_KEY } from './dataset-registry-store';

const registry = createDatasetRegistry(AsyncStorage);

/**
 * Reads the registry and reconciles it against the files on disk, so a record restored from backup
 * without its pack is reported as not installed rather than as a usable recipe source.
 */
export async function readInstalledDatasetRegistry() {
  return reconcileInstalledSourceRead(await registry.read(), isInstalledArtifactPresent);
}

/** Throws InstalledSourceRegistryError when the registry is unreadable; it never reports an unreadable registry as empty. */
export async function listInstalledDatasets(): Promise<InstalledDataset[]> {
  const result = await readInstalledDatasetRegistry();
  if (result.status === 'unreadable') {
    throw result.error;
  }
  return result.records;
}

/**
 * Every stored record, including ones whose files are absent. Installing reads this so it can carry
 * a restored record's enabled state over to the pack the user reinstalls.
 */
export function listStoredInstalledDatasets(): Promise<InstalledDataset[]> {
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
