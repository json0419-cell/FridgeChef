import AsyncStorage from '@react-native-async-storage/async-storage';

const AI_DATA_CONSENT_KEY = 'privacy.aiDataConsent.v1';

export async function hasAiDataConsent() {
  return (await AsyncStorage.getItem(AI_DATA_CONSENT_KEY)) === 'granted';
}

export async function grantAiDataConsent() {
  await AsyncStorage.setItem(AI_DATA_CONSENT_KEY, 'granted');
}

export async function revokeAiDataConsent() {
  await AsyncStorage.removeItem(AI_DATA_CONSENT_KEY);
}

export async function assertAiDataConsent() {
  if (!(await hasAiDataConsent())) {
    throw new Error('使用 Gemini 前需要先阅读并同意 AI 数据披露。');
  }
}
