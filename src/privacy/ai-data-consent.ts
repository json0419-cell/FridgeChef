import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserFacingError } from '../errors/user-facing-error';

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
    throw new UserFacingError('AI_DATA_CONSENT_REQUIRED', 'Read and accept the AI data disclosure before using Gemini.');
  }
}
