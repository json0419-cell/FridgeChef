import {
  DATABASE_SCHEMA_VERSION,
  DatabaseMigrationError,
  type DatabaseMigrationErrorCode,
} from './migrations.ts';

export type DatabaseDiagnosticCode = DatabaseMigrationErrorCode | 'DATABASE_INITIALIZATION_FAILED';

export type DatabaseStartupDiagnostic = {
  code: DatabaseDiagnosticCode;
  occurredAt: string;
  fromVersion: number | null;
  targetVersion: number;
};

export function createDatabaseStartupDiagnostic(
  error: unknown,
  occurredAt: Date = new Date(),
): DatabaseStartupDiagnostic {
  if (error instanceof DatabaseMigrationError) {
    return {
      code: error.code,
      occurredAt: occurredAt.toISOString(),
      fromVersion: error.fromVersion,
      targetVersion: DATABASE_SCHEMA_VERSION,
    };
  }

  return {
    code: 'DATABASE_INITIALIZATION_FAILED',
    occurredAt: occurredAt.toISOString(),
    fromVersion: null,
    targetVersion: DATABASE_SCHEMA_VERSION,
  };
}

type DatabaseDiagnosticTranslationKey =
  | 'app.databaseDiagnosticCode'
  | 'app.databaseDiagnosticTime'
  | 'app.databaseDiagnosticFromVersion'
  | 'app.databaseDiagnosticTargetVersion'
  | 'app.databaseDiagnosticUnknownVersion';

type DatabaseDiagnosticTranslate = (
  key: DatabaseDiagnosticTranslationKey,
  values?: Record<string, string | number>,
) => string;

/** Builds the Diagnostic Information text the user copies: only code, timestamp, and schema versions. */
export function formatDatabaseStartupDiagnostic(
  diagnostic: DatabaseStartupDiagnostic,
  t: DatabaseDiagnosticTranslate,
): string {
  return [
    t('app.databaseDiagnosticCode', { code: diagnostic.code }),
    t('app.databaseDiagnosticTime', { time: diagnostic.occurredAt }),
    t('app.databaseDiagnosticFromVersion', {
      version: diagnostic.fromVersion ?? t('app.databaseDiagnosticUnknownVersion'),
    }),
    t('app.databaseDiagnosticTargetVersion', { version: diagnostic.targetVersion }),
  ].join('\n');
}
