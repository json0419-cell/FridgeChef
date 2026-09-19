import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const CJK = /[㐀-䶿一-鿿＀-￯]/;

const errorModule = readFileSync('src/errors/user-facing-error.ts', 'utf8');
const dictionaries = readFileSync('src/i18n/i18n.tsx', 'utf8');

/** Every module that now reports failures by code instead of by Chinese prose. */
const REFACTORED_MODULES = [
  'src/downloads/pack-security.ts',
  'src/downloads/http-range.ts',
  'src/downloads/streaming-sha256.ts',
  'src/downloads/file-integrity.ts',
  'src/datasets/dataset-manifest.ts',
  'src/datasets/datasetIndex.ts',
  'src/datasets/datasetPack.ts',
  'src/rag/model/model-manifest.ts',
  'src/rag/model/model-memory-policy.ts',
  'src/rag/model/modelPack.ts',
  'src/rag/embedding/BgeM3OnnxEmbedder.ts',
  'src/rag/embedding/tokenizer-pack.ts',
  'src/rag/embedding/unigram-tokenizer.ts',
  'src/rag/embedding/precompiled-charsmap.ts',
  'src/rag/vectorStore/F32VectorStore.ts',
  'src/storage/settingsStorage.ts',
  'src/privacy/ai-data-consent.ts',
];

function declaredErrorCodes() {
  return [...errorModule.matchAll(/^ {2}\| '([A-Z0-9_]+)'$/gm)].map((match) => match[1]);
}

test('a module that cannot reach the I18nProvider never throws Chinese prose', () => {
  for (const path of REFACTORED_MODULES) {
    const source = readFileSync(path, 'utf8');
    const lines = source.split('\n');

    for (const [index, line] of lines.entries()) {
      // A bare `new Error` carries prose that no dictionary can translate.
      assert.ok(
        !/\bnew Error\(/.test(line),
        `${path}:${index + 1} throws a bare Error instead of a coded UserFacingError`,
      );
      // The English fallback is what reaches logs and Diagnostic Information.
      assert.ok(
        !(/new UserFacingError\(/.test(line) && CJK.test(line)),
        `${path}:${index + 1} puts non-English text in a UserFacingError message`,
      );
    }
  }
});

test('every error code a user can be shown is translated in both languages', () => {
  const codes = declaredErrorCodes();
  assert.ok(codes.length > 50, 'the code union should not have collapsed');

  for (const code of codes) {
    const entries = dictionaries.split(`'errors.${code}':`).length - 1;
    assert.equal(entries, 2, `errors.${code} needs one Chinese and one English entry, found ${entries}`);
  }
});

test('the English fallback message is never empty', () => {
  for (const path of REFACTORED_MODULES) {
    const source = readFileSync(path, 'utf8');
    const calls = [...source.matchAll(/new UserFacingError\(\s*'[A-Z0-9_]+',\s*(.)/g)];

    for (const call of calls) {
      const messageStart = call[1];
      assert.ok(
        messageStart === "'" || messageStart === '`',
        `${path} builds a UserFacingError whose message is not a literal`,
      );
    }
  }
});
