import { useCallback, useMemo, useState, type ComponentType } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { AlertTriangle, ChefHat, ChevronRight, Clock3, Refrigerator, Settings2, Sparkles } from 'lucide-react-native';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { listInstalledDatasets } from '../../../datasets/datasetRegistry';
import { listRecipes } from '../../../db/recipesRepository';
import { listEnabledUserRecipesWithLibraries } from '../../../db/userRecipesRepository';
import { useI18n } from '../../../i18n/i18n';
import { hasAiDataConsent } from '../../../privacy/ai-data-consent';
import { getActiveEmbeddingModel } from '../../../rag/model/modelRegistry';
import { radii, spacing, type AppColorTokens, useAppTheme } from '../../../shared/theme/theme';
import { loadRecommendationCache } from '../../../storage/recommendationCacheStorage';
import { hasApiKey } from '../../../storage/settingsStorage';
import type { HomeStackScreenProps, Ingredient, RefinedRagRecommendation } from '../../../types';
import { classifyRecommendationCache, type RecommendationCacheVisibility } from '../../recommendations/recommendation-cache-policy';
import { getRecommendationInputSnapshot } from '../../recommendations/recommendation-input';

type Props = HomeStackScreenProps<'Home'>;
type HomePrompt = 'setup' | 'fridge' | 'inventoryError' | null;

type HomeSnapshot = {
  cacheVisibility: RecommendationCacheVisibility;
  consentReady: boolean;
  error: string | null;
  ingredients: Ingredient[];
  keyReady: boolean;
  loading: boolean;
  modelReady: boolean;
  recommendations: RefinedRagRecommendation[];
  sourceReady: boolean;
};

const INITIAL_SNAPSHOT: HomeSnapshot = {
  cacheVisibility: 'hidden',
  consentReady: false,
  error: null,
  ingredients: [],
  keyReady: false,
  loading: true,
  modelReady: false,
  recommendations: [],
  sourceReady: false,
};

