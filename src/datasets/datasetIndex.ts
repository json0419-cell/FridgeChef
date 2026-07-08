import type { DatasetIndexEntry, DatasetIndexManifest } from '../types';

export const OFFICIAL_DATASET_INDEX_URL =
  'https://huggingface.co/datasets/Yatorou/ChiShenMe/resolve/main/dataset-index.json';

export async function fetchDatasetIndex(indexUrl = OFFICIAL_DATASET_INDEX_URL): Promise<DatasetIndexManifest> {
  const response = await fetch(indexUrl);
  if (!response.ok) {
    throw new Error(`无法下载 dataset index (${response.status})`);
  }

  const manifest = parseJsonResponseText(await response.text(), 'dataset index') as DatasetIndexManifest;
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
    throw new Error('不支持的 dataset index schema。');
  }

  if (!Array.isArray(manifest.datasets)) {
    throw new Error('Dataset index 缺少 datasets。');
  }

  for (const dataset of manifest.datasets) {
    if (!dataset.id || !dataset.name || !dataset.manifestPath) {
      throw new Error('Dataset index 存在缺少 id/name/manifestPath 的条目。');
    }
  }
}

function parseJsonResponseText(text: string, label: string) {
  const normalized = text.replace(/^\uFEFF/, '').trim();
  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    throw new Error(`无法解析 ${label} JSON，返回内容开头：${normalized.slice(0, 80)}`);
  }
}
