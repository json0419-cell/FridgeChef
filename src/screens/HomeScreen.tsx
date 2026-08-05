import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  Beef,
  BookOpen,
  Camera,
  ChefHat,
  ChevronRight,
  CookingPot,
  Egg,
  Salad,
  SlidersHorizontal,
  Soup,
} from 'lucide-react-native';
import { AppScaffold } from '../components/Foundation';
import { listInstalledDatasets } from '../datasets/datasetRegistry';
import { listRecipes } from '../db/recipesRepository';
import { listEnabledUserRecipesWithLibraries } from '../db/userRecipesRepository';
import { useIngredientInventory } from '../hooks/useIngredientInventory';
import { useI18n } from '../i18n/i18n';
import { getActiveEmbeddingModel } from '../rag/model/modelRegistry';
import { hasApiKey } from '../storage/settingsStorage';
import type { HomeStackScreenProps, Ingredient, InstalledDataset, InstalledEmbeddingModel, Recipe } from '../types';

type Props = HomeStackScreenProps<'Home'>;
type Language = ReturnType<typeof useI18n>['language'];

type RecommendationSetupState = {
  loading: boolean;
  geminiReady: boolean;
  recipeSourceReady: boolean;
  embeddingReady: boolean;
};

type ReadinessKind = 'loading' | 'inventoryError' | 'noIngredients' | 'geminiMissing' | 'recipeLibraryMissing' | 'embeddingUnavailable' | 'ready';
type ButtonVariant = 'primary' | 'secondary' | 'text';
type RecipeSource = 'official' | 'personal' | 'unknown';

type HomeRecipePreview = {
  id: string;
  title: string;
  sourceLabel: string | null;
  source: RecipeSource;
  recipeId?: string;
  libraryId?: string;
};

const HOME_COLORS = {
  background: '#FFFFFF',
  primary: '#1B4332',
  surface: '#F5F7F5',
  warmBlock: '#FEF3C7',
  accent: '#E07A5F',
  textPrimary: '#1A1A1A',
  textSecondary: '#6B6B6B',
  border: '#E5E5E5',
  white: '#FFFFFF',
  recipeGreen: '#D8F3DC',
  recipeOrange: '#FED7AA',
} as const;

const INITIAL_SETUP_STATE: RecommendationSetupState = {
  loading: true,
  geminiReady: false,
  recipeSourceReady: false,
  embeddingReady: false,
};

const INGREDIENT_PILL_LIMIT = 4;
const RECIPE_PREVIEW_LIMIT = 5;
const RECIPE_BLOCK_COLORS = [HOME_COLORS.warmBlock, HOME_COLORS.recipeGreen, HOME_COLORS.recipeOrange] as const;

