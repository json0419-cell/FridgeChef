# ONNX RAG

当前实现把推荐页接到了 Android 本机 RAG 链路：

```text
active DatasetPack
-> BGE-M3 ONNX query model
-> query vector
-> vectors.f32 topK
-> metadata.jsonl
-> RAG recommendations
```

## 为什么不能继续只用 Expo Go

`onnxruntime-react-native` 是 native module。Expo Go 不包含这个 native module，所以接 ONNX 后需要 Expo Development Build。

## 模型必须是量化权重

`model.onnx` 必须是 uint8 动态量化权重，来自 `Xenova/bge-m3` 的 `onnx/sentence_transformers_uint8.onnx`。

之前的模型包用 float32 权重（`model.onnx` 加 2.27GB 的 external data）。ONNX Runtime 不会 mmap external initializer，而是把权重复制进匿名堆：实测 `InferenceSession.create` 峰值 1.6GB 匿名内存（`RssAnon`）。Android 用 low-memory killer 回应超预算的分配，也就是直接 SIGKILL 整个进程 —— 任何 `catch` 都看不到，App 直接闪退。所以下载完、verify 之后加载模型时必然崩溃。

实测对比（x86_64 emulator，4GB RAM，同样的内存压力）：

| 权重 | 包体积 | 峰值 RssAnon | 加载耗时 | 结果 |
| --- | --- | --- | --- | --- |
| float32 | 2.29GB | 1634MB | 4.2s | LOW_MEMORY 被杀 |
| uint8 | 591MB | 983MB | 1.7s | 正常 |

量化后同一 query 的 embedding 与 float32 的 cosine similarity 为 0.9877，检索排序不受影响。

`src/rag/model/model-memory-policy.ts` 在加载前读取 `/proc/meminfo` 的 `MemAvailable` 并做预检：内存不够时抛出可读的错误，而不是让进程被静默杀掉。读不到内存信息时放行 —— 未知不等于不足。

可以直接发布的 manifest 见 `docs/model-pack/bge-m3-query-onnx.model-pack.json`。

## 准备模型包

在 BGE-M3 实验项目里生成模型包：

```powershell
cd D:\APPS\RAG\bge-m3
pip install -r requirements.txt
python scripts\build_bge_m3_model_pack.py --overwrite
```

默认输出：

```text
D:\APPS\RAG\packs\models\bge-m3-query-onnx
  model-pack.json
  files/
    model.onnx
    config.json
    tokenizer.json
    sentencepiece.bpe.model
```

然后上传到 Hugging Face：

```powershell
.\scripts\upload_packs_to_hf.ps1 -RepoId "Yatorou/ChiShenMe"
```

App 默认模型包 URL：

```text
https://huggingface.co/datasets/Yatorou/ChiShenMe/resolve/main/models/bge-m3-query-onnx/model-pack.json
```

## Android Development Build

首次接 native module 后，需要构建开发客户端。

本地 Android 构建：

```powershell
cd D:\androidCode\ChiShenMe\mobile
npx expo run:android
```

之后日常开发：

```powershell
npx expo start --dev-client
```

如果使用 EAS：

```powershell
npx expo install expo-dev-client
npm install --global eas-cli
eas login
eas build --platform android --profile development
```

## App 使用顺序

1. `Home -> 菜谱库` 下载并启用 `Lite`。
2. `Home -> 菜谱推荐` 点击 `下载 BGE-M3 ONNX 模型`。
3. 模型下载完成后刷新推荐页。
4. 推荐页会优先进入 `RAG 模式`。
5. 如果 RAG 条件不满足，会回退到原来的结构化推荐。

## 当前性能边界

当前向量检索是 JS 分块扫描：

```text
Lite: 可用于端到端验证
Medium: 可能较慢
Full: 不建议用当前 JS scanner 直接扫
```

后续要支持 Full，应加：

```text
metadata offset index
ANN / HNSW / IVF index
或 Android native vector search module
```

## 已知风险

- BGE-M3 ONNX 权重约 2.3GB，手机端下载和加载都很重。
- 第一版只保证 Android-first 实验链路，不保证中低端手机性能。
- Query tokenizer 用 TypeScript 实现（`src/rag/embedding/`），不再走 `tokenizer.onnx`。

## Query tokenizer

`tokenizer.onnx` 里的 `ai.onnx.contrib:SentencepieceTokenizer` 只存在于 onnxruntime-extensions。
该 AAR（Maven Central 最新为 0.13.0）里的 `libortextensions.so` / `libonnxruntime_extensions4j_jni.so`
仍按 4KB page 对齐，Android 15 的 16KB page 设备会加载失败，Google Play 也不再接受，
所以 `package.json` 保持 `"onnxruntimeExtensionsEnabled": "false"`，tokenizer 改成纯 TypeScript：

```text
src/rag/embedding/precompiled-charsmap.ts   SentencePiece precompiled_charsmap（darts-clone trie）
src/rag/embedding/unigram-tokenizer.ts      Metaspace + Unigram Viterbi + <s>/</s>
src/rag/embedding/tokenizer-pack.ts         读取 pack 里的 tokenizer.json，并缓存紧凑副本
```

- 词表来自 pack 已有的 `files/tokenizer.json`，不需要重新发布 model pack；`tokenizer.onnx` 仍在包里但不再使用。
- `tokenizer.json` 约 17MB，首次解析后会在 cache 目录写一份紧凑副本（`vocab.txt` + `scores.f32` + `charsmap.bin`），之后启动直接读副本；副本丢失或损坏时自动回退重新解析。
- `tests/unigram-tokenizer.test.ts` 用 Hugging Face `tokenizers` 0.22.1 的输出做黄金用例；3000 条随机样本中 2997 条完全一致。
- 已知差异：HF 的 Precompiled normalizer 按 grapheme cluster 处理，`ｶﾞ` 这类「半角假名 + 浊音符号」会被拆成 `カ` + 组合符号；本实现与 SentencePiece C++（也就是原来的 `tokenizer.onnx`）一致，直接归一化成 `ガ`。中英文菜谱查询不受影响。
