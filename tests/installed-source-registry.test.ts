import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDatasetRegistry,
  DATASET_REGISTRY_KEY,
} from '../src/datasets/dataset-registry-store.ts';
import {
  createEmbeddingModelRegistry,
  EMBEDDING_MODEL_REGISTRY_KEY,
} from '../src/rag/model/model-registry-store.ts';
import {
  createInstalledSourceDiagnostic,
  INSTALLED_SOURCE_REGISTRY_VERSION,
  InstalledSourceRegistryError,
  type RegistryStore,
} from '../src/storage/installed-source-registry.ts';
import type { InstalledDataset, InstalledEmbeddingModel } from '../src/types';

const officialDataset: InstalledDataset = {
  id: 'official-lite',
  name: 'Official Lite',
  version: '1.0.0',
  description: 'Official pack',
  level: 'lite',
  recipeCount: 300,
  chunkCount: 900,
  localRootUri: 'file:///data/user/0/app/files/datasets/official-lite_1.0.0/',
  manifestUri: 'file:///data/user/0/app/files/datasets/official-lite_1.0.0/dataset-pack.json',
  manifestUrl: 'https://example.com/private-pack/manifest.json',
  installedAt: '2026-09-01T00:00:00.000Z',
  active: true,
  status: 'installed',
  sizeBytes: 1024,
  embeddingModel: 'bge-m3',
  embeddingDimension: 1024,
};

const unverifiedDataset: InstalledDataset = {
  ...officialDataset,
  id: 'custom-pack',
  name: 'Custom Pack',
  level: 'custom',
  active: false,
  manifestUrl: undefined,
  localRootUri: 'file:///data/user/0/app/files/datasets/custom-pack_1.0.0/',
  manifestUri: 'file:///data/user/0/app/files/datasets/custom-pack_1.0.0/dataset-pack.json',
};

const model: InstalledEmbeddingModel = {
  id: 'bge-m3',
  name: 'BGE-M3',
  version: '1.0.0',
  description: 'Embedding model',
  localRootUri: 'file:///data/user/0/app/files/models/bge-m3_1.0.0/',
  manifestUri: 'file:///data/user/0/app/files/models/bge-m3_1.0.0/model-pack.json',
  manifestUrl: 'https://example.com/model/manifest.json',
  installedAt: '2026-09-01T00:00:00.000Z',
  active: true,
  sizeBytes: 2048,
  modelName: 'BAAI/bge-m3',
  dimension: 1024,
  maxLength: 512,
  testEmbeddingVerifiedAt: '2026-09-01T00:01:00.000Z',
};

const unreadableValues: Array<[string, string, string]> = [
  ['corrupt JSON', '[{"id":', 'REGISTRY_CORRUPT_JSON'],
  ['wrong shape', '{"hello":"world"}', 'REGISTRY_INVALID_SHAPE'],
  ['primitive value', '42', 'REGISTRY_INVALID_SHAPE'],
  ['unknown version', '{"version":99,"records":[]}', 'REGISTRY_UNKNOWN_VERSION'],
  ['non-array records', '{"version":2,"records":{}}', 'REGISTRY_INVALID_SHAPE'],
];

test('an absent registry reads as empty, not unreadable', async () => {
  const datasets = createDatasetRegistry(new MemoryStore());
  const models = createEmbeddingModelRegistry(new MemoryStore());

  assert.deepEqual(await datasets.read(), { status: 'readable', records: [] });
  assert.deepEqual(await models.read(), { status: 'readable', records: [] });
});

