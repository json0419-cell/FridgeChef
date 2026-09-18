import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  CORRUPT_REGISTRY_FIXTURE_VALUE,
  FIXTURE_SCHEMA_BASE,
  VALIDATION_FIXTURES_ENV_VAR,
  applyDatabaseUpgradeFixture,
  applyInstalledSourceRegistryFixture,
  createValidationFixtureState,
  parseValidationFixtures,
} from '../src/validation/release-fixtures.ts';
import { DATASET_REGISTRY_KEY, isInstalledDataset } from '../src/datasets/dataset-registry-store.ts';
import { EMBEDDING_MODEL_REGISTRY_KEY } from '../src/rag/model/model-registry-store.ts';
import { DATABASE_SCHEMA_VERSION, DatabaseMigrationError, migrateDatabase } from '../src/db/migrations.ts';
import {
  parseInstalledSourceRegistry,
  type RegistryStore,
} from '../src/storage/installed-source-registry.ts';

const schemaV1 = readFileSync('tests/fixtures/database-schema-v1.sql', 'utf8');

const stateFor = (raw: string | undefined) => createValidationFixtureState(parseValidationFixtures(raw));

test('no fixture is selected when the build-time variable is absent or empty', () => {
  for (const raw of [undefined, '', '   ', ',,']) {
    assert.deepEqual([...parseValidationFixtures(raw)], []);
  }
});

test('only known fixture names are selected', () => {
  const fixtures = parseValidationFixtures(
    ' failDatabaseUpgrade , corruptDatasetRegistry ,corruptModelRegistry, dropUserData ',
  );

  assert.deepEqual(
    [...fixtures].sort(),
    ['corruptDatasetRegistry', 'corruptModelRegistry', 'failDatabaseUpgrade'],
  );
});

test('the database upgrade fixture fails the first start and lets the retry succeed with data intact', async (context) => {
  const database = new SqliteFixture();
  context.after(() => database.close());
  await migrateDatabase(database);
  database.exec(
    "INSERT INTO ingredients (id, name, quantity, unit, source, createdAt)" +
      " VALUES ('i1', 'egg', 2, 'pcs', 'manual', '2026-09-17T00:00:00.000Z');",
  );

  // First start of a fixture build: the upgrade is refused.
  const state = stateFor('failDatabaseUpgrade');
  await applyDatabaseUpgradeFixture(database, state);
  const failure = await migrateDatabase(database).then(
    () => null,
    (error: unknown) => error,
  );
  assert.ok(failure instanceof DatabaseMigrationError);
  assert.equal(failure.code, 'DATABASE_SCHEMA_TOO_NEW');

  // Retry in the same app process: the fixture stands down and the data is untouched.
  await applyDatabaseUpgradeFixture(database, state);
  assert.equal(await migrateDatabase(database), DATABASE_SCHEMA_VERSION);
  assert.equal(database.version(), DATABASE_SCHEMA_VERSION);
  assert.equal(database.ingredientCount(), 1);
});

test('a run killed before its retry still restores the version the database really has', async (context) => {
  const database = new SqliteFixture();
  context.after(() => database.close());
  // An older install: schema version 1, so migration 2 has not run and `enabled` does not exist yet.
  database.exec(schemaV1);
  database.exec('PRAGMA user_version = 1;');

  // The fixture fires and the process is killed before the user can retry.
  await applyDatabaseUpgradeFixture(database, stateFor('failDatabaseUpgrade'));
  assert.equal(database.version(), FIXTURE_SCHEMA_BASE + 1);

  // The next launch must not mistake the held version for the newest schema: restoring 2 here would
  // claim a migration that never ran.
  const relaunch = stateFor('failDatabaseUpgrade');
  await applyDatabaseUpgradeFixture(database, relaunch);
  assert.equal(relaunch.restoreSchemaVersion, 1);

  await applyDatabaseUpgradeFixture(database, relaunch);
  assert.equal(database.version(), 1);
  assert.equal(await migrateDatabase(database), DATABASE_SCHEMA_VERSION);
  assert.equal(database.columnNames('user_recipes').includes('enabled'), true);
});

test('the database upgrade fixture does nothing when it is not selected', async (context) => {
  const database = new SqliteFixture();
  context.after(() => database.close());

  await applyDatabaseUpgradeFixture(database, stateFor(undefined));

  assert.equal(await migrateDatabase(database), DATABASE_SCHEMA_VERSION);
});

