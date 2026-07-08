import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { useFeedback } from '../components/AppFeedbackProvider';
import {
  deleteUserRecipe,
  deleteUserRecipes,
  deleteUserRecipeLibrary,
  listUserRecipeLibraries,
  listUserRecipes,
  setUserRecipeLibraryEnabled,
  setUserRecipesEnabled,
  updateUserRecipeLibraryName,
} from '../db/userRecipesRepository';
import { useI18n } from '../i18n/i18n';
import {
  getPersonalRecipeEmbeddingStatuses,
  rebuildPersonalRecipeEmbeddings,
  type PersonalRecipeEmbeddingStatus,
} from '../rag/personalRagService';
import { colors, gradients, radii, shadows, spacing, typography } from '../styles/theme';
import type { RootStackParamList, UserRecipe, UserRecipeDifficulty, UserRecipeLibrary, UserRecipeSourceType } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'UserRecipeLibraryDetail'>;
type SourceFilter = 'all' | UserRecipeSourceType;
type DifficultyFilter = 'all' | UserRecipeDifficulty;
type TFunction = ReturnType<typeof useI18n>['t'];

const SOURCE_FILTERS: Array<{ value: SourceFilter }> = [
  { value: 'all' },
  { value: 'youtube' },
  { value: 'manual' },
];

const DIFFICULTY_FILTERS: Array<{ value: DifficultyFilter }> = [
  { value: 'all' },
  { value: '简单' },
  { value: '中等' },
  { value: '偏难' },
  { value: '未知' },
];

