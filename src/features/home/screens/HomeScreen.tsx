import { useCallback, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  BookOpen,
  Camera,
  Check,
  ChefHat,
  ChevronRight,
  Circle,
  KeyRound,
  PackageCheck,
  Plus,
  Refrigerator,
  Settings2,
  Sparkles,
} from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { listInstalledDatasets } from '../../../datasets/datasetRegistry';
import { listRecipes } from '../../../db/recipesRepository';
import { listEnabledUserRecipesWithLibraries, type UserRecipeWithLibrary } from '../../../db/userRecipesRepository';
import { useI18n } from '../../../i18n/i18n';
import { hasAiDataConsent } from '../../../privacy/ai-data-consent';
import { getActiveEmbeddingModel } from '../../../rag/model/modelRegistry';
import { radii, spacing, type AppColorTokens, useAppTheme } from '../../../shared/theme/theme';
import { hasApiKey } from '../../../storage/settingsStorage';
import type { HomeStackScreenProps, Ingredient, InstalledDataset, InstalledEmbeddingModel, Recipe } from '../../../types';
import { useIngredientInventory } from '../../ingredients';

type Props = HomeStackScreenProps<'Home'>;

type HomeRecipePreview = {
  id: string;
  libraryId?: string;
  recipeId: string;
  source: 'base' | 'personal';
  sourceLabel?: string;
  title: string;
};

type HomeSnapshot = {
  consentReady: boolean;
  error: string | null;
  keyReady: boolean;
  loading: boolean;
  modelReady: boolean;
  previews: HomeRecipePreview[];
  sourceCount: number;
  sourceReady: boolean;
};

type ReadinessIssue = 'loading' | 'inventoryError' | 'ingredients' | 'gemini' | 'model' | 'source' | 'ready';

const INITIAL_SNAPSHOT: HomeSnapshot = {
  consentReady: false,
  error: null,
  keyReady: false,
  loading: true,
  modelReady: false,
  previews: [],
  sourceCount: 0,
  sourceReady: false,
};

const MAX_INGREDIENTS = 6;
const MAX_PREVIEWS = 3;

