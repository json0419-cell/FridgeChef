// The scoped-deletion orderings and the partial-download sweep are unit-tested in
// tests/installed-artifact-removal.test.ts and tests/temporary-download-artifacts.test.ts. This
// suite pins the wiring in src/storage/local-data-cleanup.ts: that each category reaches the right
// stores in the right order, and that no category touches another category's data.

import { clearLocalData } from '../src/storage/local-data-cleanup';
import {
  backupDirectoryName,
  resumableStagingDirectoryName,
  stagingDirectoryName,
} from '../src/downloads/temporary-download-artifacts';

interface FakeDirectory {
  name: string;
  exists: boolean;
  deleted: boolean;
  entries: FakeDirectory[];
}

const mockCalls: string[] = [];
const mockRoots = { datasets: createRoot('datasets'), models: createRoot('models') };
const mockFailures = { datasetRegistry: false, modelRegistry: false };
const mockNames = {
  datasetStaging: stagingDirectoryName('official-lite_1.0.0'),
  modelStaging: resumableStagingDirectoryName('bge-m3_1.0.0'),
  datasetBackup: backupDirectoryName('official-full_2.11.3'),
};

jest.mock('../src/datasets/datasetPack', () => ({
  getDatasetsRootDirectory: () => mockRoots.datasets,
}));
jest.mock('../src/rag/model/modelPack', () => ({
  getModelsRootDirectory: () => mockRoots.models,
}));
jest.mock('../src/datasets/datasetRegistry', () => ({
  clearInstalledDatasetRegistry: async () => {
    mockCalls.push('datasetRegistry');
    if (mockFailures.datasetRegistry) {
      throw new Error('Injected dataset registry failure');
    }
  },
}));
jest.mock('../src/rag/model/modelRegistry', () => ({
  clearInstalledEmbeddingModelRegistry: async () => {
    mockCalls.push('modelRegistry');
    if (mockFailures.modelRegistry) {
      throw new Error('Injected model registry failure');
    }
  },
}));
jest.mock('../src/db/local-data-repository', () => ({
  clearCachedDatabaseData: async () => void mockCalls.push('cachedDatabaseData'),
  clearCookingHistoryData: async () => void mockCalls.push('cookingHistoryData'),
  clearIngredientData: async () => void mockCalls.push('ingredientData'),
  clearPersonalRecipeData: async () => void mockCalls.push('personalRecipeData'),
}));
jest.mock('../src/storage/recommendationCacheStorage', () => ({
  clearRecommendationCache: async () => void mockCalls.push('recommendationCache'),
}));
jest.mock('../src/storage/recommendationTagStorage', () => ({
  clearRecommendationRequestTags: async () => void mockCalls.push('recommendationTags'),
}));
jest.mock('../src/storage/settingsStorage', () => ({
  clearApiKey: async () => void mockCalls.push('apiKey'),
  clearSettings: async () => void mockCalls.push('settings'),
}));
jest.mock('../src/privacy/ai-data-consent', () => ({
  revokeAiDataConsent: async () => void mockCalls.push('aiDataConsent'),
}));
jest.mock('../src/i18n/i18n', () => ({
  clearStoredLanguagePreference: async () => void mockCalls.push('languagePreference'),
}));

describe('local data cleanup wiring', () => {
  beforeEach(() => {
    mockCalls.length = 0;
    mockFailures.datasetRegistry = false;
    mockFailures.modelRegistry = false;
    mockRoots.datasets = createRoot('datasets', [
      installed('official-lite_1.0.0'),
      installed(mockNames.datasetStaging),
      installed(mockNames.datasetBackup),
    ]);
    mockRoots.models = createRoot('models', [installed('bge-m3_1.0.0'), installed(mockNames.modelStaging)]);
  });

  it('clears caches, sweeps partial downloads in both download roots, and keeps installed packs', async () => {
    await clearLocalData('caches');

    expect(mockCalls).toEqual(['cachedDatabaseData', 'recommendationCache']);
    expect(deletedNames()).toEqual([mockNames.datasetStaging, mockNames.modelStaging]);
    expect(mockRoots.datasets.deleted).toBe(false);
    expect(mockRoots.models.deleted).toBe(false);
  });

  it.each([
    ['downloadedPacks', 'datasetRegistry', 'datasets'],
    ['model', 'modelRegistry', 'models'],
  ] as const)('clears the %s registry before deleting its files', async (category, registry, root) => {
    await clearLocalData(category);

    expect(mockCalls).toEqual([registry]);
    expect(mockRoots[root].deleted).toBe(true);
    expect(mockRoots[root === 'datasets' ? 'models' : 'datasets'].deleted).toBe(false);
  });

  it.each([
    ['downloadedPacks', 'datasetRegistry', 'datasets'],
    ['model', 'modelRegistry', 'models'],
  ] as const)('deletes no %s file when its registry cannot be cleared', async (category, registry, root) => {
    mockFailures[registry] = true;

    await expect(clearLocalData(category)).rejects.toThrow(/Injected/);

    expect(mockRoots[root].deleted).toBe(false);
    expect(deletedNames()).toEqual([]);
  });

  it.each([
    ['ingredients', 'ingredientData'],
    ['history', 'cookingHistoryData'],
    ['personalRecipes', 'personalRecipeData'],
    ['apiKey', 'apiKey'],
  ] as const)('limits the %s action to its own store', async (category, expected) => {
    await clearLocalData(category);

    expect(mockCalls).toEqual([expected]);
    expect(mockRoots.datasets.deleted).toBe(false);
    expect(mockRoots.models.deleted).toBe(false);
    expect(deletedNames()).toEqual([]);
  });

  it('clears every category and ordinary preferences for all user data', async () => {
    await clearLocalData('allUserData');

    expect(mockCalls).toEqual([
      'cachedDatabaseData',
      'recommendationCache',
      'ingredientData',
      'cookingHistoryData',
      'personalRecipeData',
      'datasetRegistry',
      'modelRegistry',
      'apiKey',
      'settings',
      'recommendationTags',
      'aiDataConsent',
      'languagePreference',
    ]);
    expect(mockRoots.datasets.deleted).toBe(true);
    expect(mockRoots.models.deleted).toBe(true);
  });
});

function deletedNames() {
  return [...mockRoots.datasets.entries, ...mockRoots.models.entries]
    .filter((entry) => entry.deleted)
    .map((entry) => entry.name);
}

function createRoot(name: string, entries: FakeDirectory[] = []): FakeDirectory {
  const root: FakeDirectory = {
    name,
    exists: true,
    deleted: false,
    entries,
  };
  return Object.assign(root, {
    list: () => root.entries,
    delete: () => {
      root.deleted = true;
      root.exists = false;
    },
  });
}

function installed(name: string): FakeDirectory {
  const entry: FakeDirectory = { name, exists: true, deleted: false, entries: [] };
  return Object.assign(entry, {
    delete: () => {
      entry.deleted = true;
      entry.exists = false;
    },
  });
}