export function UserRecipeLibraryDetailScreen({ navigation, route }: Props) {
  const { language, t } = useI18n();
  const { showFeedback } = useFeedback();
  const { libraryId } = route.params;
  const [library, setLibrary] = useState<UserRecipeLibrary | null>(null);
  const [recipes, setRecipes] = useState<UserRecipe[]>([]);
  const [embeddingStatuses, setEmbeddingStatuses] = useState<Record<string, PersonalRecipeEmbeddingStatus>>({});
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<Set<string>>(new Set());
  const [renameValue, setRenameValue] = useState('');
  const [searchText, setSearchText] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>('all');
  const [loading, setLoading] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [libraries, nextRecipes] = await Promise.all([listUserRecipeLibraries(), listUserRecipes(libraryId)]);
      const nextLibrary = libraries.find((item) => item.id === libraryId) ?? null;
      const nextEmbeddingStatuses = await getPersonalRecipeEmbeddingStatuses(nextRecipes);
      const nextRecipeIds = new Set(nextRecipes.map((recipe) => recipe.id));
      setLibrary(nextLibrary);
      setRenameValue((current) => current || nextLibrary?.name || '');
      setRecipes(nextRecipes);
      setEmbeddingStatuses(nextEmbeddingStatuses);
      setSelectedRecipeIds((current) => new Set(Array.from(current).filter((id) => nextRecipeIds.has(id))));
    } finally {
      setLoading(false);
    }
  }, [libraryId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const toggleLibrary = async () => {
    if (!library) {
      return;
    }

    await setUserRecipeLibraryEnabled(library.id, !library.enabled);
    await load();
  };

  const renameLibrary = async () => {
    if (!library) {
      return;
    }

    const nextName = renameValue.trim();
    if (!nextName) {
      Alert.alert(t('libraryDetail.nameRequired'));
      return;
    }

    setRenaming(true);
    try {
      await updateUserRecipeLibraryName(library.id, nextName);
      await load();
      Alert.alert(t('libraryDetail.nameUpdated'));
    } catch (error) {
      Alert.alert(t('libraryDetail.renameFailed'), formatError(error, t));
    } finally {
      setRenaming(false);
    }
  };

  const confirmDeleteLibrary = () => {
    if (!library) {
      return;
    }

    Alert.alert(t('libraryDetail.deleteLibraryTitle'), t('libraryDetail.deleteLibraryBody', { name: library.name, count: library.recipeCount }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteUserRecipeLibrary(library.id);
          navigation.goBack();
        },
      },
    ]);
  };

  const confirmDeleteRecipe = (recipe: UserRecipe) => {
    Alert.alert(t('libraryDetail.deleteRecipeTitle'), t('libraryDetail.deleteRecipeBody', { title: recipe.title }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteUserRecipe(recipe.id);
          await load();
        },
      },
    ]);
  };

  const toggleRecipeSelection = useCallback((recipeId: string) => {
    setSelectedRecipeIds((current) => {
      const next = new Set(current);
      if (next.has(recipeId)) {
        next.delete(recipeId);
      } else {
        next.add(recipeId);
      }
      return next;
    });
  }, []);

  const filteredRecipes = useMemo(
    () =>
      recipes.filter((recipe) => {
        if (sourceFilter !== 'all' && recipe.sourceType !== sourceFilter) {
          return false;
        }

        if (difficultyFilter !== 'all' && recipe.difficulty !== difficultyFilter) {
          return false;
        }

        const keyword = normalizeSearchText(searchText);
        if (!keyword) {
          return true;
        }

        return normalizeSearchText(buildSearchIndex(recipe)).includes(keyword);
      }),
    [difficultyFilter, recipes, searchText, sourceFilter],
  );

  const visibleRecipeIds = useMemo(() => filteredRecipes.map((recipe) => recipe.id), [filteredRecipes]);
  const selectedRecipeIdsArray = useMemo(() => Array.from(selectedRecipeIds), [selectedRecipeIds]);
  const selectedCount = selectedRecipeIdsArray.length;
  const allVisibleSelected = visibleRecipeIds.length > 0 && visibleRecipeIds.every((id) => selectedRecipeIds.has(id));

  const toggleSelectVisibleRecipes = () => {
    setSelectedRecipeIds((current) => {
      if (allVisibleSelected) {
        const next = new Set(current);
        for (const id of visibleRecipeIds) {
          next.delete(id);
        }
        return next;
      }

      return new Set([...Array.from(current), ...visibleRecipeIds]);
    });
  };

  const bulkSetEnabled = async (enabled: boolean) => {
    if (selectedCount === 0) {
      showFeedback({ tone: 'info', title: t('libraryDetail.selectRecipesFirst') });
      return;
    }

    setBulkBusy(true);
    try {
      await setUserRecipesEnabled(selectedRecipeIdsArray, enabled);
      setSelectedRecipeIds(new Set());
      await load();
      showFeedback({
        tone: 'success',
        title: enabled ? t('libraryDetail.bulkEnabledTitle') : t('libraryDetail.bulkDisabledTitle'),
        message: t('libraryDetail.bulkChangedBody', { count: selectedCount }),
      });
    } catch (error) {
      showFeedback({ tone: 'error', title: t('libraryDetail.bulkFailed'), message: formatError(error, t) });
    } finally {
      setBulkBusy(false);
    }
  };

  const confirmBulkDelete = () => {
    if (selectedCount === 0) {
      showFeedback({ tone: 'info', title: t('libraryDetail.selectRecipesFirst') });
      return;
    }

    Alert.alert(t('libraryDetail.bulkDeleteTitle'), t('libraryDetail.bulkDeleteBody', { count: selectedCount }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          setBulkBusy(true);
          try {
            await deleteUserRecipes(selectedRecipeIdsArray);
            setSelectedRecipeIds(new Set());
            await load();
            showFeedback({ tone: 'success', title: t('libraryDetail.bulkDeletedTitle'), message: t('libraryDetail.bulkChangedBody', { count: selectedCount }) });
          } catch (error) {
            showFeedback({ tone: 'error', title: t('libraryDetail.bulkFailed'), message: formatError(error, t) });
          } finally {
            setBulkBusy(false);
          }
        },
      },
    ]);
  };

  const rebuildEmbeddings = async (scope: 'selected' | 'all') => {
    const ids = scope === 'selected' ? selectedRecipeIdsArray : recipes.map((recipe) => recipe.id);
    if (ids.length === 0) {
      showFeedback({ tone: 'info', title: t('libraryDetail.noRecipesToIndex') });
      return;
    }

    setBulkBusy(true);
    try {
      const result = await rebuildPersonalRecipeEmbeddings(ids);
      await load();
      showFeedback({
        tone: result.indexed > 0 ? 'success' : 'info',
        title: t('libraryDetail.reindexDoneTitle'),
        message: t('libraryDetail.reindexDoneBody', {
          indexed: result.indexed,
          skipped: result.skipped,
          failed: result.failed,
        }),
      });
    } catch (error) {
      showFeedback({ tone: 'error', title: t('libraryDetail.reindexFailed'), message: formatError(error, t) });
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <Screen>
      <FlatList
        data={filteredRecipes}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
              <Text style={styles.eyebrow}>{t('libraryDetail.eyebrow')}</Text>
              <Text style={styles.title}>{library?.name ?? t('libraryDetail.fallbackTitle')}</Text>
              <Text style={styles.subtitle}>
                {t('libraryDetail.subtitle', {
                  count: recipes.length,
                  status: library?.enabled ? t('userLibraries.enabledMeta') : t('userLibraries.disabledMeta'),
                })}
              </Text>
            </LinearGradient>

            <View style={styles.actionCard}>
              <Text style={styles.sectionTitle}>{t('libraryDetail.nameLabel')}</Text>
              <TextInput
                value={renameValue}
                onChangeText={setRenameValue}
                placeholder={t('libraryDetail.namePlaceholder')}
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
              <PrimaryButton title={t('libraryDetail.saveName')} variant="secondary" onPress={renameLibrary} loading={renaming} disabled={!library} />
            </View>

            <View style={styles.actionCard}>
              <PrimaryButton title={t('libraryDetail.addRecipe')} onPress={() => navigation.navigate('AddUserRecipe', { libraryId })} />
              <PrimaryButton
                title={library?.enabled ? t('userLibraries.exclude') : t('userLibraries.include')}
                variant="secondary"
                onPress={toggleLibrary}
                disabled={!library}
              />
              <PrimaryButton title={t('libraryDetail.deleteThisLibrary')} variant="danger" onPress={confirmDeleteLibrary} disabled={!library} />
            </View>

            <View style={styles.actionCard}>
              <Text style={styles.sectionTitle}>{t('libraryDetail.bulkTitle')}</Text>
              <Text style={styles.helper}>
                {t('libraryDetail.bulkSummary', { selected: selectedCount, shown: filteredRecipes.length })}
              </Text>
              <View style={styles.buttonRow}>
                <PrimaryButton
                  title={allVisibleSelected ? t('libraryDetail.clearVisibleSelection') : t('libraryDetail.selectVisible')}
                  variant="secondary"
                  onPress={toggleSelectVisibleRecipes}
                  disabled={filteredRecipes.length === 0 || bulkBusy}
                  style={styles.buttonCell}
                />
                <PrimaryButton
                  title={t('libraryDetail.clearSelection')}
                  variant="secondary"
                  onPress={() => setSelectedRecipeIds(new Set())}
                  disabled={selectedCount === 0 || bulkBusy}
                  style={styles.buttonCell}
                />
              </View>
              <View style={styles.buttonRow}>
                <PrimaryButton title={t('libraryDetail.enableSelected')} variant="secondary" onPress={() => void bulkSetEnabled(true)} disabled={selectedCount === 0 || bulkBusy} style={styles.buttonCell} />
                <PrimaryButton title={t('libraryDetail.disableSelected')} variant="secondary" onPress={() => void bulkSetEnabled(false)} disabled={selectedCount === 0 || bulkBusy} style={styles.buttonCell} />
              </View>
              <View style={styles.buttonRow}>
                <PrimaryButton title={t('libraryDetail.reindexSelected')} variant="secondary" onPress={() => void rebuildEmbeddings('selected')} loading={bulkBusy && selectedCount > 0} disabled={selectedCount === 0 || bulkBusy} style={styles.buttonCell} />
                <PrimaryButton title={t('libraryDetail.reindexAll')} variant="secondary" onPress={() => void rebuildEmbeddings('all')} loading={bulkBusy} disabled={recipes.length === 0 || bulkBusy} style={styles.buttonCell} />
              </View>
              <PrimaryButton title={t('libraryDetail.deleteSelected')} variant="danger" onPress={confirmBulkDelete} disabled={selectedCount === 0 || bulkBusy} />
            </View>

            <View style={styles.filterCard}>
              <Text style={styles.sectionTitle}>{t('libraryDetail.searchTitle')}</Text>
              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder={t('libraryDetail.searchPlaceholder')}
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
              <FilterRow
                items={SOURCE_FILTERS.map((item) => ({ ...item, label: sourceFilterLabel(item.value, t) }))}
                value={sourceFilter}
                onChange={(nextValue) => setSourceFilter(nextValue as SourceFilter)}
              />
              <FilterRow
                items={DIFFICULTY_FILTERS.map((item) => ({ ...item, label: difficultyFilterLabel(item.value, t) }))}
                value={difficultyFilter}
                onChange={(nextValue) => setDifficultyFilter(nextValue as DifficultyFilter)}
              />
              <Text style={styles.filterSummary}>
                {t('libraryDetail.filterSummary', { shown: filteredRecipes.length, total: recipes.length })}
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {recipes.length === 0 ? t('libraryDetail.emptyNoRecipes') : t('libraryDetail.emptyNoMatches')}
            </Text>
            <Text style={styles.emptyText}>
              {recipes.length === 0
                ? t('libraryDetail.emptyNoRecipesText')
                : t('libraryDetail.emptyNoMatchesText')}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.recipeCard, !item.enabled && styles.recipeCardDisabled]}>
            <View style={styles.cardHeader}>
              <View style={styles.flex}>
                <Text style={styles.recipeTitle}>{item.title}</Text>
                <Text style={styles.meta}>
                  {t('libraryDetail.steps', { count: item.steps.length })} · {difficultyLabel(item.difficulty, t)}
                  {item.estimatedTimeMinutes ? ` · ${t('libraryDetail.minutes', { count: item.estimatedTimeMinutes })}` : ''}
                </Text>
              </View>
              <View style={styles.badgeColumn}>
                <Pressable
                  accessibilityRole="button"
                  style={[styles.selectChip, selectedRecipeIds.has(item.id) && styles.selectChipActive]}
                  onPress={() => toggleRecipeSelection(item.id)}
                >
                  <Text style={[styles.selectChipText, selectedRecipeIds.has(item.id) && styles.selectChipTextActive]}>
                    {selectedRecipeIds.has(item.id) ? t('libraryDetail.selected') : t('libraryDetail.select')}
                  </Text>
                </Pressable>
                <Text style={styles.recipeBadge}>{sourceTypeLabel(item.sourceType, t)}</Text>
                <Text style={[styles.statusBadge, !item.enabled && styles.statusBadgeOff]}>
                  {item.enabled ? t('libraryDetail.recipeEnabled') : t('libraryDetail.recipeDisabled')}
                </Text>
                <Text style={styles.indexBadge}>{embeddingStatusLabel(embeddingStatuses[item.id], t)}</Text>
              </View>
            </View>
            {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
            <Text style={styles.line}>{t('libraryDetail.mainIngredients')}：{formatList(item.mainIngredients, language, t)}</Text>
            <View style={styles.recipeActions}>
              <Pressable
                accessibilityRole="button"
                style={styles.textButton}
                onPress={() => navigation.navigate('RecipeDetail', { recipeId: item.id })}
              >
                <Text style={styles.textButtonLabel}>{t('libraryDetail.view')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.textButton}
                onPress={() => navigation.navigate('AddUserRecipe', { recipeId: item.id })}
              >
                <Text style={styles.textButtonLabel}>{t('common.edit')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={styles.textButton} onPress={() => confirmDeleteRecipe(item)}>
                <Text style={[styles.textButtonLabel, styles.deleteText]}>{t('common.delete')}</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </Screen>
  );
}