export function HomeScreen({ navigation }: Props) {
  const { t } = useI18n();
  const { colors } = useAppTheme();
  const { ingredients, loading: inventoryLoading, loadError, loadIngredients } = useIngredientInventory();
  const [snapshot, setSnapshot] = useState<HomeSnapshot>(INITIAL_SNAPSHOT);

  const loadSnapshot = useCallback(async () => {
    const [keyResult, consentResult, datasetsResult, personalResult, modelResult, recipesResult] = await Promise.allSettled([
      hasApiKey('gemini'),
      hasAiDataConsent(),
      listInstalledDatasets(),
      listEnabledUserRecipesWithLibraries(),
      getActiveEmbeddingModel(),
      listRecipes(),
    ]);

    const datasets = settledValue<InstalledDataset[]>(datasetsResult, []);
    const personalRecipes = settledValue<UserRecipeWithLibrary[]>(personalResult, []);
    const model = settledValue<InstalledEmbeddingModel | null>(modelResult, null);
    const baseRecipes = settledValue<Recipe[]>(recipesResult, []);
    const activeDatasets = datasets.filter((dataset) => dataset.active && dataset.status === 'installed');
    const enabledPersonalLibraryCount = new Set(personalRecipes.map((recipe) => recipe.libraryId)).size;

    return {
      consentReady: settledValue(consentResult, false),
      error: firstRejectedMessage([keyResult, consentResult, datasetsResult, personalResult, modelResult, recipesResult]),
      keyReady: settledValue(keyResult, false),
      loading: false,
      modelReady: Boolean(model),
      previews: buildPreviews(personalRecipes, baseRecipes),
      sourceCount: activeDatasets.length + enabledPersonalLibraryCount + (baseRecipes.length > 0 ? 1 : 0),
      sourceReady: activeDatasets.length > 0 || personalRecipes.length > 0 || baseRecipes.length > 0,
    } satisfies HomeSnapshot;
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setSnapshot((current) => ({ ...current, error: null, loading: true }));

      void Promise.all([loadIngredients(), loadSnapshot()]).then(([, nextSnapshot]) => {
        if (active) {
          setSnapshot(nextSnapshot);
        }
      });

      return () => {
        active = false;
      };
    }, [loadIngredients, loadSnapshot]),
  );

  const displayedIngredients = useMemo(() => ingredients.slice(0, MAX_INGREDIENTS), [ingredients]);
  const hiddenIngredientCount = Math.max(ingredients.length - displayedIngredients.length, 0);
  const readinessIssue = getReadinessIssue(snapshot, ingredients, inventoryLoading, loadError);
  const isGeminiReady = snapshot.keyReady && snapshot.consentReady;

  const openFridge = () => navigation.navigate('FridgeStack', { screen: 'Fridge' });
  const openManualAdd = () => navigation.navigate('FridgeStack', { screen: 'AddIngredient', params: { mode: 'manual' }, initial: false });
  const openPhotoScan = () => navigation.navigate('FridgeStack', { screen: 'AddIngredient', params: { mode: 'photo' }, initial: false });
  const openRecommendations = () => navigation.navigate('RecommendationsStack', { screen: 'Recommendations' });
  const openSettings = () => navigation.navigate('Settings');
  const openRecipeSources = () => navigation.navigate('MyStack', { screen: 'DatasetLibrary' });

  const primaryAction = getPrimaryAction(readinessIssue, {
    inventoryError: openFridge,
    ingredients: openManualAdd,
    gemini: openSettings,
    model: openRecipeSources,
    source: openRecipeSources,
    ready: openRecommendations,
  });
  const heroCopy = getHeroCopy(readinessIssue, t);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ gap: spacing.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 112 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text selectable style={{ color: colors.primary, fontSize: 13, fontWeight: '800', letterSpacing: 0.8, lineHeight: 18 }}>
              {t('home.eyebrow')}
            </Text>
            <Text selectable style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '700', lineHeight: 25 }}>
              {t('home.contextLine')}
            </Text>
          </View>
          <IconButton colors={colors} icon={Settings2} label={t('nav.settings')} onPress={openSettings} />
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text selectable style={{ color: colors.textPrimary, fontSize: 31, fontWeight: '800', letterSpacing: -0.8, lineHeight: 38 }}>
            {t('home.introTitle')}
          </Text>
          <Text selectable style={{ color: colors.textSecondary, fontSize: 16, lineHeight: 23 }}>
            {t('home.introText')}
          </Text>
        </View>

        <View
          style={{
            borderRadius: radii.lg,
            borderCurve: 'continuous',
            backgroundColor: colors.primary,
            padding: spacing.xl,
            gap: spacing.lg,
          }}
        >
          <View style={{ alignSelf: 'flex-start', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)', paddingHorizontal: 11, paddingVertical: 6 }}>
            <Text selectable style={{ color: colors.onPrimary, fontSize: 13, fontWeight: '700', lineHeight: 17 }}>
              {heroCopy.badge}
            </Text>
          </View>
          <View style={{ gap: spacing.sm }}>
            <Text selectable style={{ color: colors.onPrimary, fontSize: 25, fontWeight: '800', letterSpacing: -0.4, lineHeight: 31 }}>
              {heroCopy.title}
            </Text>
            <Text selectable style={{ color: colors.onPrimary, opacity: 0.82, fontSize: 15, lineHeight: 22 }}>
              {heroCopy.description}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={heroCopy.action}
            accessibilityRole="button"
            disabled={!primaryAction}
            onPress={primaryAction ?? undefined}
            style={({ pressed }) => ({
              minHeight: 52,
              borderRadius: radii.md,
              borderCurve: 'continuous',
              backgroundColor: pressed ? colors.surfacePressed : colors.surface,
              paddingHorizontal: spacing.lg,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: spacing.md,
              opacity: primaryAction ? 1 : 0.72,
            })}
          >
            <Text style={{ flex: 1, color: colors.primaryPressed, fontSize: 16, fontWeight: '800', lineHeight: 21 }}>{heroCopy.action}</Text>
            <ChevronRight color={colors.primaryPressed} size={20} strokeWidth={2.4} />
          </Pressable>
        </View>

        <Section title={t('home.quickActions')}>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <QuickAction
              colors={colors}
              description={t('home.manualEntryDetail')}
              icon={Plus}
              onPress={openManualAdd}
              title={t('home.manualEntry')}
            />
            <QuickAction
              colors={colors}
              description={isGeminiReady ? t('home.photoEntryDetail') : t('home.scanUnavailable')}
              icon={Camera}
              onPress={isGeminiReady ? openPhotoScan : openSettings}
              title={t('home.photoEntry')}
            />
          </View>
        </Section>

        <Section actionLabel={t('home.viewFridge')} onAction={openFridge} title={t('home.yourFridge')}>
          <View
            style={{
              minHeight: 124,
              borderRadius: radii.md,
              borderCurve: 'continuous',
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              padding: spacing.lg,
              gap: spacing.md,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View
                style={{ width: 44, height: 44, borderRadius: 14, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryMuted }}
              >
                <Refrigerator color={colors.primary} size={22} strokeWidth={2} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text selectable style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700', lineHeight: 22 }}>
                  {ingredients.length === 0
                    ? t('home.fridgePreviewEmpty')
                    : t(ingredients.length === 1 ? 'home.fridgePreviewCountOne' : 'home.fridgePreviewCount', { count: ingredients.length })}
                </Text>
                <Text selectable style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
                  {ingredients.length === 0 ? t('home.emptyText') : t('home.readyText')}
                </Text>
              </View>
            </View>
            {displayedIngredients.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {displayedIngredients.map((ingredient) => (
                  <IngredientChip colors={colors} ingredient={ingredient} key={ingredient.id} />
                ))}
                {hiddenIngredientCount > 0 ? (
                  <IngredientChip colors={colors} label={t('home.moreIngredients', { count: hiddenIngredientCount })} />
                ) : null}
              </View>
            ) : null}
          </View>
        </Section>

        <Section title={t('home.readinessTitle')}>
          <View
            style={{
              borderRadius: radii.md,
              borderCurve: 'continuous',
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              overflow: 'hidden',
            }}
          >
            <ReadinessRow colors={colors} complete={isGeminiReady} icon={KeyRound} label={t('home.statusGemini')} />
            <ReadinessRow colors={colors} complete={snapshot.modelReady} icon={PackageCheck} label={t('home.statusModel')} />
            <ReadinessRow colors={colors} complete={snapshot.sourceReady} icon={BookOpen} label={t('home.statusSource')} value={snapshot.sourceCount ? String(snapshot.sourceCount) : undefined} />
            <ReadinessRow colors={colors} complete={ingredients.length > 0} icon={Refrigerator} label={t('home.statusIngredients')} value={ingredients.length ? String(ingredients.length) : undefined} last />
          </View>
        </Section>

        <Section title={t('home.tonightIdeas')}>
          {snapshot.previews.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              {snapshot.previews.map((preview) => (
                <RecipePreviewRow
                  colors={colors}
                  key={preview.id}
                  onPress={() =>
                    navigation.navigate('RecipeDetail', {
                      recipeId: preview.recipeId,
                      source: preview.source === 'personal' ? 'personal' : 'official',
                      libraryId: preview.libraryId,
                    })
                  }
                  sourceLabel={preview.source === 'base' ? t('home.baseLibrary') : preview.sourceLabel ?? t('nav.userRecipeLibraries')}
                  title={preview.title}
                />
              ))}
            </View>
          ) : (
            <View style={{ borderRadius: radii.md, borderCurve: 'continuous', backgroundColor: colors.surfaceMuted, padding: spacing.xl, alignItems: 'center', gap: spacing.sm }}>
              <ChefHat color={colors.textTertiary} size={28} strokeWidth={1.8} />
              <Text selectable style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 22, textAlign: 'center' }}>
                {snapshot.error || loadError || t('home.noIdeas')}
              </Text>
            </View>
          )}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ actionLabel, children, onAction, title }: { actionLabel?: string; children: ReactNode; onAction?: () => void; title: string }) {
  const { colors } = useAppTheme();

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
        <Text selectable style={{ flex: 1, color: colors.textPrimary, fontSize: 19, fontWeight: '800', lineHeight: 24 }}>
          {title}
        </Text>
        {actionLabel && onAction ? (
          <Pressable accessibilityLabel={actionLabel} accessibilityRole="button" onPress={onAction} style={{ minHeight: 48, justifyContent: 'center', paddingLeft: spacing.md }}>
            <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '700' }}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function QuickAction({ colors, description, icon: Icon, onPress, title }: { colors: AppColorTokens; description: string; icon: ComponentType<{ color?: string; size?: number; strokeWidth?: number }>; onPress: () => void; title: string }) {
  return (
    <Pressable
      accessibilityHint={description}
      accessibilityLabel={title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 142,
        borderRadius: radii.md,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.surfacePressed : colors.surface,
        padding: spacing.lg,
        justifyContent: 'space-between',
        gap: spacing.md,
      })}
    >
      <View style={{ width: 42, height: 42, borderRadius: 14, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryMuted }}>
        <Icon color={colors.primary} size={21} strokeWidth={2.2} />
      </View>
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700', lineHeight: 21 }}>{title}</Text>
        <Text selectable style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
          {description}
        </Text>
      </View>
    </Pressable>
  );
}

