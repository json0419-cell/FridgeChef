import { getDatabase } from './database';
import { createLocalId } from './ingredientsRepository';
import type {
  Recipe,
  UserRecipe,
  UserRecipeDifficulty,
  UserRecipeDraft,
  UserRecipeLibrary,
  UserRecipeSourceType,
} from '../types';

const DEFAULT_LIBRARY_NAME = '我的菜谱库';

interface UserRecipeLibraryRow {
  id: string;
  name: string;
  enabled: number;
  recipeCount: number;
  createdAt: string;
  updatedAt: string;
}

interface UserRecipeRow {
  id: string;
  libraryId: string;
  title: string;
  description: string;
  mainIngredients: string;
  seasonings: string;
  steps: string;
  tags: string;
  estimatedTimeMinutes: number | null;
  difficulty: string;
  sourceType: string;
  sourceUrl: string;
  enabled: number;
  createdAt: string;
  updatedAt: string;
}

interface UserRecipeWithLibraryRow extends UserRecipeRow {
  libraryName: string;
  libraryEnabled: number;
}

export interface UserRecipeWithLibrary extends UserRecipe {
  libraryName: string;
  libraryEnabled: boolean;
}

export async function ensureDefaultUserRecipeLibrary(): Promise<UserRecipeLibrary> {
  const libraries = await listUserRecipeLibraries();
  if (libraries.length > 0) {
    return libraries[0];
  }

  return createUserRecipeLibrary(DEFAULT_LIBRARY_NAME);
}

export async function listUserRecipeLibraries(): Promise<UserRecipeLibrary[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<UserRecipeLibraryRow>(
    `SELECT
       libraries.id,
       libraries.name,
       libraries.enabled,
       COUNT(recipes.id) AS recipeCount,
       libraries.createdAt,
       libraries.updatedAt
     FROM user_recipe_libraries libraries
     LEFT JOIN user_recipes recipes ON recipes.libraryId = libraries.id
     GROUP BY libraries.id
     ORDER BY libraries.updatedAt DESC`,
  );

  return rows.map(toUserRecipeLibrary);
}

export async function createUserRecipeLibrary(name: string): Promise<UserRecipeLibrary> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const library: UserRecipeLibrary = {
    id: createLocalId('recipe_library'),
    name: normalizeText(name) || DEFAULT_LIBRARY_NAME,
    enabled: true,
    recipeCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  await db.runAsync(
    `INSERT INTO user_recipe_libraries (id, name, enabled, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?)`,
    library.id,
    library.name,
    1,
    library.createdAt,
    library.updatedAt,
  );

  return library;
}

