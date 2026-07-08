import type { File } from 'expo-file-system';
import { NativeModules } from 'react-native';
import { listInstalledDatasets } from '../datasets/datasetRegistry';
import { listEnabledUserRecipesWithLibraries, type UserRecipeWithLibrary } from '../db/userRecipesRepository';
import { getSettings } from '../storage/settingsStorage';
import type {
  Ingredient,
  InstalledDataset,
  InstalledEmbeddingModel,
  RagMetadataRecord,
  RagRecommendation,
  VectorSearchResult,
} from '../types';
import { JsonlMetadataStore } from './metadata/JsonlMetadataStore';
import { getActiveEmbeddingModel } from './model/modelRegistry';
import { getPersonalRagRecommendations } from './personalRagService';
import { buildRecipeRagQuery } from './queryBuilder';
import { F32VectorStore, getMetadataFileForDataset } from './vectorStore/F32VectorStore';

export interface RagRecommendationResult {
  mode: 'rag';
  datasetName: string;
  modelName: string;
  query: string;
  recommendations: RagRecommendation[];
}

export interface RagUnavailableResult {
  mode: 'unavailable';
  reason: 'no_dataset' | 'no_model' | 'runtime_error';
  message: string;
}

export type RagResult = RagRecommendationResult | RagUnavailableResult;

interface QueryEmbedder {
  embed(text: string): Promise<Float32Array>;
}

interface SearchTerm {
  value: string;
  weight: number;
}

const MAX_OFFICIAL_METADATA_ROWS_TO_SCAN = 3000;
const RANDOM_OFFICIAL_SAMPLE_MULTIPLIER = 20;
const RANDOM_RECIPE_MIN_SHAPE_SCORE = 2.5;

let cachedEmbedderKey: string | null = null;
let cachedEmbedder: QueryEmbedder | null = null;
let inFlightRagKey: string | null = null;
let inFlightRagPromise: Promise<RagResult> | null = null;

export async function getRagRecommendations(ingredients: Ingredient[], topK = 5, extraPreference = ''): Promise<RagResult> {
  const normalizedExtraPreference = normalizeText(extraPreference);
  const requestKey = buildRagRequestKey(ingredients, topK, normalizedExtraPreference);
  if (inFlightRagPromise && inFlightRagKey === requestKey) {
    return inFlightRagPromise;
  }

  const promise = runRagRecommendations(ingredients, topK, normalizedExtraPreference);
  inFlightRagKey = requestKey;
  inFlightRagPromise = promise;

  try {
    return await promise;
  } finally {
    if (inFlightRagPromise === promise) {
      inFlightRagPromise = null;
      inFlightRagKey = null;
    }
  }
}

async function runRagRecommendations(ingredients: Ingredient[], topK: number, extraPreference: string): Promise<RagResult> {
  try {
    const [datasets, personalRecipes, settings] = await Promise.all([
      listInstalledDatasets(),
      listEnabledUserRecipesWithLibraries(),
      getSettings(),
    ]);
    const dataset = datasets.find((item) => item.active) ?? null;

    if (!dataset && personalRecipes.length === 0) {
      return {
        mode: 'unavailable',
        reason: 'no_dataset',
        message: '还没有启用的 RAG 菜谱库，请先在“菜谱库”下载官方库，或启用一个我的菜谱库。',
      };
    }

    const query = buildRecipeRagQuery({ ingredients, settings, extraPreference });
    if (ingredients.length === 0 && !extraPreference) {
      return await runRandomRagRecommendations({
        dataset,
        personalRecipes,
        query,
        topK,
      });
    }

    const model = await getActiveEmbeddingModel();

    if (model && NativeModules.Onnxruntime) {
      try {
        return await runVectorRagRecommendations({
          dataset,
          personalRecipes,
          model,
          query,
          topK,
        });
      } catch {
        // Keep recommendation usable if the installed ONNX tokenizer/model cannot run.
      }
    }

    return await runTextRagRecommendations({
      dataset,
      personalRecipes,
      ingredients,
      query,
      topK,
    });
  } catch (error) {
    return {
      mode: 'unavailable',
      reason: 'runtime_error',
      message: `RAG 运行失败：${formatError(error)}`,
    };
  }
}

