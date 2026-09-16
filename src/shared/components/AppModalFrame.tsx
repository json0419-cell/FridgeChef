import { useMemo, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  radii,
  semanticShadows,
  spacing,
  typography,
  type AppColorTokens,
  useAppTheme,
} from '../theme/theme';

export type AppModalTone = 'success' | 'error' | 'info' | 'danger';

interface AppModalFrameProps {
  visible: boolean;
  tone: AppModalTone;
  toneLabel: string;
  title: string;
  message?: string;
  announce?: boolean;
  children: ReactNode;
  onRequestClose: () => void;
}

export function AppModalFrame({
  visible,
  tone,
  toneLabel,
  title,
  message,
  announce = false,
  children,
  onRequestClose,
}: AppModalFrameProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onRequestClose}>
      <Pressable accessible={false} style={styles.overlay} onPress={onRequestClose}>
        <Pressable
          accessible={false}
          accessibilityViewIsModal
          style={styles.card}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.header}>
            <Text style={[styles.badge, styles[`${tone}Badge`]]}>{toneLabel}</Text>
          </View>
          <Text
            accessibilityLiveRegion={announce ? 'polite' : 'none'}
            accessibilityRole={announce ? 'alert' : 'header'}
            style={styles.title}
          >
            {title}
          </Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {children}
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
    successBadge: {
      color: colors.textInverse,
      backgroundColor: colors.success,
    },
    errorBadge: {
      color: colors.textInverse,
      backgroundColor: colors.danger,
    },
    dangerBadge: {
      color: colors.textInverse,
      backgroundColor: colors.danger,
    },
    infoBadge: {
      color: colors.textPrimary,
      backgroundColor: colors.infoMuted,
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
