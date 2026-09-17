import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, ChevronDown, ChevronRight, Circle } from 'lucide-react-native';
import { AppCard, AppTextInput, SectionHeader } from '../../../shared/components/AppLayout';
import { useFeedback } from '../../../shared/components/AppFeedbackProvider';
import { Button as ActionButton, IngredientChip } from '../../../shared/components/Foundation';
import { getActionAccessibilityState } from '../../../shared/components/control-state';
import {
  RecommendationRefinerError,
  refineRagRecommendationsWithProvider,
} from '../../../ai/recommendationRefiner';
import { markRecipeCooked, normalizeRecipeId } from '../../../db/cookedHistoryRepository';
import { useI18n } from '../../../i18n/i18n';
import { requestAiDataConsent } from '../../../privacy/request-ai-data-consent';
import { downloadEmbeddingModelPack, type ModelDownloadProgress } from '../../../rag/model/modelPack';
import { getRagRecommendations, type RagResult } from '../../../rag/ragService';
import { loadRecommendationCache, saveRecommendationCache } from '../../../storage/recommendationCacheStorage';
import { loadRecommendationRequestTags, saveRecommendationRequestTags } from '../../../storage/recommendationTagStorage';
import { getApiKey, getSettings } from '../../../storage/settingsStorage';
import { radii, spacing, typography, useAppTheme, type AppColorTokens } from '../../../shared/theme/theme';
import { classifyRecommendationCache } from '../recommendation-cache-policy';
import {
  getRecommendationInputSnapshot,
  normalizeRecommendationSignatureText as normalizeSignatureText,
} from '../recommendation-input';
import { loadRecommendationReadiness } from '../recommendation-readiness';
import type { RecommendationReadiness } from '../recommendation-readiness-policy';
import type {
  AppSettings,
  RecommendationsStackScreenProps,
  RagRecommendation,
  RefinedRagRecommendation,
  UserRecipeDifficulty,
} from '../../../types';

type Props = RecommendationsStackScreenProps<'Recommendations'>;

type RecommendationListItem = { kind: 'refined'; recommendation: RefinedRagRecommendation };
type CachePresentation = 'current' | 'stale' | null;
type TFunction = ReturnType<typeof useI18n>['t'];
type RequestTagCategoryKey = 'cuisine' | 'meal' | 'dietary';
type RequestTagCategory = {
  key: RequestTagCategoryKey;
  title: string;
  tags: string[];
};

const RAG_SEARCH_CANDIDATES = 30;
const RAG_REFINE_CANDIDATES = 30;
const EMPTY_READINESS: RecommendationReadiness = {
  consentReady: false,
  credentialReady: false,
  modelReady: false,
  ready: false,
  sourceReady: false,
};
const REQUEST_TAGS_ZH = [
  '广东口味',
  '清淡少油',
  '适合小孩',
  '想喝汤',
  '快手菜',
  '高蛋白',
  '不要辣',
  '下饭菜',
  '家常菜',
  '一人食',
  '低碳水',
  '减脂餐',
  '暖胃',
  '蒸菜',
  '煲/炖',
  '早餐',
  '午餐便当',
  '晚餐',
  '素食',
  '少洗碗',
];
const REQUEST_TAGS_EN = [
  'Cantonese style',
  'Light and less oily',
  'Kid-friendly',
  'Soup or stew',
  'Quick meal',
  'High protein',
  'Not spicy',
  'Rice-friendly',
  'Home-style',
  'Solo meal',
  'Low carb',
  'Weight-loss meal',
  'Warming food',
  'Steamed dishes',
  'Braise or stew',
  'Breakfast',
  'Lunch box',
  'Dinner',
  'Vegetarian',
  'Less cleanup',
];

