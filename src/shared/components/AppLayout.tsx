import type { ReactNode } from 'react';
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
import { colors, gradients, radii, shadows, spacing, typography } from '../theme/theme';

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
  return (
    <LinearGradient
      colors={quiet ? gradients.heroQuiet : gradients.hero}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, compact && styles.heroCompact, style]}
    >
      <View pointerEvents="none" style={styles.heroGlow} />
      <View style={styles.heroCopy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.heroTitle}>{title}</Text>
        {subtitle ? <Text style={styles.heroSubtitle}>{subtitle}</Text> : null}
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
  return <View style={[styles.card, styles[`${variant}Card`], style]}>{children}</View>;
}

interface SectionHeaderProps {
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, detail, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}>
          <Text style={styles.textActionLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

interface EmptyStateProps {
  title: string;
  text: string;
  action?: ReactNode;
}

export function EmptyState({ title, text, action }: EmptyStateProps) {
  return (
    <AppCard style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
      {action}
    </AppCard>
  );
}

interface MetricPillProps {
  value: string;
  label: string;
}

export function MetricPill({ value, label }: MetricPillProps) {
  return (
    <View style={styles.metricPill}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

interface ChipProps {
  label: string;
  active?: boolean;
  tone?: 'neutral' | 'primary' | 'danger' | 'gold' | 'dark';
  onPress?: () => void;
  onRemove?: () => void;
}

export function Chip({ label, active = false, tone = 'neutral', onPress, onRemove }: ChipProps) {
  const content = (
    <>
      <Text style={[styles.chipText, (active || tone === 'dark' || tone === 'danger') && styles.chipTextInverse]}>{label}</Text>
      {onRemove ? (
        <Pressable accessibilityRole="button" onPress={onRemove} style={styles.chipRemove}>
          <Text style={[styles.chipRemoveText, active && styles.chipTextInverse]}>x</Text>
        </Pressable>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.chip,
          styles[`${tone}Chip`],
          active && styles.activeChip,
          pressed && styles.pressed,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[styles.chip, styles[`${tone}Chip`], active && styles.activeChip]}>
      {content}
    </View>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

export function AppTextInput({ style, multiline, ...props }: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : props.textAlignVertical}
      style={[styles.input, multiline && styles.inputMultiline, style]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  hero: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.lg,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1,
    ...shadows.lift,
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
    color: 'rgba(255, 248, 236, 0.62)',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.3,
    fontFamily: typography.strong,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: colors.textInverse,
    fontSize: 34,
    fontWeight: '900',
    fontFamily: typography.display,
    letterSpacing: 0.1,
  },
  heroSubtitle: {
    color: colors.mutedOnDark,
    fontSize: 15,
    lineHeight: 23,
    fontFamily: typography.body,
  },
  heroSlot: {
    zIndex: 1,
  },
  card: {
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    ...shadows.card,
  },
  defaultCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
  },
  mutedCard: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  darkCard: {
    backgroundColor: colors.ink,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  accentCard: {
    backgroundColor: colors.accentSoft,
    borderColor: 'rgba(232, 75, 47, 0.18)',
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
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  sectionDetail: {
    color: colors.muted,
    lineHeight: 20,
    fontWeight: '700',
    fontFamily: typography.body,
  },
  textAction: {
    minHeight: 36,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  textActionLabel: {
    color: colors.primary,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  emptyState: {
    padding: spacing.xl,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '900',
    fontFamily: typography.display,
  },
  emptyText: {
    color: colors.muted,
    lineHeight: 22,
    fontFamily: typography.body,
  },
  metricPill: {
    flex: 1,
    minHeight: 70,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1,
    padding: spacing.md,
    justifyContent: 'center',
  },
  metricValue: {
    color: colors.gold,
    fontSize: 24,
    fontWeight: '900',
    fontFamily: typography.display,
  },
  metricLabel: {
    color: 'rgba(255, 248, 236, 0.72)',
    fontWeight: '800',
    fontFamily: typography.strong,
  },
  chip: {
    minHeight: 36,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  neutralChip: {},
  primaryChip: {
    backgroundColor: colors.chip,
    borderColor: colors.primarySoft,
  },
  dangerChip: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  goldChip: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  darkChip: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  activeChip: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  chipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  chipTextInverse: {
    color: colors.textInverse,
  },
  chipRemove: {
    minWidth: 24,
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRemoveText: {
    color: colors.muted,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  fieldLabel: {
    color: colors.text,
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
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    fontFamily: typography.body,
    ...shadows.hairline,
  },
  inputMultiline: {
    minHeight: 104,
    lineHeight: 22,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }],
  },
});
