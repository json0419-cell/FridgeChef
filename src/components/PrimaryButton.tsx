import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radii, spacing, typography } from '../styles/theme';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  style?: StyleProp<ViewStyle>;
  icon?: ReactNode;
}

export function PrimaryButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  style,
  icon,
}: PrimaryButtonProps) {
  const content = (
    <>
      {loading ? <ActivityIndicator color={variant === 'secondary' ? colors.primary : colors.textInverse} /> : icon}
      <Text style={[styles.text, variant === 'secondary' && styles.secondaryText]}>{title}</Text>
    </>
  );

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.shell,
        styles[variant],
        (pressed || loading) && styles.pressed,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {variant === 'primary' || variant === 'danger' ? (
        <LinearGradient
          colors={variant === 'danger' ? gradients.danger : gradients.primary}
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

const styles = StyleSheet.create({
  shell: {
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  primary: {
    backgroundColor: colors.primary,
    elevation: 4,
  },
  secondary: {
    backgroundColor: 'rgba(255, 253, 248, 0.82)',
    borderColor: colors.border,
    borderWidth: 1,
  },
  danger: {
    backgroundColor: colors.danger,
    elevation: 3,
  },
  button: {
    minHeight: 50,
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
  text: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: '900',
    fontFamily: typography.strong,
    letterSpacing: 0.2,
  },
  secondaryText: {
    color: colors.primary,
  },
});
