import { recognizeWithGemini, testGeminiConnection } from './geminiAdapter';
import type { AiProvider, RecognitionResult } from '../types';

export interface VisionRecognitionInput {
  provider: AiProvider;
  apiKey: string;
  imageBase64: string;
  mimeType: string;
  outputLanguage?: 'zh' | 'en';
}

export async function recognizeFoodWithProvider(input: VisionRecognitionInput): Promise<RecognitionResult> {
  assertConfiguredGemini(input.apiKey);
  return recognizeWithGemini(input);
}

export async function testProviderConnection(provider: AiProvider, apiKey: string): Promise<void> {
  assertConfiguredGemini(apiKey);
  await testGeminiConnection(apiKey);
}

function assertConfiguredGemini(apiKey: string) {
  if (!apiKey.trim()) {
    throw new Error('请先在设置中保存 Gemini API Key。');
  }
}
