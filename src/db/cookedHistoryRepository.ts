import { createLocalId } from './ingredientsRepository';
import { getDatabase } from './database';
import type { CookedRecipeHistory, CookedRecipeSource } from '../types';

const DEFAULT_RECENT_DAYS = 7;

interface CookedRecipeHistoryRow {
  id: string;
  recipeId: string;
  title: string;
  source: CookedRecipeSource;
  cookedAt: string;
}

export interface CookedRecipeDraft {
  recipeId: string;
  title: string;
  source: CookedRecipeSource;
}

export async function markRecipeCooked(draft: CookedRecipeDraft): Promise<CookedRecipeHistory> {
  const db = await getDatabase();
  const item: CookedRecipeHistory = {
    id: createLocalId('cook'),
    recipeId: normalizeRecipeId(draft.recipeId),
    title: draft.title.trim() || '未命名菜谱',
    source: draft.source,
    cookedAt: new Date().toISOString(),
  };

  await db.runAsync(
    `INSERT INTO cooked_history (id, recipeId, title, source, cookedAt)
     VALUES (?, ?, ?, ?, ?)`,
    item.id,
    item.recipeId,
    item.title,
    item.source,
    item.cookedAt,
  );

  return item;
}

export async function listRecentCookedHistory(days = DEFAULT_RECENT_DAYS): Promise<CookedRecipeHistory[]> {
  const db = await getDatabase();
  const since = dateDaysAgo(days).toISOString();
  const rows = await db.getAllAsync<CookedRecipeHistoryRow>(
    `SELECT id, recipeId, title, source, cookedAt
     FROM cooked_history
     WHERE cookedAt >= ?
     ORDER BY cookedAt DESC`,
    since,
  );

  return rows.map(toCookedRecipeHistory);
}

export async function listCookedHistory(limit = 100): Promise<CookedRecipeHistory[]> {
  const db = await getDatabase();
  const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.round(limit), 500) : 100;
  const rows = await db.getAllAsync<CookedRecipeHistoryRow>(
    `SELECT id, recipeId, title, source, cookedAt
     FROM cooked_history
     ORDER BY cookedAt DESC
     LIMIT ?`,
    normalizedLimit,
  );

  return rows.map(toCookedRecipeHistory);
}

export async function getRecentCookedRecipeIds(days = DEFAULT_RECENT_DAYS): Promise<Set<string>> {
  const recent = await listRecentCookedHistory(days);
  return new Set(recent.map((item) => item.recipeId).filter(Boolean));
}

export async function deleteCookedHistory(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM cooked_history WHERE id = ?', id);
}

export function normalizeRecipeId(value: string | undefined | null) {
  return (value ?? '').trim();
}

function dateDaysAgo(days: number) {
  const normalizedDays = Number.isFinite(days) && days > 0 ? days : DEFAULT_RECENT_DAYS;
  return new Date(Date.now() - normalizedDays * 24 * 60 * 60 * 1000);
}

function toCookedRecipeHistory(row: CookedRecipeHistoryRow): CookedRecipeHistory {
  return {
    id: row.id,
    recipeId: row.recipeId,
    title: row.title,
    source: row.source,
    cookedAt: row.cookedAt,
  };
}
