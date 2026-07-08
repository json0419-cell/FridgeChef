import type { File } from 'expo-file-system';
import type { RagMetadataRecord } from '../../types';

export class JsonlMetadataStore {
  constructor(private readonly metadataFile: File) {}

  async getByIndices(indices: number[]): Promise<RagMetadataRecord[]> {
    if (indices.length === 0) {
      return [];
    }

    const wanted = new Set(indices);
    const maxIndex = Math.max(...indices);
    const records = new Map<number, RagMetadataRecord>();
    const decoder = new TextDecoder('utf-8');
    const reader = this.metadataFile.readableStream().getReader();

    let lineBuffer = '';
    let lineIndex = 0;

    try {
      while (records.size < wanted.size) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';

        for (const line of lines) {
          if (wanted.has(lineIndex) && line.trim()) {
            records.set(lineIndex, parseMetadataRecord(line, lineIndex));
          }

          lineIndex += 1;
          if (lineIndex > maxIndex && records.size >= wanted.size) {
            break;
          }
        }
      }

      if (lineBuffer.trim() && wanted.has(lineIndex)) {
        records.set(lineIndex, parseMetadataRecord(lineBuffer, lineIndex));
      }
    } finally {
      reader.releaseLock();
    }

    return indices.map((index) => records.get(index)).filter((record): record is RagMetadataRecord => Boolean(record));
  }
}

function parseMetadataRecord(line: string, fallbackIndex: number): RagMetadataRecord {
  const parsed = JSON.parse(line) as Partial<RagMetadataRecord>;
  return {
    index: typeof parsed.index === 'number' ? parsed.index : fallbackIndex,
    chunkId: typeof parsed.chunkId === 'string' ? parsed.chunkId : undefined,
    recipeId: typeof parsed.recipeId === 'string' ? parsed.recipeId : undefined,
    chunkIndex: typeof parsed.chunkIndex === 'number' ? parsed.chunkIndex : undefined,
    chunkType: typeof parsed.chunkType === 'string' ? parsed.chunkType : undefined,
    text: typeof parsed.text === 'string' ? parsed.text : '',
    metadata: parsed.metadata && typeof parsed.metadata === 'object' ? parsed.metadata : {},
  };
}
