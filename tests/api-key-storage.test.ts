import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ApiKeyMigrationError,
  clearStoredApiKey,
  credentialStorageKey,
  credentialVerificationStorageKey,
  getOrMigrateApiKey,
  isStoredApiKeyVerified,
  markStoredApiKeyVerified,
  saveSecureApiKey,
  type CredentialStore,
  type OrdinaryStore,
} from '../src/storage/api-key-storage.ts';
import { evaluateRecommendationReadiness } from '../src/features/recommendations/recommendation-readiness-policy.ts';

const secureKey = credentialStorageKey('gemini');
const verificationKey = credentialVerificationStorageKey('gemini');
const legacyKey = 'gemini_api_key';
const settingsKey = 'chi_shen_me.settings';

test('legacy API key moves to secure storage before ordinary storage is cleared', async () => {
  const operations: string[] = [];
  const secureStore = new MemoryStore({}, operations, 'secure');
  const ordinaryStore = new MemoryStore(
    {
      [legacyKey]: ' legacy-secret ',
      [settingsKey]: JSON.stringify({ servings: 2, geminiApiKey: 'legacy-secret' }),
    },
    operations,
    'ordinary',
  );

  const result = await getOrMigrateApiKey('gemini', secureStore, ordinaryStore);

  assert.equal(result, 'legacy-secret');
  assert.equal(await secureStore.getItem(secureKey), 'legacy-secret');
  assert.equal(await ordinaryStore.getItem(legacyKey), null);
  assert.deepEqual(JSON.parse((await ordinaryStore.getItem(settingsKey)) ?? '{}'), { servings: 2 });
  assert.ok(operations.indexOf(`secure:set:${secureKey}`) < operations.indexOf(`ordinary:remove:${legacyKey}`));
});

test('failed secure writes preserve the legacy API key', async () => {
  const secureStore = new MemoryStore();
  secureStore.failSet = true;
  const ordinaryStore = new MemoryStore({ [legacyKey]: 'legacy-secret' });

  await assert.rejects(
    () => getOrMigrateApiKey('gemini', secureStore, ordinaryStore),
    (error) => error instanceof ApiKeyMigrationError && error.code === 'API_KEY_SECURE_WRITE_FAILED',
  );

  assert.equal(await ordinaryStore.getItem(legacyKey), 'legacy-secret');
});

test('failed secure verification preserves the legacy API key', async () => {
  const secureStore = new MemoryStore();
  secureStore.dropWrites = true;
  const ordinaryStore = new MemoryStore({ [legacyKey]: 'legacy-secret' });

  await assert.rejects(
    () => getOrMigrateApiKey('gemini', secureStore, ordinaryStore),
    (error) => error instanceof ApiKeyMigrationError && error.code === 'API_KEY_SECURE_VERIFY_FAILED',
  );

  assert.equal(await ordinaryStore.getItem(legacyKey), 'legacy-secret');
});

test('malformed settings with a credential field remain untouched and lock migration', async () => {
  const malformedSettings = '{"servings":2,"apiKey":"legacy-secret"';
  const secureStore = new MemoryStore();
  const ordinaryStore = new MemoryStore({ [settingsKey]: malformedSettings });

  await assert.rejects(
    () => getOrMigrateApiKey('gemini', secureStore, ordinaryStore),
    (error) => error instanceof ApiKeyMigrationError && error.code === 'API_KEY_LEGACY_READ_FAILED',
  );

  assert.equal(await secureStore.getItem(secureKey), null);
  assert.equal(await ordinaryStore.getItem(settingsKey), malformedSettings);
});

test('an existing secure API key removes stale ordinary copies', async () => {
  const secureStore = new MemoryStore({ [secureKey]: 'secure-secret' });
  const ordinaryStore = new MemoryStore({
    [secureKey]: 'stale-secret',
    [settingsKey]: JSON.stringify({ dietaryPreferences: 'vegetarian', apiKeys: { gemini: 'stale-secret' } }),
  });

  const result = await getOrMigrateApiKey('gemini', secureStore, ordinaryStore);

  assert.equal(result, 'secure-secret');
  assert.equal(await ordinaryStore.getItem(secureKey), null);
  assert.deepEqual(JSON.parse((await ordinaryStore.getItem(settingsKey)) ?? '{}'), {
    dietaryPreferences: 'vegetarian',
  });
});

