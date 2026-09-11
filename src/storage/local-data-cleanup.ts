import type { Directory } from 'expo-file-system';
import { getDatasetsRootDirectory } from '../datasets/datasetPack';
import { clearInstalledDatasetRegistry } from '../datasets/datasetRegistry';
import {
  clearCachedDatabaseData,
  clearCookingHistoryData,
  clearIngredientData,
  clearPersonalRecipeData,
} from '../db/local-data-repository';
import { clearStoredLanguagePreference } from '../i18n/i18n';
import { revokeAiDataConsent } from '../privacy/ai-data-consent';
import { getModelsRootDirectory } from '../rag/model/modelPack';
import { clearInstalledEmbeddingModelRegistry } from '../rag/model/modelRegistry';
import { clearRecommendationCache } from './recommendationCacheStorage';
import { clearRecommendationRequestTags } from './recommendationTagStorage';
import { clearApiKey, clearSettings } from './settingsStorage';
import { createDataCleanupRunner, type DataCleanupCategory } from './data-cleanup-policy';

const runCleanup = createDataCleanupRunner({
  caches: async () => {
    await clearCachedDatabaseData();
    await clearRecommendationCache();
  },
  ingredients: clearIngredientData,
  history: clearCookingHistoryData,
  personalRecipes: clearPersonalRecipeData,
  downloadedPacks: async () => {
    deleteKnownRoot(getDatasetsRootDirectory());
    await clearInstalledDatasetRegistry();
  },
  model: async () => {
    deleteKnownRoot(getModelsRootDirectory());
    await clearInstalledEmbeddingModelRegistry();
  },
  apiKey: () => clearApiKey('gemini'),
  preferences: async () => {
    await Promise.all([
      clearSettings(),
      clearRecommendationRequestTags(),
      revokeAiDataConsent(),
      clearStoredLanguagePreference(),
    ]);
  },
});

export async function clearLocalData(category: DataCleanupCategory): Promise<void> {
  await runCleanup(category);
}

function deleteKnownRoot(directory: Directory) {
  if (directory.exists) {
    directory.delete();
  }
}
