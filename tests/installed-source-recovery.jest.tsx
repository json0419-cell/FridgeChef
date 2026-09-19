import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render } from '@testing-library/react-native';
import { DatasetLibraryScreen } from '../src/features/datasets/screens/DatasetLibraryScreen';
import { DATASET_REGISTRY_KEY } from '../src/datasets/dataset-registry-store';
import { I18nProvider } from '../src/i18n/i18n';
import { AppFeedbackProvider } from '../src/shared/components';

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
jest.mock('../src/db/userRecipesRepository', () => ({
  listUserRecipeLibraries: async () => [],
  listUserRecipes: async () => [],
}));
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

const corruptRegistry = '[{"id":"official-lite","manifestUri":"file:///private/path"';

describe('unreadable installed-source registry', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('chi_shen_me.language', 'en');
  });

  it('shows retry guidance with safe diagnostics, blocks installs, and preserves stored bytes', async () => {
    await AsyncStorage.setItem(DATASET_REGISTRY_KEY, corruptRegistry);
    const navigation = { navigate: jest.fn(), setOptions: jest.fn() };

    const screen = await render(
      <I18nProvider>
        <AppFeedbackProvider>
          <DatasetLibraryScreen navigation={navigation as never} route={{ key: 'DatasetLibrary', name: 'DatasetLibrary' } as never} />
        </AppFeedbackProvider>
      </I18nProvider>,
    );

    expect(await screen.findByText('Installed libraries and models could not be read')).toBeTruthy();
    const diagnostic = screen.getByText(/REGISTRY_CORRUPT_JSON/);
    expect(diagnostic.props.selectable).toBe(true);
    expect(diagnostic.props.children).toContain('Category: datasetRegistry');
    expect(diagnostic.props.children).not.toContain('file:///');

    const download = await screen.findByRole('button', { name: 'Download' });
    expect(download.props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/REGISTRY_CORRUPT_JSON/)).toBeTruthy();
    expect(await AsyncStorage.getItem(DATASET_REGISTRY_KEY)).toBe(corruptRegistry);
  });
});
