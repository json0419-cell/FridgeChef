const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;
const AMBIGUOUS_PATH_CHARACTER_PATTERN = /[:?#%]/;

export const MAX_PACK_FILE_COUNT = 32;
export const MAX_PACK_FILE_BYTES = 12 * 1024 * 1024 * 1024;
export const MAX_PACK_TOTAL_BYTES = 16 * 1024 * 1024 * 1024;
export const MIN_FREE_SPACE_RESERVE_BYTES = 64 * 1024 * 1024;

export interface PackFileDescriptor {
  role: string;
  path: string;
  url?: string;
  sizeBytes: number;
  sha256?: string;
}

export function validatePackFiles(files: unknown, requiredRoles: string[], label: string): asserts files is PackFileDescriptor[] {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error(`${label} 缺少文件列表。`);
  }

  if (files.length > MAX_PACK_FILE_COUNT) {
    throw new Error(`${label} 文件数量超过上限（${MAX_PACK_FILE_COUNT}）。`);
  }

  const paths = new Set<string>();
  const roles = new Set<string>();
  let totalBytes = 0;

  for (const value of files) {
    if (!value || typeof value !== 'object') {
      throw new Error(`${label} 包含无效文件项。`);
    }

    const file = value as Record<string, unknown>;
    if (typeof file.role !== 'string' || !file.role.trim()) {
      throw new Error(`${label} 文件缺少 role。`);
    }

    if (typeof file.path !== 'string') {
      throw new Error(`${label} 文件缺少 path。`);
    }

    const normalizedPath = normalizePackRelativePath(file.path, label);
    if (paths.has(normalizedPath)) {
      throw new Error(`${label} 包含重复文件路径：${normalizedPath}`);
    }

    if (!Number.isSafeInteger(file.sizeBytes) || (file.sizeBytes as number) <= 0) {
      throw new Error(`${label} 文件大小无效：${normalizedPath}`);
    }

    if ((file.sizeBytes as number) > MAX_PACK_FILE_BYTES) {
      throw new Error(`${label} 单个文件超过大小上限：${normalizedPath}`);
    }

    normalizeSha256(file.sha256, normalizedPath);
    if (file.url !== undefined) {
      if (typeof file.url !== 'string') {
        throw new Error(`${label} 文件 URL 无效：${normalizedPath}`);
      }
      assertHttpsUrl(file.url, `${label} 文件 URL`);
    }

    paths.add(normalizedPath);
    roles.add(file.role.trim());
    totalBytes += file.sizeBytes as number;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_PACK_TOTAL_BYTES) {
      throw new Error(`${label} 总大小超过上限。`);
    }
  }

  for (const role of requiredRoles) {
    if (!roles.has(role)) {
      throw new Error(`${label} 必须包含 ${requiredRoles.join(' 和 ')} 文件。`);
    }
  }
}

export function normalizePackRelativePath(relativePath: string, label = 'Pack'): string {
  const trimmed = relativePath.trim();
  if (!trimmed || trimmed !== relativePath) {
    throw new Error(`${label} 文件路径为空。`);
  }

  if (
    trimmed.length > 512 ||
    CONTROL_CHARACTER_PATTERN.test(trimmed) ||
    AMBIGUOUS_PATH_CHARACTER_PATTERN.test(trimmed)
  ) {
    throw new Error(`${label} 文件路径无效。`);
  }

  if (trimmed.startsWith('/') || trimmed.startsWith('\\') || trimmed.includes('\\')) {
    throw new Error(`${label} 文件路径必须是安全的相对路径：${relativePath}`);
  }

  const parts = trimmed.split('/');
  if (
    parts.some(
      (part) =>
        !part ||
        part === '.' ||
        part === '..' ||
        part.length > 128 ||
        CONTROL_CHARACTER_PATTERN.test(part),
    )
  ) {
    throw new Error(`${label} 文件路径必须是安全的相对路径：${relativePath}`);
  }

  return parts.join('/');
}

export function assertHttpsUrl(value: string, label: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} 无效。`);
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) {
    throw new Error(`${label} 必须是无凭据、无片段的 HTTPS URL。`);
  }

  return parsed;
}

export function resolveSecurePackFileUrl(manifestUrl: string, file: PackFileDescriptor, label: string): string {
  const manifest = assertHttpsUrl(manifestUrl, `${label} manifest URL`);
  const normalizedPath = normalizePackRelativePath(file.path, label);
  const resolved = file.url ? assertHttpsUrl(file.url, `${label} 文件 URL`) : new URL(normalizedPath, manifest);
  return assertHttpsUrl(resolved.toString(), `${label} 文件 URL`).toString();
}

export function normalizeSha256(value: unknown, filePath: string): string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value.trim())) {
    throw new Error(`文件缺少有效 SHA-256：${filePath}`);
  }

  return value.trim().toLowerCase();
}

export function assertSha256Matches(expected: string, actual: string, filePath: string): void {
  const normalizedExpected = normalizeSha256(expected, filePath);
  const normalizedActual = actual.trim().toLowerCase();
  if (!SHA256_PATTERN.test(normalizedActual) || normalizedActual !== normalizedExpected) {
    throw new Error(`文件 SHA-256 校验失败：${filePath}`);
  }
}

export function requiredAvailableBytes(totalBytes: number): number {
  const reserve = Math.max(MIN_FREE_SPACE_RESERVE_BYTES, Math.ceil(totalBytes * 0.05));
  return totalBytes + reserve;
}

export function isChildUri(rootUri: string, candidateUri: string): boolean {
  const normalizedRoot = rootUri.endsWith('/') ? rootUri : `${rootUri}/`;
  const normalizedCandidate = candidateUri.endsWith('/') ? candidateUri : `${candidateUri}/`;
  return normalizedCandidate.startsWith(normalizedRoot) && normalizedCandidate !== normalizedRoot;
}