export function HomeScreen({ navigation }: Props) {
  const { language, t } = useI18n();
  const copy = getHomeCopy(language);
  const { ingredients, loading, loadError, loadIngredients } = useIngredientInventory();
  const [homeStateLoaded, setHomeStateLoaded] = useState(false);
  const [setupState, setSetupState] = useState<RecommendationSetupState>(INITIAL_SETUP_STATE);
  const [recipePreviews, setRecipePreviews] = useState<HomeRecipePreview[]>([]);
  const [recipePreviewLoading, setRecipePreviewLoading] = useState(false);
  const [recipePreviewError, setRecipePreviewError] = useState<string | null>(null);

  const loadRecommendationSetup = useCallback(async (): Promise<RecommendationSetupState> => {
    const [geminiResult, datasetsResult, personalRecipesResult, modelResult] = await Promise.allSettled([
      hasApiKey('gemini'),
      listInstalledDatasets(),
      listEnabledUserRecipesWithLibraries(),
      getActiveEmbeddingModel(),
    ]);

    const datasets = resultValue<InstalledDataset[]>(datasetsResult, []);
    const personalRecipes = resultValue(personalRecipesResult, []);
    const model = resultValue<InstalledEmbeddingModel | null>(modelResult, null);

    return {
      loading: false,
      geminiReady: resultValue(geminiResult, false),
      recipeSourceReady: datasets.some((dataset) => dataset.active) || personalRecipes.length > 0,
      embeddingReady: Boolean(model),
    };
  }, []);

  const loadOfficialRecipePreviews = useCallback(async () => {
    const [datasets, recipes] = await Promise.all([listInstalledDatasets(), listRecipes()]);
    const enabledOfficialLibraries = datasets.filter((dataset) => dataset.active && dataset.status === 'installed');

    if (enabledOfficialLibraries.length === 0 || recipes.length === 0) {
      return [];
    }

    const sourceLabel = enabledOfficialLibraries.map((dataset) => dataset.name).join(' / ');
    return sampleRecipes(recipes, RECIPE_PREVIEW_LIMIT).map((recipe): HomeRecipePreview => ({
      id: `official:${recipe.id}`,
      title: recipe.title,
      sourceLabel: sourceLabel || null,
      source: 'official',
      recipeId: recipe.id,
    }));
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setSetupState((current) => ({ ...current, loading: true }));

      void Promise.all([loadIngredients(), loadRecommendationSetup()]).then(([, nextSetupState]) => {
        if (!active) {
          return;
        }

        setSetupState(nextSetupState);
        setHomeStateLoaded(true);
      });

      return () => {
        active = false;
      };
    }, [loadIngredients, loadRecommendationSetup]),
  );

  useEffect(() => {
    if (!homeStateLoaded || loading || Boolean(loadError)) {
      setRecipePreviews([]);
      setRecipePreviewLoading(false);
      setRecipePreviewError(null);
      return;
    }

    let active = true;
    setRecipePreviewLoading(true);
    setRecipePreviewError(null);

    void loadOfficialRecipePreviews()
      .then((previews) => {
        if (!active) {
          return;
        }

        setRecipePreviews(previews);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        setRecipePreviews([]);
        setRecipePreviewError(error instanceof Error ? error.message : String(error || copy.recipePreviewFailed));
      })
      .finally(() => {
        if (active) {
          setRecipePreviewLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [copy.recipePreviewFailed, homeStateLoaded, loadError, loadOfficialRecipePreviews, loading]);

  const pillIngredients = useMemo(() => {
    if (ingredients.length > INGREDIENT_PILL_LIMIT) {
      return ingredients.slice(0, INGREDIENT_PILL_LIMIT - 1);
    }

    return ingredients.slice(0, INGREDIENT_PILL_LIMIT);
  }, [ingredients]);

  const moreIngredientCount = Math.max(ingredients.length - pillIngredients.length, 0);
  const readiness = getReadinessKind({
    homeStateLoaded,
    inventoryLoading: loading,
    inventoryLoadError: loadError,
    ingredientCount: ingredients.length,
    setupState,
  });
  const hasIngredients = ingredients.length > 0;

  const openFridge = () => navigation.navigate('FridgeStack', { screen: 'Fridge' });
  const openManualAdd = () => navigation.navigate('FridgeStack', { screen: 'AddIngredient', params: { mode: 'manual' }, initial: false });
  const openPhotoScan = () => navigation.navigate('FridgeStack', { screen: 'AddIngredient', params: { mode: 'photo' }, initial: false });
  const openRecommendations = () => navigation.navigate('Recommendations');
  const openSettings = () => navigation.navigate('Settings');
  const openRecipeLibrary = () => navigation.navigate('RecipesStack', { screen: 'DatasetLibrary' });
  const openRecipePreview = (preview: HomeRecipePreview) => {
    if (preview.source === 'personal' && preview.recipeId && preview.libraryId) {
      navigation.navigate('RecipeDetail', { recipeId: preview.recipeId, source: 'personal', libraryId: preview.libraryId });
      return;
    }

    if (preview.source === 'official' && preview.recipeId) {
      navigation.navigate('RecipeDetail', { recipeId: preview.recipeId, source: 'official' });
      return;
    }

    openRecommendations();
  };

  const primaryAction = getPrimaryAction({
    ingredientCount: ingredients.length,
    copy,
    onAddIngredient: openManualAdd,
    onCook: openRecommendations,
  });

  return (
    <AppScaffold style={styles.scaffold} contentStyle={styles.scaffoldBody}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.pageTitle}>{copy.today}</Text>
          <Pressable accessibilityLabel={t('nav.settings')} accessibilityRole="button" onPress={openSettings} style={styles.settingsButton}>
            <SlidersHorizontal size={20} color={HOME_COLORS.textSecondary} strokeWidth={2} />
          </Pressable>
        </View>

        <View style={styles.fridgeSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.label}>{copy.yourFridge}</Text>
            <Pressable accessibilityRole="button" onPress={openFridge} style={styles.textLinkHitbox}>
              <Text style={styles.secondaryLink}>{copy.viewAll}</Text>
              <ChevronRight size={14} color={HOME_COLORS.textSecondary} strokeWidth={2} />
            </Pressable>
          </View>

          {pillIngredients.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillScroller}>
              {pillIngredients.map((ingredient) => (
                <IngredientPill key={ingredient.id} ingredient={ingredient} />
              ))}
              {moreIngredientCount > 0 ? <MorePill label={copy.moreIngredients(moreIngredientCount)} onPress={openFridge} /> : null}
            </ScrollView>
          ) : null}
        </View>

        <View style={styles.primaryActionWrap}>
          <ActionButton title={primaryAction.title} onPress={primaryAction.onPress} variant="primary" fullWidth />
        </View>

        <View style={styles.contentArea}>
          {renderHomeState({
            readiness,
            hasIngredients,
            recipePreviews,
            recipePreviewLoading,
            recipePreviewError,
            copy,
            loadError,
            onAddIngredient: primaryAction.onPress,
            onBrowseRecipes: openRecipeLibrary,
            onOpenRecommendations: openRecommendations,
            onOpenRecipePreview: openRecipePreview,
          })}
        </View>

        <ScanIngredientsRow available={setupState.geminiReady} copy={copy} onPress={setupState.geminiReady ? openPhotoScan : openSettings} />
      </ScrollView>
    </AppScaffold>
  );
}

