import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from './PrimaryButton';
import { radii, semanticShadows, spacing, typography, type AppColorTokens, useAppTheme } from '../theme/theme';

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
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <Pressable accessible={false} style={styles.overlay} onPress={onCancel}>
        <Pressable accessibilityViewIsModal style={styles.card} onPress={(event) => event.stopPropagation()}>
          <View style={styles.header}>
            <Text style={[styles.badge, tone === 'danger' ? styles.badgeDanger : styles.badgeInfo]}>
              {toneLabel}
            </Text>
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <PrimaryButton title={cancelLabel} variant="secondary" onPress={onCancel} style={styles.actionButton} />
            <PrimaryButton
              title={confirmLabel}
              variant={tone === 'danger' ? 'danger' : 'primary'}
              onPress={onConfirm}
              style={styles.actionButton}
            />
          </View>
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
  badgeInfo: {
    color: colors.textPrimary,
    backgroundColor: colors.infoMuted,
  },
  badgeDanger: {
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
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  });
}
