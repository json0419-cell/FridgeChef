// Backup and device transfer carry ordinary storage — including the installed-source registries —
// but never the DatasetPack and model files those registries name. A restored install therefore
// starts with records pointing at files that are not there.
//
// Reads reconcile every stored record against the files on disk so the app reports those sources as
// not installed instead of referencing missing files. Absence is not corruption: the stored bytes
// are never rewritten, an unreadable registry still reports unreadable so a restore cannot reach the
// recovery path meant for damaged bytes (ADR 0008), and a probe that cannot answer counts the
// artifact as absent rather than failing the whole read.

import type { InstalledSourceRegistryError, RegistryReadResult } from './installed-source-registry.ts';

export interface InstalledArtifactLocation {
  readonly localRootUri: string;
  readonly manifestUri: string;
}

export type ReconciledRegistryReadResult<T> =
  | { status: 'readable'; records: T[]; missing: T[] }
  | { status: 'unreadable'; error: InstalledSourceRegistryError };

export function reconcileInstalledSourceRead<T extends InstalledArtifactLocation>(
  result: RegistryReadResult<T>,
  isArtifactPresent: (record: T) => boolean,
): ReconciledRegistryReadResult<T> {
  if (result.status === 'unreadable') {
    return result;
  }

  const records: T[] = [];
  const missing: T[] = [];
  for (const record of result.records) {
    (isPresent(record, isArtifactPresent) ? records : missing).push(record);
  }
  return { status: 'readable', records, missing };
}

function isPresent<T>(record: T, isArtifactPresent: (record: T) => boolean) {
  try {
    return isArtifactPresent(record);
  } catch {
    return false;
  }
}
