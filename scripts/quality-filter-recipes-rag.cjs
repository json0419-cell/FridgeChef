#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const SCRIPT_VERSION = '1.0.0';

const DEFAULT_RECIPES = path.resolve(__dirname, '../../rag-tools/outputs/rag/recipes_rag.jsonl');
const DEFAULT_CHUNKS = path.resolve(__dirname, '../../rag-tools/outputs/rag/chunks_rag.jsonl');
const DEFAULT_OUT_DIR = path.resolve(__dirname, '../../rag-tools/outputs/rag_quality_cleaned');

const COOKING_ACTION_PATTERN =
  /切|洗|泡|焯|煮|蒸|炒|爆香|煎|炸|烤|炖|焖|煲|拌|腌|烘|烧|调|加|放|倒|撒|淋|搅|揉|擀|包|卷|压|打发|发酵|预热|冷藏|冷冻|装盘|出锅|盛出|过滤|打碎|榨|煸|烫|融化|过筛|混合|均匀|入锅|入烤箱|上锅/;

const COOKING_ACTION_GLOBAL_PATTERN =
  /切|洗|泡|焯|煮|蒸|炒|爆香|煎|炸|烤|炖|焖|煲|拌|腌|烘|烧|调|加|放|倒|撒|淋|搅|揉|擀|包|卷|压|打发|发酵|预热|冷藏|冷冻|装盘|出锅|盛出|过滤|打碎|榨|煸|烫|融化|过筛|混合|均匀|入锅|入烤箱|上锅/g;

const STRONG_NON_FOOD_PATTERN =
  /宠物|猫粮|狗粮|手工皂|橡皮泥|史莱姆|粘土|滴胶/;

const TOOL_OR_REVIEW_PATTERN =
  /测评|评测|开箱|购物清单|好物推荐|厨具推荐|锅具推荐|刀具推荐|餐具推荐|砧板推荐|模具推荐|烤箱推荐|空气炸锅推荐|破壁机推荐/;

const STORAGE_OR_TIPS_PATTERN =
  /保存方法|保存技巧|储存方法|储存技巧|如何保存|怎么保存|保鲜方法|清洗方法|处理方法|切法|摆盘|装饰教程|基础知识|科普|小贴士/;

const COLLECTION_TITLE_PATTERNS = [
  /^(一周|七天|7天|每日|每天).*(菜单|餐单|菜谱|食谱|安排|计划|记录|打卡)/,
  /(菜单|餐单|菜谱|食谱).*(合集|合辑|大全|汇总|清单|目录|计划)/,
  /(早餐|午餐|晚餐|便当|减脂餐|月子餐|宝宝餐|辅食).*(合集|合辑|大全|汇总|记录|打卡|菜单|餐单|计划)/,
  /(合集|合辑|大全|目录|清单)$/,
  /^(菜单|餐单|菜谱|食谱|记录|打卡|日记)$/,
];

const PHOTO_ONLY_STEP_PATTERN = /^(看图|见图|如图|步骤见图|图片说明|无|略|省略|记录|打卡|留存|备忘|自用|随便写|\.{2,}|…+)$/;

const WEAK_INGREDIENT_PATTERN = /^(水|开水|清水|油|盐|糖|酱油|生抽|老抽|料酒|看图|见图|适量|少许|若干|\d+|无|未知)$/;

const NON_FOOD_TITLE_PATTERN = /纯露|唇膏|口红|面霜|手工皂|宠物|狗粮|猫粮|(?:^|自制|科学|宠物)猫饭|(?:^|自制|科学|宠物)狗饭|橡皮泥|史莱姆|粘土|洗洁精|清洁剂/;

const REFERENCE_ONLY_STEP_PATTERN = /详见|参考|看下面|见下面|看视频|看图|如图|课程|作品集|记录贴|链接|http|www\./i;

