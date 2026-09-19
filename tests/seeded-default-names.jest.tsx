// A Personal Recipe Library the app named itself must read in the language the user is reading
// now, however the row was written; a library the user named must read exactly as they typed it.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { UserRecipeLibrariesScreen } from '../src/features/recipes/screens/UserRecipeLibrariesScreen';
import { renderWithAppProviders } from './support/app-providers';
import { listUserRecipeLibraries } from '../src/db/userRecipesRepository';
import { SEEDED_DEFAULT_MARKER } from '../src/db/seeded-defaults';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../src/db/userRecipesRepository', () => ({
  createUserRecipeLibrary: jest.fn(async () => undefined),
  deleteUserRecipeLibrary: jest.fn(async () => undefined),
  listUserRecipeLibraries: jest.fn(async () => []),
  listUserRecipes: jest.fn(async () => []),
  setUserRecipeLibraryEnabled: jest.fn(async () => undefined),
}));

const Stack = createNativeStackNavigator();

const APP_NAMED_LIBRARY = {
  id: 'library-1',
  name: SEEDED_DEFAULT_MARKER,
  enabled: true,
  recipeCount: 2,
  createdAt: '2026-09-16T12:00:00.000Z',
  updatedAt: '2026-09-16T12:00:00.000Z',
};

const USER_NAMED_LIBRARY = {
  ...APP_NAMED_LIBRARY,
  id: 'library-2',
  name: 'Weeknight dinners',
};

async function renderLibraries(language: 'en' | 'zh') {
  await AsyncStorage.setItem('chi_shen_me.language', language);
  return renderWithAppProviders(
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="UserRecipeLibraries" component={UserRecipeLibrariesScreen as never} />
      </Stack.Navigator>
    </NavigationContainer>,
  );
}

describe('names the app chose for the user', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('reads the default Personal Recipe Library in English', async () => {
    jest.mocked(listUserRecipeLibraries).mockResolvedValue([APP_NAMED_LIBRARY]);

    const screen = await renderLibraries('en');

    expect(await screen.findByText('My Recipe Library')).toBeTruthy();
    expect(screen.queryByText('我的菜谱库')).toBeNull();
  });

  it('reads the same default Personal Recipe Library in Chinese', async () => {
    jest.mocked(listUserRecipeLibraries).mockResolvedValue([APP_NAMED_LIBRARY]);

    const screen = await renderLibraries('zh');

    // The page heading carries the same words, so the library card is the second occurrence.
    expect(await screen.findAllByText('我的菜谱库')).toHaveLength(2);
    expect(screen.queryByText('My Recipe Library')).toBeNull();
  });

  it('leaves a library the user named alone in both languages', async () => {
    jest.mocked(listUserRecipeLibraries).mockResolvedValue([USER_NAMED_LIBRARY]);

    const english = await renderLibraries('en');
    expect(await english.findByText('Weeknight dinners')).toBeTruthy();
    expect(english.queryByText('My Recipe Library')).toBeNull();

    const chinese = await renderLibraries('zh');
    expect(await chinese.findByText('Weeknight dinners')).toBeTruthy();
    // Only the page heading, never the library card.
    expect(chinese.getAllByText('我的菜谱库')).toHaveLength(1);
  });
});
