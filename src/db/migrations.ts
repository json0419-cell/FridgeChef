import { LEGACY_SEEDED_DEFAULT_TEXT, SEEDED_DEFAULT_MARKER } from './seeded-defaults.ts';

export const DATABASE_SCHEMA_VERSION = 3;

export type DatabaseMigrationErrorCode =
  | 'DATABASE_SCHEMA_TOO_NEW'
  | 'DATABASE_SCHEMA_VERSION_INVALID'
  | 'DATABASE_MIGRATION_PATH_MISSING'
  | 'DATABASE_MIGRATION_FAILED'
  | 'DATABASE_SEEDING_FAILED';

export class DatabaseMigrationError extends Error {
  readonly code: DatabaseMigrationErrorCode;
  readonly fromVersion: number | null;
  readonly toVersion: number | null;

  constructor(
    code: DatabaseMigrationErrorCode,
    message: string,
    fromVersion: number | null,
    toVersion: number | null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'DatabaseMigrationError';
    this.code = code;
    this.fromVersion = fromVersion;
    this.toVersion = toVersion;
  }
}

export interface MigrationDatabase {
  execAsync(source: string): Promise<void>;
  getAllAsync<T>(source: string): Promise<T[]>;
  getFirstAsync<T>(source: string): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

type Migration = {
  version: number;
  migrate: (database: MigrationDatabase) => Promise<void>;
};

const migrations: Migration[] = [
  {
    version: 1,
    migrate: createInitialSchema,
  },
  {
    version: 2,
    migrate: addUserRecipeEnabledState,
  },
  {
    version: 3,
    migrate: replaceFrozenChineseDefaults,
  },
];

export async function migrateDatabase(database: MigrationDatabase): Promise<number> {
  let currentVersion = await readSchemaVersion(database);

  if (currentVersion > DATABASE_SCHEMA_VERSION) {
    throw new DatabaseMigrationError(
      'DATABASE_SCHEMA_TOO_NEW',
      'Database schema is newer than this app supports.',
      currentVersion,
      DATABASE_SCHEMA_VERSION,
    );
  }

  for (const migration of migrations) {
    if (migration.version <= currentVersion) {
      continue;
    }
    if (migration.version !== currentVersion + 1) {
      throw new DatabaseMigrationError(
        'DATABASE_MIGRATION_PATH_MISSING',
        'Database migration path is incomplete.',
        currentVersion,
        migration.version,
      );
    }

    try {
      await database.withTransactionAsync(async () => {
        await migration.migrate(database);
        await database.execAsync(`PRAGMA user_version = ${migration.version};`);
      });
    } catch (error) {
      throw new DatabaseMigrationError(
        'DATABASE_MIGRATION_FAILED',
        'Database migration failed.',
        currentVersion,
        migration.version,
        { cause: error },
      );
    }
    currentVersion = migration.version;
  }

  return currentVersion;
}

export async function readSchemaVersion(database: MigrationDatabase) {
  const row = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = Number(row?.user_version ?? 0);

  if (!Number.isSafeInteger(version) || version < 0) {
    throw new DatabaseMigrationError(
      'DATABASE_SCHEMA_VERSION_INVALID',
      'Database schema version is invalid.',
      null,
      DATABASE_SCHEMA_VERSION,
    );
  }

  return version;
}

async function createInitialSchema(database: MigrationDatabase) {
  await database.execAsync(`
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
}

// Rows written before the marker existed hold the Chinese wording the app itself chose, so an
// English reader still sees Chinese. Only the exact strings the app wrote are replaced; anything
// else in these columns is the user's own text and is left alone. Timestamps are untouched so
// nothing reorders. Custom Ingredient units are deliberately not rewritten: '份' reaches the
// database only after the user reviewed and accepted it on the confirmation screen, which makes
// a stored unit user input rather than an app-chosen default.
async function replaceFrozenChineseDefaults(database: MigrationDatabase) {
  await database.execAsync(`
    UPDATE user_recipe_libraries
      SET name = '${SEEDED_DEFAULT_MARKER}'
      WHERE name = '${LEGACY_SEEDED_DEFAULT_TEXT.userRecipeLibraryName}';

    UPDATE user_recipes
      SET title = '${SEEDED_DEFAULT_MARKER}'
      WHERE title = '${LEGACY_SEEDED_DEFAULT_TEXT.recipeTitle}';

    UPDATE cooked_history
      SET title = '${SEEDED_DEFAULT_MARKER}'
      WHERE title = '${LEGACY_SEEDED_DEFAULT_TEXT.recipeTitle}';
  `);
}

async function addUserRecipeEnabledState(database: MigrationDatabase) {
  const columns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(user_recipes)');
  if (!columns.some((column) => column.name === 'enabled')) {
    await database.execAsync('ALTER TABLE user_recipes ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;');
  }

  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_user_recipes_enabled_library_updatedAt
      ON user_recipes (enabled, libraryId, updatedAt DESC);
  `);
}
