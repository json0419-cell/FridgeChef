import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as ScreenCapture from 'expo-screen-capture';
import { ApiKeySettingsScreen } from '../src/features/settings/screens/api-key-settings-screen';
import { SettingsScreen } from '../src/features/settings/screens/SettingsScreen';
import { renderWithAppProviders } from './support/app-providers';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-screen-capture', () => {
  const active = new Set<string>();
  const state = { secure: false };
  return {
    __state: state,
    __reset: () => {
      active.clear();
      state.secure = false;
    },
    // Mirrors the library: the native flag is set only for a newly held key and cleared only
    // once no key is held.
    preventScreenCaptureAsync: jest.fn(async (key = 'default') => {
      if (!active.has(key)) {
        active.add(key);
        state.secure = true;
      }
    }),
    allowScreenCaptureAsync: jest.fn(async (key = 'default') => {
      active.delete(key);
      if (active.size === 0) {
        state.secure = false;
      }
    }),
  };
});
jest.mock('../src/storage/settingsStorage', () => ({
  ...jest.requireActual('../src/storage/settingsStorage'),
  getApiKey: jest.fn(async () => null),
  hasApiKey: jest.fn(async () => false),
}));

const captureModule = ScreenCapture as unknown as { __state: { secure: boolean }; __reset: () => void };
const captureState = captureModule.__state;
const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

async function renderSettings() {
  return renderWithAppProviders(
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator>
        <Stack.Screen name="Settings" component={SettingsScreen as never} />
        <Stack.Screen name="ApiKeySettings" component={ApiKeySettingsScreen as never} />
      </Stack.Navigator>
    </NavigationContainer>,
  );
}

describe('credential capture protection', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    captureModule.__reset();
    await AsyncStorage.clear();
    await AsyncStorage.setItem('chi_shen_me.language', 'en');
  });

  it('leaves ordinary preferences capturable', async () => {
    const screen = await renderSettings();

    await screen.findByText('Servings');
    expect(ScreenCapture.preventScreenCaptureAsync).not.toHaveBeenCalled();
    expect(captureState.secure).toBe(false);
  });

  it('blocks capture while the API key surface is shown and releases it on back navigation', async () => {
    const screen = await renderSettings();

    await fireEvent.press(await screen.findByRole('button', { name: 'Manage API Key' }));
    await screen.findByRole('button', { name: 'Save API Key' });
    expect(captureState.secure).toBe(true);

    await act(async () => navigationRef.goBack());
    await screen.findByText('Servings');
    expect(captureState.secure).toBe(false);
  });

  it('keeps capture blocked while the key is revealed', async () => {
    const screen = await renderSettings();

    await fireEvent.press(await screen.findByRole('button', { name: 'Manage API Key' }));
    const input = await screen.findByLabelText('Gemini API Key');
    expect(input.props.secureTextEntry).toBe(true);

    await fireEvent.press(await screen.findByRole('button', { name: 'Show API Key' }));
    expect((await screen.findByLabelText('Gemini API Key')).props.secureTextEntry).toBe(false);
    expect(captureState.secure).toBe(true);

    await fireEvent.press(await screen.findByRole('button', { name: 'Hide API Key' }));
    expect((await screen.findByLabelText('Gemini API Key')).props.secureTextEntry).toBe(true);
    expect(captureState.secure).toBe(true);

    await act(async () => navigationRef.goBack());
    await screen.findByText('Servings');
    expect(captureState.secure).toBe(false);
  });

  it('keeps the recent-task preview redacted in the background and restores protection on return', async () => {
    const listeners: Array<(state: AppStateStatus) => void> = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.push(listener as (state: AppStateStatus) => void);
      return { remove: () => listeners.splice(listeners.indexOf(listener as never), 1) };
    });
    const changeAppState = (state: AppStateStatus) => act(async () => listeners.forEach((listener) => listener(state)));
    const screen = await renderSettings();

    await fireEvent.press(await screen.findByRole('button', { name: 'Manage API Key' }));
    await screen.findByRole('button', { name: 'Save API Key' });

    await changeAppState('background');
    expect(captureState.secure).toBe(true);
    expect(ScreenCapture.allowScreenCaptureAsync).not.toHaveBeenCalled();

    // Android can recreate the activity while backgrounded, dropping the window flag.
    captureState.secure = false;
    await changeAppState('active');
    expect(captureState.secure).toBe(true);

    await act(async () => navigationRef.goBack());
    await screen.findByText('Servings');
    expect(captureState.secure).toBe(false);
  });
});
