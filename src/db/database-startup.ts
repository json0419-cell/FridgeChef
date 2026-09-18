import type { Recipe } from '../types';
import {
  DatabaseMigrationError,
  migrateDatabase,
  readSchemaVersion,
  type MigrationDatabase,
} from './migrations.ts';

export type BaseRecipe = Recipe;

export interface StartupDatabase extends MigrationDatabase {
  runAsync(source: string, ...params: string[]): Promise<unknown>;
}

type DatabaseStartupOptions<Database extends StartupDatabase> = {
  openDatabase: () => Promise<Database>;
  baseRecipes: readonly BaseRecipe[];
  /**
   * Release-validation hook (#27). It runs after the schema version is read and before any
   * migration, which is the only point where a fixture can refuse the upgrade without hiding the
   * version the database actually had. Builds that select no fixture pass a no-op.
   */
  applyUpgradeFixture?: (database: Database) => Promise<void>;
};

/**
 * Startup succeeds only once the schema is current and the Base Recipe Library is committed.
 * Any failure leaves the last committed state intact (ADR 0008) and can be retried.
 */
export function createDatabaseStartup<Database extends StartupDatabase>({
  openDatabase,
  baseRecipes,
  applyUpgradeFixture,
}: DatabaseStartupOptions<Database>) {
  let databasePromise: Promise<Database> | null = null;

  function getDatabase() {
    if (!databasePromise) {
      databasePromise = openDatabase().catch((error: unknown) => {
        databasePromise = null;
        throw error;
      });
    }

    return databasePromise;
  }

  async function initializeDatabase() {
    const database = await getDatabase();
    const originalVersion = await readSchemaVersion(database);
    await applyUpgradeFixture?.(database);
    const version = await migrateDatabase(database);

    try {
      await database.withTransactionAsync(() => seedBaseRecipeLibrary(database, baseRecipes));
    } catch (error) {
      throw new DatabaseMigrationError(
        'DATABASE_SEEDING_FAILED',
        'Base Recipe Library seeding failed.',
        originalVersion,
        version,
        { cause: error },
      );
    }
  }

  return { getDatabase, initializeDatabase };
}

async function seedBaseRecipeLibrary(database: StartupDatabase, baseRecipes: readonly BaseRecipe[]) {
  for (const recipe of baseRecipes) {
    await database.runAsync(
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
