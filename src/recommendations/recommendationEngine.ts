import type { Ingredient, Recipe, RecipeRecommendation } from '../types';

export function calculateRecommendations(
  ingredients: Ingredient[],
  recipes: Recipe[],
  limit = 5,
): RecipeRecommendation[] {
  const storageNames = ingredients.map((item) => normalizeName(item.name)).filter(Boolean);

  return recipes
    .map((recipe) => scoreRecipe(recipe, storageNames))
    .sort((a, b) => b.finalScore - a.finalScore || a.recipe.title.localeCompare(b.recipe.title, 'zh-Hans-CN'))
    .slice(0, limit);
}

function scoreRecipe(recipe: Recipe, storageNames: string[]): RecipeRecommendation {
  const matchedMainIngredients = recipe.mainIngredients.filter((name) => hasIngredient(storageNames, name));
  const missingMainIngredients = recipe.mainIngredients.filter((name) => !hasIngredient(storageNames, name));
  const matchedSeasonings = recipe.seasonings.filter((name) => hasIngredient(storageNames, name));
  const missingSeasonings = recipe.seasonings.filter((name) => !hasIngredient(storageNames, name));

  const mainScore =
    recipe.mainIngredients.length === 0 ? 1 : matchedMainIngredients.length / recipe.mainIngredients.length;
  const seasoningScore = recipe.seasonings.length === 0 ? 1 : matchedSeasonings.length / recipe.seasonings.length;
  const finalScore = mainScore * 0.85 + seasoningScore * 0.15;

  return {
    recipe,
    finalScore,
    mainScore,
    seasoningScore,
    matchedIngredients: [...matchedMainIngredients, ...matchedSeasonings],
    missingMainIngredients,
    missingSeasonings,
    reason: buildReason(finalScore, matchedMainIngredients, missingMainIngredients, missingSeasonings),
  };
}

function hasIngredient(storageNames: string[], recipeIngredient: string) {
  const target = normalizeName(recipeIngredient);
  return storageNames.some((name) => name === target || name.includes(target) || target.includes(name));
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, '').toLowerCase();
}

function buildReason(
  finalScore: number,
  matchedMainIngredients: string[],
  missingMainIngredients: string[],
  missingSeasonings: string[],
) {
  const percentage = Math.round(finalScore * 100);

  if (missingMainIngredients.length === 0) {
    return `主食材已齐，匹配度 ${percentage}%。${missingSeasonings.length > 0 ? '只需补少量调料。' : '调料也基本齐全。'}`;
  }

  if (matchedMainIngredients.length > 0) {
    return `已有 ${matchedMainIngredients.join('、')}，补齐 ${missingMainIngredients.join('、')} 后就能做。`;
  }

  return `匹配度 ${percentage}%，当前缺少主要食材较多。`;
}
