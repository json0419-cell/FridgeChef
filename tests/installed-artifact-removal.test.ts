import assert from 'node:assert/strict';
import test from 'node:test';
import { removeInstalledArtifact } from '../src/downloads/installed-artifact-removal.ts';
import { createDatasetRegistry, DATASET_REGISTRY_KEY } from '../src/datasets/dataset-registry-store.ts';
import { isPartialDownloadName } from '../src/downloads/temporary-download-artifacts.ts';
import type { InstalledDataset } from '../src/types.ts';

test('removing an installed artifact drops its record before it deletes any file', async () => {
  const steps: string[] = [];

  await removeInstalledArtifact({
    removeRecord: async () => {
      steps.push('record');
    },
    deleteArtifactFiles: () => {
      steps.push('files');
    },
  });

  assert.deepEqual(steps, ['record', 'files']);
});

test('a failed record removal deletes nothing', async () => {
  const steps: string[] = [];

  await assert.rejects(
    () =>
      removeInstalledArtifact({
        removeRecord: async () => {
          steps.push('record');
          throw new Error('Injected registry failure');
        },
        deleteArtifactFiles: () => {
          steps.push('files');
        },
      }),
    /Injected registry failure/,
  );

  assert.deepEqual(steps, ['record']);
});

test('a failed file deletion cannot leave a record claiming files that are gone', async () => {
  let recordRemoved = false;

  await assert.rejects(
    () =>
      removeInstalledArtifact({
        removeRecord: async () => {
          recordRemoved = true;
        },
        deleteArtifactFiles: () => {
          throw new Error('Injected delete failure');
        },
      }),
    /Injected delete failure/,
  );

  assert.equal(recordRemoved, true);
  // The orphaned files keep their installed name, so the cache sweep never mistakes them for a
  // partial download; only a retry of the action removes them.
  assert.equal(isPartialDownloadName('official-lite_1.0.0'), false);
});

test('a registry write that fails leaves the other installed records byte-for-byte intact', async () => {
  const stored = serializeRegistry([installedDataset('official-lite'), installedDataset('official-full')]);
  const store = new FailingWriteStore({ [DATASET_REGISTRY_KEY]: stored });
  const registry = createDatasetRegistry(store);

  await assert.rejects(
    () =>
      removeInstalledArtifact({
        removeRecord: () => registry.remove('official-lite'),
        deleteArtifactFiles: () => assert.fail('files must not be deleted after a failed write'),
      }),
    /Injected write failure/,
  );

  assert.equal(store.values.get(DATASET_REGISTRY_KEY), stored);
});

test('an unreadable registry refuses the removal before any file is deleted', async () => {
  const corrupt = '[{"id":"official-lite","manifestUri":"file:///private/path"';
  const store = new FailingWriteStore({ [DATASET_REGISTRY_KEY]: corrupt });
  const registry = createDatasetRegistry(store);

  await assert.rejects(
    () =>
      removeInstalledArtifact({
        removeRecord: () => registry.remove('official-lite'),
        deleteArtifactFiles: () => assert.fail('files must not be deleted when the registry is unreadable'),
      }),
    /REGISTRY_CORRUPT_JSON/,
  );

  assert.equal(store.values.get(DATASET_REGISTRY_KEY), corrupt);
});

function serializeRegistry(records: InstalledDataset[]) {
  return JSON.stringify({ version: 2, records });
}

function installedDataset(id: string): InstalledDataset {
  return {
    id,
    name: id,
    version: '1.0.0',
    description: '',
    level: 'lite',
    recipeCount: 300,
    chunkCount: 300,
    localRootUri: `file:///documents/datasets/${id}_1.0.0`,
    manifestUri: `file:///documents/datasets/${id}_1.0.0/dataset-pack.json`,
    installedAt: '2026-09-10T00:00:00.000Z',
    active: false,
    status: 'installed',
    sizeBytes: 1024,
    embeddingModel: 'bge-m3',
    embeddingDimension: 1024,
  };
}

class FailingWriteStore {
  readonly values: Map<string, string>;

  constructor(initial: Record<string, string>) {
    this.values = new Map(Object.entries(initial));
  }

  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  async setItem(): Promise<void> {
    throw new Error('Injected write failure');
  }
}
