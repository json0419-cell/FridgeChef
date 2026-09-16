import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { BackHandler } from 'react-native';
import App from '../src/application/App';
import { refineRagRecommendationsWithProvider } from '../src/ai/recommendationRefiner';
import { getRecommendationInputSnapshot } from '../src/features/recommendations/recommendation-input';
import { loadRecommendationReadiness } from '../src/features/recommendations/recommendation-readiness';
import { getRagRecommendations } from '../src/rag/ragService';
import { NAVIGATION_STATE_STORAGE_KEY } from '../src/storage/navigation-state-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Icon = (props: object) => React.createElement(View, props);
  return {
    AlertTriangle: Icon,
    CheckCircle2: Icon,
    ChevronDown: Icon,
    ChevronRight: Icon,
    Circle: Icon,
    House: Icon,
    Refrigerator: Icon,
    Settings2: Icon,
    Sparkles: Icon,
    UserRound: Icon,
  };
});

jest.mock('../src/db/database', () => ({ initializeDatabase: jest.fn(async () => undefined) }));

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

describe('application navigation behavior', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    await AsyncStorage.setItem('chi_shen_me.language', 'en');
  });

  it('offers exactly four localized destinations and retains each tab history', async () => {
    const screen = await render(<App />);

    await screen.findByRole('button', { name: 'Get recipe recommendations' });
    const tabs = screen.getAllByRole('button').filter((button) => button.props.accessibilityState?.selected !== undefined);
    expect(tabs.map((tab) => tab.props.accessibilityLabel)).toEqual([
      'Home',
      'Fridge',
      'Recipe Recommendations',
      'My',
    ]);
    expect(screen.getByText('Recommendations')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Fridge' }));
    await screen.findByText('Fridge destination');
    await fireEvent.press(screen.getByRole('button', { name: 'Open add ingredient' }));
    await screen.findByText('Add ingredient destination');

    await fireEvent.press(screen.getByRole('button', { name: 'Home' }));
    await screen.findByRole('button', { name: 'Get recipe recommendations' });
    await fireEvent.press(screen.getByRole('button', { name: 'Fridge' }));
    await screen.findByText('Add ingredient destination');
  });

  it('directs an empty fridge to Fridge before asking for Recommendation Ready setup', async () => {
    jest.mocked(getRecommendationInputSnapshot).mockResolvedValueOnce({
      ingredients: [],
      inputSignature: 'empty',
      recentCookedRecipeIds: new Set(),
      settings: {} as never,
    });
    jest.mocked(loadRecommendationReadiness).mockResolvedValueOnce({
      consentReady: false,
      credentialReady: false,
      modelReady: false,
      ready: false,
      sourceReady: false,
    });

    const screen = await render(<App />);
    expect(await screen.findByRole('button', { name: 'Your fridge is empty · Add ingredients' })).toBeTruthy();
    await fireEvent.press(await screen.findByRole('button', { name: 'Get recipe recommendations' }));

    await screen.findByText('Your fridge is empty');
    expect(screen.queryByText('A few steps remain')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Add to fridge' }));
    await screen.findByText('Fridge destination');
    expect(refineRagRecommendationsWithProvider).not.toHaveBeenCalled();
  });

  it('shows the Confirmed Ingredient count on the secondary action and opens Fridge', async () => {
    const screen = await render(<App />);

    const fridgeAction = await screen.findByRole('button', { name: 'View fridge · 1 ingredient' });
    await fireEvent.press(fridgeAction);

    await screen.findByText('Fridge destination');
    expect(refineRagRecommendationsWithProvider).not.toHaveBeenCalled();
  });

  it('explains missing credential setup and opens Settings without generating', async () => {
    jest.mocked(loadRecommendationReadiness).mockResolvedValueOnce({
      consentReady: false,
      credentialReady: false,
      modelReady: true,
      ready: false,
      sourceReady: true,
    });

    const screen = await render(<App />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Get recipe recommendations' }));

    await screen.findByText('A few steps remain');
    expect(screen.getByText(/Save and test a Gemini API key/)).toBeTruthy();
    expect(screen.getByText(/Allow AI data sharing/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Finish setup' }));
    await screen.findByText('Settings');
    expect(refineRagRecommendationsWithProvider).not.toHaveBeenCalled();
  });

  it('explains missing local readiness and opens the Dataset Library without generating', async () => {
    jest.mocked(loadRecommendationReadiness).mockResolvedValueOnce({
      consentReady: true,
      credentialReady: true,
      modelReady: false,
      ready: false,
      sourceReady: false,
    });

    const screen = await render(<App />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Get recipe recommendations' }));

    await screen.findByText('A few steps remain');
    expect(screen.getByText(/Enable the BGE-M3 model/)).toBeTruthy();
    expect(screen.getByText(/Enable at least one recipe source/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Finish setup' }));
    await screen.findByText('Dataset library');
    expect(refineRagRecommendationsWithProvider).not.toHaveBeenCalled();
  });

  it('offers retry and Fridge recovery when inventory loading fails', async () => {
    jest.mocked(getRecommendationInputSnapshot).mockRejectedValueOnce(new Error('database unavailable'));

    const screen = await render(<App />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Get recipe recommendations' }));

    await screen.findByText('The fridge is unavailable');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check fridge' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fridge unavailable · Check data' })).toBeTruthy();
    expect(refineRagRecommendationsWithProvider).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(getRecommendationInputSnapshot).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('The fridge is unavailable')).toBeNull());
    expect(refineRagRecommendationsWithProvider).not.toHaveBeenCalled();
  });

  it('keeps generation disabled while Home is loading', async () => {
    let resolveSnapshot!: (value: Awaited<ReturnType<typeof getRecommendationInputSnapshot>>) => void;
    jest.mocked(getRecommendationInputSnapshot).mockImplementationOnce(
      () => new Promise((resolve) => { resolveSnapshot = resolve; }),
    );

    const screen = await render(<App />);
    const generate = await screen.findByRole('button', { name: 'Get recipe recommendations' });
    expect(generate.props.accessibilityState).toEqual({ busy: true, disabled: true });
    expect(screen.getByRole('button', { name: 'Checking fridge…' })).toBeTruthy();

    await fireEvent.press(generate);
    expect(refineRagRecommendationsWithProvider).not.toHaveBeenCalled();

    await act(() => {
      resolveSnapshot({
        ingredients: [{ id: 'ingredient-1', name: 'tomato' }] as never,
        inputSignature: 'tomato',
        recentCookedRecipeIds: new Set(),
        settings: {} as never,
      });
    });
    await waitFor(() => expect(generate.props.accessibilityState).toEqual({ busy: false, disabled: false }));
  });

  it('generates once only after the explicit Home action and does not replay on focus', async () => {
    const screen = await render(<App />);

    expect(refineRagRecommendationsWithProvider).not.toHaveBeenCalled();
    await fireEvent.press(await screen.findByRole('button', { name: 'Get recipe recommendations' }));

    await waitFor(() => expect(refineRagRecommendationsWithProvider).toHaveBeenCalledTimes(1));
    expect(getRagRecommendations).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Recipe Recommendations' }).props.accessibilityState).toEqual({ selected: true }));

    await fireEvent.press(screen.getByRole('button', { name: 'Home' }));
    await screen.findByRole('button', { name: 'Get recipe recommendations' });
    await fireEvent.press(screen.getByRole('button', { name: 'Recipe Recommendations' }));
    await screen.findByText('Recommendation Ready');
    await waitFor(() => expect(jest.mocked(getRecommendationInputSnapshot).mock.calls.length).toBeGreaterThanOrEqual(6));

    expect(getRagRecommendations).toHaveBeenCalledTimes(1);
    expect(refineRagRecommendationsWithProvider).toHaveBeenCalledTimes(1);
  });

  it('passively restores Recommendations without replaying a generation request', async () => {
    await AsyncStorage.setItem(
      NAVIGATION_STATE_STORAGE_KEY,
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
    expect(getRagRecommendations).not.toHaveBeenCalled();
    expect(refineRagRecommendationsWithProvider).not.toHaveBeenCalled();
  });

  it('updates every destination label when Chinese is selected', async () => {
    await AsyncStorage.setItem('chi_shen_me.language', 'zh');

    const screen = await render(<App />);
    await screen.findByRole('button', { name: '首页' });

    const tabs = screen.getAllByRole('button').filter((button) => button.props.accessibilityState?.selected !== undefined);
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
    await screen.findByRole('button', { name: 'Get recipe recommendations' });
    await fireEvent.press(screen.getByRole('button', { name: 'My' }));
    await screen.findByText('My destination');

    await act(() => {
      expect(hardwareBackPress?.({} as never)).toBe(true);
    });
    await screen.findByRole('button', { name: 'Get recipe recommendations' });

    backHandlerSpy.mockRestore();
  });
});
