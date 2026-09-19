/**
 * Values the app picks for the user — the name of the Personal Recipe Library created on
 * first run, the title standing in for a recipe saved without one, the unit standing in for
 * a Custom Ingredient saved without one — are frozen the moment the row is written, but the
 * language the user reads is not. Storing the localized wording would leave a library created
 * in Chinese reading "我的菜谱库" forever, including inside the Recommendations source line,
 * after the user switches to English.
 *
 * So a row that carries an app-chosen default stores this marker instead of any wording, and
 * every read path substitutes the wording of the language being read right now. Text the user
 * typed is stored verbatim and is therefore never re-localized: a renamed library keeps its
 * name in both languages. The marker is the empty string, which is also what the write paths
 * already produce for blank input, so no column can hold a value that is neither the marker
 * nor the user's own text.
 */
export const SEEDED_DEFAULT_MARKER = '';

/** Wording earlier versions wrote into rows before the marker existed; the v3 migration replaces it. */
export const LEGACY_SEEDED_DEFAULT_TEXT = {
  userRecipeLibraryName: '我的菜谱库',
  recipeTitle: '未命名菜谱',
} as const;

export function holdsSeededDefault(stored: string | null | undefined): boolean {
  return typeof stored !== 'string' || stored.trim().length === 0;
}

/** Returns the user's own text, or `localizedDefault` when the row carries the marker. */
export function resolveSeededDefault(stored: string | null | undefined, localizedDefault: string): string {
  return holdsSeededDefault(stored) ? localizedDefault : (stored as string);
}
