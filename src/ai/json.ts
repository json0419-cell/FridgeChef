import type { RecognitionResult, RecognizedFoodItem } from '../types';

export function parseRecognitionJson(raw: string): RecognitionResult {
  const jsonText = extractJsonObject(raw);
  const parsed = JSON.parse(jsonText) as unknown;
  const root = asRecord(parsed);
  const itemsValue = root?.items;

  if (!Array.isArray(itemsValue)) {
    throw new Error('AI 返回的数据中缺少 items 数组。');
  }

  const items = itemsValue
    .map(toRecognizedFoodItem)
    .filter((item): item is RecognizedFoodItem => Boolean(item?.name));

  return { items };
}

export function extractGeminiText(response: unknown): string {
  const root = asRecord(response);
  const candidates = root?.candidates;

  if (!Array.isArray(candidates)) {
    throw new Error('无法读取 Gemini 返回文本。');
  }

  const parts = asRecord(asRecord(candidates[0])?.content)?.parts;
  if (!Array.isArray(parts)) {
    throw new Error('Gemini 返回中缺少 content.parts。');
  }

  const text = parts
    .map((part) => asRecord(part)?.text)
    .filter((value): value is string => typeof value === 'string')
    .join('\n');

  if (!text.trim()) {
    throw new Error('Gemini 返回内容为空。');
  }

  return text;
}

function toRecognizedFoodItem(value: unknown): RecognizedFoodItem | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const name = toStringValue(record.name).trim();
  if (!name) {
    return null;
  }

  return {
    name,
    category: toStringValue(record.category) || '未分类',
    estimatedQuantity: toNullableNumber(record.estimatedQuantity),
    unit: toStringValue(record.unit) || '份',
    confidence: clampConfidence(toNumber(record.confidence, 0)),
    notes: toStringValue(record.notes),
  };
}

export function extractJsonObject(raw: string) {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');

    if (start >= 0 && end > start) {
      return trimmed.slice(start, end + 1);
    }

    throw new Error('AI 返回的内容不是有效 JSON。');
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function toStringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function toNumber(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, value));
}
