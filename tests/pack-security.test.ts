import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDatasetManifest } from '../src/datasets/dataset-manifest.ts';
import {
  MAX_PACK_FILE_BYTES,
  MIN_FREE_SPACE_RESERVE_BYTES,
  assertHttpsUrl,
  assertSha256Matches,
  isChildUri,
  normalizePackRelativePath,
  requiredAvailableBytes,
  resolveSecurePackFileUrl,
  validatePackFiles,
} from '../src/downloads/pack-security.ts';
import { calculateStreamingSha256 } from '../src/downloads/streaming-sha256.ts';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

test('accepts a normalized nested pack path', () => {
  assert.equal(normalizePackRelativePath('files/vectors.f32'), 'files/vectors.f32');
});

test('rejects traversal, absolute, ambiguous, and backslash paths', () => {
  const invalidPaths = [
    '../outside.bin',
    'files/../outside.bin',
    '/absolute.bin',
    '\\absolute.bin',
    'files\\outside.bin',
    'files//outside.bin',
    'C:/outside.bin',
    'files/%2e%2e/outside.bin',
    'files/data.bin?download=1',
    ' files/data.bin',
  ];

  for (const path of invalidPaths) {
    assert.throws(() => normalizePackRelativePath(path), /路径/);
  }
});

test('accepts only credential-free HTTPS URLs', () => {
  assert.equal(assertHttpsUrl('https://example.com/pack.json', 'URL').protocol, 'https:');
  assert.throws(() => assertHttpsUrl('http://example.com/pack.json', 'URL'), /HTTPS/);
  assert.throws(() => assertHttpsUrl('file:///tmp/pack.json', 'URL'), /HTTPS/);
  assert.throws(() => assertHttpsUrl('https://user:secret@example.com/pack.json', 'URL'), /凭据/);
  assert.throws(() => assertHttpsUrl('https://example.com/pack.json#fragment', 'URL'), /片段/);
});

test('resolves relative pack URLs beside the manifest', () => {
  assert.equal(
    resolveSecurePackFileUrl(
      'https://example.com/packs/demo/dataset-pack.json',
      { role: 'vectors', path: 'files/vectors.f32', sizeBytes: 4, sha256: HASH_A },
      'Dataset pack',
    ),
    'https://example.com/packs/demo/files/vectors.f32',
  );
});

test('validates roles, unique paths, sizes, URLs, and SHA-256 values', () => {
  const validFiles = [
    { role: 'vectors', path: 'files/vectors.f32', sizeBytes: 4096, sha256: HASH_A },
    { role: 'metadata', path: 'files/metadata.jsonl', sizeBytes: 1024, sha256: HASH_B },
  ];
  assert.doesNotThrow(() => validatePackFiles(validFiles, ['vectors', 'metadata'], 'Dataset pack'));

  assert.throws(
    () => validatePackFiles([{ ...validFiles[0], sha256: undefined }, validFiles[1]], ['vectors', 'metadata'], 'Dataset pack'),
    /SHA-256/,
  );
  assert.throws(
    () => validatePackFiles([validFiles[0], { ...validFiles[1], path: validFiles[0].path }], ['vectors'], 'Dataset pack'),
    /重复文件路径/,
  );
  assert.throws(
    () => validatePackFiles([{ ...validFiles[0], sizeBytes: MAX_PACK_FILE_BYTES + 1 }, validFiles[1]], ['vectors'], 'Dataset pack'),
    /大小上限/,
  );
  assert.throws(() => validatePackFiles([validFiles[0]], ['vectors', 'metadata'], 'Dataset pack'), /metadata/);
});

test('validates the complete dataset manifest before downloading', () => {
  const manifest = createManifest();
  assert.doesNotThrow(() => validateDatasetManifest(manifest));

  assert.throws(() => validateDatasetManifest({ ...manifest, embedding: { ...manifest.embedding, dtype: 'int8' } }), /float32/);
  assert.throws(
    () => validateDatasetManifest({ ...manifest, files: [{ ...manifest.files[0], path: '../vectors.f32' }, manifest.files[1]] }),
    /相对路径/,
  );
});

test('compares SHA-256 values without case ambiguity', () => {
  assert.doesNotThrow(() => assertSha256Matches(HASH_A.toUpperCase(), HASH_A, 'vectors.f32'));
  assert.throws(() => assertSha256Matches(HASH_A, HASH_B, 'vectors.f32'), /校验失败/);
});

test('streams SHA-256 without loading a whole file', async () => {
  const source = new TextEncoder().encode('abc');
  let offset = 0;
  const digest = await calculateStreamingSha256(
    source.length,
    (length) => {
      const chunk = source.slice(offset, offset + length);
      offset += chunk.length;
      return chunk;
    },
    2,
    1,
  );

  assert.equal(digest, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  await assert.rejects(() => calculateStreamingSha256(3, () => new Uint8Array()), /提前结束/);
});

test('keeps destructive cleanup inside the datasets root', () => {
  assert.equal(isChildUri('file:///app/datasets', 'file:///app/datasets/demo'), true);
  assert.equal(isChildUri('file:///app/datasets', 'file:///app/datasets-evil/demo'), false);
  assert.equal(isChildUri('file:///app/datasets', 'file:///app/datasets'), false);
});

test('reserves free space for download verification and directory swap', () => {
  assert.equal(requiredAvailableBytes(1024), 1024 + MIN_FREE_SPACE_RESERVE_BYTES);
});

function createManifest() {
  return {
    schemaVersion: 'chishenme.dataset-pack.v1',
    id: 'demo',
    name: 'Demo',
    version: '1',
    description: 'Demo dataset',
    level: 'custom',
    createdAt: '2026-09-01T00:00:00.000Z',
    locale: 'zh-CN',
    license: 'private',
    recipeCount: 1,
    chunkCount: 1,
    embedding: {
      model: 'BAAI/bge-m3',
      dimension: 1024,
      dtype: 'float32',
      normalized: true,
    },
    files: [
      { role: 'vectors', path: 'files/vectors.f32', sizeBytes: 4096, sha256: HASH_A },
      { role: 'metadata', path: 'files/metadata.jsonl', sizeBytes: 256, sha256: HASH_B },
    ],
  };
}
