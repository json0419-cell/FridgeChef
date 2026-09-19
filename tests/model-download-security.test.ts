import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGeminiGenerateContentEndpoint, buildGeminiRequestHeaders } from '../src/ai/geminiConfig.ts';
import { nextByteRange, parseContentRange, validateRangeResponse } from '../src/downloads/http-range.ts';
import { validateEmbeddingModelManifest } from '../src/rag/model/model-manifest.ts';
import { UserFacingError } from '../src/errors/user-facing-error.ts';

/** Assertions name the stable code, never the prose: the prose is translated at the UI boundary. */
function throwsCode(run: () => unknown, code: string) {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof UserFacingError, `expected a UserFacingError, got ${String(error)}`);
    assert.equal(error.code, code);
    assert.ok(error.message.length > 0);
    return true;
  });
}

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

test('model manifest requires SHA-256 for every file before download', () => {
  const manifest = createModelManifest();
  assert.doesNotThrow(() => validateEmbeddingModelManifest(manifest));
  throwsCode(
    () => validateEmbeddingModelManifest({ ...manifest, files: [{ ...manifest.files[0], sha256: undefined }, manifest.files[1]] }),
    'PACK_FILE_SHA256_MISSING',
  );
});

test('model manifest rejects insecure URLs and unsafe output paths', () => {
  const manifest = createModelManifest();
  throwsCode(
    () => validateEmbeddingModelManifest({ ...manifest, files: [{ ...manifest.files[0], url: 'http://example.com/model.onnx' }, manifest.files[1]] }),
    'PACK_URL_NOT_SECURE',
  );
  throwsCode(
    () => validateEmbeddingModelManifest({ ...manifest, files: [{ ...manifest.files[0], path: '../model.onnx' }, manifest.files[1]] }),
    'PACK_FILE_PATH_NOT_RELATIVE',
  );
});

test('range planner resumes at the exact existing byte offset', () => {
  assert.deepEqual(nextByteRange(16, 40, 16), { start: 16, end: 31 });
  assert.deepEqual(nextByteRange(32, 40, 16), { start: 32, end: 39 });
  throwsCode(() => nextByteRange(40, 40, 16), 'DOWNLOAD_RANGE_PARAMS_INVALID');
});

test('range response must match requested bytes and declared total', () => {
  assert.deepEqual(parseContentRange('bytes 16-31/40'), { start: 16, end: 31, total: 40 });
  assert.doesNotThrow(() => validateRangeResponse(206, 'bytes 16-31/40', { start: 16, end: 31 }, 40, 16));
  throwsCode(
    () => validateRangeResponse(206, 'bytes 0-15/40', { start: 16, end: 31 }, 40, 16),
    'DOWNLOAD_CONTENT_RANGE_INVALID',
  );
  throwsCode(() => validateRangeResponse(200, null, { start: 16, end: 31 }, 40, 16), 'DOWNLOAD_RESUME_UNSUPPORTED');
});

test('Gemini key is carried in a header and never in the endpoint URL', () => {
  const secret = 'test-secret-key';
  const endpoint = buildGeminiGenerateContentEndpoint();
  const headers = buildGeminiRequestHeaders(` ${secret} `);
  assert.equal(endpoint.startsWith('https://'), true);
  assert.equal(endpoint.includes(secret), false);
  assert.equal(endpoint.includes('?key='), false);
  assert.equal(headers['x-goog-api-key'], secret);
});

function createModelManifest() {
  return {
    schemaVersion: 'chishenme.embedding-model-pack.v1',
    id: 'bge-m3-query',
    name: 'BGE M3 Query',
    version: '1',
    description: 'Test model',
    createdAt: '2026-09-02T00:00:00.000Z',
    provider: 'onnxruntime-react-native',
    model: {
      name: 'BAAI/bge-m3',
      dimension: 1024,
      dtype: 'float32',
      normalized: true,
      maxLength: 512,
      inputMode: 'string-tokenizer-onnx',
    },
    files: [
      { role: 'modelOnnx', path: 'files/model.onnx', url: 'https://example.com/model.onnx', sizeBytes: 1024, sha256: HASH_A },
      { role: 'tokenizerJson', path: 'files/tokenizer.json', sizeBytes: 512, sha256: HASH_B },
    ],
  };
}
