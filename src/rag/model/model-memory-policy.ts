/**
 * Decides whether this device can load an ONNX embedding model without being killed.
 *
 * ONNX Runtime copies external initializers into anonymous heap rather than mapping the file, so a
 * pack costs roughly its own weight in unreclaimable memory. Android answers an over-budget
 * allocation with SIGKILL from the low-memory killer, which no `catch` can observe: the process just
 * disappears. Refusing up front turns that silent disappearance into an error the user can read.
 */

/** Measured on an x86_64 emulator: a 2.27GB float32 pack peaked at 1.6GB anonymous RSS. */
const LOAD_FACTOR = 1.5;
/** Tokenizer vocabulary, the JS heap, and the rest of the app still have to fit alongside the model. */
const HEADROOM_BYTES = 300 * 1024 * 1024;

export function requiredMemoryBytesForModelLoad(modelBytes: number): number {
  if (!Number.isFinite(modelBytes) || modelBytes < 0) {
    throw new Error('模型体积无效。');
  }
  return Math.ceil(modelBytes * LOAD_FACTOR) + HEADROOM_BYTES;
}

/**
 * Reads `MemAvailable` from the contents of `/proc/meminfo`.
 *
 * `MemAvailable` — not `MemFree` — is the kernel's own estimate of what a new allocation can claim
 * without swapping, so it already accounts for reclaimable page cache left behind by the download.
 * Returns `null` when the field is absent, which means "unknown", never "none".
 */
export function parseAvailableMemoryBytes(meminfoText: string): number | null {
  const match = /^MemAvailable:\s+(\d+)\s*kB$/m.exec(meminfoText);
  if (!match) {
    return null;
  }

  const kilobytes = Number(match[1]);
  return Number.isSafeInteger(kilobytes) ? kilobytes * 1024 : null;
}

/**
 * Throws when the model cannot fit. An unknown `availableBytes` allows the load: a device whose
 * memory we cannot read is not a device we should lock the user out of.
 */
export function assertSufficientMemoryForModelLoad(
  modelBytes: number,
  availableBytes: number | null,
  modelName = '本地模型',
): void {
  if (availableBytes === null) {
    return;
  }

  const requiredBytes = requiredMemoryBytesForModelLoad(modelBytes);
  if (availableBytes >= requiredBytes) {
    return;
  }

  throw new Error(
    `可用内存不足，无法加载${modelName}：需要约 ${toMegabytes(requiredBytes)}MB，当前可用 ${toMegabytes(availableBytes)}MB。` +
      '请关闭其他应用后重试，或改用体积更小的模型。',
  );
}

function toMegabytes(bytes: number) {
  return Math.round(bytes / (1024 * 1024));
}
