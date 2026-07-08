import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, shadows, spacing, typography } from '../styles/theme';

export type FeedbackState = {
  tone: 'success' | 'error' | 'info';
  title: string;
  message?: string;
};

interface AppFeedbackModalProps {
  feedback: FeedbackState | null;
  closeLabel: string;
  onClose: () => void;
}

export function AppFeedbackModal({ feedback, closeLabel, onClose }: AppFeedbackModalProps) {
  return (
    <Modal transparent visible={Boolean(feedback)} animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
          <View style={styles.header}>
            <Text style={[styles.badge, feedback?.tone === 'error' ? styles.badgeError : feedback?.tone === 'info' ? styles.badgeInfo : styles.badgeSuccess]}>
              {feedback?.tone === 'error' ? 'ERROR' : feedback?.tone === 'info' ? 'INFO' : 'SUCCESS'}
            </Text>
          </View>
          <Text style={styles.title}>{feedback?.title}</Text>
          {feedback?.message ? <Text style={styles.message}>{feedback.message}</Text> : null}
          <Pressable accessibilityRole="button" style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>{closeLabel}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(18, 13, 9, 0.48)',
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radii.xl,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadows.lift,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    overflow: 'hidden',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
    fontFamily: typography.strong,
  },
  badgeSuccess: {
    color: colors.textInverse,
    backgroundColor: colors.primary,
  },
  badgeInfo: {
    color: colors.ink,
    backgroundColor: colors.gold,
  },
  badgeError: {
    color: colors.textInverse,
    backgroundColor: colors.danger,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '900',
    fontFamily: typography.display,
  },
  message: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    fontFamily: typography.body,
  },
  button: {
    minHeight: 50,
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  buttonText: {
    color: colors.textInverse,
    fontSize: 15,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
});
