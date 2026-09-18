import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDatasetRegistry,
  DATASET_REGISTRY_KEY,
} from '../src/datasets/dataset-registry-store.ts';
import {
  createEmbeddingModelRegistry,
  EMBEDDING_MODEL_REGISTRY_KEY,
  selectActiveEmbeddingModel,
} from '../src/rag/model/model-registry-store.ts';
import {
  evaluateRecommendationReadiness,
  listOutstandingRecommendationSetupSteps,
  RECOMMENDATION_SETUP_STEP_TITLE_KEYS,
} from '../src/features/recommendations/recommendation-readiness-policy.ts';
import {
  credentialStorageKey,
  credentialVerificationStorageKey,
  getOrMigrateApiKey,
  isStoredApiKeyVerified,
  markStoredApiKeyVerified,
  type CredentialStore,
  type OrdinaryStore,
} from '../src/storage/api-key-storage.ts';
import { reconcileInstalledSourceRead } from '../src/storage/installed-source-presence.ts';
import type { RegistryStore } from '../src/storage/installed-source-registry.ts';
import type { InstalledDataset, InstalledEmbeddingModel } from '../src/types';

const installedDataset: InstalledDataset = {
  id: 'official-lite',
  name: 'Official Lite',
  version: '1.0.0',
  description: 'Official pack',
  level: 'lite',
  recipeCount: 300,
  chunkCount: 900,
  localRootUri: 'file:///data/user/0/app/files/datasets/official-lite_1.0.0/',
  manifestUri: 'file:///data/user/0/app/files/datasets/official-lite_1.0.0/dataset-pack.json',
  installedAt: '2026-09-01T00:00:00.000Z',
  active: true,
  status: 'installed',
  sizeBytes: 1024,
  embeddingModel: 'bge-m3',
  embeddingDimension: 1024,
};

const restoredDataset: InstalledDataset = {
  ...installedDataset,
  id: 'official-medium',
  name: 'Official Medium',
  localRootUri: 'file:///data/user/0/app/files/datasets/official-medium_1.0.0/',
  manifestUri: 'file:///data/user/0/app/files/datasets/official-medium_1.0.0/dataset-pack.json',
};

const installedModel: InstalledEmbeddingModel = {
  id: 'bge-m3',
  name: 'BGE-M3',
  version: '1.0.0',
  description: 'Embedding model',
  localRootUri: 'file:///data/user/0/app/files/models/bge-m3_1.0.0/',
  manifestUri: 'file:///data/user/0/app/files/models/bge-m3_1.0.0/model-pack.json',
  installedAt: '2026-09-01T00:00:00.000Z',
  active: true,
  sizeBytes: 2048,
  modelName: 'BAAI/bge-m3',
  dimension: 1024,
  maxLength: 512,
  testEmbeddingVerifiedAt: '2026-09-01T00:01:00.000Z',
};

const presentUris = (...uris: string[]) => {
  const present = new Set(uris);
  return (record: { localRootUri: string; manifestUri: string }) =>
    present.has(record.localRootUri) && present.has(record.manifestUri);
};

test('a restored registry reports records whose files are absent as not installed', async () => {
  const store = new MemoryStore({
    [DATASET_REGISTRY_KEY]: JSON.stringify({
      version: 2,
      records: [installedDataset, restoredDataset],
    }),
  });

  const reconciled = reconcileInstalledSourceRead(
    await createDatasetRegistry(store).read(),
    presentUris(installedDataset.localRootUri, installedDataset.manifestUri),
  );

  assert.equal(reconciled.status, 'readable');
  if (reconciled.status !== 'readable') return;
  assert.deepEqual(reconciled.records.map((item) => item.id), [installedDataset.id]);
  assert.deepEqual(reconciled.missing.map((item) => item.id), [restoredDataset.id]);
  // Absence is not corruption: the stored bytes stay exactly as the restore delivered them.
  assert.equal(store.writes, 0);
});

test('an artifact missing only its manifest is not installed', () => {
  const reconciled = reconcileInstalledSourceRead(
    { status: 'readable', records: [installedDataset] },
    presentUris(installedDataset.localRootUri),
  );

  assert.equal(reconciled.status === 'readable' && reconciled.records.length, 0);
  assert.equal(reconciled.status === 'readable' && reconciled.missing.length, 1);
});

test('absent files never reach the unreadable-registry recovery path', async () => {
  const raw = '[{"id":';
  const store = new MemoryStore({ [DATASET_REGISTRY_KEY]: raw });
  let probed = 0;

  const reconciled = reconcileInstalledSourceRead(await createDatasetRegistry(store).read(), () => {
    probed += 1;
    return true;
  });

  // An unreadable registry stays unreadable and is never probed: recovery is for damaged bytes only.
  assert.equal(reconciled.status, 'unreadable');
  assert.equal(reconciled.status === 'unreadable' && reconciled.error.code, 'REGISTRY_CORRUPT_JSON');
  assert.equal(probed, 0);
  assert.equal(store.values[DATASET_REGISTRY_KEY], raw);

  // A probe that cannot answer reports the artifact as absent instead of failing the whole read.
  const throwing = reconcileInstalledSourceRead({ status: 'readable', records: [installedDataset] }, () => {
    throw new Error('file system unavailable');
  });
  assert.equal(throwing.status === 'readable' && throwing.records.length, 0);
  assert.equal(throwing.status === 'readable' && throwing.missing.length, 1);
});