function renderHomeState({
  readiness,
  hasIngredients,
  recipePreviews,
  recipePreviewLoading,
  recipePreviewError,
  copy,
  loadError,
  onAddIngredient,
  onBrowseRecipes,
  onOpenRecommendations,
  onOpenRecipePreview,
}: {
  readiness: ReadinessKind;
  hasIngredients: boolean;
  recipePreviews: HomeRecipePreview[];
  recipePreviewLoading: boolean;
  recipePreviewError: string | null;
  copy: HomeCopy;
  loadError: string | null;
  onAddIngredient: () => void;
  onBrowseRecipes: () => void;
  onOpenRecommendations: () => void;
  onOpenRecipePreview: (preview: HomeRecipePreview) => void;
}) {
  if (readiness === 'loading') {
    return <InlineStatus title={copy.loadingTitle} description={copy.loadingText} />;
  }

  if (readiness === 'inventoryError') {
    return <InlineStatus title={copy.inventoryErrorTitle} description={loadError ?? copy.inventoryErrorText} tone="danger" />;
  }

  if (readiness === 'ready') {
    return (
      <ReadyToCookSection
        copy={copy}
        recipePreviews={recipePreviews}
        recipePreviewLoading={recipePreviewLoading}
        recipePreviewError={recipePreviewError}
        onOpenRecommendations={onOpenRecommendations}
        onOpenRecipePreview={onOpenRecipePreview}
      />
    );
  }

  if (!hasIngredients) {
    return (
      <>
        <EmptyFridgeBlock copy={copy} onAddIngredient={onAddIngredient} />
        <InspirationSection
          copy={copy}
          recipePreviews={recipePreviews}
          recipePreviewLoading={recipePreviewLoading}
          recipePreviewError={recipePreviewError}
          onBrowseRecipes={onBrowseRecipes}
          onOpenRecipePreview={onOpenRecipePreview}
        />
      </>
    );
  }

  return (
    <InspirationSection
      copy={copy}
      recipePreviews={recipePreviews}
      recipePreviewLoading={recipePreviewLoading}
      recipePreviewError={recipePreviewError}
      onBrowseRecipes={onBrowseRecipes}
      onOpenRecipePreview={onOpenRecipePreview}
    />
  );
}