export async function setUserRecipeLibraryEnabled(id: string, enabled: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE user_recipe_libraries
     SET enabled = ?, updatedAt = ?
     WHERE id = ?`,
    enabled ? 1 : 0,
    new Date().toISOString(),
    id,
  );
}

export async function updateUserRecipeLibraryName(id: string, name: string): Promise<void> {
  const normalizedName = normalizeText(name);
  if (!normalizedName) {
    throw new Error('菜谱库名称不能为空。');
  }

  const db = await getDatabase();
  await db.runAsync(
    `UPDATE user_recipe_libraries
     SET name = ?, updatedAt = ?
     WHERE id = ?`,
    normalizedName,
    new Date().toISOString(),
    id,
  );
}

export async function deleteUserRecipeLibrary(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM personal_recipe_embeddings WHERE libraryId = ?', id);
  await db.runAsync('DELETE FROM user_recipes WHERE libraryId = ?', id);
  await db.runAsync('DELETE FROM user_recipe_libraries WHERE id = ?', id);
}

export async function listUserRecipes(libraryId?: string): Promise<UserRecipe[]> {
  const db = await getDatabase();
  const rows = libraryId
    ? await db.getAllAsync<UserRecipeRow>(
    `SELECT id, libraryId, title, description, mainIngredients, seasonings, steps, tags,
                estimatedTimeMinutes, difficulty, sourceType, sourceUrl, enabled, createdAt, updatedAt
         FROM user_recipes
         WHERE libraryId = ?
         ORDER BY updatedAt DESC`,
        libraryId,
      )
    : await db.getAllAsync<UserRecipeRow>(
        `SELECT id, libraryId, title, description, mainIngredients, seasonings, steps, tags,
                estimatedTimeMinutes, difficulty, sourceType, sourceUrl, enabled, createdAt, updatedAt
         FROM user_recipes
         ORDER BY updatedAt DESC`,
      );

  return rows.map(toUserRecipe);
}

export async function listEnabledUserRecipesAsRecipes(): Promise<Recipe[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<UserRecipeRow>(
    `SELECT recipes.id, recipes.libraryId, recipes.title, recipes.description, recipes.mainIngredients,
            recipes.seasonings, recipes.steps, recipes.tags, recipes.estimatedTimeMinutes,
            recipes.difficulty, recipes.sourceType, recipes.sourceUrl, recipes.enabled, recipes.createdAt, recipes.updatedAt
     FROM user_recipes recipes
     INNER JOIN user_recipe_libraries libraries ON libraries.id = recipes.libraryId
     WHERE libraries.enabled = 1 AND recipes.enabled = 1
     ORDER BY recipes.updatedAt DESC`,
  );

  return rows.map((row) => userRecipeToRecipe(toUserRecipe(row)));
}

export async function listEnabledUserRecipesWithLibraries(): Promise<UserRecipeWithLibrary[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<UserRecipeWithLibraryRow>(
    `SELECT recipes.id, recipes.libraryId, recipes.title, recipes.description, recipes.mainIngredients,
            recipes.seasonings, recipes.steps, recipes.tags, recipes.estimatedTimeMinutes,
            recipes.difficulty, recipes.sourceType, recipes.sourceUrl, recipes.enabled, recipes.createdAt, recipes.updatedAt,
            libraries.name AS libraryName, libraries.enabled AS libraryEnabled
     FROM user_recipes recipes
     INNER JOIN user_recipe_libraries libraries ON libraries.id = recipes.libraryId
     WHERE libraries.enabled = 1 AND recipes.enabled = 1
     ORDER BY recipes.updatedAt DESC`,
  );

  return rows.map(toUserRecipeWithLibrary);
}

export async function getUserRecipeWithLibraryById(id: string): Promise<UserRecipeWithLibrary | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<UserRecipeWithLibraryRow>(
    `SELECT recipes.id, recipes.libraryId, recipes.title, recipes.description, recipes.mainIngredients,
            recipes.seasonings, recipes.steps, recipes.tags, recipes.estimatedTimeMinutes,
            recipes.difficulty, recipes.sourceType, recipes.sourceUrl, recipes.enabled, recipes.createdAt, recipes.updatedAt,
            libraries.name AS libraryName, libraries.enabled AS libraryEnabled
     FROM user_recipes recipes
     INNER JOIN user_recipe_libraries libraries ON libraries.id = recipes.libraryId
     WHERE recipes.id = ?`,
    id,
  );

  return row ? toUserRecipeWithLibrary(row) : null;
}

export async function getUserRecipeById(id: string): Promise<UserRecipe | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<UserRecipeRow>(
    `SELECT id, libraryId, title, description, mainIngredients, seasonings, steps, tags,
            estimatedTimeMinutes, difficulty, sourceType, sourceUrl, enabled, createdAt, updatedAt
     FROM user_recipes
     WHERE id = ?`,
    id,
  );

  return row ? toUserRecipe(row) : null;
}

export async function addUserRecipe(draft: UserRecipeDraft): Promise<UserRecipe> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const recipe: UserRecipe = {
    ...normalizeUserRecipeDraft(draft),
    id: createLocalId('user_recipe'),
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };

  await db.runAsync(
    `INSERT INTO user_recipes
       (id, libraryId, title, description, mainIngredients, seasonings, steps, tags,
        estimatedTimeMinutes, difficulty, sourceType, sourceUrl, enabled, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    recipe.id,
    recipe.libraryId,
    recipe.title,
    recipe.description,
    JSON.stringify(recipe.mainIngredients),
    JSON.stringify(recipe.seasonings),
    JSON.stringify(recipe.steps),
    JSON.stringify(recipe.tags),
    recipe.estimatedTimeMinutes,
    recipe.difficulty,
    recipe.sourceType,
    recipe.sourceUrl,
    1,
    recipe.createdAt,
    recipe.updatedAt,
  );

  await touchUserRecipeLibrary(recipe.libraryId);
  return recipe;
}

export async function updateUserRecipe(id: string, draft: UserRecipeDraft): Promise<void> {
  const existing = await getUserRecipeById(id);
  const db = await getDatabase();
  const recipe = normalizeUserRecipeDraft(draft);
  const updatedAt = new Date().toISOString();

  await db.runAsync(
    `UPDATE user_recipes
     SET libraryId = ?, title = ?, description = ?, mainIngredients = ?, seasonings = ?,
         steps = ?, tags = ?, estimatedTimeMinutes = ?, difficulty = ?, sourceType = ?,
         sourceUrl = ?, updatedAt = ?
     WHERE id = ?`,
    recipe.libraryId,
    recipe.title,
    recipe.description,
    JSON.stringify(recipe.mainIngredients),
    JSON.stringify(recipe.seasonings),
    JSON.stringify(recipe.steps),
    JSON.stringify(recipe.tags),
    recipe.estimatedTimeMinutes,
    recipe.difficulty,
    recipe.sourceType,
    recipe.sourceUrl,
    updatedAt,
    id,
  );

  await touchUserRecipeLibrary(recipe.libraryId);
  if (existing && existing.libraryId !== recipe.libraryId) {
    await touchUserRecipeLibrary(existing.libraryId);
  }
}

export async function deleteUserRecipe(id: string): Promise<void> {
  const existing = await getUserRecipeById(id);
  const db = await getDatabase();
  await db.runAsync('DELETE FROM personal_recipe_embeddings WHERE recipeId = ?', id);
  await db.runAsync('DELETE FROM user_recipes WHERE id = ?', id);
  if (existing) {
    await touchUserRecipeLibrary(existing.libraryId);
  }
}

