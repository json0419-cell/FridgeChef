#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const SCRIPT_VERSION = '1.0.0';

const DEFAULT_INPUT = path.resolve(__dirname, '../../raw-data/recipe_corpus_full.json');
const DEFAULT_OUT_DIR = path.resolve(__dirname, '../../rag-tools/outputs/rag');

const SEASONING_TERMS = [
  '盐',
  '糖',
  '白糖',
  '冰糖',
  '红糖',
  '生抽',
  '老抽',
  '酱油',
  '蚝油',
  '耗油',
  '醋',
  '米醋',
  '陈醋',
  '白醋',
  '料酒',
  '黄酒',
  '味精',
  '鸡精',
  '胡椒',
  '黑胡椒',
  '白胡椒',
  '花椒',
  '八角',
  '桂皮',
  '香叶',
  '孜然',
  '五香粉',
  '十三香',
  '淀粉',
  '玉米淀粉',
  '葱',
  '香葱',
  '大葱',
  '小葱',
  '姜',
  '生姜',
  '蒜',
  '大蒜',
  '辣椒',
  '干辣椒',
  '小米辣',
  '泡椒',
  '豆瓣',
  '豆瓣酱',
  '辣椒粉',
  '辣椒面',
  '油',
  '食用油',
  '菜籽油',
  '玉米油',
  '花生油',
  '橄榄油',
  '香油',
  '麻油',
  '黄油',
  '番茄酱',
  '沙拉酱',
  '蜂蜜',
  '芝麻',
  '白芝麻',
  '黑芝麻',
];

const MEAT_TERMS = [
  '猪肉',
  '五花肉',
  '排骨',
  '肉馅',
  '肉末',
  '牛肉',
  '肥牛',
  '羊肉',
  '鸡肉',
  '鸡胸',
  '鸡腿',
  '鸡翅',
  '鸡爪',
  '鸭',
  '鹅',
  '猪皮',
  '火腿',
  '培根',
  '香肠',
  '腊肠',
  '腊肉',
];

const SEAFOOD_TERMS = [
  '鱼',
  '虾',
  '蟹',
  '贝',
  '蛤',
  '蛏',
  '鱿鱼',
  '墨鱼',
  '金枪鱼',
  '三文鱼',
  '巴沙鱼',
  '带鱼',
  '鳕鱼',
  '海鲜',
];

const SPICY_TERMS = [
  '辣椒',
  '干辣椒',
  '小米辣',
  '泡椒',
  '剁椒',
  '辣椒粉',
  '辣椒面',
  '豆瓣酱',
  '郫县豆瓣',
  '麻辣',
  '香辣',
  '酸辣',
  '水煮鱼',
  '水煮肉',
  '辣子',
  '火锅底料',
];

const METHOD_PATTERNS = [
  ['炒', /炒|爆香/],
  ['煮', /煮|汆|焯/],
  ['蒸', /蒸/],
  ['烤', /烤|烤箱/],
  ['炸', /炸/],
  ['煎', /煎/],
  ['炖', /炖/],
  ['焖', /焖/],
  ['拌', /拌|凉拌/],
  ['煲', /煲/],
  ['汤', /汤/],
];

