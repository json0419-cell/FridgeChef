import { useEffect, useState } from 'react';
import { AppConfirmModal } from '../shared/components/AppConfirmModal';
import { useI18n } from '../i18n/i18n';

/**
 * Hosts the AI data disclosure in the app's own confirm dialog.
 *
 * `requestAiDataConsent` is called from plain async code, outside any component, so the prompt
 * cannot be rendered by the caller. This component registers an opener while it is mounted and the
 * module-level bridge below hands callers a promise that settles on the user's choice. Mount it
 * once, inside the providers the dialog needs.
 */

type Resolver = (granted: boolean) => void;

let openPrompt: ((resolve: Resolver) => void) | null = null;

/** Resolves false when no prompt is mounted: never granted by accident, and never left hanging. */
export function showAiDataConsentPrompt(): Promise<boolean> {
  const open = openPrompt;
  if (!open) {
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolve) => open(resolve));
}

export function AiDataConsentPrompt() {
  const { language, t } = useI18n();
  const [resolver, setResolver] = useState<{ resolve: Resolver } | null>(null);

  useEffect(() => {
    openPrompt = (resolve) => setResolver({ resolve });
    return () => {
      openPrompt = null;
    };
  }, []);

  const settle = (granted: boolean) => {
    const pending = resolver;
    setResolver(null);
    pending?.resolve(granted);
  };

  const english = language === 'en';

  return (
    <AppConfirmModal
      visible={resolver !== null}
      title={english ? 'Send data to Google Gemini?' : '是否向 Google Gemini 发送数据？'}
      message={
        english
          ? 'When you use an AI feature, this app sends only the content needed for that request (such as the selected photo, ingredients, recipe text, preferences, or a YouTube URL) and your Gemini API key directly to Google. Your full local libraries are not uploaded. See Privacy Policy in Settings for details.'
          : '当你使用 AI 功能时，本应用只会把完成该次请求所需的内容（例如所选照片、食材、菜谱文本、偏好或 YouTube 链接）以及你的 Gemini API Key 直接发送给 Google。完整的本地菜谱库不会被上传。详情可在“设置 → 隐私政策与数据披露”查看。'
      }
      cancelLabel={english ? 'Cancel' : '取消'}
      confirmLabel={english ? 'Agree and Continue' : '同意并继续'}
      toneLabel={t('common.confirmation')}
      onCancel={() => settle(false)}
      onConfirm={() => settle(true)}
    />
  );
}
