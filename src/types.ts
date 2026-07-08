export type IngredientSource = 'manual' | 'photo';

export interface Ingredient {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  source: IngredientSource;
  createdAt: string;
}

export type IngredientDraft = Omit<Ingredient, 'id' | 'createdAt'>;

export type AiProvider = 'gemini';

export interface AppSettings {
  provider: AiProvider;
  servings: number;
  dietaryPreferences: string;
  maxTimeMinutes: number | null;
  preferredDifficulty: RecommendationDifficultyPreference;
  recentHistoryDays: number;
}

export type RecommendationDifficultyPreference = 'any' | UserRecipeDifficulty;

export interface RecognizedFoodItem {
  name: string;
  category: string;
  estimatedQuantity: number | null;
  unit: string;
  confidence: number;
  notes: string;
}

export interface RecognitionResult {
  items: RecognizedFoodItem[];
}

export interface Recipe {
  id: string;
  title: string;
  mainIngredients: string[];
  seasonings: string[];
  steps: string[];
  tags: string[];
}

export type UserRecipeDifficulty = '简单' | '中等' | '偏难' | '未知';
export type UserRecipeSourceType = 'manual' | 'youtube' | 'text';

export interface UserRecipeLibrary {
  id: string;
  name: string;
  enabled: boolean;
  recipeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserRecipe {
  id: string;
  libraryId: string;
  title: string;
  description: string;
  mainIngredients: string[];
  seasonings: string[];
  steps: string[];
  tags: string[];
  estimatedTimeMinutes: number | null;
  difficulty: UserRecipeDifficulty;
  sourceType: UserRecipeSourceType;
  sourceUrl: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserRecipeDraft {
  libraryId: string;
  title: string;
  description: string;
  mainIngredients: string[];
  seasonings: string[];
  steps: string[];
  tags: string[];
  estimatedTimeMinutes: number | null;
  difficulty: UserRecipeDifficulty;
  sourceType: UserRecipeSourceType;
  sourceUrl: string;
}

export interface RecipeRecommendation {
  recipe: Recipe;
  finalScore: number;
  mainScore: number;
  seasoningScore: number;
  matchedIngredients: string[];
  missingMainIngredients: string[];
  missingSeasonings: string[];
  reason: string;
}

export type DatasetLevel = 'lite' | 'medium' | 'standard' | 'full' | 'custom';

export interface DatasetPackFile {
  role: 'vectors' | 'metadata' | 'embeddingManifest' | 'recipes' | 'chunks' | string;
  path: string;
  url?: string;
  sizeBytes: number;
  sha256?: string;
}

export interface DatasetPackManifest {
  schemaVersion: 'chishenme.dataset-pack.v1';
  id: string;
  name: string;
  version: string;
  description: string;
  level: DatasetLevel;
  createdAt: string;
  locale: string;
  license: string;
  recipeCount: number;
  chunkCount: number;
  embedding: {
    model: string;
    backend?: string;
    dimension: number;
    dtype: 'float32' | 'float16' | 'int8' | string;
    normalized: boolean;
    denseOnly?: boolean;
    queryPrefix?: string;
    corpusPrefix?: string;
    maxLength?: number;
  };
  files: DatasetPackFile[];
  android?: {
    embeddingMode?: string;
    requiresOnnxForQueryEmbedding?: boolean;
    recommendedInstallType?: string;
  };
}

export interface DatasetIndexEntry {
  id: string;
  name: string;
  version: string;
  level: DatasetLevel;
  recipeCount: number;
  chunkCount: number;
  embeddingModel: string;
  embeddingDimension: number;
  sizeBytes: number;
  manifestPath: string;
  manifestUrl?: string;
}

export interface DatasetIndexManifest {
  schemaVersion: 'chishenme.dataset-index.v1';
  datasets: DatasetIndexEntry[];
}

export type InstalledDatasetStatus = 'installed' | 'downloading' | 'error';

export interface InstalledDataset {
  id: string;
  name: string;
  version: string;
  description: string;
  level: DatasetLevel;
  recipeCount: number;
  chunkCount: number;
  localRootUri: string;
  manifestUri: string;
  manifestUrl?: string;
  installedAt: string;
  active: boolean;
  status: InstalledDatasetStatus;
  sizeBytes: number;
  embeddingModel: string;
  embeddingDimension: number;
}

export interface EmbeddingModelPackFile {
  role: 'modelOnnx' | 'externalData' | 'tokenizerOnnx' | 'config' | string;
  path: string;
  url?: string;
  sizeBytes: number;
  sha256?: string;
}

export interface EmbeddingModelPackManifest {
  schemaVersion: 'chishenme.embedding-model-pack.v1';
  id: string;
  name: string;
  version: string;
  description: string;
  createdAt: string;
  provider: 'onnxruntime-react-native' | string;
  model: {
    name: string;
    dimension: number;
    dtype: 'float32' | string;
    normalized: boolean;
    maxLength: number;
    inputMode: 'string-tokenizer-onnx' | 'token-ids';
  };
  files: EmbeddingModelPackFile[];
}

export interface InstalledEmbeddingModel {
  id: string;
  name: string;
  version: string;
  description: string;
  localRootUri: string;
  manifestUri: string;
  manifestUrl?: string;
  installedAt: string;
  active: boolean;
  sizeBytes: number;
  modelName: string;
  dimension: number;
  maxLength: number;
}

export interface VectorSearchResult {
  index: number;
  score: number;
}

export interface RagMetadataRecord {
  index: number;
  chunkId?: string;
  recipeId?: string;
  chunkIndex?: number;
  chunkType?: string;
  text: string;
  metadata: Record<string, unknown>;
}

export interface RagRecommendation {
  id: string;
  title: string;
  score: number;
  text: string;
  recipeId?: string;
  chunkId?: string;
  metadata: Record<string, unknown>;
}

export interface RefinedRagRecommendation {
  id: string;
  recipeId?: string;
  chunkId?: string;
  title: string;
  scoreReason: string;
  matchedIngredients: string[];
  missingIngredients: string[];
  difficulty: '简单' | '中等' | '偏难' | '未知';
  estimatedTimeMinutes: number | null;
  servingNote: string;
  cleanSteps: string[];
  notes: string;
  source?: RagRecommendation;
}

export type CookedRecipeSource = 'structured' | 'rag' | 'refined';

export interface CookedRecipeHistory {
  id: string;
  recipeId: string;
  title: string;
  source: CookedRecipeSource;
  cookedAt: string;
}

export type RootStackParamList = {
  Home: undefined;
  AddIngredient: { ingredientId?: string; mode?: 'manual' | 'photo' } | undefined;
  ConfirmRecognizedFood: { items: RecognizedFoodItem[] };
  Recommendations: undefined;
  RecipeDetail: { recipeId: string };
  History: undefined;
  Settings: undefined;
  DatasetLibrary: undefined;
  UserRecipeLibraries: undefined;
  UserRecipeLibraryDetail: { libraryId: string };
  AddUserRecipe: { libraryId?: string; recipeId?: string } | undefined;
};
