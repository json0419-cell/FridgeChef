import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
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
import { createDatabaseStartupDiagnostic } from '../src/db/database-diagnostics.ts';
import { REDACTED_CREDENTIAL, redactCredentials } from '../src/privacy/credential-redaction.ts';
import { SENTINEL_API_KEY } from './fixtures/sentinel-api-key.ts';

const secureKey = credentialStorageKey('gemini');
const verificationKey = credentialVerificationStorageKey('gemini');

test('save, verify, and clear keep the sentinel key out of ordinary storage', async () => {
  const secureStore = new MemoryStore();
  const ordinaryStore = new MemoryStore({
    'chi_shen_me.settings': JSON.stringify({ servings: 2, geminiApiKey: SENTINEL_API_KEY }),
  });

  await saveSecureApiKey('gemini', SENTINEL_API_KEY, secureStore, ordinaryStore);
  assert.equal(secureStore.values[secureKey], SENTINEL_API_KEY);
  assertNoSentinel(ordinaryStore.dump());

  await markStoredApiKeyVerified('gemini', secureStore);
  assert.equal(await isStoredApiKeyVerified('gemini', secureStore), true);
  // The verification record is a fingerprint, so secure storage holds the key exactly once.
  assert.equal(secureStore.values[verificationKey].includes(SENTINEL_API_KEY), false);
  assert.equal(
    Object.entries(secureStore.values).filter(([, value]) => value.includes(SENTINEL_API_KEY)).length,
    1,
  );

  await clearStoredApiKey('gemini', secureStore, ordinaryStore);
  assertNoSentinel(secureStore.dump());
  assertNoSentinel(ordinaryStore.dump());
  assert.equal(await getOrMigrateApiKey('gemini', secureStore, ordinaryStore), null);
});

test('migrating a legacy sentinel key leaves no key field behind in ordinary storage', async () => {
  const secureStore = new MemoryStore();
  const ordinaryStore = new MemoryStore({
    gemini_api_key: SENTINEL_API_KEY,
    'chi_shen_me.gemini_api_key': SENTINEL_API_KEY,
    'chi_shen_me.settings': JSON.stringify({
      servings: 2,
      apiKey: SENTINEL_API_KEY,
      geminiApiKey: SENTINEL_API_KEY,
      apiKeys: { gemini: SENTINEL_API_KEY },
    }),
  });

  assert.equal(await getOrMigrateApiKey('gemini', secureStore, ordinaryStore), SENTINEL_API_KEY);

  const remaining = ordinaryStore.dump();
  assertNoSentinel(remaining);
  assert.doesNotMatch(remaining, /"(?:apiKey|geminiApiKey|apiKeys)"/);
  assert.deepEqual(JSON.parse(ordinaryStore.values['chi_shen_me.settings']), { servings: 2 });
});

test('a failed save reports the failure without quoting the key', async () => {
  const secureStore = new MemoryStore();
  secureStore.failSet = true;
  const ordinaryStore = new MemoryStore();

  const error = await saveSecureApiKey('gemini', SENTINEL_API_KEY, secureStore, ordinaryStore).catch(
    (thrown: unknown) => thrown,
  );

  assert.ok(error instanceof Error);
  assertNoSentinel(`${error.message} ${String((error as Error & { cause?: unknown }).cause ?? '')}`);
});

test('startup diagnostics carry a code rather than any text that could echo the key', () => {
  const diagnostic = createDatabaseStartupDiagnostic(
    new Error(`open failed while reading key=${SENTINEL_API_KEY}`),
  );

  assertNoSentinel(JSON.stringify(diagnostic));
  assert.equal(diagnostic.code, 'DATABASE_INITIALIZATION_FAILED');
});

test('a provider failure that echoes the key is redacted before it can be surfaced or logged', () => {
  const providerBody = JSON.stringify({
    error: { code: 400, message: `API key not valid: ${SENTINEL_API_KEY}`, status: 'INVALID_ARGUMENT' },
  });

  const redacted = redactCredentials(providerBody, SENTINEL_API_KEY);

  assertNoSentinel(redacted);
  assert.match(redacted, /API key not valid/);
  assert.ok(redacted.includes(REDACTED_CREDENTIAL));
});

test('no SQLite schema, current or historical, declares a column that could hold the key', () => {
  const schemas = [
    'src/db/migrations.ts',
    'tests/fixtures/database-schema-v1.sql',
    'tests/fixtures/database-schema-v2.sql',
  ].map((file) => readFileSync(file, 'utf8'));

  for (const schema of schemas) {
    const columns = [
      ...schema.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s+(?:TEXT|INTEGER|REAL|BLOB|NUMERIC)\b/gim),
    ].map((match) => match[1].toLowerCase());

    assert.ok(columns.length > 0, 'the schema scan must read real column declarations');
    assert.deepEqual(
      columns.filter((column) => /apikey|api_key|credential|secret|token/.test(column)),
      [],
    );
  }
});

test('no database module reads or writes the stored API key', () => {
  // The schema has no column for it and no SQLite module reaches for it, so there is no path by
  // which a key could be written to the database in the first place.
  const offenders = readdirSync('src/db', { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .filter((entry) => /api-key-storage|getApiKey|saveApiKey|credentialStorageKey/.test(
      readFileSync(`src/db/${entry.name}`, 'utf8'),
    ))
    .map((entry) => entry.name);

  assert.deepEqual(offenders, [], 'these database modules touch the API key');
});

function assertNoSentinel(value: string) {
  assert.equal(value.includes(SENTINEL_API_KEY), false, 'the sentinel API key must not appear here');
}

class MemoryStore implements CredentialStore, OrdinaryStore {
  failSet = false;
  readonly values: Record<string, string>;

  constructor(initial: Record<string, string> = {}) {
    this.values = { ...initial };
  }

  async getItem(key: string) {
    return Object.hasOwn(this.values, key) ? this.values[key] : null;
  }

  async setItem(key: string, value: string) {
    if (this.failSet) {
      throw new Error('store unavailable');
    }
    this.values[key] = value;
  }

  async removeItem(key: string) {
    delete this.values[key];
  }

  dump() {
    return JSON.stringify(this.values);
  }
}
