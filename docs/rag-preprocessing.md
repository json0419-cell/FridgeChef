# RAG Preprocessing

The raw dataset is `D:\androidCode\ChiShenMe\raw-data\recipe_corpus_full.json`. It is JSONL: one recipe object per line.

Run full preprocessing:

```powershell
cd D:\androidCode\ChiShenMe\mobile
npm run preprocess:rag -- --app-sample 5000
```

The generated files are written outside the mobile app:

```text
D:\androidCode\ChiShenMe\rag-tools\outputs\rag
```

The full artifacts are several GB and should not be bundled into the app.

## Outputs

```text
D:\androidCode\ChiShenMe\rag-tools\outputs\rag/
  recipes_rag.jsonl
  chunks_rag.jsonl
  processed_recipes_app_sample.json
  manifest.json
  rejects.jsonl
```

`recipes_rag.jsonl` is the normalized recipe corpus. One line per recipe.

`chunks_rag.jsonl` is the embedding input. One line per text chunk with metadata.

`processed_recipes_app_sample.json` is a smaller app-compatible sample matching the current MVP schema.

`manifest.json` records counts and output file paths.

`rejects.jsonl` records invalid rows, usually missing title, ingredients, or steps.

## Recipe Schema

Each `recipes_rag.jsonl` line uses this shape:

```ts
type RagRecipe = {
  id: string;
  source: {
    dataset: 'recipe_corpus_full';
    line: number;
    author: string | null;
  };
  title: string;
  dish: string | null;
  description: string;
  rawIngredients: string[];
  ingredients: string[];
  mainIngredients: string[];
  seasonings: string[];
  steps: string[];
  tags: string[];
  preferences: {
    spiceLevel: 0 | 1 | 2 | 3;
    spicySignals: string[];
    optionalSpicy: boolean;
    hasMeat: boolean;
    hasSeafood: boolean;
    hasEggOrDairy: boolean;
    isVegetarianLikely: boolean;
  };
  cooking: {
    methods: string[];
    estimatedTimeMinutes: number | null;
  };
  searchText: string;
  ragText: string;
};
```

## Chunk Schema

Each `chunks_rag.jsonl` line is ready for embedding:

```ts
type RagChunk = {
  chunkId: string;
  recipeId: string;
  chunkIndex: number;
  chunkType: 'recipe_full' | 'recipe_steps';
  text: string;
  metadata: {
    recipeId: string;
    title: string;
    dish: string | null;
    mainIngredients: string[];
    seasonings: string[];
    ingredients: string[];
    tags: string[];
    spiceLevel: 0 | 1 | 2 | 3;
    isVegetarianLikely: boolean;
    methods: string[];
    estimatedTimeMinutes: number | null;
    stepNumbers?: number[];
  };
};
```

## Current Full Run

Latest full preprocessing result:

```text
totalLines: 1,550,151
writtenRecipes: 1,542,969
writtenChunks: 1,552,596
duplicates: 4,933
rejected: 2,249
spicyRecipes: 323,281
vegetarianLikelyRecipes: 929,075
```

File sizes:

```text
recipes_rag.jsonl: ~4.69 GB
chunks_rag.jsonl: ~2.78 GB
processed_recipes_app_sample.json: ~5.08 MB
```

## Embedding Flow

Use `chunks_rag.jsonl` as the embedding input:

```text
chunks_rag.jsonl
  -> embedding model
  -> vector store rows:
       id = chunkId
       vector = embedding(text)
       text = text
       metadata = metadata
```

At query time:

```text
user storage + preferences
  -> build query text, e.g. "冰箱有鸡蛋、番茄，不辣，2个人吃，20分钟内"
  -> embed query
  -> vector search Top K
  -> metadata filter, e.g. spiceLevel <= 1
  -> rerank / LLM recommendation
```

For no-server mobile mode, the app downloads DatasetPacks from Hugging Face and stores them in the app document directory. The full RAG artifacts under `rag-tools/outputs` are local preprocessing inputs for embedding / release packaging, not mobile bundle assets.