export function RecommendationsScreen({ navigation, route }: Props) {
  const { language, t } = useI18n();
  const { colors: appColors } = useAppTheme();
  const styles = useRecommendationStyles();
  const { showFeedback } = useFeedback();
  const insets = useSafeAreaInsets();
  const [refinedRecommendations, setRefinedRecommendations] = useState<RefinedRagRecommendation[]>([]);
  const [ragResult, setRagResult] = useState<RagResult | null>(null);
  const [refineMessage, setRefineMessage] = useState<string | null>(null);
  const [ingredientCount, setIngredientCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [modelDownloading, setModelDownloading] = useState(false);
  const [modelProgress, setModelProgress] = useState<ModelDownloadProgress | null>(null);
  const [readiness, setReadiness] = useState<RecommendationReadiness>(EMPTY_READINESS);
  const [readinessLoading, setReadinessLoading] = useState(true);
  const [cachePresentation, setCachePresentation] = useState<CachePresentation>(null);
  const [recommendationRequest, setRecommendationRequestState] = useState('');
  const [requestTags, setRequestTags] = useState(() => (language === 'en' ? REQUEST_TAGS_EN : REQUEST_TAGS_ZH));
  const [newRequestTag, setNewRequestTag] = useState('');
  const [highlightedRecommendationId, setHighlightedRecommendationId] = useState<string | null>(null);
  const [fixedRequestBarHeight, setFixedRequestBarHeight] = useState<number | null>(null);
  const [expandedRequestSections, setExpandedRequestSections] = useState<Record<RequestTagCategoryKey, boolean>>({
    cuisine: false,
    meal: false,
    dietary: false,
  });
  const loadingRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);
  const sentRagCandidateKeysRef = useRef<Set<string>>(new Set());
  const dismissedRecommendationKeysRef = useRef<Set<string>>(new Set());
  const cacheInputSignatureRef = useRef<string | null>(null);
  const recommendationRequestRef = useRef('');
  const activeRecommendationRequestRef = useRef('');
  const handledGenerationRequestRef = useRef<string | null>(null);
  const consumingGenerationRequestRef = useRef(false);
  const listRef = useRef<FlatList<RecommendationListItem>>(null);

  const setRecommendationRequest = (value: string) => {
    recommendationRequestRef.current = value;
    setRecommendationRequestState(value);
  };

  const getCurrentRecommendationRequest = useCallback(() => recommendationRequestRef.current.trim(), []);

  const refreshReadiness = useCallback(async () => {
    setReadinessLoading(true);
    try {
      const next = await loadRecommendationReadiness();
      setReadiness(next);
      return next;
    } catch {
      setReadiness(EMPTY_READINESS);
      return EMPTY_READINESS;
    } finally {
      setReadinessLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const defaultTags = language === 'en' ? REQUEST_TAGS_EN : REQUEST_TAGS_ZH;

    void loadRecommendationRequestTags(language, defaultTags).then((tags) => {
      if (!active) {
        return;
      }

      setRequestTags(tags);
      setRecommendationRequest('');
      setNewRequestTag('');
    });

    return () => {
      active = false;
    };
  }, [language]);

  const persistRecommendationCache = useCallback(
    (
      recommendations: RefinedRagRecommendation[],
      nextRagResult: RagResult | null,
      nextIngredientCount: number,
      nextInputSignature = cacheInputSignatureRef.current,
    ) => {
      if (!nextInputSignature) {
        return;
      }

      void saveRecommendationCache({
        refinedRecommendations: recommendations,
        ragResult: nextRagResult,
        ingredientCount: nextIngredientCount,
        sentCandidateKeys: Array.from(sentRagCandidateKeysRef.current),
        language,
        inputSignature: nextInputSignature,
      });
    },
    [language],
  );

  const hydrateFromCache = useCallback(async () => {
    const extraPreference = getCurrentRecommendationRequest();
    const [cache, snapshot] = await Promise.all([
      loadRecommendationCache(),
      getRecommendationInputSnapshot(language, extraPreference),
    ]);

    setIngredientCount(snapshot.ingredients.length);
    cacheInputSignatureRef.current = snapshot.inputSignature;

    const cacheVisibility = cache
      ? classifyRecommendationCache(cache, snapshot.inputSignature, language)
      : 'hidden';
    if (!cache || cacheVisibility === 'hidden') {
      setRefinedRecommendations([]);
      setRagResult(null);
      setCachePresentation(null);
      setRefineMessage(null);
      sentRagCandidateKeysRef.current = new Set();
      hasLoadedOnceRef.current = true;
      setHasLoadedOnce(true);
      return false;
    }

    setRefinedRecommendations(cache.refinedRecommendations);
    setRagResult(cache.ragResult);
    setIngredientCount(snapshot.ingredients.length);
    sentRagCandidateKeysRef.current = new Set(cache.sentCandidateKeys);
    cacheInputSignatureRef.current = snapshot.inputSignature;
    activeRecommendationRequestRef.current = extraPreference;
    hasLoadedOnceRef.current = true;
    setHasLoadedOnce(true);
    setCachePresentation(cacheVisibility === 'stale' ? 'stale' : 'current');
    setRefineMessage(null);
    return true;
  }, [getCurrentRecommendationRequest, language]);

  const refineCandidates = useCallback(
    async (input: Omit<Parameters<typeof refineRagRecommendationsWithProvider>[0], 'outputLanguage'>) => {
      if (!(await requestAiDataConsent(language))) {
        return null;
      }

      return refineRagRecommendationsWithProvider({
        ...input,
        outputLanguage: language,
      });
    },
    [language],
  );

  const loadRecommendations = useCallback(async () => {
    if (loadingRef.current) {
      return;
    }

    loadingRef.current = true;
    setLoading(true);
    setRefineMessage(null);

    try {
      const currentReadiness = await refreshReadiness();
      if (!currentReadiness.ready) {
        setRefineMessage(t('recommendations.completeSetupFirst'));
        return;
      }

      const extraPreference = getCurrentRecommendationRequest();
      const [apiKey, snapshot] = await Promise.all([
        getApiKey('gemini'),
        getRecommendationInputSnapshot(language, extraPreference),
      ]);
      const { ingredients, inputSignature, recentCookedRecipeIds, settings } = snapshot;
      if (!apiKey) {
        cacheInputSignatureRef.current = null;
        setIngredientCount(ingredients.length);
        setRefineMessage(t('recommendations.needGeminiKey'));
        return;
      }

      if (ingredients.length === 0) {
        setIngredientCount(0);
        setRefineMessage(t('recommendations.fridgeEmptyText'));
        return;
      }

      cacheInputSignatureRef.current = inputSignature;
      activeRecommendationRequestRef.current = extraPreference;
      setIngredientCount(ingredients.length);

      const rag = await getRagRecommendations(ingredients, RAG_SEARCH_CANDIDATES, extraPreference);
      setRagResult(rag);

      const allRagItems = rag.mode === 'rag' ? rag.recommendations : [];
      const ragItems = allRagItems
        .filter((item) => !isRecentlyCookedRagItem(item, recentCookedRecipeIds))
        .filter((item) => matchesRecommendationSettings(item, settings))
        .slice(0, RAG_REFINE_CANDIDATES);
      const hiddenRagCount = allRagItems.length - ragItems.length;

      if (recentCookedRecipeIds.size > 0) {
        console.info(
          t('recommendations.avoidedHistory', {
            days: settings.recentHistoryDays,
            count: recentCookedRecipeIds.size,
            extra: hiddenRagCount > 0 ? t('recommendations.hiddenCandidates', { count: hiddenRagCount }) : '',
          }),
        );
      }

      if (rag.mode === 'unavailable') {
        return;
      }

      if (ragItems.length === 0) {
        setRefinedRecommendations([]);
        setRefineMessage(t('recommendations.noCandidates'));
        return;
      }

      try {
        const refined = await refineCandidates({
          apiKey,
          ingredients,
          settings,
          recommendations: ragItems,
          extraPreference,
        });
        if (!refined) {
          setRefineMessage(t('recommendations.aiConsentRequired'));
          return;
        }
        sentRagCandidateKeysRef.current = new Set(ragItems.map(getRagCandidateKey).filter(Boolean));
        setCachePresentation(null);
        setRefinedRecommendations(refined);
        persistRecommendationCache(refined, rag, ingredients.length, inputSignature);
        setRefineMessage(
          refined.length > 0
            ? t('recommendations.ready')
            : t('recommendations.allFiltered'),
        );
      } catch (error) {
        console.warn('Gemini recommendation refinement failed');
        const message = formatGeminiRecommendationError(error, t);
        setRefineMessage(message);
      }
    } catch (error) {
      setRefineMessage(t('recommendations.refreshFailed', { message: formatError(error, t) }));
    } finally {
      loadingRef.current = false;
      setLoading(false);
      hasLoadedOnceRef.current = true;
      setHasLoadedOnce(true);
    }
  }, [getCurrentRecommendationRequest, language, persistRecommendationCache, refineCandidates, refreshReadiness, t]);

  const refreshRecommendations = useCallback(async () => {
    sentRagCandidateKeysRef.current = new Set();
    dismissedRecommendationKeysRef.current = new Set();
    await loadRecommendations();
  }, [loadRecommendations]);

  const loadMoreRecommendations = useCallback(async ({ replace = false, silent = false }: { replace?: boolean; silent?: boolean } = {}) => {
    if (loadingRef.current || loadingMoreRef.current) {
      return;
    }

    loadingMoreRef.current = true;
    setLoadingMore(true);
    setRefineMessage(null);

    try {
      const currentReadiness = await refreshReadiness();
      if (!currentReadiness.ready) {
        if (!silent) {
          setRefineMessage(t('recommendations.completeSetupFirst'));
        }
        return;
      }

      const extraPreference = getCurrentRecommendationRequest();
      const requestChanged = normalizeSignatureText(extraPreference) !== normalizeSignatureText(activeRecommendationRequestRef.current);
      const [apiKey, snapshot] = await Promise.all([
        getApiKey('gemini'),
        getRecommendationInputSnapshot(language, extraPreference),
      ]);
      const { ingredients, inputSignature, recentCookedRecipeIds, settings } = snapshot;
      if (!apiKey) {
        setIngredientCount(ingredients.length);
        if (!silent) {
          setRefineMessage(t('recommendations.needGeminiKey'));
          showFeedback({ tone: 'error', title: t('recommendations.emptyTitle'), message: t('recommendations.needGeminiKey') });
        }
        return;
      }

      if (ingredients.length === 0) {
        setIngredientCount(0);
        if (!silent) {
          setRefineMessage(t('recommendations.fridgeEmptyText'));
          showFeedback({ tone: 'info', title: t('recommendations.fridgeEmptyTitle'), message: t('recommendations.fridgeEmptyText') });
        }
        return;
      }

      cacheInputSignatureRef.current = inputSignature;
      activeRecommendationRequestRef.current = extraPreference;
      setIngredientCount(ingredients.length);
      if (requestChanged) {
        sentRagCandidateKeysRef.current = new Set();
        dismissedRecommendationKeysRef.current = new Set();
        setCachePresentation(null);
        setRefinedRecommendations([]);
      }

      const requestedCandidateCount = Math.max(
        RAG_SEARCH_CANDIDATES,
        sentRagCandidateKeysRef.current.size + RAG_REFINE_CANDIDATES,
      );
      const rag = await getRagRecommendations(ingredients, requestedCandidateCount, extraPreference);
      setRagResult(rag);

      if (rag.mode === 'unavailable') {
        if (!silent) {
          const message = formatRagUnavailableMessage(rag, t);
          setRefineMessage(message);
          showFeedback({ tone: 'error', title: t('recommendations.ragUnavailable'), message });
        }
        return;
      }

      const alreadySent = requestChanged ? new Set<string>() : sentRagCandidateKeysRef.current;
      const ragItems = rag.recommendations
        .filter((item) => !alreadySent.has(getRagCandidateKey(item)))
        .filter((item) => !isRecentlyCookedRagItem(item, recentCookedRecipeIds))
        .filter((item) => matchesRecommendationSettings(item, settings))
        .slice(0, RAG_REFINE_CANDIDATES);

      if (ragItems.length === 0) {
        if (!silent) {
          setRefineMessage(t('recommendations.noMore'));
          showFeedback({ tone: 'info', title: t('recommendations.noMore') });
        }
        return;
      }

      try {
        const refined = await refineCandidates({
          apiKey,
          ingredients,
          settings,
          recommendations: ragItems,
          extraPreference,
        });
        if (!refined) {
          if (!silent) {
            setRefineMessage(t('recommendations.aiConsentRequired'));
          }
          return;
        }
        const sentKeys = new Set(sentRagCandidateKeysRef.current);
        for (const item of ragItems) {
          const key = getRagCandidateKey(item);
          if (key) {
            sentKeys.add(key);
          }
        }
        sentRagCandidateKeysRef.current = sentKeys;

        const existingRecommendations = replace || requestChanged ? [] : refinedRecommendations;
        const refinedToAppend = dedupeRefinedRecommendations(refined, existingRecommendations).filter(
          (item) => !dismissedRecommendationKeysRef.current.has(getRefinedRecommendationKey(item)),
        );
        if (refinedToAppend.length === 0) {
          if (!silent) {
            setRefineMessage(t('recommendations.noNew'));
            showFeedback({ tone: 'info', title: t('recommendations.noNew') });
          }
          return;
        }

        if (replace || requestChanged) {
          setCachePresentation(null);
        }
        setRefinedRecommendations((current) => {
          const next = replace || requestChanged ? refinedToAppend : [...current, ...refinedToAppend];
          persistRecommendationCache(next, rag, ingredients.length, inputSignature);
          return next;
        });
        if (!silent) {
          setRefineMessage(refinedToAppend.length === 1 ? t('recommendations.loadedMoreOne', { count: 1 }) : t('recommendations.loadedMore', { count: refinedToAppend.length }));
        }
      } catch (error) {
        console.warn('Gemini recommendation load-more failed');
        if (!silent) {
          const message = formatGeminiRecommendationError(error, t);
          setRefineMessage(message);
          showFeedback({ tone: 'error', title: t('recommendations.geminiFailed'), message });
        }
      }
    } catch (error) {
      if (!silent) {
        const message = t('recommendations.loadMoreFailed', { message: formatError(error, t) });
        setRefineMessage(message);
        showFeedback({ tone: 'error', title: t('recommendations.geminiFailed'), message });
      }
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [getCurrentRecommendationRequest, language, persistRecommendationCache, refineCandidates, refinedRecommendations, refreshReadiness, showFeedback, t]);

  const changeBatch = useCallback(async () => {
    if (loading || loadingMore) {
      return;
    }

    setRefineMessage(null);
    await loadMoreRecommendations({ replace: true });
  }, [loadMoreRecommendations, loading, loadingMore]);

  const applyRecommendationRequest = useCallback(async () => {
    if (loading || loadingMore) {
      return;
    }

    await refreshRecommendations();
  }, [loading, loadingMore, refreshRecommendations]);

  const clearRecommendationRequest = useCallback(() => {
    setRecommendationRequest('');
  }, []);

  const toggleRecommendationRequestTag = useCallback((tag: string) => {
    const current = recommendationRequestRef.current;
    const selectedTags = parseRecommendationRequestTags(current);
    if (isRequestTagSelected(current, tag)) {
      setRecommendationRequest(buildRecommendationRequest(selectedTags.filter((item) => !sameRequestTag(item, tag)), language));
      return;
    }

    setRecommendationRequest(buildRecommendationRequest([...selectedTags, tag], language));
  }, [language]);

  const toggleRequestSection = useCallback((section: RequestTagCategoryKey) => {
    setExpandedRequestSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }, []);

  const addRecommendationRequestTag = useCallback(async () => {
    const tag = normalizeRequestTag(newRequestTag);
    if (!tag) {
      showFeedback({ tone: 'info', title: t('recommendations.tagRequired') });
      return;
    }

    if (requestTags.some((item) => sameRequestTag(item, tag))) {
      showFeedback({ tone: 'info', title: t('recommendations.tagDuplicate') });
      return;
    }

    const nextTags = [tag, ...requestTags];
    setRequestTags(nextTags);
    setNewRequestTag('');
    setRecommendationRequest(buildRecommendationRequest([...parseRecommendationRequestTags(recommendationRequestRef.current), tag], language));
    await saveRecommendationRequestTags(language, nextTags);
  }, [language, newRequestTag, requestTags, showFeedback, t]);

  const deleteRecommendationRequestTag = useCallback(async (tag: string) => {
    const nextTags = requestTags.filter((item) => !sameRequestTag(item, tag));
    setRequestTags(nextTags);
    setRecommendationRequest(
      buildRecommendationRequest(
        parseRecommendationRequestTags(recommendationRequestRef.current).filter((item) => !sameRequestTag(item, tag)),
        language,
      ),
    );
    await saveRecommendationRequestTags(language, nextTags);
  }, [language, requestTags]);

  const dismissRecommendation = useCallback(
    (recommendation: RefinedRagRecommendation) => {
      const key = getRefinedRecommendationKey(recommendation) || recommendation.id;
      dismissedRecommendationKeysRef.current.add(key);
      setRefinedRecommendations((current) => {
        const next = current.filter((item) => (getRefinedRecommendationKey(item) || item.id) !== key);
        persistRecommendationCache(next, ragResult, ingredientCount);
        return next;
      });
      void loadMoreRecommendations();
    },
    [ingredientCount, loadMoreRecommendations, persistRecommendationCache, ragResult],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;

      void (async () => {
        await refreshReadiness();
        const generationRequestId = route.params?.generationRequestId;
        if (generationRequestId && handledGenerationRequestRef.current !== generationRequestId) {
          handledGenerationRequestRef.current = generationRequestId;
          consumingGenerationRequestRef.current = true;
          navigation.setParams({ generationRequestId: undefined });
          try {
            await hydrateFromCache();
            await refreshRecommendations();
          } finally {
            consumingGenerationRequestRef.current = false;
          }
          return;
        }

        if (consumingGenerationRequestRef.current) {
          return;
        }

        if (!hasLoadedOnceRef.current) {
          await hydrateFromCache();
          return;
        }

        if (active) {
          await hydrateFromCache();
        }
      })();

      return () => {
        active = false;
      };
    }, [hydrateFromCache, navigation, refreshReadiness, refreshRecommendations, route.params?.generationRequestId]),
  );

  const installOnnxModel = async () => {
    setModelDownloading(true);
    setModelProgress(null);
    try {
      await downloadEmbeddingModelPack(undefined, setModelProgress);
      await refreshReadiness();
    } finally {
      setModelDownloading(false);
      setModelProgress(null);
    }
  };

  const markCooked = async (recipeId: string, title: string) => {
    const normalizedRecipeId = normalizeRecipeId(recipeId);
    if (!normalizedRecipeId) {
      showFeedback({ tone: 'error', title: t('recommendations.markCookedFailedTitle'), message: t('recommendations.markCookedFailedBody') });
      return;
    }

    try {
      await markRecipeCooked({
        recipeId: normalizedRecipeId,
        title,
        source: 'refined',
      });
      const settings = await getSettings();
      showFeedback({ tone: 'success', title: t('recommendations.markedCookedTitle'), message: t('recommendations.markedCookedBody', { title, days: settings.recentHistoryDays }) });
      setRefinedRecommendations((current) => {
        const next = current.filter((item) => normalizeRecipeId(item.recipeId ?? item.id) !== normalizedRecipeId);
        persistRecommendationCache(next, ragResult, ingredientCount);
        return next;
      });
    } catch (error) {
      showFeedback({ tone: 'error', title: t('recommendations.recordFailed'), message: formatError(error, t) });
    }
  };

  const isFridgeEmpty = ingredientCount === 0;
  const listData: RecommendationListItem[] = refinedRecommendations.map((recommendation) => ({
    kind: 'refined',
    recommendation,
  }));
  const presentationMessages = listData.length > 0
    ? [
        cachePresentation
          ? t(cachePresentation === 'stale' ? 'recommendations.cacheInputsChanged' : 'recommendations.cached')
          : null,
        refineMessage,
      ].filter((message): message is string => Boolean(message))
    : [];
  const selectedRequestTags = parseRecommendationRequestTags(recommendationRequest);
  const requestTagCategories = buildRequestTagCategories(requestTags, language, t);
  const fixedActionPaddingBottom = Math.max(insets.bottom, 12);

  useEffect(() => {
    const focusRecommendationId = route.params?.focusRecommendationId;
    if (!focusRecommendationId || listData.length === 0) {
      return;
    }

    const index = listData.findIndex((item) => item.recommendation.id === focusRecommendationId);
    if (index < 0) {
      navigation.setParams({ focusRecommendationId: undefined });
      return;
    }

    const scrollTimer = setTimeout(() => {
      setHighlightedRecommendationId(focusRecommendationId);
      listRef.current?.scrollToIndex({ animated: true, index, viewPosition: 0.2 });
      navigation.setParams({ focusRecommendationId: undefined });
      setTimeout(() => setHighlightedRecommendationId(null), 1600);
    }, 120);

    return () => clearTimeout(scrollTimer);
  }, [listData.length, navigation, route.params?.focusRecommendationId]);

  if (loading && !hasLoadedOnce) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: appColors.canvas }]}>
        <View accessible accessibilityLiveRegion="polite" accessibilityState={{ busy: true }} style={styles.loadingScreen}>
          <ActivityIndicator color={appColors.primary} size="large" />
          <Text style={styles.emptyTitle}>{t('recommendations.loadingTitle')}</Text>
          <Text style={styles.emptyText}>{t('recommendations.loadingText')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: appColors.canvas }]}>
      <FlatList
        ref={listRef}
        data={listData}
        keyExtractor={(item) => item.recommendation.id}
        onScrollToIndexFailed={({ averageItemLength, index }) => {
          listRef.current?.scrollToOffset({ animated: true, offset: Math.max(averageItemLength * index, 0) });
        }}
        contentContainerStyle={[styles.content, { paddingBottom: fixedRequestBarHeight === null ? 112 + fixedActionPaddingBottom : fixedRequestBarHeight + spacing.lg }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <ReadinessChecklist
              loading={readinessLoading}
              readiness={readiness}
              onOpenConsent={() => navigation.navigate('PrivacyPolicy', { returnAfterConsent: true })}
              onOpenCredential={() => navigation.navigate('Settings')}
              onOpenModel={() => void installOnnxModel()}
              onOpenSource={() => navigation.navigate('MyStack', { screen: 'DatasetLibrary' })}
              t={t}
            />
            <View style={styles.modeRow}>
              <RequestTagPill
                label={isFridgeEmpty ? t('recommendations.inspirationMode') : ingredientCount === 1 ? t('recommendations.ingredientsCountOne', { count: 1 }) : t('recommendations.ingredientsCount', { count: ingredientCount })}
              />
            </View>
            <AppCard style={styles.minimalCard}>
              <View style={styles.requestHeader}>
                <Text accessibilityRole="header" style={styles.requestTitle}>{t('recommendations.requestTitle')}</Text>
                <Text style={styles.requestHelperText}>
                  {t('recommendations.requestHelperShort')}
                </Text>
              </View>
              {selectedRequestTags.length > 0 ? (
                <View style={styles.selectedRequestArea}>
                  <View style={styles.selectedRequestHeader}>
                    <Text style={styles.selectedRequestLabel}>{t('recommendations.currentRequest')}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={getActionAccessibilityState({ disabled: loading || loadingMore })}
                      disabled={loading || loadingMore}
                      onPress={clearRecommendationRequest}
                      style={styles.clearRequestLink}
                    >
                      <Text style={styles.clearRequestText}>{t('recommendations.requestClear')}</Text>
                    </Pressable>
                  </View>
                  <View style={styles.selectedRequestTags}>
                    {selectedRequestTags.map((tag) => (
                      <RequestTagPill
                        key={tag}
                        label={tag}
                        active
                        onPress={() => toggleRecommendationRequestTag(tag)}
                      />
                    ))}
                  </View>
                </View>
              ) : null}
              <View style={styles.requestAccordionList}>
                {requestTagCategories.map((category) => (
                  <RequestTagAccordion
                    key={category.key}
                    category={category}
                    expanded={expandedRequestSections[category.key]}
                    recommendationRequest={recommendationRequest}
                    onToggleSection={() => toggleRequestSection(category.key)}
                    onToggleTag={toggleRecommendationRequestTag}
                    onDeleteTag={(tag) => void deleteRecommendationRequestTag(tag)}
                    t={t}
                  />
                ))}
              </View>
              <View style={styles.requestAddRow}>
                <AppTextInput
                  value={newRequestTag}
                  onChangeText={setNewRequestTag}
                  placeholder={t('recommendations.tagPlaceholder')}
                  returnKeyType="done"
                  onSubmitEditing={() => void addRecommendationRequestTag()}
                  style={styles.requestTagInput}
                />
                <ActionButton
                  title={t('recommendations.tagAdd')}
                  variant="secondary"
                  onPress={() => void addRecommendationRequestTag()}
                  disabled={loading || loadingMore}
                  style={styles.requestAddButton}
                />
              </View>
            </AppCard>
            <View style={styles.headerActions}>
              <TextAction
                title={t('recommendations.refresh')}
                onPress={refreshRecommendations}
                loading={loading}
                disabled={readinessLoading || !readiness.ready}
              />
              <TextAction
                title={t('recommendations.changeBatch')}
                onPress={changeBatch}
                loading={loadingMore}
                disabled={loading || !readiness.ready || ragResult?.mode !== 'rag'}
              />
            </View>
            <Text style={styles.actionNotice}>{t('recommendations.geminiActionNotice')}</Text>
            {presentationMessages.map((message) => (
              <AppCard key={message} style={styles.statusCard}>
                <Text accessibilityLiveRegion="polite" style={styles.statusText}>{message}</Text>
              </AppCard>
            ))}
            {isFridgeEmpty ? (
              <AppCard style={styles.minimalCard}>
                <SectionHeader title={t('recommendations.fridgeEmptyTitle')} detail={t('recommendations.fridgeEmptyText')} />
                <View style={styles.noticeActions}>
                  <ActionButton
                    title={t('recommendations.addIngredient')}
                    onPress={() => navigation.navigate('FridgeStack', { screen: 'AddIngredient', initial: false })}
                  />
                  <ActionButton
                    title={t('recommendations.photoRecognize')}
                    variant="secondary"
                    onPress={() => navigation.navigate('FridgeStack', { screen: 'AddIngredient', params: { mode: 'photo' }, initial: false })}
                  />
                </View>
              </AppCard>
            ) : null}
            {ragResult?.mode === 'unavailable' ? (
              <AppCard style={styles.minimalCard}>
                <SectionHeader title={t('recommendations.ragUnavailable')} detail={formatRagUnavailableMessage(ragResult, t)} />
                {ragResult.reason === 'no_dataset' ? (
                  <ActionButton
                    title={t('recommendations.goDataset')}
                    variant="secondary"
                    onPress={() => navigation.navigate('MyStack', { screen: 'DatasetLibrary' })}
                  />
                ) : null}
                {ragResult.reason === 'no_model' ? (
                  <>
                    <ActionButton title={t('recommendations.downloadModel')} onPress={installOnnxModel} loading={modelDownloading} />
                    {modelProgress ? (
                      <Text style={styles.noticeText}>
                        {modelProgress.fileName} · {modelProgress.completedFiles}/{modelProgress.totalFiles} {t('common.files')} ·{' '}
                        {formatBytes(modelProgress.completedBytes)} / {formatBytes(modelProgress.totalBytes)}
                      </Text>
                    ) : null}
                  </>
                ) : null}
              </AppCard>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <AppCard style={[styles.minimalCard, styles.empty]}>
            {loading ? (
              <View accessible accessibilityLiveRegion="polite" accessibilityState={{ busy: true }} style={styles.loadingStatus}>
                <ActivityIndicator color={appColors.primary} />
                <Text style={styles.emptyTitle}>{t('recommendations.loadingTitle')}</Text>
                <Text style={styles.emptyText}>{t('recommendations.loadingText')}</Text>
              </View>
            ) : (
              <>
                <Text accessibilityRole="header" style={styles.emptyTitle}>{t('recommendations.emptyTitle')}</Text>
                <Text accessibilityLiveRegion="polite" style={styles.emptyText}>{refineMessage || t('recommendations.emptyText')}</Text>
              </>
            )}
          </AppCard>
        }
        ListFooterComponent={
          ragResult?.mode === 'rag' ? (
            <View style={styles.footer}>
              <ActionButton
                title={t('recommendations.loadMore')}
                variant="secondary"
                loading={loadingMore}
                disabled={loading}
                onPress={() => loadMoreRecommendations()}
              />
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <AppCard
            style={[
              styles.minimalCard,
              styles.card,
              highlightedRecommendationId === item.recommendation.id && styles.highlightedCard,
            ]}
          >
            <View style={styles.cardHeader}>
              <View style={styles.recipeTitleBlock}>
                <Text accessibilityRole="header" style={styles.recipeTitle}>{item.recommendation.title}</Text>
                <Text style={styles.sourceLine}>{getRagSourceLabel(item.recommendation.source, t)}</Text>
              </View>
            </View>
            <View style={styles.reasonBox}>
              <Text style={styles.reasonLabel}>{t('recommendations.whyRecommended')}</Text>
              <Text style={styles.reason}>{item.recommendation.scoreReason}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaPill}>{t('recommendations.difficultyValue', { value: difficultyLabel(item.recommendation.difficulty, t) })}</Text>
              <Text style={styles.metaPill}>{t('recommendations.timeValue', { value: formatMinutes(item.recommendation.estimatedTimeMinutes, t) })}</Text>
              {item.recommendation.servingNote ? <Text style={styles.metaPill}>{item.recommendation.servingNote}</Text> : null}
            </View>
            <View style={styles.ingredientGrid}>
              <View style={styles.ingredientPanel}>
                <Text style={styles.panelLabel}>{t('recommendations.matched')}</Text>
                <Text style={styles.panelValue}>{formatList(item.recommendation.matchedIngredients, language, t)}</Text>
              </View>
              <View style={styles.ingredientPanel}>
                <Text style={styles.panelLabel}>{t('recommendations.missing')}</Text>
                <Text style={styles.panelValue}>{formatList(item.recommendation.missingIngredients, language, t)}</Text>
              </View>
            </View>
            {item.recommendation.cleanSteps.length > 0 ? (
              <View style={styles.stepsBox}>
                <Text style={styles.stepsTitle}>{t('recommendations.steps')}</Text>
                {item.recommendation.cleanSteps.map((step, index) => (
                  <View key={`${item.recommendation.id}_step_${index}`} style={styles.stepRow}>
                    <Text style={styles.stepIndex}>{index + 1}</Text>
                    <Text style={styles.stepLine}>{step}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.line}>{t('recommendations.incompleteSteps')}</Text>
            )}
            {item.recommendation.notes ? <Text style={styles.notes}>{t('recommendations.notes', { notes: item.recommendation.notes })}</Text> : null}
            <View style={styles.cardFooter}>
              <ActionButton
                accessibilityLabel={t('recommendations.markCookedFor', { title: item.recommendation.title })}
                title={t('recommendations.markCooked')}
                variant="secondary"
                onPress={() => markCooked(item.recommendation.recipeId ?? item.recommendation.id, item.recommendation.title)}
                style={styles.cardFooterButton}
              />
              <Pressable
                accessibilityLabel={t('recommendations.replaceThisFor', { title: item.recommendation.title })}
                accessibilityRole="button"
                style={styles.dismissButton}
                onPress={() => dismissRecommendation(item.recommendation)}
              >
                <Text style={styles.dismissButtonText}>{t('recommendations.replaceThis')}</Text>
              </Pressable>
            </View>
          </AppCard>
        )}
      />
      <View
        onLayout={(event) => setFixedRequestBarHeight(Math.ceil(event.nativeEvent.layout.height))}
        style={[styles.fixedRequestBar, { paddingBottom: fixedActionPaddingBottom }]}
      >
        <ActionButton
          title={t('recommendations.applyRequest')}
          onPress={applyRecommendationRequest}
          loading={loading}
          disabled={loadingMore || readinessLoading || !readiness.ready}
          style={styles.fixedRequestButton}
        />
      </View>
    </SafeAreaView>
  );
}

function ReadinessChecklist({
  loading,
  readiness,
  onOpenConsent,
  onOpenCredential,
  onOpenModel,
  onOpenSource,
  t,
}: {
  loading: boolean;
  readiness: RecommendationReadiness;
  onOpenConsent: () => void;
  onOpenCredential: () => void;
  onOpenModel: () => void;
  onOpenSource: () => void;
  t: TFunction;
}) {
  const { colors: appColors } = useAppTheme();
  const styles = useRecommendationStyles();
  const items = [
    { key: 'consent', label: t('recommendations.readinessConsent'), ready: readiness.consentReady, onPress: onOpenConsent },
    { key: 'credential', label: t('recommendations.readinessCredential'), ready: readiness.credentialReady, onPress: onOpenCredential },
    { key: 'model', label: t('recommendations.readinessModel'), ready: readiness.modelReady, onPress: onOpenModel },
    { key: 'source', label: t('recommendations.readinessSource'), ready: readiness.sourceReady, onPress: onOpenSource },
  ];

  return (
    <AppCard style={[styles.minimalCard, styles.readinessCard]}>
      <View style={styles.readinessHeader}>
        <View style={styles.readinessTitleBlock}>
          <Text accessibilityRole="header" style={styles.readinessTitle}>{t('recommendations.readinessTitle')}</Text>
          <Text style={styles.readinessDetail}>
            {readiness.ready
              ? t('recommendations.readinessComplete')
              : t('recommendations.readinessIncomplete')}
          </Text>
        </View>
        {loading ? <ActivityIndicator color={appColors.primary} size="small" /> : null}
      </View>
      <View style={styles.readinessList}>
        {items.map((item) => {
          const status = item.ready ? t('recommendations.readinessReady') : t('recommendations.readinessRequired');
          const label = `${item.label}. ${status}`;
          const content = (
            <>
              {item.ready ? (
                <CheckCircle2 color={appColors.primary} size={21} strokeWidth={2.2} />
              ) : (
                <Circle color={appColors.textTertiary} size={21} strokeWidth={2} />
              )}
              <Text style={[styles.readinessLabel, item.ready && styles.readinessLabelReady]}>{item.label}</Text>
              <Text style={styles.readinessStatus}>{status}</Text>
              {!item.ready ? <ChevronRight color={appColors.textTertiary} size={19} strokeWidth={2} /> : null}
            </>
          );

          if (item.ready) {
            return (
              <View accessible accessibilityLabel={label} key={item.key} style={styles.readinessRow}>
                {content}
              </View>
            );
          }

          return (
            <Pressable
              accessibilityLabel={label}
              accessibilityRole="button"
              accessibilityState={getActionAccessibilityState({ loading })}
              disabled={loading}
              key={item.key}
              onPress={item.onPress}
              style={({ pressed }) => [styles.readinessRow, pressed && styles.readinessRowPressed]}
            >
              {content}
            </Pressable>
          );
        })}
      </View>
    </AppCard>
  );
}

function TextAction({
  title,
  onPress,
  disabled = false,
  loading = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const { colors: appColors } = useAppTheme();
  const styles = useRecommendationStyles();
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [styles.textAction, inactive && styles.textActionDisabled, pressed && !inactive && styles.textActionPressed]}
    >
      {loading ? <ActivityIndicator color={appColors.primary} size="small" /> : null}
      <Text style={styles.textActionLabel}>{title}</Text>
    </Pressable>
  );
}

function RequestTagAccordion({
  category,
  expanded,
  recommendationRequest,
  onToggleSection,
  onToggleTag,
  onDeleteTag,
  t,
}: {
  category: RequestTagCategory;
  expanded: boolean;
  recommendationRequest: string;
  onToggleSection: () => void;
  onToggleTag: (tag: string) => void;
  onDeleteTag: (tag: string) => void;
  t: TFunction;
}) {
  const { colors: appColors } = useAppTheme();
  const styles = useRecommendationStyles();
  const selectedCount = category.tags.filter((tag) => isRequestTagSelected(recommendationRequest, tag)).length;
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <View style={styles.requestAccordionSection}>
      <Pressable
        accessibilityLabel={selectedCount > 0 ? t('recommendations.requestCategorySelected', { title: category.title, count: selectedCount }) : category.title}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggleSection}
        style={styles.requestAccordionHeader}
      >
        <Text style={styles.requestAccordionTitle}>{category.title}</Text>
        <View style={styles.requestAccordionMeta}>
          {selectedCount > 0 ? <Text style={styles.requestAccordionCount}>{selectedCount}</Text> : null}
          <Chevron size={18} color={appColors.textSecondary} strokeWidth={2} />
        </View>
      </Pressable>
      {expanded ? (
        <View style={styles.requestTagRow}>
          {category.tags.map((tag) => {
            const selected = isRequestTagSelected(recommendationRequest, tag);
            return (
              <RequestTagPill
                key={tag}
                label={tag}
                active={selected}
                onPress={() => onToggleTag(tag)}
                onRemove={() => onDeleteTag(tag)}
                removeAccessibilityLabel={t('recommendations.deleteTag', { tag })}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function RequestTagPill({
  label,
  active = false,
  onPress,
  onRemove,
  removeAccessibilityLabel,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
  removeAccessibilityLabel?: string;
}) {
  if (onRemove && removeAccessibilityLabel) {
    return (
      <IngredientChip
        label={label}
        selected={active}
        onPress={onPress}
        onRemove={onRemove}
        removeAccessibilityLabel={removeAccessibilityLabel}
      />
    );
  }

  return <IngredientChip label={label} selected={active} onPress={onPress} />;
}

function formatList(items: string[], language: string, t: TFunction) {
  return items.length > 0 ? items.join(language === 'en' ? ', ' : '、') : t('recommendations.none');
}

function formatMinutes(value: number | null, t: TFunction) {
  return value ? t('recommendations.minutes', { value }) : t('recommendations.unknownMinutes');
}

function difficultyLabel(value: RefinedRagRecommendation['difficulty'], t: TFunction) {
  if (value === '简单') {
    return t('difficulty.easy');
  }

  if (value === '中等') {
    return t('difficulty.medium');
  }

  if (value === '偏难') {
    return t('difficulty.hard');
  }

  return t('difficulty.unknown');
}

function getRagSourceLabel(recommendation: RagRecommendation | undefined, t: TFunction) {
  const value = recommendation?.metadata.sourceLabel;
  if (typeof value !== 'string' || !value.trim()) {
    return t('recommendations.sourceFallback');
  }

  const label = value.trim();
  if (label === '官方菜谱库') {
    return t('recommendations.sourceOfficial');
  }

  const personalPrefix = '我的菜谱库：';
  if (label.startsWith(personalPrefix)) {
    return t('recommendations.sourcePersonal', { name: label.slice(personalPrefix.length) });
  }

  return label;
}

function formatRagUnavailableMessage(ragResult: RagResult, t: TFunction) {
  if (ragResult.mode !== 'unavailable') {
    return '';
  }

  if (ragResult.reason === 'no_dataset') {
    return t('recommendations.ragNoDataset');
  }

  if (ragResult.reason === 'runtime_error') {
    return t('recommendations.ragRuntimeError', { message: ragResult.message.replace(/^RAG 运行失败：/, '') });
  }

  return ragResult.message;
}

function isRecentlyCookedRagItem(item: RagRecommendation, recentCookedRecipeIds: Set<string>) {
  const candidates = [item.recipeId, item.id].map(normalizeRecipeId).filter(Boolean);
  return candidates.some((id) => recentCookedRecipeIds.has(id));
}

function matchesRecommendationSettings(item: RagRecommendation, settings: AppSettings) {
  if (settings.maxTimeMinutes) {
    const estimatedTime = readPositiveNumber(item.metadata.estimatedTimeMinutes);
    if (estimatedTime && estimatedTime > settings.maxTimeMinutes) {
      return false;
    }
  }

  if (settings.preferredDifficulty !== 'any') {
    const difficulty = readDifficulty(item.metadata.difficulty);
    if (difficulty && isHarderThanPreference(difficulty, settings.preferredDifficulty)) {
      return false;
    }
  }

  return true;
}

function readPositiveNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : null;
}

function readDifficulty(value: unknown): UserRecipeDifficulty | null {
  return value === '简单' || value === '中等' || value === '偏难' || value === '未知' ? value : null;
}

function isHarderThanPreference(value: UserRecipeDifficulty, preference: UserRecipeDifficulty) {
  const rank: Record<UserRecipeDifficulty, number> = {
    简单: 1,
    中等: 2,
    偏难: 3,
    未知: 0,
  };

  return rank[value] > rank[preference];
}

function getRagCandidateKey(item: RagRecommendation) {
  return normalizeRecipeId(item.recipeId) || normalizeRecipeId(item.id) || normalizeRecipeId(item.chunkId);
}

function getRefinedRecommendationKey(item: RefinedRagRecommendation) {
  return normalizeRecipeId(item.recipeId) || normalizeRecipeId(item.id) || normalizeRecipeId(item.chunkId);
}

function dedupeRefinedRecommendations(
  incoming: RefinedRagRecommendation[],
  existing: RefinedRagRecommendation[],
) {
  const seen = new Set(existing.map(getRefinedRecommendationKey).filter(Boolean));
  const unique: RefinedRagRecommendation[] = [];

  for (const recommendation of incoming) {
    const key = getRefinedRecommendationKey(recommendation);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(recommendation);
  }

  return unique;
}

function isRequestTagSelected(value: string, tag: string) {
  return parseRecommendationRequestTags(value).some((item) => sameRequestTag(item, tag));
}

function parseRecommendationRequestTags(value: string) {
  return value
    .split(/[、,，;；]+/)
    .map(normalizeRequestTag)
    .filter(Boolean);
}

function buildRequestTagCategories(tags: string[], language: 'zh' | 'en', t: TFunction): RequestTagCategory[] {
  const categories = {
    cuisine: new Set(language === 'en'
      ? ['Cantonese style', 'Light and less oily', 'Not spicy', 'Rice-friendly', 'Home-style', 'Warming food', 'Steamed dishes', 'Braise or stew']
      : ['广东口味', '清淡少油', '不要辣', '下饭菜', '家常菜', '暖胃', '蒸菜', '煲/炖']),
    meal: new Set(language === 'en'
      ? ['Kid-friendly', 'Soup or stew', 'Quick meal', 'Solo meal', 'Breakfast', 'Lunch box', 'Dinner', 'Less cleanup']
      : ['适合小孩', '想喝汤', '快手菜', '一人食', '早餐', '午餐便当', '晚餐', '少洗碗']),
    dietary: new Set(language === 'en'
      ? ['High protein', 'Low carb', 'Weight-loss meal', 'Vegetarian']
      : ['高蛋白', '低碳水', '减脂餐', '素食']),
  };

  const grouped: Record<RequestTagCategoryKey, string[]> = {
    cuisine: [],
    meal: [],
    dietary: [],
  };

  for (const tag of tags) {
    const normalized = normalizeRequestTag(tag);
    if (categories.cuisine.has(normalized)) {
      grouped.cuisine.push(tag);
    } else if (categories.dietary.has(normalized)) {
      grouped.dietary.push(tag);
    } else {
      grouped.meal.push(tag);
    }
  }

  return [
    { key: 'cuisine', title: t('recommendations.requestCategoryCuisine'), tags: grouped.cuisine },
    { key: 'meal', title: t('recommendations.requestCategoryMeal'), tags: grouped.meal },
    { key: 'dietary', title: t('recommendations.requestCategoryDietary'), tags: grouped.dietary },
  ];
}

function buildRecommendationRequest(tags: string[], language: 'zh' | 'en') {
  const unique: string[] = [];
  for (const tag of tags) {
    const normalized = normalizeRequestTag(tag);
    if (!normalized || unique.some((item) => sameRequestTag(item, normalized))) {
      continue;
    }

    unique.push(normalized);
  }

  return unique.join(language === 'en' ? ', ' : '、');
}

function normalizeRequestTag(value: string) {
  return value.trim().replace(/[、,，;；]+/g, ' ').replace(/\s{2,}/g, ' ');
}

function sameRequestTag(left: string, right: string) {
  return normalizeSignatureText(left) === normalizeSignatureText(right);
}

function formatError(error: unknown, t: TFunction) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : t('common.unknown');
}

function formatGeminiRecommendationError(error: unknown, t: TFunction) {
  const message = formatError(error, t);
  const normalized = message.toLowerCase();

  if (error instanceof RecommendationRefinerError) {
    if (error.code === 'authentication') {
      return t('recommendations.geminiAuthenticationFailed');
    }
    if (error.code === 'quota') {
      return t('recommendations.geminiQuotaFailed');
    }
    if (error.code === 'invalid_response') {
      return t('recommendations.geminiInvalidResponse');
    }
  }

  if (
    normalized.includes('network request failed') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('networkerror')
  ) {
    return t('recommendations.geminiNetworkFailed');
  }

  if (message.includes('超时') || normalized.includes('timeout') || normalized.includes('aborted')) {
    return t('recommendations.geminiTimeout');
  }

  return t('recommendations.geminiProviderFailed', { message });
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

function useRecommendationStyles() {
  const { colors: appColors } = useAppTheme();
  return useMemo(() => createStyles(appColors), [appColors]);
}

function createStyles(appColors: AppColorTokens) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: appColors.canvas,
  },
  loadingScreen: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  fixedRequestBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: appColors.surface,
    borderTopWidth: 1,
    borderTopColor: appColors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  fixedRequestButton: {
    width: '100%',
  },
  footer: {
    paddingVertical: spacing.md,
  },
  header: {
    gap: spacing.md,
  },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  actionNotice: {
    color: appColors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  statusCard: {
    backgroundColor: appColors.accentMuted,
    borderColor: appColors.border,
    padding: spacing.md,
  },
  statusText: {
    color: appColors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  minimalCard: {
    backgroundColor: appColors.surface,
    borderColor: appColors.border,
    borderRadius: 12,
    shadowOpacity: 0,
    elevation: 0,
  },
  readinessCard: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  readinessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  readinessTitleBlock: {
    flex: 1,
    gap: spacing.xs,
  },
  readinessTitle: {
    color: appColors.textPrimary,
    fontSize: 18,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  readinessDetail: {
    color: appColors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  readinessList: {
    borderTopWidth: 1,
    borderTopColor: appColors.border,
  },
  readinessRow: {
    minHeight: 48,
    minWidth: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: appColors.border,
  },
  readinessRowPressed: {
    opacity: 0.68,
  },
  readinessLabel: {
    flex: 1,
    color: appColors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    fontFamily: typography.strong,
  },
  readinessLabelReady: {
    color: appColors.primary,
  },
  readinessStatus: {
    color: appColors.textSecondary,
    fontSize: 13,
  },
  textAction: {
    minHeight: 48,
    minWidth: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingRight: spacing.md,
  },
  textActionPressed: {
    opacity: 0.72,
  },
  textActionDisabled: {
    opacity: 0.46,
  },
  textActionLabel: {
    flexShrink: 1,
    color: appColors.primary,
    fontSize: 15,
    fontWeight: '600',
    fontFamily: typography.strong,
  },
  requestHeader: {
    gap: 4,
  },
  requestTitle: {
    color: appColors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
    fontFamily: typography.strong,
  },
  requestHelperText: {
    color: appColors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  selectedRequestArea: {
    gap: spacing.sm,
    backgroundColor: appColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: appColors.border,
    paddingBottom: spacing.sm,
  },
  selectedRequestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  selectedRequestLabel: {
    color: appColors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: typography.strong,
    letterSpacing: 0.4,
  },
  selectedRequestTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  clearRequestLink: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: 'center',
  },
  clearRequestText: {
    color: appColors.primary,
    fontSize: 14,
    fontWeight: '500',
    fontFamily: typography.strong,
  },
  requestAccordionList: {
    borderTopWidth: 1,
    borderTopColor: appColors.border,
  },
  requestAccordionSection: {
    borderBottomWidth: 1,
    borderBottomColor: appColors.border,
  },
  requestAccordionHeader: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  requestAccordionTitle: {
    color: appColors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: typography.strong,
  },
  requestAccordionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  requestAccordionCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: appColors.surfaceMuted,
    color: appColors.primary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 22,
    textAlign: 'center',
    overflow: 'hidden',
  },
  requestAddRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  requestTagInput: {
    flexGrow: 1,
    flexBasis: 180,
  },
  requestAddButton: {
    flexGrow: 1,
  },
  requestTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  noticeText: {
    color: appColors.textSecondary,
    lineHeight: 21,
    fontFamily: typography.body,
  },
  refineText: {
    color: appColors.textSecondary,
    lineHeight: 21,
    fontWeight: '700',
  },
  historyText: {
    color: appColors.primary,
    lineHeight: 21,
    fontWeight: '900',
  },
  noticeActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  empty: {
    gap: spacing.md,
    padding: spacing.xl,
  },
  loadingStatus: {
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyTitle: {
    color: appColors.textPrimary,
    fontSize: 20,
    fontWeight: '900',
    fontFamily: typography.display,
  },
  emptyText: {
    color: appColors.textSecondary,
    lineHeight: 22,
  },
  card: {
    gap: spacing.md,
  },
  highlightedCard: {
    borderColor: appColors.primary,
    borderWidth: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  recipeTitleBlock: {
    flex: 1,
    gap: spacing.xs,
  },
  recipeTitle: {
    color: appColors.textPrimary,
    fontSize: 21,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metaPill: {
    backgroundColor: appColors.surfaceMuted,
    borderColor: appColors.border,
    borderWidth: 1,
    borderRadius: radii.pill,
    color: appColors.textPrimary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontWeight: '800',
  },
  ingredientGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  ingredientPanel: {
    flexGrow: 1,
    flexBasis: 140,
    backgroundColor: appColors.surfaceRaised,
    borderColor: appColors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.xs,
  },
  panelLabel: {
    color: appColors.textSecondary,
    fontSize: 12,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  panelValue: {
    color: appColors.textPrimary,
    lineHeight: 20,
    fontWeight: '800',
  },
  reasonBox: {
    gap: spacing.xs,
    backgroundColor: appColors.surfaceRaised,
    borderColor: appColors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
  },
  reasonLabel: {
    color: appColors.primary,
    fontSize: 12,
    fontWeight: '900',
    fontFamily: typography.strong,
    letterSpacing: 0.6,
  },
  reason: {
    color: appColors.textPrimary,
    lineHeight: 23,
    fontSize: 15,
  },
  line: {
    color: appColors.textSecondary,
    lineHeight: 21,
  },
  sourceLine: {
    color: appColors.textTertiary,
    lineHeight: 19,
    fontWeight: '800',
  },
  stepsBox: {
    gap: spacing.sm,
    backgroundColor: appColors.surfaceRaised,
    borderColor: appColors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
  },
  stepsTitle: {
    color: appColors.textPrimary,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  stepRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  stepIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: appColors.surfaceMuted,
    color: appColors.primary,
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  stepLine: {
    flex: 1,
    color: appColors.textPrimary,
    lineHeight: 22,
  },
  notes: {
    color: appColors.textSecondary,
    lineHeight: 21,
    fontStyle: 'italic',
  },
  cardFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cardFooterButton: {
    flexGrow: 1,
  },
  dismissButton: {
    minHeight: 48,
    minWidth: 48,
    borderRadius: 12,
    borderColor: appColors.border,
    borderWidth: 1,
    backgroundColor: appColors.surface,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButtonText: {
    color: appColors.textSecondary,
    fontSize: 15,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  });
}