function IconButton({ colors, icon: Icon, label, onPress }: { colors: AppColorTokens; icon: ComponentType<{ color?: string; size?: number; strokeWidth?: number }>; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        borderRadius: 16,
        borderCurve: 'continuous',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.surfacePressed : colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      })}
    >
      <Icon color={colors.textSecondary} size={21} strokeWidth={2} />
    </Pressable>
  );
}

function IngredientChip({ colors, ingredient, label }: { colors: AppColorTokens; ingredient?: Ingredient; label?: string }) {
  const text = label ?? (ingredient ? `${ingredient.name} · ${formatQuantity(ingredient.quantity)} ${ingredient.unit}` : '');

  return (
    <View style={{ minHeight: 36, maxWidth: '100%', borderRadius: 999, backgroundColor: colors.surfaceMuted, paddingHorizontal: 12, paddingVertical: 8, justifyContent: 'center' }}>
      <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600', lineHeight: 18 }}>
        {text}
      </Text>
    </View>
  );
}

function ReadinessRow({ colors, complete, icon: Icon, label, last = false, value }: { colors: AppColorTokens; complete: boolean; icon: ComponentType<{ color?: string; size?: number; strokeWidth?: number }>; label: string; last?: boolean; value?: string }) {
  return (
    <View style={{ minHeight: 58, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <Icon color={complete ? colors.success : colors.textTertiary} size={20} strokeWidth={2} />
      <Text selectable style={{ flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: '600', lineHeight: 21 }}>
        {label}
      </Text>
      {value ? <Text style={{ color: colors.textSecondary, fontSize: 14, fontVariant: ['tabular-nums'] }}>{value}</Text> : null}
      {complete ? <Check color={colors.success} size={18} strokeWidth={2.4} /> : <Circle color={colors.borderStrong} size={17} strokeWidth={2} />}
    </View>
  );
}

function RecipePreviewRow({ colors, onPress, sourceLabel, title }: { colors: AppColorTokens; onPress: () => void; sourceLabel: string; title: string }) {
  return (
    <Pressable
      accessibilityHint={sourceLabel}
      accessibilityLabel={title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 74,
        borderRadius: radii.md,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.surfacePressed : colors.surface,
        padding: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
      })}
    >
      <View style={{ width: 46, height: 46, borderRadius: 14, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentMuted }}>
        <Sparkles color={colors.accent} size={21} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={2} style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700', lineHeight: 21 }}>
          {title}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
          {sourceLabel}
        </Text>
      </View>
      <ChevronRight color={colors.textTertiary} size={20} strokeWidth={2} />
    </Pressable>
  );
}

