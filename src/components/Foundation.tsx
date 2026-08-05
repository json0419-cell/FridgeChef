import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  borders,
  buttonHeights,
  contentWidths,
  iconSizes,
  inputHeights,
  radii,
  safeAreaSpacing,
  semanticColors,
  semanticShadows,
  spacing,
  typeScale,
  typography,
} from '../styles/theme';

type FoundationAction = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive';

interface AppScaffoldProps {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function AppScaffold({ children, header, footer, scroll = false, contentStyle, style, testID }: AppScaffoldProps) {
  const content = (
    <>
      {header}
      <View style={[styles.scaffoldContent, contentStyle]}>{children}</View>
      {footer}
    </>
  );

  return (
    <SafeAreaView style={[styles.scaffold, style]} testID={testID}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scaffoldScrollContent} keyboardShouldPersistTaps="handled">
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

interface TopLevelHeaderProps {
  title: string;
  subtitle?: string;
  leftAction?: ReactNode;
  rightAction?: ReactNode;
  compact?: boolean;
}

export function TopLevelHeader({ title, subtitle, leftAction, rightAction, compact = false }: TopLevelHeaderProps) {
  return (
    <View style={[styles.header, compact && styles.headerCompact]}>
      {leftAction ? <View style={styles.headerSide}>{leftAction}</View> : null}
      <View style={styles.headerCopy}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      {rightAction ? <View style={styles.headerSide}>{rightAction}</View> : null}
    </View>
  );
}

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  fullWidth = false,
  leadingIcon,
  trailingIcon,
  style,
  textStyle,
  accessibilityLabel,
}: ButtonProps) {
  const inactive = disabled || loading;
  const textColor = getButtonTextColor(variant, inactive);

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[`${variant}Button`],
        fullWidth && styles.fullWidth,
        inactive && styles.buttonDisabled,
        pressed && !inactive && styles.buttonPressed,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={textColor} size="small" /> : leadingIcon}
      <Text style={[styles.buttonText, { color: textColor }, textStyle]}>{title}</Text>
      {!loading ? trailingIcon : null}
    </Pressable>
  );
}

