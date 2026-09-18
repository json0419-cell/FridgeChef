import { useCallback } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ScreenCapture from 'expo-screen-capture';

export const CREDENTIAL_SCREEN_CAPTURE_KEY = 'gemini-api-key-settings';
const RESUME_CAPTURE_KEY = `${CREDENTIAL_SCREEN_CAPTURE_KEY}:resume`;

/**
 * Blocks screenshots, screen recording, and the recent-task preview while a credential
 * entry or reveal surface is focused (ADR 0007). Protection stays on while the app is in
 * the background so the recent-task preview is redacted, and is released on blur.
 */
export function useCredentialCaptureProtection() {
  useFocusEffect(
    useCallback(() => {
      void ScreenCapture.preventScreenCaptureAsync(CREDENTIAL_SCREEN_CAPTURE_KEY);

      // The window flag lives on the native activity, which Android may recreate while the
      // app is backgrounded. Re-assert it on return through a second key so the primary key
      // stays held and the flag is never cleared in between.
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          void ScreenCapture.preventScreenCaptureAsync(RESUME_CAPTURE_KEY).then(() =>
            ScreenCapture.allowScreenCaptureAsync(RESUME_CAPTURE_KEY),
          );
        }
      });

      return () => {
        subscription.remove();
        void ScreenCapture.allowScreenCaptureAsync(CREDENTIAL_SCREEN_CAPTURE_KEY);
      };
    }, []),
  );
}