function EmptyFridgeBlock({ copy, onAddIngredient }: { copy: HomeCopy; onAddIngredient: () => void }) {
  return (
    <View style={styles.emptyBlock}>
      <View style={styles.emptyIconCircle}>
        <ChefHat size={32} color={HOME_COLORS.primary} strokeWidth={1.5} />
      </View>
      <Text style={styles.cardTitle}>{copy.emptyFridgeTitle}</Text>
      <Text style={styles.secondaryText}>{copy.emptyFridgeText}</Text>
      <Pressable accessibilityRole="button" onPress={onAddIngredient} style={styles.emptyAddHitbox}>
        <Text style={styles.textLink}>{copy.addFirstIngredient}</Text>
      </Pressable>
    </View>
  );
}

function InspirationSection({
  copy,
  recipePreviews,
  recipePreviewLoading,
  recipePreviewError,
  onBrowseRecipes,
  onOpenRecipePreview,
}: {
  copy: HomeCopy;
  recipePreviews: HomeRecipePreview[];
  recipePreviewLoading: boolean;
  recipePreviewError: string | null;
  onBrowseRecipes: () => void;
  onOpenRecipePreview: (preview: HomeRecipePreview) => void;
}) {
  return (
    <View style={styles.stateSection}>
      <Text style={styles.sectionTitle}>{copy.getInspired}</Text>
      {recipePreviewLoading ? <Text style={[styles.secondaryText, styles.sectionBodyText]}>{copy.loadingRecipes}</Text> : null}
      {!recipePreviewLoading && recipePreviews.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recipeScroller}>
          {recipePreviews.map((preview, index) => {
            const isLast = index === recipePreviews.length - 1;

            return (
              <RecipeMiniCard
                key={preview.id}
                preview={preview}
                color={RECIPE_BLOCK_COLORS[index % RECIPE_BLOCK_COLORS.length]}
                onPress={() => onOpenRecipePreview(preview)}
                style={isLast ? styles.recipeMiniCardLast : styles.recipeMiniCardSpacing}
              />
            );
          })}
        </ScrollView>
      ) : null}
      {!recipePreviewLoading && recipePreviews.length === 0 ? (
        recipePreviewError ? (
          <Text style={[styles.secondaryText, styles.sectionBodyText]}>{copy.recipePreviewFailed}</Text>
        ) : (
          <NoOfficialLibraryCard copy={copy} onBrowseRecipes={onBrowseRecipes} />
        )
      ) : null}
      <Pressable accessibilityRole="button" onPress={onBrowseRecipes} style={styles.findMoreLink}>
        <Text style={styles.secondaryTextLink}>{copy.findMoreRecipes}</Text>
        <ChevronRight size={14} color={HOME_COLORS.textSecondary} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

function NoOfficialLibraryCard({ copy, onBrowseRecipes }: { copy: HomeCopy; onBrowseRecipes: () => void }) {
  return (
    <View style={styles.noLibraryCard}>
      <BookOpen size={48} color={HOME_COLORS.textSecondary} strokeWidth={1.5} />
      <Text style={styles.noLibraryTitle}>{copy.noOfficialLibraryTitle}</Text>
      <Text style={styles.noLibraryText}>{copy.noOfficialLibraryText}</Text>
      <Pressable accessibilityRole="button" onPress={onBrowseRecipes} style={styles.noLibraryButton}>
        <Text style={styles.noLibraryButtonText}>{copy.goToRecipes}</Text>
      </Pressable>
    </View>
  );
}

