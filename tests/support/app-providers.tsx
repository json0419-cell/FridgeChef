import { render, type RenderOptions } from '@testing-library/react-native';
import type { PropsWithChildren, ReactElement } from 'react';
import { I18nProvider } from '../../src/i18n/i18n';
import { AppFeedbackProvider } from '../../src/shared/components';

/**
 * The provider stack `src/application/App.tsx` mounts around every screen.
 *
 * Screens reach for these contexts (`useI18n`, `useFeedback`) and throw without them, so a test
 * that hand-rolls its own wrapper silently drifts from the app and fails for harness reasons only.
 * When the app gains a provider, add it here instead of in each test.
 */
export function AppProviders({ children }: PropsWithChildren) {
  return (
    <I18nProvider>
      <AppFeedbackProvider>{children}</AppFeedbackProvider>
    </I18nProvider>
  );
}

/**
 * Renders `ui` as the app would. The providers sit outside whatever `ui` is, so a test that needs
 * navigation passes its own `NavigationContainer`/navigator as `ui`, exactly as the app nests them.
 */
export function renderWithAppProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { ...options, wrapper: AppProviders });
}
