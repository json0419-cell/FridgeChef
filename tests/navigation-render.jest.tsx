import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { BackHandler } from 'react-native';
import App from '../src/application/App';
import { refineRagRecommendationsWithProvider } from '../src/ai/recommendationRefiner';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Icon = (props: object) => React.createElement(View, props);
  return {
    CheckCircle2: Icon,
    ChevronDown: Icon,
    ChevronRight: Icon,
    Circle: Icon,
    House: Icon,
    Refrigerator: Icon,
    Sparkles: Icon,
    UserRound: Icon,
  };
});

jest.mock('../src/db/database', () => ({ initializeDatabase: jest.fn(async () => undefined) }));

jest.mock('../src/features/home', () => {
  const { Text } = require('react-native');
  return { HomeScreen: () => <Text>Home destination</Text> };
});

jest.mock('../src/features/ingredients', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    FridgeScreen: ({ navigation }: { navigation: { navigate: (name: string) => void } }) => (
      <View>
        <Text>Fridge destination</Text>
        <Pressable accessibilityRole="button" onPress={() => navigation.navigate('AddIngredient')}>
          <Text>Open add ingredient</Text>
        </Pressable>
      </View>
    ),
    AddIngredientScreen: () => <Text>Add ingredient destination</Text>,
    ConfirmRecognizedFoodScreen: () => <Text>Confirm food destination</Text>,
  };
});

jest.mock('../src/features/my', () => {
  const { Text } = require('react-native');
  return { MyScreen: () => <Text>My destination</Text> };
});
jest.mock('../src/features/datasets', () => {
  const { Text } = require('react-native');
  return { DatasetLibraryScreen: () => <Text>Dataset library</Text> };
});
jest.mock('../src/features/history', () => {
  const { Text } = require('react-native');
  return { HistoryScreen: () => <Text>History</Text> };
});
jest.mock('../src/features/recipes', () => {
  const { Text } = require('react-native');
  return {
    AddUserRecipeScreen: () => <Text>Add recipe</Text>,
    RecipeDetailScreen: () => <Text>Recipe detail</Text>,
    UserRecipeLibrariesScreen: () => <Text>Recipe libraries</Text>,
    UserRecipeLibraryDetailScreen: () => <Text>Recipe library detail</Text>,
  };
});
jest.mock('../src/features/settings', () => {
  const { Text } = require('react-native');
  return {
    DataManagementScreen: () => <Text>Data management</Text>,
    PrivacyPolicyScreen: () => <Text>Privacy policy</Text>,
    SettingsScreen: () => <Text>Settings</Text>,
  };
});

jest.mock('../src/ai/recommendationRefiner', () => ({
  refineRagRecommendationsWithProvider: jest.fn(async () => []),
}));
jest.mock('../src/db/cookedHistoryRepository', () => ({
  markRecipeCooked: jest.fn(async () => undefined),
  normalizeRecipeId: (value: string) => value,
}));
jest.mock('../src/privacy/request-ai-data-consent', () => ({
  requestAiDataConsent: jest.fn(async () => true),
}));
jest.mock('../src/rag/model/modelPack', () => ({
  downloadEmbeddingModelPack: jest.fn(async () => undefined),
}));
jest.mock('../src/rag/ragService', () => ({
  getRagRecommendations: jest.fn(async () => ({
    mode: 'rag',
    recommendations: [
      {
        id: 'candidate-1',
        title: 'Candidate recipe',
        score: 1,
        text: 'Candidate recipe',
        metadata: {},
      },
    ],
  })),
}));
jest.mock('../src/storage/recommendationCacheStorage', () => ({
  loadRecommendationCache: jest.fn(async () => null),
  saveRecommendationCache: jest.fn(async () => undefined),
}));
jest.mock('../src/storage/recommendationTagStorage', () => ({
  loadRecommendationRequestTags: jest.fn(async (_language: string, defaults: string[]) => defaults),
  saveRecommendationRequestTags: jest.fn(async () => undefined),
}));
jest.mock('../src/storage/settingsStorage', () => ({
  getApiKey: jest.fn(async () => 'test-key'),
  getSettings: jest.fn(async () => ({ recentHistoryDays: 7 })),
}));
jest.mock('../src/features/recommendations/recommendation-input', () => ({
  getRecommendationInputSnapshot: jest.fn(async () => ({
    ingredients: [{ id: 'ingredient-1', name: 'tomato' }],
    inputSignature: 'tomato',
    recentCookedRecipeIds: new Set(),
    settings: {},
  })),
  normalizeRecommendationSignatureText: (value: string) => value.trim(),
}));
jest.mock('../src/features/recommendations/recommendation-readiness', () => ({
  loadRecommendationReadiness: jest.fn(async () => ({
    consentReady: true,
    credentialReady: true,
    modelReady: true,
    ready: true,
    sourceReady: true,
  })),
}));

