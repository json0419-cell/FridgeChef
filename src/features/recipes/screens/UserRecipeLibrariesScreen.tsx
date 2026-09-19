import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppCard, AppTextInput, SectionHeader } from '../../../shared/components/AppLayout';
import { AppConfirmModal } from '../../../shared/components/AppConfirmModal';
import { useFeedback } from '../../../shared/components/AppFeedbackProvider';
import {
  createUserRecipeLibrary,
  deleteUserRecipeLibrary,
  listUserRecipeLibraries,
  listUserRecipes,
  setUserRecipeLibraryEnabled,
} from '../../../db/userRecipesRepository';
import { useI18n } from '../../../i18n/i18n';
import { localizeError } from '../../../i18n/error-messages';
import { colors, spacing, typography } from '../../../shared/theme/theme';
import type { RecipesStackScreenProps, UserRecipeLibrary } from '../../../types';

type Props = RecipesStackScreenProps<'UserRecipeLibraries'>;
type ActionButtonVariant = 'primary' | 'secondary' | 'destructive';

export function UserRecipeLibrariesScreen({ navigation }: Props) {
  const { t } = useI18n();
  const { showFeedback } = useFeedback();
  const [libraries, setLibraries] = useState<UserRecipeLibrary[]>([]);
  const [recipeCount, setRecipeCount] = useState(0);
  const [newLibraryName, setNewLibraryName] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<UserRecipeLibrary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextLibraries, nextRecipes] = await Promise.all([listUserRecipeLibraries(), listUserRecipes()]);
      setLibraries(nextLibraries);
      setRecipeCount(nextRecipes.length);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const createLibrary = async () => {
    const name = newLibraryName.trim();
    if (!name) {
      showFeedback({ tone: 'error', title: t('userLibraries.nameRequired') });
      return;
    }

    setCreating(true);
    try {
      await createUserRecipeLibrary(name);
      setNewLibraryName('');
      await load();
    } catch (error) {
      showFeedback({ tone: 'error', title: t('userLibraries.createFailed'), message: formatError(error, t) });
    } finally {
      setCreating(false);
    }
  };

  const toggleLibrary = async (library: UserRecipeLibrary) => {
    await setUserRecipeLibraryEnabled(library.id, !library.enabled);
    await load();
  };

  const confirmDeleteLibrary = (library: UserRecipeLibrary) => {
    setPendingDeletion(library);
  };

  const runDeleteLibrary = async () => {
    const library = pendingDeletion;
    setPendingDeletion(null);
    if (!library) {
      return;
    }

    await deleteUserRecipeLibrary(library.id);
    await load();
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <FlatList
        data={libraries}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.pageIntro}>
              <Text style={styles.pageTitle}>{t('userLibraries.title')}</Text>
              <Text style={styles.pageSubtitle}>{t('userLibraries.subtitle')}</Text>
            </View>

            <AppCard style={styles.card}>
              <SectionHeader title={t('userLibraries.createTitle')} />
              <AppTextInput
                value={newLibraryName}
                onChangeText={setNewLibraryName}
                placeholder={t('userLibraries.placeholder')}
                style={styles.input}
              />
              <ActionButton title={t('userLibraries.create')} onPress={createLibrary} loading={creating} />
            </AppCard>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyStateCard}>
            <Text style={styles.emptyTitle}>{t('userLibraries.emptyTitle')}</Text>
            <Text style={styles.emptyText}>{t('userLibraries.emptyText')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <AppCard style={styles.libraryCard}>
            <View style={styles.cardHeader}>
              <View style={styles.flex}>
                <Text style={styles.libraryName}>{item.name}</Text>
                <Text style={styles.meta}>
                  {t('userLibraries.recipeCount', { count: item.recipeCount })} ·{' '}
                  {item.enabled ? t('userLibraries.enabledMeta') : t('userLibraries.disabledMeta')}
                </Text>
              </View>
              <Text style={[styles.statusBadge, !item.enabled && styles.statusBadgeOff]}>
                {item.enabled ? t('userLibraries.enabled') : t('userLibraries.disabled')}
              </Text>
            </View>
            <View style={styles.actions}>
              <ActionButton
                title={t('userLibraries.viewRecipes')}
                onPress={() => navigation.navigate('UserRecipeLibraryDetail', { libraryId: item.id })}
                style={styles.actionButton}
              />
              <ActionButton
                title={t('userLibraries.addRecipe')}
                variant="secondary"
                onPress={() => navigation.navigate('AddUserRecipe', { libraryId: item.id })}
                style={styles.actionButton}
              />
              <ActionButton
                title={item.enabled ? t('userLibraries.exclude') : t('userLibraries.include')}
                variant="secondary"
                onPress={() => toggleLibrary(item)}
                style={styles.actionButton}
              />
              <ActionButton
                title={t('userLibraries.deleteLibrary')}
                variant="destructive"
                onPress={() => confirmDeleteLibrary(item)}
                style={styles.actionButton}
              />
            </View>
          </AppCard>
        )}
      />
      <AppConfirmModal
        visible={pendingDeletion !== null}
        title={t('userLibraries.deleteTitle')}
        message={t('userLibraries.deleteBody', {
          name: pendingDeletion?.name ?? '',
          count: pendingDeletion?.recipeCount ?? 0,
        })}
        cancelLabel={t('common.cancel')}
        confirmLabel={t('common.delete')}
        toneLabel={t('common.confirmation')}
        tone="danger"
        onCancel={() => setPendingDeletion(null)}
        onConfirm={() => void runDeleteLibrary()}
      />
    </SafeAreaView>
  );
}

function ActionButton({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ActionButtonVariant;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const secondary = variant === 'secondary';
  const destructive = variant === 'destructive';

  return (
    <Pressable
      accessibilityRole="button"
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.localButton,
        secondary && styles.localButtonSecondary,
        destructive && styles.localButtonDestructive,
        loading && styles.localButtonDisabled,
        pressed && !loading && styles.localButtonPressed,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={secondary ? '#1B4332' : '#FFFFFF'} size="small" /> : null}
      <Text style={[styles.localButtonText, secondary && styles.localButtonTextSecondary]}>{title}</Text>
    </Pressable>
  );
}

function formatError(error: unknown, t: ReturnType<typeof useI18n>['t']) {
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
  libraryCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    padding: 16,
    gap: spacing.md,
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
  libraryName: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  meta: {
    color: colors.muted,
    lineHeight: 20,
    fontWeight: '700',
  },
  statusBadge: {
    color: '#1A1A1A',
    backgroundColor: '#FEF3C7',
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
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  actionButton: {
    flexGrow: 1,
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
