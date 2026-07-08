import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RagResult } from '../rag/ragService';
import type { RefinedRagRecommendation } from '../types';

const RECOMMENDATION_CACHE_KEY = 'chi_shen_me.recommendation_cache.v2';

export interface RecommendationCacheSnapshot {
  refinedRecommendations: RefinedRagRecommendation[];
  ragResult: RagResult | null;
  ingredientCount: number;
  sentCandidateKeys: string[];
  cachedAt: string;
  language: 'zh' | 'en';
  inputSignature: string;
}

export async function loadRecommendationCache(): Promise<RecommendationCacheSnapshot | null> {
  const raw = await AsyncStorage.getItem(RECOMMENDATION_CACHE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<RecommendationCacheSnapshot>;
    if (!Array.isArray(parsed.refinedRecommendations) || typeof parsed.cachedAt !== 'string') {
      return null;
    }

    return {
      refinedRecommendations: parsed.refinedRecommendations,
      ragResult: parsed.ragResult ?? null,
      ingredientCount: Number.isFinite(Number(parsed.ingredientCount)) ? Number(parsed.ingredientCount) : 0,
      sentCandidateKeys: Array.isArray(parsed.sentCandidateKeys)
        ? parsed.sentCandidateKeys.filter((item): item is string => typeof item === 'string')
        : [],
      cachedAt: parsed.cachedAt,
      language: parsed.language === 'en' ? 'en' : 'zh',
      inputSignature: typeof parsed.inputSignature === 'string' ? parsed.inputSignature : '',
    };
  } catch {
    return null;
  }
}

export async function saveRecommendationCache(snapshot: Omit<RecommendationCacheSnapshot, 'cachedAt'>): Promise<void> {
  await AsyncStorage.setItem(
    RECOMMENDATION_CACHE_KEY,
    JSON.stringify({
      ...snapshot,
      cachedAt: new Date().toISOString(),
    }),
  );
}

export async function clearRecommendationCache(): Promise<void> {
  await AsyncStorage.removeItem(RECOMMENDATION_CACHE_KEY);
}
