import { useCallback, useState } from 'react';
import { deleteIngredient, listIngredients } from '../../../db/ingredientsRepository';
import type { Ingredient } from '../../../types';

export function useIngredientInventory() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadIngredients = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setIngredients(await listIngredients());
    } catch (error) {
      setLoadError(formatInventoryError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteInventoryIngredient = useCallback(
    async (ingredientId: string) => {
      setDeleteError(null);
      try {
        await deleteIngredient(ingredientId);
        await loadIngredients();
        return null;
      } catch (error) {
        const message = formatInventoryError(error);
        setDeleteError(message);
        return message;
      }
    },
    [loadIngredients],
  );

  return {
    ingredients,
    loading,
    loadError,
    deleteError,
    loadIngredients,
    deleteInventoryIngredient,
  };
}

function formatInventoryError(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'Unknown error');
}
