import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PrivacyPolicyScreen } from '../src/features/settings/screens/PrivacyPolicyScreen';
import { hasAiDataConsent } from '../src/privacy/ai-data-consent';
import { I18nProvider } from '../src/i18n/i18n';
import { AppFeedbackProvider } from '../src/shared/components';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const Stack = createNativeStackNavigator();

async function renderFrom(openParams: object | undefined) {
  const Origin = ({ navigation }: { navigation: { navigate: (name: string, params?: object) => void } }) => (
    <Pressable accessibilityRole="button" onPress={() => navigation.navigate('PrivacyPolicy', openParams)}>
      <Text>Open disclosure</Text>
    </Pressable>
  );

  const screen = await render(
    <I18nProvider>
      <AppFeedbackProvider>
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen name="Origin" component={Origin} />
            <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen as never} />
          </Stack.Navigator>
        </NavigationContainer>
      </AppFeedbackProvider>
    </I18nProvider>,
  );
  await fireEvent.press(await screen.findByRole('button', { name: 'Open disclosure' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Agree to AI Data Disclosure' }));
  return screen;
}

describe('AI data disclosure consent', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('chi_shen_me.language', 'en');
  });

  it('returns to the screen that asked for consent after the user agrees', async () => {
    const screen = await renderFrom({ returnAfterConsent: true });

    await screen.findByRole('button', { name: 'Open disclosure' });
    expect(screen.queryByRole('button', { name: 'Revoke AI Consent' })).toBeNull();
    expect(await hasAiDataConsent()).toBe(true);
  });

  it('stays on the disclosure when opened only to review it', async () => {
    const screen = await renderFrom(undefined);

    expect(await screen.findByRole('button', { name: 'Revoke AI Consent' })).toBeTruthy();
    expect(await hasAiDataConsent()).toBe(true);
  });
});
