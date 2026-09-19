import { grantAiDataConsent, hasAiDataConsent } from './ai-data-consent';
import { showAiDataConsentPrompt } from './AiDataConsentPrompt';

let pendingConsent: Promise<boolean> | null = null;

export async function requestAiDataConsent(_language: string): Promise<boolean> {
  if (await hasAiDataConsent()) {
    return true;
  }
  if (pendingConsent) {
    return pendingConsent;
  }

  pendingConsent = (async () => {
    if (!(await showAiDataConsentPrompt())) {
      return false;
    }

    try {
      await grantAiDataConsent();
      return true;
    } catch {
      return false;
    }
  })();

  try {
    return await pendingConsent;
  } finally {
    pendingConsent = null;
  }
}
