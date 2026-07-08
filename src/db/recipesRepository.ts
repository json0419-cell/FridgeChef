import { getDatabase } from './database';
import { getUserRecipeById, userRecipeToRecipe } from './userRecipesRepository';
import type { Recipe } from '../types';

interface RecipeRow {
  id: string;
  title: string;
  mainIngredients: string;
  seasonings: string;
  steps: string;
  tags: string;
}

export async function listRecipes(): Promise<Recipe[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<RecipeRow>(
    'SELECT id, title, mainIngredients, seasonings, steps, tags FROM recipes ORDER BY id ASC',
  );

  return rows.map(toRecipe);
}

export async function getRecipeById(id: string): Promise<Recipe | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<RecipeRow>(
    'SELECT id, title, mainIngredients, seasonings, steps, tags FROM recipes WHERE id = ?',
    id,
  );

  if (row) {
    return toRecipe(row);
  }

  const userRecipe = await getUserRecipeById(id);
  return userRecipe ? userRecipeToRecipe(userRecipe) : null;
}

function toRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    title: row.title,
    mainIngredients: parseStringArray(row.mainIngredients),
    seasonings: parseStringArray(row.seasonings),
    steps: parseStringArray(row.steps),
    tags: parseStringArray(row.tags),
  };
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}
