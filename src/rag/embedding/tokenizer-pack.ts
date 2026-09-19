import { Directory, File, Paths } from 'expo-file-system';
import type { InstalledEmbeddingModel } from '../../types';
import { PrecompiledCharsMap } from './precompiled-charsmap.ts';
import { UnigramTokenizer, type UnigramVocabulary } from './unigram-tokenizer.ts';
import { UserFacingError } from '../../errors/user-facing-error.ts';

/**
 * 从 model pack 的 `tokenizer.json` 构建 tokenizer。
 *
 * 该文件约 17MB，JSON.parse 一次要付出可观的内存代价，所以首次解析后会在 cache 目录写一份
 * 紧凑副本（按行分隔的词表 + Float32 分数 + charsmap 原始字节），之后直接读副本。副本随时可能
 * 被系统清理或损坏，任何一步失败都会回退到重新解析 `tokenizer.json`。
 */

const CACHE_VERSION = 1;
const CACHE_ROOT_NAME = 'bge-m3-tokenizer';

export interface TokenizerData {
  charsMapBlob: Uint8Array;
  vocabulary: UnigramVocabulary;
}

export async function loadUnigramTokenizerFromPack(
  model: InstalledEmbeddingModel,
  tokenizerJson: File,
): Promise<UnigramTokenizer> {
  const cache = new Directory(Paths.cache, CACHE_ROOT_NAME, cacheKey(model));
  const sourceSizeBytes = tokenizerJson.size;

  let data = await readCachedTokenizer(cache, sourceSizeBytes);
  if (!data) {
    data = parseTokenizerJson(await tokenizerJson.text());
    writeCachedTokenizer(cache, data, sourceSizeBytes);
  }

  return new UnigramTokenizer({
    charsMap: PrecompiledCharsMap.fromBlob(data.charsMapBlob),
    maxLength: model.maxLength,
    vocabulary: data.vocabulary,
  });
}

/** 只接受 BGE-M3 使用的处理链，其他 tokenizer 直接报错而不是静默产生错误的 token。 */
export function parseTokenizerJson(text: string): TokenizerData {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  const model = parsed.model as Record<string, unknown> | undefined;
  if (!model || model.type !== 'Unigram' || model.byte_fallback === true) {
    throw new UserFacingError('TOKENIZER_NOT_UNIGRAM', 'tokenizer.json is not a Unigram tokenizer.');
  }

  const unkId = model.unk_id;
  if (!Number.isSafeInteger(unkId)) {
    throw new UserFacingError('TOKENIZER_UNK_ID_MISSING', 'tokenizer.json is missing unk_id.');
  }

  const entries = model.vocab;
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new UserFacingError('TOKENIZER_VOCAB_MISSING', 'tokenizer.json is missing vocab.');
  }

  const tokens = new Array<string>(entries.length);
  const scores = new Float32Array(entries.length);
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!Array.isArray(entry) || typeof entry[0] !== 'string' || typeof entry[1] !== 'number') {
      throw new UserFacingError('TOKENIZER_VOCAB_ENTRY_INVALID', 'tokenizer.json has an invalid vocab entry.');
    }
    tokens[index] = entry[0];
    scores[index] = entry[1];
  }

  assertExpectedPipeline(parsed);

  return {
    charsMapBlob: decodeBase64(readCharsMapBase64(parsed)),
    vocabulary: { scores, tokens, unkId: unkId as number },
  };
}

const EXPECTED_POST_PROCESSOR_SINGLE = [
  { SpecialToken: { id: '<s>', type_id: 0 } },
  { Sequence: { id: 'A', type_id: 0 } },
  { SpecialToken: { id: '</s>', type_id: 0 } },
];

function assertExpectedPipeline(parsed: Record<string, unknown>) {
  const preTokenizer = parsed.pre_tokenizer as Record<string, unknown> | undefined;
  if (
    !preTokenizer ||
    preTokenizer.type !== 'Metaspace' ||
    preTokenizer.replacement !== '▁' ||
    (preTokenizer.prepend_scheme !== undefined && preTokenizer.prepend_scheme !== 'always')
  ) {
    throw new UserFacingError('TOKENIZER_PRE_TOKENIZER_UNEXPECTED', 'The tokenizer.json pre_tokenizer is not the expected Metaspace.');
  }

  const normalizers = readNormalizers(parsed);
  const collapseSpaces = normalizers[1] as
    | { type?: string; pattern?: { Regex?: string }; content?: string }
    | undefined;
  if (
    !collapseSpaces ||
    collapseSpaces.type !== 'Replace' ||
    collapseSpaces.pattern?.Regex !== ' {2,}' ||
    collapseSpaces.content !== ' '
  ) {
    throw new UserFacingError('TOKENIZER_NORMALIZER_UNEXPECTED', 'The tokenizer.json normalizer is not the expected whitespace-collapsing rule.');
  }

  const single = (parsed.post_processor as { single?: unknown[] } | undefined)?.single;
  if (JSON.stringify(single) !== JSON.stringify(EXPECTED_POST_PROCESSOR_SINGLE)) {
    throw new UserFacingError('TOKENIZER_POST_PROCESSOR_UNEXPECTED', 'The tokenizer.json post_processor is not the expected <s> A </s>.');
  }
}

