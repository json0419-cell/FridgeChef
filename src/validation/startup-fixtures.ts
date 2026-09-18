// Binds the release-validation fixtures to the app's real storage. It is kept apart from
// `release-fixtures.ts` so that module stays free of React Native imports and can be exercised by
// the node test runner, and so the composition root does not reach for AsyncStorage itself.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyInstalledSourceRegistryFixture } from './release-fixtures.ts';

/** No-op unless this build selected a registry fixture (#27). */
export function applyStartupValidationFixtures(): Promise<void> {
  return applyInstalledSourceRegistryFixture(AsyncStorage);
}