function ReadyToCookSection({
  copy,
  recipePreviews,
  recipePreviewLoading,
  recipePreviewError,
  onOpenRecommendations,
  onOpenRecipePreview,
}: {
  copy: HomeCopy;
  recipePreviews: HomeRecipePreview[];
  recipePreviewLoading: boolean;
  recipePreviewError: string | null;
  onOpenRecommendations: () => void;
  onOpenRecipePreview: (preview: HomeRecipePreview) => void;
}) {
  const featured = recipePreviews[0] ?? null;
  const more = recipePreviews.slice(1, 4);

  return (
    <View style={styles.stateSection}>
      <Text style={styles.sectionTitle}>{copy.readyToCook}</Text>
      {recipePreviewLoading ? <Text style={[styles.secondaryText, styles.sectionBodyText]}>{copy.loadingRecipes}</Text> : null}
      {!recipePreviewLoading && featured ? (
        <>
          <FeaturedRecipeCard preview={featured} copy={copy} onPress={() => onOpenRecipePreview(featured)} onStart={onOpenRecommendations} />
          {more.length > 0 ? (
            <View style={styles.moreRecipeList}>
              {more.map((preview, index) => (
                <RecommendationRow key={preview.id} preview={preview} color={RECIPE_BLOCK_COLORS[(index + 1) % RECIPE_BLOCK_COLORS.length]} onPress={() => onOpenRecipePreview(preview)} />
              ))}
            </View>
          ) : null}
        </>
      ) : null}
      {!recipePreviewLoading && !featured ? (
        <View style={styles.readyFallback}>
          <Text style={styles.bodyText}>{recipePreviewError ? copy.recipePreviewFailed : copy.readyText}</Text>
          <ActionButton title={copy.generateIdeas} onPress={onOpenRecommendations} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
}

function IngredientPill({ ingredient }: { ingredient: Ingredient }) {
  return (
    <View style={styles.ingredientPill}>
      <Egg size={16} color={HOME_COLORS.primary} strokeWidth={2} />
      <Text numberOfLines={1} style={styles.pillText}>
        {ingredient.name} · {formatQuantity(ingredient.quantity)} {ingredient.unit}
      </Text>
    </View>
  );
}

function MorePill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.ingredientPill}>
      <Text style={styles.pillText}>{label}</Text>
    </Pressable>
  );
}

function RecipeMiniCard({ preview, color, onPress, style }: { preview: HomeRecipePreview; color: string; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const Icon = getRecipeIcon(preview.title);

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.recipeMiniCard, style]}>
      <View style={[styles.recipeMiniArt, { backgroundColor: color }]}>
        <Icon size={24} color={HOME_COLORS.primary} strokeWidth={1.5} />
      </View>
      <View style={styles.recipeMiniCopy}>
        <Text numberOfLines={2} style={styles.recipeMiniTitle}>
          {preview.title}
        </Text>
        {preview.sourceLabel ? (
          <Text numberOfLines={1} style={styles.recipeMiniMeta}>
            {preview.sourceLabel}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function FeaturedRecipeCard({ preview, copy, onPress, onStart }: { preview: HomeRecipePreview; copy: HomeCopy; onPress: () => void; onStart: () => void }) {
  const Icon = getRecipeIcon(preview.title);

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.featuredCard}>
      <View style={styles.featuredArt}>
        <Icon size={24} color={HOME_COLORS.primary} strokeWidth={1.5} />
      </View>
      <View style={styles.featuredCopy}>
        <Text numberOfLines={2} style={styles.featuredTitle}>
          {preview.title}
        </Text>
        {preview.sourceLabel ? (
          <Text numberOfLines={1} style={styles.featuredMeta}>
            {preview.sourceLabel}
          </Text>
        ) : null}
        <ActionButton title={copy.startCooking} onPress={onStart} variant="secondary" style={styles.featuredButton} />
      </View>
    </Pressable>
  );
}

