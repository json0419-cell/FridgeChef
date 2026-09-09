import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

export async function calculateStreamingSha256(
  fileSize: number,
  readBytes: (length: number) => Uint8Array,
  chunkBytes = 4 * 1024 * 1024,
  yieldAfterChunks = 4,
): Promise<string> {
  if (!Number.isSafeInteger(fileSize) || fileSize < 0 || !Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) {
    throw new Error('SHA-256 流式读取参数无效。');
  }

  const hasher = sha256.create();
  let remaining = fileSize;
  let chunksRead = 0;

  while (remaining > 0) {
    const bytes = readBytes(Math.min(chunkBytes, remaining));
    if (bytes.length === 0 || bytes.length > remaining) {
      throw new Error('读取文件进行 SHA-256 校验时提前结束。');
    }

    hasher.update(bytes);
    remaining -= bytes.length;
    chunksRead += 1;

    if (yieldAfterChunks > 0 && chunksRead % yieldAfterChunks === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  return bytesToHex(hasher.digest());
}
