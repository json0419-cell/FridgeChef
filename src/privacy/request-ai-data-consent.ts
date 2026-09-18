import { Alert } from 'react-native';
import { grantAiDataConsent, hasAiDataConsent } from './ai-data-consent';

let pendingConsent: Promise<boolean> | null = null;

export async function requestAiDataConsent(language: string): Promise<boolean> {
  if (await hasAiDataConsent()) {
    return true;
  }
  if (pendingConsent) {
    return pendingConsent;
  }

  const english = language === 'en';
  pendingConsent = new Promise<boolean>((resolve) => {
    Alert.alert(
      english ? 'Send data to Google Gemini?' : '是否向 Google Gemini 发送数据？',
      english
        ? 'When you use an AI feature, this app sends only the content needed for that request (such as the selected photo, ingredients, recipe text, preferences, or a YouTube URL) and your Gemini API key directly to Google. Your full local libraries are not uploaded. See Privacy Policy in Settings for details.'
        : '当你使用 AI 功能时，本应用只会把完成该次请求所需的内容（例如所选照片、食材、菜谱文本、偏好或 YouTube 链接）以及你的 Gemini API Key 直接发送给 Google。完整的本地菜谱库不会被上传。详情可在“设置 → 隐私政策与数据披露”查看。',
      [
        { text: english ? 'Cancel' : '取消', style: 'cancel', onPress: () => resolve(false) },
        {
          text: english ? 'Agree and Continue' : '同意并继续',
          onPress: () => {
            void grantAiDataConsent().then(() => resolve(true)).catch(() => resolve(false));
          },
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });

  try {
    return await pendingConsent;
  } finally {
    pendingConsent = null;
  }
}
