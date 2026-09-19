import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { PrecompiledCharsMap } from '../src/rag/embedding/precompiled-charsmap.ts';
import { UnigramTokenizer } from '../src/rag/embedding/unigram-tokenizer.ts';

/**
 * Fixtures come from the published BGE-M3 model pack's `files/tokenizer.json`:
 * the gzipped blob is `normalizer.normalizers[0].precompiled_charsmap` base64-decoded,
 * and the subset keeps only the Unigram entries that can take part in these cases.
 * The expected token strings were produced by Hugging Face `tokenizers` 0.22.1.
 */
const charsMap = PrecompiledCharsMap.fromBlob(
  new Uint8Array(gunzipSync(readFileSync('tests/fixtures/xlm-roberta-charsmap.bin.gz'))),
);
const subset = JSON.parse(readFileSync('tests/fixtures/bge-m3-unigram-subset.json', 'utf8')) as {
  unkId: number;
  tokens: string[];
  scores: number[];
  cases: { text: string; tokens: string[] }[];
};

function createTokenizer(maxLength = 512) {
  return new UnigramTokenizer({
    charsMap,
    maxLength,
    vocabulary: { scores: Float32Array.from(subset.scores), tokens: subset.tokens, unkId: subset.unkId },
  });
}

const IDENTITY_CHARS_MAP = PrecompiledCharsMap.fromBlob(new Uint8Array([0, 0, 0, 0]));

function createToyTokenizer(maxLength = 512) {
  const tokens = ['<s>', '<pad>', '</s>', '<unk>', '▁a', '▁ab', 'b', 'c', '▁'];
  const scores = [0, 0, 0, 0, -3, -2.5, -6, -6, -4];
  return new UnigramTokenizer({
    charsMap: IDENTITY_CHARS_MAP,
    maxLength,
    vocabulary: { scores: Float32Array.from(scores), tokens, unkId: 3 },
  });
}

test('tokenizes the same way as the reference BGE-M3 tokenizer', () => {
  const tokenizer = createTokenizer();

  for (const expected of subset.cases) {
    const encoded = tokenizer.encode(expected.text);
    assert.deepEqual(
      encoded.inputIds.map((id) => subset.tokens[id]),
      expected.tokens,
      `tokenizing ${JSON.stringify(expected.text)}`,
    );
  }
});

test('normalizes full-width, ligature and no-break characters before tokenizing', () => {
  assert.equal(charsMap.normalize('ＦＵＬＬＷＩＤＴＨ１２３'), 'FULLWIDTH123');
  assert.equal(charsMap.normalize('Ⅻ ½ ㎡ ①'), 'XII 1⁄2 m2 1');
  assert.equal(charsMap.normalize('ﬁ'), 'fi');
  assert.equal(charsMap.normalize('a b'), 'a b');
  assert.equal(charsMap.normalize('今晚吃什么'), '今晚吃什么');
});

test('frames every sequence with <s> and </s> and reports a full attention mask', () => {
  const tokenizer = createTokenizer();
  const encoded = tokenizer.encode('tomato soup');

  assert.equal(subset.tokens[encoded.inputIds[0]], '<s>');
  assert.equal(subset.tokens[encoded.inputIds[encoded.inputIds.length - 1]], '</s>');
  assert.equal(encoded.attentionMask.length, encoded.inputIds.length);
  assert.ok(encoded.attentionMask.every((value) => value === 1));
});

test('keeps an empty query as the special tokens alone', () => {
  const tokenizer = createTokenizer();

  assert.deepEqual(
    tokenizer.encode('').inputIds.map((id) => subset.tokens[id]),
    ['<s>', '</s>'],
  );
});

test('truncates long input to the model max length and still closes the sequence', () => {
  const tokenizer = createTokenizer(8);
  const encoded = tokenizer.encode('番茄炒蛋 with cheese and tomato soup and more tomato soup');

  assert.equal(encoded.inputIds.length, 8);
  assert.equal(subset.tokens[encoded.inputIds[0]], '<s>');
  assert.equal(subset.tokens[encoded.inputIds[7]], '</s>');
});

test('prefers the highest scoring Unigram segmentation', () => {
  const tokenizer = createToyTokenizer();

  assert.deepEqual(tokenizer.encode('ab').inputIds, [0, 5, 2]);
  assert.deepEqual(tokenizer.encode('a b').inputIds, [0, 4, 8, 6, 2]);
});

test('fuses a run of unknown characters into a single <unk>', () => {
  const tokenizer = createToyTokenizer();

  assert.deepEqual(tokenizer.encode('a zzz c').inputIds, [0, 4, 8, 3, 8, 7, 2]);
});
