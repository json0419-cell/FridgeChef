/**
 * A key-shaped sentinel used by leak-containment tests. It is assembled at runtime so the
 * literal never appears in source control and the credential hygiene scan stays honest.
 */
export const SENTINEL_API_KEY = ['AIza', 'Sy', 'FridgeChefSentinel', '0123456789abcdefghij'].join('');
