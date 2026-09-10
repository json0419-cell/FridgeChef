import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  DATABASE_SCHEMA_VERSION,
  DatabaseMigrationError,
  migrateDatabase,
  type MigrationDatabase,
} from '../src/db/migrations.ts';
import { createDatabaseStartupDiagnostic } from '../src/db/database-diagnostics.ts';

const schemaV1 = readFileSync('tests/fixtures/database-schema-v1.sql', 'utf8');
const schemaV2 = readFileSync('tests/fixtures/database-schema-v2.sql', 'utf8');

test('a fresh database migrates to the latest public schema', async (context) => {
  const fixture = new MigrationFixture();
  context.after(() => fixture.close());

  const version = await migrateDatabase(fixture);

  assert.equal(version, DATABASE_SCHEMA_VERSION);
  assert.equal(fixture.version(), 2);
  assert.deepEqual(
    fixture.tableNames(),
    ['cooked_history', 'ingredients', 'personal_recipe_embeddings', 'recipes', 'user_recipe_libraries', 'user_recipes'],
  );
  assert.equal(fixture.columnNames('user_recipes').includes('enabled'), true);
});

test('schema version 1 upgrades records to version 2 without replacing them', async (context) => {
  const fixture = new MigrationFixture();
  context.after(() => fixture.close());
  fixture.exec(schemaV1);
  fixture.exec(sampleRecipeSql);

  await migrateDatabase(fixture);

  assert.equal(fixture.version(), 2);
  assert.deepEqual(fixture.sampleRecipe(), { enabled: 1, id: 'recipe-1', title: 'Preserved recipe' });
});

test('schema version 2 is stable when initialization runs again', async (context) => {
  const fixture = new MigrationFixture();
  context.after(() => fixture.close());
  fixture.exec(schemaV2);
  fixture.exec(sampleRecipeSql);

  await migrateDatabase(fixture);
  await migrateDatabase(fixture);

  assert.equal(fixture.version(), 2);
  assert.deepEqual(fixture.sampleRecipe(), { enabled: 1, id: 'recipe-1', title: 'Preserved recipe' });
});

test('an unversioned database from the existing app is adopted without data loss', async (context) => {
  const fixture = new MigrationFixture();
  context.after(() => fixture.close());
  fixture.exec(schemaV2);
  fixture.exec('PRAGMA user_version = 0;');
  fixture.exec(sampleRecipeSql);

  await migrateDatabase(fixture);

  assert.equal(fixture.version(), 2);
  assert.deepEqual(fixture.sampleRecipe(), { enabled: 1, id: 'recipe-1', title: 'Preserved recipe' });
});

test('a failed migration rolls back schema changes and preserves original data', async (context) => {
  const fixture = new MigrationFixture(/idx_user_recipes_enabled_library_updatedAt/);
  context.after(() => fixture.close());
  fixture.exec(schemaV1);
  fixture.exec(sampleRecipeSql);

  await assert.rejects(
    () => migrateDatabase(fixture),
    (error) =>
      error instanceof DatabaseMigrationError &&
      error.code === 'DATABASE_MIGRATION_FAILED' &&
      error.fromVersion === 1 &&
      error.toVersion === 2,
  );

  assert.equal(fixture.version(), 1);
  assert.equal(fixture.columnNames('user_recipes').includes('enabled'), false);
  assert.deepEqual(fixture.sampleRecipe(false), { id: 'recipe-1', title: 'Preserved recipe' });
});

test('startup diagnostics expose only recovery metadata', () => {
  const secret = 'AIza-secret-key-that-must-never-appear';
  const error = new DatabaseMigrationError(
    'DATABASE_MIGRATION_FAILED',
    `Failed near ingredient data and ${secret}`,
    1,
    2,
  );

  const diagnostic = createDatabaseStartupDiagnostic(error, new Date('2026-09-10T12:00:00.000Z'));
  const serialized = JSON.stringify(diagnostic);

  assert.deepEqual(diagnostic, {
    code: 'DATABASE_MIGRATION_FAILED',
    occurredAt: '2026-09-10T12:00:00.000Z',
    fromVersion: 1,
    targetVersion: 2,
  });
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes('ingredient'), false);
});

const sampleRecipeSql = `
  INSERT INTO user_recipe_libraries (id, name, enabled, createdAt, updatedAt)
  VALUES ('library-1', 'Fixture library', 1, '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:00.000Z');

  INSERT INTO user_recipes (
    id, libraryId, title, description, mainIngredients, seasonings, steps, tags,
    estimatedTimeMinutes, difficulty, sourceType, sourceUrl, createdAt, updatedAt
  ) VALUES (
    'recipe-1', 'library-1', 'Preserved recipe', '', '[]', '[]', '[]', '[]',
    15, 'easy', 'manual', '', '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:00.000Z'
  );
`;

class MigrationFixture implements MigrationDatabase {
  readonly database = new DatabaseSync(':memory:');
  private readonly failSource: RegExp | undefined;

  constructor(failSource?: RegExp) {
    this.failSource = failSource;
  }

  exec(source: string) {
    this.database.exec(source);
  }

  async execAsync(source: string) {
    if (this.failSource?.test(source)) {
      throw new Error('Injected migration failure');
    }
    this.database.exec(source);
  }

  async getAllAsync<T>(source: string) {
    return this.database.prepare(source).all() as T[];
  }

  async getFirstAsync<T>(source: string) {
    return (this.database.prepare(source).get() as T | undefined) ?? null;
  }

  async withTransactionAsync(task: () => Promise<void>) {
    this.database.exec('BEGIN IMMEDIATE;');
    try {
      await task();
      this.database.exec('COMMIT;');
    } catch (error) {
      this.database.exec('ROLLBACK;');
      throw error;
    }
  }

  version() {
    return Number((this.database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
  }

  tableNames() {
    return this.database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((row) => String((row as { name: string }).name));
  }

  columnNames(table: string) {
    if (table !== 'user_recipes') {
      throw new Error('Unsupported fixture table');
    }
    return this.database
      .prepare('PRAGMA table_info(user_recipes)')
      .all()
      .map((row) => String((row as { name: string }).name));
  }

  sampleRecipe(includeEnabled = true) {
    const columns = includeEnabled ? 'id, title, enabled' : 'id, title';
    const row = this.database
      .prepare(`SELECT ${columns} FROM user_recipes WHERE id = 'recipe-1'`)
      .get() as Record<string, unknown> | undefined;
    return row ? { ...row } : undefined;
  }

  close() {
    this.database.close();
  }
}
