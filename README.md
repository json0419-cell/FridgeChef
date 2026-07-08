# FridgeChef / 是啊！吃什么

[English](#english) | [中文](#中文)

---

## English

FridgeChef is an intelligent recipe recommendation app for everyday cooking. It looks at the ingredients you already have, the recipe libraries you enabled, your recent cooking history, and your current taste preferences. It then uses local RAG retrieval to find candidate recipes and asks Gemini to turn them into practical cooking suggestions.

The goal is not to show a static recipe list. The goal is to answer a more useful question: what can I cook today with what I already have?

### Core Features

- Ingredient management: add ingredients manually or recognize ingredients from fridge photos with AI.
- Smart recommendations: generate recipe suggestions from available ingredients, taste tags, serving size, time limit, difficulty, and dietary restrictions.
- RAG recipe retrieval: retrieve candidate recipes from enabled official and personal recipe libraries, then let Gemini filter and refine the results.
- Personal recipe libraries: create your own recipe libraries, add recipes manually, or generate recipes from YouTube links with Gemini.
- Recipe library management: enable, disable, delete, rename, and filter libraries by recipe name, ingredients, source, and difficulty.
- Cooking history: record recently cooked recipes and avoid repeating them during recommendation.
- Bilingual UI: supports Chinese and English, with automatic initial language selection based on the system language.
- Gemini integration: all AI features use Gemini, and users configure their own Gemini API key locally.

### Recommendation Flow

FridgeChef uses a three-step recommendation flow:

1. Collect local context: current ingredients, user settings, recent cooking history, enabled official libraries, and enabled personal libraries.
2. Retrieve candidate recipes with RAG: search enabled libraries for recipes matching ingredients and taste preferences. If there are no ingredients, FridgeChef can randomly sample candidates from enabled libraries.
3. Refine with Gemini: Gemini filters out non-recipe content, avoids recently cooked dishes, and returns clearer steps that are easier to follow.

If the Gemini API key is not configured, the recommendation page asks the user to configure it first. If a Gemini request fails, the app retries before showing a final failure message.

### Recipe Libraries

FridgeChef supports two types of recipe libraries:

- Official recipe libraries: provided by the app and available in Lite, Medium, and Full dataset sizes.
- My recipe libraries: created and maintained by the user. Recipes can be added manually or generated from YouTube links.

Recommendations only use currently enabled libraries. Downloaded or created libraries are not automatically included unless the user enables them. This makes it possible to switch between different cooking contexts, such as home cooking, weight-loss meals, Cantonese dishes, or kids' meals.

### AI Capabilities

FridgeChef currently uses Gemini for:

- Recognizing ingredients from images.
- Parsing YouTube links and generating recipes.
- Filtering, ranking, and rewriting RAG candidate recipes.
- Producing clearer, more actionable cooking steps.

The Gemini API key is configured by the user and stored only on the device with Expo SecureStore.

### Privacy and Data

FridgeChef does not run its own backend server. User data is stored locally by default, including:

- Ingredient list
- Personal recipe libraries
- Cooking history
- User settings
- Gemini API key

The API key is not stored in SQLite, is not stored in regular AsyncStorage, and is not uploaded to recipe libraries. Images, links, or text are only sent to Gemini when the user actively uses an AI feature.

### Use Cases

- You do not know what to cook today.
- You want dinner ideas based on leftover fridge ingredients.
- You want to avoid repeating the same dishes too often.
- You want to build your own recipe database.
- You want to turn YouTube cooking videos into searchable recipes.
- You want AI to adapt recipe steps to your own taste and constraints.

### Technical Overview

FridgeChef is an Android-first React Native + Expo + TypeScript app.

Main technical components:

- Local SQLite storage
- Expo SecureStore for API key storage
- Local official DatasetPack management
- ONNX embedding query model
- Local vector search and text search
- Gemini API for multimodal recognition and recommendation refinement

This project requires an Android Development Build. It is not intended to run only in Expo Go.

---

## 中文

FridgeChef 是一款面向日常做饭场景的智能菜谱推荐 App。它可以根据你冰箱里已有的食材、启用的菜谱库、最近做过的菜和本次口味要求，使用本地 RAG 检索菜谱，再交给 Gemini 整理成更适合直接照着做的推荐方案。

这个 App 的目标不是简单展示菜谱列表，而是帮助用户回答一个更实际的问题：今天手头这些食材，适合做什么？

### 核心功能

- 食材管理：支持手动添加食材，也支持拍照后用 AI 识别食材。
- 智能推荐：根据当前食材、本次口味标签、人数、时间、难度和忌口生成菜谱推荐。
- RAG 菜谱检索：从启用的官方菜谱库和个人菜谱库中检索候选菜谱，再交给 Gemini 过滤和整理。
- 个人菜谱库：用户可以新建自己的菜谱库，手动添加菜谱，或通过 YouTube 链接让 Gemini 解析生成菜谱。
- 菜谱库管理：支持启用、停用、删除、重命名菜谱库，并支持按菜名、食材、来源和难度筛选。
- 做饭记录：记录最近做过的菜，推荐时自动避开近期重复菜谱。
- 多语言界面：支持中文和英文，并可根据系统语言自动选择初始语言。
- Gemini 集成：所有 AI 功能统一使用 Gemini，用户在本机配置自己的 Gemini API Key。

### 推荐流程

FridgeChef 的推荐流程分为三步：

1. 本地收集上下文：读取当前食材、用户设置、最近做过的菜、启用的官方菜谱库和个人菜谱库。
2. RAG 检索候选菜谱：优先从启用的菜谱库中检索匹配食材和口味要求的菜谱；如果没有食材，也会从启用库中随机抽取候选菜谱。
3. Gemini 整理结果：Gemini 会过滤掉非菜谱内容、避开近期做过的菜，并输出更自然、更适合用户直接操作的做菜步骤。

如果 Gemini API Key 没有配置，推荐页会提示用户先配置 API Key。Gemini 调用失败时会自动重试，连续失败后才提示调用失败。

### 菜谱库

FridgeChef 支持两类菜谱库：

- 官方菜谱库：由 App 提供，可下载 Lite / Medium / Full 三档数据集。
- 我的菜谱库：由用户自己创建和维护，可手动录入菜谱，也可从 YouTube 链接生成菜谱。

推荐只会使用当前启用的菜谱库，不会强制使用所有已下载或已创建的库。这样用户可以按场景切换不同的菜谱来源，例如家常菜库、减脂餐库、广东菜库或儿童餐库。

### AI 能力

FridgeChef 当前使用 Gemini 完成以下任务：

- 识别图片中的食材。
- 从 YouTube 链接解析并生成菜谱。
- 对 RAG 返回的候选菜谱进行过滤、排序和改写。
- 生成更清晰、可执行的做菜步骤。

Gemini API Key 由用户自行配置，并只保存在本机 SecureStore 中。

### 隐私与数据

FridgeChef 不自建服务器。用户数据默认保存在本机，包括：

- 食材列表
- 个人菜谱库
- 做饭历史
- 用户设置
- Gemini API Key

API Key 不写入 SQLite、不写入普通 AsyncStorage，也不会上传到菜谱库。只有在用户主动使用 AI 功能时，相关图片、链接或文本才会发送给 Gemini API 处理。

### 适用场景

- 不知道今天吃什么。
- 想根据冰箱剩余食材快速决定晚饭。
- 想减少重复做同一道菜。
- 想建立自己的菜谱数据库。
- 想把 YouTube 做饭视频整理成可搜索、可推荐的菜谱。
- 想让 AI 根据个人口味生成更适合自己的做菜步骤。

### 技术概览

FridgeChef 是一个 Android-first 的 React Native + Expo + TypeScript App。

主要技术方向：

- 本地 SQLite 数据存储
- Expo SecureStore 保存 API Key
- 本地官方 DatasetPack 管理
- ONNX embedding 查询模型
- 本地向量检索与文本检索
- Gemini API 进行多模态识别和推荐整理

当前项目需要 Android Development Build，不适合只用 Expo Go 运行。
