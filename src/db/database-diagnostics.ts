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
