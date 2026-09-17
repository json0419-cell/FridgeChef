import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { DATABASE_SCHEMA_VERSION, DatabaseMigrationError } from '../src/db/migrations.ts';
import { createDatabaseStartup, type BaseRecipe } from '../src/db/database-startup.ts';
import {
  createDatabaseStartupDiagnostic,
  formatDatabaseStartupDiagnostic,
} from '../src/db/database-diagnostics.ts';
import { SqliteTestDatabase, USER_DATA_TABLES, type FailureInjector } from './support/sqlite-test-database.ts';

const baseRecipes: BaseRecipe[] = [
  {
    id: 'r001',
    title: 'Bundled egg recipe',
    mainIngredients: ['egg'],
    seasonings: ['salt'],
    steps: ['Whisk the eggs.', 'Cook until set.'],
    tags: ['quick'],
  },
  {
    id: 'r002',
    title: 'Bundled tomato recipe',
    mainIngredients: ['tomato', 'egg'],
    seasonings: [],
    steps: ['Cook the tomato.'],
    tags: [],
  },
];

const seededRecipeRows = [
  {
    id: 'r001',
    title: 'Bundled egg recipe',
    mainIngredients: '["egg"]',
    seasonings: '["salt"]',
    steps: '["Whisk the eggs.","Cook until set."]',
    tags: '["quick"]',
  },
  {
    id: 'r002',
    title: 'Bundled tomato recipe',
    mainIngredients: '["tomato","egg"]',
    seasonings: '[]',
    steps: '["Cook the tomato."]',
    tags: '[]',
  },
];

function fixturePaths(version: number) {
  return [`tests/fixtures/database-schema-v${version}.sql`, `tests/fixtures/database-data-v${version}.sql`];
}

function loadFixture(database: SqliteTestDatabase, version: number) {
  for (const path of fixturePaths(version)) {
    database.exec(readFileSync(path, 'utf8'));
  }
}

function openFixture(version: number, failWhen?: FailureInjector) {
  const database = new SqliteTestDatabase(':memory:', failWhen);
  loadFixture(database, version);
  return database;
}

function startupFor(database: SqliteTestDatabase) {
  return createDatabaseStartup({ openDatabase: async () => database, baseRecipes });
}

function failOnRecipeInsert(occurrence: number): FailureInjector {
  let inserts = 0;
  return (source) => /INSERT OR REPLACE INTO recipes/.test(source) && ++inserts === occurrence;
}

// Every public schema version must keep a historical fixture, an upgrade-to-current test,
// and an idempotent re-initialization test. Generating them from DATABASE_SCHEMA_VERSION
// makes a new version fail here until its fixture is added.
for (let version = 1; version <= DATABASE_SCHEMA_VERSION; version += 1) {
  test(`schema version ${version} has a historical schema and data fixture`, () => {
    for (const path of fixturePaths(version)) {
      assert.equal(existsSync(path), true, `Missing ${path}`);
    }
  });

  test(`schema version ${version} upgrades to the current schema with the Base Recipe Library seeded`, async (context) => {
    const database = openFixture(version);
    context.after(() => database.close());
    assert.equal(database.version(), version);
    const before = database.snapshot();

    await startupFor(database).initializeDatabase();

    assert.equal(database.version(), DATABASE_SCHEMA_VERSION);
    assert.deepEqual(database.snapshotLike(before, USER_DATA_TABLES), withoutRecipes(before));
    assert.deepEqual(database.rows('recipes'), seededRecipeRows);
  });

  test(`schema version ${version} is stable when initialization runs again`, async (context) => {
    const database = openFixture(version);
    context.after(() => database.close());

    await startupFor(database).initializeDatabase();
    const afterFirst = database.snapshot();
    await startupFor(database).initializeDatabase();

    assert.equal(database.version(), DATABASE_SCHEMA_VERSION);
    assert.deepEqual(database.snapshot(), afterFirst);
  });
}

test('a fresh database reaches the current schema with the Base Recipe Library seeded', async (context) => {
  const database = new SqliteTestDatabase();
  context.after(() => database.close());

  await startupFor(database).initializeDatabase();

  assert.equal(database.version(), DATABASE_SCHEMA_VERSION);
  assert.deepEqual(
    database.tableNames(),
    ['cooked_history', 'ingredients', 'personal_recipe_embeddings', 'recipes', 'user_recipe_libraries', 'user_recipes'],
  );
  assert.deepEqual(database.rows('recipes'), seededRecipeRows);
});

test('an unversioned database from the existing app is adopted without data loss', async (context) => {
  const database = openFixture(2);
  context.after(() => database.close());
  database.exec('PRAGMA user_version = 0;');
  const before = database.snapshot();

  await startupFor(database).initializeDatabase();

  assert.equal(database.version(), DATABASE_SCHEMA_VERSION);
  assert.deepEqual(database.snapshotLike(before, USER_DATA_TABLES), withoutRecipes(before));
});

test('a database newer than the app is rejected without changes', async (context) => {
  const database = openFixture(2);
  context.after(() => database.close());
  database.exec(`PRAGMA user_version = ${DATABASE_SCHEMA_VERSION + 1};`);
  const before = database.snapshot();

  await assert.rejects(
    () => startupFor(database).initializeDatabase(),
    (error) => error instanceof DatabaseMigrationError && error.code === 'DATABASE_SCHEMA_TOO_NEW',
  );

  assert.deepEqual(database.snapshot(), before);
});

