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

export const DATA_CLEANUP_STEPS: readonly DataCleanupStep[] = [...DATA_CLEANUP_CATEGORIES, 'preferences'];

// Reporting a partial Clear All names categories and nothing else: these keys resolve to the same
// user-facing titles the Data Management cards carry, so no path or stored value can reach the user.
// `satisfies` keeps the literals assignable to the i18n key union at the call site, so a step whose
// title key is missing from the dictionaries fails to compile rather than rendering a raw key.
export const DATA_CLEANUP_STEP_TITLE_KEYS = {
  caches: 'dataManagement.cachesTitle',
  ingredients: 'dataManagement.ingredientsTitle',
  history: 'dataManagement.historyTitle',
  personalRecipes: 'dataManagement.personalRecipesTitle',
  downloadedPacks: 'dataManagement.downloadedPacksTitle',
  model: 'dataManagement.modelTitle',
  apiKey: 'dataManagement.apiKeyTitle',
  preferences: 'dataManagement.preferencesTitle',
} as const satisfies Record<DataCleanupStep, string>;

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

    const failedSteps: DataCleanupStep[] = [];

    for (const step of DATA_CLEANUP_STEPS) {
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
