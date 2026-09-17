import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sparkles } from 'lucide-react-native';
import { fetchGeminiGenerateContent, readGeminiJsonResponse } from '../../../ai/geminiClient';
import { extractGeminiText } from '../../../ai/json';
import { getOfficialRecipeById } from '../../../db/recipesRepository';
import { getUserRecipeById } from '../../../db/userRecipesRepository';
import { useI18n } from '../../../i18n/i18n';
import { requestAiDataConsent } from '../../../privacy/request-ai-data-consent';
import { getApiKey, hasApiKey } from '../../../storage/settingsStorage';
import type { Recipe, RecipeDetailParams, RecipeDetailScreenProps, UserRecipe } from '../../../types';

type Props = RecipeDetailScreenProps;
type RecipeDetailSource = NonNullable<RecipeDetailParams['source']>;
type DisplayRecipe = Recipe | UserRecipe;
type ResolvedRecipe =
  | { source: 'official'; recipe: Recipe }
  | { source: 'personal'; recipe: UserRecipe };
type RecipeDetailState =
  | { status: 'loading' }
  | { status: 'found'; resolved: ResolvedRecipe }
  | { status: 'notFound'; source: RecipeDetailSource }
  | { status: 'error'; source: RecipeDetailSource; message: string };
type RefineState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; steps: string[] }
  | { status: 'error'; message: string };

const DETAIL_COLORS = {
  background: '#FFFFFF',
  primary: '#1B4332',
  textPrimary: '#1A1A1A',
  textSecondary: '#6B6B6B',
  border: '#E5E5E5',
  surface: '#F5F7F5',
  danger: '#E07A5F',
} as const;

