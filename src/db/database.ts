import * as SQLite from 'expo-sqlite';
import { applyDatabaseUpgradeFixture } from '../validation/release-fixtures.ts';
import recipes from '../data/processed_recipes.json';
import type { Recipe } from '../types';
import { createDatabaseStartup } from './database-startup';

const DATABASE_NAME = 'chi_shen_me.db';

const databaseStartup = createDatabaseStartup({
  openDatabase: async () => {
    const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
    try {
      await db.execAsync('PRAGMA journal_mode = WAL;');
      // Commits must survive power loss before startup reports success.
      await db.execAsync('PRAGMA synchronous = FULL;');
    } catch (error) {
      await db.closeAsync().catch(() => undefined);
      throw error;
    }
    return db;
  },
  baseRecipes: recipes as Recipe[],
  // No-op unless this build selected the release-validation fixture (#27).
  applyUpgradeFixture: applyDatabaseUpgradeFixture,
});

export const getDatabase = databaseStartup.getDatabase;

export const initializeDatabase = databaseStartup.initializeDatabase;
