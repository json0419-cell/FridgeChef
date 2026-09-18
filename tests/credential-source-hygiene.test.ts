import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/**
 * The repository check for ADR 0007: a Gemini API key, or a field that carries one, must never be
 * committed to source, configuration, or CI definitions. It runs in the ordinary test suite, so the
 * same check that guards a local commit is the one CI runs.
 */

const SCANNABLE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'cjs', 'mjs', 'json', 'yml', 'yaml', 'xml', 'gradle', 'kt', 'java',
  'properties', 'md', 'ps1', 'sh', 'bat', 'pro', 'sql', 'example', 'env', 'toml', 'lock',
]);

const CONFIG_EXTENSIONS = new Set(['json', 'yml', 'yaml', 'xml', 'properties', 'gradle', 'example', 'env', 'toml']);

/** A real Google API key is a fixed-length key-shaped token; a short placeholder is not. */
const KEY_SHAPED_VALUE = /\bAIza[0-9A-Za-z_-]{30,}/;

/** A credential field carrying a literal value, as opposed to an empty one or a CI secret reference. */
const CREDENTIAL_FIELD_VALUE =
  /(?:"(?:apiKey|api_key|geminiApiKey|googleApiKey)"\s*:\s*"|(?:GEMINI_API_KEY|GOOGLE_API_KEY|API_KEY|apiKey|api_key|x-goog-api-key)\s*[:=]\s*["']?)([^"'\n]*)/gi;

/** A CI secret reference or shell variable, which carries no value of its own. */
const SECRET_REFERENCE = /^\$\{\{?[^}]*\}\}?$|^\$[A-Za-z_][A-Za-z0-9_]*$/;

// Untracked-but-not-ignored files are included, so a key in a new file fails the check before it
// is ever committed rather than only after CI checks out the commit.
const trackedFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

test('the repository tracks files that this check can actually read', () => {
  assert.ok(scannableFiles().length > 50, 'the credential scan must cover the repository, not a stale subset');
});

test('no committed file contains a key-shaped value', () => {
  const offenders = scannableFiles().filter((file) => KEY_SHAPED_VALUE.test(readFileSync(file, 'utf8')));

  assert.deepEqual(offenders, [], 'a key-shaped value is committed in these files');
});

test('no committed configuration or CI definition assigns a literal API key', () => {
  const offenders: string[] = [];

  for (const file of scannableFiles().filter((file) => CONFIG_EXTENSIONS.has(extensionOf(file)))) {
    for (const match of readFileSync(file, 'utf8').matchAll(CREDENTIAL_FIELD_VALUE)) {
      const value = match[1].trim();
      if (value && !SECRET_REFERENCE.test(value) && !isPlaceholder(value)) {
        offenders.push(`${file}: ${match[0].slice(0, 40)}`);
      }
    }
  }

  assert.deepEqual(offenders, [], 'an API key value is committed in these configuration or CI files');
});

test('the check detects a planted key and a planted credential field', () => {
  const planted = `const key = 'AIza${'Sy'}${'PlantedRepositoryScanFixture0123456789'}';`;
  assert.equal(KEY_SHAPED_VALUE.test(planted), true);

  const plantedField = '{"geminiApiKey":"planted-literal-value"}';
  const values = [...plantedField.matchAll(CREDENTIAL_FIELD_VALUE)].map((match) => match[1].trim());
  assert.deepEqual(values, ['planted-literal-value']);

  // A CI reference and an empty placeholder are not findings.
  const allowed = 'GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}\nAPI_KEY=';
  const allowedValues = [...allowed.matchAll(CREDENTIAL_FIELD_VALUE)]
    .map((match) => match[1].trim())
    .filter((value) => value && !SECRET_REFERENCE.test(value) && !isPlaceholder(value));
  assert.deepEqual(allowedValues, []);
});

test('every Gemini response body is read through the one reader that redacts it', () => {
  // The redaction only holds while `readGeminiJsonResponse` is the sole body reader; a hand-rolled
  // `response.text()` beside a Gemini call would surface a rejection that echoes the key.
  const offenders = sourceFiles('src')
    .filter((file) => !file.endsWith('src/ai/geminiClient.ts'))
    .filter((file) => {
      const source = readFileSync(file, 'utf8');
      return source.includes('fetchGeminiGenerateContent') && /response\.(?:text|json)\(\)/.test(source);
    });

  assert.deepEqual(offenders, [], 'these files read a Gemini response body without redacting it');
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name).split('\\').join('/');
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function scannableFiles() {
  return trackedFiles.filter((file) => {
    if (!SCANNABLE_EXTENSIONS.has(extensionOf(file))) {
      return false;
    }
    try {
      return statSync(file).isFile();
    } catch {
      return false;
    }
  });
}

function extensionOf(file: string) {
  const name = file.split('/').pop() ?? file;
  return name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : '';
}

function isPlaceholder(value: string) {
  return /^(?:replace-with|your|example|placeholder|todo|changeme|<)/i.test(value);
}
