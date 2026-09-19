/**
 * Decides whether this device can load an ONNX embedding model without being killed.
 *
 * ONNX Runtime copies external initializers into anonymous heap rather than mapping the file, so a
 * pack costs roughly its own weight in unreclaimable memory. Android answers an over-budget
 * allocation with SIGKILL from the low-memory killer, which no `catch` can observe: the process just
 * disappears. Refusing up front turns that silent disappearance into an error the user can read.
 */

import { UserFacingError } from '../../errors/user-facing-error.ts';

/** Measured on an x86_64 emulator: a 2.27GB float32 pack peaked at 1.6GB anonymous RSS. */
const LOAD_FACTOR = 1.5;
/** Tokenizer vocabulary, the JS heap, and the rest of the app still have to fit alongside the model. */
const HEADROOM_BYTES = 300 * 1024 * 1024;

export function requiredMemoryBytesForModelLoad(modelBytes: number): number {
  if (!Number.isFinite(modelBytes) || modelBytes < 0) {
    throw new UserFacingError('MODEL_SIZE_INVALID', 'The model size is invalid.');
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
  modelName = 'the local model',
): void {
  if (availableBytes === null) {
    return;
  }

  const requiredBytes = requiredMemoryBytesForModelLoad(modelBytes);
  if (availableBytes >= requiredBytes) {
    return;
  }

  const requiredMegabytes = toMegabytes(requiredBytes);
  const availableMegabytes = toMegabytes(availableBytes);
  throw new UserFacingError(
    'MODEL_MEMORY_INSUFFICIENT',
    `Not enough memory to load ${modelName}: about ${requiredMegabytes}MB is needed, ${availableMegabytes}MB is available.`,
    { modelName, requiredMegabytes, availableMegabytes },
  );
}

function toMegabytes(bytes: number) {
  return Math.round(bytes / (1024 * 1024));
}
