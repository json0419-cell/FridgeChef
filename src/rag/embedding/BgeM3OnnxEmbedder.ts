import { Directory, File } from 'expo-file-system';
import * as ort from 'onnxruntime-react-native';
import type { EmbeddingModelPackManifest, InstalledEmbeddingModel } from '../../types';

export class BgeM3OnnxEmbedder {
  private tokenizerSession: ort.InferenceSession | null = null;
  private modelSession: ort.InferenceSession | null = null;
  private manifest: EmbeddingModelPackManifest | null = null;

  constructor(private readonly installedModel: InstalledEmbeddingModel) {}

  async embed(text: string): Promise<Float32Array> {
    await this.ensureLoaded();

    if (!this.tokenizerSession || !this.modelSession || !this.manifest) {
      throw new Error('ONNX 模型尚未加载。');
    }

    const tokenizerInputName = this.tokenizerSession.inputNames[0];
    const tokenizerFeeds: Record<string, ort.Tensor> = {
      [tokenizerInputName]: new ort.Tensor('string', [text], [1]),
    };
    const tokenOutputs = await this.tokenizerSession.run(tokenizerFeeds);

    const modelFeeds = this.buildModelFeeds(tokenOutputs);
    const modelOutputs = await this.modelSession.run(modelFeeds);
    const embedding = this.pickEmbeddingOutput(modelOutputs);
    return l2Normalize(embedding);
  }

  private async ensureLoaded() {
    if (this.tokenizerSession && this.modelSession && this.manifest) {
      return;
    }

    const root = new Directory(this.installedModel.localRootUri);
    const manifestFile = new File(this.installedModel.manifestUri);
    this.manifest = (await manifestFile.json()) as EmbeddingModelPackManifest;

    const tokenizerFile = findModelFile(root, this.manifest, 'tokenizerOnnx');
    const modelFile = findModelFile(root, this.manifest, 'modelOnnx');

    this.tokenizerSession = await ort.InferenceSession.create(tokenizerFile.uri);
    this.modelSession = await ort.InferenceSession.create(modelFile.uri);
  }

  private buildModelFeeds(tokenOutputs: ort.InferenceSession.ReturnType): Record<string, ort.Tensor> {
    if (!this.modelSession) {
      throw new Error('ONNX 模型尚未加载。');
    }

    const fallbackTokenFeeds = buildSingleTextTokenFeeds(tokenOutputs);
    const feeds: Record<string, ort.Tensor> = {};
    for (const inputName of this.modelSession.inputNames) {
      const tokenTensor = tokenOutputs[inputName] ?? findTokenOutput(tokenOutputs, inputName);
      if (tokenTensor) {
        feeds[inputName] = tokenTensor as ort.Tensor;
        continue;
      }

      if (fallbackTokenFeeds[inputName]) {
        feeds[inputName] = fallbackTokenFeeds[inputName];
        continue;
      }

      {
        throw new Error(`Tokenizer output 中找不到模型输入：${inputName}`);
      }
    }

    return feeds;
  }

  private pickEmbeddingOutput(outputs: ort.InferenceSession.ReturnType): Float32Array {
    const preferredNames = ['sentence_embedding', 'sentence_embeddings', 'embeddings', 'embedding', 'pooler_output'];
    const outputName = preferredNames.find((name) => outputs[name]) ?? Object.keys(outputs)[0];
    const tensor = outputs[outputName] as ort.Tensor | undefined;

    if (!tensor) {
      throw new Error('ONNX 模型没有返回 embedding output。');
    }

    if (!(tensor.data instanceof Float32Array)) {
      throw new Error(`暂不支持 ${outputName} 的输出类型。`);
    }

    const dims = tensor.dims;
    if (dims.length === 2 && dims[0] === 1) {
      return tensor.data.slice(0, dims[1]);
    }

    if (dims.length === 3 && dims[0] === 1) {
      const hiddenSize = dims[2];
      return tensor.data.slice(0, hiddenSize);
    }

    if (tensor.data.length === this.installedModel.dimension) {
      return tensor.data.slice();
    }

    throw new Error(`无法从 ${outputName} 输出形状 [${dims.join(', ')}] 解析 embedding。`);
  }
}

function findModelFile(root: Directory, manifest: EmbeddingModelPackManifest, role: string) {
  const entry = manifest.files.find((file) => file.role === role);
  if (!entry) {
    throw new Error(`Model pack 缺少 ${role} 文件。`);
  }

  const parts = entry.path.split('/').filter(Boolean);
  if (parts.length === 0) {
    throw new Error(`Model pack ${role} 路径为空。`);
  }

  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = new Directory(current, part);
  }
  return new File(current, parts[parts.length - 1]);
}

function findTokenOutput(outputs: ort.InferenceSession.ReturnType, inputName: string) {
  const normalizedInputName = normalizeName(inputName);
  const outputKey = Object.keys(outputs).find((key) => normalizeName(key) === normalizedInputName);
  return outputKey ? outputs[outputKey] : undefined;
}

function buildSingleTextTokenFeeds(outputs: ort.InferenceSession.ReturnType): Record<string, ort.Tensor> {
  const tokensTensor = outputs.tokens as ort.Tensor | undefined;
  if (!tokensTensor || !('data' in tokensTensor)) {
    return {};
  }

  const tokenIds = tensorDataToBigInt64(tokensTensor.data);
  if (!tokenIds) {
    return {};
  }

  const attentionMask = new BigInt64Array(tokenIds.length);
  attentionMask.fill(1n);

  return {
    input_ids: new ort.Tensor('int64', tokenIds, [1, tokenIds.length]),
    attention_mask: new ort.Tensor('int64', attentionMask, [1, tokenIds.length]),
  };
}

function tensorDataToBigInt64(data: unknown) {
  if (data instanceof BigInt64Array) {
    return data;
  }

  if (data instanceof Int32Array || data instanceof Uint32Array || data instanceof Int16Array || data instanceof Uint16Array) {
    const output = new BigInt64Array(data.length);
    for (let index = 0; index < data.length; index += 1) {
      output[index] = BigInt(data[index]);
    }
    return output;
  }

  if (Array.isArray(data)) {
    const output = new BigInt64Array(data.length);
    for (let index = 0; index < data.length; index += 1) {
      output[index] = BigInt(Number(data[index]));
    }
    return output;
  }

  return null;
}

function normalizeName(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function l2Normalize(vector: Float32Array) {
  let norm = 0;
  for (let index = 0; index < vector.length; index += 1) {
    norm += vector[index] * vector[index];
  }

  const scale = 1 / Math.max(Math.sqrt(norm), 1e-12);
  const normalized = new Float32Array(vector.length);
  for (let index = 0; index < vector.length; index += 1) {
    normalized[index] = vector[index] * scale;
  }
  return normalized;
}
