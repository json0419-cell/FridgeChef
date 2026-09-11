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
