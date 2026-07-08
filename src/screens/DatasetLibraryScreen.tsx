import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  fetchDatasetIndex,
  OFFICIAL_DATASET_INDEX_URL,
  resolveDatasetManifestUrl,
} from '../datasets/datasetIndex';
import { downloadDatasetPack, uninstallDataset, type DatasetDownloadProgress } from '../datasets/datasetPack';
import { clearActiveDataset, listInstalledDatasets, setActiveDataset } from '../datasets/datasetRegistry';
import { listUserRecipeLibraries, listUserRecipes } from '../db/userRecipesRepository';
import { useI18n } from '../i18n/i18n';
import { colors, gradients, radii, shadows, spacing, typography } from '../styles/theme';
import type { DatasetIndexEntry, InstalledDataset, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'DatasetLibrary'>;
type TFunction = ReturnType<typeof useI18n>['t'];

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
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <Text style={styles.eyebrow}>{t('dataset.eyebrow')}</Text>
          <Text style={styles.title}>{t('dataset.title')}</Text>
          <Text style={styles.subtitle}>{t('dataset.subtitle')}</Text>
        </LinearGradient>

        <View style={styles.personalBox}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, styles.personalTitle]}>{t('dataset.myLibraries')}</Text>
            <Text style={styles.personalBadge}>{t('dataset.enabledCount', { count: enabledUserLibraryCount })}</Text>
          </View>
          <Text style={styles.personalText}>{t('dataset.personalStats', { libraries: userLibraryCount, recipes: userRecipeCount })}</Text>
          <PrimaryButton title={t('dataset.manageMine')} variant="secondary" onPress={() => navigation.navigate('UserRecipeLibraries')} />
        </View>

        <View style={styles.installBox}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('dataset.official')}</Text>
            <Pressable accessibilityRole="button" onPress={loadOfficialDatasets}>
              <Text style={styles.refreshText}>{t('dataset.refresh')}</Text>
            </Pressable>
          </View>
          <Text style={styles.helperText}>{t('dataset.officialHelper')}</Text>
          {officialLoading ? <Text style={styles.helperText}>{t('dataset.loadingOfficial')}</Text> : null}
          {officialError ? <Text style={styles.errorText}>{officialError}</Text> : null}
          {officialDatasets.map((item) => {
            const installed = installedDatasetsById.get(item.id) ?? null;
            const downloadingThis = downloadingDatasetId === item.id;
            return (
              <View key={item.id} style={styles.officialCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleBox}>
                    <Text style={styles.datasetName}>{formatDatasetName(installed?.name ?? item.name, t)}</Text>
                    <Text style={styles.meta}>
                      {item.level} · {formatRecipeCount(item.chunkCount, language, t)} · {formatBytes(item.sizeBytes)}
                    </Text>
                  </View>
                  {installed ? <StatusBadge active={installed.active} t={t} /> : null}
                </View>
                <Text style={styles.line}>
                  {t('dataset.recipeCount', { count: formatCount(item.recipeCount, language) })} · {item.embeddingModel} ·{' '}
                  {t('dataset.dimension', { dimension: item.embeddingDimension })}
                </Text>
                {installed ? (
                  <View style={styles.actions}>
                    <Pressable accessibilityRole="button" style={styles.linkButton} onPress={() => toggleDataset(installed)}>
                      <Text style={styles.linkText}>{installed.active ? t('dataset.disable') : t('dataset.enable')}</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" style={styles.linkButton} onPress={() => remove(installed)}>
                      <Text style={[styles.linkText, styles.deleteText]}>{t('common.delete')}</Text>
                    </Pressable>
                  </View>
                ) : (
                  <PrimaryButton
                    title={t('dataset.download')}
                    disabled={Boolean(downloadingDatasetId) || manualDownloading}
                    loading={downloadingThis}
                    onPress={() => installOfficialDataset(item)}
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

        <View style={styles.installBox}>
          <Text style={styles.sectionTitle}>{t('dataset.downloadFromUrl')}</Text>
          <TextInput
            value={manifestUrl}
            onChangeText={setManifestUrl}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={t('dataset.urlPlaceholder')}
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          <PrimaryButton title={t('dataset.downloadInstall')} onPress={installFromUrl} loading={manualDownloading} disabled={Boolean(downloadingDatasetId)} />
          {progress && manualDownloading ? (
            <Text style={styles.progress}>
              {progress.completedFiles}/{progress.totalFiles} {t('common.files')} · {formatBytes(progress.completedBytes)} / {formatBytes(progress.totalBytes)}
            </Text>
          ) : null}
        </View>

        {customDatasets.length > 0 ? (
          <View style={styles.installBox}>
            <Text style={styles.sectionTitle}>{t('dataset.custom')}</Text>
            <Text style={styles.helperText}>{t('dataset.customHelper')}</Text>
            {customDatasets.map((dataset) => (
              <InstalledDatasetCard key={dataset.id} dataset={dataset} onToggle={toggleDataset} onRemove={remove} language={language} t={t} />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
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
        <View style={styles.cardTitleBox}>
          <Text style={styles.datasetName}>{formatDatasetName(dataset.name, t)}</Text>
          <Text style={styles.meta}>
            {dataset.level} · {formatRecipeCount(dataset.chunkCount, language, t)} · {formatBytes(dataset.sizeBytes)}
          </Text>
        </View>
        <StatusBadge active={dataset.active} t={t} />
      </View>
      <Text style={styles.line}>{dataset.description}</Text>
      <Text style={styles.line}>
        {t('dataset.model')}：{dataset.embeddingModel} · {t('dataset.dimension', { dimension: dataset.embeddingDimension })} ·{' '}
        {formatBytes(dataset.sizeBytes)}
      </Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" style={styles.linkButton} onPress={() => onToggle(dataset)}>
          <Text style={styles.linkText}>{dataset.active ? t('dataset.disable') : t('dataset.enable')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.linkButton} onPress={() => onRemove(dataset)}>
          <Text style={[styles.linkText, styles.deleteText]}>{t('common.delete')}</Text>
        </Pressable>
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

function formatRecipeCount(value: number, language: string, t: TFunction) {
  return t('dataset.chunkCount', { count: formatCount(value, language) });
}

function formatDatasetName(value: string, t: TFunction) {
  return value
    .replace(/吃什么\s*官方菜谱库/g, t('dataset.officialLibraryName'))
    .replace(/\b(?:10k|100k|1m)\b/gi, '')
    .replace(/\s*[-_]\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  hero: {
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.sm,
    ...shadows.lift,
  },
  eyebrow: {
    color: 'rgba(255, 255, 255, 0.62)',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.6,
    fontFamily: typography.strong,
  },
  title: {
    color: colors.textInverse,
    fontSize: 36,
    fontWeight: '900',
    fontFamily: typography.display,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.74)',
    lineHeight: 23,
  },
  installBox: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  personalBox: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  personalTitle: {
    color: colors.textInverse,
  },
  personalText: {
    color: 'rgba(255, 255, 255, 0.72)',
    lineHeight: 21,
    fontWeight: '700',
  },
  personalBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.gold,
    color: colors.ink,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    fontWeight: '900',
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  refreshText: {
    color: colors.primary,
    fontWeight: '900',
  },
  helperText: {
    color: colors.muted,
    lineHeight: 20,
    fontWeight: '700',
  },
  errorText: {
    color: colors.danger,
    lineHeight: 20,
    fontWeight: '800',
  },
  officialCard: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  input: {
    minHeight: 52,
    borderRadius: radii.md,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    paddingHorizontal: spacing.md,
    fontSize: 15,
  },
  progress: {
    color: colors.muted,
    lineHeight: 20,
    fontWeight: '700',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  cardTitleBox: {
    flex: 1,
    gap: spacing.xs,
  },
  datasetName: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  meta: {
    color: colors.muted,
    fontWeight: '700',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    minWidth: 64,
    minHeight: 30,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgeActive: {
    backgroundColor: colors.ink,
  },
  statusBadgeInactive: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  statusBadgeTextActive: {
    color: colors.textInverse,
  },
  statusBadgeTextInactive: {
    color: colors.muted,
  },
  line: {
    color: colors.muted,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
  linkButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  linkText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  deleteText: {
    color: colors.danger,
  },
});
