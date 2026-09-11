import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateRecommendationReadiness } from '../src/features/recommendations/recommendation-readiness-policy.ts';

const READY_INPUT = {
  consentReady: true,
  credentialReady: true,
  modelReady: true,
  sourceReady: true,
};

test('Recommendation Ready requires every setup condition', () => {
  assert.equal(evaluateRecommendationReadiness(READY_INPUT).ready, true);

  for (const key of Object.keys(READY_INPUT) as Array<keyof typeof READY_INPUT>) {
    assert.equal(
      evaluateRecommendationReadiness({ ...READY_INPUT, [key]: false }).ready,
      false,
      `${key} must block Recommendation Ready`,
    );
  }
});

test('readiness keeps the individual condition states for a persistent checklist', () => {
  assert.deepEqual(
    evaluateRecommendationReadiness({
      consentReady: true,
      credentialReady: false,
      modelReady: false,
      sourceReady: true,
    }),
    {
      consentReady: true,
      credentialReady: false,
      modelReady: false,
      sourceReady: true,
      ready: false,
    },
  );
});
