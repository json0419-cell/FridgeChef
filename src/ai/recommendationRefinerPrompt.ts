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

/**
 * Builds the recipe-refining prompt in the language the user reads.
 *
 * The candidate corpus is Chinese. A single translated instruction inside an otherwise Chinese
 * prompt loses to the surrounding language and Gemini echoes Chinese titles and ingredient names
 * straight back into the output, so the whole instruction set switches language and the directive is
 * repeated first and last, framing every candidate in between.
 */
export function buildRecommendationRefinerPrompt({
  ingredients,
  settings,
  recommendations,
  extraPreference,
  outputLanguage = 'zh',
}: RecommendationRefinerPromptInput): string {
  const english = outputLanguage === 'en';
  const naturalLanguageInstruction = english
    ? 'Natural-language output fields must be written in English: title, scoreReason, matchedIngredients, missingIngredients, servingNote, cleanSteps, and notes.'
    : '自然语言输出字段必须使用简体中文：title、scoreReason、matchedIngredients、missingIngredients、servingNote、cleanSteps、notes。';

  const schemaExample = english
    ? {
        recommendations: [
          {
            rank: 1,
            recipeId: 'recipe_xxx',
            chunkId: 'recipe_xxx:chunk:0',
            title: 'Recipe name in English',
            scoreReason: 'Why this recipe fits the user in 1-2 sentences.',
            matchedIngredients: ['Available ingredient, named in English'],
            missingIngredients: ['Core ingredient the user is missing, named in English'],
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
      ? ingredients
          .map((item) => `${item.name}${formatQuantity(item.quantity)}${item.unit}`)
          .join(english ? ', ' : '、')
      : english
        ? 'None. The user has not provided any fridge ingredients.'
        : '无。用户当前没有提供冰箱食材。';
  const extraPreferenceText = extraPreference?.trim() || (english ? 'None' : '无');

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

  const lines = english
    ? [
        'OUTPUT LANGUAGE: ENGLISH.',
        'The candidate recipes below are written in Chinese. Translate every natural-language value you',
        'output into natural English, including recipe titles and every ingredient name. Never copy',
        'Chinese characters into an output field. The only exception is the difficulty enum in rule 3.',
        '',
        'You are the recipe step-writing assistant for the FridgeChef app.',
        'Your task: read the RAG candidate recipes, combine them with the ingredients the user has, the',
        'serving count and this round of requests, and return cooking steps a home cook can follow.',
        '',
        'Hard rules:',
        '1. You may only choose from the RAG candidates provided. Never invent a recipe name or recipeId that is not among them.',
        '2. Copy rank, recipeId and chunkId verbatim from the candidate; return an empty string when recipeId or chunkId is empty.',
        '3. difficulty must be exactly one of these internal enum values: 简单, 中等, 偏难, 未知. Do NOT translate the difficulty field.',
        `4. ${naturalLanguageInstruction}`,
        '5. First decide whether each candidate really is a recipe. A valid recipe has a recognisable dish name, ingredient information, and cooking or preparation actions.',
        '6. If a candidate is an advert, a table of contents, an ingredient encyclopedia entry, shopping information, a diary, a comment, a menu, a pure image caption, too garbled to judge, or a page with no actual cooking action, keep it out of recommendations.',
        '7. Do not add main ingredients or core seasonings the candidate does not mention. If basic staples such as oil, water or salt are needed, write them as "to taste" in the steps.',
        '8. cleanSteps must rewrite the raw RAG steps into a directly followable flow, preferably ordered as prep -> pre-treatment -> cooking -> seasoning and plating.',
        '9. You may merge duplicate steps, drop photo, eating or advert content with no cooking value, and add necessary heat, timing or doneness cues; never invent exact grams or precise times.',
        '10. If the original steps are clearly incomplete, generate only what the content supports and say in notes that the original recipe steps were incomplete.',
        '11. If the user provided no fridge ingredients this is inspiration browsing; do not filter out valid recipes just because missingIngredients is long.',
        '12. Always respect the dietary preferences and restrictions. If a candidate clearly contains something the user avoids or is allergic to, keep it out of recommendations.',
        '13. Take this round of requests into account. For example, when the user asks for Cantonese flavours, prefer light, umami, steamed, simmered, stewed or soup-style candidates. If no candidate fully satisfies it, say so in scoreReason or notes.',
        '14. If the user set a maximum cooking time, prefer recipes that finish within it and do not recommend candidates that clearly exceed it.',
        '15. If the user set a difficulty preference, prefer matching recipes. You may return 未知 when it cannot be judged, but do not rank clearly harder dishes first.',
        '16. If no candidate is a valid recipe, return {"recommendations": []}.',
        '17. Rank by this round of requests, coverage of the ingredients the user already has, step completeness and fit for the serving count. With an empty fridge, rank by the request, step completeness and how easy the dish is at home, and return every valid, suitable candidate.',
        '18. Return strict JSON only. No Markdown, no explanation.',
        '',
        'cleanSteps requirements:',
        '- Return 3-7 steps per dish, short but specific.',
        '- Each step holds one main action, so a beginner knows what to do next.',
        '- Keep timing, heat and doneness cues from the source when present; otherwise use state cues such as "stir-fry until just cooked" or "until the sauce thickens".',
        '- If the user is missing a core ingredient, do not pretend they have it; say so in missingIngredients and notes.',
        '',
        'Output JSON schema:',
        JSON.stringify(schemaExample, null, 2),
        '',
        'User information:',
        `Fridge ingredients: ${ingredientText}`,
        `Servings: ${settings.servings}`,
        `Request for this round: ${extraPreferenceText}`,
        `Dietary preferences and restrictions: ${settings.dietaryPreferences.trim() || 'None'}`,
        `Maximum cooking time: ${settings.maxTimeMinutes ? `within ${settings.maxTimeMinutes} minutes` : 'no limit'}`,
        `Difficulty preference: ${settings.preferredDifficulty === 'any' ? 'no preference' : settings.preferredDifficulty}`,
        '',
        'RAG candidate recipes JSON (Chinese source material):',
        JSON.stringify(candidates, null, 2),
        '',
        'REMINDER: every natural-language value you return must be in English, including title,',
        'matchedIngredients and missingIngredients. Translate the Chinese source material, do not echo it.',
      ]
    : [
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
      ];

  return lines.join('\n');
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
