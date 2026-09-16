import { useMemo, useState, type ReactNode } from 'react';
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
  semanticShadows,
  spacing,
  typeScale,
  typography,
  type AppColorTokens,
  useAppTheme,
} from '../theme/theme';
import { getActionAccessibilityState, getSelectableAccessibilityState } from './control-state';

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
  const styles = useFoundationStyles();
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
  const styles = useFoundationStyles();

  return (
    <View style={[styles.header, compact && styles.headerCompact]}>
      {leftAction ? <View style={styles.headerSide}>{leftAction}</View> : null}
      <View style={styles.headerCopy}>
        <Text accessibilityRole="header" style={styles.headerTitle}>{title}</Text>
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
  const { colors } = useAppTheme();
  const styles = useFoundationStyles();
  const [focused, setFocused] = useState(false);
  const inactive = disabled || loading;
  const textColor = getButtonTextColor(colors, variant, inactive);

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
        styles.button,
        styles[`${variant}Button`],
        fullWidth && styles.fullWidth,
        inactive && styles.buttonDisabled,
        focused && !inactive && styles.controlFocused,
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
  const styles = useFoundationStyles();

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
  const styles = useFoundationStyles();

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
  const styles = useFoundationStyles();
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
  const { colors } = useAppTheme();
  const styles = useFoundationStyles();

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityState={{ busy: true }}
      style={[styles.stateCard, variant === 'fullScreen' && styles.fullScreenState, styles.loadingState, style]}
    >
      <ActivityIndicator color={colors.primary} />
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
  const { colors } = useAppTheme();
  const styles = useFoundationStyles();
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.formField, style]}>
      <View style={styles.formLabelRow}>
        <Text style={styles.formLabel}>{label}</Text>
        {required ? <Text style={styles.requiredLabel}>{requiredLabel}</Text> : null}
      </View>
      {description ? <Text style={styles.formDescription}>{description}</Text> : null}
      {children ?? (
        <TextInput
          {...inputProps}
          accessibilityHint={inputProps?.accessibilityHint ?? error ?? description}
          accessibilityLabel={inputProps?.accessibilityLabel ?? label}
          accessibilityState={{
            ...inputProps?.accessibilityState,
            disabled: inputProps?.editable === false,
          }}
          aria-invalid={Boolean(error)}
          onBlur={(event) => {
            setFocused(false);
            inputProps?.onBlur?.(event);
          }}
          onFocus={(event) => {
            setFocused(true);
            inputProps?.onFocus?.(event);
          }}
          placeholderTextColor={colors.textTertiary}
          style={[
            styles.input,
            inputProps?.multiline && styles.inputMultiline,
            focused && styles.controlFocused,
            error && styles.inputError,
            inputProps?.style,
          ]}
        />
      )}
      {error ? <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.formError}>{error}</Text> : null}
    </View>
  );
}

interface IngredientChipBaseProps {
  label: string;
  quantity?: string;
  unit?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}

type IngredientChipProps = IngredientChipBaseProps & (
  | { onRemove?: undefined; removeAccessibilityLabel?: never }
  | { onRemove: () => void; removeAccessibilityLabel: string }
);

