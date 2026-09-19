CREATE TABLE ingredients (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'photo')),
  createdAt TEXT NOT NULL
);

CREATE INDEX idx_ingredients_createdAt
  ON ingredients (createdAt DESC);

CREATE TABLE recipes (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  mainIngredients TEXT NOT NULL,
  seasonings TEXT NOT NULL,
  steps TEXT NOT NULL,
  tags TEXT NOT NULL
);

CREATE TABLE user_recipe_libraries (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX idx_user_recipe_libraries_enabled_updatedAt
  ON user_recipe_libraries (enabled, updatedAt DESC);

CREATE TABLE user_recipes (
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

CREATE INDEX idx_user_recipes_libraryId_updatedAt
  ON user_recipes (libraryId, updatedAt DESC);

CREATE INDEX idx_user_recipes_enabled_library_updatedAt
  ON user_recipes (enabled, libraryId, updatedAt DESC);

CREATE TABLE personal_recipe_embeddings (
  recipeId TEXT NOT NULL,
  modelId TEXT NOT NULL,
  libraryId TEXT NOT NULL,
  recipeUpdatedAt TEXT NOT NULL,
  dimension INTEGER NOT NULL,
  vectorJson TEXT NOT NULL,
  indexedAt TEXT NOT NULL,
  PRIMARY KEY (recipeId, modelId)
);

CREATE INDEX idx_personal_recipe_embeddings_library_model
  ON personal_recipe_embeddings (libraryId, modelId);

CREATE TABLE cooked_history (
  id TEXT PRIMARY KEY NOT NULL,
  recipeId TEXT NOT NULL,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  cookedAt TEXT NOT NULL
);

CREATE INDEX idx_cooked_history_cookedAt
  ON cooked_history (cookedAt DESC);

CREATE INDEX idx_cooked_history_recipeId_cookedAt
  ON cooked_history (recipeId, cookedAt DESC);

PRAGMA user_version = 3;
