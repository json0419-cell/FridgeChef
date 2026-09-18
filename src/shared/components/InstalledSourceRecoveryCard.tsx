import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useI18n } from '../../i18n/i18n';
import type { InstalledSourceDiagnostic } from '../../storage/installed-source-registry';
import { radii, spacing, typography, useAppTheme } from '../theme/theme';
import { Button } from './Foundation';

interface InstalledSourceRecoveryCardProps {
  diagnostic: InstalledSourceDiagnostic;
  onRetry: () => void;
  retrying?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function InstalledSourceRecoveryCard({ diagnostic, onRetry, retrying = false, style }: InstalledSourceRecoveryCardProps) {
  const { t } = useI18n();
  const { colors } = useAppTheme();
  const diagnosticText = [
    t('installedSources.diagnosticCategory', { category: diagnostic.category }),
    t('app.databaseDiagnosticCode', { code: diagnostic.code }),
    t('app.databaseDiagnosticTime', { time: diagnostic.occurredAt }),
    t('installedSources.diagnosticStoredVersion', {
      version: diagnostic.storedVersion ?? t('app.databaseDiagnosticUnknownVersion'),
    }),
    t('installedSources.diagnosticTargetVersion', { version: diagnostic.targetVersion }),
  ].join('\n');

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}
    >
      <Text accessibilityRole="header" style={[styles.title, { color: colors.danger }]}>
        {t('installedSources.unreadableTitle')}
      </Text>
      <Text style={[styles.body, { color: colors.textPrimary }]}>{t('installedSources.unreadableText')}</Text>
      <Button fullWidth title={t('common.retry')} loading={retrying} onPress={onRetry} />
      <View style={[styles.diagnosticCard, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
        <Text style={[styles.diagnosticTitle, { color: colors.textPrimary }]}>{t('installedSources.diagnosticTitle')}</Text>
        <Text selectable style={[styles.diagnosticText, { color: colors.textSecondary }]}>
          {diagnosticText}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  title: {
    fontFamily: typography.strong,
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '800',
  },
  body: {
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 23,
  },
  diagnosticCard: {
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  diagnosticTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
  },
  diagnosticText: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'monospace',
  },
});