interface ButtonGroupProps {
  children: ReactNode;
  direction?: 'row' | 'column';
  wrap?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ButtonGroup({ children, direction = 'row', wrap = true, fullWidth = false, style }: ButtonGroupProps) {
  return (
    <View
      style={[
        styles.buttonGroup,
        direction === 'column' && styles.buttonGroupColumn,
        wrap && direction === 'row' && styles.buttonGroupWrap,
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      {children}
    </View>
  );
}

interface EmptyStateProps {
  title: string;
  description: string;
  primaryAction?: FoundationAction;
  secondaryAction?: FoundationAction;
  variant?: 'compact' | 'fullScreen';
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({ title, description, primaryAction, secondaryAction, variant = 'compact', style }: EmptyStateProps) {
  return (
    <View style={[styles.stateCard, variant === 'fullScreen' && styles.fullScreenState, style]}>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateDescription}>{description}</Text>
      {primaryAction || secondaryAction ? (
        <ButtonGroup direction={variant === 'fullScreen' ? 'column' : 'row'} fullWidth>
          {primaryAction ? <Button title={primaryAction.label} onPress={primaryAction.onPress} loading={primaryAction.loading} disabled={primaryAction.disabled} fullWidth /> : null}
          {secondaryAction ? (
            <Button
              title={secondaryAction.label}
              onPress={secondaryAction.onPress}
              loading={secondaryAction.loading}
              disabled={secondaryAction.disabled}
              variant="secondary"
              fullWidth={variant === 'fullScreen'}
            />
          ) : null}
        </ButtonGroup>
      ) : null}
    </View>
  );
}

type SetupBlockerKind = 'geminiKeyMissing' | 'recipeLibraryMissing' | 'embeddingModelUnavailable' | 'cameraPermissionMissing' | 'emptyFridge';

interface SetupBlockerCardProps {
  kind: SetupBlockerKind;
  badgeLabel: string;
  title: string;
  description: string;
  primaryAction?: FoundationAction;
  secondaryAction?: FoundationAction;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SetupBlockerCard({
  kind,
  badgeLabel,
  title,
  description,
  primaryAction,
  secondaryAction,
  compact = false,
  style,
}: SetupBlockerCardProps) {
  const tone = getSetupBlockerTone(kind);

  return (
    <View style={[styles.setupCard, compact && styles.setupCardCompact, styles[`${tone}SetupCard`], style]}>
      <StatusBadge label={badgeLabel} tone={tone} />
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateDescription}>{description}</Text>
      {primaryAction || secondaryAction ? (
        <ButtonGroup fullWidth>
          {primaryAction ? <Button title={primaryAction.label} onPress={primaryAction.onPress} loading={primaryAction.loading} disabled={primaryAction.disabled} fullWidth /> : null}
          {secondaryAction ? (
            <Button
              title={secondaryAction.label}
              onPress={secondaryAction.onPress}
              loading={secondaryAction.loading}
              disabled={secondaryAction.disabled}
              variant="secondary"
            />
          ) : null}
        </ButtonGroup>
      ) : null}
    </View>
  );
}

interface LoadingStateProps {
  title?: string;
  description?: string;
  variant?: 'compact' | 'fullScreen';
  style?: StyleProp<ViewStyle>;
}

export function LoadingState({ title, description, variant = 'compact', style }: LoadingStateProps) {
  return (
    <View style={[styles.stateCard, variant === 'fullScreen' && styles.fullScreenState, styles.loadingState, style]}>
      <ActivityIndicator color={semanticColors.primary} />
      {title ? <Text style={styles.stateTitle}>{title}</Text> : null}
      {description ? <Text style={styles.stateDescription}>{description}</Text> : null}
    </View>
  );
}

interface FormFieldProps {
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  requiredLabel?: string;
  children?: ReactNode;
  inputProps?: TextInputProps;
  style?: StyleProp<ViewStyle>;
}

export function FormField({ label, description, error, required = false, requiredLabel = '*', children, inputProps, style }: FormFieldProps) {
  return (
    <View style={[styles.formField, style]}>
      <View style={styles.formLabelRow}>
        <Text style={styles.formLabel}>{label}</Text>
        {required ? <Text style={styles.requiredLabel}>{requiredLabel}</Text> : null}
      </View>
      {description ? <Text style={styles.formDescription}>{description}</Text> : null}
      {children ?? <TextInput placeholderTextColor={semanticColors.textTertiary} style={[styles.input, inputProps?.multiline && styles.inputMultiline]} {...inputProps} />}
      {error ? <Text style={styles.formError}>{error}</Text> : null}
    </View>
  );
}

interface IngredientChipProps {
  label: string;
  quantity?: string;
  unit?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
}

export function IngredientChip({ label, quantity, unit, selected = false, disabled = false, onPress, onRemove }: IngredientChipProps) {
  const content = (
    <>
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
      {quantity ? <Text style={[styles.chipMeta, selected && styles.chipMetaSelected]}>{unit ? `${quantity} ${unit}` : quantity}</Text> : null}
      {onRemove ? (
        <Pressable accessibilityLabel={`Remove ${label}`} accessibilityRole="button" disabled={disabled} onPress={onRemove} style={styles.chipRemove}>
          <Text style={[styles.chipRemoveText, selected && styles.chipLabelSelected]}>x</Text>
        </Pressable>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected, disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.chip, selected && styles.chipSelected, disabled && styles.chipDisabled, pressed && !disabled && styles.buttonPressed]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={[styles.chip, selected && styles.chipSelected, disabled && styles.chipDisabled]}>{content}</View>;
}

interface PreferenceChipProps {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
}

export function PreferenceChip({ label, selected = false, disabled = false, onPress, onRemove }: PreferenceChipProps) {
  return (
    <IngredientChip
      label={label}
      selected={selected}
      disabled={disabled}
      onPress={onPress}
      onRemove={onRemove}
    />
  );
}

type StatusBadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

interface StatusBadgeProps {
  label: string;
  tone?: StatusBadgeTone;
  style?: StyleProp<ViewStyle>;
}

export function StatusBadge({ label, tone = 'neutral', style }: StatusBadgeProps) {
  return (
    <View style={[styles.statusBadge, styles[`${tone}Badge`], style]}>
      <Text style={[styles.statusBadgeText, getStatusBadgeTextStyle(tone)]}>{label}</Text>
    </View>
  );
}

function getButtonTextColor(variant: ButtonVariant, disabled: boolean) {
  if (disabled) {
    return semanticColors.textTertiary;
  }

  if (variant === 'primary' || variant === 'destructive') {
    return semanticColors.textInverse;
  }

  if (variant === 'secondary') {
    return semanticColors.primary;
  }

  return semanticColors.textPrimary;
}

function getSetupBlockerTone(kind: SetupBlockerKind): StatusBadgeTone {
  if (kind === 'emptyFridge') {
    return 'info';
  }

  if (kind === 'cameraPermissionMissing' || kind === 'embeddingModelUnavailable') {
    return 'warning';
  }

  return 'danger';
}

function getStatusBadgeTextStyle(tone: StatusBadgeTone) {
  if (tone === 'success' || tone === 'danger') {
    return styles.statusBadgeTextInverse;
  }

  if (tone === 'warning') {
    return styles.statusBadgeTextWarning;
  }

  if (tone === 'info') {
    return styles.statusBadgeTextInfo;
  }

  return styles.statusBadgeTextNeutral;
}

const styles = StyleSheet.create({
  scaffold: {
    flex: 1,
    backgroundColor: semanticColors.canvas,
    paddingHorizontal: safeAreaSpacing.horizontal,
    paddingTop: safeAreaSpacing.top,
    paddingBottom: safeAreaSpacing.bottom,
  },
  scaffoldScrollContent: {
    flexGrow: 1,
    gap: safeAreaSpacing.contentGap,
    paddingBottom: safeAreaSpacing.bottom,
  },
  scaffoldContent: {
    width: '100%',
    maxWidth: contentWidths.readable,
    alignSelf: 'center',
    gap: safeAreaSpacing.contentGap,
  },
  header: {
    width: '100%',
    maxWidth: contentWidths.readable,
    alignSelf: 'center',
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerCompact: {
    minHeight: 52,
  },
  headerSide: {
    minWidth: iconSizes.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  headerTitle: {
    ...typeScale.screenTitle,
    color: semanticColors.textPrimary,
  },
  headerSubtitle: {
    ...typeScale.body,
    color: semanticColors.textSecondary,
  },
  button: {
    minHeight: buttonHeights.md,
    borderRadius: radii.pill,
    borderWidth: borders.regular,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  primaryButton: {
    backgroundColor: semanticColors.primary,
    borderColor: semanticColors.primary,
  },
  secondaryButton: {
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.borderStrong,
  },
  tertiaryButton: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  destructiveButton: {
    backgroundColor: semanticColors.danger,
    borderColor: semanticColors.danger,
  },
  buttonDisabled: {
    backgroundColor: semanticColors.surfaceDisabled,
    borderColor: semanticColors.border,
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  buttonText: {
    ...typeScale.label,
  },
  fullWidth: {
    width: '100%',
    alignSelf: 'stretch',
  },
  buttonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  buttonGroupColumn: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  buttonGroupWrap: {
    flexWrap: 'wrap',
  },
  stateCard: {
    borderRadius: radii.lg,
    borderWidth: borders.regular,
    borderColor: semanticColors.border,
    backgroundColor: semanticColors.surface,
    padding: spacing.xl,
    gap: spacing.md,
    ...semanticShadows.soft,
  },
  fullScreenState: {
    flex: 1,
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateTitle: {
    ...typeScale.cardTitle,
    color: semanticColors.textPrimary,
  },
  stateDescription: {
    ...typeScale.body,
    color: semanticColors.textSecondary,
  },
  setupCard: {
    borderRadius: radii.lg,
    borderWidth: borders.regular,
    padding: spacing.lg,
    gap: spacing.md,
    ...semanticShadows.soft,
  },
  setupCardCompact: {
    padding: spacing.md,
  },
  dangerSetupCard: {
    backgroundColor: semanticColors.dangerMuted,
    borderColor: '#E8B3AA',
  },
  warningSetupCard: {
    backgroundColor: semanticColors.secondaryMuted,
    borderColor: '#E1C094',
  },
  infoSetupCard: {
    backgroundColor: semanticColors.infoMuted,
    borderColor: '#B9D2DA',
  },
  successSetupCard: {
    backgroundColor: semanticColors.primaryMuted,
    borderColor: '#B9D8BF',
  },
  neutralSetupCard: {
    backgroundColor: semanticColors.surfaceMuted,
    borderColor: semanticColors.border,
  },
  loadingState: {
    alignItems: 'center',
  },
  formField: {
    gap: spacing.sm,
  },
  formLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  formLabel: {
    ...typeScale.label,
    color: semanticColors.textPrimary,
  },
  requiredLabel: {
    ...typeScale.caption,
    color: semanticColors.danger,
  },
  formDescription: {
    ...typeScale.caption,
    color: semanticColors.textSecondary,
  },
  formError: {
    ...typeScale.caption,
    color: semanticColors.danger,
  },
  input: {
    minHeight: inputHeights.md,
    borderRadius: radii.md,
    borderWidth: borders.regular,
    borderColor: semanticColors.border,
    backgroundColor: semanticColors.surface,
    color: semanticColors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: typography.body,
    fontSize: 16,
  },
  inputMultiline: {
    minHeight: inputHeights.multiline,
    textAlignVertical: 'top',
  },
  chip: {
    minHeight: 36,
    borderRadius: radii.pill,
    borderWidth: borders.regular,
    borderColor: semanticColors.border,
    backgroundColor: semanticColors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chipSelected: {
    backgroundColor: semanticColors.primary,
    borderColor: semanticColors.primary,
  },
  chipDisabled: {
    opacity: 0.46,
  },
  chipLabel: {
    ...typeScale.label,
    color: semanticColors.textPrimary,
  },
  chipLabelSelected: {
    color: semanticColors.textInverse,
  },
  chipMeta: {
    ...typeScale.caption,
    color: semanticColors.textSecondary,
  },
  chipMetaSelected: {
    color: semanticColors.textInverse,
  },
  chipRemove: {
    minWidth: 24,
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRemoveText: {
    ...typeScale.label,
    color: semanticColors.textSecondary,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    minHeight: 28,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    justifyContent: 'center',
  },
  neutralBadge: {
    backgroundColor: semanticColors.surfaceMuted,
  },
  successBadge: {
    backgroundColor: semanticColors.primary,
  },
  warningBadge: {
    backgroundColor: semanticColors.secondaryMuted,
  },
  dangerBadge: {
    backgroundColor: semanticColors.danger,
  },
  infoBadge: {
    backgroundColor: semanticColors.infoMuted,
  },
  statusBadgeText: {
    ...typeScale.caption,
    fontFamily: typography.strong,
  },
  statusBadgeTextNeutral: {
    color: semanticColors.textSecondary,
  },
  statusBadgeTextInverse: {
    color: semanticColors.textInverse,
  },
  statusBadgeTextWarning: {
    color: semanticColors.warning,
  },
  statusBadgeTextInfo: {
    color: semanticColors.info,
  },
});
