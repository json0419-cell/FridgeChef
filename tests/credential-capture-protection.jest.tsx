import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as ScreenCapture from 'expo-screen-capture';
import { ApiKeySettingsScreen } from '../src/features/settings/screens/api-key-settings-screen';
import { SettingsScreen } from '../src/features/settings/screens/SettingsScreen';
import { I18nProvider } from '../src/i18n/i18n';
import { AppFeedbackProvider } from '../src/shared/components';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-screen-capture', () => {
  const active = new Set<string>();
  const state = { secure: false };
  return {
    __state: state,
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

const captureState = (ScreenCapture as unknown as { __state: { secure: boolean } }).__state;
const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

async function renderSettings() {
  return render(
    <I18nProvider>
      <AppFeedbackProvider>
        <NavigationContainer ref={navigationRef}>
          <Stack.Navigator>
            <Stack.Screen name="Settings" component={SettingsScreen as never} />
            <Stack.Screen name="ApiKeySettings" component={ApiKeySettingsScreen as never} />
          </Stack.Navigator>
        </NavigationContainer>
      </AppFeedbackProvider>
    </I18nProvider>,
  );
}

describe('credential capture protection', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    captureState.secure = false;
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
