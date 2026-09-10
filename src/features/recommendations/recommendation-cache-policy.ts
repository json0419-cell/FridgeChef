const MAX_RECOMMENDATION_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type RecommendationCacheVisibility = 'current' | 'stale' | 'hidden';

export interface RecommendationCachePolicyInput {
  cachedAt: string;
  inputSignature: string;
  language: 'zh' | 'en';
}

export function classifyRecommendationCache(
  cache: RecommendationCachePolicyInput,
  currentInputSignature: string,
  currentLanguage: 'zh' | 'en',
  now = Date.now(),
): RecommendationCacheVisibility {
  if (cache.language !== currentLanguage || isExpired(cache.cachedAt, now)) {
    return 'hidden';
  }

  if (cache.inputSignature === currentInputSignature) {
    return 'current';
  }

  const cachedDietaryPreferences = readDietaryPreferences(cache.inputSignature);
  const currentDietaryPreferences = readDietaryPreferences(currentInputSignature);
  if (
    cachedDietaryPreferences === null ||
    currentDietaryPreferences === null ||
    cachedDietaryPreferences !== currentDietaryPreferences
  ) {
    return 'hidden';
  }

  return 'stale';
}

function isExpired(cachedAt: string, now: number) {
  const cachedTime = Date.parse(cachedAt);
  return !Number.isFinite(cachedTime) || now - cachedTime > MAX_RECOMMENDATION_CACHE_AGE_MS;
}

function readDietaryPreferences(signature: string) {
  try {
    const parsed = JSON.parse(signature) as { settings?: { dietaryPreferences?: unknown } };
    return typeof parsed.settings?.dietaryPreferences === 'string' ? parsed.settings.dietaryPreferences : null;
  } catch {
    return null;
  }
}
