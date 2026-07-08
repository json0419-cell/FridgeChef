const fs = require('fs');
const readline = require('readline');
const path = require('path');

const args = new Set(process.argv.slice(2));
const outputRoot = path.resolve(__dirname, '../../rag-tools/outputs/rag_quality_cleaned');
const recipesPath = path.join(outputRoot, 'recipes_rag.cleaned.jsonl');
const chunksPath = path.join(outputRoot, 'chunks_rag.cleaned.jsonl');
const outPath = path.join(outputRoot, 'dataset_validation_report.json');

const sampleLimitArg = process.argv.find((arg) => arg.startsWith('--sample-limit='));
const sampleLimit = sampleLimitArg ? Number(sampleLimitArg.split('=')[1]) : 20;

const nonRecipeStrong = /狗粮|猫粮|宠物|纯露|唇膏|口红|面霜|洗洁精|洗衣液|橡皮泥|黏土|手工皂|香薰蜡烛|护手霜|面膜|沐浴露|洗发水|牙膏|清洁剂|收纳|装修|读书笔记|减脂餐打卡|减肥打卡|餐单|菜单|合集|汇总|菜谱合集|一周食谱|月子餐计划|购物清单|厨房好物|锅具测评|烤箱测评/;
const cookingAction = /炒|煮|炖|煎|炸|烤|蒸|焯|拌|腌|卤|煲|熬|汆|烫|揉|发酵|打发|搅拌|翻炒|爆香|烧开|下锅|入锅|出锅|预热|切|剁|擀|包|调味|调汁|淋|撒|烘/;

