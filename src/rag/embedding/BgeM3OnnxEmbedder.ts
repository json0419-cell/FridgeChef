import { Directory, File } from 'expo-file-system';
import * as ort from 'onnxruntime-react-native';
import type { EmbeddingModelPackManifest, InstalledEmbeddingModel } from '../../types';
import { readAvailableMemoryBytes } from '../model/device-memory.ts';
import { assertSufficientMemoryForModelLoad } from '../model/model-memory-policy.ts';
import { loadUnigramTokenizerFromPack } from './tokenizer-pack.ts';
import type { UnigramTokenizer } from './unigram-tokenizer.ts';

export class BgeM3OnnxEmbedder {
  private readonly installedModel: InstalledEmbeddingModel;
  private tokenizer: UnigramTokenizer | null = null;
  private modelSession: ort.InferenceSession | null = null;
  private manifest: EmbeddingModelPackManifest | null = null;

  constructor(installedModel: InstalledEmbeddingModel) {
    this.installedModel = installedModel;
  }

  async embed(text: string): Promise<Float32Array> {
    await this.ensureLoaded();

    if (!this.tokenizer || !this.modelSession || !this.manifest) {
      throw new Error('ONNX 模型尚未加载。');
    }

    const encoded = this.tokenizer.encode(text);
    const modelOutputs = await this.modelSession.run(this.buildModelFeeds(encoded.inputIds, encoded.attentionMask));
    const embedding = this.pickEmbeddingOutput(modelOutputs);
    return l2Normalize(embedding);
  }

  private async ensureLoaded() {
    if (this.tokenizer && this.modelSession && this.manifest) {
      return;
    }

    const root = new Directory(this.installedModel.localRootUri);
    const manifestFile = new File(this.installedModel.manifestUri);
    this.manifest = (await manifestFile.json()) as EmbeddingModelPackManifest;

    // Checked before the tokenizer so an impossible load fails without first spending memory on it,
    // and on every load rather than only at install time.
    assertSufficientMemoryForModelLoad(
      weightBytes(this.manifest),
      await readAvailableMemoryBytes(),
      this.installedModel.name,
    );

    const tokenizerFile = findModelFile(root, this.manifest, 'tokenizerJson');
    const modelFile = findModelFile(root, this.manifest, 'modelOnnx');

    this.tokenizer = await loadUnigramTokenizerFromPack(this.installedModel, tokenizerFile);

    this.modelSession = await ort.InferenceSession.create(modelFile.uri);
  }

  private buildModelFeeds(inputIds: number[], attentionMask: number[]): Record<string, ort.Tensor> {
    if (!this.modelSession) {
      throw new Error('ONNX 模型尚未加载。');
    }

    const dims = [1, inputIds.length];
    const feeds: Record<string, ort.Tensor> = {};
    for (const inputName of this.modelSession.inputNames) {
      switch (normalizeName(inputName)) {
        case 'inputids':
          feeds[inputName] = new ort.Tensor('int64', toBigInt64(inputIds), dims);
          break;
        case 'attentionmask':
          feeds[inputName] = new ort.Tensor('int64', toBigInt64(attentionMask), dims);
          break;
        case 'tokentypeids':
          feeds[inputName] = new ort.Tensor('int64', new BigInt64Array(inputIds.length), dims);
          break;
        default:
          throw new Error(`Tokenizer 无法提供模型输入：${inputName}`);
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

/** The graph plus any external initializer file; everything ONNX Runtime pulls into memory. */
function weightBytes(manifest: EmbeddingModelPackManifest) {
  return manifest.files
    .filter((file) => file.role === 'modelOnnx' || file.role === 'externalData')
    .reduce((total, file) => total + file.sizeBytes, 0);
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

function toBigInt64(values: number[]) {
  const output = new BigInt64Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    output[index] = BigInt(values[index]);
  }
  return output;
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
