# DatasetPack v1

`DatasetPack v1` 是给 Android App 下载和管理离线菜谱 RAG 数据的包格式。第一版目标是先支持“官方预 embedding 数据集”，后续再扩展“用户自定义菜谱本机 embedding”。

## 包结构

```text
chishenme-bge-m3-lite-10k/
  dataset-pack.json
  files/
    vectors.f32
    metadata.jsonl
    embedding-manifest.json
```

当前已生成的 Lite 测试包在：

```text
D:\APPS\RAG\packs\chishenme-bge-m3-lite-10k
```

官方三档建议：

```text
Lite    10k chunks       快速真机测试
Medium  100k chunks      beta 测试
Full    全量 chunks      完整库，体积很大
```

## Manifest

`dataset-pack.json` 示例字段：

```json
{
  "schemaVersion": "chishenme.dataset-pack.v1",
  "id": "chishenme-official-bge-m3-lite-10k",
  "name": "吃什么官方菜谱库 Lite 10k",
  "version": "2026.06.19",
  "level": "lite",
  "recipeCount": 10000,
  "chunkCount": 10000,
  "embedding": {
    "model": "BAAI/bge-m3",
    "dimension": 1024,
    "dtype": "float32",
    "normalized": true,
    "denseOnly": true
  },
  "files": [
    {
      "role": "vectors",
      "path": "files/vectors.f32",
      "sizeBytes": 40960000,
      "sha256": "..."
    },
    {
      "role": "metadata",
      "path": "files/metadata.jsonl",
      "sizeBytes": 18586409,
      "sha256": "..."
    }
  ]
}
```

`path` 是相对 `dataset-pack.json` 的路径。也可以在单个文件里加 `url`，用于把大文件放到不同 CDN 或 GitHub Release asset。

## 生成包

在 BGE-M3 实验项目里运行：

```powershell
cd D:\APPS\RAG\bge-m3
python scripts\build_release_datasets.py --sizes lite --overwrite
```

默认输入：

```text
D:\APPS\RAG\bge-m3\outputs\bge-m3-10k
```

默认输出：

```text
D:\APPS\RAG\packs\chishenme-bge-m3-lite-10k
D:\APPS\RAG\packs\dataset-index.json
```

生成三档完整命令：

```powershell
python scripts\build_release_datasets.py --sizes lite medium full --embed --device cuda --batch-size 12 --dtype float32 --overwrite
```

## 发布方式

可选方案：

1. GitHub Release：推荐放 `vectors.f32` 这种大文件，manifest 里的文件使用完整 `url`。
2. GitHub 仓库 raw URL：适合小型 lite 测试包，不适合 full 包。
3. 对象存储或 CDN：适合 standard/full 包。

如果使用同一个目录发布，App 只需要输入 `dataset-pack.json` 的 URL，文件会按相对路径下载。

## App 安装流程

App 页面：

```text
Home -> 菜谱库
```

当前 App 默认读取官方 index：

```text
https://huggingface.co/datasets/Yatorou/ChiShenMe/resolve/main/dataset-index.json
```

用户可以直接选择 Lite / Medium / Full 下载，也可以在“从 URL 安装”里手动输入单个 `dataset-pack.json` URL。

App 下载单个 DatasetPack 时会：

1. 下载 `dataset-pack.json`
2. 校验 schema、embedding 信息、必需文件角色
3. 下载 `vectors.f32`、`metadata.jsonl` 等文件
4. 存到 App 文档目录下的 `datasets/{id}_{version}/`
5. 在 AsyncStorage 里登记已安装数据集
6. 支持启用和删除本机数据集

当前 App 会校验下载后的文件大小。`sha256` 已写入 manifest，但 Android 端 hash 校验还未实现。

## 当前边界

已完成：

- BGE-M3 dense embedding 的 DatasetPack 生成脚本
- App 内 Dataset Library 页面
- 从 URL 下载安装数据集文件
- 本机 installed dataset registry
- 启用当前数据集
- 删除已下载数据集目录
- Android 端 BGE-M3 ONNX query embedding
- Android 端向量 topK 检索

未完成：

- Cross-encoder rerank
- 用户自定义 recipe dataset 的本机 embedding
- manifest `sha256` 校验

下一步应补齐 rerank、用户自定义 dataset 的本机 embedding，以及下载文件的 `sha256` 校验。
