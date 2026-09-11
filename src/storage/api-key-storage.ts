import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import type { AiProvider } from '../types';

export interface CredentialStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface OrdinaryStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type ApiKeyMigrationErrorCode =
  | 'API_KEY_SECURE_WRITE_FAILED'
  | 'API_KEY_SECURE_VERIFY_FAILED'
  | 'API_KEY_LEGACY_READ_FAILED'
  | 'API_KEY_LEGACY_CLEANUP_FAILED';

export class ApiKeyMigrationError extends Error {
  readonly code: ApiKeyMigrationErrorCode;

  constructor(code: ApiKeyMigrationErrorCode, options?: ErrorOptions) {
    super('API key secure-storage migration failed.', options);
    this.name = 'ApiKeyMigrationError';
    this.code = code;
  }
}

const SETTINGS_KEY = 'chi_shen_me.settings';

export async function getOrMigrateApiKey(
  provider: AiProvider,
  secureStore: CredentialStore,
  ordinaryStore: OrdinaryStore,
): Promise<string | null> {
  const secureKey = credentialStorageKey(provider);
  const existingSecureValue = normalizeApiKey(await secureStore.getItem(secureKey));
  const legacySnapshot = await readLegacySnapshot(provider, ordinaryStore);

  if (existingSecureValue) {
    await removeLegacySnapshot(legacySnapshot, ordinaryStore);
    return existingSecureValue;
  }

  if (!legacySnapshot.candidate) {
    await removeLegacySnapshot(legacySnapshot, ordinaryStore);
    return null;
  }

  await writeAndVerifySecureValue(secureKey, legacySnapshot.candidate, secureStore);
  await removeLegacySnapshot(legacySnapshot, ordinaryStore);
  return legacySnapshot.candidate;
}

export async function saveSecureApiKey(
  provider: AiProvider,
  apiKey: string,
  secureStore: CredentialStore,
  ordinaryStore: OrdinaryStore,
): Promise<void> {
  const normalized = normalizeApiKey(apiKey);
  if (!normalized) {
    throw new Error('API key cannot be empty.');
  }

  await writeAndVerifySecureValue(credentialStorageKey(provider), normalized, secureStore);
  const legacySnapshot = await readLegacySnapshot(provider, ordinaryStore);
  await removeLegacySnapshot(legacySnapshot, ordinaryStore);
}

export async function clearStoredApiKey(
  provider: AiProvider,
  secureStore: CredentialStore,
  ordinaryStore: OrdinaryStore,
): Promise<void> {
  const legacySnapshot = await readLegacySnapshot(provider, ordinaryStore);
  await removeLegacySnapshot(legacySnapshot, ordinaryStore);
  await secureStore.removeItem(credentialVerificationStorageKey(provider));
  await secureStore.removeItem(credentialStorageKey(provider));
}

export async function markStoredApiKeyVerified(
  provider: AiProvider,
  secureStore: CredentialStore,
): Promise<void> {
  const apiKey = normalizeApiKey(await secureStore.getItem(credentialStorageKey(provider)));
  if (!apiKey) {
    throw new Error('A saved API key is required before verification.');
  }

  await writeAndVerifySecureValue(
    credentialVerificationStorageKey(provider),
    verificationFingerprint(apiKey),
    secureStore,
  );
}

export async function isStoredApiKeyVerified(
  provider: AiProvider,
  secureStore: CredentialStore,
): Promise<boolean> {
  const apiKey = normalizeApiKey(await secureStore.getItem(credentialStorageKey(provider)));
  const storedFingerprint = await secureStore.getItem(credentialVerificationStorageKey(provider));
  return Boolean(apiKey && storedFingerprint === verificationFingerprint(apiKey));
}

export function credentialStorageKey(provider: AiProvider) {
  return `chi_shen_me.api_key.${provider}`;
}

export function credentialVerificationStorageKey(provider: AiProvider) {
  return `chi_shen_me.api_key_verification.${provider}.v1`;
}

