/**
 * SentencePiece 的 `precompiled_charsmap` 规范化器。
 *
 * blob 结构（小端）：`[uint32 trieByteLength][darts-clone trie][NUL 分隔的规范化字符串]`。
 * trie 的一次命中返回规范化字符串在最后一段中的偏移量。
 */

const HAS_LEAF_BIT = 0x100;
const EXTENSION_BIT = 0x200;
const VALUE_MASK = 0x7fffffff;
const LABEL_MASK = 0x800000ff;

export class PrecompiledCharsMap {
  private readonly trie: Uint32Array;
  private readonly normalized: Uint8Array;

  private constructor(trie: Uint32Array, normalized: Uint8Array) {
    this.trie = trie;
    this.normalized = normalized;
  }

  static fromBlob(blob: Uint8Array): PrecompiledCharsMap {
    if (blob.length < 4) {
      throw new Error('precompiled_charsmap 数据不完整。');
    }

    const trieByteLength = readUint32LittleEndian(blob, 0);
    if (trieByteLength % 4 !== 0 || trieByteLength + 4 > blob.length) {
      throw new Error('precompiled_charsmap trie 长度无效。');
    }

    const trie = new Uint32Array(trieByteLength / 4);
    for (let index = 0; index < trie.length; index += 1) {
      trie[index] = readUint32LittleEndian(blob, 4 + index * 4);
    }

    return new PrecompiledCharsMap(trie, blob.subarray(4 + trieByteLength));
  }

  normalize(text: string): string {
    const input = encodeUtf8(text);
    const output: number[] = [];

    let index = 0;
    while (index < input.length) {
      const match = this.longestPrefix(input, index);
      if (match) {
        this.appendNormalized(output, match.offset);
        index += match.length;
        continue;
      }

      const length = Math.min(utf8SequenceLength(input[index]), input.length - index);
      for (let offset = 0; offset < length; offset += 1) {
        output.push(input[index + offset]);
      }
      index += length;
    }

    return decodeUtf8(output);
  }

  /** darts-clone common-prefix search，返回最长命中。 */
  private longestPrefix(input: Uint8Array, start: number) {
    if (this.trie.length === 0) {
      return null;
    }

    let unit = this.trie[0];
    let position = unitOffset(unit);
    let match: { length: number; offset: number } | null = null;

    for (let index = start; index < input.length; index += 1) {
      const byte = input[index];
      position = (position ^ byte) >>> 0;
      if (position >= this.trie.length) {
        break;
      }

      unit = this.trie[position];
      if ((unit & LABEL_MASK) >>> 0 !== byte) {
        break;
      }

      position = (position ^ unitOffset(unit)) >>> 0;
      if ((unit & HAS_LEAF_BIT) !== 0) {
        if (position >= this.trie.length) {
          break;
        }
        match = { length: index - start + 1, offset: (this.trie[position] & VALUE_MASK) >>> 0 };
      }
    }

    return match;
  }

  private appendNormalized(output: number[], offset: number) {
    for (let index = offset; index < this.normalized.length; index += 1) {
      const byte = this.normalized[index];
      if (byte === 0) {
        return;
      }
      output.push(byte);
    }
  }
}

function unitOffset(unit: number) {
  return (((unit >>> 10) * ((unit & EXTENSION_BIT) !== 0 ? 256 : 1)) >>> 0);
}

function readUint32LittleEndian(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
  );
}

function utf8SequenceLength(leadByte: number) {
  if (leadByte < 0x80) {
    return 1;
  }
  if ((leadByte & 0xe0) === 0xc0) {
    return 2;
  }
  if ((leadByte & 0xf0) === 0xe0) {
    return 3;
  }
  if ((leadByte & 0xf8) === 0xf0) {
    return 4;
  }
  return 1;
}

export function encodeUtf8(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0xfffd;
    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint < 0x10000) {
      bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}

export function decodeUtf8(bytes: ArrayLike<number>): string {
  let result = '';
  let index = 0;
  while (index < bytes.length) {
    const lead = bytes[index];
    const length = Math.min(utf8SequenceLength(lead), bytes.length - index);

    let codePoint: number;
    if (length === 1) {
      codePoint = lead < 0x80 ? lead : 0xfffd;
    } else if (length === 2) {
      codePoint = ((lead & 0x1f) << 6) | (bytes[index + 1] & 0x3f);
    } else if (length === 3) {
      codePoint = ((lead & 0x0f) << 12) | ((bytes[index + 1] & 0x3f) << 6) | (bytes[index + 2] & 0x3f);
    } else {
      codePoint =
        ((lead & 0x07) << 18) |
        ((bytes[index + 1] & 0x3f) << 12) |
        ((bytes[index + 2] & 0x3f) << 6) |
        (bytes[index + 3] & 0x3f);
    }

    result += String.fromCodePoint(codePoint > 0x10ffff ? 0xfffd : codePoint);
    index += length;
  }
  return result;
}