test('public version 1 (bare array) upgrades to the current version and re-reads idempotently', async () => {
  const datasetStore = new MemoryStore({
    [DATASET_REGISTRY_KEY]: JSON.stringify([officialDataset, unverifiedDataset]),
  });
  const datasets = createDatasetRegistry(datasetStore);

  assert.deepEqual(await datasets.list(), [officialDataset, unverifiedDataset].map(withoutUndefined));
  await datasets.setActive(unverifiedDataset.id);

  const upgraded = JSON.parse(datasetStore.values[DATASET_REGISTRY_KEY]);
  assert.equal(upgraded.version, INSTALLED_SOURCE_REGISTRY_VERSION);
  assert.deepEqual(
    (await datasets.list()).map((item) => [item.id, item.active]),
    [
      [officialDataset.id, false],
      [unverifiedDataset.id, true],
    ],
  );

  const rewritten = datasetStore.values[DATASET_REGISTRY_KEY];
  await datasets.save((await datasets.list())[1]);
  const reread = await datasets.list();
  await datasets.save(reread[1]);
  assert.equal(datasetStore.values[DATASET_REGISTRY_KEY], rewritten);

  const modelStore = new MemoryStore({ [EMBEDDING_MODEL_REGISTRY_KEY]: JSON.stringify([model]) });
  const models = createEmbeddingModelRegistry(modelStore);
  assert.deepEqual(await models.list(), [model]);
  await models.save(model);
  assert.equal(JSON.parse(modelStore.values[EMBEDDING_MODEL_REGISTRY_KEY]).version, INSTALLED_SOURCE_REGISTRY_VERSION);
  const modelBytes = modelStore.values[EMBEDDING_MODEL_REGISTRY_KEY];
  await models.save((await models.list())[0]);
  assert.equal(modelStore.values[EMBEDDING_MODEL_REGISTRY_KEY], modelBytes);
  assert.deepEqual(await models.list(), [model]);
});

test('the current version round-trips unchanged', async () => {
  const store = new MemoryStore();
  const datasets = createDatasetRegistry(store);
  await datasets.save(officialDataset);
  await datasets.save(unverifiedDataset);

  assert.deepEqual(JSON.parse(store.values[DATASET_REGISTRY_KEY]), {
    version: INSTALLED_SOURCE_REGISTRY_VERSION,
    records: [officialDataset, unverifiedDataset].map(withoutUndefined),
  });
  assert.deepEqual(await createDatasetRegistry(store).list(), [officialDataset, unverifiedDataset].map(withoutUndefined));
});

for (const [label, raw, code] of unreadableValues) {
  test(`dataset registry with ${label} is unreadable and every write preserves the stored bytes`, async () => {
    const store = new MemoryStore({ [DATASET_REGISTRY_KEY]: raw });
    const datasets = createDatasetRegistry(store);

    const result = await datasets.read();
    assert.equal(result.status, 'unreadable');
    assert.equal(result.status === 'unreadable' && result.error.code, code);
    await assertRegistryError(() => datasets.list(), code);
    await assertRegistryError(() => datasets.save(unverifiedDataset), code);
    await assertRegistryError(() => datasets.setActive(officialDataset.id), code);
    await assertRegistryError(() => datasets.clearActive(officialDataset.id), code);
    await assertRegistryError(() => datasets.remove(officialDataset.id), code);

    assert.equal(store.values[DATASET_REGISTRY_KEY], raw);
    assert.equal(store.writes, 0);
  });

  test(`model registry with ${label} is unreadable and every write preserves the stored bytes`, async () => {
    const store = new MemoryStore({ [EMBEDDING_MODEL_REGISTRY_KEY]: raw });
    const models = createEmbeddingModelRegistry(store);

    const result = await models.read();
    assert.equal(result.status, 'unreadable');
    await assertRegistryError(() => models.list(), code);
    await assertRegistryError(() => models.getActive(), code);
    await assertRegistryError(() => models.save(model), code);

    assert.equal(store.values[EMBEDDING_MODEL_REGISTRY_KEY], raw);
    assert.equal(store.writes, 0);
  });
}