async function writeAndVerifySecureValue(
  key: string,
  value: string,
  secureStore: CredentialStore,
): Promise<void> {
  try {
    await secureStore.setItem(key, value);
  } catch (error) {
    throw new ApiKeyMigrationError('API_KEY_SECURE_WRITE_FAILED', { cause: error });
  }

  let verifiedValue: string | null;
  try {
    verifiedValue = normalizeApiKey(await secureStore.getItem(key));
  } catch (error) {
    throw new ApiKeyMigrationError('API_KEY_SECURE_VERIFY_FAILED', { cause: error });
  }

  if (verifiedValue !== value) {
    throw new ApiKeyMigrationError('API_KEY_SECURE_VERIFY_FAILED');
  }
}

type LegacySnapshot = {
  candidate: string | null;
  standaloneKeys: string[];
  settingsRaw: string | null;
  settings: Record<string, unknown> | null;
  settingsContainCredential: boolean;
};

async function readLegacySnapshot(
  provider: AiProvider,
  ordinaryStore: OrdinaryStore,
): Promise<LegacySnapshot> {
  const standaloneKeys = legacyStandaloneKeys(provider);
  const standaloneValues = await Promise.all(standaloneKeys.map((key) => ordinaryStore.getItem(key)));
  const settingsRaw = await ordinaryStore.getItem(SETTINGS_KEY);
  const settings = parseSettings(settingsRaw);
  if (!settings && settingsRawContainsCredentialField(settingsRaw)) {
    throw new ApiKeyMigrationError('API_KEY_LEGACY_READ_FAILED');
  }
  const settingsCandidates = readSettingsCandidates(settings, provider);
  const candidate = [...standaloneValues, ...settingsCandidates]
    .map(normalizeApiKey)
    .find((value): value is string => Boolean(value)) ?? null;

  return {
    candidate,
    standaloneKeys: standaloneKeys.filter((_, index) => standaloneValues[index] !== null),
    settingsRaw,
    settings,
    settingsContainCredential: settingsCandidates.length > 0,
  };
}

async function removeLegacySnapshot(snapshot: LegacySnapshot, ordinaryStore: OrdinaryStore): Promise<void> {
  try {
    for (const key of snapshot.standaloneKeys) {
      await ordinaryStore.removeItem(key);
    }

    if (snapshot.settingsRaw !== null && snapshot.settings && snapshot.settingsContainCredential) {
      const sanitizedSettings = removeSettingsCredentials(snapshot.settings);
      await ordinaryStore.setItem(SETTINGS_KEY, JSON.stringify(sanitizedSettings));
    }
  } catch (error) {
    throw new ApiKeyMigrationError('API_KEY_LEGACY_CLEANUP_FAILED', { cause: error });
  }
}

function legacyStandaloneKeys(provider: AiProvider) {
  return [
    credentialStorageKey(provider),
    `chi_shen_me.${provider}_api_key`,
    `${provider}_api_key`,
  ];
}

function parseSettings(raw: string | null): Record<string, unknown> | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function settingsRawContainsCredentialField(raw: string | null) {
  return Boolean(raw && /"(?:apiKey|geminiApiKey|apiKeys)"\s*:/.test(raw));
}

function readSettingsCandidates(settings: Record<string, unknown> | null, provider: AiProvider) {
  if (!settings) {
    return [];
  }

  const providerKeys = isRecord(settings.apiKeys) ? settings.apiKeys : null;
  return [settings.apiKey, settings.geminiApiKey, providerKeys?.[provider]].filter(
    (value): value is string => typeof value === 'string',
  );
}

function removeSettingsCredentials(settings: Record<string, unknown>) {
  const sanitized = { ...settings };
  delete sanitized.apiKey;
  delete sanitized.geminiApiKey;

  if (isRecord(sanitized.apiKeys)) {
    const sanitizedProviderKeys = { ...sanitized.apiKeys };
    delete sanitizedProviderKeys.gemini;
    if (Object.keys(sanitizedProviderKeys).length === 0) {
      delete sanitized.apiKeys;
    } else {
      sanitized.apiKeys = sanitizedProviderKeys;
    }
  }

  return sanitized;
}

function normalizeApiKey(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function verificationFingerprint(apiKey: string) {
  return bytesToHex(sha256(utf8ToBytes(`chishenme-api-key-verification-v1:${apiKey}`)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
