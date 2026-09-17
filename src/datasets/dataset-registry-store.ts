import type { InstalledDataset } from '../types';
import {
  createInstalledSourceRegistry,
  isCount,
  isString,
  type RegistryReadResult,
  type RegistryStore,
} from '../storage/installed-source-registry.ts';

// The key name predates the in-value version; the stored envelope's `version` is authoritative.
export const DATASET_REGISTRY_KEY = 'chi_shen_me.dataset_registry.v1';

const DATASET_LEVELS = new Set(['lite', 'medium', 'standard', 'full', 'custom']);
const DATASET_STATUSES = new Set(['installed', 'downloading', 'error']);

export interface DatasetRegistry {
  read(): Promise<RegistryReadResult<InstalledDataset>>;
  list(): Promise<InstalledDataset[]>;
  save(dataset: InstalledDataset): Promise<void>;
  remove(datasetId: string): Promise<void>;
  setActive(datasetId: string): Promise<void>;
  clearActive(datasetId: string): Promise<void>;
}

export function createDatasetRegistry(store: RegistryStore): DatasetRegistry {
  const registry = createInstalledSourceRegistry({
    name: 'datasetRegistry',
    key: DATASET_REGISTRY_KEY,
    store,
    isRecord: isInstalledDataset,
  });

  return {
    read: registry.read,
    list: registry.list,
    save: (dataset) =>
      registry.update((datasets) => {
        const next = datasets.filter((item) => item.id !== dataset.id);
        next.push(dataset);
        return dataset.active ? selectOnlyDataset(next, dataset.id) : next;
      }),
    remove: (datasetId) => registry.update((datasets) => datasets.filter((item) => item.id !== datasetId)),
    setActive: (datasetId) => registry.update((datasets) => selectOnlyDataset(datasets, datasetId)),
    clearActive: (datasetId) =>
      registry.update((datasets) =>
        datasets.map((item) => (item.id === datasetId ? { ...item, active: false } : item)),
      ),
  };
}

function selectOnlyDataset(datasets: InstalledDataset[], activeDatasetId: string) {
  return datasets.map((item) => ({ ...item, active: item.id === activeDatasetId }));
}

export function isInstalledDataset(value: unknown): value is InstalledDataset {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    isString(record.id) &&
    isString(record.name) &&
    isString(record.version) &&
    isString(record.description) &&
    DATASET_LEVELS.has(record.level as string) &&
    isCount(record.recipeCount) &&
    isCount(record.chunkCount) &&
    isString(record.localRootUri) &&
    isString(record.manifestUri) &&
    (record.manifestUrl === undefined || isString(record.manifestUrl)) &&
    isString(record.installedAt) &&
    typeof record.active === 'boolean' &&
    DATASET_STATUSES.has(record.status as string) &&
    isCount(record.sizeBytes) &&
    isString(record.embeddingModel) &&
    isCount(record.embeddingDimension)
  );
}