test('an injected migration failure preserves the schema and every table from the fixture', async (context) => {
  const database = openFixture(1, (source) => /idx_user_recipes_enabled_library_updatedAt/.test(source));
  context.after(() => database.close());
  const before = database.snapshot();

  await assert.rejects(
    () => startupFor(database).initializeDatabase(),
    (error) =>
      error instanceof DatabaseMigrationError &&
      error.code === 'DATABASE_MIGRATION_FAILED' &&
      error.fromVersion === 1 &&
      error.toVersion === 2,
  );

  assert.equal(database.version(), 1);
  assert.equal(database.columnNames('user_recipes').includes('enabled'), false);
  assert.deepEqual(database.snapshot(), before);
});

test('an injected failure mid-seed leaves the prior recipes and all user tables unchanged', async (context) => {
  const database = openFixture(2, failOnRecipeInsert(2));
  context.after(() => database.close());
  const before = database.snapshot();

  await assert.rejects(
    () => startupFor(database).initializeDatabase(),
    (error) =>
      error instanceof DatabaseMigrationError &&
      error.code === 'DATABASE_SEEDING_FAILED' &&
      error.fromVersion === 2 &&
      error.toVersion === 2,
  );

  assert.deepEqual(database.snapshot(), before);
});

test('retrying after a transient seeding failure succeeds without data loss', async (context) => {
  const database = openFixture(1, failOnRecipeInsert(1));
  context.after(() => database.close());
  const before = database.snapshot();
  const startup = startupFor(database);

  await assert.rejects(() => startup.initializeDatabase());
  await startup.initializeDatabase();

  assert.equal(database.version(), DATABASE_SCHEMA_VERSION);
  assert.deepEqual(database.snapshotLike(before, USER_DATA_TABLES), withoutRecipes(before));
  assert.deepEqual(database.rows('recipes'), seededRecipeRows);
});

test('retrying after the database failed to open opens it again', async (context) => {
  const database = openFixture(2);
  context.after(() => database.close());
  let attempts = 0;
  const startup = createDatabaseStartup({
    openDatabase: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('Transient open failure');
      }
      return database;
    },
    baseRecipes,
  });

  await assert.rejects(() => startup.initializeDatabase());
  await startup.initializeDatabase();

  assert.equal(attempts, 2);
  assert.equal(await startup.getDatabase(), database);
  assert.deepEqual(database.rows('recipes'), seededRecipeRows);
});

test('initialization resolves only after migration and seeding are committed', async (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'fridgechef-db-'));
  const path = join(directory, 'startup.db');
  const database = new SqliteTestDatabase(path);
  loadFixture(database, 1);
  context.after(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  await startupFor(database).initializeDatabase();

  const otherConnection = new DatabaseSync(path, { readOnly: true });
  try {
    const version = otherConnection.prepare('PRAGMA user_version').get() as { user_version: number };
    const recipeIds = otherConnection.prepare('SELECT id FROM recipes ORDER BY id').all();
    assert.equal(Number(version.user_version), DATABASE_SCHEMA_VERSION);
    assert.deepEqual(recipeIds.map((row) => ({ ...row })), [{ id: 'r001' }, { id: 'r002' }]);
  } finally {
    otherConnection.close();
  }
});

test('startup diagnostics expose only recovery metadata', () => {
  const secret = 'AIza-secret-key-that-must-never-appear';
  const error = new DatabaseMigrationError(
    'DATABASE_SEEDING_FAILED',
    `Failed near ingredient data and ${secret}`,
    1,
    2,
    { cause: new Error('Fixture egg, Preserved recipe, no peanuts') },
  );

  const diagnostic = createDatabaseStartupDiagnostic(error, new Date('2026-09-10T12:00:00.000Z'));

  assert.deepEqual(diagnostic, {
    code: 'DATABASE_SEEDING_FAILED',
    occurredAt: '2026-09-10T12:00:00.000Z',
    fromVersion: 1,
    targetVersion: 2,
  });
});

test('copyable diagnostic text contains only the code, timestamp, and schema versions', () => {
  const text = formatDatabaseStartupDiagnostic(
    {
      code: 'DATABASE_SEEDING_FAILED',
      occurredAt: '2026-09-10T12:00:00.000Z',
      fromVersion: null,
      targetVersion: 2,
    },
    (key, values) => {
      const templates = {
        'app.databaseDiagnosticCode': 'Error code: {code}',
        'app.databaseDiagnosticTime': 'Occurred at: {time}',
        'app.databaseDiagnosticFromVersion': 'Original database version: {version}',
        'app.databaseDiagnosticTargetVersion': 'Target database version: {version}',
        'app.databaseDiagnosticUnknownVersion': 'unknown',
      };
      return templates[key].replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name]));
    },
  );

  assert.equal(
    text,
    [
      'Error code: DATABASE_SEEDING_FAILED',
      'Occurred at: 2026-09-10T12:00:00.000Z',
      'Original database version: unknown',
      'Target database version: 2',
    ].join('\n'),
  );
});

function withoutRecipes(snapshot: ReturnType<SqliteTestDatabase['snapshot']>) {
  return Object.fromEntries(USER_DATA_TABLES.map((table) => [table, snapshot[table]]));
}
