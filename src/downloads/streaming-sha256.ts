import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { UserFacingError } from '../errors/user-facing-error.ts';

export interface StreamingSha256Options {
  chunkBytes?: number;
  yieldAfterChunks?: number;
  /** Receives the running byte count so a multi-gigabyte file can report a live percentage. */
  onProgress?: (hashedBytes: number) => void;
}

export async function calculateStreamingSha256(
  fileSize: number,
  readBytes: (length: number) => Uint8Array,
  options: StreamingSha256Options = {},
): Promise<string> {
  // Hashing runs on the JS thread, so the chunk sets how long the UI can stall between yields.
  const { chunkBytes = 2 * 1024 * 1024, yieldAfterChunks = 1, onProgress } = options;
  if (!Number.isSafeInteger(fileSize) || fileSize < 0 || !Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) {
    throw new UserFacingError('SHA256_STREAM_PARAMS_INVALID', 'Streaming SHA-256 parameters are invalid.');
  }

  const hasher = sha256.create();
  let remaining = fileSize;
  let chunksRead = 0;

  onProgress?.(0);
  while (remaining > 0) {
    const bytes = readBytes(Math.min(chunkBytes, remaining));
    if (bytes.length === 0 || bytes.length > remaining) {
      throw new UserFacingError('SHA256_STREAM_TRUNCATED', 'The file ended early while computing its SHA-256.');
    }

    hasher.update(bytes);
    remaining -= bytes.length;
    chunksRead += 1;
    onProgress?.(fileSize - remaining);

    if (yieldAfterChunks > 0 && chunksRead % yieldAfterChunks === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  return bytesToHex(hasher.digest());
}
