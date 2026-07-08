import { extractGeminiText, extractJsonObject } from './json';
import { buildGeminiGenerateContentEndpoint } from './geminiConfig';
import { buildRecommendationRefinerPrompt } from './recommendationRefinerPrompt';
import type { AppSettings, Ingredient, RagRecommendation, RefinedRagRecommendation } from '../types';

type OutputLanguage = 'zh' | 'en';

const PROVIDER_REQUEST_TIMEOUT_MS = 25000;

export interface RecommendationRefinerInput {
  apiKey: string;
  ingredients: Ingredient[];
  settings: AppSettings;
  recommendations: RagRecommendation[];
  extraPreference?: string;
  outputLanguage?: OutputLanguage;
}

export async function refineRagRecommendationsWithProvider({
  apiKey,
  ingredients,
  settings,
  recommendations,
  extraPreference,
  outputLanguage = 'zh',
}: RecommendationRefinerInput): Promise<RefinedRagRecommendation[]> {
  if (!apiKey.trim()) {
    throw new Error('请先在设置中保存 Gemini API Key。');
  }

  if (recommendations.length === 0) {
    return [];
  }

  const prompt = buildRecommendationRefinerPrompt({ ingredients, settings, recommendations, extraPreference, outputLanguage });

  return refineWithGemini(apiKey, prompt, recommendations);
}

async function refineWithGemini(
  apiKey: string,
  prompt: string,
  sourceRecommendations: RagRecommendation[],
): Promise<RefinedRagRecommendation[]> {
  const response = await fetchWithTimeout(buildGeminiGenerateContentEndpoint(apiKey), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        response_mime_type: 'application/json',
        temperature: 0.2,
        maxOutputTokens: 2600,
      },
    }),
  });

  const data = await readJsonResponse(response, 'Gemini 推荐整理失败');
  return parseRefinedRecommendationsJson(extractGeminiText(data), sourceRecommendations);
}

async function fetchWithTimeout(input: string, init: RequestInit) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROVIDER_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('AI 调用超时。');
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseRefinedRecommendationsJson(
  raw: string,
  sourceRecommendations: RagRecommendation[],
): RefinedRagRecommendation[] {
  const parsed = JSON.parse(extractJsonObject(raw)) as unknown;
  const root = asRecord(parsed);
  const items = root?.recommendations;
  if (!Array.isArray(items)) {
    throw new Error('AI 推荐整理结果缺少 recommendations 数组。');
  }

  const sources = sourceRecommendations.map((source) => ({
    source,
    key: recommendationKey(source.recipeId, source.chunkId, source.id),
  })).map((item, index) => ({ ...item, rank: index + 1 }));

  const refined = items
    .map((item) => toRefinedRecommendation(item, sources))
    .filter((item): item is RefinedRagRecommendation => Boolean(item));

  if (items.length > 0 && refined.length === 0) {
    console.warn('AI recommendation refinement parsed zero usable items', {
      returnedItems: items.length,
      sourceItems: sourceRecommendations.length,
    });
  }

  return refined;
}

function toRefinedRecommendation(
  value: unknown,
  sources: Array<{ source: RagRecommendation; key: string; rank: number }>,
): RefinedRagRecommendation | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const rank = toPositiveInteger(record.rank);
  const recipeId = toStringValue(record.recipeId);
  const chunkId = toStringValue(record.chunkId);
  const source = findSourceRecommendation(sources, rank, recipeId, chunkId, toStringValue(record.title));
  if (!source) {
    return null;
  }

  const cleanSteps = readStepArray(record).filter(Boolean).slice(0, 8);
  if (cleanSteps.length === 0) {
    return null;
  }

  return {
    id: source.id,
    recipeId: source.recipeId,
    chunkId: source.chunkId,
    title: toStringValue(record.title) || source.title,
    scoreReason: toStringValue(record.scoreReason) || '根据当前候选菜谱整理出的推荐。',
    matchedIngredients: toStringArray(record.matchedIngredients).slice(0, 12),
    missingIngredients: toStringArray(record.missingIngredients).slice(0, 12),
    difficulty: toDifficulty(record.difficulty),
    estimatedTimeMinutes: toNullableNumber(record.estimatedTimeMinutes),
    servingNote: toStringValue(record.servingNote),
    cleanSteps,
    notes: toStringValue(record.notes),
    source,
  };
}

function findSourceRecommendation(
  sources: Array<{ source: RagRecommendation; key: string; rank: number }>,
  rank: number | null,
  recipeId: string,
  chunkId: string,
  title: string,
) {
  const byRank = rank ? sources.find((item) => item.rank === rank) : null;
  if (byRank) {
    return byRank.source;
  }

  const exactKey = recommendationKey(recipeId, chunkId, '');
  const exact = sources.find((item) => item.key === exactKey);
  if (exact) {
    return exact.source;
  }

  const byChunk = chunkId ? sources.find((item) => item.source.chunkId === chunkId) : null;
  if (byChunk) {
    return byChunk.source;
  }

  const byRecipe = recipeId ? sources.find((item) => item.source.recipeId === recipeId) : null;
  if (byRecipe) {
    return byRecipe.source;
  }

  const normalizedTitle = normalizeForMatch(title);
  const byTitle = normalizedTitle
    ? sources.find((item) => normalizeForMatch(item.source.title) === normalizedTitle)
    : null;
  return byTitle?.source ?? null;
}

function recommendationKey(recipeId: string | undefined, chunkId: string | undefined, id: string) {
  return `${recipeId ?? ''}::${chunkId ?? ''}::${id}`;
}

async function readJsonResponse(response: Response, fallbackMessage: string) {
  const text = await response.text();
  let data: unknown = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(readProviderError(data) || `${fallbackMessage} (${response.status})`);
  }

  return data;
}

function readProviderError(data: unknown) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const root = data as Record<string, unknown>;
  const error = root.error;
  if (!error || typeof error !== 'object') {
    return null;
  }

  const message = (error as Record<string, unknown>).message;
  return typeof message === 'string' ? message : null;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function toStringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function toStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => toStringValue(item)).filter((item) => item.length > 0)
    : [];
}

function readStepArray(record: Record<string, unknown>) {
  return (
    toStringArray(record.cleanSteps).length > 0
      ? toStringArray(record.cleanSteps)
      : toStringArray(record.steps).length > 0
        ? toStringArray(record.steps)
        : toStringArray(record.instructions)
  );
}

function toPositiveInteger(value: unknown) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function normalizeForMatch(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function toNullableNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : null;
}

function toDifficulty(value: unknown): RefinedRagRecommendation['difficulty'] {
  return value === '简单' || value === '中等' || value === '偏难' ? value : '未知';
}
