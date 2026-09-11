export interface DataCleanupTransaction {
  execAsync(source: string): Promise<void>;
}

export interface DataCleanupDatabase {
  runAsync(source: string): Promise<unknown>;
  withExclusiveTransactionAsync(task: (transaction: DataCleanupTransaction) => Promise<void>): Promise<void>;
}

export async function clearCachedDatabaseDataFrom(database: DataCleanupDatabase): Promise<void> {
  await database.runAsync('DELETE FROM personal_recipe_embeddings');
}

export async function clearIngredientDataFrom(database: DataCleanupDatabase): Promise<void> {
  await database.runAsync('DELETE FROM ingredients');
}

export async function clearCookingHistoryDataFrom(database: DataCleanupDatabase): Promise<void> {
  await database.runAsync('DELETE FROM cooked_history');
}

export async function clearPersonalRecipeDataFrom(database: DataCleanupDatabase): Promise<void> {
  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.execAsync(`
      DELETE FROM personal_recipe_embeddings;
      DELETE FROM user_recipes;
      DELETE FROM user_recipe_libraries;
    `);
  });
}
