export interface RecommendationReadiness {
  consentReady: boolean;
  credentialReady: boolean;
  modelReady: boolean;
  ready: boolean;
  sourceReady: boolean;
}

export interface RecommendationReadinessInput {
  consentReady: boolean;
  credentialReady: boolean;
  modelReady: boolean;
  sourceReady: boolean;
}

export function evaluateRecommendationReadiness(
  input: RecommendationReadinessInput,
): RecommendationReadiness {
  return {
    ...input,
    ready:
      input.consentReady &&
      input.credentialReady &&
      input.modelReady &&
      input.sourceReady,
  };
}

export type RecommendationSetupStep = 'consent' | 'credential' | 'model' | 'source';

export const RECOMMENDATION_SETUP_STEPS: readonly RecommendationSetupStep[] = [
  'consent',
  'credential',
  'model',
  'source',
] as const;

// A restored install keeps its preferences but loses the secure key and the model and pack files, so
// the checklist has to say what to set up again. `satisfies` keeps the literals assignable to the
// i18n key union at the call site, so a step whose label key is missing from the dictionaries fails
// to compile rather than rendering a raw key.
export const RECOMMENDATION_SETUP_STEP_TITLE_KEYS = {
  consent: 'recommendations.readinessConsent',
  credential: 'recommendations.readinessCredential',
  model: 'recommendations.readinessModel',
  source: 'recommendations.readinessSource',
} as const satisfies Record<RecommendationSetupStep, string>;

const READINESS_CONDITIONS = {
  consent: 'consentReady',
  credential: 'credentialReady',
  model: 'modelReady',
  source: 'sourceReady',
} as const satisfies Record<RecommendationSetupStep, keyof RecommendationReadinessInput>;

export function isRecommendationSetupStepReady(
  readiness: RecommendationReadiness,
  step: RecommendationSetupStep,
): boolean {
  return readiness[READINESS_CONDITIONS[step]];
}

/** The setup steps a user still has to complete, in the order the checklist presents them. */
export function listOutstandingRecommendationSetupSteps(
  readiness: RecommendationReadiness,
): RecommendationSetupStep[] {
  return RECOMMENDATION_SETUP_STEPS.filter((step) => !isRecommendationSetupStepReady(readiness, step));
}

export interface RecipeSourceAvailabilityInput {
  /** Installed DatasetPacks the user has enabled. */
  activeDatasetCount: number;
  /** Recipes in Enabled Personal Recipe Libraries. */
  enabledPersonalRecipeCount: number;
}

/**
 * Whether any recipe source can actually answer a Local Retrieval query.
 *
 * The Base Recipe Library is deliberately excluded. It ships inside the app, so counting it would
 * make this unconditionally true on every install, and Local Retrieval never searches it: only
 * installed DatasetPacks and enabled personal libraries carry vectors. Counting it reported the
 * setup step as done while retrieval still had nothing to search.
 */
export function hasRetrievableRecipeSource(input: RecipeSourceAvailabilityInput): boolean {
  return input.activeDatasetCount > 0 || input.enabledPersonalRecipeCount > 0;
}