export function IngredientChip({
  label,
  quantity,
  unit,
  selected = false,
  disabled = false,
  onPress,
  onRemove,
  removeAccessibilityLabel,
}: IngredientChipProps) {
  const styles = useFoundationStyles();
  const [focused, setFocused] = useState(false);
  const [removeFocused, setRemoveFocused] = useState(false);
  const content = (
    <>
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
      {quantity ? <Text style={[styles.chipMeta, selected && styles.chipMetaSelected]}>{unit ? `${quantity} ${unit}` : quantity}</Text> : null}
    </>
  );

  if (onRemove) {
    return (
      <View style={[styles.chip, selected && styles.chipSelected, disabled && styles.chipDisabled]}>
        {onPress ? (
          <Pressable
            accessibilityLabel={label}
            accessibilityRole="button"
            accessibilityState={getSelectableAccessibilityState({ selected, disabled })}
            disabled={disabled}
            onBlur={() => setFocused(false)}
            onFocus={() => setFocused(true)}
            onPress={onPress}
            style={({ pressed }) => [
              styles.chipMainAction,
              focused && !disabled && styles.controlFocused,
              pressed && !disabled && styles.buttonPressed,
            ]}
          >
            {content}
          </Pressable>
        ) : (
          <View style={styles.chipMainAction}>{content}</View>
        )}
        <Pressable
          accessibilityLabel={removeAccessibilityLabel}
          accessibilityRole="button"
          accessibilityState={getActionAccessibilityState({ disabled })}
          disabled={disabled}
          onBlur={() => setRemoveFocused(false)}
          onFocus={() => setRemoveFocused(true)}
          onPress={onRemove}
          style={({ pressed }) => [
            styles.chipRemove,
            removeFocused && !disabled && styles.controlFocused,
            pressed && !disabled && styles.buttonPressed,
          ]}
        >
          <Text style={[styles.chipRemoveText, selected && styles.chipLabelSelected]}>x</Text>
        </Pressable>
      </View>
    );
  }

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={getSelectableAccessibilityState({ selected, disabled })}
        disabled={disabled}
        onBlur={() => setFocused(false)}
        onFocus={() => setFocused(true)}
        onPress={onPress}
        style={({ pressed }) => [
          styles.chip,
          selected && styles.chipSelected,
          disabled && styles.chipDisabled,
          focused && !disabled && styles.controlFocused,
          pressed && !disabled && styles.buttonPressed,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={[styles.chip, selected && styles.chipSelected, disabled && styles.chipDisabled]}>{content}</View>;
}

type StatusBadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

interface StatusBadgeProps {
  label: string;
  tone?: StatusBadgeTone;
  style?: StyleProp<ViewStyle>;
}

export function StatusBadge({ label, tone = 'neutral', style }: StatusBadgeProps) {
  const styles = useFoundationStyles();

  return (
    <View accessible accessibilityLabel={label} style={[styles.statusBadge, styles[`${tone}Badge`], style]}>
      <Text style={[styles.statusBadgeText, getStatusBadgeTextStyle(styles, tone)]}>{label}</Text>
    </View>
  );
}

function getButtonTextColor(colors: AppColorTokens, variant: ButtonVariant, disabled: boolean) {
  if (disabled) {
    return colors.textTertiary;
  }

  if (variant === 'primary' || variant === 'destructive') {
    return variant === 'primary' ? colors.onPrimary : colors.textInverse;
  }

  if (variant === 'secondary') {
    return colors.primary;
  }

  return colors.textPrimary;
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

function getStatusBadgeTextStyle(styles: ReturnType<typeof createFoundationStyles>, tone: StatusBadgeTone) {
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

function useFoundationStyles() {
  const { colors } = useAppTheme();
  return useMemo(() => createFoundationStyles(colors), [colors]);
}

function createFoundationStyles(colors: AppColorTokens) {
  return StyleSheet.create({
  scaffold: {
    flex: 1,
    backgroundColor: colors.canvas,
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
    color: colors.textPrimary,
  },
  headerSubtitle: {
    ...typeScale.body,
    color: colors.textSecondary,
  },
  button: {
    minHeight: buttonHeights.md,
    minWidth: buttonHeights.md,
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
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
  },
  tertiaryButton: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  destructiveButton: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  buttonDisabled: {
    backgroundColor: colors.surfaceDisabled,
    borderColor: colors.border,
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  controlFocused: {
    borderColor: colors.accent,
    borderWidth: borders.focus,
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
    borderColor: colors.border,
    backgroundColor: colors.surface,
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
    color: colors.textPrimary,
  },
  stateDescription: {
    ...typeScale.body,
    color: colors.textSecondary,
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
    backgroundColor: colors.dangerMuted,
    borderColor: colors.danger,
  },
  warningSetupCard: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.warning,
  },
  infoSetupCard: {
    backgroundColor: colors.infoMuted,
    borderColor: colors.info,
  },
  successSetupCard: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.success,
  },
  neutralSetupCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
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
    color: colors.textPrimary,
  },
  requiredLabel: {
    ...typeScale.caption,
    color: colors.danger,
  },
  formDescription: {
    ...typeScale.caption,
    color: colors.textSecondary,
  },
  formError: {
    ...typeScale.caption,
    color: colors.danger,
  },
  input: {
    minHeight: inputHeights.md,
    borderRadius: radii.md,
    borderWidth: borders.regular,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: typography.body,
    fontSize: 16,
  },
  inputError: {
    borderColor: colors.danger,
    borderWidth: 2,
  },
  inputMultiline: {
    minHeight: inputHeights.multiline,
    textAlignVertical: 'top',
  },
  chip: {
    minHeight: buttonHeights.md,
    minWidth: buttonHeights.md,
    borderRadius: radii.pill,
    borderWidth: borders.regular,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipDisabled: {
    opacity: 0.46,
  },
  chipLabel: {
    ...typeScale.label,
    color: colors.textPrimary,
  },
  chipLabelSelected: {
    color: colors.onPrimary,
  },
  chipMeta: {
    ...typeScale.caption,
    color: colors.textSecondary,
  },
  chipMetaSelected: {
    color: colors.onPrimary,
  },
  chipRemove: {
    minWidth: buttonHeights.md,
    minHeight: buttonHeights.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipMainAction: {
    minHeight: buttonHeights.md,
    minWidth: buttonHeights.md,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  chipRemoveText: {
    ...typeScale.label,
    color: colors.textSecondary,
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
    backgroundColor: colors.surfaceMuted,
  },
  successBadge: {
    backgroundColor: colors.success,
  },
  warningBadge: {
    backgroundColor: colors.accentMuted,
  },
  dangerBadge: {
    backgroundColor: colors.danger,
  },
  infoBadge: {
    backgroundColor: colors.infoMuted,
  },
  statusBadgeText: {
    ...typeScale.caption,
    fontFamily: typography.strong,
  },
  statusBadgeTextNeutral: {
    color: colors.textSecondary,
  },
  statusBadgeTextInverse: {
    color: colors.textInverse,
  },
  statusBadgeTextWarning: {
    color: colors.warning,
  },
  statusBadgeTextInfo: {
    color: colors.info,
  },
  });
}
