import { StyleSheet, View } from 'react-native';
import { PrimaryButton } from './PrimaryButton';
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
        <PrimaryButton title={cancelLabel} variant="secondary" onPress={onCancel} style={styles.actionButton} />
        <PrimaryButton
          title={confirmLabel}
          variant={tone === 'danger' ? 'danger' : 'primary'}
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