export function HomeScreen({ navigation }: Props) {
  const { language, t } = useI18n();
  const { colors } = useAppTheme();
  const { fontScale } = useWindowDimensions();
  const [snapshot, setSnapshot] = useState<HomeSnapshot>(INITIAL_SNAPSHOT);
  const [prompt, setPrompt] = useState<HomePrompt>(null);

  const loadSnapshot = useCallback(async () => {
    setSnapshot((current) => ({ ...current, error: null, loading: true }));
    const results = await Promise.allSettled([
      getRecommendationInputSnapshot(language),
      hasApiKey('gemini'),
      hasAiDataConsent(),
      listInstalledDatasets(),
      listEnabledUserRecipesWithLibraries(),
      getActiveEmbeddingModel(),
      listRecipes(),
      loadRecommendationCache(),
    ]);

    const [inputResult, keyResult, consentResult, datasetsResult, personalResult, modelResult, recipesResult, cacheResult] = results;
    const input = settledValue(inputResult, null);
    const datasets = settledValue(datasetsResult, []);
    const personalRecipes = settledValue(personalResult, []);
    const baseRecipes = settledValue(recipesResult, []);
    const cache = settledValue(cacheResult, null);
    const currentInputSignature = input?.inputSignature ?? '';
    const cacheVisibility = cache && currentInputSignature
      ? classifyRecommendationCache(cache, currentInputSignature, language)
      : 'hidden';

    setSnapshot({
      cacheVisibility,
      consentReady: settledValue(consentResult, false),
      error: firstRejectedMessage([inputResult]),
      ingredients: input?.ingredients ?? [],
      keyReady: settledValue(keyResult, false),
      loading: false,
      modelReady: Boolean(settledValue(modelResult, null)),
      recommendations: cacheVisibility === 'hidden' ? [] : cache?.refinedRecommendations.slice(0, 3) ?? [],
      sourceReady:
        datasets.some((dataset) => dataset.active && dataset.status === 'installed') ||
        personalRecipes.length > 0 ||
        baseRecipes.length > 0,
    });
  }, [language]);

  useFocusEffect(
    useCallback(() => {
      void loadSnapshot();
    }, [loadSnapshot]),
  );

  const missingSetup = useMemo(() => {
    const missing: string[] = [];
    if (!snapshot.keyReady) missing.push(t('home.missingApiKey'));
    if (!snapshot.consentReady) missing.push(t('home.missingConsent'));
    if (!snapshot.modelReady) missing.push(t('home.missingModel'));
    if (!snapshot.sourceReady) missing.push(t('home.missingSource'));
    return missing;
  }, [snapshot.consentReady, snapshot.keyReady, snapshot.modelReady, snapshot.sourceReady, t]);

  const hasRecommendations = snapshot.recommendations.length > 0;
  const setupReady = missingSetup.length === 0;
  const showPreviousLabel = hasRecommendations && (!setupReady || snapshot.cacheVisibility === 'stale');
  const stackCompactCards = fontScale >= 1.4;

  const openSettings = () => navigation.navigate('Settings');
  const openFridge = () => navigation.navigate('FridgeStack', { screen: 'Fridge' });
  const openDatasetLibrary = () => navigation.navigate('MyStack', { screen: 'DatasetLibrary' });

  const requestRecommendations = () => {
    if (snapshot.loading) return;
    if (snapshot.error) {
      setPrompt('inventoryError');
      return;
    }
    if (!setupReady) {
      setPrompt('setup');
      return;
    }
    if (snapshot.ingredients.length === 0) {
      setPrompt('fridge');
      return;
    }

    navigation.navigate('RecommendationsStack', {
      screen: 'Recommendations',
      params: { generationRequestId: createRequestId() },
    });
  };

  const openRecommendation = (recommendation: RefinedRagRecommendation) => {
    navigation.navigate('RecommendationsStack', {
      screen: 'Recommendations',
      params: { focusRecommendationId: recommendation.id },
    });
  };

  const closePrompt = () => setPrompt(null);
  const confirmPrompt = () => {
    const currentPrompt = prompt;
    closePrompt();
    if (currentPrompt === 'inventoryError') {
      void loadSnapshot();
      return;
    }
    if (currentPrompt === 'fridge') {
      openFridge();
      return;
    }
    if (currentPrompt === 'setup') {
      if (!snapshot.keyReady || !snapshot.consentReady) openSettings();
      else openDatasetLibrary();
    }
  };

  const promptCopy = getPromptCopy(prompt, missingSetup, t);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ gap: spacing.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 112 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View
            accessible
            accessibilityLabel={t('home.brandMark')}
            style={{ width: 44, height: 44, borderRadius: 15, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryMuted }}
          >
            <ChefHat color={colors.primary} size={23} strokeWidth={2.1} />
          </View>
          <IconButton colors={colors} icon={Settings2} label={t('nav.settings')} onPress={openSettings} />
        </View>

        <View style={{ alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.sm }}>
          {!hasRecommendations ? (
            <View style={{ width: 104, height: 104, borderRadius: 32, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
              <Sparkles color={colors.onPrimary} size={42} strokeWidth={1.7} />
            </View>
          ) : null}
          <View style={{ alignItems: 'center', gap: spacing.sm }}>
            <Text selectable style={{ color: colors.textPrimary, fontSize: 34, fontWeight: '900', letterSpacing: -1, lineHeight: 41, textAlign: 'center' }}>
              {t('home.title')}
            </Text>
            <Text selectable style={{ maxWidth: 360, color: colors.textSecondary, fontSize: 16, lineHeight: 23, textAlign: 'center' }}>
              {t('home.minimalSubtitle')}
            </Text>
          </View>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Pressable
            accessibilityHint={t('home.generateHint')}
            accessibilityLabel={hasRecommendations ? t('home.regenerate') : t('home.generate')}
            accessibilityRole="button"
            accessibilityState={{ busy: snapshot.loading, disabled: snapshot.loading }}
            disabled={snapshot.loading}
            onPress={requestRecommendations}
            style={({ pressed }) => ({
              minHeight: 62,
              borderRadius: radii.md,
              borderCurve: 'continuous',
              backgroundColor: pressed ? colors.primaryPressed : colors.primary,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              opacity: snapshot.loading ? 0.72 : 1,
            })}
          >
            {snapshot.loading ? <ActivityIndicator color={colors.onPrimary} /> : <Sparkles color={colors.onPrimary} size={22} strokeWidth={2} />}
            <Text style={{ flex: 1, color: colors.onPrimary, fontSize: 17, fontWeight: '800', lineHeight: 23 }}>
              {hasRecommendations ? t('home.regenerate') : t('home.generate')}
            </Text>
            <ChevronRight color={colors.onPrimary} size={21} strokeWidth={2.3} />
          </Pressable>
          <Text selectable style={{ color: colors.textTertiary, fontSize: 13, lineHeight: 18, textAlign: 'center' }}>
            {t('home.geminiUsageHint')}
          </Text>
          <Pressable
            accessibilityLabel={getFridgeButtonLabel(snapshot.ingredients.length, t)}
            accessibilityRole="button"
            onPress={openFridge}
            style={({ pressed }) => ({
              minHeight: 54,
              borderRadius: radii.md,
              borderCurve: 'continuous',
              borderWidth: 1,
              borderColor: colors.borderStrong,
              backgroundColor: pressed ? colors.surfacePressed : colors.surface,
              paddingHorizontal: spacing.lg,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.sm,
            })}
          >
            <Refrigerator color={colors.primary} size={21} strokeWidth={2} />
            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700', lineHeight: 21 }}>
              {getFridgeButtonLabel(snapshot.ingredients.length, t)}
            </Text>
          </Pressable>
        </View>

        {hasRecommendations ? (
          <View style={{ gap: spacing.md }}>
            <View style={{ minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
              <Text selectable style={{ flex: 1, color: colors.textPrimary, fontSize: 20, fontWeight: '900', lineHeight: 26 }}>
                {t('home.todayInspiration')}
              </Text>
              {showPreviousLabel ? (
                <View style={{ borderRadius: 999, backgroundColor: colors.accentMuted, paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Text selectable style={{ color: colors.warning, fontSize: 12, fontWeight: '800', lineHeight: 16 }}>
                    {snapshot.cacheVisibility === 'stale' ? t('home.mayNotMatch') : t('home.previousRecommendations')}
                  </Text>
                </View>
              ) : null}
            </View>

            <FeaturedRecommendationCard colors={colors} recommendation={snapshot.recommendations[0]} t={t} onPress={() => openRecommendation(snapshot.recommendations[0])} />

            {snapshot.recommendations.length > 1 ? (
              <View style={{ flexDirection: stackCompactCards ? 'column' : 'row', gap: spacing.md }}>
                {snapshot.recommendations.slice(1).map((recommendation) => (
                  <CompactRecommendationCard colors={colors} key={recommendation.id} recommendation={recommendation} t={t} onPress={() => openRecommendation(recommendation)} />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <HomePromptModal
        colors={colors}
        visible={Boolean(prompt && promptCopy)}
        title={promptCopy?.title ?? ''}
        message={promptCopy?.message ?? ''}
        cancelLabel={prompt === 'inventoryError' ? t('home.checkFridge') : t('common.cancel')}
        confirmLabel={promptCopy?.confirmLabel ?? ''}
        onCancel={() => {
          const shouldOpenFridge = prompt === 'inventoryError';
          closePrompt();
          if (shouldOpenFridge) openFridge();
        }}
        onConfirm={confirmPrompt}
      />
    </SafeAreaView>
  );
}

function FeaturedRecommendationCard({ colors, recommendation, t, onPress }: RecommendationCardProps) {
  const missingCount = recommendation.missingIngredients.length;

  return (
    <Pressable
      accessibilityHint={t('home.openRecommendationHint')}
      accessibilityLabel={recommendation.title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 228,
        borderRadius: radii.lg,
        borderCurve: 'continuous',
        backgroundColor: pressed ? colors.primaryPressed : colors.primary,
        padding: spacing.xl,
        gap: spacing.lg,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <View style={{ width: 58, height: 58, borderRadius: 18, borderCurve: 'continuous', backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
          <ChefHat color={colors.onPrimary} size={29} strokeWidth={1.8} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text selectable style={{ color: colors.onPrimary, fontSize: 24, fontWeight: '900', letterSpacing: -0.4, lineHeight: 30 }}>
            {recommendation.title}
          </Text>
          <Text selectable style={{ color: colors.onPrimary, opacity: 0.82, fontSize: 14, fontWeight: '700', lineHeight: 20 }}>
            {missingCount === 0 ? t('home.ingredientsReady') : t('home.ingredientsMissing', { count: missingCount })}
          </Text>
        </View>
        <ChevronRight color={colors.onPrimary} size={22} strokeWidth={2} />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <MetaPill colors={colors} icon={Clock3} label={formatMinutes(recommendation.estimatedTimeMinutes, t)} />
        <MetaPill colors={colors} icon={Sparkles} label={formatDifficulty(recommendation.difficulty, t)} />
      </View>

      <Text selectable numberOfLines={2} style={{ color: colors.onPrimary, opacity: 0.88, fontSize: 15, lineHeight: 22 }}>
        {recommendation.scoreReason}
      </Text>
    </Pressable>
  );
}

function CompactRecommendationCard({ colors, recommendation, t, onPress }: RecommendationCardProps) {
  const missingCount = recommendation.missingIngredients.length;

  return (
    <Pressable
      accessibilityHint={t('home.openRecommendationHint')}
      accessibilityLabel={recommendation.title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 132,
        borderRadius: radii.md,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.surfacePressed : colors.surface,
        padding: spacing.lg,
        gap: spacing.sm,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <View style={{ width: 38, height: 38, borderRadius: 13, borderCurve: 'continuous', backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' }}>
          <ChefHat color={colors.primary} size={19} strokeWidth={1.9} />
        </View>
        <ChevronRight color={colors.textTertiary} size={18} strokeWidth={2} />
      </View>
      <Text selectable numberOfLines={2} style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '800', lineHeight: 21 }}>
        {recommendation.title}
      </Text>
      <Text selectable style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
        {formatMinutes(recommendation.estimatedTimeMinutes, t)} · {missingCount === 0 ? t('home.ingredientsReady') : t('home.ingredientsMissing', { count: missingCount })}
      </Text>
    </Pressable>
  );
}

type RecommendationCardProps = {
  colors: AppColorTokens;
  recommendation: RefinedRagRecommendation;
  t: ReturnType<typeof useI18n>['t'];
  onPress: () => void;
};

function MetaPill({ colors, icon: Icon, label }: { colors: AppColorTokens; icon: ComponentType<{ color?: string; size?: number; strokeWidth?: number }>; label: string }) {
  return (
    <View style={{ minHeight: 34, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)', paddingHorizontal: 11, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon color={colors.onPrimary} size={15} strokeWidth={2} />
      <Text selectable style={{ color: colors.onPrimary, fontSize: 13, fontWeight: '700', lineHeight: 17 }}>{label}</Text>
    </View>
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

function HomePromptModal({ colors, visible, title, message, cancelLabel, confirmLabel, onCancel, onConfirm }: {
  colors: AppColorTokens;
  visible: boolean;
  title: string;
  message: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay, padding: spacing.lg, alignItems: 'center', justifyContent: 'center' }} onPress={onCancel}>
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={{ width: '100%', maxWidth: 420, borderRadius: radii.lg, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.xl, gap: spacing.lg }}
        >
          <View style={{ width: 48, height: 48, borderRadius: 16, borderCurve: 'continuous', backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle color={colors.warning} size={24} strokeWidth={2} />
          </View>
          <View style={{ gap: spacing.sm }}>
            <Text selectable accessibilityRole="header" style={{ color: colors.textPrimary, fontSize: 23, fontWeight: '900', lineHeight: 29 }}>{title}</Text>
            <Text selectable style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 22 }}>{message}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <ModalButton colors={colors} label={cancelLabel} onPress={onCancel} secondary />
            <ModalButton colors={colors} label={confirmLabel} onPress={onConfirm} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ModalButton({ colors, label, onPress, secondary = false }: { colors: AppColorTokens; label: string; onPress: () => void; secondary?: boolean }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 50,
        borderRadius: radii.md,
        borderCurve: 'continuous',
        borderWidth: secondary ? 1 : 0,
        borderColor: colors.borderStrong,
        backgroundColor: pressed ? (secondary ? colors.surfacePressed : colors.primaryPressed) : secondary ? colors.surface : colors.primary,
        paddingHorizontal: spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Text style={{ color: secondary ? colors.textPrimary : colors.onPrimary, fontSize: 15, fontWeight: '800', lineHeight: 20, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

function getPromptCopy(prompt: HomePrompt, missingSetup: string[], t: ReturnType<typeof useI18n>['t']) {
  if (prompt === 'setup') {
    return {
      title: t('home.setupRequiredTitle'),
      message: `${t('home.setupRequiredText')}\n\n${missingSetup.map((item) => `• ${item}`).join('\n')}`,
      confirmLabel: t('home.finishSetup'),
    };
  }
  if (prompt === 'fridge') {
    return { title: t('home.fridgeEmptyPromptTitle'), message: t('home.fridgeEmptyPromptText'), confirmLabel: t('home.goToFridge') };
  }
  if (prompt === 'inventoryError') {
    return { title: t('home.inventoryErrorPromptTitle'), message: t('home.inventoryErrorPromptText'), confirmLabel: t('common.retry') };
  }
  return null;
}

function getFridgeButtonLabel(count: number, t: ReturnType<typeof useI18n>['t']) {
  return count > 0 ? t('home.fridgeWithCount', { count }) : t('home.fridgeEmptyAction');
}

function formatMinutes(value: number | null, t: ReturnType<typeof useI18n>['t']) {
  return value ? t('recommendations.minutes', { value }) : t('recommendations.unknownMinutes');
}

function formatDifficulty(value: RefinedRagRecommendation['difficulty'], t: ReturnType<typeof useI18n>['t']) {
  if (value === '简单') return t('difficulty.easy');
  if (value === '中等') return t('difficulty.medium');
  if (value === '偏难') return t('difficulty.hard');
  return t('difficulty.unknown');
}

function createRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function settledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

function firstRejectedMessage(results: PromiseSettledResult<unknown>[]) {
  const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (!rejected) return null;
  return rejected.reason instanceof Error ? rejected.reason.message : String(rejected.reason || 'Unknown error');
}
