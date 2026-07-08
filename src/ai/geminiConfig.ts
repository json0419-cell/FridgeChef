export const GEMINI_MODEL = 'gemini-3.1-flash-lite';

export function buildGeminiGenerateContentEndpoint(apiKey: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
}
