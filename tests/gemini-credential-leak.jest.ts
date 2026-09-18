import AsyncStorage from '@react-native-async-storage/async-storage';
import { grantAiDataConsent } from '../src/privacy/ai-data-consent';
import { REDACTED_CREDENTIAL } from '../src/privacy/credential-redaction';
import { testProviderConnection } from '../src/ai/providerAdapter';
import { recognizeWithGemini } from '../src/ai/geminiAdapter';
import { clearApiKey, getApiKey, hasVerifiedApiKey, markApiKeyVerified, saveApiKey } from '../src/storage/settingsStorage';
import { SENTINEL_API_KEY } from './fixtures/sentinel-api-key';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const secureValues: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => (key in secureValues ? secureValues[key] : null)),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    secureValues[key] = value;
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    delete secureValues[key];
  }),
}));

type ConsoleMethod = 'log' | 'info' | 'warn' | 'error' | 'debug';
const consoleMethods: ConsoleMethod[] = ['log', 'info', 'warn', 'error', 'debug'];

describe('the Gemini API key never leaves secure storage or the request header', () => {
  let loggedOutput: string[];
  let consoleSpies: jest.SpyInstance[];
  const originalFetch = global.fetch;

  beforeEach(async () => {
    for (const key of Object.keys(secureValues)) {
      delete secureValues[key];
    }
    await AsyncStorage.clear();
    await grantAiDataConsent();

    loggedOutput = [];
    consoleSpies = consoleMethods.map((method) =>
      jest.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        loggedOutput.push(args.map((arg) => safeStringify(arg)).join(' '));
      }),
    );
  });

  afterEach(() => {
    for (const spy of consoleSpies) {
      spy.mockRestore();
    }
    global.fetch = originalFetch;
  });

  it('sends the saved key only in the Gemini request header, and never in the URL or body', async () => {
    const calls: Array<[string, RequestInit]> = [];
    global.fetch = jest.fn(async (url: string, init: RequestInit) => {
      calls.push([String(url), init]);
      return jsonResponse(200, { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] });
    }) as unknown as typeof fetch;

    await saveApiKey('gemini', SENTINEL_API_KEY);
    await testProviderConnection('gemini', (await getApiKey('gemini')) ?? '');
    await markApiKeyVerified('gemini');

    expect(await hasVerifiedApiKey('gemini')).toBe(true);
    const [url, init] = calls[0];
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(SENTINEL_API_KEY);
    expect(url).not.toContain(SENTINEL_API_KEY);
    expect(String(init.body)).not.toContain(SENTINEL_API_KEY);

    await expectContainment();
  });

  it('redacts a provider rejection that echoes the key back', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(400, {
        error: { code: 400, message: `API key not valid: ${SENTINEL_API_KEY}`, status: 'INVALID_ARGUMENT' },
      }),
    ) as unknown as typeof fetch;

    await saveApiKey('gemini', SENTINEL_API_KEY);
    const error = await testProviderConnection('gemini', SENTINEL_API_KEY).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(SENTINEL_API_KEY);
    expect((error as Error).message).toContain(REDACTED_CREDENTIAL);
    expect((error as Error).message).toContain('API key not valid');
    await expectContainment();
  });

  it('redacts a network failure that quotes the request URL and key', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error(`request to https://generativelanguage.googleapis.com/?key=${SENTINEL_API_KEY} failed`);
    }) as unknown as typeof fetch;

    await saveApiKey('gemini', SENTINEL_API_KEY);
    const error = await recognizeWithGemini({
      apiKey: SENTINEL_API_KEY,
      imageBase64: 'Zm9v',
      mimeType: 'image/jpeg',
    }).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(SENTINEL_API_KEY);
    expect((error as Error).stack).not.toContain(SENTINEL_API_KEY);
    expect((error as Error).cause).toBeUndefined();
    await expectContainment();
  });

  it('leaves nothing behind after the key is cleared', async () => {
    await saveApiKey('gemini', SENTINEL_API_KEY);
    await markApiKeyVerified('gemini');
    await clearApiKey('gemini');

    expect(await getApiKey('gemini')).toBeNull();
    expect(await hasVerifiedApiKey('gemini')).toBe(false);
    expect(JSON.stringify(secureValues)).not.toContain(SENTINEL_API_KEY);
    await expectContainment();
  });

  async function expectContainment() {
    // Ordinary storage and every log line written during the flow stay free of the key; secure
    // storage is the only place it may rest.
    const ordinary = await AsyncStorage.getAllKeys();
    const ordinaryDump = JSON.stringify(await AsyncStorage.multiGet([...ordinary]));
    expect(ordinaryDump).not.toContain(SENTINEL_API_KEY);
    expect(loggedOutput.join('\n')).not.toContain(SENTINEL_API_KEY);
  }
});

function jsonResponse(status: number, body: unknown) {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    body: null,
    text: async () => text,
  } as unknown as Response;
}

function safeStringify(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Error) {
    return `${value.message} ${value.stack ?? ''}`;
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