test('saving an API key verifies secure storage and removes legacy copies', async () => {
  const secureStore = new MemoryStore();
  const ordinaryStore = new MemoryStore({ [legacyKey]: 'old-secret' });

  await saveSecureApiKey('gemini', ' new-secret ', secureStore, ordinaryStore);

  assert.equal(await secureStore.getItem(secureKey), 'new-secret');
  assert.equal(await ordinaryStore.getItem(legacyKey), null);
});

test('a saved API key remains unverified until its live test succeeds', async () => {
  const secureStore = new MemoryStore({ [secureKey]: 'saved-secret' });

  assert.equal(await isStoredApiKeyVerified('gemini', secureStore), false);

  await markStoredApiKeyVerified('gemini', secureStore);

  assert.equal(await isStoredApiKeyVerified('gemini', secureStore), true);
  assert.notEqual(await secureStore.getItem(verificationKey), 'saved-secret');
});

test('verification is bound to the exact saved API key', async () => {
  const secureStore = new MemoryStore({ [secureKey]: 'first-secret' });

  await markStoredApiKeyVerified('gemini', secureStore);
  await secureStore.setItem(secureKey, 'second-secret');

  assert.equal(await isStoredApiKeyVerified('gemini', secureStore), false);
});

test('clearing an API key removes verification before the credential', async () => {
  const operations: string[] = [];
  const secureStore = new MemoryStore(
    { [secureKey]: 'saved-secret', [verificationKey]: 'fingerprint' },
    operations,
    'secure',
  );
  const ordinaryStore = new MemoryStore({}, operations, 'ordinary');

  await clearStoredApiKey('gemini', secureStore, ordinaryStore);

  assert.equal(await secureStore.getItem(secureKey), null);
  assert.equal(await secureStore.getItem(verificationKey), null);
  assert.ok(
    operations.indexOf(`secure:remove:${verificationKey}`) < operations.indexOf(`secure:remove:${secureKey}`),
  );
});

test('clearing the API key blocks Recommendation Ready and keeps every other local record', async () => {
  const secureStore = new MemoryStore({ [secureKey]: 'saved-secret' });
  const ordinaryStore = new MemoryStore({
    [settingsKey]: JSON.stringify({ servings: 2 }),
    'chi_shen_me.dataset_registry.v1': '{"version":2,"records":[]}',
    'chi_shen_me.recommendation_cache.v2': '{"refinedRecommendations":[],"cachedAt":"2026-09-10T00:00:00.000Z"}',
  });
  await markStoredApiKeyVerified('gemini', secureStore);
  const otherRecords = new Map(ordinaryStore.values);

  await clearStoredApiKey('gemini', secureStore, ordinaryStore);

  assert.equal(await isStoredApiKeyVerified('gemini', secureStore), false);
  assert.equal(
    evaluateRecommendationReadiness({
      consentReady: true,
      credentialReady: await isStoredApiKeyVerified('gemini', secureStore),
      modelReady: true,
      sourceReady: true,
    }).ready,
    false,
  );
  assert.deepEqual(ordinaryStore.values, otherRecords);
});

class MemoryStore implements CredentialStore, OrdinaryStore {
  readonly values: Map<string, string>;
  readonly operations: string[];
  readonly name: string;
  failSet = false;
  dropWrites = false;

  constructor(initial: Record<string, string> = {}, operations: string[] = [], name = 'store') {
    this.values = new Map(Object.entries(initial));
    this.operations = operations;
    this.name = name;
  }

  async getItem(key: string) {
    this.operations.push(`${this.name}:get:${key}`);
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string) {
    this.operations.push(`${this.name}:set:${key}`);
    if (this.failSet) {
      throw new Error('Injected write failure');
    }
    if (!this.dropWrites) {
      this.values.set(key, value);
    }
  }

  async removeItem(key: string) {
    this.operations.push(`${this.name}:remove:${key}`);
    this.values.delete(key);
  }
}