function sourceFilterLabel(value: SourceFilter, t: TFunction) {
  if (value === 'youtube') {
    return t('libraryDetail.sourceYoutube');
  }

  if (value === 'manual') {
    return t('libraryDetail.sourceManual');
  }

  return t('libraryDetail.sourceAll');
}

function difficultyFilterLabel(value: DifficultyFilter, t: TFunction) {
  if (value === '简单') {
    return t('difficulty.easy');
  }

  if (value === '中等') {
    return t('difficulty.medium');
  }

  if (value === '偏难') {
    return t('difficulty.hard');
  }

  if (value === '未知') {
    return t('difficulty.unknown');
  }

  return t('libraryDetail.difficultyAll');
}

function difficultyLabel(value: UserRecipeDifficulty, t: TFunction) {
  return difficultyFilterLabel(value, t);
}

function sourceTypeLabel(value: UserRecipeSourceType, t: TFunction) {
  return value === 'youtube' ? t('libraryDetail.sourceYoutube') : t('libraryDetail.manual');
}

function embeddingStatusLabel(status: PersonalRecipeEmbeddingStatus | undefined, t: TFunction) {
  if (!status || status.state === 'missing') {
    return t('libraryDetail.indexMissing');
  }

  if (status.state === 'indexed') {
    return t('libraryDetail.indexReady');
  }

  if (status.state === 'stale') {
    return t('libraryDetail.indexStale');
  }

  return t('libraryDetail.indexUnavailable');
}

