import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppCard, AppTextInput, SectionHeader } from '../../../shared/components/AppLayout';
import { useFeedback } from '../../../shared/components/AppFeedbackProvider';
import { AppConfirmModal } from '../../../shared/components/AppConfirmModal';
import {
  deleteUserRecipe,
  deleteUserRecipes,
  deleteUserRecipeLibrary,
  listUserRecipeLibraries,
  listUserRecipes,
  setUserRecipeLibraryEnabled,
  setUserRecipesEnabled,
  updateUserRecipeLibraryName,
} from '../../../db/userRecipesRepository';
import { useI18n } from '../../../i18n/i18n';
import { localizeError } from '../../../i18n/error-messages';
import {
  getPersonalRecipeEmbeddingStatuses,
  rebuildPersonalRecipeEmbeddings,
  type PersonalRecipeEmbeddingStatus,
} from '../../../rag/personalRagService';
import { colors, spacing, typography } from '../../../shared/theme/theme';
import type { RecipesStackScreenProps, UserRecipe, UserRecipeDifficulty, UserRecipeLibrary, UserRecipeSourceType } from '../../../types';

type Props = RecipesStackScreenProps<'UserRecipeLibraryDetail'>;
type SourceFilter = 'all' | UserRecipeSourceType;

type ConfirmDialogState = {
  title: string;
  message: string;
  onConfirm: () => void | Promise<void>;
} | null;
type DifficultyFilter = 'all' | UserRecipeDifficulty;
type TFunction = ReturnType<typeof useI18n>['t'];
type ActionButtonVariant = 'primary' | 'secondary' | 'destructive';

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
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);

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
      showFeedback({ tone: 'error', title: t('libraryDetail.nameRequired') });
      return;
    }

    setRenaming(true);
    try {
      await updateUserRecipeLibraryName(library.id, nextName);
      await load();
      showFeedback({ tone: 'success', title: t('libraryDetail.nameUpdated') });
    } catch (error) {
      showFeedback({ tone: 'error', title: t('libraryDetail.renameFailed'), message: formatError(error, t) });
    } finally {
      setRenaming(false);
    }
  };

  const confirmDeleteLibrary = () => {
    if (!library) {
      return;
    }

    setConfirmDialog({
      title: t('libraryDetail.deleteLibraryTitle'),
      message: t('libraryDetail.deleteLibraryBody', { name: library.name, count: library.recipeCount }),
      onConfirm: async () => {
        await deleteUserRecipeLibrary(library.id);
        navigation.goBack();
      },
    });
  };

  const confirmDeleteRecipe = (recipe: UserRecipe) => {
    setConfirmDialog({
      title: t('libraryDetail.deleteRecipeTitle'),
      message: t('libraryDetail.deleteRecipeBody', { title: recipe.title }),
      onConfirm: async () => {
        await deleteUserRecipe(recipe.id);
        await load();
      },
    });
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

    setConfirmDialog({
      title: t('libraryDetail.bulkDeleteTitle'),
      message: t('libraryDetail.bulkDeleteBody', { count: selectedCount }),
      onConfirm: async () => {
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
    });
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
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <FlatList
        data={filteredRecipes}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.pageIntro}>
              <Text style={styles.pageTitle}>{library?.name ?? t('libraryDetail.fallbackTitle')}</Text>
              <Text style={styles.pageSubtitle}>{t('libraryDetail.subtitle', {
                count: recipes.length,
                status: library?.enabled ? t('userLibraries.enabledMeta') : t('userLibraries.disabledMeta'),
              })}</Text>
            </View>

            <AppCard style={styles.card}>
              <SectionHeader title={t('libraryDetail.nameLabel')} />
              <AppTextInput
                value={renameValue}
                onChangeText={setRenameValue}
                placeholder={t('libraryDetail.namePlaceholder')}
                style={styles.input}
              />
              <ActionButton title={t('libraryDetail.saveName')} variant="secondary" onPress={renameLibrary} loading={renaming} disabled={!library} />
            </AppCard>

            <AppCard style={styles.card}>
              <ActionButton title={t('libraryDetail.addRecipe')} onPress={() => navigation.navigate('AddUserRecipe', { libraryId })} />
              <ActionButton
                title={library?.enabled ? t('userLibraries.exclude') : t('userLibraries.include')}
                variant="secondary"
                onPress={toggleLibrary}
                disabled={!library}
              />
              <ActionButton title={t('libraryDetail.deleteThisLibrary')} variant="destructive" onPress={confirmDeleteLibrary} disabled={!library} />
            </AppCard>

            <AppCard style={styles.card}>
              <SectionHeader
                title={t('libraryDetail.bulkTitle')}
                detail={t('libraryDetail.bulkSummary', { selected: selectedCount, shown: filteredRecipes.length })}
              />
              <View style={styles.buttonRow}>
                <ActionButton
                  title={allVisibleSelected ? t('libraryDetail.clearVisibleSelection') : t('libraryDetail.selectVisible')}
                  variant="secondary"
                  onPress={toggleSelectVisibleRecipes}
                  disabled={filteredRecipes.length === 0 || bulkBusy}
                  style={styles.buttonCell}
                />
                <ActionButton
                  title={t('libraryDetail.clearSelection')}
                  variant="secondary"
                  onPress={() => setSelectedRecipeIds(new Set())}
                  disabled={selectedCount === 0 || bulkBusy}
                  style={styles.buttonCell}
                />
              </View>
              <View style={styles.buttonRow}>
                <ActionButton title={t('libraryDetail.enableSelected')} variant="secondary" onPress={() => void bulkSetEnabled(true)} disabled={selectedCount === 0 || bulkBusy} style={styles.buttonCell} />
                <ActionButton title={t('libraryDetail.disableSelected')} variant="secondary" onPress={() => void bulkSetEnabled(false)} disabled={selectedCount === 0 || bulkBusy} style={styles.buttonCell} />
              </View>
              <View style={styles.buttonRow}>
                <ActionButton title={t('libraryDetail.reindexSelected')} variant="secondary" onPress={() => void rebuildEmbeddings('selected')} loading={bulkBusy && selectedCount > 0} disabled={selectedCount === 0 || bulkBusy} style={styles.buttonCell} />
                <ActionButton title={t('libraryDetail.reindexAll')} variant="secondary" onPress={() => void rebuildEmbeddings('all')} loading={bulkBusy} disabled={recipes.length === 0 || bulkBusy} style={styles.buttonCell} />
              </View>
              <ActionButton title={t('libraryDetail.deleteSelected')} variant="destructive" onPress={confirmBulkDelete} disabled={selectedCount === 0 || bulkBusy} />
            </AppCard>

            <AppCard style={styles.card}>
              <SectionHeader title={t('libraryDetail.searchTitle')} />
              <AppTextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder={t('libraryDetail.searchPlaceholder')}
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
            </AppCard>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyStateCard}>
            <Text style={styles.emptyTitle}>{recipes.length === 0 ? t('libraryDetail.emptyNoRecipes') : t('libraryDetail.emptyNoMatches')}</Text>
            <Text style={styles.emptyText}>{recipes.length === 0 ? t('libraryDetail.emptyNoRecipesText') : t('libraryDetail.emptyNoMatchesText')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <AppCard style={[styles.card, styles.recipeCard, !item.enabled && styles.recipeCardDisabled]}>
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
                onPress={() => navigation.navigate('RecipeDetail', { recipeId: item.id, source: 'personal', libraryId })}
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
          </AppCard>
        )}
      />
      <AppConfirmModal
        visible={confirmDialog !== null}
        title={confirmDialog?.title ?? ''}
        message={confirmDialog?.message ?? ''}
        cancelLabel={t('common.cancel')}
        confirmLabel={t('common.delete')}
        toneLabel={t('common.confirmation')}
        tone="danger"
        onCancel={() => setConfirmDialog(null)}
        onConfirm={() => {
          const action = confirmDialog?.onConfirm;
          setConfirmDialog(null);
          void action?.();
        }}
      />
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
  const destructive = variant === 'destructive';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.localButton,
        secondary && styles.localButtonSecondary,
        destructive && styles.localButtonDestructive,
        inactive && styles.localButtonDisabled,
        pressed && !inactive && styles.localButtonPressed,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={secondary ? '#1B4332' : '#FFFFFF'} size="small" /> : null}
      <Text style={[styles.localButtonText, secondary && styles.localButtonTextSecondary]}>{title}</Text>
    </Pressable>
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
  return localizeError(error, t);
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 40,
    gap: spacing.lg,
    backgroundColor: '#FFFFFF',
  },
  header: {
    gap: spacing.lg,
  },
  pageIntro: {
    gap: 6,
  },
  pageTitle: {
    color: '#1A1A1A',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
  },
  pageSubtitle: {
    color: '#6B6B6B',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    padding: 16,
    shadowOpacity: 0,
    elevation: 0,
  },
  input: {
    height: 48,
    minHeight: 48,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    paddingHorizontal: 16,
  },
  emptyStateCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    padding: 20,
    gap: 6,
  },
  emptyTitle: {
    color: '#1A1A1A',
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 22,
  },
  emptyText: {
    color: '#6B6B6B',
    fontSize: 14,
    lineHeight: 20,
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
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  filterChip: {
    borderRadius: 10,
    borderColor: '#E5E5E5',
    borderWidth: 1,
    backgroundColor: '#F5F7F5',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: '#1B4332',
    borderColor: '#1B4332',
  },
  filterChipText: {
    color: '#1A1A1A',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  filterSummary: {
    color: colors.muted,
    fontWeight: '800',
  },
  recipeCard: {
    gap: spacing.sm,
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
    color: '#1B4332',
    backgroundColor: '#F5F7F5',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '600',
    overflow: 'hidden',
  },
  badgeColumn: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  selectChip: {
    borderRadius: 10,
    borderColor: '#E5E5E5',
    borderWidth: 1,
    backgroundColor: '#F5F7F5',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  selectChipActive: {
    backgroundColor: '#1B4332',
    borderColor: '#1B4332',
  },
  selectChipText: {
    color: '#1A1A1A',
    fontSize: 12,
    fontWeight: '600',
  },
  selectChipTextActive: {
    color: '#FFFFFF',
  },
  statusBadge: {
    color: '#FFFFFF',
    backgroundColor: '#1B4332',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '600',
    overflow: 'hidden',
  },
  statusBadgeOff: {
    color: '#6B6B6B',
    backgroundColor: '#F5F7F5',
  },
  indexBadge: {
    color: '#1A1A1A',
    backgroundColor: '#F5F7F5',
    borderColor: '#E5E5E5',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '600',
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
  localButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#1B4332',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  localButtonSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  localButtonDestructive: {
    backgroundColor: '#E07A5F',
  },
  localButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  localButtonTextSecondary: {
    color: '#1B4332',
  },
  localButtonDisabled: {
    opacity: 0.46,
  },
  localButtonPressed: {
    opacity: 0.88,
  },
});
