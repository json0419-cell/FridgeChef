import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DatasetPackManifest, InstalledDataset } from '../types';

const DATASET_REGISTRY_KEY = 'chi_shen_me.dataset_registry.v1';

export async function listInstalledDatasets(): Promise<InstalledDataset[]> {
  const raw = await AsyncStorage.getItem(DATASET_REGISTRY_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isInstalledDataset) : [];
  } catch {
    return [];
  }
}

export async function saveInstalledDataset(dataset: InstalledDataset): Promise<void> {
  const datasets = await listInstalledDatasets();
  const next = datasets.filter((item) => item.id !== dataset.id);
  next.push(dataset);
  await saveRegistry(dataset.active ? selectOnlyDataset(next, dataset.id) : next);
}

export async function removeInstalledDataset(datasetId: string): Promise<void> {
  const datasets = await listInstalledDatasets();
  await saveRegistry(datasets.filter((item) => item.id !== datasetId));
}

export async function setActiveDataset(datasetId: string): Promise<void> {
  const datasets = await listInstalledDatasets();
  await saveRegistry(selectOnlyDataset(datasets, datasetId));
}

export async function clearActiveDataset(datasetId: string): Promise<void> {
  const datasets = await listInstalledDatasets();
  await saveRegistry(datasets.map((item) => (item.id === datasetId ? { ...item, active: false } : item)));
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

async function saveRegistry(datasets: InstalledDataset[]) {
  await AsyncStorage.setItem(DATASET_REGISTRY_KEY, JSON.stringify(datasets));
}

function selectOnlyDataset(datasets: InstalledDataset[], activeDatasetId: string) {
  return datasets.map((item) => ({ ...item, active: item.id === activeDatasetId }));
}

function isInstalledDataset(value: unknown): value is InstalledDataset {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    typeof record.version === 'string' &&
    typeof record.localRootUri === 'string' &&
    typeof record.manifestUri === 'string'
  );
}
