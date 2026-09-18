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
