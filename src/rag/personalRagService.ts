import { getDatabase } from '../db/database';
import { getUserRecipeWithLibraryById, type UserRecipeWithLibrary } from '../db/userRecipesRepository';
import { getActiveEmbeddingModel } from './model/modelRegistry';
import { NativeModules } from 'react-native';
import type { InstalledEmbeddingModel, RagRecommendation, UserRecipe, VectorSearchResult } from '../types';

interface EmbedderLike {
  embed(text: string): Promise<Float32Array>;
}

interface PersonalRagSearchInput {
  recipes: UserRecipeWithLibrary[];
  queryVector: Float32Array;
  model: InstalledEmbeddingModel;
  embedder: EmbedderLike;
  topK: number;
}

interface PersonalRecipeEmbeddingRow {
  recipeId: string;
  modelId: string;
  libraryId: string;
  recipeUpdatedAt: string;
  dimension: number;
  vectorJson: string;
  indexedAt: string;
}

interface PersonalRecipeVector {
  recipe: UserRecipeWithLibrary;
  text: string;
  vector: Float32Array;
}

export type PersonalRecipeEmbeddingState = 'indexed' | 'missing' | 'stale' | 'unavailable';

export interface PersonalRecipeEmbeddingStatus {
  recipeId: string;
  state: PersonalRecipeEmbeddingState;
  indexedAt: string | null;
}

export interface PersonalRecipeEmbeddingRebuildResult {
  total: number;
  indexed: number;
  skipped: number;
  failed: number;
}

type RecipeEmbeddingStatusInput = Pick<UserRecipe, 'id' | 'updatedAt'>;

const MAX_PERSONAL_RECIPES_PER_SEARCH = 40;
const MAX_PERSONAL_RECIPE_TEXT_LENGTH = 1600;
const MAX_PERSONAL_EMBEDDINGS_TO_CREATE_PER_SEARCH = 6;

export async function indexPersonalRecipeEmbedding(recipeId: string): Promise<boolean> {
  if (!NativeModules.Onnxruntime) {
    return false;
  }

  const [recipe, model] = await Promise.all([
    getUserRecipeWithLibraryById(recipeId),
    getActiveEmbeddingModel(),
  ]);

  if (!recipe || !model) {
    return false;
  }

  try {
    const { BgeM3OnnxEmbedder } = loadBgeM3OnnxEmbedder();
    await getOrCreateRecipeVector(recipe, model, new BgeM3OnnxEmbedder(model), () => true);
    return true;
  } catch {
    return false;
  }
}

export async function getPersonalRecipeEmbeddingStatuses(
  recipes: RecipeEmbeddingStatusInput[],
): Promise<Record<string, PersonalRecipeEmbeddingStatus>> {
  const statuses = createDefaultEmbeddingStatuses(recipes, !NativeModules.Onnxruntime ? 'unavailable' : 'missing');
  if (recipes.length === 0 || !NativeModules.Onnxruntime) {
    return statuses;
  }

  const model = await getActiveEmbeddingModel();
  if (!model) {
    return createDefaultEmbeddingStatuses(recipes, 'unavailable');
  }

  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const db = await getDatabase();
  const ids = recipes.map((recipe) => recipe.id);
  const placeholders = ids.map(() => '?').join(', ');
  const rows = await db.getAllAsync<PersonalRecipeEmbeddingRow>(
    `SELECT recipeId, modelId, libraryId, recipeUpdatedAt, dimension, vectorJson, indexedAt
     FROM personal_recipe_embeddings
     WHERE modelId = ? AND recipeId IN (${placeholders})`,
    model.id,
    ...ids,
  );

  for (const row of rows) {
    const recipe = recipeById.get(row.recipeId);
    if (!recipe) {
      continue;
    }

    statuses[row.recipeId] = {
      recipeId: row.recipeId,
      state: row.recipeUpdatedAt === recipe.updatedAt && row.dimension === model.dimension ? 'indexed' : 'stale',
      indexedAt: row.indexedAt,
    };
  }

  return statuses;
}

export async function rebuildPersonalRecipeEmbeddings(recipeIds: string[]): Promise<PersonalRecipeEmbeddingRebuildResult> {
  const uniqueIds = Array.from(new Set(recipeIds.map((id) => id.trim()).filter(Boolean)));
  const result: PersonalRecipeEmbeddingRebuildResult = {
    total: uniqueIds.length,
    indexed: 0,
    skipped: 0,
    failed: 0,
  };

  if (uniqueIds.length === 0) {
    return result;
  }

  if (!NativeModules.Onnxruntime || !(await getActiveEmbeddingModel())) {
    result.skipped = uniqueIds.length;
    return result;
  }

  for (const recipeId of uniqueIds) {
    const indexed = await indexPersonalRecipeEmbedding(recipeId);
    if (indexed) {
      result.indexed += 1;
    } else {
      result.failed += 1;
    }
  }

  return result;
}

