// Release-validation fixtures (#27). They reproduce two failures that a tester cannot otherwise
// reach on a release build — an app-private database and app-private registries are not writable
// from adb without a debuggable build — so the migration and installed-source recovery screens can
// be exercised on real hardware.
//
// The selection is a build-time constant: Metro inlines `process.env.EXPO_PUBLIC_*` into the bundle,
// so a build made without the variable contains no selected fixture and every function below is a
// no-op. Nothing in this repository sets the variable, which `tests/validation-fixtures.test.ts`
// enforces over the committed config and environment files.
//
// This module sits outside `application` and `features` so the startup paths that call it do not
// have to depend on the composition root; see `src/README.md`.
//
// A fixture only ever reproduces a failure the app already handles. None of them reads, writes, or
// reveals user content, credentials, or diagnostics.

import { DATABASE_SCHEMA_VERSION, type MigrationDatabase } from '../db/migrations.ts';
import { DATASET_REGISTRY_KEY } from '../datasets/dataset-registry-store.ts';
import { EMBEDDING_MODEL_REGISTRY_KEY } from '../rag/model/model-registry-store.ts';
import type { RegistryStore } from '../storage/installed-source-registry.ts';

export const VALIDATION_FIXTURES_ENV_VAR = 'EXPO_PUBLIC_VALIDATION_FIXTURES';

export type ValidationFixture = 'failDatabaseUpgrade' | 'corruptDatasetRegistry' | 'corruptModelRegistry';

const KNOWN_FIXTURES = new Set<string>([
  'failDatabaseUpgrade',
  'corruptDatasetRegistry',
  'corruptModelRegistry',
] satisfies ValidationFixture[]);

/** Truncated envelope: unparseable JSON, so a read reports REGISTRY_CORRUPT_JSON. */
export const CORRUPT_REGISTRY_FIXTURE_VALUE = '{"version":2,"records":[';

/**
 * While the database fixture holds the database, `user_version` is this base plus the real schema
 * version. Encoding the real version rather than remembering it in memory means a run that is killed
 * before its retry can still restore the version the database actually has, instead of assuming the
 * newest one and claiming a migration that never ran.
 */
export const FIXTURE_SCHEMA_BASE = DATABASE_SCHEMA_VERSION + 97;

export interface ValidationFixtureState {
  readonly fixtures: ReadonlySet<ValidationFixture>;
  /** The version to put back on the retry, captured when the fixture first fired. */
  restoreSchemaVersion: number | null;
}

export function parseValidationFixtures(raw: string | undefined): ReadonlySet<ValidationFixture> {
  const selected = (raw ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name): name is ValidationFixture => KNOWN_FIXTURES.has(name));

  return new Set(selected);
}

export function createValidationFixtureState(
  fixtures: ReadonlySet<ValidationFixture>,
): ValidationFixtureState {
  return { fixtures, restoreSchemaVersion: null };
}

// Direct dot notation is required: Metro only inlines `process.env.NAME`.
const buildFixtureState = createValidationFixtureState(
  parseValidationFixtures(process.env.EXPO_PUBLIC_VALIDATION_FIXTURES),
);

/**
 * Refuses the first database upgrade of the app process by marking the schema newer than this build
 * supports, then puts the real version back so the user's Retry succeeds. The rows are never
 * touched, so the tester can confirm that prior data survived the failure.
 *
 * The refusal happens before any migration runs, so this exercises the recovery screen and the
 * "your local data was not deleted" guarantee, not mid-migration rollback —
 * `tests/database-migrations.test.ts` covers that.
 */
export async function applyDatabaseUpgradeFixture(
  database: MigrationDatabase,
  state: ValidationFixtureState = buildFixtureState,
): Promise<void> {
  if (!state.fixtures.has('failDatabaseUpgrade')) {
    return;
  }

  if (state.restoreSchemaVersion === null) {
    const row = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    const realVersion = decodeRealSchemaVersion(Number(row?.user_version ?? 0));
    state.restoreSchemaVersion = realVersion;
    await database.execAsync(`PRAGMA user_version = ${FIXTURE_SCHEMA_BASE + realVersion};`);
    return;
  }

  await database.execAsync(`PRAGMA user_version = ${state.restoreSchemaVersion};`);
}

/** Reads the real schema version back out, whether or not the fixture is currently holding it. */
function decodeRealSchemaVersion(storedVersion: number): number {
  const stored = Number.isSafeInteger(storedVersion) && storedVersion >= 0 ? storedVersion : 0;
  const real = stored >= FIXTURE_SCHEMA_BASE ? stored - FIXTURE_SCHEMA_BASE : stored;

  return Math.min(real, DATABASE_SCHEMA_VERSION);
}

/**
 * Seeds a corrupt installed-source registry once. The corruption is stored, so it persists across
 * relaunches exactly as real corruption would and Retry keeps reporting it; clear the app's data to
 * leave the state.
 */
export async function applyInstalledSourceRegistryFixture(
  store: RegistryStore,
  state: ValidationFixtureState = buildFixtureState,
): Promise<void> {
  const targets = [
    ['corruptDatasetRegistry', DATASET_REGISTRY_KEY],
    ['corruptModelRegistry', EMBEDDING_MODEL_REGISTRY_KEY],
  ] as const;

  for (const [fixture, key] of targets) {
    if (!state.fixtures.has(fixture)) {
      continue;
    }
    if ((await store.getItem(key)) === CORRUPT_REGISTRY_FIXTURE_VALUE) {
      continue;
    }
    await store.setItem(key, CORRUPT_REGISTRY_FIXTURE_VALUE);
  }
}
