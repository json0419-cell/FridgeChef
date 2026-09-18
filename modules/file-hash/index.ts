import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

interface NativeFileHashProgress {
  uri: string;
  hashedBytes: number;
}

interface NativeFileHashModule {
  sha256FileAsync(uri: string): Promise<string>;
  addListener(event: 'onProgress', listener: (event: NativeFileHashProgress) => void): EventSubscription;
}

// Absent on platforms this module was not built for, and in Jest, so every caller keeps a JS fallback.
const nativeModule = requireOptionalNativeModule<NativeFileHashModule>('FileHash');

export function isNativeFileHashAvailable() {
  return nativeModule !== null;
}

/**
 * Hashes a file with the platform SHA-256 digest, or returns `null` when the native module is absent.
 *
 * `onProgress` receives the running byte count so a multi-gigabyte file can show a live percentage.
 */
export async function sha256FileNative(
  uri: string,
  onProgress?: (hashedBytes: number) => void,
): Promise<string | null> {
  if (!nativeModule) {
    return null;
  }

  const subscription = onProgress
    ? nativeModule.addListener('onProgress', (event) => {
        if (event.uri === uri) {
          onProgress(event.hashedBytes);
        }
      })
    : null;

  try {
    return await nativeModule.sha256FileAsync(uri);
  } finally {
    subscription?.remove();
  }
}
