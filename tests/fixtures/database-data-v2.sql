-- Representative data a user could have saved while on schema version 2.
INSERT INTO ingredients (id, name, quantity, unit, source, createdAt) VALUES
  ('ingredient-1', 'Fixture egg', 6, 'pcs', 'manual', '2026-09-01T08:00:00.000Z'),
  ('ingredient-2', 'Fixture tomato', 2, 'pcs', 'photo', '2026-09-02T08:00:00.000Z');

INSERT INTO recipes (id, title, mainIngredients, seasonings, steps, tags) VALUES
  ('r001', 'Previously bundled recipe', '["egg"]', '["salt"]', '["Cook it."]', '["old"]');

INSERT INTO user_recipe_libraries (id, name, enabled, createdAt, updatedAt) VALUES
  ('library-1', 'Fixture library', 1, '2026-09-03T08:00:00.000Z', '2026-09-03T08:00:00.000Z'),
  ('library-2', 'Fixture disabled library', 0, '2026-09-03T09:00:00.000Z', '2026-09-03T09:00:00.000Z');

INSERT INTO user_recipes (
  id, libraryId, title, description, mainIngredients, seasonings, steps, tags,
  estimatedTimeMinutes, difficulty, sourceType, sourceUrl, createdAt, updatedAt, enabled
) VALUES
  ('recipe-1', 'library-1', 'Preserved recipe', '', '["egg"]', '[]', '["Cook it."]', '[]',
    15, 'easy', 'manual', '', '2026-09-04T08:00:00.000Z', '2026-09-04T08:00:00.000Z', 1),
  ('recipe-2', 'library-1', 'Disabled recipe', '', '["tomato"]', '[]', '["Cook it."]', '[]',
    NULL, 'unknown', 'text', '', '2026-09-04T10:00:00.000Z', '2026-09-04T10:00:00.000Z', 0);

INSERT INTO personal_recipe_embeddings (recipeId, modelId, libraryId, recipeUpdatedAt, dimension, vectorJson, indexedAt) VALUES
  ('recipe-1', 'bge-m3', 'library-1', '2026-09-04T08:00:00.000Z', 3, '[0.1,0.2,0.3]', '2026-09-04T09:00:00.000Z');

INSERT INTO cooked_history (id, recipeId, title, source, cookedAt) VALUES
  ('history-1', 'recipe-1', 'Preserved recipe', 'personal', '2026-09-05T19:00:00.000Z');
