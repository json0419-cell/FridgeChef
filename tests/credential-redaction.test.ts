import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REDACTED_CREDENTIAL,
  redactCredentials,
  redactCredentialsFromError,
} from '../src/privacy/credential-redaction.ts';
import { SENTINEL_API_KEY } from './fixtures/sentinel-api-key.ts';

test('an exact saved key is removed wherever it appears', () => {
  const redacted = redactCredentials(
    `API key not valid: ${SENTINEL_API_KEY}. Retry with ${SENTINEL_API_KEY}.`,
    SENTINEL_API_KEY,
  );

  assert.equal(redacted.includes(SENTINEL_API_KEY), false);
  assert.equal(redacted, `API key not valid: ${REDACTED_CREDENTIAL}. Retry with ${REDACTED_CREDENTIAL}.`);
});

test('a key-shaped value is removed even when the saved key is unknown', () => {
  const redacted = redactCredentials(`Request failed for ${SENTINEL_API_KEY}`);

  assert.equal(redacted.includes(SENTINEL_API_KEY), false);
  assert.equal(redacted, `Request failed for ${REDACTED_CREDENTIAL}`);
});

test('credential query parameters, headers, and JSON fields are removed', () => {
  const cases = [
    'GET https://generativelanguage.googleapis.com/v1beta/models?key=plain-secret-value&alt=sse',
    "headers: { 'x-goog-api-key': 'plain-secret-value' }",
    '{"apiKey":"plain-secret-value","servings":2}',
    '{"geminiApiKey": "plain-secret-value"}',
    'authorization: Bearer plain-secret-value',
  ];

  for (const input of cases) {
    const redacted = redactCredentials(input);
    assert.equal(redacted.includes('plain-secret-value'), false, input);
    assert.ok(redacted.includes(REDACTED_CREDENTIAL), input);
  }
});

test('redaction keeps surrounding diagnostic text readable and is idempotent', () => {
  // A message can cross the boundary twice: redacted at the Gemini client, then again by the
  // settings screen before it is shown. The second pass must not rewrite the first pass's marker.
  const messages = [
    `Gemini 请求失败 (403): key ${SENTINEL_API_KEY} rejected`,
    `{"apiKey":"${SENTINEL_API_KEY}","servings":2}`,
    `apiKey: ${SENTINEL_API_KEY}`,
    `x-goog-api-key: ${SENTINEL_API_KEY}`,
    `https://generativelanguage.googleapis.com/v1beta?key=${SENTINEL_API_KEY}`,
    `authorization: Bearer ${SENTINEL_API_KEY}`,
  ];

  for (const message of messages) {
    const once = redactCredentials(message, SENTINEL_API_KEY);
    assert.equal(once.includes(SENTINEL_API_KEY), false, message);
    assert.equal(redactCredentials(once, SENTINEL_API_KEY), once, message);
    assert.equal(redactCredentials(once), once, message);
  }

  const readable = redactCredentials(messages[0], SENTINEL_API_KEY);
  assert.match(readable, /Gemini 请求失败 \(403\)/);
  assert.match(readable, /rejected$/);
});

test('a short, blank, or absent secret never blanks out ordinary text', () => {
  for (const secret of ['', '   ', 'ab', null, undefined]) {
    assert.equal(redactCredentials('a normal message', secret), 'a normal message');
  }
});

test('a redacted error keeps its name and drops any cause that echoes the key', () => {
  const cause = new Error(`network refused for ${SENTINEL_API_KEY}`);
  const original = new TypeError(`fetch failed with ${SENTINEL_API_KEY}`, { cause });

  const redacted = redactCredentialsFromError(original, SENTINEL_API_KEY);

  assert.ok(redacted instanceof Error);
  assert.equal(redacted.name, 'TypeError');
  assert.equal(redacted.message.includes(SENTINEL_API_KEY), false);
  assert.equal(redacted.cause, undefined);
  assert.equal(String(redacted.stack).includes(SENTINEL_API_KEY), false);
});

test('a non-error rejection value is redacted into an error', () => {
  const redacted = redactCredentialsFromError(`raw failure ${SENTINEL_API_KEY}`, SENTINEL_API_KEY);

  assert.ok(redacted instanceof Error);
  assert.equal(redacted.message.includes(SENTINEL_API_KEY), false);
});