function RecommendationRow({ preview, color, onPress }: { preview: HomeRecipePreview; color: string; onPress: () => void }) {
  const Icon = getRecipeIcon(preview.title);

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.recommendationRow}>
      <View style={[styles.rowRecipeIcon, { backgroundColor: color }]}>
        <Icon size={24} color={HOME_COLORS.primary} strokeWidth={1.5} />
      </View>
      <View style={styles.rowRecipeCopy}>
        <Text numberOfLines={1} style={styles.rowRecipeTitle}>
          {preview.title}
        </Text>
        {preview.sourceLabel ? (
          <Text numberOfLines={1} style={styles.rowRecipeMeta}>
            {preview.sourceLabel}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={20} color={HOME_COLORS.textSecondary} strokeWidth={2} />
    </Pressable>
  );
}

function ScanIngredientsRow({ available, copy, onPress }: { available: boolean; copy: HomeCopy; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.scanRow}>
      <Camera size={20} color={HOME_COLORS.textSecondary} strokeWidth={2} />
      <Text style={styles.scanRowTitle}>{copy.scanIngredients}</Text>
      <Text style={styles.scanRowStatus}>{available ? copy.available : copy.setup}</Text>
    </Pressable>
  );
}

function InlineStatus({ title, description, tone = 'neutral' }: { title: string; description: string; tone?: 'neutral' | 'danger' }) {
  return (
    <View style={styles.inlineStatus}>
      <Text style={[styles.cardTitle, tone === 'danger' && styles.dangerText]}>{title}</Text>
      <Text style={styles.secondaryText}>{description}</Text>
    </View>
  );
}

function ActionButton({
  title,
  onPress,
  variant = 'primary',
  fullWidth = false,
  style,
  textStyle,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const isPrimary = variant === 'primary';
  const isText = variant === 'text';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        isPrimary && styles.primaryButton,
        variant === 'secondary' && styles.secondaryButton,
        isText && styles.textButton,
        fullWidth && styles.fullWidth,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.actionButtonText, isPrimary && styles.primaryButtonText, variant === 'secondary' && styles.secondaryButtonText, isText && styles.textLink, textStyle]}>{title}</Text>
    </Pressable>
  );
}

function getRecipeIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes('egg') || n.includes('蛋')) return Egg;
  if (n.includes('beef') || n.includes('牛') || n.includes('肉')) return Beef;
  if (n.includes('soup') || n.includes('汤')) return Soup;
  if (n.includes('salad') || n.includes('沙拉')) return Salad;
  if (n.includes('noodle') || n.includes('面') || n.includes('pasta')) return CookingPot;
  return ChefHat;
}

function getReadinessKind({
  homeStateLoaded,
  inventoryLoading,
  inventoryLoadError,
  ingredientCount,
  setupState,
}: {
  homeStateLoaded: boolean;
  inventoryLoading: boolean;
  inventoryLoadError: string | null;
  ingredientCount: number;
  setupState: RecommendationSetupState;
}): ReadinessKind {
  if (!homeStateLoaded || inventoryLoading || setupState.loading) {
    return 'loading';
  }

  if (inventoryLoadError) {
    return 'inventoryError';
  }

  if (ingredientCount === 0) {
    return 'noIngredients';
  }

  if (!setupState.geminiReady) {
    return 'geminiMissing';
  }

  if (!setupState.recipeSourceReady) {
    return 'recipeLibraryMissing';
  }

  if (!setupState.embeddingReady) {
    return 'embeddingUnavailable';
  }

  return 'ready';
}

function getPrimaryAction({
  ingredientCount,
  copy,
  onAddIngredient,
  onCook,
}: {
  ingredientCount: number;
  copy: HomeCopy;
  onAddIngredient: () => void;
  onCook: () => void;
}) {
  if (ingredientCount === 0) {
    return { title: copy.addFirstIngredient, onPress: onAddIngredient };
  }

  return { title: copy.cookWithWhatIHave, onPress: onCook };
}

function resultValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

function formatQuantity(value: Ingredient['quantity']) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function sampleRecipes(recipes: Recipe[], limit: number) {
  return [...recipes]
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.max(0, limit));
}

type HomeCopy = ReturnType<typeof getHomeCopy>;

