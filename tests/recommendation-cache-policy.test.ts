import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyRecommendationCache } from '../src/features/recommendations/recommendation-cache-policy.ts';

const NOW = Date.parse('2026-09-09T12:00:00.000Z');

function signature({ dietaryPreferences = '', ingredient = 'tomato' } = {}) {
  return JSON.stringify({
    language: 'zh',
    settings: { dietaryPreferences },
    ingredients: [{ id: 'ingredient-1', name: ingredient }],
  });
}

test('keeps an exact recommendation cache current', () => {
  const inputSignature = signature();
  assert.equal(
    classifyRecommendationCache(
      { cachedAt: '2026-09-08T12:00:00.000Z', inputSignature, language: 'zh' },
      inputSignature,
      'zh',
      NOW,
    ),
    'current',
  );
});

test('keeps a safe cache visible when ordinary inputs change', () => {
  assert.equal(
    classifyRecommendationCache(
      { cachedAt: '2026-09-08T12:00:00.000Z', inputSignature: signature(), language: 'zh' },
      signature({ ingredient: 'egg' }),
      'zh',
      NOW,
    ),
    'stale',
  );
});

test('hides a cache when dietary restrictions change', () => {
  assert.equal(
    classifyRecommendationCache(
      { cachedAt: '2026-09-08T12:00:00.000Z', inputSignature: signature(), language: 'zh' },
      signature({ dietaryPreferences: 'peanut allergy' }),
      'zh',
      NOW,
    ),
    'hidden',
  );
});

test('hides a cache from another language', () => {
  assert.equal(
    classifyRecommendationCache(
      { cachedAt: '2026-09-08T12:00:00.000Z', inputSignature: signature(), language: 'zh' },
      signature(),
      'en',
      NOW,
    ),
    'hidden',
  );
});

test('hides a cache older than seven days', () => {
  assert.equal(
    classifyRecommendationCache(
      { cachedAt: '2026-09-01T11:59:59.000Z', inputSignature: signature(), language: 'zh' },
      signature(),
      'zh',
      NOW,
    ),
    'hidden',
  );
});