async function runRandomRagRecommendations({
  dataset,
  personalRecipes,
  query,
  topK,
}: {
  dataset: InstalledDataset | null;
  personalRecipes: UserRecipeWithLibrary[];
  query: string;
  topK: number;
}): Promise<RagRecommendationResult> {
  const recommendations: RagRecommendation[] = [];

  if (dataset) {
    const metadataFile = await getMetadataFileForDataset(dataset);
    recommendations.push(...(await getRandomOfficialRecommendations(metadataFile, dataset.chunkCount, topK)));
  }

  if (personalRecipes.length > 0) {
    recommendations.push(...getRandomPersonalRecommendations(personalRecipes, topK));
  }

  return {
    mode: 'rag',
    datasetName: buildRagDatasetName(dataset?.name, getPersonalLibraryNames(personalRecipes)),
    modelName: '随机灵感推荐',
    query,
    recommendations: assignRandomRecommendationScores(dedupeRecommendationsByRecipe(shuffle(recommendations)).slice(0, topK)),
  };
}

async function runVectorRagRecommendations({
  dataset,
  personalRecipes,
  model,
  query,
  topK,
}: {
  dataset: InstalledDataset | null;
  personalRecipes: UserRecipeWithLibrary[];
  model: InstalledEmbeddingModel;
  query: string;
  topK: number;
}): Promise<RagRecommendationResult> {
  const embedder = getCachedBgeM3Embedder(model);
  const queryVector = await embedder.embed(query);
  const recommendations: RagRecommendation[] = [];

  if (dataset) {
    const searchResults = await new F32VectorStore(dataset).search(queryVector, topK);
    const metadataFile = await getMetadataFileForDataset(dataset);
    const metadataRecords = await new JsonlMetadataStore(metadataFile).getByIndices(searchResults.map((item) => item.index));
    const metadataByIndex = new Map(metadataRecords.map((record) => [record.index, record]));
    recommendations.push(
      ...searchResults.reduce<RagRecommendation[]>((items, result) => {
        const record = metadataByIndex.get(result.index);
        if (record) {
          items.push(toOfficialRagRecommendation(record, pickTitle(record.metadata) ?? record.recipeId ?? record.chunkId ?? `结果 ${record.index}`, result.score));
        }
        return items;
      }, []),
    );
  }

  if (personalRecipes.length > 0) {
    recommendations.push(
      ...(await getPersonalRagRecommendations({
        recipes: personalRecipes,
        queryVector,
        model,
        embedder,
        topK,
      })),
    );
  }

  return {
    mode: 'rag',
    datasetName: buildRagDatasetName(dataset?.name, getPersonalLibraryNames(personalRecipes)),
    modelName: model.name,
    query,
    recommendations: recommendations.sort((a, b) => b.score - a.score).slice(0, topK),
  };
}

async function runTextRagRecommendations({
  dataset,
  personalRecipes,
  ingredients,
  query,
  topK,
}: {
  dataset: InstalledDataset | null;
  personalRecipes: UserRecipeWithLibrary[];
  ingredients: Ingredient[];
  query: string;
  topK: number;
}): Promise<RagRecommendationResult> {
  const searchTerms = buildSearchTerms(query, ingredients);
  const recommendations: RagRecommendation[] = [];

  if (dataset) {
    const metadataFile = await getMetadataFileForDataset(dataset);
    recommendations.push(...(await searchOfficialMetadata(metadataFile, searchTerms, topK)));
  }

  if (personalRecipes.length > 0) {
    recommendations.push(...searchPersonalRecipes(personalRecipes, searchTerms, topK));
  }

  return {
    mode: 'rag',
    datasetName: buildRagDatasetName(dataset?.name, getPersonalLibraryNames(personalRecipes)),
    modelName: '本地文本检索',
    query,
    recommendations: recommendations.sort((a, b) => b.score - a.score).slice(0, topK),
  };
}

async function searchOfficialMetadata(
  metadataFile: File,
  searchTerms: SearchTerm[],
  topK: number,
): Promise<RagRecommendation[]> {
  const top: RagRecommendation[] = [];
  const decoder = new TextDecoder('utf-8');
  const reader = metadataFile.readableStream().getReader();
  let lineBuffer = '';
  let fallbackIndex = 0;
  let shouldStop = false;

  try {
    while (!shouldStop) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      lineBuffer += decoder.decode(value, { stream: true });
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';

      for (const line of lines) {
        const recommendation = scoreOfficialLine(line, fallbackIndex, searchTerms);
        fallbackIndex += 1;
        if (recommendation) {
          pushTopK(top, recommendation, topK);
        }

        if (fallbackIndex >= MAX_OFFICIAL_METADATA_ROWS_TO_SCAN && top.length >= topK) {
          shouldStop = true;
          break;
        }
      }
    }

    const tail = `${lineBuffer}${decoder.decode()}`.trim();
    if (!shouldStop && tail) {
      const recommendation = scoreOfficialLine(tail, fallbackIndex, searchTerms);
      if (recommendation) {
        pushTopK(top, recommendation, topK);
      }
    }
  } finally {
    reader.releaseLock();
  }

  return top.sort((a, b) => b.score - a.score);
}

