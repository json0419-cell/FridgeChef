import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateRecommendationReadiness,
  hasRetrievableRecipeSource,
} from '../src/features/recommendations/recommendation-readiness-policy.ts';

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

// The bug: the Base Recipe Library ships inside the app, so counting it reported the recipe-source
// step as done on a fresh install while Local Retrieval had nothing to search.
test('the bundled Base Recipe Library alone does not make a recipe source available', () => {
  assert.equal(
    hasRetrievableRecipeSource({ activeDatasetCount: 0, enabledPersonalRecipeCount: 0 }),
    false,
  );
});

test('an enabled DatasetPack or personal recipe makes a recipe source available', () => {
  assert.equal(hasRetrievableRecipeSource({ activeDatasetCount: 1, enabledPersonalRecipeCount: 0 }), true);
  assert.equal(hasRetrievableRecipeSource({ activeDatasetCount: 0, enabledPersonalRecipeCount: 1 }), true);
});
