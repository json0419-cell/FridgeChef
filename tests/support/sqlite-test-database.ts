import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { StartupDatabase } from '../../src/db/database-startup.ts';

export type FailureInjector = (source: string, params: readonly SQLInputValue[]) => boolean;

const DATA_TABLES = [
  'cooked_history',
  'ingredients',
  'personal_recipe_embeddings',
  'recipes',
  'user_recipe_libraries',
  'user_recipes',
] as const;

export type DataTable = (typeof DATA_TABLES)[number];
export type TableRows = Record<string, unknown>[];
export type DatabaseSnapshot = Record<DataTable, TableRows>;

/** A node:sqlite database exposing the expo-sqlite surface used during startup. */
export class SqliteTestDatabase implements StartupDatabase {
  readonly database: DatabaseSync;
  failWhen: FailureInjector | undefined;

  constructor(path = ':memory:', failWhen?: FailureInjector) {
    this.database = new DatabaseSync(path);
    this.failWhen = failWhen;
  }

  exec(source: string) {
    this.database.exec(source);
  }

  async execAsync(source: string) {
    this.throwIfInjected(source, []);
    this.database.exec(source);
  }

  async runAsync(source: string, ...params: SQLInputValue[]) {
    this.throwIfInjected(source, params);
    this.database.prepare(source).run(...params);
  }

  async getAllAsync<T>(source: string) {
    return this.database.prepare(source).all() as T[];
  }

  async getFirstAsync<T>(source: string) {
    return (this.database.prepare(source).get() as T | undefined) ?? null;
  }

  async withTransactionAsync(task: () => Promise<void>) {
    this.database.exec('BEGIN IMMEDIATE;');
    try {
      await task();
      this.database.exec('COMMIT;');
    } catch (error) {
      this.database.exec('ROLLBACK;');
      throw error;
    }
  }

  version() {
    return Number((this.database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
  }

  tableNames() {
    return this.database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((row) => String((row as { name: string }).name));
  }

  columnNames(table: DataTable) {
    return this.database
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((row) => String((row as { name: string }).name));
  }

  rows(table: DataTable, columns: readonly string[] = this.columnNames(table)): TableRows {
    return this.database
      .prepare(`SELECT ${columns.join(', ')} FROM ${table} ORDER BY ${table === 'personal_recipe_embeddings' ? 'recipeId, modelId' : 'id'}`)
      .all()
      .map((row) => ({ ...row }));
  }

  snapshot(): DatabaseSnapshot {
    return Object.fromEntries(DATA_TABLES.map((table) => [table, this.rows(table)])) as DatabaseSnapshot;
  }

  /** Reads the rows of `previous` again, limited to the columns that existed in it. */
  snapshotLike(previous: DatabaseSnapshot, tables: readonly DataTable[] = DATA_TABLES): Partial<DatabaseSnapshot> {
    return Object.fromEntries(
      tables.map((table) => {
        const columns = previous[table][0] ? Object.keys(previous[table][0]) : this.columnNames(table);
        return [table, this.rows(table, columns)];
      }),
    );
  }

  close() {
    this.database.close();
  }

  private throwIfInjected(source: string, params: readonly SQLInputValue[]) {
    if (this.failWhen?.(source, params)) {
      throw new Error('Injected database failure');
    }
  }
}

export const USER_DATA_TABLES = DATA_TABLES.filter((table) => table !== 'recipes');
