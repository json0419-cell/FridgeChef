import { FileMode, type File } from 'expo-file-system';
import { sha256FileNative } from '../../modules/file-hash';
import { calculateStreamingSha256 } from './streaming-sha256';

/**
 * Hashes a pack file, preferring the platform digest.
 *
 * SHA-256 is a tight 32-bit loop and Hermes has no JIT, so the JS implementation runs at roughly
 * 10-25 MB/s on device — minutes for the embedding model. The native digest runs at disk speed.
 * It is absent under Jest and on platforms the local module is not built for, so the JS
 * implementation stays as the fallback and both paths must agree byte for byte.
 */
export async function calculateFileSha256(
  file: File,
  fileSize: number,
  onProgress?: (hashedBytes: number) => void,
): Promise<string> {
  // The native digest always covers the whole file, so a caller hashing a prefix keeps the JS path.
  if (file.info().size === fileSize) {
    try {
      const nativeDigest = await sha256FileNative(file.uri, onProgress);
      if (nativeDigest) {
        return nativeDigest;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${message}（${file.name}）`);
    }
  }

  const handle = file.open(FileMode.ReadOnly);

  try {
    return await calculateStreamingSha256(fileSize, (length) => handle.readBytes(length), { onProgress });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}（${file.name}）`);
  } finally {
    handle.close();
  }
}
