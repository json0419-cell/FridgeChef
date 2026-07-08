import * as SQLite from 'expo-sqlite';
import recipes from '../data/processed_recipes.json';
import type { Recipe } from '../types';

const DATABASE_NAME = 'chi_shen_me.db';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME);
  }

  return databasePromise;
}

export async function initializeDatabase() {
  const db = await getDatabase();

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS ingredients (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('manual', 'photo')),
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ingredients_createdAt
      ON ingredients (createdAt DESC);

    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      mainIngredients TEXT NOT NULL,
      seasonings TEXT NOT NULL,
      steps TEXT NOT NULL,
      tags TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_recipe_libraries (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_user_recipe_libraries_enabled_updatedAt
      ON user_recipe_libraries (enabled, updatedAt DESC);

    CREATE TABLE IF NOT EXISTS user_recipes (
      id TEXT PRIMARY KEY NOT NULL,
      libraryId TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      mainIngredients TEXT NOT NULL,
      seasonings TEXT NOT NULL,
      steps TEXT NOT NULL,
      tags TEXT NOT NULL,
      estimatedTimeMinutes INTEGER,
      difficulty TEXT NOT NULL,
      sourceType TEXT NOT NULL,
      sourceUrl TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_user_recipes_libraryId_updatedAt
      ON user_recipes (libraryId, updatedAt DESC);

    CREATE TABLE IF NOT EXISTS personal_recipe_embeddings (
      recipeId TEXT NOT NULL,
      modelId TEXT NOT NULL,
      libraryId TEXT NOT NULL,
      recipeUpdatedAt TEXT NOT NULL,
      dimension INTEGER NOT NULL,
      vectorJson TEXT NOT NULL,
      indexedAt TEXT NOT NULL,
      PRIMARY KEY (recipeId, modelId)
    );

    CREATE INDEX IF NOT EXISTS idx_personal_recipe_embeddings_library_model
      ON personal_recipe_embeddings (libraryId, modelId);

    CREATE TABLE IF NOT EXISTS cooked_history (
      id TEXT PRIMARY KEY NOT NULL,
      recipeId TEXT NOT NULL,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      cookedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cooked_history_cookedAt
      ON cooked_history (cookedAt DESC);

    CREATE INDEX IF NOT EXISTS idx_cooked_history_recipeId_cookedAt
      ON cooked_history (recipeId, cookedAt DESC);
  `);

  await ensureUserRecipesEnabledColumn(db);
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_user_recipes_enabled_library_updatedAt
      ON user_recipes (enabled, libraryId, updatedAt DESC);
  `);

  await seedRecipes(db);
}

async function ensureUserRecipesEnabledColumn(db: SQLite.SQLiteDatabase) {
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(user_recipes)');
  if (columns.some((column) => column.name === 'enabled')) {
    return;
  }

  await db.execAsync('ALTER TABLE user_recipes ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;');
}

async function seedRecipes(db: SQLite.SQLiteDatabase) {
  const localRecipes = recipes as Recipe[];

  for (const recipe of localRecipes) {
    await db.runAsync(
      `INSERT OR REPLACE INTO recipes
        (id, title, mainIngredients, seasonings, steps, tags)
       VALUES (?, ?, ?, ?, ?, ?)`,
      recipe.id,
      recipe.title,
      JSON.stringify(recipe.mainIngredients),
      JSON.stringify(recipe.seasonings),
      JSON.stringify(recipe.steps),
      JSON.stringify(recipe.tags),
    );
  }
}
