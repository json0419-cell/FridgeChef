import { PrecompiledCharsMap } from './precompiled-charsmap.ts';

/**
 * BGE-M3（XLM-RoBERTa）的 SentencePiece Unigram tokenizer，纯 TypeScript 实现。
 *
 * 对应 tokenizer.json 的处理链：
 * `Precompiled charsmap` → `Replace / {2,}/ → " "` → `Metaspace("▁", always)` → `Unigram` → `<s> A </s>`。
 */

const METASPACE = '▁';
const UNK_PENALTY = 10;

export interface UnigramVocabulary {
  tokens: string[];
  scores: Float32Array;
  unkId: number;
}

export interface EncodedText {
  inputIds: number[];
  attentionMask: number[];
}

export class UnigramTokenizer {
  private readonly charsMap: PrecompiledCharsMap;
  private readonly tokenIds: Map<string, number>;
  private readonly scores: Float32Array;
  private readonly unkId: number;
  private readonly bosId: number;
  private readonly eosId: number;
  private readonly unkScore: number;
  private readonly maxTokenLength: number;
  private readonly maxLength: number;

  constructor(options: { vocabulary: UnigramVocabulary; charsMap: PrecompiledCharsMap; maxLength: number }) {
    const { charsMap, maxLength, vocabulary } = options;
    if (vocabulary.tokens.length !== vocabulary.scores.length) {
      throw new Error('Tokenizer vocab 与 scores 数量不一致。');
    }
    if (!Number.isSafeInteger(maxLength) || maxLength < 3) {
      throw new Error('Tokenizer maxLength 无效。');
    }

    this.charsMap = charsMap;
    this.scores = vocabulary.scores;
    this.unkId = vocabulary.unkId;
    this.maxLength = maxLength;

    this.tokenIds = new Map();
    let maxTokenLength = 1;
    let minScore = Number.POSITIVE_INFINITY;
    for (let id = 0; id < vocabulary.tokens.length; id += 1) {
      const token = vocabulary.tokens[id];
      this.tokenIds.set(token, id);
      const length = codePointLength(token);
      if (length > maxTokenLength) {
        maxTokenLength = length;
      }
      if (vocabulary.scores[id] < minScore) {
        minScore = vocabulary.scores[id];
      }
    }

    this.maxTokenLength = maxTokenLength;
    this.unkScore = minScore - UNK_PENALTY;

    const bosId = this.tokenIds.get('<s>');
    const eosId = this.tokenIds.get('</s>');
    if (bosId === undefined || eosId === undefined || this.unkId < 0 || this.unkId >= vocabulary.tokens.length) {
      throw new Error('Tokenizer vocab 缺少 <s>/</s>/<unk>。');
    }
    this.bosId = bosId;
    this.eosId = eosId;
  }

  encode(text: string): EncodedText {
    const ids: number[] = [];
    const limit = this.maxLength - 2;

    for (const piece of this.preTokenize(text)) {
      if (ids.length >= limit) {
        break;
      }
      this.encodePiece(piece, ids, limit);
    }

    const inputIds = [this.bosId, ...ids, this.eosId];
    return { attentionMask: inputIds.map(() => 1), inputIds };
  }

  /** Precompiled → 空白折叠 → Metaspace 切分。 */
  private preTokenize(text: string): string[] {
    const normalized = this.charsMap.normalize(text).replace(/ {2,}/g, ' ');
    if (normalized.length === 0) {
      return [];
    }

    let escaped = normalized.split(' ').join(METASPACE);
    if (!escaped.startsWith(METASPACE)) {
      escaped = `${METASPACE}${escaped}`;
    }

    const pieces: string[] = [];
    let start = 0;
    for (let index = 1; index <= escaped.length; index += 1) {
      if (index === escaped.length || escaped[index] === METASPACE) {
        pieces.push(escaped.slice(start, index));
        start = index;
      }
    }
    return pieces;
  }

  /** Unigram Viterbi：最大化 log 概率之和，未登录码点合并为单个 <unk>。 */
  private encodePiece(piece: string, output: number[], limit: number) {
    const offsets = codePointOffsets(piece);
    const length = offsets.length - 1;
    if (length === 0) {
      return;
    }

    const best = new Float64Array(length + 1).fill(Number.NEGATIVE_INFINITY);
    const previous = new Int32Array(length + 1).fill(-1);
    const token = new Int32Array(length + 1).fill(-1);
    best[0] = 0;

    for (let start = 0; start < length; start += 1) {
      if (best[start] === Number.NEGATIVE_INFINITY) {
        continue;
      }

      let hasSingleCodePointToken = false;
      const maxSpan = Math.min(this.maxTokenLength, length - start);
      for (let span = 1; span <= maxSpan; span += 1) {
        const candidate = piece.slice(offsets[start], offsets[start + span]);
        const id = this.tokenIds.get(candidate);
        if (id === undefined) {
          continue;
        }

        if (span === 1) {
          hasSingleCodePointToken = true;
        }

        const score = best[start] + this.scores[id];
        const end = start + span;
        if (score > best[end]) {
          best[end] = score;
          previous[end] = start;
          token[end] = id;
        }
      }

      if (!hasSingleCodePointToken) {
        const score = best[start] + this.unkScore;
        if (score > best[start + 1]) {
          best[start + 1] = score;
          previous[start + 1] = start;
          token[start + 1] = this.unkId;
        }
      }
    }

    if (best[length] === Number.NEGATIVE_INFINITY) {
      return;
    }

    const reversed: number[] = [];
    let cursor = length;
    while (cursor > 0) {
      const id = token[cursor];
      // fuse_unk：相邻的未登录片段只产生一个 <unk>。
      if (id !== this.unkId || reversed[reversed.length - 1] !== this.unkId) {
        reversed.push(id);
      }
      cursor = previous[cursor];
    }

    for (let index = reversed.length - 1; index >= 0 && output.length < limit; index -= 1) {
      output.push(reversed[index]);
    }
  }
}

function codePointOffsets(text: string): number[] {
  const offsets: number[] = [];
  for (let index = 0; index < text.length; ) {
    offsets.push(index);
    index += text.codePointAt(index)! > 0xffff ? 2 : 1;
  }
  offsets.push(text.length);
  return offsets;
}

function codePointLength(text: string): number {
  let length = 0;
  for (let index = 0; index < text.length; index += text.codePointAt(index)! > 0xffff ? 2 : 1) {
    length += 1;
  }
  return length;
}
