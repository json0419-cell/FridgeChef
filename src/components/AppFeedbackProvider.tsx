import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import { useI18n } from '../i18n/i18n';
import { AppFeedbackModal, type FeedbackState } from './AppFeedbackModal';

interface FeedbackContextValue {
  showFeedback: (feedback: FeedbackState) => void;
  clearFeedback: () => void;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function AppFeedbackProvider({ children }: PropsWithChildren) {
  const { t } = useI18n();
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const value = useMemo<FeedbackContextValue>(
    () => ({
      showFeedback: setFeedback,
      clearFeedback: () => setFeedback(null),
    }),
    [],
  );

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <AppFeedbackModal feedback={feedback} closeLabel={t('common.ok')} onClose={() => setFeedback(null)} />
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const value = useContext(FeedbackContext);
  if (!value) {
    throw new Error('useFeedback must be used inside AppFeedbackProvider.');
  }
  return value;
}
