import { buildFoodRecognitionPrompt } from './prompt';
import { buildGeminiGenerateContentEndpoint } from './geminiConfig';
import { extractGeminiText, extractJsonObject, parseRecognitionJson } from './json';
import type { RecognitionResult, UserRecipeDifficulty } from '../types';

type OutputLanguage = 'zh' | 'en';

interface GeminiRecognitionInput {
  apiKey: string;
  imageBase64: string;
  mimeType: string;
  outputLanguage?: OutputLanguage;
}

interface GeminiYoutubeRecipeInput {
  apiKey: string;
  youtubeUrl: string;
  outputLanguage?: OutputLanguage;
}

export interface GeneratedYoutubeRecipe {
  title: string;
  description: string;
  mainIngredients: string[];
  seasonings: string[];
  steps: string[];
  tags: string[];
  estimatedTimeMinutes: number | null;
  difficulty: UserRecipeDifficulty;
  sourceUrl: string;
}

export async function recognizeWithGemini({
  apiKey,
  imageBase64,
  mimeType,
  outputLanguage = 'zh',
}: GeminiRecognitionInput): Promise<RecognitionResult> {
  const response = await fetch(buildGeminiGenerateContentEndpoint(apiKey), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: buildFoodRecognitionPrompt(outputLanguage) },
            {
              inline_data: {
                mime_type: mimeType,
                data: imageBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        response_mime_type: 'application/json',
        temperature: 0,
      },
    }),
  });

  const data = await readJsonResponse(response, 'Gemini 识别失败');
  return parseRecognitionJson(extractGeminiText(data));
}

export async function generateRecipeFromYouTubeWithGemini({
  apiKey,
  youtubeUrl,
  outputLanguage = 'zh',
}: GeminiYoutubeRecipeInput): Promise<GeneratedYoutubeRecipe> {
  const response = await fetch(buildGeminiGenerateContentEndpoint(apiKey), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              file_data: {
                file_uri: youtubeUrl,
              },
            },
            { text: buildYoutubeRecipePrompt(outputLanguage) },
          ],
        },
      ],
      generationConfig: {
        response_mime_type: 'application/json',
        temperature: 0.1,
      },
    }),
  });

  const data = await readJsonResponse(response, 'Gemini YouTube 菜谱生成失败');
  return parseYoutubeRecipeJson(extractGeminiText(data), youtubeUrl);
}

function buildYoutubeRecipePrompt(outputLanguage: OutputLanguage) {
  const naturalLanguageInstruction =
    outputLanguage === 'en'
      ? 'Natural-language fields must be written in English: title, description, mainIngredients, seasonings, steps, tags, and notes if any.'
      : '自然语言字段必须使用简体中文：title、description、mainIngredients、seasonings、steps、tags。';

  const schemaExample =
    outputLanguage === 'en'
      ? {
          isRecipe: true,
          title: 'Recipe name',
          description: 'One-sentence summary',
          mainIngredients: ['Main ingredient, optionally with amount'],
          seasonings: ['Seasoning, optionally with amount'],
          steps: ['Step 1', 'Step 2'],
          tags: ['quick meal', 'dinner'],
          estimatedTimeMinutes: 30,
          difficulty: '简单 | 中等 | 偏难 | 未知',
        }
      : {
          isRecipe: true,
          title: '菜名',
          description: '一句话简介',
          mainIngredients: ['主食材，可包含用量'],
          seasonings: ['调料，可包含用量'],
          steps: ['步骤 1', '步骤 2'],
          tags: ['快手菜', '晚餐'],
          estimatedTimeMinutes: 30,
          difficulty: '简单 | 中等 | 偏难 | 未知',
        };

  return [
    '你是一个严谨的做菜视频菜谱提取器。',
    '请分析这个公开视频，提取可以保存到用户私人菜谱库的菜谱草稿。',
    '如果视频不是实际菜谱、没有完整做菜过程、只是吃播/测评/广告/合集目录，或无法可靠提取做法，请返回 isRecipe=false。',
    naturalLanguageInstruction,
    'difficulty 必须固定返回以下内部枚举之一：简单、中等、偏难、未知。不要翻译 difficulty 字段。',
    '不要编造视频里没有依据的步骤；数量不明确时可以只写食材名。',
    '步骤需要适合普通用户直接照着做，按烹饪顺序拆成清晰短句。',
    '只返回严格 JSON，不要 Markdown，不要解释。',
    'JSON schema:',
    JSON.stringify(schemaExample),
  ].join('\n');
}

export async function testGeminiConnection(apiKey: string): Promise<void> {
  const response = await fetch(buildGeminiGenerateContentEndpoint(apiKey), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: '只返回严格 JSON：{"ok":true}' }],
        },
      ],
      generationConfig: {
        response_mime_type: 'application/json',
        temperature: 0,
      },
    }),
  });

  await readJsonResponse(response, 'Gemini 连接测试失败');
}

function parseYoutubeRecipeJson(raw: string, youtubeUrl: string): GeneratedYoutubeRecipe {
  const parsed = JSON.parse(extractJsonObject(raw)) as unknown;
  const root = asRecord(parsed);

  if (!root) {
    throw new Error('Gemini 返回的菜谱不是有效对象。');
  }

  if (root.isRecipe === false) {
    throw new Error('Gemini 判断这个视频不是可提取的完整菜谱。');
  }

  const recipe: GeneratedYoutubeRecipe = {
    title: toStringValue(root.title).trim(),
    description: toStringValue(root.description).trim(),
    mainIngredients: toStringList(root.mainIngredients),
    seasonings: toStringList(root.seasonings),
    steps: toStringList(root.steps),
    tags: toStringList(root.tags),
    estimatedTimeMinutes: toNullableNumber(root.estimatedTimeMinutes),
    difficulty: toDifficulty(root.difficulty),
    sourceUrl: youtubeUrl,
  };

  if (!recipe.title) {
    throw new Error('Gemini 没有返回菜名。');
  }

  if (recipe.mainIngredients.length === 0) {
    throw new Error('Gemini 没有返回主食材。');
  }

  if (recipe.steps.length === 0) {
    throw new Error('Gemini 没有返回做菜步骤。');
  }

  return recipe;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function toStringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function toStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => toStringValue(item).trim()).filter(Boolean);
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : null;
}

function toDifficulty(value: unknown): UserRecipeDifficulty {
  return value === '简单' || value === '中等' || value === '偏难' || value === '未知' ? value : '未知';
}