test('a restored model whose files are absent leaves no active embedding model', async () => {
  const store = new MemoryStore({
    [EMBEDDING_MODEL_REGISTRY_KEY]: JSON.stringify({ version: 2, records: [installedModel] }),
  });
  const reconciled = reconcileInstalledSourceRead(
    await createEmbeddingModelRegistry(store).read(),
    presentUris(),
  );

  assert.equal(reconciled.status, 'readable');
  if (reconciled.status !== 'readable') return;
  assert.equal(selectActiveEmbeddingModel(reconciled.records), null);
  assert.equal(selectActiveEmbeddingModel([installedModel])?.id, installedModel.id);
});

test('a restored install is not Recommendation Ready and names what to set up again', () => {
  // Ordinary storage came back, so consent and the Base Recipe Library survive; the secure key and
  // the model files did not.
  const readiness = evaluateRecommendationReadiness({
    consentReady: true,
    credentialReady: false,
    modelReady: false,
    sourceReady: true,
  });

  assert.equal(readiness.ready, false);
  assert.deepEqual(listOutstandingRecommendationSetupSteps(readiness), ['credential', 'model']);
  assert.deepEqual(
    listOutstandingRecommendationSetupSteps(
      evaluateRecommendationReadiness({
        consentReady: true,
        credentialReady: true,
        modelReady: true,
        sourceReady: true,
      }),
    ),
    [],
  );
  for (const step of listOutstandingRecommendationSetupSteps(readiness)) {
    assert.equal(typeof RECOMMENDATION_SETUP_STEP_TITLE_KEYS[step], 'string');
  }
});

test('restored credential verification state without its secure key is not verified', async () => {
  const secureStore = new MemoryCredentialStore();
  await secureStore.setItem(credentialStorageKey('gemini'), 'live-key');
  await markStoredApiKeyVerified('gemini', secureStore);
  assert.equal(await isStoredApiKeyVerified('gemini', secureStore), true);

  // A restore brings ordinary storage back and leaves the secure store empty. Even if a stale
  // verification record rode along in ordinary storage, it is not where verification is read from.
  const restoredOrdinary = new MemoryCredentialStore({
    [credentialVerificationStorageKey('gemini')]:
      secureStore.values[credentialVerificationStorageKey('gemini')],
    'chi_shen_me.settings': JSON.stringify({ provider: 'gemini', servings: 2 }),
  });
  const restoredSecure = new MemoryCredentialStore();

  await getOrMigrateApiKey('gemini', restoredSecure, restoredOrdinary);
  assert.equal(await isStoredApiKeyVerified('gemini', restoredSecure), false);

  // Re-entering the same key is not enough either: verification is granted by a live test, not by
  // the key's value, so it stays unverified until the app tests it again.
  await restoredSecure.setItem(credentialStorageKey('gemini'), 'live-key');
  assert.equal(await isStoredApiKeyVerified('gemini', restoredSecure), false);
  assert.equal(restoredSecure.values[credentialVerificationStorageKey('gemini')], undefined);
});

test('a legacy key restored into ordinary storage migrates unverified', async () => {
  const restoredOrdinary = new MemoryCredentialStore({
    'chi_shen_me.settings': JSON.stringify({ provider: 'gemini', servings: 2, apiKey: 'legacy-key' }),
  });
  const restoredSecure = new MemoryCredentialStore();

  assert.equal(await getOrMigrateApiKey('gemini', restoredSecure, restoredOrdinary), 'legacy-key');
  assert.equal(await isStoredApiKeyVerified('gemini', restoredSecure), false);
});

class MemoryStore implements RegistryStore {
  values: Record<string, string>;
  writes = 0;

  constructor(values: Record<string, string> = {}) {
    this.values = { ...values };
  }

  async getItem(key: string) {
    return this.values[key] ?? null;
  }

  async setItem(key: string, value: string) {
    this.writes += 1;
    this.values[key] = value;
  }
}

class MemoryCredentialStore implements CredentialStore, OrdinaryStore {
  values: Record<string, string>;

  constructor(values: Record<string, string> = {}) {
    this.values = { ...values };
  }

  async getItem(key: string) {
    return this.values[key] ?? null;
  }

  async setItem(key: string, value: string) {
    this.values[key] = value;
  }

  async removeItem(key: string) {
    delete this.values[key];
  }
}
