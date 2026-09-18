import type { Directory } from 'expo-file-system';
import { getDatasetsRootDirectory } from '../datasets/datasetPack';
import { clearInstalledDatasetRegistry } from '../datasets/datasetRegistry';
import { removeInstalledArtifact } from '../downloads/installed-artifact-removal';
import { removePartialDownloads, type RemovableEntry } from '../downloads/temporary-download-artifacts';
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
    // Partial downloads are regenerable too: a download restarts or resumes from scratch.
    removePartialDownloads(listDownloadRootEntries());
  },
  ingredients: clearIngredientData,
  history: clearCookingHistoryData,
  personalRecipes: clearPersonalRecipeData,
  downloadedPacks: () =>
    removeInstalledArtifact({
      removeRecord: clearInstalledDatasetRegistry,
      deleteArtifactFiles: () => deleteKnownRoot(getDatasetsRootDirectory()),
    }),
  model: () =>
    removeInstalledArtifact({
      removeRecord: clearInstalledEmbeddingModelRegistry,
      deleteArtifactFiles: () => deleteKnownRoot(getModelsRootDirectory()),
    }),
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

function listDownloadRootEntries(): RemovableEntry[] {
  return [getDatasetsRootDirectory(), getModelsRootDirectory()].flatMap((root) =>
    root.exists ? root.list() : [],
  );
}