function addSample(arr, obj) {
  if (arr.length < sampleLimit) {
    arr.push(obj);
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function textLen(value) {
  return typeof value === 'string' ? value.trim().length : 0;
}

async function validateRecipes() {
  const ids = new Set();
  const stats = {
    lines: 0,
    parseErrors: 0,
    duplicateIds: 0,
    missingId: 0,
    missingTitle: 0,
    missingSteps: 0,
    emptySteps: 0,
    missingIngredients: 0,
    emptyIngredients: 0,
    missingRagText: 0,
    shortRagText: 0,
    missingSearchText: 0,
    noCookingActionInSteps: 0,
    suspiciousStrongKeyword: 0,
    titleTooLong: 0,
    ragTextTooLong: 0,
    samples: {
      parseErrors: [],
      duplicateIds: [],
      missingTitle: [],
      emptySteps: [],
      emptyIngredients: [],
      shortRagText: [],
      noCookingActionInSteps: [],
      suspiciousStrongKeyword: [],
      titleTooLong: [],
      ragTextTooLong: [],
    },
    length: {
      ragTextMin: Infinity,
      ragTextMax: 0,
      ragTextSum: 0,
      stepsMax: 0,
      ingredientsMax: 0,
    },
  };

  const rl = readline.createInterface({
    input: fs.createReadStream(recipesPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) {
      continue;
    }

    stats.lines += 1;
    let item;
    try {
      item = JSON.parse(line);
    } catch (error) {
      stats.parseErrors += 1;
      addSample(stats.samples.parseErrors, {
        line: stats.lines,
        error: error.message,
        text: line.slice(0, 200),
      });
      continue;
    }

    if (!isNonEmptyString(item.id)) {
      stats.missingId += 1;
    } else if (ids.has(item.id)) {
      stats.duplicateIds += 1;
      addSample(stats.samples.duplicateIds, {
        line: stats.lines,
        id: item.id,
        title: item.title,
      });
    } else {
      ids.add(item.id);
    }

    if (!isNonEmptyString(item.title)) {
      stats.missingTitle += 1;
      addSample(stats.samples.missingTitle, {
        line: stats.lines,
        id: item.id,
        title: item.title,
      });
    } else if (item.title.length > 80) {
      stats.titleTooLong += 1;
      addSample(stats.samples.titleTooLong, {
        line: stats.lines,
        id: item.id,
        title: item.title,
      });
    }

    if (!Array.isArray(item.steps)) {
      stats.missingSteps += 1;
    } else {
      if (item.steps.length === 0) {
        stats.emptySteps += 1;
        addSample(stats.samples.emptySteps, {
          line: stats.lines,
          id: item.id,
          title: item.title,
        });
      }

      stats.length.stepsMax = Math.max(stats.length.stepsMax, item.steps.length);
      const stepsText = item.steps.filter(Boolean).join('\n');
      if (!cookingAction.test(stepsText)) {
        stats.noCookingActionInSteps += 1;
        addSample(stats.samples.noCookingActionInSteps, {
          line: stats.lines,
          id: item.id,
          title: item.title,
          steps: item.steps.slice(0, 5),
        });
      }
    }

    if (!Array.isArray(item.ingredients)) {
      stats.missingIngredients += 1;
    } else {
      if (item.ingredients.length === 0) {
        stats.emptyIngredients += 1;
        addSample(stats.samples.emptyIngredients, {
          line: stats.lines,
          id: item.id,
          title: item.title,
          rawIngredients: item.rawIngredients?.slice?.(0, 8),
          steps: item.steps?.slice?.(0, 3),
        });
      }

      stats.length.ingredientsMax = Math.max(stats.length.ingredientsMax, item.ingredients.length);
    }

    const ragLen = textLen(item.ragText);
    if (ragLen === 0) {
      stats.missingRagText += 1;
    } else {
      if (ragLen < 80) {
        stats.shortRagText += 1;
        addSample(stats.samples.shortRagText, {
          line: stats.lines,
          id: item.id,
          title: item.title,
          ragText: item.ragText,
        });
      }
      if (ragLen > 5000) {
        stats.ragTextTooLong += 1;
        addSample(stats.samples.ragTextTooLong, {
          line: stats.lines,
          id: item.id,
          title: item.title,
          ragLen,
        });
      }

      stats.length.ragTextMin = Math.min(stats.length.ragTextMin, ragLen);
      stats.length.ragTextMax = Math.max(stats.length.ragTextMax, ragLen);
      stats.length.ragTextSum += ragLen;
    }

    if (!isNonEmptyString(item.searchText)) {
      stats.missingSearchText += 1;
    }

    const allText = [
      item.title,
      item.description,
      ...(item.steps || []),
      ...(item.ingredients || []),
      ...(item.tags || []),
    ]
      .filter(Boolean)
      .join('\n');
    if (nonRecipeStrong.test(allText)) {
      stats.suspiciousStrongKeyword += 1;
      addSample(stats.samples.suspiciousStrongKeyword, {
        line: stats.lines,
        id: item.id,
        title: item.title,
        match: allText.match(nonRecipeStrong)?.[0],
        steps: item.steps?.slice?.(0, 3),
        tags: item.tags?.slice?.(0, 8),
      });
    }

    if (args.has('--progress') && stats.lines % 250000 === 0) {
      console.error(`[recipes] ${stats.lines}`);
    }
  }

  stats.length.ragTextAvg = stats.lines ? Math.round(stats.length.ragTextSum / stats.lines) : 0;
  if (stats.length.ragTextMin === Infinity) {
    stats.length.ragTextMin = 0;
  }

  return { ids, stats };
}

async function validateChunks(recipeIds) {
  const chunkIds = new Set();
  const recipeChunkCounts = new Map();
  const stats = {
    lines: 0,
    parseErrors: 0,
    duplicateChunkIds: 0,
    missingChunkId: 0,
    missingRecipeId: 0,
    orphanRecipeId: 0,
    missingText: 0,
    shortText: 0,
    missingMetadata: 0,
    metadataRecipeIdMismatch: 0,
    samples: {
      parseErrors: [],
      duplicateChunkIds: [],
      orphanRecipeId: [],
      missingText: [],
      shortText: [],
      metadataRecipeIdMismatch: [],
    },
    length: {
      textMin: Infinity,
      textMax: 0,
      textSum: 0,
    },
  };

  const rl = readline.createInterface({
    input: fs.createReadStream(chunksPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) {
      continue;
    }

    stats.lines += 1;
    let item;
    try {
      item = JSON.parse(line);
    } catch (error) {
      stats.parseErrors += 1;
      addSample(stats.samples.parseErrors, {
        line: stats.lines,
        error: error.message,
        text: line.slice(0, 200),
      });
      continue;
    }

    if (!isNonEmptyString(item.chunkId)) {
      stats.missingChunkId += 1;
    } else if (chunkIds.has(item.chunkId)) {
      stats.duplicateChunkIds += 1;
      addSample(stats.samples.duplicateChunkIds, {
        line: stats.lines,
        chunkId: item.chunkId,
      });
    } else {
      chunkIds.add(item.chunkId);
    }

    if (!isNonEmptyString(item.recipeId)) {
      stats.missingRecipeId += 1;
    } else {
      if (!recipeIds.has(item.recipeId)) {
        stats.orphanRecipeId += 1;
        addSample(stats.samples.orphanRecipeId, {
          line: stats.lines,
          recipeId: item.recipeId,
          chunkId: item.chunkId,
        });
      }

      recipeChunkCounts.set(item.recipeId, (recipeChunkCounts.get(item.recipeId) || 0) + 1);
    }

    if (!item.metadata || typeof item.metadata !== 'object') {
      stats.missingMetadata += 1;
    } else if (item.metadata.recipeId && item.recipeId && item.metadata.recipeId !== item.recipeId) {
      stats.metadataRecipeIdMismatch += 1;
      addSample(stats.samples.metadataRecipeIdMismatch, {
        line: stats.lines,
        recipeId: item.recipeId,
        metadataRecipeId: item.metadata.recipeId,
        chunkId: item.chunkId,
      });
    }

    const len = textLen(item.text);
    if (len === 0) {
      stats.missingText += 1;
      addSample(stats.samples.missingText, {
        line: stats.lines,
        recipeId: item.recipeId,
        chunkId: item.chunkId,
      });
    } else {
      if (len < 80) {
        stats.shortText += 1;
        addSample(stats.samples.shortText, {
          line: stats.lines,
          recipeId: item.recipeId,
          chunkId: item.chunkId,
          text: item.text,
        });
      }

      stats.length.textMin = Math.min(stats.length.textMin, len);
      stats.length.textMax = Math.max(stats.length.textMax, len);
      stats.length.textSum += len;
    }

    if (args.has('--progress') && stats.lines % 250000 === 0) {
      console.error(`[chunks] ${stats.lines}`);
    }
  }

  stats.length.textAvg = stats.lines ? Math.round(stats.length.textSum / stats.lines) : 0;
  if (stats.length.textMin === Infinity) {
    stats.length.textMin = 0;
  }

  let recipesWithoutChunks = 0;
  const samplesWithoutChunks = [];
  for (const id of recipeIds) {
    if (!recipeChunkCounts.has(id)) {
      recipesWithoutChunks += 1;
      addSample(samplesWithoutChunks, { id });
    }
  }

  return { stats, recipesWithoutChunks, samplesWithoutChunks };
}

async function main() {
  const startedAt = new Date().toISOString();
  const { ids, stats: recipeStats } = await validateRecipes();
  const {
    stats: chunkStats,
    recipesWithoutChunks,
    samplesWithoutChunks,
  } = await validateChunks(ids);

  const report = {
    startedAt,
    completedAt: new Date().toISOString(),
    files: {
      recipesPath,
      chunksPath,
    },
    recipeStats: {
      ...recipeStats,
      uniqueRecipeIds: ids.size,
    },
    chunkStats,
    alignment: {
      recipesWithoutChunks,
      samplesWithoutChunks,
    },
    verdict: {
      structurallyUsableForEmbedding:
        recipeStats.parseErrors === 0 &&
        recipeStats.duplicateIds === 0 &&
        recipeStats.missingId === 0 &&
        recipeStats.missingRagText === 0 &&
        chunkStats.parseErrors === 0 &&
        chunkStats.duplicateChunkIds === 0 &&
        chunkStats.orphanRecipeId === 0 &&
        chunkStats.missingText === 0 &&
        recipesWithoutChunks === 0,
      notes: [],
    },
  };

  if (recipeStats.emptyIngredients > 0) {
    report.verdict.notes.push('Some recipes have empty ingredients; usable for semantic RAG, weaker for ingredient filtering.');
  }
  if (recipeStats.noCookingActionInSteps > 0) {
    report.verdict.notes.push('Some recipes have no obvious cooking verb after heuristic scan; sample review is recommended before final release.');
  }
  if (recipeStats.suspiciousStrongKeyword > 0) {
    report.verdict.notes.push('Some suspicious keywords remain; inspect samples to decide whether to tighten filters.');
  }

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(
    JSON.stringify(
      {
        report: outPath,
        recipes: {
          lines: recipeStats.lines,
          uniqueRecipeIds: ids.size,
          parseErrors: recipeStats.parseErrors,
          duplicateIds: recipeStats.duplicateIds,
          missingId: recipeStats.missingId,
          missingTitle: recipeStats.missingTitle,
          emptySteps: recipeStats.emptySteps,
          emptyIngredients: recipeStats.emptyIngredients,
          missingRagText: recipeStats.missingRagText,
          shortRagText: recipeStats.shortRagText,
          noCookingActionInSteps: recipeStats.noCookingActionInSteps,
          suspiciousStrongKeyword: recipeStats.suspiciousStrongKeyword,
          ragTextAvg: recipeStats.length.ragTextAvg,
          ragTextMax: recipeStats.length.ragTextMax,
        },
        chunks: {
          lines: chunkStats.lines,
          parseErrors: chunkStats.parseErrors,
          duplicateChunkIds: chunkStats.duplicateChunkIds,
          orphanRecipeId: chunkStats.orphanRecipeId,
          missingText: chunkStats.missingText,
          shortText: chunkStats.shortText,
          metadataRecipeIdMismatch: chunkStats.metadataRecipeIdMismatch,
          textAvg: chunkStats.length.textAvg,
          textMax: chunkStats.length.textMax,
        },
        alignment: {
          recipesWithoutChunks,
        },
        structurallyUsableForEmbedding: report.verdict.structurallyUsableForEmbedding,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
