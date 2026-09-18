import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calculateStreamingSha256 } from '../src/downloads/streaming-sha256.ts';

const kotlin = readFileSync('modules/file-hash/android/src/main/java/expo/modules/filehash/FileHashModule.kt', 'utf8');
const bridge = readFileSync('modules/file-hash/index.ts', 'utf8');
const integrity = readFileSync('src/downloads/file-integrity.ts', 'utf8');

test('the native digest is SHA-256 in lowercase hex, matching the JS implementation', async () => {
  // Hermes has no JIT, so the JS hash runs at ~10-25 MB/s. The native path must stay interchangeable.
  assert.match(kotlin, /MessageDigest\.getInstance\("SHA-256"\)/);
  assert.match(kotlin, /HEX_DIGITS = "0123456789abcdef"/);
  // Sign extension on bytes above 0x7f is the classic way a hand-rolled hex encoder diverges.
  assert.match(kotlin, /byte\.toInt\(\) and 0xff/);
  assert.match(kotlin, /value ushr 4/);

  const source = new Uint8Array(256).map((_, index) => index);
  let offset = 0;
  const jsDigest = await calculateStreamingSha256(source.length, (length) => {
    const chunk = source.slice(offset, offset + length);
    offset += chunk.length;
    return chunk;
  });

  assert.equal(jsDigest, createHash('sha256').update(Buffer.from(source)).digest('hex'));
  assert.equal(jsDigest, jsDigest.toLowerCase());
});

test('the native module is optional and only ever hashes a whole file', () => {
  // It is absent under Jest and on platforms it is not built for, so the JS path must survive.
  assert.match(bridge, /requireOptionalNativeModule/);
  assert.match(bridge, /return null;/);
  assert.match(integrity, /calculateStreamingSha256\(/);
  assert.match(integrity, /file\.info\(\)\.size === fileSize/);
});

test('the native module refuses anything but a readable file URI', () => {
  assert.match(kotlin, /uri\.startsWith\("file:\/\/"\)/);
  assert.match(kotlin, /InvalidFileUriException/);
  assert.match(kotlin, /!file\.isFile \|\| !file\.canRead\(\)/);
});

test('the native module is registered for autolinking', () => {
  const config = JSON.parse(readFileSync('modules/file-hash/expo-module.config.json', 'utf8')) as {
    android?: { modules?: string[] };
  };

  assert.deepEqual(config.android?.modules, ['expo.modules.filehash.FileHashModule']);
  assert.match(kotlin, /package expo\.modules\.filehash/);
  assert.match(kotlin, /Name\("FileHash"\)/);
  assert.match(bridge, /requireOptionalNativeModule<NativeFileHashModule>\('FileHash'\)/);
});
