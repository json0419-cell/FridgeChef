import { Button } from './Foundation';
import { AppModalFrame } from './AppModalFrame';

export type FeedbackState = {
  tone: 'success' | 'error' | 'info';
  title: string;
  message?: string;
};

interface AppFeedbackModalProps {
  feedback: FeedbackState | null;
  closeLabel: string;
  toneLabel: string;
  onClose: () => void;
}

export function AppFeedbackModal({ feedback, closeLabel, toneLabel, onClose }: AppFeedbackModalProps) {
  return (
    <AppModalFrame
      announce
      visible={Boolean(feedback)}
      tone={feedback?.tone ?? 'info'}
      toneLabel={toneLabel}
      title={feedback?.title ?? ''}
      message={feedback?.message}
      onRequestClose={onClose}
    >
      <Button fullWidth title={closeLabel} onPress={onClose} />
    </AppModalFrame>
  );
}