export function RecipeDetailScreen({ route }: Props) {
  const { language } = useI18n();
  const copy = getRecipeDetailCopy(language);
  const [state, setState] = useState<RecipeDetailState>({ status: 'loading' });
  const [geminiReady, setGeminiReady] = useState(false);
  const [refineState, setRefineState] = useState<RefineState>({ status: 'idle' });

  useEffect(() => {
    let mounted = true;

    setState({ status: 'loading' });
    setRefineState({ status: 'idle' });

    void resolveRecipeDetail(route.params)
      .then((resolved) => {
        if (!mounted) {
          return;
        }

        setState(resolved ? { status: 'found', resolved } : { status: 'notFound', source: route.params.source ?? 'official' });
      })
      .catch((error) => {
        if (!mounted) {
          return;
        }

        setState({
          status: 'error',
          source: route.params.source ?? 'official',
          message: error instanceof Error ? error.message : copy.unknownError,
        });
      });

    return () => {
      mounted = false;
    };
  }, [copy.unknownError, route.params.libraryId, route.params.recipeId, route.params.source]);

  useEffect(() => {
    let mounted = true;

    setGeminiReady(false);
    void hasApiKey('gemini').then((ready) => {
      if (mounted) {
        setGeminiReady(ready);
      }
    });

    return () => {
      mounted = false;
    };
  }, [route.params.libraryId, route.params.recipeId, route.params.source]);

  const refineWithGemini = useCallback(async () => {
    if (state.status !== 'found' || refineState.status === 'loading') {
      return;
    }

    setRefineState({ status: 'loading' });

    try {
      const apiKey = await getApiKey('gemini');
      if (!apiKey) {
        setGeminiReady(false);
        setRefineState({ status: 'idle' });
        return;
      }

      if (!(await requestAiDataConsent(language))) {
        setRefineState({ status: 'idle' });
        return;
      }

      const steps = await refineRecipeStepsWithGemini(state.resolved.recipe, apiKey);
      setRefineState({ status: 'success', steps });
    } catch (error) {
      setRefineState({
        status: 'error',
        message: error instanceof Error ? error.message : copy.refineFailed,
      });
    }
  }, [copy.refineFailed, language, refineState.status, state]);

  if (state.status === 'loading') {
    return (
      <SafeAreaView edges={['bottom']} style={styles.screen}>
        <View style={styles.centerContent}>
          <ActivityIndicator color={DETAIL_COLORS.primary} />
          <Text style={styles.loadingText}>{copy.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (state.status === 'notFound') {
    return (
      <SafeAreaView edges={['bottom']} style={styles.screen}>
        <View style={styles.centerContent}>
          <Text style={styles.emptyTitle}>{state.source === 'personal' ? copy.personalNotFoundTitle : copy.officialNotFoundTitle}</Text>
          <Text style={styles.emptyText}>{state.source === 'personal' ? copy.personalNotFoundText : copy.officialNotFoundText}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (state.status === 'error') {
    return (
      <SafeAreaView edges={['bottom']} style={styles.screen}>
        <View style={styles.centerContent}>
          <Text style={styles.emptyTitle}>{state.source === 'personal' ? copy.personalLoadFailedTitle : copy.officialLoadFailedTitle}</Text>
          <Text style={styles.emptyText}>{state.message}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { recipe } = state.resolved;
  const displayedSteps = refineState.status === 'success' ? refineState.steps : recipe.steps;

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.titleBlock}>
          <Text style={styles.recipeTitle}>{recipe.title}</Text>
          {recipe.tags.length > 0 ? (
            <View style={styles.tags}>
              {recipe.tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {geminiReady ? (
          <Pressable
            accessibilityRole="button"
            disabled={refineState.status === 'loading'}
            onPress={refineWithGemini}
            style={({ pressed }) => [styles.refineButton, pressed && styles.pressed, refineState.status === 'loading' && styles.disabledButton]}
          >
            <Sparkles size={16} color={DETAIL_COLORS.primary} strokeWidth={2} />
            <Text style={styles.refineButtonText}>{copy.refineWithAi}</Text>
          </Pressable>
        ) : null}

        <IngredientListSection title={copy.mainIngredients} items={recipe.mainIngredients} emptyText={copy.noIngredients} />
        <IngredientListSection title={copy.seasonings} items={recipe.seasonings.length > 0 ? recipe.seasonings : [copy.noSeasonings]} />
        <StepsSection copy={copy} refineState={refineState} steps={displayedSteps.length > 0 ? displayedSteps : [copy.noSteps]} />
      </ScrollView>
    </SafeAreaView>
  );
}

async function resolveRecipeDetail(params: RecipeDetailParams): Promise<ResolvedRecipe | null> {
  const source = params.source ?? 'official';

  if (source === 'personal') {
    const recipe = await getUserRecipeById(params.recipeId);
    if (!recipe || (params.libraryId && recipe.libraryId !== params.libraryId)) {
      return null;
    }

    return { source, recipe };
  }

  const recipe = await getOfficialRecipeById(params.recipeId);
  return recipe ? { source, recipe } : null;
}

function IngredientListSection({ title, items, emptyText }: { title: string; items: string[]; emptyText?: string }) {
  const rows = items.length > 0 ? items : emptyText ? [emptyText] : [];

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.list}>
        {rows.map((item, index) => (
          <View key={`${index}_${item}`} style={[styles.ingredientRow, index === rows.length - 1 && styles.lastRow]}>
            <Text style={styles.ingredientText}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function StepsSection({ copy, refineState, steps }: { copy: RecipeDetailCopy; refineState: RefineState; steps: string[] }) {
  return (
    <View style={styles.section}>
      <View style={styles.stepsHeader}>
        <Text style={styles.sectionTitle}>{copy.steps}</Text>
        {refineState.status === 'success' ? (
          <View style={styles.refinedBadge}>
            <Sparkles size={12} color={DETAIL_COLORS.primary} strokeWidth={2} />
            <Text style={styles.refinedBadgeText}>{copy.refinedByGemini}</Text>
          </View>
        ) : null}
      </View>

      {refineState.status === 'loading' ? (
        <View style={styles.refineLoading}>
          <ActivityIndicator color={DETAIL_COLORS.primary} />
          <Text style={styles.refineLoadingText}>{copy.organizingSteps}</Text>
        </View>
      ) : (
        <View style={styles.stepsList}>
          {steps.map((step, index) => (
            <View key={`${index}_${step}`} style={styles.stepCard}>
              <Text style={styles.stepNumber}>{index + 1}</Text>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>
      )}

      {refineState.status === 'error' ? <Text style={styles.refineError}>{refineState.message}</Text> : null}
    </View>
  );
}

async function refineRecipeStepsWithGemini(recipe: DisplayRecipe, apiKey: string) {
  const response = await fetchGeminiGenerateContent(apiKey, {
      contents: [
        {
          parts: [{ text: buildStepRefinementPrompt(recipe) }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
      },
    });

  // The body is read through the shared reader so a rejection that echoes the key cannot reach
  // this screen's error text.
  const { data, providerErrorMessage } = await readGeminiJsonResponse(response, apiKey);
  if (!response.ok) {
    throw new Error(providerErrorMessage || `Gemini refinement failed (${response.status})`);
  }

  const steps = parseRefinedSteps(extractGeminiText(data));
  if (steps.length === 0) {
    throw new Error('Gemini did not return usable cooking steps.');
  }

  return steps;
}

function buildStepRefinementPrompt(recipe: DisplayRecipe) {
  return [
    'You are a cooking assistant. Given the following recipe, reorganize and clarify the cooking steps to make them easy to follow. Keep the original language. Do not add ingredients that are not in the original recipe. Format as numbered steps.',
    '',
    `Recipe: ${recipe.title}`,
    `Original steps: ${JSON.stringify(recipe.steps)}`,
  ].join('\n');
}

function parseRefinedSteps(raw: string) {
  const normalized = raw
    .trim()
    .replace(/^```(?:text|markdown)?/i, '')
    .replace(/```$/i, '')
    .trim();

  const numberedMatches = Array.from(
    normalized.matchAll(/(?:^|\n)\s*(?:\d+[\.)、]|第[一二三四五六七八九十百]+步[:：]?)\s*(.+?)(?=(?:\n\s*(?:\d+[\.)、]|第[一二三四五六七八九十百]+步[:：]?))|$)/gs),
  );

  if (numberedMatches.length > 0) {
    return numberedMatches.map((match) => cleanStepText(match[1])).filter(Boolean);
  }

  return normalized
    .split(/\r?\n/)
    .map(cleanStepText)
    .filter(Boolean);
}

function cleanStepText(value: string) {
  return value
    .replace(/^\s*(?:[-*]|\d+[\.)、]|第[一二三四五六七八九十百]+步[:：]?)\s*/, '')
    .trim();
}

type RecipeDetailCopy = ReturnType<typeof getRecipeDetailCopy>;

function getRecipeDetailCopy(language: string) {
  if (language === 'en') {
    return {
      loading: 'Loading recipe...',
      unknownError: 'Unknown error',
      officialNotFoundTitle: 'Recipe not found',
      officialNotFoundText: 'This official recipe could not be found.',
      personalNotFoundTitle: 'Personal recipe not found',
      personalNotFoundText: 'This saved recipe could not be found in the selected library.',
      officialLoadFailedTitle: 'Could not load recipe',
      personalLoadFailedTitle: 'Could not load personal recipe',
      mainIngredients: 'Main ingredients',
      seasonings: 'Seasonings',
      steps: 'Steps',
      noIngredients: 'No ingredients listed',
      noSeasonings: 'No seasonings',
      noSteps: 'No steps listed',
      refineWithAi: 'Refine steps with AI',
      organizingSteps: 'Organizing cooking steps...',
      refinedByGemini: 'Refined by Gemini',
      refineFailed: 'Could not refine steps with Gemini.',
    };
  }

  return {
    loading: '正在读取菜谱...',
    unknownError: '未知错误',
    officialNotFoundTitle: '未找到菜谱',
    officialNotFoundText: '未能找到这份官方菜谱。',
    personalNotFoundTitle: '未找到个人菜谱',
    personalNotFoundText: '未能在所选菜谱库中找到这份菜谱。',
    officialLoadFailedTitle: '菜谱读取失败',
    personalLoadFailedTitle: '个人菜谱读取失败',
    mainIngredients: '主食材',
    seasonings: '调料',
    steps: '步骤',
    noIngredients: '未列出食材',
    noSeasonings: '无调料',
    noSteps: '未列出步骤',
    refineWithAi: '用 AI 整理步骤',
    organizingSteps: '正在整理烹饪步骤...',
    refinedByGemini: 'Gemini 已整理',
    refineFailed: 'Gemini 步骤整理失败。',
  };
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: DETAIL_COLORS.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 24,
    backgroundColor: DETAIL_COLORS.background,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: DETAIL_COLORS.background,
  },
  loadingText: {
    color: DETAIL_COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '400',
    marginTop: 12,
  },
  emptyTitle: {
    color: DETAIL_COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
    textAlign: 'center',
  },
  emptyText: {
    color: DETAIL_COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  titleBlock: {
    gap: 12,
  },
  recipeTitle: {
    color: DETAIL_COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    minHeight: 30,
    borderRadius: 15,
    backgroundColor: DETAIL_COLORS.surface,
    borderWidth: 1,
    borderColor: DETAIL_COLORS.border,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagText: {
    color: DETAIL_COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  refineButton: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DETAIL_COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'flex-start',
  },
  refineButtonText: {
    color: DETAIL_COLORS.primary,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
  },
  disabledButton: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.84,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: DETAIL_COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 22,
  },
  list: {
    borderTopWidth: 1,
    borderColor: DETAIL_COLORS.border,
  },
  ingredientRow: {
    minHeight: 48,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderColor: DETAIL_COLORS.border,
  },
  lastRow: {
    borderBottomWidth: 1,
  },
  ingredientText: {
    color: DETAIL_COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 21,
  },
  stepsHeader: {
    gap: 8,
  },
  refinedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  refinedBadgeText: {
    color: DETAIL_COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '400',
    lineHeight: 14,
    marginLeft: 4,
  },
  refineLoading: {
    padding: 24,
    alignItems: 'center',
  },
  refineLoadingText: {
    marginTop: 12,
    fontSize: 14,
    color: DETAIL_COLORS.textSecondary,
    fontWeight: '400',
  },
  stepsList: {
    gap: 8,
  },
  stepCard: {
    borderWidth: 1,
    borderColor: DETAIL_COLORS.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    backgroundColor: DETAIL_COLORS.background,
    flexDirection: 'row',
    gap: 12,
  },
  stepNumber: {
    width: 24,
    color: DETAIL_COLORS.primary,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
  stepText: {
    flex: 1,
    color: DETAIL_COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
  },
  refineError: {
    color: DETAIL_COLORS.danger,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
});
