import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, semanticShadows, spacing, typography, type AppColorTokens, useAppTheme } from '../theme/theme';
import { Button } from './Foundation';

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
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal transparent visible={Boolean(feedback)} animationType="fade" onRequestClose={onClose}>
      <Pressable accessible={false} style={styles.overlay} onPress={onClose}>
        <Pressable
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          accessibilityViewIsModal
          style={styles.card}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.header}>
            <Text style={[styles.badge, feedback?.tone === 'error' ? styles.badgeError : feedback?.tone === 'info' ? styles.badgeInfo : styles.badgeSuccess]}>
              {toneLabel}
            </Text>
          </View>
          <Text style={styles.title}>{feedback?.title}</Text>
          {feedback?.message ? <Text style={styles.message}>{feedback.message}</Text> : null}
          <Button fullWidth title={closeLabel} onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: AppColorTokens) {
  return StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
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
    ...semanticShadows.card,
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
    color: colors.textPrimary,
    backgroundColor: colors.infoMuted,
  },
  badgeError: {
    color: colors.textInverse,
    backgroundColor: colors.danger,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '900',
    fontFamily: typography.display,
  },
  message: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    fontFamily: typography.body,
  },
  });
}
