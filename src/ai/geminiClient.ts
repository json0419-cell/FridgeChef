import { assertAiDataConsent } from '../privacy/ai-data-consent';
import { buildGeminiGenerateContentEndpoint, buildGeminiRequestHeaders } from './geminiConfig';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

export interface GeminiRequestOptions {
  maxAttempts?: number;
  timeoutMs?: number;
}

export async function fetchGeminiGenerateContent(
  apiKey: string,
  body: unknown,
  options: GeminiRequestOptions = {},
): Promise<Response> {
  const normalizedKey = apiKey.trim();
  if (!normalizedKey) {
    throw new Error('请先在设置中保存 Gemini API Key。');
  }
  await assertAiDataConsent();

  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? MAX_ATTEMPTS, MAX_ATTEMPTS));
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(buildGeminiGenerateContentEndpoint(), {
        method: 'POST',
        headers: buildGeminiRequestHeaders(normalizedKey),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (isRetryableStatus(response.status) && attempt < maxAttempts) {
        await cancelResponse(response);
        await delay(retryDelayMs(response, attempt));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryableNetworkError(error)) {
        break;
      }
      await delay(500 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if (isAbortError(lastError)) {
    throw new Error('Gemini 请求超时，请检查网络后重试。');
  }
  throw lastError instanceof Error ? lastError : new Error('Gemini 网络请求失败。');
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function isRetryableNetworkError(error: unknown) {
  return isAbortError(error) || error instanceof TypeError;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function retryDelayMs(response: Response, attempt: number) {
  const retryAfter = Number(response.headers.get('retry-after'));
  return Number.isFinite(retryAfter) && retryAfter >= 0
    ? Math.min(retryAfter * 1000, 10_000)
    : 500 * 2 ** (attempt - 1);
}

async function cancelResponse(response: Response) {
  try {
    await response.body?.cancel();
  } catch {
    // The retry is still safe when a platform has already closed the response stream.
  }
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
