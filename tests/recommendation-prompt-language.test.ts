import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRecommendationRefinerPrompt } from '../src/ai/recommendationRefinerPrompt.ts';
import type { AppSettings, Ingredient, RagRecommendation } from '../src/types';

const CJK = /[一-鿿]/;

const ingredients: Ingredient[] = [
  { id: 'i1', name: 'Egg', quantity: 2, unit: 'pcs', category: 'other', source: 'manual', createdAt: '', updatedAt: '' } as Ingredient,
];

const settings = {
  servings: 2,
  dietaryPreferences: '',
  maxTimeMinutes: 30,
  preferredDifficulty: 'any',
} as AppSettings;

// A Chinese candidate, because that is what the corpus actually holds.
const candidate = {
  id: 'c1',
  recipeId: 'recipe_1',
  chunkId: 'recipe_1:chunk:0',
  title: '番茄炒蛋',
  score: 0.8,
  text: '步骤：打散鸡蛋，下锅翻炒。',
  metadata: {
    mainIngredients: ['鸡蛋', '番茄'],
    seasonings: ['盐'],
    tags: ['家常菜'],
    difficulty: '简单',
    estimatedTimeMinutes: 15,
  },
} as unknown as RagRecommendation;

function buildEnglishPrompt() {
  return buildRecommendationRefinerPrompt({
    ingredients,
    settings,
    recommendations: [candidate],
    outputLanguage: 'en',
  });
}

/**
 * The bug: the prompt carried 18 Chinese rules plus Chinese candidates, and the lone English
 * instruction lost to the surrounding language. Gemini echoed Chinese recipe titles and ingredient
 * names into title, matchedIngredients and missingIngredients.
 */
test('the English prompt carries no Chinese instructions of its own', () => {
  const prompt = buildEnglishPrompt();
  // Candidate data and the difficulty enum are legitimately Chinese; the instructions are not, so
  // the enum values are stripped before looking for any Chinese left over.
  const instructions = prompt.slice(0, prompt.indexOf('Output JSON schema:'));
  const chineseInstructionLines = instructions
    .split('\n')
    .map((line) => line.replace(/简单|中等|偏难|未知/g, ''))
    .filter((line) => CJK.test(line));

  assert.deepEqual(chineseInstructionLines, []);
});

test('the English prompt opens and closes by demanding English output', () => {
  const prompt = buildEnglishPrompt();
  assert.match(prompt, /^OUTPUT LANGUAGE: ENGLISH\./);
  assert.match(prompt, /REMINDER: every natural-language value you return must be in English/);
});

test('the English prompt names the fields that were coming back in Chinese', () => {
  const prompt = buildEnglishPrompt();
  for (const field of ['title', 'matchedIngredients', 'missingIngredients']) {
    assert.ok(prompt.includes(field), `${field} must be covered by the language directive`);
  }
  assert.match(prompt, /Translate the Chinese source material/);
});

// difficulty is an internal enum the app maps to a localized label, so it must survive untranslated.
test('difficulty stays an untranslated internal enum in both languages', () => {
  for (const outputLanguage of ['en', 'zh'] as const) {
    const prompt = buildRecommendationRefinerPrompt({
      ingredients,
      settings,
      recommendations: [candidate],
      outputLanguage,
    });
    assert.match(prompt, /简单/);
    assert.ok(/[Dd]o ?NOT translate the difficulty field|不要翻译 difficulty 字段/.test(prompt));
  }
});

test('the Chinese prompt is unchanged in shape and stays Chinese', () => {
  const prompt = buildRecommendationRefinerPrompt({
    ingredients,
    settings,
    recommendations: [candidate],
    outputLanguage: 'zh',
  });
  assert.match(prompt, /^你是“吃什么”App 的 LLM 菜谱步骤生成助手。/);
  assert.doesNotMatch(prompt, /OUTPUT LANGUAGE: ENGLISH/);
});

test('defaulting the language keeps the Chinese prompt', () => {
  const prompt = buildRecommendationRefinerPrompt({ ingredients, settings, recommendations: [candidate] });
  assert.match(prompt, /^你是“吃什么”App/);
});