function scoreOfficialLine(line: string, fallbackIndex: number, searchTerms: SearchTerm[]) {
  const record = parseMetadataRecord(line, fallbackIndex);
  if (!record) {
    return null;
  }

  const title = pickTitle(record.metadata) ?? record.recipeId ?? record.chunkId ?? `结果 ${record.index}`;
  const searchText = buildOfficialSearchText(record, title);
  const score = scoreSearchText(searchText, title, record.metadata, searchTerms);
  if (score <= 0) {
    return null;
  }

  return toOfficialRagRecommendation(record, title, score);
}

async function getRandomOfficialRecommendations(
  metadataFile: File,
  totalRows: number,
  topK: number,
): Promise<RagRecommendation[]> {
  if (topK <= 0 || totalRows <= 0) {
    return [];
  }

  const sampleSize = Math.min(totalRows, Math.max(topK, topK * RANDOM_OFFICIAL_SAMPLE_MULTIPLIER));
  const indices = getRandomIndices(totalRows, sampleSize);
  const records = await new JsonlMetadataStore(metadataFile).getByIndices(indices);

  return records
    .map(toRandomOfficialRecommendation)
    .filter((item): item is RagRecommendation => Boolean(item));
}

function toRandomOfficialRecommendation(record: RagMetadataRecord): RagRecommendation | null {
  const title = pickTitle(record.metadata) ?? record.recipeId ?? record.chunkId ?? `结果 ${record.index}`;
  const searchText = buildOfficialSearchText(record, title);
  const shapeScore = recipeShapeBonus(searchText, record.metadata);

  if (record.text.trim().length === 0 || shapeScore < RANDOM_RECIPE_MIN_SHAPE_SCORE) {
    return null;
  }

  return toOfficialRagRecommendation(record, title, shapeScore + Math.random() * 0.01);
}

function getRandomPersonalRecommendations(recipes: UserRecipeWithLibrary[], topK: number): RagRecommendation[] {
  return shuffle(recipes)
    .slice(0, topK)
    .map((recipe) => toPersonalRagRecommendation(recipe, buildPersonalRecipeText(recipe), 1));
}

function searchPersonalRecipes(
  recipes: UserRecipeWithLibrary[],
  searchTerms: SearchTerm[],
  topK: number,
): RagRecommendation[] {
  const top: RagRecommendation[] = [];

  for (const recipe of recipes) {
    const text = buildPersonalRecipeText(recipe);
    const score = scoreSearchText(text, recipe.title, recipe, searchTerms);
    if (score <= 0) {
      continue;
    }

    pushTopK(top, toPersonalRagRecommendation(recipe, text, score), topK);
  }

  return top.sort((a, b) => b.score - a.score);
}

function parseMetadataRecord(line: string, fallbackIndex: number): RagMetadataRecord | null {
  try {
    const parsed = JSON.parse(line.replace(/^\uFEFF/, '').trim()) as Partial<RagMetadataRecord>;
    return {
      index: typeof parsed.index === 'number' ? parsed.index : fallbackIndex,
      chunkId: typeof parsed.chunkId === 'string' ? parsed.chunkId : undefined,
      recipeId: typeof parsed.recipeId === 'string' ? parsed.recipeId : undefined,
      chunkIndex: typeof parsed.chunkIndex === 'number' ? parsed.chunkIndex : undefined,
      chunkType: typeof parsed.chunkType === 'string' ? parsed.chunkType : undefined,
      text: typeof parsed.text === 'string' ? parsed.text : '',
      metadata: parsed.metadata && typeof parsed.metadata === 'object' ? parsed.metadata : {},
    };
  } catch {
    return null;
  }
}

function toOfficialRagRecommendation(record: RagMetadataRecord, title: string, score: number): RagRecommendation {
  return {
    id: record.chunkId ?? `${record.recipeId ?? 'recipe'}_${record.index}`,
    title,
    score,
    text: record.text,
    recipeId: record.recipeId,
    chunkId: record.chunkId,
    metadata: {
      ...record.metadata,
      source: 'official',
      sourceLabel: '官方菜谱库',
    },
  };
}

