import assert from 'node:assert/strict';
import test from 'node:test';
import { assertValidTestEmbedding } from '../src/rag/model/model-runtime-validation.ts';

test('accepts a finite normalized test embedding with the expected dimension', () => {
  const vector = new Float32Array([0.6, 0.8]);

  assert.doesNotThrow(() => assertValidTestEmbedding(vector, 2));
});

test('rejects a test embedding with the wrong dimension', () => {
  assert.throws(
    () => assertValidTestEmbedding(new Float32Array([1]), 2),
    /unexpected dimension/,
  );
});

test('rejects non-finite and non-normalized test embeddings', () => {
  assert.throws(
    () => assertValidTestEmbedding(new Float32Array([Number.NaN, 0]), 2),
    /non-finite/,
  );
  assert.throws(
    () => assertValidTestEmbedding(new Float32Array([0.2, 0.2]), 2),
    /not normalized/,
  );
});
