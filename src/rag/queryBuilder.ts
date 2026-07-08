import type { AppSettings, Ingredient } from '../types';

export interface RagQueryOptions {
  ingredients: Ingredient[];
  settings: AppSettings;
  extraPreference?: string;
}

export function buildRecipeRagQuery({ ingredients, settings, extraPreference }: RagQueryOptions): string {
  if (ingredients.length === 0) {
    const preferenceText = buildPreferenceText(
      extraPreference?.trim() || '优先推荐家常、容易操作、食材常见、适合日常晚餐的菜。',
      settings,
    );

    return [
      '用户当前没有提供冰箱食材。',
      `用餐人数：${settings.servings} 人。`,
      `用户偏好：${preferenceText}`,
      '请作为灵感推荐，返回适合家庭烹饪、步骤清晰、食材容易购买的菜谱。',
    ].join('\n');
  }

  const ingredientText = ingredients.map((item) => `${item.name}${formatQuantity(item.quantity)}${item.unit}`).join('、');

  const preferenceText = buildPreferenceText(
    extraPreference?.trim() || '优先推荐家常、容易操作、适合当前食材的菜。',
    settings,
  );

  return [
    `我冰箱里的食材：${ingredientText}。`,
    `用餐人数：${settings.servings} 人。`,
    `用户偏好：${preferenceText}`,
    '请推荐匹配度高的菜谱，优先考虑已有主食材、做法清晰、适合家庭烹饪。',
  ].join('\n');
}

function buildPreferenceText(basePreference: string, settings: AppSettings) {
  const parts = [basePreference];
  if (settings.dietaryPreferences.trim()) {
    parts.push(`饮食偏好/忌口：${settings.dietaryPreferences.trim()}`);
  }

  if (settings.maxTimeMinutes) {
    parts.push(`最长耗时：${settings.maxTimeMinutes} 分钟内`);
  }

  if (settings.preferredDifficulty !== 'any') {
    parts.push(`难度偏好：${settings.preferredDifficulty}`);
  }

  return parts.join('；');
}

function formatQuantity(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