function readNormalizers(parsed: Record<string, unknown>): unknown[] {
  const normalizers = (parsed.normalizer as { normalizers?: unknown[] } | undefined)?.normalizers;
  return Array.isArray(normalizers) ? normalizers : [];
}

function readCharsMapBase64(parsed: Record<string, unknown>) {
  const precompiled = readNormalizers(parsed)[0] as
    | { type?: string; precompiled_charsmap?: unknown }
    | undefined;

  if (!precompiled || precompiled.type !== 'Precompiled' || typeof precompiled.precompiled_charsmap !== 'string') {
    throw new UserFacingError('TOKENIZER_CHARSMAP_MISSING', 'tokenizer.json is missing precompiled_charsmap.');
  }
  return precompiled.precompiled_charsmap;
}

async function readCachedTokenizer(cache: Directory, sourceSizeBytes: number): Promise<TokenizerData | null> {
  try {
    const metadataFile = new File(cache, 'meta.json');
    if (!metadataFile.exists) {
      return null;
    }

    const metadata = JSON.parse(await metadataFile.text()) as {
      version?: number;
      tokenCount?: number;
      unkId?: number;
      sourceSizeBytes?: number;
    };
    if (
      metadata.version !== CACHE_VERSION ||
      metadata.sourceSizeBytes !== sourceSizeBytes ||
      !Number.isSafeInteger(metadata.tokenCount) ||
      !Number.isSafeInteger(metadata.unkId)
    ) {
      return null;
    }

    const tokenCount = metadata.tokenCount as number;
    const tokens = (await new File(cache, 'vocab.txt').text()).split('\n');
    const scoreBytes = await new File(cache, 'scores.f32').bytes();
    const charsMapBlob = await new File(cache, 'charsmap.bin').bytes();
    if (tokens.length !== tokenCount || scoreBytes.length !== tokenCount * 4) {
      return null;
    }

    return {
      charsMapBlob,
      vocabulary: {
        scores: new Float32Array(scoreBytes.slice().buffer),
        tokens,
        unkId: metadata.unkId as number,
      },
    };
  } catch {
    return null;
  }
}

function writeCachedTokenizer(cache: Directory, data: TokenizerData, sourceSizeBytes: number) {
  try {
    cache.create({ idempotent: true, intermediates: true });
    new File(cache, 'vocab.txt').write(data.vocabulary.tokens.join('\n'));
    new File(cache, 'scores.f32').write(new Uint8Array(data.vocabulary.scores.buffer.slice(0)));
    new File(cache, 'charsmap.bin').write(data.charsMapBlob);
    new File(cache, 'meta.json').write(
      JSON.stringify({
        sourceSizeBytes,
        tokenCount: data.vocabulary.tokens.length,
        unkId: data.vocabulary.unkId,
        version: CACHE_VERSION,
      }),
    );
  } catch {
    // 缓存只是加速手段，写失败时下次重新解析 tokenizer.json 即可。
  }
}

function cacheKey(model: InstalledEmbeddingModel) {
  return `${model.id}-${model.version}`.replace(/[^a-zA-Z0-9._-]/g, '_');
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function decodeBase64(text: string): Uint8Array {
  const lookup = new Int16Array(128).fill(-1);
  for (let index = 0; index < BASE64_ALPHABET.length; index += 1) {
    lookup[BASE64_ALPHABET.charCodeAt(index)] = index;
  }

  const output = new Uint8Array(Math.ceil((text.length * 3) / 4));
  let written = 0;
  let buffer = 0;
  let bits = 0;

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 61 /* '=' */) {
      break;
    }

    const value = code < 128 ? lookup[code] : -1;
    if (value < 0) {
      if (code === 9 || code === 10 || code === 13 || code === 32) {
        continue;
      }
      throw new UserFacingError('TOKENIZER_CHARSMAP_BASE64_INVALID', 'precompiled_charsmap is not valid base64.');
    }

    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[written] = (buffer >> bits) & 0xff;
      written += 1;
    }
  }

  return output.subarray(0, written);
}
