import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DATA_CLEANUP_CATEGORIES,
  DataCleanupAggregateError,
  createDataCleanupRunner,
  type DataCleanupOperations,
  type DataCleanupStep,
} from '../src/storage/data-cleanup-policy.ts';

test('each named cleanup action affects only its own data category', async () => {
  for (const category of DATA_CLEANUP_CATEGORIES) {
    const calls: DataCleanupStep[] = [];
    const runCleanup = createDataCleanupRunner(createOperations(calls));

    await runCleanup(category);

    assert.deepEqual(calls, [category]);
  }
});

test('clearing all user data runs every category and ordinary preferences', async () => {
  const calls: DataCleanupStep[] = [];
  const runCleanup = createDataCleanupRunner(createOperations(calls));

  await runCleanup('allUserData');

  assert.deepEqual(calls, [...DATA_CLEANUP_CATEGORIES, 'preferences']);
});

test('clearing all continues after a failed category and reports only category names', async () => {
  const calls: DataCleanupStep[] = [];
  const secret = 'ingredient-name-that-must-not-appear';
  const operations = createOperations(calls);
  operations.downloadedPacks = async () => {
    calls.push('downloadedPacks');
    throw new Error(secret);
  };
  operations.apiKey = async () => {
    calls.push('apiKey');
    throw new Error('AIza-secret-that-must-not-appear');
  };
  const runCleanup = createDataCleanupRunner(operations);

  await assert.rejects(
    () => runCleanup('allUserData'),
    (error) => {
      assert.equal(error instanceof DataCleanupAggregateError, true);
      const aggregate = error as DataCleanupAggregateError;
      assert.deepEqual(aggregate.failedSteps, ['downloadedPacks', 'apiKey']);
      assert.equal(aggregate.message.includes(secret), false);
      assert.equal(aggregate.message.includes('AIza'), false);
      return true;
    },
  );

  assert.deepEqual(calls, [...DATA_CLEANUP_CATEGORIES, 'preferences']);
});

function createOperations(calls: DataCleanupStep[]): DataCleanupOperations {
  return {
    caches: record('caches', calls),
    ingredients: record('ingredients', calls),
    history: record('history', calls),
    personalRecipes: record('personalRecipes', calls),
    downloadedPacks: record('downloadedPacks', calls),
    model: record('model', calls),
    apiKey: record('apiKey', calls),
    preferences: record('preferences', calls),
  };
}

function record(step: DataCleanupStep, calls: DataCleanupStep[]) {
  return async () => {
    calls.push(step);
  };
}
