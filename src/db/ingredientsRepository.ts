import { getDatabase } from './database';
import type { Ingredient, IngredientDraft, IngredientSource, RecognizedFoodItem } from '../types';

interface IngredientRow {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  source: IngredientSource;
  createdAt: string;
}

export function createLocalId(prefix = 'ing') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function listIngredients(): Promise<Ingredient[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<IngredientRow>(
    'SELECT id, name, quantity, unit, source, createdAt FROM ingredients ORDER BY createdAt DESC',
  );

  return rows.map(toIngredient);
}

export async function getIngredientById(id: string): Promise<Ingredient | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<IngredientRow>(
    'SELECT id, name, quantity, unit, source, createdAt FROM ingredients WHERE id = ?',
    id,
  );

  return row ? toIngredient(row) : null;
}

export async function addIngredient(draft: IngredientDraft): Promise<Ingredient> {
  const db = await getDatabase();
  const ingredient: Ingredient = {
    ...draft,
    id: createLocalId(),
    name: draft.name.trim(),
    unit: draft.unit.trim(),
    quantity: normalizeQuantity(draft.quantity),
    createdAt: new Date().toISOString(),
  };

  await db.runAsync(
    `INSERT INTO ingredients (id, name, quantity, unit, source, createdAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ingredient.id,
    ingredient.name,
    ingredient.quantity,
    ingredient.unit,
    ingredient.source,
    ingredient.createdAt,
  );

  return ingredient;
}

export async function addIngredients(drafts: IngredientDraft[]): Promise<Ingredient[]> {
  const added: Ingredient[] = [];

  for (const draft of drafts) {
    if (draft.name.trim()) {
      added.push(await addIngredient(draft));
    }
  }

  return added;
}

export async function updateIngredient(ingredient: Ingredient): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `UPDATE ingredients
     SET name = ?, quantity = ?, unit = ?, source = ?
     WHERE id = ?`,
    ingredient.name.trim(),
    normalizeQuantity(ingredient.quantity),
    ingredient.unit.trim(),
    ingredient.source,
    ingredient.id,
  );
}

export async function deleteIngredient(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM ingredients WHERE id = ?', id);
}

export function recognizedItemToIngredientDraft(item: RecognizedFoodItem): IngredientDraft {
  return {
    name: item.name,
    quantity: normalizeQuantity(item.estimatedQuantity ?? 1),
    unit: item.unit || '份',
    source: 'photo',
  };
}

function normalizeQuantity(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function toIngredient(row: IngredientRow): Ingredient {
  return {
    id: row.id,
    name: row.name,
    quantity: Number(row.quantity),
    unit: row.unit,
    source: row.source,
    createdAt: row.createdAt,
  };
}
