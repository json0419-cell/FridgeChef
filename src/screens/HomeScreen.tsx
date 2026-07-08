import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { deleteIngredient, listIngredients } from '../db/ingredientsRepository';
import { useI18n } from '../i18n/i18n';
import { colors, gradients, radii, shadows, spacing, typography } from '../styles/theme';
import type { Ingredient, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const { language, t } = useI18n();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(false);

  const loadIngredients = useCallback(async () => {
    setLoading(true);
    try {
      setIngredients(await listIngredients());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadIngredients();
    }, [loadIngredients]),
  );

  const confirmDelete = (ingredient: Ingredient) => {
    Alert.alert(t('home.deleteIngredientTitle'), t('home.deleteIngredientBody', { name: ingredient.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteIngredient(ingredient.id);
          await loadIngredients();
        },
      },
    ]);
  };

  return (
    <Screen>
      <FlatList
        data={ingredients}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={loadIngredients}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
              <View style={styles.heroTop}>
                <View>
                  <Text style={styles.eyebrow}>{t('home.eyebrow')}</Text>
                  <Text style={styles.title}>{t('home.title')}</Text>
                </View>
                <View style={styles.countPill}>
                  <Text style={styles.countNumber}>{ingredients.length}</Text>
                  <Text style={styles.countLabel}>{t('home.ingredientCount')}</Text>
                </View>
              </View>
              <Text style={styles.subtitle}>{t('home.subtitle')}</Text>
              <View style={styles.heroStats}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => navigation.navigate('AddIngredient', { mode: 'photo' })}
                  style={({ pressed }) => [styles.heroStat, pressed && styles.heroStatPressed]}
                >
                  <Text style={styles.heroStatValue}>{ingredients.filter((item) => item.source === 'photo').length}</Text>
                  <Text style={styles.heroStatLabel}>{t('home.aiRecognized')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => navigation.navigate('AddIngredient', { mode: 'manual' })}
                  style={({ pressed }) => [styles.heroStat, pressed && styles.heroStatPressed]}
                >
                  <Text style={styles.heroStatValue}>{ingredients.filter((item) => item.source === 'manual').length}</Text>
                  <Text style={styles.heroStatLabel}>{t('home.manualAdded')}</Text>
                </Pressable>
              </View>
            </LinearGradient>

            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate('Recommendations')}
              style={({ pressed }) => [styles.primaryAction, pressed && styles.tilePressed]}
            >
              <View style={styles.primaryActionText}>
                <Text style={styles.primaryActionEyebrow}>{t('home.primaryEyebrow')}</Text>
                <Text style={styles.primaryActionTitle}>{t('home.primaryTitle')}</Text>
                <Text style={styles.primaryActionDetail}>{t('home.primaryDetail')}</Text>
              </View>
              <View style={styles.primaryActionButton}>
                <Text style={styles.primaryActionButtonText}>{t('home.start')}</Text>
              </View>
            </Pressable>

            <View style={styles.quickSection}>
              <Text style={styles.sectionTitle}>{t('home.quickActions')}</Text>
              <View style={styles.actionGrid}>
                <ActionTile label={t('home.addIngredient')} detail={t('home.addIngredientDetail')} onPress={() => navigation.navigate('AddIngredient')} />
                <ActionTile label={t('home.recipeLibrary')} detail={t('home.recipeLibraryDetail')} onPress={() => navigation.navigate('DatasetLibrary')} />
                <ActionTile label={t('home.history')} detail={t('home.historyDetail')} onPress={() => navigation.navigate('History')} />
                <ActionTile label={t('home.settings')} detail={t('home.settingsDetail')} onPress={() => navigation.navigate('Settings')} />
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t('home.emptyTitle')}</Text>
            <Text style={styles.emptyText}>{t('home.emptyText')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.ingredientAvatar}>
              <Text style={styles.ingredientAvatarText}>{item.name.trim().slice(0, 1) || t('home.fallbackIngredientInitial')}</Text>
            </View>
            <View style={styles.cardBody}>
              <View style={styles.ingredientHeader}>
                <Text style={styles.ingredientName}>{item.name}</Text>
                <Text style={styles.sourceBadge}>{item.source === 'photo' ? t('home.sourceAi') : t('home.sourceManual')}</Text>
              </View>
              <Text style={styles.meta}>
                {formatQuantity(item.quantity)} {item.unit}
              </Text>
              <Text style={styles.date}>{formatDate(item.createdAt, language)}</Text>
            </View>
            <View style={styles.cardActions}>
              <Pressable
                accessibilityRole="button"
                style={styles.linkButton}
                onPress={() => navigation.navigate('AddIngredient', { ingredientId: item.id })}
              >
                <Text style={styles.linkText}>{t('common.edit')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={styles.linkButton} onPress={() => confirmDelete(item)}>
                <Text style={[styles.linkText, styles.deleteText]}>{t('common.delete')}</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </Screen>
  );
}

