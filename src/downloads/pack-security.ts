import { UserFacingError } from '../errors/user-facing-error.ts';

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
    throw new UserFacingError('PACK_FILES_MISSING', `${label} has no file list.`, { label });
  }

  if (files.length > MAX_PACK_FILE_COUNT) {
    throw new UserFacingError(
      'PACK_FILE_COUNT_EXCEEDED',
      `${label} declares more than ${MAX_PACK_FILE_COUNT} files.`,
      { label, limit: MAX_PACK_FILE_COUNT },
    );
  }

  const paths = new Set<string>();
  const roles = new Set<string>();
  let totalBytes = 0;

  for (const value of files) {
    if (!value || typeof value !== 'object') {
      throw new UserFacingError('PACK_FILE_ENTRY_INVALID', `${label} contains an invalid file entry.`, { label });
    }

    const file = value as Record<string, unknown>;
    if (typeof file.role !== 'string' || !file.role.trim()) {
      throw new UserFacingError('PACK_FILE_ROLE_MISSING', `${label} has a file without a role.`, { label });
    }

    if (typeof file.path !== 'string') {
      throw new UserFacingError('PACK_FILE_PATH_MISSING', `${label} has a file without a path.`, { label });
    }

    const normalizedPath = normalizePackRelativePath(file.path, label);
    if (paths.has(normalizedPath)) {
      throw new UserFacingError(
        'PACK_FILE_PATH_DUPLICATE',
        `${label} repeats the file path ${normalizedPath}.`,
        { label, path: normalizedPath },
      );
    }

    if (!Number.isSafeInteger(file.sizeBytes) || (file.sizeBytes as number) <= 0) {
      throw new UserFacingError(
        'PACK_FILE_SIZE_INVALID',
        `${label} declares an invalid size for ${normalizedPath}.`,
        { label, path: normalizedPath },
      );
    }

    if ((file.sizeBytes as number) > MAX_PACK_FILE_BYTES) {
      throw new UserFacingError(
        'PACK_FILE_SIZE_EXCEEDED',
        `${label} file ${normalizedPath} is over the per-file size limit.`,
        { label, path: normalizedPath },
      );
    }

    normalizeSha256(file.sha256, normalizedPath);
    if (file.url !== undefined) {
      if (typeof file.url !== 'string') {
        throw new UserFacingError(
          'PACK_FILE_URL_INVALID',
          `${label} declares an invalid URL for ${normalizedPath}.`,
          { label, path: normalizedPath },
        );
      }
      assertHttpsUrl(file.url, `${label} file URL`);
    }

    paths.add(normalizedPath);
    roles.add(file.role.trim());
    totalBytes += file.sizeBytes as number;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_PACK_TOTAL_BYTES) {
      throw new UserFacingError('PACK_TOTAL_SIZE_EXCEEDED', `${label} is over the total size limit.`, { label });
    }
  }

  for (const role of requiredRoles) {
    if (!roles.has(role)) {
      const roleList = requiredRoles.join(', ');
      throw new UserFacingError(
        'PACK_REQUIRED_ROLES_MISSING',
        `${label} must contain ${roleList} files.`,
        { label, roles: roleList },
      );
    }
  }
}

export function normalizePackRelativePath(relativePath: string, label = 'Pack'): string {
  const trimmed = relativePath.trim();
  if (!trimmed || trimmed !== relativePath) {
    throw new UserFacingError('PACK_FILE_PATH_EMPTY', `${label} has an empty file path.`, { label });
  }

  if (
    trimmed.length > 512 ||
    CONTROL_CHARACTER_PATTERN.test(trimmed) ||
    AMBIGUOUS_PATH_CHARACTER_PATTERN.test(trimmed)
  ) {
    throw new UserFacingError('PACK_FILE_PATH_UNSAFE', `${label} has an invalid file path.`, { label });
  }

  if (trimmed.startsWith('/') || trimmed.startsWith('\\') || trimmed.includes('\\')) {
    throw new UserFacingError(
      'PACK_FILE_PATH_NOT_RELATIVE',
      `${label} file path must be a safe relative path: ${relativePath}`,
      { label, path: relativePath },
    );
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
    throw new UserFacingError(
      'PACK_FILE_PATH_NOT_RELATIVE',
      `${label} file path must be a safe relative path: ${relativePath}`,
      { label, path: relativePath },
    );
  }

  return parts.join('/');
}

export function assertHttpsUrl(value: string, label: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new UserFacingError('PACK_URL_INVALID', `${label} is not a valid URL.`, { label });
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) {
    throw new UserFacingError(
      'PACK_URL_NOT_SECURE',
      `${label} must be an HTTPS URL without credentials or a fragment.`,
      { label },
    );
  }

  return parsed;
}

export function resolveSecurePackFileUrl(manifestUrl: string, file: PackFileDescriptor, label: string): string {
  const manifest = assertHttpsUrl(manifestUrl, `${label} manifest URL`);
  const normalizedPath = normalizePackRelativePath(file.path, label);
  const resolved = file.url ? assertHttpsUrl(file.url, `${label} file URL`) : new URL(normalizedPath, manifest);
  return assertHttpsUrl(resolved.toString(), `${label} file URL`).toString();
}

export function normalizeSha256(value: unknown, filePath: string): string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value.trim())) {
    throw new UserFacingError('PACK_FILE_SHA256_MISSING', `Missing a valid SHA-256 for ${filePath}.`, {
      path: filePath,
    });
  }

  return value.trim().toLowerCase();
}

export function assertSha256Matches(expected: string, actual: string, filePath: string): void {
  const normalizedExpected = normalizeSha256(expected, filePath);
  const normalizedActual = actual.trim().toLowerCase();
  if (!SHA256_PATTERN.test(normalizedActual) || normalizedActual !== normalizedExpected) {
    throw new UserFacingError('PACK_FILE_SHA256_MISMATCH', `SHA-256 check failed for ${filePath}.`, {
      path: filePath,
    });
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

/** Shared by every pack fetcher: a manifest body that is not JSON should name what failed to parse. */
export function parsePackJsonResponseText(text: string, label: string): unknown {
  const normalized = text.replace(/^\uFEFF/, '').trim();
  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    const preview = normalized.slice(0, 80);
    throw new UserFacingError(
      'PACK_JSON_PARSE_FAILED',
      `Could not parse ${label} JSON; response begins with: ${preview}`,
      { label, preview },
    );
  }
}
