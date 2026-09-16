import { StyleSheet, View } from 'react-native';
import { Button } from './Foundation';
import { spacing } from '../theme/theme';
import { AppModalFrame } from './AppModalFrame';

interface AppConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  cancelLabel: string;
  confirmLabel: string;
  toneLabel: string;
  tone?: 'danger' | 'info';
  onCancel: () => void;
  onConfirm: () => void;
}

export function AppConfirmModal({
  visible,
  title,
  message,
  cancelLabel,
  confirmLabel,
  toneLabel,
  tone = 'info',
  onCancel,
  onConfirm,
}: AppConfirmModalProps) {
  return (
    <AppModalFrame
      visible={visible}
      tone={tone}
      toneLabel={toneLabel}
      title={title}
      message={message}
      onRequestClose={onCancel}
    >
      <View style={styles.actions}>
        <Button title={cancelLabel} variant="secondary" onPress={onCancel} style={styles.actionButton} />
        <Button
          title={confirmLabel}
          variant={tone === 'danger' ? 'destructive' : 'primary'}
          onPress={onConfirm}
          style={styles.actionButton}
        />
      </View>
    </AppModalFrame>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});
