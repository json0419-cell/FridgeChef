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
    tokenizer.onnx
    model.onnx
    model.onnx_data
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
- tokenizer.onnx 依赖 ONNX Runtime Extensions，因此 `package.json` 已设置 `onnxruntimeExtensionsEnabled`。
