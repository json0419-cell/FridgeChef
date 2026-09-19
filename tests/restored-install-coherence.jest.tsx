import AsyncStorage from '@react-native-async-storage/async-storage';
import { DATASET_REGISTRY_KEY } from '../src/datasets/dataset-registry-store';
import { DatasetLibraryScreen } from '../src/features/datasets/screens/DatasetLibraryScreen';
import { loadRecommendationReadiness } from '../src/features/recommendations/recommendation-readiness';
import { EMBEDDING_MODEL_REGISTRY_KEY } from '../src/rag/model/model-registry-store';
import { renderWithAppProviders } from './support/app-providers';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return { useFocusEffect: (effect: () => void) => useEffect(effect, [effect]) };
});
jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Icon = (props: object) => React.createElement(View, props);
  return { RefreshCw: Icon, SlidersHorizontal: Icon };
});
// A restore brings the registries back but none of the files they name.
jest.mock('expo-file-system', () => {
  class Missing {
    readonly exists = false;
  }
  return { Directory: Missing, File: Missing, Paths: { document: 'file:///files/' } };
});
jest.mock('../src/db/userRecipesRepository', () => ({
  listUserRecipeLibraries: async () => [{ id: 'library-1', enabled: true }],
  listUserRecipes: async () => [{ id: 'recipe-1' }],
  listEnabledUserRecipesWithLibraries: async () => [{ id: 'recipe-1' }],
}));
jest.mock('../src/db/recipesRepository', () => ({ listRecipes: async () => [{ id: 'base-1' }] }));
jest.mock('../src/privacy/ai-data-consent', () => ({ hasAiDataConsent: async () => true }));
jest.mock('../src/storage/settingsStorage', () => ({ hasVerifiedApiKey: async () => false }));
jest.mock('../src/datasets/datasetIndex', () => ({
  OFFICIAL_DATASET_INDEX_URL: 'https://example.com/index.json',
  fetchDatasetIndex: async () => ({
    datasets: [{ id: 'official-lite', name: 'Official Lite', recipeCount: 300, sizeBytes: 1024 }],
  }),
  resolveDatasetManifestUrl: () => 'https://example.com/manifest.json',
}));
jest.mock('../src/datasets/datasetPack', () => ({
  downloadDatasetPack: jest.fn(),
  uninstallDataset: jest.fn(),
}));

const customPack = {
  id: 'custom-pack',
  name: 'Custom Pack',
  version: '1.0.0',
  description: 'Unverified pack installed from a URL',
  level: 'custom',
  recipeCount: 12,
  chunkCount: 40,
  localRootUri: 'file:///files/datasets/custom-pack_1.0.0/',
  manifestUri: 'file:///files/datasets/custom-pack_1.0.0/dataset-pack.json',
  installedAt: '2026-09-01T00:00:00.000Z',
  active: true,
  status: 'installed',
  sizeBytes: 512,
  embeddingModel: 'bge-m3',
  embeddingDimension: 1024,
};

const restoredDatasetRegistry = JSON.stringify({
  version: 2,
  records: [
    customPack,
    {
      id: 'official-lite',
      name: 'Official Lite',
      version: '1.0.0',
      description: 'Official pack',
      level: 'lite',
      recipeCount: 300,
      chunkCount: 900,
      localRootUri: 'file:///files/datasets/official-lite_1.0.0/',
      manifestUri: 'file:///files/datasets/official-lite_1.0.0/dataset-pack.json',
      installedAt: '2026-09-01T00:00:00.000Z',
      active: true,
      status: 'installed',
      sizeBytes: 1024,
      embeddingModel: 'bge-m3',
      embeddingDimension: 1024,
    },
  ],
});

const restoredModelRegistry = JSON.stringify({
  version: 2,
  records: [
    {
      id: 'bge-m3',
      name: 'BGE-M3',
      version: '1.0.0',
      description: 'Embedding model',
      localRootUri: 'file:///files/models/bge-m3_1.0.0/',
      manifestUri: 'file:///files/models/bge-m3_1.0.0/model-pack.json',
      installedAt: '2026-09-01T00:00:00.000Z',
      active: true,
      sizeBytes: 2048,
      modelName: 'BAAI/bge-m3',
      dimension: 1024,
      maxLength: 512,
      testEmbeddingVerifiedAt: '2026-09-01T00:01:00.000Z',
    },
  ],
});

describe('an install restored without its model and pack files', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('chi_shen_me.language', 'en');
    await AsyncStorage.setItem(DATASET_REGISTRY_KEY, restoredDatasetRegistry);
    await AsyncStorage.setItem(EMBEDDING_MODEL_REGISTRY_KEY, restoredModelRegistry);
  });

  it('offers the pack as not installed, keeps personal data, and never asks for registry recovery', async () => {
    const navigation = { navigate: jest.fn(), setOptions: jest.fn() };

    const screen = await renderWithAppProviders(
      <DatasetLibraryScreen navigation={navigation as never} route={{ key: 'DatasetLibrary', name: 'DatasetLibrary' } as never} />,
    );

    // Personal Recipes and their libraries came back with ordinary storage and are untouched.
    expect(await screen.findByText(/1 personal libraries · 1 custom recipes/)).toBeTruthy();

    const download = await screen.findByRole('button', { name: 'Download' });
    expect(download.props.accessibilityState.disabled).toBe(false);
    expect(screen.queryByText('Installed libraries and models could not be read')).toBeNull();
    expect(screen.queryByText(/REGISTRY_/)).toBeNull();
    expect(screen.queryByText('Enabled')).toBeNull();
    // Reporting a pack as not installed rewrites nothing: the record is still there to reinstall over.
    expect(await AsyncStorage.getItem(DATASET_REGISTRY_KEY)).toBe(restoredDatasetRegistry);
    expect(await AsyncStorage.getItem(EMBEDDING_MODEL_REGISTRY_KEY)).toBe(restoredModelRegistry);
  });

  it('keeps a restored Unverified DatasetPack reachable instead of stranding its record', async () => {
    const navigation = { navigate: jest.fn(), setOptions: jest.fn() };

    const screen = await renderWithAppProviders(
      <DatasetLibraryScreen navigation={navigation as never} route={{ key: 'DatasetLibrary', name: 'DatasetLibrary' } as never} />,
    );

    // It has no catalogue entry to reappear in, so the library lists it as not installed and says why.
    expect(await screen.findByText('Custom Pack')).toBeTruthy();
    expect(screen.getByText(/backups do not include library files/)).toBeTruthy();
    // It cannot be enabled or disabled while its files are gone, but its record can still be cleared.
    expect(screen.queryByRole('button', { name: 'Disable' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
  });

  it('is not Recommendation Ready until the key is re-entered and the model reinstalled', async () => {
    expect(await loadRecommendationReadiness()).toEqual({
      consentReady: true,
      credentialReady: false,
      modelReady: false,
      // The Base Recipe Library ships with the app, so a recipe source survives the restore.
      sourceReady: true,
      ready: false,
    });
  });
});
