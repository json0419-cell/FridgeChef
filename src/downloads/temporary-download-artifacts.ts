// Pack and model downloads stage, resume, and park files under reserved sibling names. The names are
// built here and classified here so a new staging name cannot drift out of the cache sweep.
//
// Only *partial downloads* are sweepable. A backup directory holds a previous install that the
// commit path moves back on rollback, so it holds real installed data and is deliberately not
// classified as a partial download: sweeping one would destroy an installed pack mid-install.

const PARTIAL_DOWNLOAD_SUFFIXES = [
  // A one-shot staging directory for a download that cannot resume.
  /\.download-\d+-[a-z0-9]+$/,
  // A resumable staging directory, reused across attempts for the same pack version.
  /\.download$/,
];

export interface RemovableEntry {
  readonly name: string;
  delete(): void;
}

export function stagingDirectoryName(baseName: string): string {
  return reservedName(baseName, 'download');
}

export function resumableStagingDirectoryName(baseName: string): string {
  return `${baseName}.download`;
}

/** Not a partial download: the previous install lives here until the new one commits. */
export function backupDirectoryName(baseName: string): string {
  return reservedName(baseName, 'backup');
}

export function isPartialDownloadName(name: string): boolean {
  return PARTIAL_DOWNLOAD_SUFFIXES.some((suffix) => suffix.test(name));
}

/**
 * Deletes every partial download among `entries` and leaves everything else in place. Each entry is
 * attempted even after one fails, so a single unremovable directory cannot stop the rest of the
 * sweep. The thrown error counts failures without naming any path.
 */
export function removePartialDownloads(entries: readonly RemovableEntry[]): void {
  let failures = 0;

  for (const entry of entries) {
    if (!isPartialDownloadName(entry.name)) {
      continue;
    }

    try {
      entry.delete();
    } catch {
      failures += 1;
    }
  }

  if (failures > 0) {
    throw new Error(`Partial downloads could not be removed: ${failures}`);
  }
}

function reservedName(baseName: string, kind: 'download' | 'backup') {
  return `${baseName}.${kind}-${Date.now()}-${randomSuffix()}`;
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 10);
}
