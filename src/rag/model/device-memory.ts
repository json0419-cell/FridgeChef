import { File } from 'expo-file-system';
import { parseAvailableMemoryBytes } from './model-memory-policy';

const MEMINFO_URI = 'file:///proc/meminfo';

/**
 * Reads the memory a new allocation can claim, or `null` when the platform does not say.
 *
 * `/proc/meminfo` reports a size of 0, so it can only be read as text, and it does not exist off
 * Android. Every failure is "unknown" rather than an error: this only ever gates an optimistic
 * pre-flight check, and it must never be the reason a model refuses to load.
 */
export async function readAvailableMemoryBytes(): Promise<number | null> {
  try {
    return parseAvailableMemoryBytes(await new File(MEMINFO_URI).text());
  } catch {
    return null;
  }
}
