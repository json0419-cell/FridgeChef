export const GEMINI_MODEL = 'gemini-3.1-flash-lite';

export function buildGeminiGenerateContentEndpoint() {
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
}

export function buildGeminiRequestHeaders(apiKey: string) {
  return {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey.trim(),
  };
}