function getHomeCopy(language: Language) {
  if (language === 'en') {
    return {
      today: 'Today',
      yourFridge: 'YOUR FRIDGE',
      viewAll: 'View all',
      addFirstIngredient: 'Add your first ingredient',
      cookWithWhatIHave: 'Cook with what I have',
      emptyFridgeTitle: 'Your fridge is empty',
      emptyFridgeText: 'Add ingredients to get recipe ideas',
      getInspired: 'GET INSPIRED',
      findMoreRecipes: 'Browse recipe library',
      readyToCook: 'READY TO COOK',
      readyText: 'Your fridge can be matched with available recipes.',
      startCooking: 'Start cooking',
      generateIdeas: 'Generate new ideas',
      scanIngredients: 'Scan ingredients',
      setup: 'Setup',
      available: 'Available',
      loadingTitle: 'Loading fridge',
      loadingText: 'Checking your ingredients.',
      loadingRecipes: 'Loading real recipe ideas...',
      inventoryErrorTitle: 'Could not load fridge',
      inventoryErrorText: 'Try again from the Fridge tab.',
      noRealRecipePreviews: 'Enable a recipe library to show real recipe ideas here.',
      noOfficialLibraryTitle: 'No recipe library enabled',
      noOfficialLibraryText: 'Enable a recipe library to discover ideas',
      goToRecipes: 'Go to Recipes',
      recipePreviewFailed: 'Could not load recipe ideas.',
      moreIngredients: (count: number) => `+${count} more`,
    };
  }

  return {
    today: '今天',
    yourFridge: '你的冰箱',
    viewAll: '查看全部',
    addFirstIngredient: '添加第一种食材',
    cookWithWhatIHave: '用现有食材做饭',
    emptyFridgeTitle: '冰箱还空着',
    emptyFridgeText: '添加食材后就能获得菜谱灵感',
    getInspired: '获得灵感',
    findMoreRecipes: '浏览菜谱库',
    readyToCook: '可以开火了',
    readyText: '你的冰箱可以和可用菜谱进行匹配。',
    startCooking: '开始做',
    generateIdeas: '生成新想法',
    scanIngredients: '扫描食材',
    setup: '设置',
    available: '可用',
    loadingTitle: '正在读取冰箱',
    loadingText: '正在检查你的食材。',
    loadingRecipes: '正在读取真实菜谱灵感...',
    inventoryErrorTitle: '冰箱读取失败',
    inventoryErrorText: '可稍后从冰箱页重试。',
    noRealRecipePreviews: '启用菜谱库后会在这里显示真实菜谱灵感。',
    noOfficialLibraryTitle: '还没有启用菜谱库',
    noOfficialLibraryText: '启用官方菜谱库后即可发现灵感',
    goToRecipes: '前往菜谱',
    recipePreviewFailed: '菜谱灵感读取失败。',
    moreIngredients: (count: number) => `+${count} 更多`,
  };
}