const SOCIAL_NOTE_STEP_PATTERN = /成品图|第一次做|还不错|用心做|哈哈|嘻嘻|厨房新手都可以|不管用什么方法|直接来个|自用记录|打卡|留念|生活中的/;

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const recipesInput = path.resolve(args.recipes || DEFAULT_RECIPES);
  const chunksInput = path.resolve(args.chunks || DEFAULT_CHUNKS);
  const outDir = path.resolve(args.outDir || DEFAULT_OUT_DIR);
  const sampleLimit = Number(args.sampleLimit || 20);
  const limit = Number(args.limit || 0);
  const write = Boolean(args.write);

  if (!fs.existsSync(recipesInput)) {
    throw new Error(`Recipes input not found: ${recipesInput}`);
  }
  if (write && !fs.existsSync(chunksInput)) {
    throw new Error(`Chunks input not found: ${chunksInput}`);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const outputFiles = {
    recipes: path.join(outDir, 'recipes_rag.cleaned.jsonl'),
    chunks: path.join(outDir, 'chunks_rag.cleaned.jsonl'),
    rejected: path.join(outDir, 'recipes_rejected_non_recipe.jsonl'),
    report: path.join(outDir, 'quality_filter_report.json'),
  };

  const keepIds = new Set();
  const rejectCounts = {};
  const rejectSamples = {};
  const startedAt = new Date();
  const stats = {
    scriptVersion: SCRIPT_VERSION,
    recipesInput,
    chunksInput,
    outDir,
    write,
    startedAt: startedAt.toISOString(),
    completedAt: null,
    scannedRecipes: 0,
    keptRecipes: 0,
    rejectedRecipes: 0,
    scannedChunks: 0,
    keptChunks: 0,
    rejectedChunks: 0,
    rejectCounts,
    files: outputFiles,
  };

  const recipeWriter = write ? fs.createWriteStream(outputFiles.recipes, { encoding: 'utf8' }) : null;
  const rejectWriter = fs.createWriteStream(outputFiles.rejected, { encoding: 'utf8' });

  await scanRecipes({
    recipesInput,
    limit,
    write,
    keepIds,
    recipeWriter,
    rejectWriter,
    stats,
    rejectCounts,
    rejectSamples,
    sampleLimit,
  });

  if (recipeWriter) {
    await closeStream(recipeWriter);
  }
  await closeStream(rejectWriter);

  if (write) {
    await filterChunks({ chunksInput, outputFile: outputFiles.chunks, keepIds, stats });
  }

  stats.completedAt = new Date().toISOString();
  stats.rejectSamples = rejectSamples;
  fs.writeFileSync(outputFiles.report, `${JSON.stringify(stats, null, 2)}\n`, 'utf8');

  console.log(`[done] scannedRecipes=${stats.scannedRecipes} keptRecipes=${stats.keptRecipes} rejectedRecipes=${stats.rejectedRecipes}`);
  if (write) {
    console.log(`[done] scannedChunks=${stats.scannedChunks} keptChunks=${stats.keptChunks} rejectedChunks=${stats.rejectedChunks}`);
  }
  console.log(`[done] report=${outputFiles.report}`);
}

