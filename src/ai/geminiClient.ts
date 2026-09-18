import { assertAiDataConsent } from '../privacy/ai-data-consent';
import { redactCredentials, redactCredentialsFromError } from '../privacy/credential-redaction';
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

  // A network-layer failure can echo the request URL or headers, so it never leaves this
  // boundary in its original form.
  if (lastError !== null && lastError !== undefined) {
    throw redactCredentialsFromError(lastError, normalizedKey);
  }
  throw new Error('Gemini 网络请求失败。');
}

/**
 * Reads a Gemini response body through the one place that redacts it, so nothing parsed out of it
 * — and no message derived from it — can carry the credential a rejecting provider echoed back.
 * Callers raise their own error type from `providerErrorMessage`.
 */
export async function readGeminiJsonResponse(
  response: Response,
  apiKey: string,
): Promise<{ data: unknown; providerErrorMessage: string | null }> {
  const text = redactCredentials(await response.text(), apiKey);
  let data: unknown = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return { data, providerErrorMessage: response.ok ? null : readProviderErrorMessage(data) };
}

function readProviderErrorMessage(data: unknown) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const error = (data as Record<string, unknown>).error;
  if (!error || typeof error !== 'object') {
    return null;
  }

  const message = (error as Record<string, unknown>).message;
  return typeof message === 'string' ? message : null;
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
