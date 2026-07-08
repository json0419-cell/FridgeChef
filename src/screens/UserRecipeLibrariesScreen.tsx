import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  createUserRecipeLibrary,
  deleteUserRecipeLibrary,
  listUserRecipeLibraries,
  listUserRecipes,
  setUserRecipeLibraryEnabled,
} from '../db/userRecipesRepository';
import { useI18n } from '../i18n/i18n';
import { colors, gradients, radii, shadows, spacing, typography } from '../styles/theme';
import type { RootStackParamList, UserRecipeLibrary } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'UserRecipeLibraries'>;

export function UserRecipeLibrariesScreen({ navigation }: Props) {
  const { t } = useI18n();
  const [libraries, setLibraries] = useState<UserRecipeLibrary[]>([]);
  const [recipeCount, setRecipeCount] = useState(0);
  const [newLibraryName, setNewLibraryName] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

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
      Alert.alert(t('userLibraries.nameRequired'));
      return;
    }

    setCreating(true);
    try {
      await createUserRecipeLibrary(name);
      setNewLibraryName('');
      await load();
    } catch (error) {
      Alert.alert(t('userLibraries.createFailed'), formatError(error, t));
    } finally {
      setCreating(false);
    }
  };

  const toggleLibrary = async (library: UserRecipeLibrary) => {
    await setUserRecipeLibraryEnabled(library.id, !library.enabled);
    await load();
  };

  const confirmDeleteLibrary = (library: UserRecipeLibrary) => {
    Alert.alert(t('userLibraries.deleteTitle'), t('userLibraries.deleteBody', { name: library.name, count: library.recipeCount }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteUserRecipeLibrary(library.id);
          await load();
        },
      },
    ]);
  };

  return (
    <Screen>
      <FlatList
        data={libraries}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
              <Text style={styles.eyebrow}>{t('userLibraries.eyebrow')}</Text>
              <Text style={styles.title}>{t('userLibraries.title')}</Text>
              <Text style={styles.subtitle}>{t('userLibraries.subtitle')}</Text>
              <View style={styles.heroStats}>
                <Stat value={String(libraries.length)} label={t('userLibraries.libraryStat')} />
                <Stat value={String(recipeCount)} label={t('userLibraries.recipeStat')} />
              </View>
            </LinearGradient>

            <View style={styles.createCard}>
              <Text style={styles.sectionTitle}>{t('userLibraries.createTitle')}</Text>
              <TextInput
                value={newLibraryName}
                onChangeText={setNewLibraryName}
                placeholder={t('userLibraries.placeholder')}
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
              <PrimaryButton title={t('userLibraries.create')} onPress={createLibrary} loading={creating} />
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t('userLibraries.emptyTitle')}</Text>
            <Text style={styles.emptyText}>{t('userLibraries.emptyText')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.libraryCard}>
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
              <PrimaryButton
                title={t('userLibraries.viewRecipes')}
                onPress={() => navigation.navigate('UserRecipeLibraryDetail', { libraryId: item.id })}
                style={styles.actionButton}
              />
              <PrimaryButton
                title={t('userLibraries.addRecipe')}
                variant="secondary"
                onPress={() => navigation.navigate('AddUserRecipe', { libraryId: item.id })}
                style={styles.actionButton}
              />
              <PrimaryButton
                title={item.enabled ? t('userLibraries.exclude') : t('userLibraries.include')}
                variant="secondary"
                onPress={() => toggleLibrary(item)}
                style={styles.actionButton}
              />
              <PrimaryButton
                title={t('userLibraries.deleteLibrary')}
                variant="danger"
                onPress={() => confirmDeleteLibrary(item)}
                style={styles.actionButton}
              />
            </View>
          </View>
        )}
      />
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function formatError(error: unknown, t: ReturnType<typeof useI18n>['t']) {
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
    gap: spacing.md,
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
  heroStats: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: spacing.md,
  },
  statValue: {
    color: colors.gold,
    fontSize: 24,
    fontWeight: '900',
    fontFamily: typography.display,
  },
  statLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '800',
  },
  createCard: {
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
    fontSize: 18,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  input: {
    minHeight: 54,
    borderRadius: radii.md,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
    fontFamily: typography.body,
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
  libraryCard: {
    backgroundColor: colors.ink,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
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
    color: colors.textInverse,
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
    color: colors.ink,
    backgroundColor: colors.gold,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    fontWeight: '900',
    overflow: 'hidden',
  },
  statusBadgeOff: {
    color: colors.textInverse,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  actionButton: {
    flexGrow: 1,
  },
});
