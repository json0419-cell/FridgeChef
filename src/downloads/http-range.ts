export interface ByteRange {
  start: number;
  end: number;
}

export interface ParsedContentRange extends ByteRange {
  total: number;
}

export function nextByteRange(offset: number, totalBytes: number, chunkBytes: number): ByteRange {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(totalBytes) ||
    !Number.isSafeInteger(chunkBytes) ||
    offset < 0 ||
    totalBytes <= 0 ||
    offset >= totalBytes ||
    chunkBytes <= 0
  ) {
    throw new Error('HTTP Range 参数无效。');
  }

  return { start: offset, end: Math.min(totalBytes - 1, offset + chunkBytes - 1) };
}

export function parseContentRange(value: string | null): ParsedContentRange | null {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(value?.trim() ?? '');
  if (!match) {
    return null;
  }

  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = Number(match[3]);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    !Number.isSafeInteger(total) ||
    start < 0 ||
    end < start ||
    total <= end
  ) {
    return null;
  }

  return { start, end, total };
}

export function validateRangeResponse(
  status: number,
  contentRangeHeader: string | null,
  requested: ByteRange,
  totalBytes: number,
  receivedBytes: number,
): void {
  const expectedBytes = requested.end - requested.start + 1;

  if (status === 200) {
    if (requested.start !== 0 || requested.end !== totalBytes - 1 || receivedBytes !== totalBytes) {
      throw new Error('下载服务器不支持安全的断点续传。');
    }
    return;
  }

  if (status !== 206) {
    throw new Error(`分块下载失败 (${status})。`);
  }

  const contentRange = parseContentRange(contentRangeHeader);
  if (
    !contentRange ||
    contentRange.start !== requested.start ||
    contentRange.end !== requested.end ||
    contentRange.total !== totalBytes ||
    receivedBytes !== expectedBytes
  ) {
    throw new Error('下载服务器返回了无效的 Content-Range。');
  }
}
