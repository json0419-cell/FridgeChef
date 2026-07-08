# Android Local Embedding Plan

目标：官方默认菜谱库使用预 embedding 的 DatasetPack；用户自定义小型 recipe dataset 在手机端本机生成 embedding，然后也保存成同一套 DatasetPack/registry 结构。

## 关键边界

当前项目已经接入 `onnxruntime-react-native`，需要 Android Development Build。Expo Go 不包含这个 native module。

Development Build 可以运行：

- Storage SQLite
- AI 拍照识别
- 本地结构化推荐
- DatasetPack 下载、启用、删除
- Android 本机 BGE-M3 ONNX query embedding
- 本机向量 topK 检索

推荐路线：

```text
Expo development build + onnxruntime-react-native + BGE-M3 ONNX
```

原因：

- BGE-M3 query embedding 需要 tokenizer、ONNX model、native inference runtime
- `onnxruntime-react-native` 是 native module
- Expo Go 不包含这个 native module

## 官方数据集

官方数据集不要在手机上重新 embedding。应在开发机或服务器一次性处理：

```text
D:\androidCode\ChiShenMe\raw-data\recipe_corpus_full.json
-> preprocessing
-> chunks_rag.jsonl
-> BGE-M3 embedding
-> vectors.f32 + metadata.jsonl
-> DatasetPack
-> GitHub Release / CDN
-> App 下载
```

当前已有测试包：

```text
D:\APPS\RAG\packs\chishenme-bge-m3-lite-10k
```

## 用户自定义数据集

建议第一版只支持小型用户库，例如几百到几千条 recipe。流程：

```text
用户导入 JSON / JSONL
-> 本机 parse + normalize
-> chunk
-> BGE-M3 ONNX embedding
-> vectors.f32 + metadata.jsonl
-> 写成本地 custom DatasetPack
-> registry 设为 active
```

不要让用户在手机上 embedding 全量百万级数据。耗时、发热、电量和存储都会很差。

## 推荐查询链路

统一查询流程：

```text
用户输入需求
-> 构造中英双语 query text
-> BGE-M3 ONNX 生成 query vector
-> 读取 active DatasetPack 的 vectors.f32
-> cosine / dot topK
-> 根据 metadata.jsonl 取 recipe/chunk 信息
-> 可选 cross-encoder rerank
-> 展示推荐
```

因为当前 corpus vector 已 normalized，query vector 也应 normalized。topK 第一版可以用暴力扫描，lite/standard 数据集够用；full 数据集再考虑 ANN 索引。

## 数据格式约束

用户自定义 recipe 输入建议先收敛到一种格式：

```json
{
  "id": "u001",
  "title": "番茄炒蛋",
  "mainIngredients": ["番茄", "鸡蛋"],
  "seasonings": ["盐", "葱"],
  "steps": ["鸡蛋炒熟盛出", "番茄炒出汁", "合炒调味"],
  "tags": ["家常菜", "快手菜"]
}
```

后续可以支持从自由文本导入，但应先转成上述结构化格式再 embedding。

## 实施顺序

1. 接 `onnxruntime-react-native`，切到 Expo development build。
2. 放入 BGE-M3 ONNX model、tokenizer files，并实现 `embedQuery(text)`。
3. 实现 `searchDataset(activeDataset, queryVector, topK)` 暴力扫描。
4. 把 Recommendations 页面切到 RAG 结果，保留现有结构化推荐作为 fallback。
5. 实现用户 JSON/JSONL 导入、chunk、批量本机 embedding。
6. 再考虑 cross-encoder rerank 和 ANN 索引。
