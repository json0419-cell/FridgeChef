import { getDatabase } from './database';
import {
  clearCachedDatabaseDataFrom,
  clearCookingHistoryDataFrom,
  clearIngredientDataFrom,
  clearPersonalRecipeDataFrom,
} from './data-cleanup-database';

export async function clearCachedDatabaseData(): Promise<void> {
  const database = await getDatabase();
  await clearCachedDatabaseDataFrom(database);
}

export async function clearIngredientData(): Promise<void> {
  const database = await getDatabase();
  await clearIngredientDataFrom(database);
}

export async function clearCookingHistoryData(): Promise<void> {
  const database = await getDatabase();
  await clearCookingHistoryDataFrom(database);
}

export async function clearPersonalRecipeData(): Promise<void> {
  const database = await getDatabase();
  await clearPersonalRecipeDataFrom(database);
}
