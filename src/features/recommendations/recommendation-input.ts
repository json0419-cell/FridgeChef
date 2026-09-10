import { listInstalledDatasets } from '../../datasets/datasetRegistry';
import { getRecentCookedRecipeIds } from '../../db/cookedHistoryRepository';
import { listIngredients } from '../../db/ingredientsRepository';
import { listUserRecipeLibraries } from '../../db/userRecipesRepository';
import { getSettings } from '../../storage/settingsStorage';
import type { AppSettings, Ingredient, InstalledDataset, UserRecipeLibrary } from '../../types';

export async function getRecommendationInputSnapshot(language: 'zh' | 'en', extraPreference = '') {
  const settings = await getSettings();
  const [ingredients, recentCookedRecipeIds, datasets, libraries] = await Promise.all([
    listIngredients(),
    getRecentCookedRecipeIds(settings.recentHistoryDays),
    listInstalledDatasets(),
    listUserRecipeLibraries(),
  ]);

  return {
    settings,
    ingredients,
    recentCookedRecipeIds,
    inputSignature: buildRecommendationInputSignature({
      language,
      settings,
      ingredients,
      recentCookedRecipeIds,
      datasets,
      libraries,
      extraPreference,
    }),
  };
}

export function buildRecommendationInputSignature({
  language,
  settings,
  ingredients,
  recentCookedRecipeIds,
  datasets,
  libraries,
  extraPreference,
}: {
  language: 'zh' | 'en';
  settings: AppSettings;
  ingredients: Ingredient[];
  recentCookedRecipeIds: Set<string>;
  datasets: InstalledDataset[];
  libraries: UserRecipeLibrary[];
  extraPreference: string;
}) {
  const activeDatasets = datasets
    .filter((item) => item.active)
    .map((item) => ({
      id: item.id,
      version: item.version,
      recipeCount: item.recipeCount,
      chunkCount: item.chunkCount,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return JSON.stringify({
    language,
    extraPreference: normalizeRecommendationSignatureText(extraPreference),
    settings: {
      servings: settings.servings,
      dietaryPreferences: normalizeRecommendationSignatureText(settings.dietaryPreferences),
      maxTimeMinutes: settings.maxTimeMinutes ?? null,
      preferredDifficulty: settings.preferredDifficulty,
      recentHistoryDays: settings.recentHistoryDays,
    },
    ingredients: ingredients
      .map((item) => ({
        id: item.id,
        name: normalizeRecommendationSignatureText(item.name),
        quantity: item.quantity,
        unit: normalizeRecommendationSignatureText(item.unit),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    recentCookedRecipeIds: Array.from(recentCookedRecipeIds).sort(),
    activeDatasets,
    enabledPersonalLibraries: libraries
      .filter((item) => item.enabled)
      .map((item) => ({
        id: item.id,
        recipeCount: item.recipeCount,
        updatedAt: item.updatedAt,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
}

export function normalizeRecommendationSignatureText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
