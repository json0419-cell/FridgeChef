import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { AiProvider, AppSettings } from '../types';

const SETTINGS_KEY = 'chi_shen_me.settings';
const API_KEY_PREFIX = 'chi_shen_me.api_key';

export const DEFAULT_SETTINGS: AppSettings = {
  provider: 'gemini',
  servings: 2,
  dietaryPreferences: '',
  maxTimeMinutes: null,
  preferredDifficulty: 'any',
  recentHistoryDays: 7,
};

export async function getSettings(): Promise<AppSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);

  if (!raw) {
    return DEFAULT_SETTINGS;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      provider: 'gemini',
      servings: normalizeServings(parsed.servings),
      dietaryPreferences: normalizePreferenceText(parsed.dietaryPreferences),
      maxTimeMinutes: normalizeMaxTimeMinutes(parsed.maxTimeMinutes),
      preferredDifficulty: normalizeDifficultyPreference(parsed.preferredDifficulty),
      recentHistoryDays: normalizeRecentHistoryDays(parsed.recentHistoryDays),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      provider: settings.provider,
      servings: normalizeServings(settings.servings),
      dietaryPreferences: normalizePreferenceText(settings.dietaryPreferences),
      maxTimeMinutes: normalizeMaxTimeMinutes(settings.maxTimeMinutes),
      preferredDifficulty: normalizeDifficultyPreference(settings.preferredDifficulty),
      recentHistoryDays: normalizeRecentHistoryDays(settings.recentHistoryDays),
    }),
  );
}

export async function getApiKey(provider: AiProvider): Promise<string | null> {
  return SecureStore.getItemAsync(apiKeyStorageKey(provider));
}

export async function saveApiKey(provider: AiProvider, apiKey: string): Promise<void> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new Error('API Key 不能为空。');
  }

  await SecureStore.setItemAsync(apiKeyStorageKey(provider), trimmed);
}

export async function clearApiKey(provider: AiProvider): Promise<void> {
  await SecureStore.deleteItemAsync(apiKeyStorageKey(provider));
}

export async function hasApiKey(provider: AiProvider): Promise<boolean> {
  const key = await getApiKey(provider);
  return Boolean(key);
}

function apiKeyStorageKey(provider: AiProvider) {
  return `${API_KEY_PREFIX}.${provider}`;
}

function normalizeServings(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.min(Math.round(numeric), 20) : 2;
}

function normalizePreferenceText(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 300) : '';
}

function normalizeMaxTimeMinutes(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.min(Math.round(numeric), 240) : null;
}

function normalizeDifficultyPreference(value: unknown): AppSettings['preferredDifficulty'] {
  return value === '简单' || value === '中等' || value === '偏难' || value === '未知' ? value : 'any';
}

function normalizeRecentHistoryDays(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.min(Math.round(numeric), 60) : 7;
}
