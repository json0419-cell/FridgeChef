import type { DatasetIndexEntry, DatasetIndexManifest } from '../types';
import { parsePackJsonResponseText } from '../downloads/pack-security.ts';
import { UserFacingError } from '../errors/user-facing-error';

export const OFFICIAL_DATASET_INDEX_URL =
  'https://huggingface.co/datasets/Yatorou/ChiShenMe/resolve/main/dataset-index.json';

export async function fetchDatasetIndex(indexUrl = OFFICIAL_DATASET_INDEX_URL): Promise<DatasetIndexManifest> {
  const response = await fetch(indexUrl);
  if (!response.ok) {
    throw new UserFacingError('DATASET_INDEX_DOWNLOAD_FAILED', `Could not download the dataset index (${response.status}).`, { status: response.status });
  }

  const manifest = parsePackJsonResponseText(await response.text(), 'dataset index') as DatasetIndexManifest;
  validateDatasetIndex(manifest);
  return manifest;
}

export function resolveDatasetManifestUrl(indexUrl: string, dataset: DatasetIndexEntry): string {
  if (dataset.manifestUrl) {
    return dataset.manifestUrl;
  }

  return new URL(dataset.manifestPath, indexUrl).toString();
}

function validateDatasetIndex(manifest: DatasetIndexManifest): void {
  if (manifest.schemaVersion !== 'chishenme.dataset-index.v1') {
    throw new UserFacingError('DATASET_INDEX_SCHEMA_UNSUPPORTED', 'Unsupported dataset index schema.');
  }

  if (!Array.isArray(manifest.datasets)) {
    throw new UserFacingError('DATASET_INDEX_ENTRIES_MISSING', 'The dataset index has no datasets.');
  }

  for (const dataset of manifest.datasets) {
    if (!dataset.id || !dataset.name || !dataset.manifestPath) {
      throw new UserFacingError('DATASET_INDEX_ENTRY_INVALID', 'The dataset index has an entry missing id, name, or manifestPath.');
    }
  }
}