function toPersonalRagRecommendation(recipe: UserRecipeWithLibrary, text: string, score: number): RagRecommendation {
  return {
    id: `${recipe.id}:personal`,
    title: recipe.title,
    score,
    text,
    recipeId: recipe.id,
    chunkId: `${recipe.id}:personal`,
    metadata: {
      source: 'personal',
      sourceLabel: `我的菜谱库：${recipe.libraryName}`,
      libraryId: recipe.libraryId,
      libraryName: recipe.libraryName,
      mainIngredients: recipe.mainIngredients,
      seasonings: recipe.seasonings,
      tags: recipe.tags,
      estimatedTimeMinutes: recipe.estimatedTimeMinutes,
      difficulty: recipe.difficulty,
      sourceType: recipe.sourceType,
      sourceUrl: recipe.sourceUrl,
    },
  };
}

function buildSearchTerms(query: string, ingredients: Ingredient[]) {
  const terms = new Map<string, number>();
  const normalizedQuery = normalizeText(query);

  for (const ingredient of ingredients) {
    addSearchTerm(terms, ingredient.name, 8);
  }

  for (const token of tokenize(query)) {
    addSearchTerm(terms, token, 1);
  }

  for (const cookingTerm of ['菜谱', '食材', '材料', '步骤', '做法', '家常', '晚餐', '炒', '煮', '煎', '蒸', '烤', '炖', '调味']) {
    addSearchTerm(terms, cookingTerm, ingredients.length === 0 ? 1.5 : 0.35);
  }

  addStyleSearchTerms(terms, normalizedQuery, ingredients.length);

  return Array.from(terms, ([value, weight]) => ({ value, weight }));
}

function addStyleSearchTerms(terms: Map<string, number>, normalizedQuery: string, ingredientCount: number) {
  const requestWeight = ingredientCount === 0 ? 4 : 2;

  if (/广东|粤菜|广式|cantonese/.test(normalizedQuery)) {
    for (const term of ['广东', '粤菜', '广式', '清淡', '鲜', '蒸', '煲', '汤', '豉油']) {
      addSearchTerm(terms, term, requestWeight);
    }
  }

  if (/清淡|少油|light|healthy/.test(normalizedQuery)) {
    for (const term of ['清淡', '少油', '蒸', '煮', '炖', '汤']) {
      addSearchTerm(terms, term, requestWeight);
    }
  }

  if (/不要辣|不辣|少辣|not spicy|mild/.test(normalizedQuery)) {
    for (const term of ['不辣', '清淡', '鲜', '蒸', '煮', '炖']) {
      addSearchTerm(terms, term, requestWeight);
    }
  }

  if (/小孩|孩子|儿童|kid|child/.test(normalizedQuery)) {
    for (const term of ['儿童', '小孩', '不辣', '清淡', '营养', '蒸']) {
      addSearchTerm(terms, term, requestWeight);
    }
  }

  if (/汤|煲|炖|soup|broth|stew|braise/.test(normalizedQuery)) {
    for (const term of ['汤', '煲', '炖', '焖', '煮']) {
      addSearchTerm(terms, term, requestWeight);
    }
  }

  if (/快手|快速|简单|easy|quick/.test(normalizedQuery)) {
    for (const term of ['快手', '简单', '家常', '炒', '煎']) {
      addSearchTerm(terms, term, requestWeight);
    }
  }

  if (/高蛋白|蛋白|protein/.test(normalizedQuery)) {
    for (const term of ['鸡蛋', '鸡胸', '牛肉', '鱼', '虾', '豆腐', '高蛋白']) {
      addSearchTerm(terms, term, requestWeight);
    }
  }

  if (/下饭|rice-friendly|rice friendly/.test(normalizedQuery)) {
    for (const term of ['下饭', '家常', '炒', '焖', '酱', '红烧']) {
      addSearchTerm(terms, term, requestWeight);
    }
  }

  if (/家常|home-style|home style/.test(normalizedQuery)) {
    for (const term of ['家常', '晚餐', '炒', '煮', '简单']) {
      addSearchTerm(terms, term, requestWeight);
    }
  }

  if (/一人食|solo|single/.test(normalizedQuery)) {
    for (const term of ['一人食', '简单', '快手', '炒', '面', '饭']) {
      addSearchTerm(terms, term, requestWeight);
    }
  }

  if (/低碳水|少碳水|low carb/.test(normalizedQuery)) {
    for (const term of ['低碳水', '鸡胸', '鱼', '虾', '蛋', '豆腐', '蔬菜']) {
      addSearchTerm(terms, term, requestWeight);
    }
  }

  if (/减脂|weight-loss|weight loss|diet/.test(normalizedQuery)) {
    for (const term of ['减脂', '少油', '低脂', '鸡胸', '鱼', '虾', '蔬菜', '蒸']) {
      addSearchTerm(terms, term, requestWeight);
    }
  }

  if (/暖胃|warming/.test(normalizedQuery)) {
    for (const term of ['暖胃', '汤', '粥', '炖', '煲', '姜']) {
      addSearchTerm(terms, term, requestWeight);
    }
  }

  if (/蒸菜|蒸|steamed/.test(normalizedQuery)) {
    for (const term of ['蒸', '清蒸', '蒸菜']) {
      addSearchTerm(terms, term, requestWeight);
    }
  }

  if (/早餐|breakfast/.test(normalizedQuery)) {
    for (const term of ['早餐', '鸡蛋', '粥', '面', '饼', '快手']) {
      addSearchTerm(terms, term, requestWeight);
    }
  }

  if (/便当|午餐|lunch box|lunch/.test(normalizedQuery)) {
    for (const term of ['便当', '午餐', '米饭', '家常', '炒', '焖']) {
      addSearchTerm(terms, term, requestWeight);
    }
  }

  if (/晚餐|dinner/.test(normalizedQuery)) {
    for (const term of ['晚餐', '家常', '下饭', '汤', '炒']) {
      addSearchTerm(terms, term, requestWeight);
    }
  }

  if (/素食|素菜|vegetarian/.test(normalizedQuery)) {
    for (const term of ['素食', '素菜', '蔬菜', '豆腐', '菌菇']) {
      addSearchTerm(terms, term, requestWeight);
    }
  }

  if (/少洗碗|less cleanup|one pot|one-pot/.test(normalizedQuery)) {
    for (const term of ['一锅', '焖', '煮', '炖', '电饭煲', '快手']) {
      addSearchTerm(terms, term, requestWeight);
    }
  }
}

