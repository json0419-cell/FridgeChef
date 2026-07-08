type OutputLanguage = 'zh' | 'en';

export function buildFoodRecognitionPrompt(outputLanguage: OutputLanguage = 'zh') {
  const languageInstruction =
    outputLanguage === 'en'
      ? '2. Ingredient names, categories, units, and notes must be written in English, for example "eggs", "dairy", "pcs".'
      : '2. 食材名称、分类、单位和备注必须使用简体中文，例如“鸡蛋”“蛋类”“个”。';

  const schemaExample =
    outputLanguage === 'en'
      ? {
          items: [
            {
              name: 'eggs',
              category: 'eggs',
              estimatedQuantity: 6,
              unit: 'pcs',
              confidence: 0.9,
              notes: 'Estimated from the egg carton',
            },
          ],
        }
      : {
          items: [
            {
              name: '鸡蛋',
              category: '蛋类',
              estimatedQuantity: 6,
              unit: '个',
              confidence: 0.9,
              notes: '从蛋盒估计数量',
            },
          ],
        };

  return `
你是一个冰箱食材识别助手。请根据图片只识别可食用的食材、饮品和调料。

要求：
1. 不要识别冰箱、餐具、包装袋、盒子、瓶子、罐子、标签、价格贴、保鲜膜等非食材物品本身。
${languageInstruction}
3. 只输出图片中清楚可见的食材、饮品和调料，不要编造看不见的食材。
4. 如果数量可以估计，estimatedQuantity 返回数字；如果数量不确定，estimatedQuantity 返回 null。
5. confidence 为 0 到 1 之间的小数。
6. 只返回严格 JSON，不要返回 Markdown、代码块或解释文字。

返回格式必须完全符合：
${JSON.stringify(schemaExample, null, 2)}
`.trim();
}