export async function getPersonalRagRecommendations({
  recipes,
  queryVector,
  model,
  embedder,
  topK,
}: PersonalRagSearchInput): Promise<RagRecommendation[]> {
  const top: Array<VectorSearchResult & { recipeVector: PersonalRecipeVector }> = [];
  const candidates = recipes.slice(0, MAX_PERSONAL_RECIPES_PER_SEARCH);
  let createdEmbeddingCount = 0;

  for (const recipe of candidates) {
    const recipeVector = await safeGetOrCreateRecipeVector(recipe, model, embedder, () => {
      if (createdEmbeddingCount >= MAX_PERSONAL_EMBEDDINGS_TO_CREATE_PER_SEARCH) {
        return false;
      }

      createdEmbeddingCount += 1;
      return true;
    });
    if (!recipeVector) {
      continue;
    }

    if (recipeVector.vector.length !== queryVector.length) {
      continue;
    }

    pushTopK(top, {
      index: 0,
      score: dot(recipeVector.vector, queryVector),
      recipeVector,
    }, topK);
  }

  return top
    .sort((a, b) => b.score - a.score)
    .map((item) => toRagRecommendation(item.recipeVector, item.score));
}

async function safeGetOrCreateRecipeVector(
  recipe: UserRecipeWithLibrary,
  model: InstalledEmbeddingModel,
  embedder: EmbedderLike,
  canCreateEmbedding: () => boolean,
): Promise<PersonalRecipeVector | null> {
  try {
    return await getOrCreateRecipeVector(recipe, model, embedder, canCreateEmbedding);
  } catch {
    return null;
  }
}

async function getOrCreateRecipeVector(
  recipe: UserRecipeWithLibrary,
  model: InstalledEmbeddingModel,
  embedder: EmbedderLike,
  canCreateEmbedding: () => boolean,
): Promise<PersonalRecipeVector | null> {
  const text = buildPersonalRecipeEmbeddingText(recipe);
  const db = await getDatabase();
  const existing = await db.getFirstAsync<PersonalRecipeEmbeddingRow>(
    `SELECT recipeId, modelId, libraryId, recipeUpdatedAt, dimension, vectorJson, indexedAt
     FROM personal_recipe_embeddings
     WHERE recipeId = ? AND modelId = ?`,
    recipe.id,
    model.id,
  );

  if (existing && existing.recipeUpdatedAt === recipe.updatedAt && existing.dimension === model.dimension) {
    const vector = parseVector(existing.vectorJson, existing.dimension);
    if (vector) {
      return { recipe, text, vector };
    }
  }

  if (!canCreateEmbedding()) {
    return null;
  }

  const vector = await embedder.embed(text);
  await db.runAsync(
    `INSERT OR REPLACE INTO personal_recipe_embeddings
       (recipeId, modelId, libraryId, recipeUpdatedAt, dimension, vectorJson, indexedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    recipe.id,
    model.id,
    recipe.libraryId,
    recipe.updatedAt,
    vector.length,
    JSON.stringify(Array.from(vector)),
    new Date().toISOString(),
  );

  return { recipe, text, vector };
}

function toRagRecommendation(recipeVector: PersonalRecipeVector, score: number): RagRecommendation {
  const { recipe, text } = recipeVector;
  const sourceLabel = `我的菜谱库：${recipe.libraryName}`;

  return {
    id: `${recipe.id}:personal`,
    title: recipe.title,
    score,
    text,
    recipeId: recipe.id,
    chunkId: `${recipe.id}:personal`,
    metadata: {
      source: 'personal',
      sourceLabel,
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

function buildPersonalRecipeEmbeddingText(recipe: UserRecipeWithLibrary) {
  const text = [
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

  return text.length > MAX_PERSONAL_RECIPE_TEXT_LENGTH
    ? `${text.slice(0, MAX_PERSONAL_RECIPE_TEXT_LENGTH)}...`
    : text;
}

function parseVector(value: string, dimension: number) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== dimension) {
      return null;
    }

    const vector = new Float32Array(dimension);
    for (let index = 0; index < parsed.length; index += 1) {
      const numeric = Number(parsed[index]);
      if (!Number.isFinite(numeric)) {
        return null;
      }
      vector[index] = numeric;
    }
    return vector;
  } catch {
    return null;
  }
}

function formatList(items: string[]) {
  return items.length > 0 ? items.join('、') : '未填写';
}

function dot(left: Float32Array, right: Float32Array) {
  let score = 0;
  for (let index = 0; index < left.length; index += 1) {
    score += left[index] * right[index];
  }
  return score;
}

function pushTopK<T extends VectorSearchResult>(top: T[], result: T, topK: number) {
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

function loadBgeM3OnnxEmbedder(): typeof import('./embedding/BgeM3OnnxEmbedder') {
  return require('./embedding/BgeM3OnnxEmbedder') as typeof import('./embedding/BgeM3OnnxEmbedder');
}

function createDefaultEmbeddingStatuses(
  recipes: RecipeEmbeddingStatusInput[],
  state: PersonalRecipeEmbeddingState,
): Record<string, PersonalRecipeEmbeddingStatus> {
  return Object.fromEntries(
    recipes.map((recipe) => [
      recipe.id,
      {
        recipeId: recipe.id,
        state,
        indexedAt: null,
      },
    ]),
  );
}
