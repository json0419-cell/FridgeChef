import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertSufficientMemoryForModelLoad,
  parseAvailableMemoryBytes,
  requiredMemoryBytesForModelLoad,
} from '../src/rag/model/model-memory-policy.ts';

const MEGABYTE = 1024 * 1024;
const FLOAT32_PACK_BYTES = 724_923 + 2_266_820_608;
const UINT8_PACK_BYTES = 568_599_142;

const MEMINFO = [
  'MemTotal:        4006176 kB',
  'MemFree:          431368 kB',
  'MemAvailable:    2311852 kB',
  'Buffers:           13752 kB',
].join('\n');

test('MemAvailable is read as the claimable memory, not MemFree', () => {
  assert.equal(parseAvailableMemoryBytes(MEMINFO), 2_311_852 * 1024);
});

test('an unreadable or unexpected meminfo reports unknown rather than zero', () => {
  assert.equal(parseAvailableMemoryBytes(''), null);
  assert.equal(parseAvailableMemoryBytes('MemTotal: 4006176 kB'), null);
  assert.equal(parseAvailableMemoryBytes('MemAvailable: not-a-number kB'), null);
});

// The bug: a 2.27GB float32 pack was accepted, then the low-memory killer took the whole process
// during InferenceSession.create — a SIGKILL no catch block could observe, so the app just vanished.
test('the float32 BGE-M3 pack is refused on a device that cannot hold it', () => {
  assert.throws(
    () => assertSufficientMemoryForModelLoad(FLOAT32_PACK_BYTES, 2_311_852 * 1024, 'BGE-M3'),
    /可用内存不足/,
  );
});

test('the uint8 BGE-M3 pack loads on that same device', () => {
  assert.doesNotThrow(() => assertSufficientMemoryForModelLoad(UINT8_PACK_BYTES, 2_311_852 * 1024, 'BGE-M3'));
});

test('the required budget covers the weights plus room for the tokenizer and the app', () => {
  assert.ok(requiredMemoryBytesForModelLoad(UINT8_PACK_BYTES) > UINT8_PACK_BYTES + 300 * MEGABYTE);
  assert.throws(() => requiredMemoryBytesForModelLoad(-1), /无效/);
});

test('a device that does not report its memory is never locked out', () => {
  assert.doesNotThrow(() => assertSufficientMemoryForModelLoad(FLOAT32_PACK_BYTES, null));
});
