import { Directory, File, FileMode } from 'expo-file-system';
import type { FileHandle } from 'expo-file-system';
import type { DatasetPackManifest, InstalledDataset, VectorSearchResult } from '../../types';

const DEFAULT_ROWS_PER_BATCH = 1024;

export class F32VectorStore {
  private manifest: DatasetPackManifest | null = null;
  private vectorFile: File | null = null;

  constructor(
    private readonly dataset: InstalledDataset,
    private readonly rowsPerBatch = DEFAULT_ROWS_PER_BATCH,
  ) {}

  async search(queryVector: Float32Array, topK: number): Promise<VectorSearchResult[]> {
    await this.ensureLoaded();

    if (!this.manifest || !this.vectorFile) {
      throw new Error('向量库尚未加载。');
    }

    const dimension = this.manifest.embedding.dimension;
    if (queryVector.length !== dimension) {
      throw new Error(`Query vector 维度不匹配：${queryVector.length} != ${dimension}`);
    }

    const count = this.manifest.chunkCount;
    const rowBytes = dimension * Float32Array.BYTES_PER_ELEMENT;
    const top: VectorSearchResult[] = [];

    const handle = this.vectorFile.open(FileMode.ReadOnly);
    try {
      for (let start = 0; start < count; start += this.rowsPerBatch) {
        const rows = Math.min(this.rowsPerBatch, count - start);
        const byteStart = start * rowBytes;
        const byteLength = rows * rowBytes;
        const vectors = readFloat32Chunk(handle, byteStart, byteLength);

        for (let row = 0; row < rows; row += 1) {
          const score = dotRow(vectors, row * dimension, queryVector);
          pushTopK(top, { index: start + row, score }, topK);
        }
      }
    } finally {
      handle.close();
    }

    return top.sort((a, b) => b.score - a.score);
  }

  private async ensureLoaded() {
    if (this.manifest && this.vectorFile) {
      return;
    }

    const root = new Directory(this.dataset.localRootUri);
    const manifestFile = new File(this.dataset.manifestUri);
    this.manifest = (await manifestFile.json()) as DatasetPackManifest;
    this.vectorFile = findDatasetFile(root, this.manifest, 'vectors');

    if (this.manifest.embedding.dtype !== 'float32') {
      throw new Error(`当前向量库 dtype=${this.manifest.embedding.dtype}，暂只支持 float32。`);
    }
  }
}

function readFloat32Chunk(handle: FileHandle, byteStart: number, byteLength: number) {
  handle.offset = byteStart;
  const bytes = handle.readBytes(byteLength);
  if (bytes.byteLength !== byteLength) {
    throw new Error(`向量文件读取长度不匹配：${bytes.byteLength} != ${byteLength}`);
  }

  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / Float32Array.BYTES_PER_ELEMENT);
}

export async function getMetadataFileForDataset(dataset: InstalledDataset): Promise<File> {
  const root = new Directory(dataset.localRootUri);
  const manifestFile = new File(dataset.manifestUri);
  const manifest = (await manifestFile.json()) as DatasetPackManifest;
  return findDatasetFile(root, manifest, 'metadata');
}

function findDatasetFile(root: Directory, manifest: DatasetPackManifest, role: string) {
  const entry = manifest.files.find((file) => file.role === role);
  if (!entry) {
    throw new Error(`Dataset pack 缺少 ${role} 文件。`);
  }

  const parts = entry.path.split('/').filter(Boolean);
  if (parts.length === 0) {
    throw new Error(`Dataset ${role} 路径为空。`);
  }

  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = new Directory(current, part);
  }
  return new File(current, parts[parts.length - 1]);
}

function dotRow(vectors: Float32Array, offset: number, query: Float32Array) {
  let score = 0;
  for (let index = 0; index < query.length; index += 1) {
    score += vectors[offset + index] * query[index];
  }
  return score;
}

function pushTopK(top: VectorSearchResult[], result: VectorSearchResult, topK: number) {
  if (top.length < topK) {
    top.push(result);
    top.sort((a, b) => a.score - b.score);
    return;
  }

  if (result.score <= top[0].score) {
    return;
  }

  top[0] = result;
  top.sort((a, b) => a.score - b.score);
}
