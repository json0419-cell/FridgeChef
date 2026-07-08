import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Language } from '../i18n/i18n';

const RECOMMENDATION_TAGS_KEY = 'chi_shen_me.recommendation_tags.v1';

type StoredRecommendationTags = Partial<Record<Language, string[]>>;

export async function loadRecommendationRequestTags(language: Language, defaultTags: string[]): Promise<string[]> {
  const stored = await readStoredTags();
  const tags = stored[language];
  return tags && tags.length > 0 ? normalizeTags(tags) : defaultTags;
}

export async function saveRecommendationRequestTags(language: Language, tags: string[]): Promise<void> {
  const stored = await readStoredTags();
  await AsyncStorage.setItem(
    RECOMMENDATION_TAGS_KEY,
    JSON.stringify({
      ...stored,
      [language]: normalizeTags(tags),
    }),
  );
}

async function readStoredTags(): Promise<StoredRecommendationTags> {
  const raw = await AsyncStorage.getItem(RECOMMENDATION_TAGS_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as StoredRecommendationTags;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeTags(tags: string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of tags) {
    const value = tag.trim().replace(/\s+/g, ' ');
    const key = value.toLowerCase();
    if (!value || seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(value);
  }

  return normalized;
}
