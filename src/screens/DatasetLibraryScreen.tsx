import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { RefreshCw, SlidersHorizontal } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppTextInput } from '../components/AppLayout';
import {
  fetchDatasetIndex,
  OFFICIAL_DATASET_INDEX_URL,
  resolveDatasetManifestUrl,
} from '../datasets/datasetIndex';
import { downloadDatasetPack, uninstallDataset, type DatasetDownloadProgress } from '../datasets/datasetPack';
import { clearActiveDataset, listInstalledDatasets, setActiveDataset } from '../datasets/datasetRegistry';
import { listUserRecipeLibraries, listUserRecipes } from '../db/userRecipesRepository';
import { useI18n } from '../i18n/i18n';
import { colors, spacing, typography } from '../styles/theme';
import type { DatasetIndexEntry, InstalledDataset, RecipesStackScreenProps } from '../types';

type Props = RecipesStackScreenProps<'DatasetLibrary'>;
type TFunction = ReturnType<typeof useI18n>['t'];
type ActionButtonVariant = 'primary' | 'secondary';

export function DatasetLibraryScreen({ navigation }: Props) {
  const { language, t } = useI18n();
  const [datasets, setDatasets] = useState<InstalledDataset[]>([]);
  const [officialDatasets, setOfficialDatasets] = useState<DatasetIndexEntry[]>([]);
  const [userLibraryCount, setUserLibraryCount] = useState(0);
  const [enabledUserLibraryCount, setEnabledUserLibraryCount] = useState(0);
  const [userRecipeCount, setUserRecipeCount] = useState(0);
  const [officialLoading, setOfficialLoading] = useState(false);
  const [officialError, setOfficialError] = useState<string | null>(null);
  const [manifestUrl, setManifestUrl] = useState('');
  const [manualDownloading, setManualDownloading] = useState(false);
  const [downloadingDatasetId, setDownloadingDatasetId] = useState<string | null>(null);
  const [progress, setProgress] = useState<DatasetDownloadProgress | null>(null);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity accessibilityLabel={t('nav.settings')} accessibilityRole="button" onPress={() => navigation.navigate('Settings')} style={styles.headerSettingsButton}>
          <SlidersHorizontal size={20} color="#6B6B6B" strokeWidth={2} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, t]);

  const loadDatasets = useCallback(async () => {
    setDatasets(await listInstalledDatasets());
  }, []);

  const loadUserRecipeStats = useCallback(async () => {
    const [libraries, recipes] = await Promise.all([listUserRecipeLibraries(), listUserRecipes()]);
    setUserLibraryCount(libraries.length);
    setEnabledUserLibraryCount(libraries.filter((library) => library.enabled).length);
    setUserRecipeCount(recipes.length);
  }, []);

  const loadOfficialDatasets = useCallback(async () => {
    setOfficialLoading(true);
    setOfficialError(null);
    try {
      const index = await fetchDatasetIndex();
      setOfficialDatasets(index.datasets);
    } catch (error) {
      setOfficialError(error instanceof Error ? error.message : t('dataset.fetchOfficialFailed'));
    } finally {
      setOfficialLoading(false);
    }
  }, [t]);

  const installedDatasetsById = useMemo(() => new Map(datasets.map((dataset) => [dataset.id, dataset])), [datasets]);
  const customDatasets = useMemo(
    () => datasets.filter((dataset) => !officialDatasets.some((official) => official.id === dataset.id)),
    [datasets, officialDatasets],
  );

  useFocusEffect(
    useCallback(() => {
      void loadDatasets();
      void loadUserRecipeStats();
      void loadOfficialDatasets();
    }, [loadDatasets, loadOfficialDatasets, loadUserRecipeStats]),
  );

  const installFromUrl = async () => {
    const url = manifestUrl.trim();
    if (!url) {
      Alert.alert(t('dataset.missingUrl'));
      return;
    }

    setManualDownloading(true);
    setProgress(null);
    try {
      await downloadDatasetPack(url, setProgress);
      setManifestUrl('');
      await loadDatasets();
      Alert.alert(t('dataset.installedTitle'), t('dataset.installedBody'));
    } catch (error) {
      Alert.alert(t('dataset.installFailed'), error instanceof Error ? error.message : t('common.unknown'));
    } finally {
      setManualDownloading(false);
      setProgress(null);
    }
  };

  const installOfficialDataset = async (dataset: DatasetIndexEntry) => {
    const url = resolveDatasetManifestUrl(OFFICIAL_DATASET_INDEX_URL, dataset);
    setDownloadingDatasetId(dataset.id);
    setProgress(null);
    try {
      await downloadDatasetPack(url, setProgress);
      await loadDatasets();
      Alert.alert(t('dataset.installedTitle'), `${dataset.name}\n${t('dataset.installedBody')}`);
    } catch (error) {
      Alert.alert(t('dataset.installFailed'), error instanceof Error ? error.message : t('common.unknown'));
    } finally {
      setDownloadingDatasetId(null);
      setProgress(null);
    }
  };

  const toggleDataset = async (dataset: InstalledDataset) => {
    if (dataset.active) {
      await clearActiveDataset(dataset.id);
    } else {
      await setActiveDataset(dataset.id);
    }
    await loadDatasets();
  };

  const remove = (dataset: InstalledDataset) => {
    Alert.alert(t('dataset.deleteTitle'), t('dataset.deleteBody', { name: dataset.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await uninstallDataset(dataset);
            await loadDatasets();
          } catch (error) {
            Alert.alert(t('dataset.deleteFailed'), error instanceof Error ? error.message : t('common.unknown'));
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{myLibrariesTitle(language)}</Text>
            <Text style={styles.personalBadge}>{t('dataset.enabledCount', { count: enabledUserLibraryCount })}</Text>
          </View>
          {userLibraryCount === 0 ? (
            <View style={styles.personalEmpty}>
              <Text style={styles.secondaryText}>{noPersonalLibrariesText(language)}</Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => navigation.navigate('UserRecipeLibraries')}
                style={styles.personalManageButton}
              >
                <Text style={styles.personalManageButtonText}>{t('dataset.manageMine')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.personalSummaryRow}>
              <Text style={styles.secondaryText}>{t('dataset.personalStats', { libraries: userLibraryCount, recipes: userRecipeCount })}</Text>
              <ActionButton title={t('dataset.manageMine')} variant="secondary" onPress={() => navigation.navigate('UserRecipeLibraries')} style={styles.inlineButton} />
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('dataset.official')}</Text>
            <TouchableOpacity accessibilityRole="button" onPress={loadOfficialDatasets} style={styles.refreshButton}>
              <Text style={styles.refreshButtonText}>{t('dataset.refresh')}</Text>
              <RefreshCw size={14} color="#1B4332" style={styles.refreshIcon} />
            </TouchableOpacity>
          </View>
          {officialLoading ? <Text style={styles.helperText}>{t('dataset.loadingOfficial')}</Text> : null}
          {officialError ? <Text style={styles.errorText}>{officialError}</Text> : null}
          {officialDatasets.map((item) => {
            const installed = installedDatasetsById.get(item.id) ?? null;
            const downloadingThis = downloadingDatasetId === item.id;
            return (
              <View key={item.id} style={styles.officialCard}>
                <View style={styles.cardHeader}>
                  <Text style={styles.datasetName}>{formatDatasetName(installed?.name ?? item.name, t)}</Text>
                  {installed ? <StatusBadge active={installed.active} t={t} /> : null}
                </View>
                <Text style={styles.meta}>
                  {t('dataset.recipeCount', { count: formatCount(item.recipeCount, language) })} · {formatBytes(item.sizeBytes)}
                </Text>
                {installed ? (
                  <View style={styles.actions}>
                    <TouchableOpacity accessibilityRole="button" style={styles.linkButton} onPress={() => toggleDataset(installed)}>
                      <Text style={styles.linkText}>{installed.active ? t('dataset.disable') : t('dataset.enable')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity accessibilityRole="button" style={styles.linkButton} onPress={() => remove(installed)}>
                      <Text style={[styles.linkText, styles.deleteText]}>{t('common.delete')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <ActionButton
                    title={t('dataset.download')}
                    disabled={Boolean(downloadingDatasetId) || manualDownloading}
                    loading={downloadingThis}
                    onPress={() => installOfficialDataset(item)}
                    style={styles.cardButton}
                  />
                )}
              </View>
            );
          })}
          {officialDatasets.length === 0 && !officialLoading ? <Text style={styles.helperText}>{t('dataset.noOfficial')}</Text> : null}
          {progress && downloadingDatasetId ? (
            <Text style={styles.progress}>
              {progress.fileName} · {progress.completedFiles}/{progress.totalFiles} {t('common.files')} · {formatBytes(progress.completedBytes)} / {formatBytes(progress.totalBytes)}
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('dataset.downloadFromUrl')}</Text>
          <AppTextInput
            value={manifestUrl}
            onChangeText={setManifestUrl}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={t('dataset.urlPlaceholder')}
            style={styles.input}
          />
          <ActionButton title={t('dataset.downloadInstall')} onPress={installFromUrl} loading={manualDownloading} disabled={Boolean(downloadingDatasetId)} />
          {progress && manualDownloading ? (
            <Text style={styles.progress}>
              {progress.completedFiles}/{progress.totalFiles} {t('common.files')} · {formatBytes(progress.completedBytes)} / {formatBytes(progress.totalBytes)}
            </Text>
          ) : null}
        </View>

        {customDatasets.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('dataset.custom')}</Text>
            {customDatasets.map((dataset) => (
              <InstalledDatasetCard key={dataset.id} dataset={dataset} onToggle={toggleDataset} onRemove={remove} language={language} t={t} />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionButton({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ActionButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const inactive = disabled || loading;
  const secondary = variant === 'secondary';
  const spinnerColor = secondary ? '#1B4332' : '#FFFFFF';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.solidButton,
        secondary ? styles.solidButtonSecondary : styles.solidButtonPrimary,
        inactive && styles.solidButtonDisabled,
        pressed && !inactive && styles.solidButtonPressed,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={spinnerColor} size="small" /> : null}
      <Text style={[styles.solidButtonText, secondary && styles.solidButtonTextSecondary, inactive && styles.solidButtonTextDisabled]}>{title}</Text>
    </Pressable>
  );
}

function InstalledDatasetCard({
  dataset,
  onToggle,
  onRemove,
  language,
  t,
}: {
  dataset: InstalledDataset;
  onToggle: (dataset: InstalledDataset) => void;
  onRemove: (dataset: InstalledDataset) => void;
  language: string;
  t: TFunction;
}) {
  return (
    <View style={styles.officialCard}>
      <View style={styles.cardHeader}>
        <Text style={styles.datasetName}>{formatDatasetName(dataset.name, t)}</Text>
        <StatusBadge active={dataset.active} t={t} />
      </View>
      <Text style={styles.meta}>
        {t('dataset.recipeCount', { count: formatCount(dataset.recipeCount, language) })} · {formatBytes(dataset.sizeBytes)}
      </Text>
      <View style={styles.actions}>
        <TouchableOpacity accessibilityRole="button" style={styles.linkButton} onPress={() => onToggle(dataset)}>
          <Text style={styles.linkText}>{dataset.active ? t('dataset.disable') : t('dataset.enable')}</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={styles.linkButton} onPress={() => onRemove(dataset)}>
          <Text style={[styles.linkText, styles.deleteText]}>{t('common.delete')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function StatusBadge({ active, t }: { active: boolean; t: TFunction }) {
  return (
    <View style={[styles.statusBadge, active ? styles.statusBadgeActive : styles.statusBadgeInactive]}>
      <Text style={[styles.statusBadgeText, active ? styles.statusBadgeTextActive : styles.statusBadgeTextInactive]}>
        {active ? t('dataset.statusEnabled') : t('dataset.statusDisabled')}
      </Text>
    </View>
  );
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${bytes} B`;
}

function formatCount(value: number, language: string) {
  return value.toLocaleString(language === 'en' ? 'en-US' : 'zh-CN');
}

function formatDatasetName(value: string, t: TFunction) {
  return value
    .replace(/吃什么\s*官方菜谱库/g, t('dataset.officialLibraryName'))
    .replace(/\b(?:10k|100k|1m)\b/gi, '')
    .replace(/\s*[-_]\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function myLibrariesTitle(language: string) {
  return language === 'en' ? 'My Libraries' : '我的菜谱库';
}

function noPersonalLibrariesText(language: string) {
  return language === 'en' ? 'No personal libraries' : '暂无个人菜谱库';
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 24,
  },
  headerSettingsButton: {
    padding: 12,
    marginRight: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: '#6B6B6B',
    lineHeight: 21,
    fontSize: 14,
    fontWeight: '400',
    flex: 1,
  },
  personalBadge: {
    alignSelf: 'center',
    backgroundColor: '#FEF3C7',
    color: '#1A1A1A',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '600',
    overflow: 'hidden',
  },
  section: {
    gap: spacing.md,
  },
  personalEmpty: {
    marginTop: 8,
  },
  personalManageButton: {
    marginTop: 8,
    marginBottom: 4,
    height: 40,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#1B4332',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    alignSelf: 'flex-start',
  },
  personalManageButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1B4332',
  },
  personalSummaryRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderBottomColor: '#E5E5E5',
    borderBottomWidth: 1,
  },
  inlineButton: {
    alignSelf: 'center',
    borderWidth: 1.5,
    borderColor: '#1B4332',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitle: {
    color: '#1A1A1A',
    fontSize: 17,
    fontWeight: '600',
    fontFamily: typography.strong,
  },
  helperText: {
    color: '#6B6B6B',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  },
  errorText: {
    color: colors.danger,
    lineHeight: 20,
    fontWeight: '800',
  },
  officialCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    padding: 16,
    gap: spacing.sm,
  },
  input: {
    height: 48,
    minHeight: 48,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  refreshButtonText: {
    color: '#1B4332',
    fontSize: 14,
    fontWeight: '500',
  },
  refreshIcon: {
    marginLeft: 4,
  },
  progress: {
    color: colors.muted,
    lineHeight: 20,
    fontWeight: '700',
  },
  solidButton: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  solidButtonPrimary: {
    backgroundColor: '#1B4332',
  },
  solidButtonSecondary: {
    height: 40,
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E5E5',
    borderWidth: 1,
  },
  solidButtonDisabled: {
    opacity: 0.46,
  },
  solidButtonPressed: {
    opacity: 0.88,
  },
  solidButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    fontFamily: typography.strong,
  },
  solidButtonTextSecondary: {
    color: '#1B4332',
  },
  solidButtonTextDisabled: {
    color: '#6B6B6B',
  },
  cardButton: {
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 24,
    alignSelf: 'flex-start',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  cardTitleBox: {
    flex: 1,
    gap: spacing.xs,
  },
  datasetName: {
    color: '#1A1A1A',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: typography.strong,
    flex: 1,
  },
  meta: {
    color: '#6B6B6B',
    fontSize: 14,
    fontWeight: '400',
  },
  statusBadge: {
    minWidth: 64,
    minHeight: 30,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgeActive: {
    backgroundColor: '#1B4332',
  },
  statusBadgeInactive: {
    backgroundColor: '#F5F7F5',
    borderColor: '#E5E5E5',
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: typography.strong,
  },
  statusBadgeTextActive: {
    color: '#FFFFFF',
  },
  statusBadgeTextInactive: {
    color: colors.muted,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 12,
  },
  linkButton: {
    paddingVertical: spacing.xs,
  },
  linkText: {
    color: '#1B4332',
    fontSize: 14,
    fontWeight: '500',
    fontFamily: typography.strong,
  },
  deleteText: {
    color: '#E07A5F',
  },
});
