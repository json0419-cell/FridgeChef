import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { radii, semanticShadows, spacing, typography, type AppColorTokens, useAppTheme } from '../theme/theme';
import { getActionAccessibilityState } from './control-state';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  style?: StyleProp<ViewStyle>;
  icon?: ReactNode;
  accessibilityLabel?: string;
}

export function PrimaryButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  style,
  icon,
  accessibilityLabel,
}: PrimaryButtonProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [focused, setFocused] = useState(false);
  const inactive = disabled || loading;
  const content = (
    <>
      {loading ? <ActivityIndicator color={variant === 'secondary' ? colors.primary : variant === 'primary' ? colors.onPrimary : colors.textInverse} /> : icon}
      <Text style={[styles.text, variant === 'secondary' && styles.secondaryText]}>{title}</Text>
    </>
  );

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole="button"
      accessibilityState={getActionAccessibilityState({ disabled, loading })}
      disabled={inactive}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.shell,
        styles[variant],
        (pressed || loading) && styles.pressed,
        inactive && styles.disabled,
        focused && !inactive && styles.focused,
        style,
      ]}
    >
      {variant === 'primary' || variant === 'danger' ? (
        <LinearGradient
          colors={variant === 'danger' ? [colors.danger, colors.danger] : [colors.primaryPressed, colors.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.button}
        >
          {content}
        </LinearGradient>
      ) : (
        <View style={styles.button}>{content}</View>
      )}
    </Pressable>
  );
}

function createStyles(colors: AppColorTokens) {
  return StyleSheet.create({
  shell: {
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  primary: {
    backgroundColor: colors.primary,
    ...semanticShadows.card,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  danger: {
    backgroundColor: colors.danger,
    elevation: 2,
  },
  button: {
    minHeight: 52,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.46,
  },
  focused: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  text: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '900',
    fontFamily: typography.strong,
    letterSpacing: 0.1,
  },
  secondaryText: {
    color: colors.primary,
  },
  });
}
