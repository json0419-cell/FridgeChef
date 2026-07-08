import type { AppSettings, Ingredient, RagRecommendation } from '../types';

type OutputLanguage = 'zh' | 'en';

const MAX_CANDIDATES = 30;
const MAX_TEXT_LENGTH = 2400;

export interface RecommendationRefinerPromptInput {
  ingredients: Ingredient[];
  settings: AppSettings;
  recommendations: RagRecommendation[];
  extraPreference?: string;
  outputLanguage?: OutputLanguage;
}

export function buildRecommendationRefinerPrompt({
  ingredients,
  settings,
  recommendations,
  extraPreference,
  outputLanguage = 'zh',
}: RecommendationRefinerPromptInput): string {
  const naturalLanguageInstruction =
    outputLanguage === 'en'
      ? 'Natural-language output fields must be written in English: title, scoreReason, matchedIngredients, missingIngredients, servingNote, cleanSteps, and notes.'
      : '自然语言输出字段必须使用简体中文：title、scoreReason、matchedIngredients、missingIngredients、servingNote、cleanSteps、notes。';
  const schemaExample =
    outputLanguage === 'en'
      ? {
          recommendations: [
            {
              rank: 1,
              recipeId: 'recipe_xxx',
              chunkId: 'recipe_xxx:chunk:0',
              title: 'Recipe name',
              scoreReason: 'Why this recipe fits the user in 1-2 sentences.',
              matchedIngredients: ['Available ingredient from the candidate recipe'],
              missingIngredients: ['Core ingredient the user is missing'],
              difficulty: '简单 | 中等 | 偏难 | 未知',
              estimatedTimeMinutes: 15,
              servingNote: 'Fits 2 servings, or adjust based on servings.',
              cleanSteps: ['Short mobile-friendly step 1', 'Short step 2'],
              notes: 'Limitations, missing information, or reminders. Return an empty string if none.',
            },
          ],
        }
      : {
          recommendations: [
            {
              rank: 1,
              recipeId: 'recipe_xxx',
              chunkId: 'recipe_xxx:chunk:0',
              title: '菜名',
              scoreReason: '为什么适合当前用户，1-2 句话。',
              matchedIngredients: ['用户已有且候选中出现的食材'],
              missingIngredients: ['用户缺少但做这道菜需要的核心食材'],
              difficulty: '简单 | 中等 | 偏难 | 未知',
              estimatedTimeMinutes: 15,
              servingNote: '适合 2 人份，或需要按人数增减。',
              cleanSteps: ['适合手机展示的短步骤 1', '短步骤 2'],
              notes: '限制、缺失信息或提醒，没有就返回空字符串。',
            },
          ],
        };
  const ingredientText =
    ingredients.length > 0
      ? ingredients.map((item) => `${item.name}${formatQuantity(item.quantity)}${item.unit}`).join('、')
      : '无。用户当前没有提供冰箱食材。';
  const extraPreferenceText = extraPreference?.trim() || '无';

  const candidates = recommendations.slice(0, MAX_CANDIDATES).map((item, index) => ({
    rank: index + 1,
    id: item.id,
    recipeId: item.recipeId ?? '',
    chunkId: item.chunkId ?? '',
    title: item.title,
    retrievalScore: Number(item.score.toFixed(4)),
    mainIngredients: readStringArray(item.metadata.mainIngredients),
    seasonings: readStringArray(item.metadata.seasonings),
    ingredients: readStringArray(item.metadata.ingredients),
    tags: readStringArray(item.metadata.tags),
    estimatedTimeMinutes: readNullableNumber(item.metadata.estimatedTimeMinutes),
    difficulty: readStringValue(item.metadata.difficulty),
    ragText: truncateRecipeText(item.text, MAX_TEXT_LENGTH),
  }));

  return [
    '你是“吃什么”App 的 LLM 菜谱步骤生成助手。',
    '你的任务：读取 RAG 检索出来的候选菜谱，结合用户已有食材、用餐人数和本次推荐要求，返回更适合家庭实际操作的做菜步骤。',
    '',
    '硬性规则：',
    '1. 你只能选择我提供的 RAG 候选菜谱，不允许编造候选中不存在的菜名或 recipeId。',
    '2. rank、recipeId、chunkId 必须从候选中原样复制；如果 recipeId 或 chunkId 为空字符串就返回空字符串。',
    '3. difficulty 必须固定返回以下内部枚举之一：简单、中等、偏难、未知。不要翻译 difficulty 字段。',
    `4. ${naturalLanguageInstruction}`,
    '5. 必须先判断每个候选是否是真正的菜谱。有效菜谱至少要包含可识别的菜名、食材信息，以及烹饪/处理动作。',
    '6. 如果候选是广告、目录、食材百科、购物信息、日记、评论、菜单、纯图片说明、乱码到无法判断、或没有实际烹饪动作的页面，不要把它放进 recommendations。',
    '7. 不要新增候选中没有出现的主要食材或核心调料；如果需要补充油、水、盐这类基础厨房材料，必须在步骤中写成“按需”。',
    '8. cleanSteps 要把 RAG 原始步骤重写成可直接照做的流程，优先按“备料 -> 预处理 -> 烹饪 -> 调味/出锅”组织。',
    '9. 可以合并重复步骤、删除拍照/开吃/广告类无烹饪价值内容，并补充必要的火候、时长或状态判断；不要编造具体克数和精确时间。',
    '10. 如果原始步骤明显不完整，只基于已有内容生成能确定的步骤，并在 notes 里说明“原始菜谱步骤不完整”。',
    '11. 如果用户没有提供冰箱食材，这是灵感推荐，不要因为 missingIngredients 较多而过滤有效菜谱。',
    '12. 必须遵守用户饮食偏好/忌口；如果候选明显包含用户忌口、过敏或不想吃的内容，不要放进 recommendations。',
    '13. 必须考虑“本次推荐要求”。例如用户要求广东口味时，优先选择清淡、鲜味、蒸/煲/炖/汤类或更接近粤菜习惯的候选；如果候选无法完全满足，在 scoreReason 或 notes 里说明。',
    '14. 如果用户设置了最长耗时，优先选择能在该时间内完成的菜；明显超时的候选不要推荐。',
    '15. 如果用户设置了难度偏好，优先选择匹配难度；无法判断时可以返回“未知”，但不要把明显更难的菜排在前面。',
    '16. 如果所有候选都不是有效菜谱，返回 {"recommendations": []}。',
    '17. 优先按本次推荐要求、已有食材覆盖度高、步骤更完整、适合当前人数排序；空冰箱时优先按本次要求、步骤完整度和家常易做程度排序，返回所有有效且适合的候选。',
    '18. 只返回严格 JSON，不要 Markdown，不要解释。',
    '',
    'cleanSteps 要求：',
    '- 每道菜返回 3-7 条，步骤短但具体。',
    '- 每条包含一个主要动作，能让厨房新手理解下一步要做什么。',
    '- 如果原文有时间、火候、熟度描述，尽量保留；没有时用“炒至断生”“汤汁变浓”等状态判断。',
    '- 如果用户缺少核心食材，不要假装已经拥有，在 missingIngredients 和 notes 里说明。',
    '',
    '输出 JSON schema：',
    JSON.stringify(schemaExample, null, 2),
    '',
    '用户信息：',
    `冰箱食材：${ingredientText}`,
    `用餐人数：${settings.servings} 人`,
    `本次推荐要求：${extraPreferenceText}`,
    `饮食偏好/忌口：${settings.dietaryPreferences.trim() || '无'}`,
    `最长耗时：${settings.maxTimeMinutes ? `${settings.maxTimeMinutes} 分钟内` : '不限'}`,
    `难度偏好：${settings.preferredDifficulty === 'any' ? '不限' : settings.preferredDifficulty}`,
    '',
    'RAG 候选菜谱 JSON：',
    JSON.stringify(candidates, null, 2),
  ].join('\n');
}

function formatQuantity(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function readStringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readNullableNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function truncateRecipeText(value: string, maxLength: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  const stepsStart = trimmed.indexOf('步骤：');
  if (stepsStart <= 0) {
    return `${trimmed.slice(0, maxLength)}...`;
  }

  const headLength = Math.min(650, Math.floor(maxLength * 0.35));
  const stepsLength = maxLength - headLength - 28;
  return `${trimmed.slice(0, headLength)}...\n[中间内容已省略，以下保留原始做法]\n${trimmed.slice(stepsStart, stepsStart + stepsLength)}...`;
}