function addSearchTerm(terms: Map<string, number>, value: string, weight: number) {
  const normalized = normalizeText(value);
  if (normalized.length === 0 || STOP_WORDS.has(normalized)) {
    return;
  }

  terms.set(normalized, Math.max(terms.get(normalized) ?? 0, weight));
}

function scoreSearchText(
  rawText: string,
  rawTitle: string,
  metadata: { mainIngredients?: unknown; ingredients?: unknown },
  searchTerms: SearchTerm[],
) {
  const text = normalizeText(rawText);
  const title = normalizeText(rawTitle);
  let score = recipeShapeBonus(text, metadata);

  for (const term of searchTerms) {
    const textHits = countOccurrences(text, term.value);
    if (textHits > 0) {
      score += Math.min(textHits, 5) * term.weight;
    }

    if (title.includes(term.value)) {
      score += term.weight * 2.5;
    }
  }

  return score;
}

function recipeShapeBonus(text: string, metadata: { mainIngredients?: unknown; ingredients?: unknown }) {
  let score = 0;
  if (text.length >= 80) {
    score += 0.8;
  }

  if (readStringArray(metadata.mainIngredients).length > 0 || readStringArray(metadata.ingredients).length > 0) {
    score += 2.5;
  }

  if (/步骤|做法|材料|食材|调料|下锅|翻炒|煮|煎|蒸|烤|炖|焯水|出锅/.test(text)) {
    score += 2;
  }

  return score;
}

function buildOfficialSearchText(record: RagMetadataRecord, title: string) {
  return [
    title,
    record.text,
    metadataValueToText(record.metadata.title),
    metadataValueToText(record.metadata.name),
    metadataValueToText(record.metadata.mainIngredients),
    metadataValueToText(record.metadata.ingredients),
    metadataValueToText(record.metadata.seasonings),
    metadataValueToText(record.metadata.tags),
  ].join('\n');
}

