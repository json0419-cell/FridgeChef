const fs = require('fs');
const readline = require('readline');
const path = require('path');

const outputRoot = path.resolve(__dirname, '../../rag-tools/outputs/rag_quality_cleaned');
const recipesPath = path.join(outputRoot, 'recipes_rag.cleaned.jsonl');
const outPath = path.join(outputRoot, 'dataset_quality_audit_candidates.json');
const sampleLimit = 30;

const cookingAction =
  /切|洗|泡|焯|煮|蒸|炒|爆香|煎|炸|烤|炖|焖|煲|拌|腌|烘|烧|调|加|放|倒|撒|淋|搅|揉|擀|包|卷|压|打发|发酵|预热|冷藏|冷冻|装盘|出锅|盛出|过滤|打碎|榨|煸|烫|融化|过筛|混合|均匀|入锅|入烤箱|上锅/;

const hardNonFoodTitle =
  /纯露|唇膏|口红|面霜|手工皂|宠物|狗粮|猫粮|狗饭|橡皮泥|史莱姆|粘土|洗洁精|清洁剂|护肤|洗衣液|沐浴露|洗发水|护手霜/;

const petFoodTitle = /猫饭/;
const humanCatRiceTitle = /日式猫饭|熊猫|龙猫/;

const collectionTitle =
  /合集|合辑|集锦|大全|汇总|目录|清单|菜单|餐单|计划|记录|打卡|日记|作品集|食谱集|菜谱集/;

const tipsTitle =
  /保存方法|保存技巧|储存方法|储存技巧|如何保存|怎么保存|保鲜方法|清洗方法|处理方法|切法|摆盘|装饰教程|基础知识|科普|攻略|测评|评测|开箱|收纳|厨房好物/;

const referenceOnly =
  /^(看图|见图|如图|步骤见图|图片说明|下次写过程|直接上图|直接来个成品图|成品图|记录|打卡|留存|备忘|自用|略|无|\.{2,}|…+)$/;

const photoOrNoteSignal = /看图|见图|如图|下次写过程|直接上图|直接来个|成品图|记录贴|留个爪|留存|备忘|自用记录/;

const buckets = {
  hardNonFoodTitle: createBucket(),
  petFoodTitle: createBucket(),
  collectionLikeTitle: createBucket(),
  tipsOrKnowledgeTitle: createBucket(),
  referenceOnlyOrNoteSteps: createBucket(),
  weakShortSingleStep: createBucket(),
  longCollectionLike: createBucket(),
};
const candidateIds = new Set();

function createBucket() {
  return { count: 0, samples: [] };
}

function add(bucketName, recipe, line, detail) {
  const bucket = buckets[bucketName];
  bucket.count += 1;
  if (recipe.id) {
    candidateIds.add(recipe.id);
  }
  if (bucket.samples.length < sampleLimit) {
    bucket.samples.push({
      line,
      id: recipe.id,
      title: recipe.title,
      dish: recipe.dish,
      detail,
      ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients.slice(0, 8) : [],
      steps: Array.isArray(recipe.steps) ? recipe.steps.slice(0, 5) : [],
      tags: Array.isArray(recipe.tags) ? recipe.tags.slice(0, 10) : [],
    });
  }
}

function clean(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).normalize('NFKC').replace(/\s+/g, ' ').trim();
}

async function main() {
  const startedAt = new Date().toISOString();
  let scanned = 0;
  let parseErrors = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(recipesPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) {
      continue;
    }

    scanned += 1;
    let recipe;
    try {
      recipe = JSON.parse(line);
    } catch {
      parseErrors += 1;
      continue;
    }

    const title = clean(recipe.title);
    const dish = clean(recipe.dish);
    const titleArea = `${title} ${dish}`;
    const steps = Array.isArray(recipe.steps) ? recipe.steps.map(clean).filter(Boolean) : [];
    const stepsText = steps.join(' ');
    const ragLen = clean(recipe.ragText).length;

    if (hardNonFoodTitle.test(titleArea)) {
      add('hardNonFoodTitle', recipe, scanned, titleArea.match(hardNonFoodTitle)?.[0]);
    }
    if (petFoodTitle.test(titleArea) && !humanCatRiceTitle.test(titleArea)) {
      add('petFoodTitle', recipe, scanned, titleArea.match(petFoodTitle)?.[0]);
    }
    if (collectionTitle.test(titleArea)) {
      add('collectionLikeTitle', recipe, scanned, titleArea.match(collectionTitle)?.[0]);
    }
    if (tipsTitle.test(titleArea)) {
      add('tipsOrKnowledgeTitle', recipe, scanned, titleArea.match(tipsTitle)?.[0]);
    }
    if (
      steps.length > 0 &&
      steps.length <= 3 &&
      (steps.every((step) => referenceOnly.test(step)) ||
        (!cookingAction.test(stepsText) && photoOrNoteSignal.test(stepsText)))
    ) {
      add('referenceOnlyOrNoteSteps', recipe, scanned, stepsText.slice(0, 180));
    }
    if (steps.length <= 1 && stepsText.length < 30 && !cookingAction.test(stepsText)) {
      add('weakShortSingleStep', recipe, scanned, stepsText);
    }
    if (ragLen > 5000 && collectionTitle.test(titleArea)) {
      add('longCollectionLike', recipe, scanned, `ragLen=${ragLen}`);
    }
  }

  const report = {
    startedAt,
    completedAt: new Date().toISOString(),
    input: recipesPath,
    scanned,
    parseErrors,
    buckets,
    uniqueCandidateCount: candidateIds.size,
    uniqueCandidateRatio: scanned > 0 ? candidateIds.size / scanned : 0,
    note: 'This audit is read-only. Buckets are candidates for manual review or a stricter v2 filter, not automatic deletion decisions.',
  };

  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ outPath, scanned, parseErrors, uniqueCandidateCount: candidateIds.size, uniqueCandidateRatio: scanned > 0 ? candidateIds.size / scanned : 0, buckets: Object.fromEntries(Object.entries(buckets).map(([name, bucket]) => [name, bucket.count])) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
