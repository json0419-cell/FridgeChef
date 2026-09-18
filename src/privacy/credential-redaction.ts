/**
 * Keeps the Gemini API key out of everything except platform secure storage and the outgoing
 * request header (ADR 0007). Provider and network failures routinely echo the credential that
 * was rejected, so every string that leaves the Gemini boundary passes through here before it
 * reaches a user-facing message, a thrown error, or a log.
 */

/**
 * Locale-neutral, so a redacted value reads the same in a Chinese and an English message. It is
 * also drawn from the character class the field pattern below consumes, which keeps redaction
 * idempotent when a message crosses the boundary more than once.
 */
export const REDACTED_CREDENTIAL = '••••••';

/** Below this length a "secret" is a placeholder, and blanking it would only garble the message. */
const MIN_SECRET_LENGTH = 8;

/** Key-shaped values and credential-carrying syntax, redacted even when the saved key is unknown. */
const CREDENTIAL_PATTERNS: Array<[RegExp, string]> = [
  // Google API key shape.
  [/\bAIza[0-9A-Za-z_-]{10,}/g, REDACTED_CREDENTIAL],
  // Credential query parameters, for example ...generateContent?key=<secret>.
  [/([?&](?:key|api[-_]?key|access[-_]?token)=)[^&\s"'<>]+/gi, `$1${REDACTED_CREDENTIAL}`],
  // Bearer tokens in an Authorization header echo.
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED_CREDENTIAL}`],
  // Credential header or JSON/object fields, quoted or bare.
  [
    /(["']?(?:x-goog-api-key|api[-_]?key|apikey|geminiApiKey|authorization)["']?\s*[:=]\s*["']?)(?!["',\s}\]])[^\s"',;}\]&]+/gi,
    `$1${REDACTED_CREDENTIAL}`,
  ],
];

export function redactCredentials(value: string, secret?: string | null): string {
  const normalized = typeof secret === 'string' ? secret.trim() : '';
  let redacted =
    normalized.length >= MIN_SECRET_LENGTH ? value.replaceAll(normalized, REDACTED_CREDENTIAL) : value;

  for (const [pattern, replacement] of CREDENTIAL_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }

  return redacted;
}

/**
 * Rebuilds a thrown value as an error with a redacted message, a fresh stack, and no cause. The
 * cause is dropped rather than cleaned: it is the original object, and anything that later
 * stringifies it would reintroduce the raw key.
 */
export function redactCredentialsFromError(error: unknown, secret?: string | null): Error {
  const message = error instanceof Error ? error.message : String(error);
  const redacted = new Error(redactCredentials(message, secret));

  if (error instanceof Error) {
    redacted.name = error.name;
  }

  return redacted;
}