test('the registry fixtures corrupt only the selected registry, and reads report it', async () => {
  const store = new MemoryStore();
  await store.setItem(EMBEDDING_MODEL_REGISTRY_KEY, '{"version":2,"records":[]}');

  await applyInstalledSourceRegistryFixture(store, stateFor('corruptDatasetRegistry'));

  assert.equal(store.raw(DATASET_REGISTRY_KEY), CORRUPT_REGISTRY_FIXTURE_VALUE);
  assert.equal(store.raw(EMBEDDING_MODEL_REGISTRY_KEY), '{"version":2,"records":[]}');

  const result = parseInstalledSourceRegistry('datasetRegistry', store.raw(DATASET_REGISTRY_KEY), isInstalledDataset);
  assert.equal(result.status, 'unreadable');
  assert.equal(result.status === 'unreadable' && result.error.code, 'REGISTRY_CORRUPT_JSON');
});

test('the registry fixture is seeded once and never overwrites an already corrupt registry', async () => {
  const store = new MemoryStore();
  const state = stateFor('corruptModelRegistry');

  await applyInstalledSourceRegistryFixture(store, state);
  const writesAfterSeeding = store.writes;
  await applyInstalledSourceRegistryFixture(store, state);

  assert.equal(writesAfterSeeding, 1);
  assert.equal(store.writes, 1);
  assert.equal(store.raw(EMBEDDING_MODEL_REGISTRY_KEY), CORRUPT_REGISTRY_FIXTURE_VALUE);
});

test('no registry is touched when no registry fixture is selected', async () => {
  const store = new MemoryStore();

  await applyInstalledSourceRegistryFixture(store, stateFor('failDatabaseUpgrade'));

  assert.equal(store.writes, 0);
  assert.equal(store.raw(DATASET_REGISTRY_KEY), null);
  assert.equal(store.raw(EMBEDDING_MODEL_REGISTRY_KEY), null);
});

test('no committed file selects a validation fixture', () => {
  // Anything that can reach a build: app config, build profiles, CI, Gradle, and every env file
  // Expo loads. A fixture build is made by exporting the variable in the shell, never by a commit.
  const committed = [
    'app.json',
    'app.config.js',
    'app.config.ts',
    'eas.json',
    'package.json',
    'android/gradle.properties',
    'android/app/build.gradle',
    ...envFileNames(),
    ...(existsSync('.github/workflows')
      ? readdirSync('.github/workflows').map((name) => join('.github/workflows', name))
      : []),
  ];

  for (const path of committed) {
    if (!existsSync(path)) {
      continue;
    }
    assert.equal(
      readFileSync(path, 'utf8').includes(VALIDATION_FIXTURES_ENV_VAR),
      false,
      `${path} must not select a validation fixture`,
    );
  }
});

test('no environment file that Expo loads is committed', () => {
  for (const path of envFileNames()) {
    assert.equal(existsSync(path), false, `${path} must not be committed`);
  }
});

test('the fixture variable is read in exactly one module', () => {
  const readers = sourceFiles('src').filter((path) =>
    readFileSync(path, 'utf8').includes(`process.env.${VALIDATION_FIXTURES_ENV_VAR}`),
  );

  assert.deepEqual(readers, ['src/validation/release-fixtures.ts']);
});

const envFileNames = () =>
  ['.env', '.env.local'].concat(
    ['development', 'test', 'production'].flatMap((mode) => [`.env.${mode}`, `.env.${mode}.local`]),
  );

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });

class MemoryStore implements RegistryStore {
  private readonly values = new Map<string, string>();
  writes = 0;

  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string) {
    this.writes += 1;
    this.values.set(key, value);
  }

  raw(key: string) {
    return this.values.get(key) ?? null;
  }
}

class SqliteFixture {
  private readonly database = new DatabaseSync(':memory:');

  async execAsync(source: string) {
    this.database.exec(source);
  }

  async getAllAsync<T>(source: string) {
    return this.database.prepare(source).all() as T[];
  }

  async getFirstAsync<T>(source: string) {
    return (this.database.prepare(source).get() ?? null) as T | null;
  }

  async withTransactionAsync(task: () => Promise<void>) {
    this.database.exec('BEGIN');
    try {
      await task();
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  exec(source: string) {
    this.database.exec(source);
  }

  version() {
    return Number((this.database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
  }

  columnNames(table: string) {
    return (this.database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
      (column) => column.name,
    );
  }

  ingredientCount() {
    return Number((this.database.prepare('SELECT COUNT(*) AS count FROM ingredients').get() as { count: number }).count);
  }

  close() {
    this.database.close();
  }
}
