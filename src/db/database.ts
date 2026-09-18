import * as SQLite from 'expo-sqlite';
import { applyDatabaseUpgradeFixture } from '../validation/release-fixtures.ts';
import recipes from '../data/processed_recipes.json';
import type { Recipe } from '../types';
import { migrateDatabase } from './migrations';

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

  await db.execAsync('PRAGMA journal_mode = WAL;');
  // No-op unless this build selected the release-validation fixture (#27).
  await applyDatabaseUpgradeFixture(db);
  await migrateDatabase(db);

  await seedRecipes(db);
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