export async function deleteUserRecipes(ids: string[]): Promise<void> {
  const uniqueIds = uniqueNonEmpty(ids);
  if (uniqueIds.length === 0) {
    return;
  }

  const recipes = await Promise.all(uniqueIds.map(getUserRecipeById));
  const libraryIds = Array.from(new Set(recipes.map((recipe) => recipe?.libraryId).filter((id): id is string => Boolean(id))));
  const db = await getDatabase();
  const placeholders = uniqueIds.map(() => '?').join(', ');

  await db.runAsync(`DELETE FROM personal_recipe_embeddings WHERE recipeId IN (${placeholders})`, ...uniqueIds);
  await db.runAsync(`DELETE FROM user_recipes WHERE id IN (${placeholders})`, ...uniqueIds);

  for (const libraryId of libraryIds) {
    await touchUserRecipeLibrary(libraryId);
  }
}

export async function setUserRecipesEnabled(ids: string[], enabled: boolean): Promise<void> {
  const uniqueIds = uniqueNonEmpty(ids);
  if (uniqueIds.length === 0) {
    return;
  }

  const recipes = await Promise.all(uniqueIds.map(getUserRecipeById));
  const libraryIds = Array.from(new Set(recipes.map((recipe) => recipe?.libraryId).filter((id): id is string => Boolean(id))));
  const db = await getDatabase();
  const placeholders = uniqueIds.map(() => '?').join(', ');

  await db.runAsync(`UPDATE user_recipes SET enabled = ? WHERE id IN (${placeholders})`, enabled ? 1 : 0, ...uniqueIds);

  for (const libraryId of libraryIds) {
    await touchUserRecipeLibrary(libraryId);
  }
}

export function userRecipeToRecipe(recipe: UserRecipe): Recipe {
  return {
    id: recipe.id,
    title: recipe.title,
    mainIngredients: recipe.mainIngredients,
    seasonings: recipe.seasonings,
    steps: recipe.steps,
    tags: recipe.tags,
  };
}

async function touchUserRecipeLibrary(id: string) {
  const db = await getDatabase();
  await db.runAsync('UPDATE user_recipe_libraries SET updatedAt = ? WHERE id = ?', new Date().toISOString(), id);
}

function normalizeUserRecipeDraft(draft: UserRecipeDraft): UserRecipeDraft {
  return {
    libraryId: draft.libraryId,
    title: normalizeText(draft.title) || '未命名菜谱',
    description: normalizeText(draft.description),
    mainIngredients: normalizeStringArray(draft.mainIngredients),
    seasonings: normalizeStringArray(draft.seasonings),
    steps: normalizeStringArray(draft.steps),
    tags: normalizeStringArray(draft.tags),
    estimatedTimeMinutes:
      draft.estimatedTimeMinutes && Number.isFinite(draft.estimatedTimeMinutes) && draft.estimatedTimeMinutes > 0
        ? Math.round(draft.estimatedTimeMinutes)
        : null,
    difficulty: normalizeDifficulty(draft.difficulty),
    sourceType: normalizeSourceType(draft.sourceType),
    sourceUrl: normalizeText(draft.sourceUrl),
  };
}

function toUserRecipeLibrary(row: UserRecipeLibraryRow): UserRecipeLibrary {
  return {
    id: row.id,
    name: row.name,
    enabled: Number(row.enabled) === 1,
    recipeCount: Number(row.recipeCount) || 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toUserRecipe(row: UserRecipeRow): UserRecipe {
  return {
    id: row.id,
    libraryId: row.libraryId,
    title: row.title,
    description: row.description,
    mainIngredients: parseStringArray(row.mainIngredients),
    seasonings: parseStringArray(row.seasonings),
    steps: parseStringArray(row.steps),
    tags: parseStringArray(row.tags),
    estimatedTimeMinutes: normalizeNullableNumber(row.estimatedTimeMinutes),
    difficulty: normalizeDifficulty(row.difficulty),
    sourceType: normalizeSourceType(row.sourceType),
    sourceUrl: row.sourceUrl,
    enabled: Number(row.enabled) !== 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toUserRecipeWithLibrary(row: UserRecipeWithLibraryRow): UserRecipeWithLibrary {
  return {
    ...toUserRecipe(row),
    libraryName: row.libraryName,
    libraryEnabled: Number(row.libraryEnabled) === 1,
  };
}

function normalizeStringArray(values: string[]) {
  return values.map(normalizeText).filter((item) => item.length > 0);
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeDifficulty(value: unknown): UserRecipeDifficulty {
  return value === '简单' || value === '中等' || value === '偏难' || value === '未知' ? value : '未知';
}

function normalizeSourceType(value: unknown): UserRecipeSourceType {
  return value === 'youtube' || value === 'text' || value === 'manual' ? value : 'manual';
}

function normalizeNullableNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : null;
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function uniqueNonEmpty(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
