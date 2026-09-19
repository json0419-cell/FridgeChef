import AsyncStorage from '@react-native-async-storage/async-storage';
import { render } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { FridgeScreen } from '../src/features/ingredients/screens/FridgeScreen';
import { I18nProvider } from '../src/i18n/i18n';
import { AppFeedbackProvider } from '../src/shared/components';
import { listIngredients } from '../src/db/ingredientsRepository';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Icon = (props: object) => React.createElement(View, props);
  return { Apple: Icon, SlidersHorizontal: Icon };
});
jest.mock('../src/db/ingredientsRepository', () => ({
  deleteIngredient: jest.fn(async () => undefined),
  listIngredients: jest.fn(async () => []),
}));

const FridgeTabs = createBottomTabNavigator();

const TOMATO = {
  id: 'ingredient-1',
  name: 'Tomato',
  quantity: 2,
  unit: 'pieces',
  source: 'manual' as const,
  createdAt: '2026-09-16T12:00:00.000Z',
};

async function renderFridge() {
  const screen = await render(
    <I18nProvider>
      <AppFeedbackProvider>
        <NavigationContainer>
          <FridgeTabs.Navigator>
            <FridgeTabs.Screen name="Fridge" component={FridgeScreen as never} />
          </FridgeTabs.Navigator>
        </NavigationContainer>
      </AppFeedbackProvider>
    </I18nProvider>,
  );
  return screen;
}

describe('Fridge accessibility behavior', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    await AsyncStorage.setItem('chi_shen_me.language', 'en');
  });

  it('names each Confirmed Ingredient action after its ingredient', async () => {
    jest.mocked(listIngredients).mockResolvedValue([TOMATO]);

    const screen = await renderFridge();

    expect(await screen.findByRole('button', { name: 'Edit Tomato' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete Tomato' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Current ingredients' })).toBeTruthy();
  });

  it('announces a fridge loading failure', async () => {
    jest.mocked(listIngredients).mockRejectedValue(new Error('database unavailable'));

    const screen = await renderFridge();

    const failure = await screen.findByText('Could not load fridge');
    expect(failure.parent?.props.accessibilityRole).toBe('alert');
    expect(failure.parent?.props.accessibilityLiveRegion).toBe('polite');
  });
});
