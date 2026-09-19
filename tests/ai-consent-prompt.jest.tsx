import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render } from '@testing-library/react-native';
import { AiDataConsentPrompt } from '../src/privacy/AiDataConsentPrompt';
import { requestAiDataConsent } from '../src/privacy/request-ai-data-consent';
import { hasAiDataConsent } from '../src/privacy/ai-data-consent';
import { I18nProvider } from '../src/i18n/i18n';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

async function renderPrompt() {
  return render(
    <I18nProvider>
      <AiDataConsentPrompt />
    </I18nProvider>,
  );
}

describe('AI data disclosure prompt', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('chi_shen_me.language', 'en');
  });

  it('grants consent when the user agrees', async () => {
    const screen = await renderPrompt();
    const granted = requestAiDataConsent('en');

    await fireEvent.press(await screen.findByRole('button', { name: 'Agree and Continue' }));

    expect(await granted).toBe(true);
    expect(await hasAiDataConsent()).toBe(true);
  });

  it('refuses and records nothing when the user cancels', async () => {
    const screen = await renderPrompt();
    const granted = requestAiDataConsent('en');

    await fireEvent.press(await screen.findByRole('button', { name: 'Cancel' }));

    expect(await granted).toBe(false);
    expect(await hasAiDataConsent()).toBe(false);
  });

  // Without a mounted prompt the request must settle, not hang: a caller awaiting consent would
  // otherwise leave the AI action pending forever.
  it('refuses rather than hanging when no prompt is mounted', async () => {
    expect(await requestAiDataConsent('en')).toBe(false);
    expect(await hasAiDataConsent()).toBe(false);
  });

  it('skips the prompt once consent is already on record', async () => {
    const screen = await renderPrompt();
    const granted = requestAiDataConsent('en');
    await fireEvent.press(await screen.findByRole('button', { name: 'Agree and Continue' }));
    expect(await granted).toBe(true);

    expect(await requestAiDataConsent('en')).toBe(true);
  });
});