function ActionTile({
  label,
  detail,
  onPress,
}: {
  label: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileDetail}>{detail}</Text>
    </Pressable>
  );
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatDate(value: string, language: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(language === 'en' ? 'en-US' : 'zh-CN');
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.lg,
    marginBottom: spacing.xs,
  },
  hero: {
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    ...shadows.lift,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  eyebrow: {
    color: 'rgba(255, 255, 255, 0.62)',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.8,
    fontFamily: typography.strong,
  },
  title: {
    color: colors.textInverse,
    fontSize: 34,
    fontWeight: '900',
    fontFamily: typography.display,
    letterSpacing: 0.4,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.74)',
    fontSize: 15,
    lineHeight: 23,
    fontFamily: typography.body,
  },
  countPill: {
    minWidth: 82,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    padding: spacing.md,
    alignItems: 'center',
  },
  countNumber: {
    color: colors.textInverse,
    fontSize: 28,
    fontWeight: '900',
    fontFamily: typography.display,
  },
  countLabel: {
    color: 'rgba(255, 255, 255, 0.68)',
    fontSize: 12,
    fontWeight: '800',
  },
  heroStats: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  heroStat: {
    flex: 1,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    padding: spacing.md,
  },
  heroStatPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.88,
  },
  heroStatValue: {
    color: colors.sky,
    fontSize: 22,
    fontWeight: '900',
    fontFamily: typography.display,
  },
  heroStatLabel: {
    color: 'rgba(255, 255, 255, 0.66)',
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  primaryAction: {
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    ...shadows.card,
  },
  primaryActionText: {
    flex: 1,
    gap: spacing.xs,
  },
  primaryActionEyebrow: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    fontFamily: typography.strong,
  },
  primaryActionTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  primaryActionDetail: {
    color: colors.muted,
    lineHeight: 20,
    fontWeight: '700',
  },
  primaryActionButton: {
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  primaryActionButtonText: {
    color: colors.textInverse,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  quickSection: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  tile: {
    width: '48.5%',
    minHeight: 76,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    padding: spacing.md,
    justifyContent: 'space-between',
    ...shadows.card,
  },
  tilePressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  tileLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  tileDetail: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  empty: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    borderColor: colors.border,
    borderWidth: 1,
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
    fontFamily: typography.body,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderColor: colors.border,
    borderWidth: 1,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    ...shadows.card,
  },
  ingredientAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.chip,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: colors.border,
    borderWidth: 1,
  },
  ingredientAvatarText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  cardBody: {
    flex: 1,
    gap: spacing.xs,
  },
  ingredientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  ingredientName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  sourceBadge: {
    color: colors.primary,
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  meta: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    fontFamily: typography.display,
  },
  date: {
    color: colors.muted,
    fontSize: 13,
    fontFamily: typography.body,
  },
  cardActions: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  linkButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
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