const UNIT_PATTERN =
  '(?:kg|g|ml|l|克|千克|公斤|斤|两|毫升|升|个|只|条|根|片|块|瓣|段|勺|茶匙|汤匙|大勺|小勺|杯|碗|把|撮|嘬|朵|颗|粒|包|盒|袋|瓶|罐|份|枚|张|滴|寸)';

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = path.resolve(args.input || DEFAULT_INPUT);
  const outDir = path.resolve(args.outDir || DEFAULT_OUT_DIR);
  const limit = args.limit === undefined ? 0 : Number(args.limit);
  const maxChunkChars = Number(args.maxChunkChars || 1800);
  const appSample = Number(args.appSample || 5000);

  if (!fs.existsSync(input)) {
    throw new Error(`Input file not found: ${input}`);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const outputFiles = {
    recipes: path.join(outDir, 'recipes_rag.jsonl'),
    chunks: path.join(outDir, 'chunks_rag.jsonl'),
    appSample: path.join(outDir, 'processed_recipes_app_sample.json'),
    manifest: path.join(outDir, 'manifest.json'),
    rejects: path.join(outDir, 'rejects.jsonl'),
  };

  const recipeStream = fs.createWriteStream(outputFiles.recipes, { encoding: 'utf8' });
  const chunkStream = fs.createWriteStream(outputFiles.chunks, { encoding: 'utf8' });
  const rejectStream = fs.createWriteStream(outputFiles.rejects, { encoding: 'utf8' });
  recipeStream.setMaxListeners(0);
  chunkStream.setMaxListeners(0);
  rejectStream.setMaxListeners(0);
  const appSampleItems = [];
  const seenIds = new Set();
  const startedAt = new Date();
  const inputStat = fs.statSync(input);

  const stats = {
    scriptVersion: SCRIPT_VERSION,
    input,
    outDir,
    inputBytes: inputStat.size,
    startedAt: startedAt.toISOString(),
    completedAt: null,
    totalLines: 0,
    parsed: 0,
    writtenRecipes: 0,
    writtenChunks: 0,
    duplicates: 0,
    rejected: 0,
    parseErrors: 0,
    spicyRecipes: 0,
    vegetarianLikelyRecipes: 0,
    maxChunkChars,
    appSample,
    files: outputFiles,
  };

  const rl = readline.createInterface({
    input: fs.createReadStream(input, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    stats.totalLines += 1;
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let raw;
    try {
      raw = JSON.parse(trimmed);
      stats.parsed += 1;
    } catch (error) {
      stats.parseErrors += 1;
      stats.rejected += 1;
      writeJsonl(rejectStream, {
        line: stats.totalLines,
        reason: 'parse_error',
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const recipe = normalizeRecipe(raw, stats.totalLines);
    if (!recipe) {
      stats.rejected += 1;
      writeJsonl(rejectStream, {
        line: stats.totalLines,
        reason: 'invalid_recipe',
      });
      continue;
    }

    if (seenIds.has(recipe.id)) {
      stats.duplicates += 1;
      continue;
    }
    seenIds.add(recipe.id);

    const chunks = buildChunks(recipe, maxChunkChars);
    await writeJsonl(recipeStream, recipe);
    for (const chunk of chunks) {
      await writeJsonl(chunkStream, chunk);
    }

    stats.writtenRecipes += 1;
    stats.writtenChunks += chunks.length;
    if (recipe.preferences.spiceLevel > 0) {
      stats.spicyRecipes += 1;
    }
    if (recipe.preferences.isVegetarianLikely) {
      stats.vegetarianLikelyRecipes += 1;
    }
    if (appSampleItems.length < appSample && recipe.mainIngredients.length > 0 && recipe.steps.length > 0) {
      appSampleItems.push(toAppRecipe(recipe));
    }

    if (stats.totalLines % 10000 === 0) {
      const elapsedSeconds = (Date.now() - startedAt.getTime()) / 1000;
      const rate = Math.round(stats.totalLines / Math.max(elapsedSeconds, 1));
      console.log(
        `[progress] lines=${stats.totalLines} recipes=${stats.writtenRecipes} chunks=${stats.writtenChunks} rejected=${stats.rejected} rate=${rate}/s`,
      );
    }

    if (limit > 0 && stats.writtenRecipes >= limit) {
      break;
    }
  }

  await closeStream(recipeStream);
  await closeStream(chunkStream);
  await closeStream(rejectStream);

  fs.writeFileSync(outputFiles.appSample, `${JSON.stringify(appSampleItems, null, 2)}\n`, 'utf8');
  stats.completedAt = new Date().toISOString();
  fs.writeFileSync(outputFiles.manifest, `${JSON.stringify(stats, null, 2)}\n`, 'utf8');

  console.log(`[done] recipes=${stats.writtenRecipes} chunks=${stats.writtenChunks} rejected=${stats.rejected}`);
  console.log(`[done] outDir=${outDir}`);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--input') {
      args.input = argv[++index];
    } else if (item === '--out-dir') {
      args.outDir = argv[++index];
    } else if (item === '--limit') {
      args.limit = argv[++index];
    } else if (item === '--max-chunk-chars') {
      args.maxChunkChars = argv[++index];
    } else if (item === '--app-sample') {
      args.appSample = argv[++index];
    } else if (item === '--help') {
      printHelp();
      process.exit(0);
    }
  }
  return args;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/preprocess-recipes-rag.cjs [options]

Options:
  --input <path>             JSONL dataset path. Default: ../../raw-data/recipe_corpus_full.json
  --out-dir <path>           Output directory. Default: ../../rag-tools/outputs/rag
  --limit <number>           Process N valid recipes. Default: 0 (all)
  --max-chunk-chars <number> Max RAG chunk text length. Default: 1800
  --app-sample <number>      Also emit an app-compatible JSON sample. Default: 5000
`);
}

function normalizeRecipe(raw, sourceLine) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const title = cleanText(raw.name || raw.title || raw.dish);
  const dish = cleanText(raw.dish === 'Unknown' ? '' : raw.dish);
  const description = cleanText(raw.description);
  const rawIngredients = toStringArray(raw.recipeIngredient || raw.ingredients);
  const steps = toStringArray(raw.recipeInstructions || raw.steps).map(cleanText).filter(Boolean);
  const keywords = toStringArray(raw.keywords);
  const author = cleanText(raw.author);

  if (!title || rawIngredients.length === 0 || steps.length === 0) {
    return null;
  }

  const cleanedIngredients = unique(
    rawIngredients
      .map(cleanIngredient)
      .filter(Boolean)
      .filter((item) => !isSectionHeader(item)),
  );

  if (cleanedIngredients.length === 0) {
    return null;
  }

  const seasonings = cleanedIngredients.filter(isSeasoning);
  const mainIngredients = cleanedIngredients.filter((item) => !isSeasoning(item));
  const allText = [title, dish, description, ...rawIngredients, ...steps, ...keywords].join(' ');
  const tags = buildTags(title, dish, keywords, allText);
  const preferences = buildPreferences(allText, cleanedIngredients);
  const cooking = buildCookingMetadata(allText);
  const id = buildStableId(title, author, rawIngredients, steps);
  const searchText = unique([title, dish, ...tags, ...cleanedIngredients, description])
    .filter(Boolean)
    .join(' ');
  const ragText = buildRagText({
    title,
    dish,
    description,
    mainIngredients,
    seasonings,
    cleanedIngredients,
    tags,
    preferences,
    cooking,
    steps,
  });

  return {
    id,
    source: {
      dataset: 'recipe_corpus_full',
      line: sourceLine,
      author: author || null,
    },
    title,
    dish: dish || null,
    description,
    rawIngredients,
    ingredients: cleanedIngredients,
    mainIngredients,
    seasonings,
    steps,
    tags,
    preferences,
    cooking,
    searchText,
    ragText,
  };
}

function buildChunks(recipe, maxChunkChars) {
  const baseMetadata = {
    recipeId: recipe.id,
    title: recipe.title,
    dish: recipe.dish,
    mainIngredients: recipe.mainIngredients,
    seasonings: recipe.seasonings,
    ingredients: recipe.ingredients,
    tags: recipe.tags,
    spiceLevel: recipe.preferences.spiceLevel,
    isVegetarianLikely: recipe.preferences.isVegetarianLikely,
    methods: recipe.cooking.methods,
    estimatedTimeMinutes: recipe.cooking.estimatedTimeMinutes,
  };

  if (recipe.ragText.length <= maxChunkChars) {
    return [
      {
        chunkId: `${recipe.id}:chunk:0`,
        recipeId: recipe.id,
        chunkIndex: 0,
        chunkType: 'recipe_full',
        text: recipe.ragText,
        metadata: baseMetadata,
      },
    ];
  }

  const intro = [
    `菜名：${recipe.title}`,
    recipe.dish ? `菜品：${recipe.dish}` : '',
    recipe.description ? `简介：${recipe.description}` : '',
    `主食材：${formatList(recipe.mainIngredients)}`,
    `调料：${formatList(recipe.seasonings)}`,
    `标签：${formatList(recipe.tags)}`,
    `辣度：${recipe.preferences.spiceLevel}`,
    `做法：`,
  ]
    .filter(Boolean)
    .join('\n');

  const chunks = [];
  let currentSteps = [];
  let currentText = intro;

  for (let index = 0; index < recipe.steps.length; index += 1) {
    const stepText = `${index + 1}. ${recipe.steps[index]}`;
    const nextText = `${currentText}\n${stepText}`;
    if (nextText.length > maxChunkChars && currentSteps.length > 0) {
      chunks.push(makeChunk(recipe, chunks.length, currentText, currentSteps, baseMetadata));
      currentSteps = [];
      currentText = intro;
    }
    currentSteps.push(index + 1);
    currentText = `${currentText}\n${stepText}`;
  }

  if (currentSteps.length > 0) {
    chunks.push(makeChunk(recipe, chunks.length, currentText, currentSteps, baseMetadata));
  }

  return chunks;
}

function makeChunk(recipe, chunkIndex, text, stepNumbers, baseMetadata) {
  return {
    chunkId: `${recipe.id}:chunk:${chunkIndex}`,
    recipeId: recipe.id,
    chunkIndex,
    chunkType: 'recipe_steps',
    text,
    metadata: {
      ...baseMetadata,
      stepNumbers,
    },
  };
}

function toAppRecipe(recipe) {
  return {
    id: recipe.id,
    title: recipe.title,
    mainIngredients: recipe.mainIngredients.length > 0 ? recipe.mainIngredients : recipe.ingredients.slice(0, 3),
    seasonings: recipe.seasonings,
    steps: recipe.steps,
    tags: recipe.tags,
  };
}

function buildRagText({
  title,
  dish,
  description,
  mainIngredients,
  seasonings,
  cleanedIngredients,
  tags,
  preferences,
  cooking,
  steps,
}) {
  return [
    `菜名：${title}`,
    dish ? `菜品：${dish}` : '',
    description ? `简介：${description}` : '',
    `主食材：${formatList(mainIngredients)}`,
    `调料：${formatList(seasonings)}`,
    `全部食材：${formatList(cleanedIngredients)}`,
    `标签：${formatList(tags)}`,
    `口味偏好：${preferences.spiceLevel > 0 ? '可能偏辣' : '未检测到明显辣味'}；素食可能性：${preferences.isVegetarianLikely ? '可能素食' : '非素食或不确定'}`,
    `烹饪方式：${formatList(cooking.methods)}`,
    cooking.estimatedTimeMinutes ? `估计耗时：${cooking.estimatedTimeMinutes} 分钟` : '',
    `步骤：`,
    ...steps.map((step, index) => `${index + 1}. ${step}`),
  ]
    .filter(Boolean)
    .join('\n');
}

function buildTags(title, dish, keywords, allText) {
  const keywordTags = keywords
    .map(cleanText)
    .filter(Boolean)
    .filter((item) => !item.includes('的做法'))
    .filter((item) => !item.includes('怎么做'))
    .filter((item) => !item.includes('正宗做法'))
    .filter((item) => !item.includes('详细做法'))
    .filter((item) => !item.includes('家常做法'))
    .filter((item) => item.length <= 12);

  const tags = [...keywordTags];
  if (dish && dish.length <= 12) {
    tags.push(dish);
  }

  const checks = [
    ['家常菜', /家常/],
    ['快手菜', /快手|简单|简易|省时|懒人/],
    ['早餐', /早餐|早饭/],
    ['汤羹', /汤|羹/],
    ['甜品', /甜品|蛋糕|曲奇|饼干|面包|吐司|糕/],
    ['烤箱', /烤箱|烘焙/],
    ['下饭菜', /下饭/],
    ['减脂', /减脂|低脂|轻食/],
    ['主食', /主食|米饭|面条|馒头|饼/],
  ];

  for (const [tag, pattern] of checks) {
    if (pattern.test(allText)) {
      tags.push(tag);
    }
  }

  if (/辣/.test(title)) {
    tags.push('辣');
  }

  return unique(tags).slice(0, 12);
}

function buildPreferences(allText, ingredients) {
  const spicySignals = unique(SPICY_TERMS.filter((term) => allText.includes(term) || ingredients.some((item) => item.includes(term))));
  const optionalSpicy = /不吃辣可不放|不能吃辣|怕辣|可不放辣|不放辣/.test(allText);
  const spicyMentions = (allText.match(/辣/g) || []).length;
  let spiceLevel = 0;

  if (spicySignals.length > 0 || spicyMentions > 0) {
    spiceLevel = 1;
  }
  if (spicySignals.some((term) => ['辣椒', '干辣椒', '小米辣', '泡椒', '剁椒', '豆瓣酱', '郫县豆瓣', '辣椒粉', '辣椒面'].includes(term))) {
    spiceLevel = 2;
  }
  if (/麻辣|香辣|水煮鱼|水煮肉|辣子|火锅底料/.test(allText) || spicySignals.length >= 3 || spicyMentions >= 4) {
    spiceLevel = 3;
  }
  if (optionalSpicy) {
    spiceLevel = Math.max(1, spiceLevel - 1);
  }

  const ingredientText = ingredients.join(' ');
  const hasMeat = MEAT_TERMS.some((term) => ingredientText.includes(term)) || /(?:猪|牛|羊|鸡|鸭|鹅).*(?:肉|排|腿|翅|爪|皮)/.test(ingredientText);
  const hasSeafood = SEAFOOD_TERMS.some((term) => ingredientText.includes(term));
  const hasEggOrDairy = /鸡蛋|鸭蛋|蛋|牛奶|奶油|奶酪|芝士|黄油/.test(ingredientText);
  const isVegetarianLikely = !hasMeat && !hasSeafood;

  return {
    spiceLevel,
    spicySignals,
    optionalSpicy,
    hasMeat,
    hasSeafood,
    hasEggOrDairy,
    isVegetarianLikely,
  };
}

function buildCookingMetadata(allText) {
  const methods = METHOD_PATTERNS.filter(([, pattern]) => pattern.test(allText)).map(([method]) => method);
  return {
    methods: unique(methods),
    estimatedTimeMinutes: estimateTimeMinutes(allText),
  };
}

function estimateTimeMinutes(text) {
  const minutes = [];
  const minutePattern = /(\d+(?:\.\d+)?)\s*(?:分钟|min)/gi;
  const hourPattern = /(\d+(?:\.\d+)?)\s*(?:小时|h)/gi;
  let match;

  while ((match = minutePattern.exec(text))) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0 && value <= 600) {
      minutes.push(value);
    }
  }

  while ((match = hourPattern.exec(text))) {
    const value = Number(match[1]) * 60;
    if (Number.isFinite(value) && value > 0 && value <= 1440) {
      minutes.push(value);
    }
  }

  if (minutes.length === 0) {
    return null;
  }

  return Math.round(Math.max(...minutes));
}

function cleanIngredient(value) {
  let text = cleanText(value);
  if (!text) {
    return '';
  }

  text = text
    .replace(/[【\[][^】\]]+[】\]]/g, '')
    .replace(/^[（(][^)）]+[)）]/g, '')
    .replace(/^(主料|配料|辅料|调料|材料|用料)[:：]/, '')
    .replace(/^(主料|配料|辅料|调料|材料|用料)[:：]/, '')
    .replace(/^[,，、:：\s-]+/, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/（[^）]*）/g, '')
    .replace(/可不加|可选|备用|切片|切丝|切块|切丁|洗净|去皮|去核|泡发/g, '')
    .replace(/适量|少许|若干/g, '')
    .trim();

  text = stripQuantityPrefix(text);

  const split = text.split(/[，,、；;\/]/).map((item) => item.trim()).filter(Boolean);
  if (split.length > 1) {
    const candidate = split.find((item) => !/加量|喜甜|左右|约|根据|喜欢/.test(item)) || split[0];
    text = candidate;
  }

  text = stripQuantityPrefix(text)
    .replace(/^[,，、:：\s-]+/, '')
    .replace(/\s+/g, '')
    .trim();

  if (!text || text.length > 24 || !/[\p{Script=Han}A-Za-z]/u.test(text)) {
    return '';
  }

  return normalizeSynonym(text);
}

function normalizeSynonym(value) {
  return value
    .replace(/耗油/g, '蚝油')
    .replace(/西红柿/g, '番茄')
    .replace(/蕃茄/g, '番茄')
    .replace(/土豆/g, '土豆')
    .replace(/马铃薯/g, '土豆')
    .replace(/洋葱头/g, '洋葱')
    .replace(/香葱/g, '葱')
    .replace(/小葱/g, '葱')
    .replace(/大葱/g, '葱')
    .replace(/生姜/g, '姜')
    .replace(/大蒜/g, '蒜')
    .replace(/蒜瓣/g, '蒜')
    .replace(/鸡蛋液/g, '鸡蛋');
}

function stripQuantityPrefix(value) {
  return value
    .replace(
      new RegExp(
        `^\\s*(?:约|大约|左右)?\\s*\\d+(?:\\.\\d+)?(?:\\s*[-~～+]\\s*\\d+(?:\\.\\d+)?)?\\s*${UNIT_PATTERN}?\\s*(?:[+\\-±~～]\\s*\\d+(?:\\.\\d+)?\\s*${UNIT_PATTERN})?\\s*`,
        'i',
      ),
      '',
    )
    .replace(
      new RegExp(
        `^\\s*(?:约|大约|左右)?\\s*(?:半|一|二|两|三|四|五|六|七|八|九|十|百|千|几|数|多|小半|大半)\\s*${UNIT_PATTERN}\\s*`,
        'i',
      ),
      '',
    )
    .replace(/^\s*(?:适量|少许|若干|一点|一小撮|一撮|一嘬)\s*/, '');
}

function isSeasoning(ingredient) {
  if (!ingredient) {
    return false;
  }

  if (SEASONING_TERMS.includes(ingredient)) {
    return true;
  }

  if (ingredient.length <= 8) {
    return SEASONING_TERMS.some((term) => ingredient.includes(term));
  }

  return false;
}

function isSectionHeader(value) {
  return /^(烫种|中种|主面团|面团|馅料|酱汁|装饰|其他|材料|用料|调料)$/.test(value);
}

function cleanText(value) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return '';
  }

  return String(value)
    .normalize('NFKC')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toStringArray(value) {
  if (Array.isArray(value)) {
    return value.map(cleanText).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/\n+/)
      .map(cleanText)
      .filter(Boolean);
  }

  return [];
}

function buildStableId(title, author, ingredients, steps) {
  const hash = crypto
    .createHash('sha1')
    .update([title, author, ingredients.join('|'), steps.join('|')].join('\n'))
    .digest('hex')
    .slice(0, 16);
  return `recipe_${hash}`;
}

function formatList(items) {
  return items.length > 0 ? items.join('、') : '无';
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function writeJsonl(stream, value) {
  return new Promise((resolve) => {
    const line = `${JSON.stringify(value)}\n`;
    if (stream.write(line, 'utf8')) {
      resolve();
    } else {
      stream.once('drain', resolve);
    }
  });
}

function closeStream(stream) {
  return new Promise((resolve, reject) => {
    stream.end(resolve);
    stream.once('error', reject);
  });
}
