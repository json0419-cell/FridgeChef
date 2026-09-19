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
import { SENTINEL_API_KEY } from './fixtures/sentinel-api-key.ts';
import { SEEDED_DEFAULT_MARKER } from '../src/db/seeded-defaults.ts';

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

test('the wording the app used to freeze into rows becomes the seeded-default marker', async (context) => {
  const database = openFixture(2);
  context.after(() => database.close());
  database.exec(`
    INSERT INTO user_recipe_libraries (id, name, enabled, createdAt, updatedAt) VALUES
      ('legacy-default', '我的菜谱库', 1, '2026-09-03T08:00:00.000Z', '2026-09-03T08:00:00.000Z');
    INSERT INTO user_recipes (
      id, libraryId, title, description, mainIngredients, seasonings, steps, tags,
      estimatedTimeMinutes, difficulty, sourceType, sourceUrl, createdAt, updatedAt, enabled
    ) VALUES
      ('legacy-recipe', 'legacy-default', '未命名菜谱', '', '[]', '[]', '[]', '[]',
        NULL, 'unknown', 'manual', '', '2026-09-04T08:00:00.000Z', '2026-09-04T08:00:00.000Z', 1);
    INSERT INTO cooked_history (id, recipeId, title, source, cookedAt) VALUES
      ('legacy-history', 'legacy-recipe', '未命名菜谱', 'personal', '2026-09-05T19:00:00.000Z');
  `);

  await startupFor(database).initializeDatabase();

  assert.equal(database.version(), DATABASE_SCHEMA_VERSION);
  assert.deepEqual(
    database.rows('user_recipe_libraries', ['id', 'name']),
    [
      { id: 'legacy-default', name: SEEDED_DEFAULT_MARKER },
      { id: 'library-1', name: 'Fixture library' },
      { id: 'library-2', name: 'Fixture disabled library' },
    ],
  );
  assert.deepEqual(
    database.rows('user_recipes', ['id', 'title']),
    [
      { id: 'legacy-recipe', title: SEEDED_DEFAULT_MARKER },
      { id: 'recipe-1', title: 'Preserved recipe' },
      { id: 'recipe-2', title: 'Disabled recipe' },
    ],
  );
  assert.deepEqual(
    database.rows('cooked_history', ['id', 'title']),
    [
      { id: 'history-1', title: 'Preserved recipe' },
      { id: 'legacy-history', title: SEEDED_DEFAULT_MARKER },
    ],
  );
});

test('a library the user named keeps its name, and the migration runs only once', async (context) => {
  const database = openFixture(2);
  context.after(() => database.close());
  // A user is free to type the same words the app once used; renaming after the upgrade must stick.
  database.exec(`
    INSERT INTO user_recipe_libraries (id, name, enabled, createdAt, updatedAt) VALUES
      ('user-named', 'Weeknight dinners', 1, '2026-09-03T08:00:00.000Z', '2026-09-03T08:00:00.000Z');
  `);

  await startupFor(database).initializeDatabase();
  database.exec(`UPDATE user_recipe_libraries SET name = '我的菜谱库' WHERE id = 'user-named';`);
  await startupFor(database).initializeDatabase();

  assert.deepEqual(
    database.rows('user_recipe_libraries', ['id', 'name']).find((row) => row.id === 'user-named'),
    { id: 'user-named', name: '我的菜谱库' },
  );
});

test('ingredient units the user accepted are left as they were stored', async (context) => {
  const database = openFixture(2);
  context.after(() => database.close());
  database.exec(`
    INSERT INTO ingredients (id, name, quantity, unit, source, createdAt) VALUES
      ('ingredient-chinese-unit', 'Fixture rice', 1, '份', 'manual', '2026-09-01T08:00:00.000Z');
  `);

  await startupFor(database).initializeDatabase();

  assert.deepEqual(
    database.rows('ingredients', ['id', 'unit']).find((row) => row.id === 'ingredient-chinese-unit'),
    { id: 'ingredient-chinese-unit', unit: '份' },
  );
});

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
  const database = openFixture(DATABASE_SCHEMA_VERSION, failOnRecipeInsert(2));
  context.after(() => database.close());
  const before = database.snapshot();

  await assert.rejects(
    () => startupFor(database).initializeDatabase(),
    (error) =>
      error instanceof DatabaseMigrationError &&
      error.code === 'DATABASE_SEEDING_FAILED' &&
      error.fromVersion === DATABASE_SCHEMA_VERSION &&
      error.toVersion === DATABASE_SCHEMA_VERSION,
  );

  assert.deepEqual(database.snapshot(), before);
});

test('a seeding failure after an upgrade reports the original version and preserves user data', async (context) => {
  const database = openFixture(1, failOnRecipeInsert(2));
  context.after(() => database.close());
  const before = database.snapshot();

  await assert.rejects(
    () => startupFor(database).initializeDatabase(),
    (error) =>
      error instanceof DatabaseMigrationError &&
      error.code === 'DATABASE_SEEDING_FAILED' &&
      error.fromVersion === 1 &&
      error.toVersion === DATABASE_SCHEMA_VERSION,
  );

  assert.deepEqual(database.snapshotLike(before), before);
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
  const secret = SENTINEL_API_KEY;
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
    targetVersion: DATABASE_SCHEMA_VERSION,
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

// The release-validation fixture (#27) refuses the upgrade by marking the schema newer than this
// build supports, so it is only correct if startup hands it the version the database actually had,
// before any migration has run. Builds that select no fixture pass nothing and startup is unchanged.
test('the release-validation fixture runs before any migration, on the version the database had', async (context) => {
  const database = openFixture(1);
  context.after(() => database.close());
  const observed: number[] = [];

  await createDatabaseStartup({
    openDatabase: async () => database,
    baseRecipes,
    applyUpgradeFixture: async (db) => {
      observed.push(db.version());
    },
  }).initializeDatabase();

  assert.deepEqual(observed, [1]);
  assert.equal(database.version(), DATABASE_SCHEMA_VERSION);
});

test('startup without a selected fixture still migrates and seeds', async (context) => {
  const database = openFixture(1);
  context.after(() => database.close());

  await startupFor(database).initializeDatabase();

  assert.equal(database.version(), DATABASE_SCHEMA_VERSION);
  assert.deepEqual(database.rows('recipes'), seededRecipeRows);
});

function withoutRecipes(snapshot: ReturnType<SqliteTestDatabase['snapshot']>) {
  return Object.fromEntries(USER_DATA_TABLES.map((table) => [table, snapshot[table]]));
}
