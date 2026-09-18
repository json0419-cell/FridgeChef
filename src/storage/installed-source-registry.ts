// Installed-source registries record which DatasetPacks and models the user installed and enabled.
// An unreadable registry is never reinterpreted as empty: reads report it and writes refuse (ADR 0008).

export const INSTALLED_SOURCE_REGISTRY_VERSION = 2;

export interface RegistryStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export type InstalledSourceRegistryName = 'datasetRegistry' | 'modelRegistry';

export type InstalledSourceRegistryErrorCode =
  | 'REGISTRY_READ_FAILED'
  | 'REGISTRY_CORRUPT_JSON'
  | 'REGISTRY_INVALID_SHAPE'
  | 'REGISTRY_UNKNOWN_VERSION'
  | 'REGISTRY_INVALID_RECORD';

export class InstalledSourceRegistryError extends Error {
  readonly registry: InstalledSourceRegistryName;
  readonly code: InstalledSourceRegistryErrorCode;
  readonly storedVersion: number | null;

  constructor(
    registry: InstalledSourceRegistryName,
    code: InstalledSourceRegistryErrorCode,
    storedVersion: number | null = null,
  ) {
    // The message is shown to users and copied into diagnostics, so it carries codes only.
    super(`${registry}: ${code}`);
    this.name = 'InstalledSourceRegistryError';
    this.registry = registry;
    this.code = code;
    this.storedVersion = storedVersion;
  }
}

export type RegistryReadResult<T> =
  | { status: 'readable'; records: T[] }
  | { status: 'unreadable'; error: InstalledSourceRegistryError };

export interface InstalledSourceDiagnostic {
  category: InstalledSourceRegistryName | 'installedSources';
  code: InstalledSourceRegistryErrorCode;
  occurredAt: string;
  storedVersion: number | null;
  targetVersion: number;
}

export function createInstalledSourceDiagnostic(
  error: unknown,
  occurredAt: Date = new Date(),
): InstalledSourceDiagnostic {
  const registryError = error instanceof InstalledSourceRegistryError ? error : null;
  return {
    category: registryError?.registry ?? 'installedSources',
    code: registryError?.code ?? 'REGISTRY_READ_FAILED',
    occurredAt: occurredAt.toISOString(),
    storedVersion: registryError?.storedVersion ?? null,
    targetVersion: INSTALLED_SOURCE_REGISTRY_VERSION,
  };
}

export interface InstalledSourceRegistry<T> {
  read(): Promise<RegistryReadResult<T>>;
  list(): Promise<T[]>;
  update(transform: (records: T[]) => T[]): Promise<void>;
}

export function createInstalledSourceRegistry<T>({
  name,
  key,
  store,
  isRecord,
}: {
  name: InstalledSourceRegistryName;
  key: string;
  store: RegistryStore;
  isRecord: (value: unknown) => value is T;
}): InstalledSourceRegistry<T> {
  const read = async (): Promise<RegistryReadResult<T>> => {
    let raw: string | null;
    try {
      raw = await store.getItem(key);
    } catch {
      return unreadable(name, 'REGISTRY_READ_FAILED');
    }
    return parseInstalledSourceRegistry(name, raw, isRecord);
  };

  const list = async () => {
    const result = await read();
    if (result.status === 'unreadable') {
      throw result.error;
    }
    return result.records;
  };

  return {
    read,
    list,
    async update(transform) {
      const records = await list();
      await store.setItem(key, serializeInstalledSourceRegistry(transform(records)));
    },
  };
}

export function parseInstalledSourceRegistry<T>(
  name: InstalledSourceRegistryName,
  raw: string | null,
  isRecord: (value: unknown) => value is T,
): RegistryReadResult<T> {
  if (raw === null) {
    return { status: 'readable', records: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return unreadable(name, 'REGISTRY_CORRUPT_JSON');
  }

  // Version 1 stored a bare array of records.
  let records: unknown;
  let storedVersion: number;
  if (Array.isArray(parsed)) {
    records = parsed;
    storedVersion = 1;
  } else if (parsed && typeof parsed === 'object' && 'version' in parsed) {
    const envelope = parsed as { version: unknown; records?: unknown };
    if (envelope.version !== INSTALLED_SOURCE_REGISTRY_VERSION) {
      return unreadable(name, 'REGISTRY_UNKNOWN_VERSION', safeVersion(envelope.version));
    }
    records = envelope.records;
    storedVersion = envelope.version;
  } else {
    return unreadable(name, 'REGISTRY_INVALID_SHAPE');
  }

  if (!Array.isArray(records)) {
    return unreadable(name, 'REGISTRY_INVALID_SHAPE', storedVersion);
  }
  if (!records.every(isRecord)) {
    return unreadable(name, 'REGISTRY_INVALID_RECORD', storedVersion);
  }
  return { status: 'readable', records };
}

export function serializeInstalledSourceRegistry<T>(records: T[]): string {
  return JSON.stringify({ version: INSTALLED_SOURCE_REGISTRY_VERSION, records });
}

function unreadable(
  name: InstalledSourceRegistryName,
  code: InstalledSourceRegistryErrorCode,
  storedVersion: number | null = null,
): RegistryReadResult<never> {
  return { status: 'unreadable', error: new InstalledSourceRegistryError(name, code, storedVersion) };
}

function safeVersion(value: unknown) {
  return Number.isSafeInteger(value) ? (value as number) : null;
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