function getReadinessIssue(snapshot: HomeSnapshot, ingredients: Ingredient[], inventoryLoading: boolean, inventoryError: string | null): ReadinessIssue {
  if (snapshot.loading || inventoryLoading) return 'loading';
  if (inventoryError) return 'inventoryError';
  if (ingredients.length === 0) return 'ingredients';
  if (!snapshot.keyReady || !snapshot.consentReady) return 'gemini';
  if (!snapshot.modelReady) return 'model';
  if (!snapshot.sourceReady) return 'source';
  return 'ready';
}

function getPrimaryAction(issue: ReadinessIssue, actions: Record<'inventoryError' | 'ingredients' | 'gemini' | 'model' | 'source' | 'ready', () => void>) {
  if (issue === 'loading') return null;
  return actions[issue];
}

function getHeroCopy(issue: ReadinessIssue, t: ReturnType<typeof useI18n>['t']) {
  if (issue === 'loading') {
    return { badge: t('home.loadingInventoryTitle'), title: t('home.loadingInventoryTitle'), description: t('home.loadingInventoryText'), action: t('home.loadingInventoryTitle') };
  }
  if (issue === 'inventoryError') {
    return { badge: t('home.inventoryLoadFailedTitle'), title: t('home.inventoryLoadFailedTitle'), description: t('home.inventoryLoadFailedText'), action: t('home.viewFridge') };
  }
  if (issue === 'ingredients') {
    return { badge: t('home.geminiMissingBadge'), title: t('home.noIngredientsTitle'), description: t('home.noIngredientsText'), action: t('home.manualEntry') };
  }
  if (issue === 'gemini') {
    return { badge: t('home.geminiMissingBadge'), title: t('home.geminiMissingTitle'), description: t('home.geminiMissingText'), action: t('home.setupGemini') };
  }
  if (issue === 'model') {
    return { badge: t('home.embeddingUnavailableBadge'), title: t('home.embeddingUnavailableTitle'), description: t('home.embeddingUnavailableText'), action: t('home.downloadModel') };
  }
  if (issue === 'source') {
    return { badge: t('home.recipeLibraryMissingBadge'), title: t('home.recipeLibraryMissingTitle'), description: t('home.recipeLibraryMissingText'), action: t('home.setupRecipeLibrary') };
  }
  return { badge: t('home.readyBadge'), title: t('home.readyTitle'), description: t('home.readyText'), action: t('home.findNextMeal') };
}

function buildPreviews(personalRecipes: UserRecipeWithLibrary[], baseRecipes: Recipe[]): HomeRecipePreview[] {
  const personal = personalRecipes.map((recipe) => ({
    id: `personal:${recipe.id}`,
    libraryId: recipe.libraryId,
    recipeId: recipe.id,
    source: 'personal' as const,
    sourceLabel: recipe.libraryName,
    title: recipe.title,
  }));
  const base = baseRecipes.map((recipe) => ({
    id: `base:${recipe.id}`,
    recipeId: recipe.id,
    source: 'base' as const,
    title: recipe.title,
  }));

  return [...personal, ...base].slice(0, MAX_PREVIEWS);
}

function settledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

function firstRejectedMessage(results: PromiseSettledResult<unknown>[]) {
  const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (!rejected) return null;
  return rejected.reason instanceof Error ? rejected.reason.message : String(rejected.reason || 'Unknown error');
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
