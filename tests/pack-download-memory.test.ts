import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { nextByteRange } from '../src/downloads/http-range.ts';

const modelPack = readFileSync('src/rag/model/modelPack.ts', 'utf8');
const datasetPack = readFileSync('src/datasets/datasetPack.ts', 'utf8');

test('pack downloads stream to disk instead of buffering a response body', () => {
  // `expo/fetch` queues the whole body in native memory before handing it to JS, so a
  // multi-gigabyte pack file exhausts the Android heap no matter how small the range is.
  for (const [name, source] of [['modelPack', modelPack], ['datasetPack', datasetPack]] as const) {
    assert.equal(/from 'expo\/fetch'/.test(source), false, `${name} must not download through expo/fetch`);
    assert.equal(/\.bytes\(\)|\.arrayBuffer\(\)|\.blob\(\)/.test(source), false, `${name} must not buffer a body`);
    assert.match(source, /File\.downloadFileAsync\(/, `${name} must stream downloads to disk`);
  }
});

test('appending a resumed range never reads the whole file into memory', () => {
  const copyBuffer = /const COPY_BUFFER_BYTES = ([\d *]+);/.exec(modelPack);
  assert.ok(copyBuffer, 'modelPack must declare a fixed copy buffer');
  const bufferBytes = copyBuffer[1].split('*').reduce((total, part) => total * Number(part.trim()), 1);
  assert.equal(bufferBytes <= 4 * 1024 * 1024, true);
  assert.match(modelPack, /readBytes\(COPY_BUFFER_BYTES\)/);
});

test('a resumed download asks only for the bytes that are still missing', () => {
  const totalBytes = 2_266_820_608;
  const offset = 1_073_741_824;

  assert.deepEqual(nextByteRange(offset, totalBytes, totalBytes - offset), {
    start: offset,
    end: totalBytes - 1,
  });
  assert.deepEqual(nextByteRange(0, totalBytes, totalBytes), { start: 0, end: totalBytes - 1 });
});

test('a server that contradicts the manifest is not retried', () => {
  assert.match(modelPack, /manifest 声明不一致/);
  const predicate = /function isRetryableDownloadError[\s\S]*?\n}/.exec(modelPack);
  assert.ok(predicate);
  assert.match(predicate[0], /不支持安全的断点续传[\s\S]*manifest 声明不一致/);
});