const styles = StyleSheet.create({
  scaffold: {
    backgroundColor: HOME_COLORS.background,
    paddingHorizontal: 0,
  },
  scaffoldBody: {
    flex: 1,
    width: '100%',
    maxWidth: '100%',
  },
  scrollContent: {
    gap: 16,
    paddingBottom: 40,
  },
  header: {
    minHeight: 44,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageTitle: {
    color: HOME_COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
  },
  settingsButton: {
    width: 44,
    height: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  fridgeSection: {
    gap: 10,
  },
  sectionHeaderRow: {
    minHeight: 28,
    marginTop: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: {
    color: HOME_COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionTitle: {
    color: HOME_COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 22,
    letterSpacing: -0.3,
    marginHorizontal: 16,
  },
  cardTitle: {
    color: HOME_COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 21,
  },
  bodyText: {
    color: HOME_COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 23,
  },
  secondaryText: {
    color: HOME_COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
  secondaryLink: {
    color: HOME_COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
  textLink: {
    color: HOME_COLORS.primary,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  secondaryTextLink: {
    color: HOME_COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  textLinkHitbox: {
    minHeight: 44,
    paddingLeft: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  textLinkHitboxLeft: {
    minHeight: 44,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  findMoreLink: {
    minHeight: 44,
    marginTop: 12,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
  },
  pillScroller: {
    paddingHorizontal: 16,
    gap: 8,
  },
  ingredientPill: {
    height: 32,
    borderRadius: 20,
    backgroundColor: HOME_COLORS.surface,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    maxWidth: 210,
  },
  pillText: {
    color: HOME_COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
  },
  primaryActionWrap: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  actionButton: {
    minHeight: 40,
    borderRadius: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  primaryButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: HOME_COLORS.primary,
  },
  secondaryButton: {
    height: 40,
    borderRadius: 10,
    backgroundColor: HOME_COLORS.primary,
  },
  textButton: {
    minHeight: 44,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
  },
  fullWidth: {
    width: '100%',
    alignSelf: 'stretch',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 20,
  },
  primaryButtonText: {
    color: HOME_COLORS.white,
  },
  secondaryButtonText: {
    color: HOME_COLORS.white,
    fontSize: 14,
  },
  pressed: {
    opacity: 0.86,
  },
  contentArea: {
    gap: 18,
  },
  stateSection: {
    gap: 12,
  },
  sectionBodyText: {
    marginHorizontal: 16,
  },
  noLibraryCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: HOME_COLORS.border,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 12,
    alignItems: 'flex-start',
  },
  noLibraryTitle: {
    color: HOME_COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 21,
    marginTop: 12,
  },
  noLibraryText: {
    color: HOME_COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    marginTop: 4,
  },
  noLibraryButton: {
    height: 40,
    borderRadius: 10,
    backgroundColor: HOME_COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    alignSelf: 'flex-start',
    marginTop: 16,
  },
  noLibraryButtonText: {
    color: HOME_COLORS.white,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
  },
  emptyBlock: {
    minHeight: 152,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 28,
    paddingVertical: 18,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: HOME_COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  emptyAddHitbox: {
    minHeight: 44,
    justifyContent: 'center',
  },
  recipeScroller: {
    paddingLeft: 16,
  },
  recipeMiniCard: {
    width: 140,
    height: 160,
    borderRadius: 12,
    backgroundColor: HOME_COLORS.white,
    borderWidth: 1,
    borderColor: HOME_COLORS.border,
    overflow: 'hidden',
  },
  recipeMiniCardSpacing: {
    marginRight: 12,
  },
  recipeMiniCardLast: {
    marginRight: 16,
  },
  recipeMiniArt: {
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeMiniCopy: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  recipeMiniTitle: {
    color: HOME_COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  recipeMiniMeta: {
    color: HOME_COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '400',
    lineHeight: 15,
    marginTop: 4,
  },
  featuredCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    backgroundColor: HOME_COLORS.white,
    borderWidth: 1,
    borderColor: HOME_COLORS.border,
    overflow: 'hidden',
  },
  featuredArt: {
    height: 80,
    backgroundColor: HOME_COLORS.warmBlock,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredCopy: {
    padding: 14,
    gap: 8,
  },
  featuredTitle: {
    color: HOME_COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 25,
  },
  featuredMeta: {
    color: HOME_COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '400',
    lineHeight: 15,
    marginTop: 4,
  },
  featuredButton: {
    marginTop: 2,
  },
  moreRecipeList: {
    marginHorizontal: 16,
    gap: 0,
  },
  recommendationRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderColor: HOME_COLORS.border,
  },
  rowRecipeIcon: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowRecipeCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowRecipeTitle: {
    color: HOME_COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 21,
  },
  rowRecipeMeta: {
    color: HOME_COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '400',
    lineHeight: 15,
    marginTop: 4,
  },
  readyFallback: {
    marginHorizontal: 16,
    gap: 10,
  },
  inlineStatus: {
    paddingHorizontal: 16,
    gap: 4,
  },
  dangerText: {
    color: HOME_COLORS.accent,
  },
  scanRow: {
    minHeight: 48,
    marginHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: HOME_COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scanRowTitle: {
    flex: 1,
    color: HOME_COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 21,
  },
  scanRowStatus: {
    color: HOME_COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
});
