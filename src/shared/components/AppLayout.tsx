import { useMemo, useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  buttonHeights,
  radii,
  semanticShadows,
  spacing,
  typography,
  type AppColorTokens,
  useAppTheme,
} from '../theme/theme';

interface AppHeroProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  compact?: boolean;
  quiet?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function AppHero({ eyebrow, title, subtitle, children, compact = false, quiet = false, style }: AppHeroProps) {
  const { colors } = useAppTheme();
  const styles = useAppLayoutStyles();

  return (
    <LinearGradient
      colors={quiet ? [colors.surfaceMuted, colors.surfaceRaised] : [colors.primaryPressed, colors.primary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, compact && styles.heroCompact, style]}
    >
      <View pointerEvents="none" style={styles.heroGlow} />
      <View style={styles.heroCopy}>
        {eyebrow ? <Text style={[styles.eyebrow, quiet && styles.heroQuietCopy]}>{eyebrow}</Text> : null}
        <Text accessibilityRole="header" style={[styles.heroTitle, quiet && styles.heroQuietCopy]}>{title}</Text>
        {subtitle ? <Text style={[styles.heroSubtitle, quiet && styles.heroQuietDetail]}>{subtitle}</Text> : null}
      </View>
      {children ? <View style={styles.heroSlot}>{children}</View> : null}
    </LinearGradient>
  );
}

interface AppCardProps {
  children: ReactNode;
  variant?: 'default' | 'muted' | 'dark' | 'accent';
  style?: StyleProp<ViewStyle>;
}

export function AppCard({ children, variant = 'default', style }: AppCardProps) {
  const styles = useAppLayoutStyles();
  return <View style={[styles.card, styles[`${variant}Card`], style]}>{children}</View>;
}

interface SectionHeaderProps {
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, detail, actionLabel, onAction }: SectionHeaderProps) {
  const styles = useAppLayoutStyles();
  const [actionFocused, setActionFocused] = useState(false);

  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionCopy}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
        {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
          onBlur={() => setActionFocused(false)}
          onFocus={() => setActionFocused(true)}
          onPress={onAction}
          style={({ pressed }) => [styles.textAction, actionFocused && styles.focused, pressed && styles.pressed]}
        >
          <Text style={styles.textActionLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

interface MetricPillProps {
  value: string;
  label: string;
}

export function MetricPill({ value, label }: MetricPillProps) {
  const styles = useAppLayoutStyles();

  return (
    <View style={styles.metricPill}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  const styles = useAppLayoutStyles();
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

interface AppTextInputProps extends TextInputProps {
  invalid?: boolean;
}

export function AppTextInput({ style, multiline, invalid = false, onBlur, onFocus, ...props }: AppTextInputProps) {
  const { colors } = useAppTheme();
  const styles = useAppLayoutStyles();
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      {...props}
      accessibilityLabel={props.accessibilityLabel ?? (typeof props.placeholder === 'string' ? props.placeholder : undefined)}
      accessibilityState={{ ...props.accessibilityState, disabled: props.editable === false }}
      aria-invalid={invalid}
      placeholderTextColor={colors.textTertiary}
      multiline={multiline}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      textAlignVertical={multiline ? 'top' : props.textAlignVertical}
      style={[styles.input, multiline && styles.inputMultiline, focused && styles.focused, invalid && styles.inputError, style]}
    />
  );
}

function useAppLayoutStyles() {
  const { colors } = useAppTheme();
  return useMemo(() => createAppLayoutStyles(colors), [colors]);
}

function createAppLayoutStyles(colors: AppColorTokens) {
  return StyleSheet.create({
  hero: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.lg,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1,
    ...semanticShadows.card,
  },
  heroCompact: {
    padding: spacing.lg,
  },
  heroGlow: {
    position: 'absolute',
    width: 190,
    height: 190,
    right: -72,
    top: -82,
    borderRadius: 95,
    backgroundColor: 'rgba(244, 183, 64, 0.34)',
  },
  heroCopy: {
    gap: spacing.sm,
  },
  eyebrow: {
    color: colors.onPrimary,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.3,
    fontFamily: typography.strong,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: colors.onPrimary,
    fontSize: 34,
    fontWeight: '900',
    fontFamily: typography.display,
    letterSpacing: 0.1,
  },
  heroSubtitle: {
    color: colors.onPrimary,
    fontSize: 15,
    lineHeight: 23,
    fontFamily: typography.body,
  },
  heroSlot: {
    zIndex: 1,
  },
  heroQuietCopy: {
    color: colors.textPrimary,
  },
  heroQuietDetail: {
    color: colors.textSecondary,
  },
  card: {
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    ...semanticShadows.soft,
  },
  defaultCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
  },
  mutedCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
  },
  darkCard: {
    backgroundColor: colors.primaryPressed,
    borderColor: colors.primary,
  },
  accentCard: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 19,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  sectionDetail: {
    color: colors.textSecondary,
    lineHeight: 20,
    fontWeight: '700',
    fontFamily: typography.body,
  },
  textAction: {
    minHeight: buttonHeights.md,
    minWidth: buttonHeights.md,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryMuted,
  },
  textActionLabel: {
    color: colors.primary,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  metricPill: {
    flex: 1,
    minHeight: 70,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
    padding: spacing.md,
    justifyContent: 'center',
  },
  metricValue: {
    color: colors.accent,
    fontSize: 24,
    fontWeight: '900',
    fontFamily: typography.display,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontWeight: '800',
    fontFamily: typography.strong,
  },
  fieldLabel: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  input: {
    minHeight: 54,
    borderRadius: radii.md,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surfaceRaised,
    color: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    fontFamily: typography.body,
    ...semanticShadows.soft,
  },
  inputMultiline: {
    minHeight: 104,
    lineHeight: 22,
  },
  inputError: {
    borderColor: colors.danger,
    borderWidth: 2,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }],
  },
  focused: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  });
}
