export const DATA_CLEANUP_CATEGORIES = [
  'caches',
  'ingredients',
  'history',
  'personalRecipes',
  'downloadedPacks',
  'model',
  'apiKey',
] as const;

export type DataCleanupCategory = (typeof DATA_CLEANUP_CATEGORIES)[number] | 'allUserData';
export type DataCleanupStep = Exclude<DataCleanupCategory, 'allUserData'> | 'preferences';

export interface DataCleanupOperations {
  caches: () => Promise<void>;
  ingredients: () => Promise<void>;
  history: () => Promise<void>;
  personalRecipes: () => Promise<void>;
  downloadedPacks: () => Promise<void>;
  model: () => Promise<void>;
  apiKey: () => Promise<void>;
  preferences: () => Promise<void>;
}

export class DataCleanupAggregateError extends Error {
  readonly failedSteps: DataCleanupStep[];

  constructor(failedSteps: DataCleanupStep[]) {
    super(`Local data cleanup did not finish for: ${failedSteps.join(', ')}`);
    this.name = 'DataCleanupAggregateError';
    this.failedSteps = [...failedSteps];
  }
}

export function createDataCleanupRunner(operations: DataCleanupOperations) {
  return async (category: DataCleanupCategory): Promise<void> => {
    if (category !== 'allUserData') {
      await operations[category]();
      return;
    }

    const steps: DataCleanupStep[] = [...DATA_CLEANUP_CATEGORIES, 'preferences'];
    const failedSteps: DataCleanupStep[] = [];

    for (const step of steps) {
      try {
        await operations[step]();
      } catch {
        failedSteps.push(step);
      }
    }

    if (failedSteps.length > 0) {
      throw new DataCleanupAggregateError(failedSteps);
    }
  };
}