async function scanRecipes({
  recipesInput,
  limit,
  write,
  keepIds,
  recipeWriter,
  rejectWriter,
  stats,
  rejectCounts,
  rejectSamples,
  sampleLimit,
}) {
  const rl = readline.createInterface({
    input: fs.createReadStream(recipesInput, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  const startedAt = Date.now();
  for await (const line of rl) {
    if (!line.trim()) {
      continue;
    }

    stats.scannedRecipes += 1;
    let recipe;
    try {
      recipe = JSON.parse(line);
    } catch (error) {
      await recordReject({
        rejectWriter,
        rejectCounts,
        rejectSamples,
        sampleLimit,
        reason: 'parse_error',
        recipe: null,
        line: stats.scannedRecipes,
        detail: error instanceof Error ? error.message : String(error),
      });
      stats.rejectedRecipes += 1;
      continue;
    }

    const rejection = classifyRecipe(recipe);
    if (rejection) {
      await recordReject({
        rejectWriter,
        rejectCounts,
        rejectSamples,
        sampleLimit,
        reason: rejection.reason,
        recipe,
        line: stats.scannedRecipes,
        detail: rejection.detail,
      });
      stats.rejectedRecipes += 1;
    } else {
      keepIds.add(recipe.id);
      stats.keptRecipes += 1;
      if (write) {
        await writeLine(recipeWriter, line);
      }
    }

    if (stats.scannedRecipes % 200000 === 0) {
      const elapsedSeconds = Math.max(1, (Date.now() - startedAt) / 1000);
      const rate = Math.round(stats.scannedRecipes / elapsedSeconds);
      console.log(
        `[recipes] scanned=${stats.scannedRecipes} kept=${stats.keptRecipes} rejected=${stats.rejectedRecipes} rate=${rate}/s`,
      );
    }

    if (limit > 0 && stats.scannedRecipes >= limit) {
      break;
    }
  }
}

async function filterChunks({ chunksInput, outputFile, keepIds, stats }) {
  const rl = readline.createInterface({
    input: fs.createReadStream(chunksInput, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  const writer = fs.createWriteStream(outputFile, { encoding: 'utf8' });
  const startedAt = Date.now();

  try {
    for await (const line of rl) {
      if (!line.trim()) {
        continue;
      }

      stats.scannedChunks += 1;
      let chunk;
      try {
        chunk = JSON.parse(line);
      } catch {
        stats.rejectedChunks += 1;
        continue;
      }

      if (keepIds.has(chunk.recipeId)) {
        stats.keptChunks += 1;
        await writeLine(writer, line);
      } else {
        stats.rejectedChunks += 1;
      }

      if (stats.scannedChunks % 200000 === 0) {
        const elapsedSeconds = Math.max(1, (Date.now() - startedAt) / 1000);
        const rate = Math.round(stats.scannedChunks / elapsedSeconds);
        console.log(
          `[chunks] scanned=${stats.scannedChunks} kept=${stats.keptChunks} rejected=${stats.rejectedChunks} rate=${rate}/s`,
        );
      }
    }
  } finally {
    await closeStream(writer);
  }
}

function classifyRecipe(recipe) {
  const title = clean(recipe.title);
  const dish = clean(recipe.dish);
  const description = clean(recipe.description);
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients.map(clean).filter(Boolean) : [];
  const mainIngredients = Array.isArray(recipe.mainIngredients) ? recipe.mainIngredients.map(clean).filter(Boolean) : [];
  const steps = Array.isArray(recipe.steps) ? recipe.steps.map(clean).filter(Boolean) : [];
  const tags = Array.isArray(recipe.tags) ? recipe.tags.map(clean).filter(Boolean) : [];
  const fullText = [title, dish, description, tags.join(' '), ingredients.join(' '), steps.slice(0, 5).join(' ')].join(' ');

  if (!title) {
    return { reason: 'missing_title' };
  }

  const identityText = [title, dish, tags.join(' '), ingredients.join(' ')].join(' ');

  if (NON_FOOD_TITLE_PATTERN.test([title, dish, tags.join(' ')].join(' '))) {
    return { reason: 'obvious_non_food_keyword', detail: matched(NON_FOOD_TITLE_PATTERN, identityText) };
  }

  if (STRONG_NON_FOOD_PATTERN.test(identityText)) {
    return { reason: 'obvious_non_food_keyword', detail: matched(STRONG_NON_FOOD_PATTERN, identityText) };
  }

  if (/南瓜灯/.test(`${title} ${dish}`) && !/(面包|蘸酱|蛋糕|饼|饭|菜|汤|饮|曲奇|饼干|甜品|慕斯|布丁)/.test(title)) {
    return { reason: 'obvious_non_food_keyword', detail: '南瓜灯' };
  }

  if (TOOL_OR_REVIEW_PATTERN.test([title, dish, tags.join(' ')].join(' '))) {
    return { reason: 'tool_review_or_shopping_content', detail: matched(TOOL_OR_REVIEW_PATTERN, fullText) };
  }

  if (STORAGE_OR_TIPS_PATTERN.test([title, dish].join(' ')) && !looksLikeNamedDish(title, dish, ingredients)) {
    return { reason: 'tips_or_storage_not_recipe', detail: matched(STORAGE_OR_TIPS_PATTERN, `${title} ${dish}`) };
  }

  const collectionMatched = COLLECTION_TITLE_PATTERNS.some((pattern) => pattern.test(title));
  if (collectionMatched && shouldRejectCollectionTitle(title, dish, ingredients, steps)) {
    return { reason: 'collection_or_menu_not_single_recipe', detail: title };
  }

  if (steps.length <= 1 && steps.every((step) => PHOTO_ONLY_STEP_PATTERN.test(step))) {
    return { reason: 'photo_or_note_only_steps', detail: steps.join(' | ') };
  }

  if (steps.length <= 1 && steps.join('').length < 16 && SOCIAL_NOTE_STEP_PATTERN.test(steps.join(' '))) {
    return { reason: 'too_short_to_be_recipe', detail: steps.join(' | ') };
  }

  const cookingSignalCount = countCookingSignals(steps.join(' '));
  if (steps.join('').length >= 40 && cookingSignalCount === 0 && REFERENCE_ONLY_STEP_PATTERN.test(steps.join(' '))) {
    return { reason: 'no_cooking_action_in_steps', detail: steps.slice(0, 2).join(' | ').slice(0, 240) };
  }

  return null;
}

function shouldRejectCollectionTitle(title, dish, ingredients, steps) {
  if (/合集|合辑|大全|菜单|餐单|计划|目录|清单/.test(title)) {
    return true;
  }

  const cookingSignalCount = countCookingSignals(steps.join(' '));
  if (looksLikeNamedDish(title, dish, ingredients) && cookingSignalCount >= 2) {
    return false;
  }

  return true;
}

function looksLikeNamedDish(title, dish, ingredients) {
  const text = `${title} ${dish}`;
  if (dish && dish !== 'Unknown' && dish.length >= 2) {
    return true;
  }
  if (ingredients.length >= 3 && /(饼|糕|饭|面|汤|菜|肉|鱼|虾|鸡|鸭|粥|包|馒头|吐司|面包|沙拉|酱|羹|蛋|豆腐|排骨|牛|羊|猪|素|卷|丸|肠|粉|米线|馅)/.test(text)) {
    return true;
  }
  return false;
}

function countCookingSignals(text) {
  const matches = text.match(COOKING_ACTION_GLOBAL_PATTERN);
  return matches ? matches.length : 0;
}

function recordReject({ rejectWriter, rejectCounts, rejectSamples, sampleLimit, reason, recipe, line, detail }) {
  rejectCounts[reason] = (rejectCounts[reason] || 0) + 1;
  if (!rejectSamples[reason]) {
    rejectSamples[reason] = [];
  }

  const item = {
    line,
    reason,
    detail: detail || null,
    id: recipe?.id || null,
    title: recipe?.title || null,
    dish: recipe?.dish || null,
    ingredients: Array.isArray(recipe?.ingredients) ? recipe.ingredients.slice(0, 8) : [],
    steps: Array.isArray(recipe?.steps) ? recipe.steps.slice(0, 4) : [],
    tags: Array.isArray(recipe?.tags) ? recipe.tags : [],
  };

  if (rejectSamples[reason].length < sampleLimit) {
    rejectSamples[reason].push(item);
  }

  return writeLine(rejectWriter, JSON.stringify(item));
}

function matched(pattern, text) {
  const match = text.match(pattern);
  return match ? match[0] : null;
}

function clean(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--recipes') {
      args.recipes = argv[++index];
    } else if (item === '--chunks') {
      args.chunks = argv[++index];
    } else if (item === '--out-dir') {
      args.outDir = argv[++index];
    } else if (item === '--limit') {
      args.limit = argv[++index];
    } else if (item === '--sample-limit') {
      args.sampleLimit = argv[++index];
    } else if (item === '--write') {
      args.write = true;
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
  node scripts/quality-filter-recipes-rag.cjs [options]

Options:
  --recipes <path>       Input recipes_rag.jsonl. Default: ../../rag-tools/outputs/rag/recipes_rag.jsonl
  --chunks <path>        Input chunks_rag.jsonl. Default: ../../rag-tools/outputs/rag/chunks_rag.jsonl
  --out-dir <path>       Output directory. Default: ../../rag-tools/outputs/rag_quality_cleaned
  --limit <number>       Scan only N recipes. Default: 0 (all)
  --sample-limit <n>     Samples per reject reason in report. Default: 20
  --write                Write cleaned recipes/chunks. Without it, only report/rejects are produced.
`);
}

function writeLine(stream, line) {
  return new Promise((resolve, reject) => {
    stream.once('error', reject);
    if (stream.write(`${line}\n`, 'utf8')) {
      stream.off('error', reject);
      resolve();
    } else {
      stream.once('drain', () => {
        stream.off('error', reject);
        resolve();
      });
    }
  });
}

function closeStream(stream) {
  return new Promise((resolve, reject) => {
    stream.once('error', reject);
    stream.end(resolve);
  });
}