test('one invalid record makes the registry unreadable instead of being filtered out and persisted', async () => {
  const invalidRecord = { ...unverifiedDataset, recipeCount: 'many' };
  const raw = JSON.stringify([officialDataset, invalidRecord]);
  const store = new MemoryStore({ [DATASET_REGISTRY_KEY]: raw });
  const datasets = createDatasetRegistry(store);

  await assertRegistryError(() => datasets.list(), 'REGISTRY_INVALID_RECORD');
  await assertRegistryError(() => datasets.save({ ...officialDataset, active: false }), 'REGISTRY_INVALID_RECORD');
  assert.equal(store.values[DATASET_REGISTRY_KEY], raw);

  const modelRaw = JSON.stringify({ version: 2, records: [model, { ...model, id: 'other', dimension: null }] });
  const modelStore = new MemoryStore({ [EMBEDDING_MODEL_REGISTRY_KEY]: modelRaw });
  await assertRegistryError(() => createEmbeddingModelRegistry(modelStore).save(model), 'REGISTRY_INVALID_RECORD');
  assert.equal(modelStore.values[EMBEDDING_MODEL_REGISTRY_KEY], modelRaw);
});

test('a failed storage read is unreadable and does not write', async () => {
  const store = new MemoryStore({ [DATASET_REGISTRY_KEY]: JSON.stringify([officialDataset]) });
  store.failGet = true;
  const datasets = createDatasetRegistry(store);

  await assertRegistryError(() => datasets.remove(officialDataset.id), 'REGISTRY_READ_FAILED');
  assert.equal(store.writes, 0);
});

test('remove, enable, and disable mutate only readable registries', async () => {
  const store = new MemoryStore();
  const datasets = createDatasetRegistry(store);
  await datasets.save(officialDataset);
  await datasets.save(unverifiedDataset);

  await datasets.clearActive(officialDataset.id);
  assert.deepEqual((await datasets.list()).map((item) => item.active), [false, false]);
  await datasets.remove(officialDataset.id);
  assert.deepEqual((await datasets.list()).map((item) => item.id), [unverifiedDataset.id]);

  const models = createEmbeddingModelRegistry(new MemoryStore());
  assert.equal(await models.getActive(), null);
  await models.save({ ...model, active: false });
  assert.equal((await models.getActive())?.id, model.id);
});

test('diagnostics contain only the registry category, safe code, and versions', async () => {
  const secretUrl = 'https://example.com/private-pack/manifest.json';
  const raw = JSON.stringify({ version: 7, records: [{ ...officialDataset, manifestUrl: secretUrl }] });
  const result = await createDatasetRegistry(new MemoryStore({ [DATASET_REGISTRY_KEY]: raw })).read();
  assert.equal(result.status, 'unreadable');
  if (result.status !== 'unreadable') return;

  const diagnostic = createInstalledSourceDiagnostic(result.error, new Date('2026-09-16T00:00:00.000Z'));
  assert.deepEqual(diagnostic, {
    category: 'datasetRegistry',
    code: 'REGISTRY_UNKNOWN_VERSION',
    occurredAt: '2026-09-16T00:00:00.000Z',
    storedVersion: 7,
    targetVersion: INSTALLED_SOURCE_REGISTRY_VERSION,
  });

  const serialized = JSON.stringify(diagnostic) + result.error.message;
  for (const forbidden of [secretUrl, 'file:///', 'Official Lite', raw]) {
    assert.equal(serialized.includes(forbidden), false, `diagnostic leaked ${forbidden}`);
  }

  const corrupt = await createDatasetRegistry(new MemoryStore({ [DATASET_REGISTRY_KEY]: '{"version":"secret-text"}' })).read();
  assert.equal(corrupt.status === 'unreadable' && createInstalledSourceDiagnostic(corrupt.error).storedVersion, null);
  assert.equal(createInstalledSourceDiagnostic(new Error(secretUrl)).code, 'REGISTRY_READ_FAILED');
});

async function assertRegistryError(action: () => Promise<unknown>, code: string) {
  await assert.rejects(action, (error) => error instanceof InstalledSourceRegistryError && error.code === code);
}

function withoutUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

class MemoryStore implements RegistryStore {
  values: Record<string, string>;
  writes = 0;
  failGet = false;

  constructor(values: Record<string, string> = {}) {
    this.values = { ...values };
  }

  async getItem(key: string) {
    if (this.failGet) {
      throw new Error('storage unavailable');
    }
    return this.values[key] ?? null;
  }

  async setItem(key: string, value: string) {
    this.writes += 1;
    this.values[key] = value;
  }
}
