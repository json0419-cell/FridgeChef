import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ApiKeySettingsScreen } from '../src/features/settings/screens/api-key-settings-screen';
import { hasVerifiedApiKey } from '../src/storage/settingsStorage';
import { I18nProvider } from '../src/i18n/i18n';
import { AppFeedbackProvider } from '../src/shared/components';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
const secureValues: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => (key in secureValues ? secureValues[key] : null)),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    secureValues[key] = value;
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    delete secureValues[key];
  }),
}));
jest.mock('../src/ai/providerAdapter', () => ({ testProviderConnection: jest.fn(async () => undefined) }));
jest.mock('../src/privacy/request-ai-data-consent', () => ({ requestAiDataConsent: jest.fn(async () => true) }));
jest.mock('../src/privacy/credential-capture-protection', () => ({ useCredentialCaptureProtection: () => {} }));

const Stack = createNativeStackNavigator();

async function renderFrom(openParams: object | undefined) {
  const Origin = ({ navigation }: { navigation: { navigate: (name: string, params?: object) => void } }) => (
    <Pressable accessibilityRole="button" onPress={() => navigation.navigate('ApiKeySettings', openParams)}>
      <Text>Open key setup</Text>
    </Pressable>
  );

  const screen = await render(
    <I18nProvider>
      <AppFeedbackProvider>
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen name="Origin" component={Origin} />
            <Stack.Screen name="ApiKeySettings" component={ApiKeySettingsScreen as never} />
          </Stack.Navigator>
        </NavigationContainer>
      </AppFeedbackProvider>
    </I18nProvider>,
  );

  await fireEvent.press(await screen.findByRole('button', { name: 'Open key setup' }));
  await fireEvent.changeText(await screen.findByDisplayValue(''), 'test-key-value');
  await fireEvent.press(await screen.findByRole('button', { name: 'Save and Test Connection' }));
  return screen;
}

describe('Gemini API key setup', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('chi_shen_me.language', 'en');
    for (const key of Object.keys(secureValues)) delete secureValues[key];
  });

  it('returns to the setup step that asked for the key once it passes its live test', async () => {
    const screen = await renderFrom({ returnAfterVerified: true });

    await screen.findByRole('button', { name: 'Open key setup' });
    expect(screen.queryByRole('button', { name: 'Save and Test Connection' })).toBeNull();
    expect(await hasVerifiedApiKey('gemini')).toBe(true);
  });

  it('stays on the key screen when opened directly from settings', async () => {
    const screen = await renderFrom(undefined);

    expect(await screen.findByRole('button', { name: 'Save and Test Connection' })).toBeTruthy();
    expect(await hasVerifiedApiKey('gemini')).toBe(true);
  });
});