const NAVIGATION_STORAGE_KEY = 'fridgechef.navigation-state.v1';

describe('application navigation behavior', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    await AsyncStorage.setItem('chi_shen_me.language', 'en');
  });

  it('offers exactly four localized destinations and retains each tab history', async () => {
    const screen = await render(<App />);

    await screen.findByText('Home destination');
    const tabs = screen.getAllByRole('button');
    expect(tabs.map((tab) => tab.props.accessibilityLabel)).toEqual([
      'Home',
      'Fridge',
      'Recipe Recommendations',
      'My',
    ]);

    await fireEvent.press(screen.getByRole('button', { name: 'Fridge' }));
    await screen.findByText('Fridge destination');
    await fireEvent.press(screen.getByRole('button', { name: 'Open add ingredient' }));
    await screen.findByText('Add ingredient destination');

    await fireEvent.press(screen.getByRole('button', { name: 'Home' }));
    await screen.findByText('Home destination');
    await fireEvent.press(screen.getByRole('button', { name: 'Fridge' }));
    await screen.findByText('Add ingredient destination');
  });

  it('passively restores Recommendations without replaying a generation request', async () => {
    await AsyncStorage.setItem(
      NAVIGATION_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: {
          index: 0,
          routes: [
            {
              name: 'MainTabs',
              state: {
                index: 2,
                routes: [
                  { name: 'HomeStack' },
                  { name: 'FridgeStack' },
                  {
                    name: 'RecommendationsStack',
                    state: {
                      index: 0,
                      routes: [
                        {
                          name: 'Recommendations',
                          params: { generationRequestId: 'must-not-replay' },
                        },
                      ],
                    },
                  },
                  { name: 'MyStack' },
                ],
              },
            },
          ],
        },
      }),
    );

    const screen = await render(<App />);

    await screen.findByText('Recommendation Ready');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Recipe Recommendations' }).props.accessibilityState).toEqual({ selected: true }));
    expect(refineRagRecommendationsWithProvider).not.toHaveBeenCalled();
  });

  it('updates every destination label when Chinese is selected', async () => {
    await AsyncStorage.setItem('chi_shen_me.language', 'zh');

    const screen = await render(<App />);
    await screen.findByRole('button', { name: '首页' });

    const tabs = screen.getAllByRole('button');
    expect(tabs.map((tab) => tab.props.accessibilityLabel)).toEqual([
      '首页',
      '冰箱',
      '菜谱推荐',
      '我的',
    ]);
  });

  it('returns from another top-level destination to Home on Android back', async () => {
    let hardwareBackPress: Parameters<typeof BackHandler.addEventListener>[1] | undefined;
    const backHandlerSpy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation(
      (_event, handler) => {
        hardwareBackPress = handler;
        return { remove: jest.fn() };
      },
    );

    const screen = await render(<App />);
    await screen.findByText('Home destination');
    await fireEvent.press(screen.getByRole('button', { name: 'My' }));
    await screen.findByText('My destination');

    await act(() => {
      expect(hardwareBackPress?.({} as never)).toBe(true);
    });
    await screen.findByText('Home destination');

    backHandlerSpy.mockRestore();
  });
});