function formatList(items: string[], language: string, t: TFunction) {
  return items.length > 0 ? items.join(language === 'en' ? ', ' : '、') : t('recommendations.none');
}

function FilterRow({
  items,
  value,
  onChange,
}: {
  items: Array<{ label: string; value: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.filterRow}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <Pressable
            key={item.value}
            accessibilityRole="button"
            style={[styles.filterChip, active && styles.filterChipActive]}
            onPress={() => onChange(item.value)}
          >
            <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function buildSearchIndex(recipe: UserRecipe) {
  return [
    recipe.title,
    recipe.description,
    ...recipe.mainIngredients,
    ...recipe.seasonings,
    ...recipe.tags,
    ...recipe.steps,
  ].join(' ');
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

function formatError(error: unknown, t: TFunction) {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : t('common.unknown');
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
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
    fontSize: 15,
  },
  actionCard: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  helper: {
    color: colors.muted,
    lineHeight: 20,
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  buttonCell: {
    flexGrow: 1,
  },
  filterCard: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  input: {
    minHeight: 52,
    borderRadius: radii.md,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
    fontFamily: typography.body,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  filterChip: {
    borderRadius: radii.pill,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  filterChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  filterChipText: {
    color: colors.text,
    fontWeight: '900',
  },
  filterChipTextActive: {
    color: colors.textInverse,
  },
  filterSummary: {
    color: colors.muted,
    fontWeight: '800',
  },
  empty: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderColor: colors.border,
    borderWidth: 1,
    padding: spacing.xl,
    ...shadows.card,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    fontFamily: typography.display,
    marginBottom: spacing.sm,
  },
  emptyText: {
    color: colors.muted,
    lineHeight: 22,
  },
  recipeCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.card,
  },
  recipeCardDisabled: {
    opacity: 0.68,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
  recipeTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  meta: {
    color: colors.muted,
    lineHeight: 20,
    fontWeight: '700',
  },
  recipeBadge: {
    color: colors.primary,
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    fontWeight: '900',
    overflow: 'hidden',
  },
  badgeColumn: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  selectChip: {
    borderRadius: radii.pill,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  selectChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  selectChipText: {
    color: colors.text,
    fontWeight: '900',
  },
  selectChipTextActive: {
    color: colors.textInverse,
  },
  statusBadge: {
    color: colors.textInverse,
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    fontWeight: '900',
    overflow: 'hidden',
  },
  statusBadgeOff: {
    backgroundColor: colors.muted,
  },
  indexBadge: {
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    fontWeight: '900',
    overflow: 'hidden',
  },
  description: {
    color: colors.text,
    lineHeight: 21,
  },
  line: {
    color: colors.muted,
    lineHeight: 21,
  },
  recipeActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  textButton: {
    paddingVertical: spacing.xs,
  },
  textButtonLabel: {
    color: colors.primary,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  deleteText: {
    color: colors.danger,
  },
});
