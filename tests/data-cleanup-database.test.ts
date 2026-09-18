import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  clearCachedDatabaseDataFrom,
  clearCookingHistoryDataFrom,
  clearIngredientDataFrom,
  clearPersonalRecipeDataFrom,
  type DataCleanupDatabase,
  type DataCleanupTransaction,
} from '../src/db/data-cleanup-database.ts';

const schema = readFileSync('tests/fixtures/database-schema-v2.sql', 'utf8');

test('cache cleanup removes only regenerable database indexes', async (context) => {
  const fixture = createFixture(context);

  await clearCachedDatabaseDataFrom(fixture);

  assert.deepEqual(fixture.counts(), expectedCounts({ personal_recipe_embeddings: 0 }));
});

test('ingredient cleanup leaves history, recipes, and indexes intact', async (context) => {
  const fixture = createFixture(context);

  await clearIngredientDataFrom(fixture);

  assert.deepEqual(fixture.counts(), expectedCounts({ ingredients: 0 }));
});

test('history cleanup leaves ingredients and recipe data intact', async (context) => {
  const fixture = createFixture(context);

  await clearCookingHistoryDataFrom(fixture);

  assert.deepEqual(fixture.counts(), expectedCounts({ cooked_history: 0 }));
});

test('personal recipe cleanup is transactional and preserves bundled recipes', async (context) => {
  const fixture = createFixture(context);

  await clearPersonalRecipeDataFrom(fixture);

  assert.deepEqual(
    fixture.counts(),
    expectedCounts({
      personal_recipe_embeddings: 0,
      user_recipe_libraries: 0,
      user_recipes: 0,
    }),
  );
});

test('a failed personal recipe cleanup rolls back every deletion', async (context) => {
  const fixture = createFixture(context, /DELETE FROM user_recipes/);

  await assert.rejects(() => clearPersonalRecipeDataFrom(fixture), /Injected cleanup failure/);

  assert.deepEqual(fixture.counts(), expectedCounts());
});

function createFixture(context: test.TestContext, failSource?: RegExp) {
  const fixture = new CleanupFixture(failSource);
  context.after(() => fixture.close());
  fixture.seed();
  return fixture;
}

const tableNames = [
  'ingredients',
  'recipes',
  'user_recipe_libraries',
  'user_recipes',
  'personal_recipe_embeddings',
  'cooked_history',
] as const;

type TableName = (typeof tableNames)[number];

function expectedCounts(overrides: Partial<Record<TableName, number>> = {}) {
  return Object.fromEntries(tableNames.map((table) => [table, overrides[table] ?? 1]));
}

class CleanupFixture implements DataCleanupDatabase, DataCleanupTransaction {
  private readonly database = new DatabaseSync(':memory:');
  private readonly failSource: RegExp | undefined;

  constructor(failSource?: RegExp) {
    this.failSource = failSource;
  }

  seed() {
    this.database.exec(schema);
    this.database.exec(`
      INSERT INTO ingredients VALUES ('ingredient-1', 'Fixture ingredient', 1, 'item', 'manual', '2026-09-10T00:00:00.000Z');
      INSERT INTO recipes VALUES ('base-recipe-1', 'Bundled recipe', '[]', '[]', '[]', '[]');
      INSERT INTO user_recipe_libraries VALUES ('library-1', 'Fixture library', 1, '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:00.000Z');
      INSERT INTO user_recipes VALUES ('user-recipe-1', 'library-1', 'Personal recipe', '', '[]', '[]', '[]', '[]', 15, 'easy', 'manual', '', 1, '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:00.000Z');
      INSERT INTO personal_recipe_embeddings VALUES ('user-recipe-1', 'model-1', 'library-1', '2026-09-10T00:00:00.000Z', 3, '[0,0,0]', '2026-09-10T00:00:00.000Z');
      INSERT INTO cooked_history VALUES ('history-1', 'base-recipe-1', 'Bundled recipe', 'structured', '2026-09-10T00:00:00.000Z');
    `);
  }

  async runAsync(source: string): Promise<unknown> {
    this.throwIfRequested(source);
    return this.database.prepare(source).run();
  }

  async execAsync(source: string): Promise<void> {
    this.throwIfRequested(source);
    this.database.exec(source);
  }

  async withExclusiveTransactionAsync(
    task: (transaction: DataCleanupTransaction) => Promise<void>,
  ): Promise<void> {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      await task(this);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  counts() {
    return Object.fromEntries(
      tableNames.map((table) => {
        const row = this.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
        return [table, Number(row.count)];
      }),
    );
  }

  close() {
    this.database.close();
  }

  private throwIfRequested(source: string) {
    if (this.failSource?.test(source)) {
      throw new Error('Injected cleanup failure');
    }
  }
}