function buildPersonalRecipeText(recipe: UserRecipeWithLibrary) {
  return [
    `菜名：${recipe.title}`,
    recipe.description ? `简介：${recipe.description}` : '',
    `来源：我的菜谱库：${recipe.libraryName}`,
    `主食材：${formatList(recipe.mainIngredients)}`,
    `调料：${formatList(recipe.seasonings)}`,
    `标签：${formatList(recipe.tags)}`,
    recipe.estimatedTimeMinutes ? `耗时：${recipe.estimatedTimeMinutes} 分钟` : '',
    `难度：${recipe.difficulty}`,
    `步骤：${recipe.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function metadataValueToText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(metadataValueToText).filter(Boolean).join(' ');
  }

  return '';
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(/[\s,，。！？、;；:：()（）[\]{}"'“”‘’/\\|]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && !STOP_WORDS.has(item));
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function countOccurrences(text: string, term: string) {
  if (!term) {
    return 0;
  }

  let count = 0;
  let start = 0;
  while (count < 8) {
    const index = text.indexOf(term, start);
    if (index < 0) {
      break;
    }

    count += 1;
    start = index + term.length;
  }
  return count;
}

function buildRagRequestKey(ingredients: Ingredient[], topK: number, extraPreference: string) {
  return JSON.stringify({
    topK,
    extraPreference,
    ingredients: ingredients
      .map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
}

function buildRagDatasetName(officialDatasetName: string | undefined, personalLibraryNames: string[]) {
  const names = [];
  if (officialDatasetName) {
    names.push(officialDatasetName);
  }

  for (const name of personalLibraryNames) {
    names.push(`我的菜谱库：${name}`);
  }

  return names.join(' + ') || 'RAG 菜谱库';
}

function getPersonalLibraryNames(recipes: UserRecipeWithLibrary[]) {
  const names: string[] = [];
  for (const recipe of recipes) {
    const name = recipe.libraryName.trim();
    if (!name || names.includes(name)) {
      continue;
    }

    names.push(name);
  }

  return names;
}

function dedupeRecommendationsByRecipe(recommendations: RagRecommendation[]) {
  const byRecipe = new Map<string, RagRecommendation>();
  const deduped: RagRecommendation[] = [];

  for (const recommendation of recommendations) {
    const key = recommendation.recipeId ?? recommendation.id;
    const existing = byRecipe.get(key);
    if (!existing || recommendation.score > existing.score) {
      byRecipe.set(key, recommendation);
    }
  }

  for (const recommendation of recommendations) {
    const key = recommendation.recipeId ?? recommendation.id;
    const selected = byRecipe.get(key);
    if (selected === recommendation) {
      deduped.push(recommendation);
    }
  }

  return deduped;
}

function assignRandomRecommendationScores(recommendations: RagRecommendation[]) {
  const total = recommendations.length;
  return recommendations.map((recommendation, index) => ({
    ...recommendation,
    score: total > 0 ? (total - index) / total : 0,
  }));
}

function getRandomIndices(totalRows: number, count: number) {
  const indices = new Set<number>();
  while (indices.size < count) {
    indices.add(Math.floor(Math.random() * totalRows));
  }
  return Array.from(indices);
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function pickTitle(metadata: Record<string, unknown>) {
  const candidates = ['title', 'name', 'recipeTitle', '菜名'];
  for (const key of candidates) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function loadBgeM3OnnxEmbedder(): typeof import('./embedding/BgeM3OnnxEmbedder') {
  return require('./embedding/BgeM3OnnxEmbedder') as typeof import('./embedding/BgeM3OnnxEmbedder');
}

function getCachedBgeM3Embedder(model: InstalledEmbeddingModel): QueryEmbedder {
  const key = `${model.id}:${model.version}:${model.localRootUri}`;
  if (cachedEmbedder && cachedEmbedderKey === key) {
    return cachedEmbedder;
  }

  const { BgeM3OnnxEmbedder } = loadBgeM3OnnxEmbedder();
  cachedEmbedder = new BgeM3OnnxEmbedder(model);
  cachedEmbedderKey = key;
  return cachedEmbedder;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function formatList(items: string[]) {
  return items.length > 0 ? items.join('、') : '未填写';
}

function pushTopK<T extends VectorSearchResult | { score: number }>(top: T[], result: T, topK: number) {
  if (topK <= 0) {
    return;
  }

  if (top.length < topK) {
    top.push(result);
    top.sort((a, b) => a.score - b.score);
    return;
  }

  if (result.score <= top[0].score) {
    return;
  }

  top[0] = result;
  top.sort((a, b) => a.score - b.score);
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return '未知错误';
}

const STOP_WORDS = new Set([
  '用户',
  '当前',
  '没有',
  '提供',
  '冰箱',
  '里面',
  '用餐',
  '人数',
  '推荐',
  '优先',
  '考虑',
  '适合',
  '家庭',
  '烹饪',
  '清晰',
  '匹配',
  '较高',
]);
