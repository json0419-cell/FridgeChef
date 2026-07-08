import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { useFeedback } from '../components/AppFeedbackProvider';
import { refineRagRecommendationsWithProvider } from '../ai/recommendationRefiner';
import { listInstalledDatasets } from '../datasets/datasetRegistry';
import { getRecentCookedRecipeIds, markRecipeCooked, normalizeRecipeId } from '../db/cookedHistoryRepository';
import { listIngredients } from '../db/ingredientsRepository';
import { listUserRecipeLibraries } from '../db/userRecipesRepository';
import { useI18n } from '../i18n/i18n';
import { downloadEmbeddingModelPack, type ModelDownloadProgress } from '../rag/model/modelPack';
import { getRagRecommendations, type RagResult } from '../rag/ragService';
import { loadRecommendationCache, saveRecommendationCache } from '../storage/recommendationCacheStorage';
import { loadRecommendationRequestTags, saveRecommendationRequestTags } from '../storage/recommendationTagStorage';
import { getApiKey, getSettings } from '../storage/settingsStorage';
import { colors, gradients, radii, shadows, spacing, typography } from '../styles/theme';
import type {
  AppSettings,
  Ingredient,
  InstalledDataset,
  RagRecommendation,
  RefinedRagRecommendation,
  RootStackParamList,
  UserRecipeDifficulty,
  UserRecipeLibrary,
} from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Recommendations'>;

type RecommendationListItem = { kind: 'refined'; recommendation: RefinedRagRecommendation };
type TFunction = ReturnType<typeof useI18n>['t'];

const RAG_SEARCH_CANDIDATES = 30;
const RAG_REFINE_CANDIDATES = 30;
const GEMINI_RETRY_COUNT = 3;
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

export function RecommendationsScreen({ navigation }: Props) {
  const { language, t } = useI18n();
  const { showFeedback } = useFeedback();
  const [refinedRecommendations, setRefinedRecommendations] = useState<RefinedRagRecommendation[]>([]);
  const [ragResult, setRagResult] = useState<RagResult | null>(null);
  const [refineMessage, setRefineMessage] = useState<string | null>(null);
  const [ingredientCount, setIngredientCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [modelDownloading, setModelDownloading] = useState(false);
  const [modelProgress, setModelProgress] = useState<ModelDownloadProgress | null>(null);
  const [recommendationRequest, setRecommendationRequestState] = useState('');
  const [requestTags, setRequestTags] = useState(() => (language === 'en' ? REQUEST_TAGS_EN : REQUEST_TAGS_ZH));
  const [newRequestTag, setNewRequestTag] = useState('');
  const loadingRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);
  const sentRagCandidateKeysRef = useRef<Set<string>>(new Set());
  const dismissedRecommendationKeysRef = useRef<Set<string>>(new Set());
  const cacheInputSignatureRef = useRef<string | null>(null);
  const recommendationRequestRef = useRef('');
  const activeRecommendationRequestRef = useRef('');

  const setRecommendationRequest = (value: string) => {
    recommendationRequestRef.current = value;
    setRecommendationRequestState(value);
  };

  const getCurrentRecommendationRequest = useCallback(() => recommendationRequestRef.current.trim(), []);

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
    const [cache, snapshot, apiKey] = await Promise.all([
      loadRecommendationCache(),
      getRecommendationInputSnapshot(language, extraPreference),
      getApiKey('gemini'),
    ]);

    if (!apiKey || !cache || cache.language !== language || cache.inputSignature !== snapshot.inputSignature) {
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
    return true;
  }, [getCurrentRecommendationRequest, language]);

  const loadRecommendations = useCallback(async ({ replace = false }: { replace?: boolean } = {}) => {
    if (loadingRef.current) {
      return;
    }

    loadingRef.current = true;
    const initialLoad = !hasLoadedOnceRef.current;
    setLoading(true);
    setRefineMessage(null);

    if (initialLoad || replace) {
      setRefinedRecommendations([]);
      setRagResult(null);
    }

    try {
      const extraPreference = getCurrentRecommendationRequest();
      const [apiKey, snapshot] = await Promise.all([
        getApiKey('gemini'),
        getRecommendationInputSnapshot(language, extraPreference),
      ]);
      const { ingredients, inputSignature, recentCookedRecipeIds, settings } = snapshot;
      if (!apiKey) {
        cacheInputSignatureRef.current = null;
        setIngredientCount(ingredients.length);
        setRefinedRecommendations([]);
        setRagResult(null);
        setRefineMessage(t('recommendations.needGeminiKey'));
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
        setRefinedRecommendations([]);
        return;
      }

      if (ragItems.length === 0) {
        setRefinedRecommendations([]);
        setRefineMessage(t('recommendations.noCandidates'));
        return;
      }

      try {
        const refined = await refineWithRetry(() =>
          refineRagRecommendationsWithProvider({
            apiKey,
            ingredients,
            settings,
            recommendations: ragItems,
            extraPreference,
            outputLanguage: language,
          }),
          t,
        );
        sentRagCandidateKeysRef.current = new Set(ragItems.map(getRagCandidateKey).filter(Boolean));
        setRefinedRecommendations(refined);
        persistRecommendationCache(refined, rag, ingredients.length, inputSignature);
        setRefineMessage(
          refined.length > 0
            ? t('recommendations.ready')
            : t('recommendations.allFiltered'),
        );
      } catch (error) {
        console.warn('Gemini recommendation refinement failed', error);
        const message = formatGeminiRecommendationError(error, t);
        setRefinedRecommendations([]);
        setRefineMessage(message);
      }
    } catch (error) {
      setRefinedRecommendations([]);
      setRefineMessage(t('recommendations.refreshFailed', { message: formatError(error, t) }));
    } finally {
      loadingRef.current = false;
      setLoading(false);
      hasLoadedOnceRef.current = true;
      setHasLoadedOnce(true);
    }
  }, [getCurrentRecommendationRequest, language, persistRecommendationCache, t]);

  const refreshRecommendations = useCallback(async () => {
    sentRagCandidateKeysRef.current = new Set();
    dismissedRecommendationKeysRef.current = new Set();
    await loadRecommendations({ replace: true });
  }, [loadRecommendations]);

  const loadMoreRecommendations = useCallback(async ({ replace = false, silent = false }: { replace?: boolean; silent?: boolean } = {}) => {
    if (loadingRef.current || loadingMoreRef.current) {
      return;
    }

    loadingMoreRef.current = true;
    setLoadingMore(true);
    setRefineMessage(null);

    try {
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

      cacheInputSignatureRef.current = inputSignature;
      activeRecommendationRequestRef.current = extraPreference;
      setIngredientCount(ingredients.length);
      if (requestChanged) {
        sentRagCandidateKeysRef.current = new Set();
        dismissedRecommendationKeysRef.current = new Set();
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
        const refined = await refineWithRetry(() =>
          refineRagRecommendationsWithProvider({
            apiKey,
            ingredients,
            settings,
            recommendations: ragItems,
            extraPreference,
            outputLanguage: language,
          }),
          t,
        );
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

        setRefinedRecommendations((current) => {
          const next = replace || requestChanged ? refinedToAppend : [...current, ...refinedToAppend];
          persistRecommendationCache(next, rag, ingredients.length, inputSignature);
          return next;
        });
        if (!silent) {
          setRefineMessage(t('recommendations.loadedMore', { count: refinedToAppend.length }));
        }
      } catch (error) {
        console.warn('Gemini recommendation load-more failed', error);
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
  }, [getCurrentRecommendationRequest, language, persistRecommendationCache, refinedRecommendations, showFeedback, t]);

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
      void loadMoreRecommendations({ silent: true });
    },
    [ingredientCount, loadMoreRecommendations, persistRecommendationCache, ragResult],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;

      void (async () => {
        if (hasLoadedOnceRef.current) {
          const snapshot = await getRecommendationInputSnapshot(language, getCurrentRecommendationRequest());
          if (active && cacheInputSignatureRef.current !== snapshot.inputSignature) {
            sentRagCandidateKeysRef.current = new Set();
            dismissedRecommendationKeysRef.current = new Set();
            await loadRecommendations({ replace: true });
          }
          return;
        }

        const restored = await hydrateFromCache();
        if (!restored && active) {
          await loadRecommendations();
        }
      })();

      return () => {
        active = false;
      };
    }, [getCurrentRecommendationRequest, hydrateFromCache, loadRecommendations]),
  );

  const installOnnxModel = async () => {
    setModelDownloading(true);
    setModelProgress(null);
    try {
      await downloadEmbeddingModelPack(undefined, setModelProgress);
      await loadRecommendations();
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
      await refreshRecommendations();
    } catch (error) {
      showFeedback({ tone: 'error', title: t('recommendations.recordFailed'), message: formatError(error, t) });
    }
  };

  const isFridgeEmpty = ingredientCount === 0;
  const needsGeminiKey = refineMessage === t('recommendations.needGeminiKey');
  const listData: RecommendationListItem[] = refinedRecommendations.map((recommendation) => ({
    kind: 'refined',
    recommendation,
  }));

  if (loading && !hasLoadedOnce) {
    return (
      <Screen>
        <View style={styles.loadingScreen}>
          <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.loadingHero}>
            <ActivityIndicator color={colors.textInverse} size="large" />
            <Text style={styles.loadingTitle}>{t('recommendations.loadingTitle')}</Text>
            <Text style={styles.loadingText}>{t('recommendations.loadingText')}</Text>
          </LinearGradient>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={listData}
        keyExtractor={(item) => item.recommendation.id}
        refreshing={loading}
        onRefresh={refreshRecommendations}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
              <Text style={styles.eyebrow}>{t('recommendations.eyebrow')}</Text>
              <Text style={styles.title}>{t('recommendations.title')}</Text>
              <Text style={styles.subtitle}>{buildSubtitle({ isFridgeEmpty, ragResult, ingredientCount, t })}</Text>
              <View style={styles.modeRow}>
                <Text style={styles.modeBadge}>
                  {isFridgeEmpty ? t('recommendations.inspirationMode') : t('recommendations.ingredientsCount', { count: ingredientCount })}
                </Text>
              </View>
            </LinearGradient>
            <View style={styles.requestPanel}>
              <Text style={styles.requestTitle}>{t('recommendations.requestTitle')}</Text>
              <Text style={styles.requestHelper}>{t('recommendations.requestHelper')}</Text>
              {recommendationRequest.trim() ? (
                <View style={styles.requestSummary}>
                  <Text style={styles.requestSummaryLabel}>{t('recommendations.currentRequest')}</Text>
                  <Text style={styles.requestSummaryText}>{recommendationRequest}</Text>
                </View>
              ) : null}
              <View style={styles.requestTagRow}>
                {requestTags.map((tag) => {
                  const selected = isRequestTagSelected(recommendationRequest, tag);
                  return (
                    <View key={tag} style={[styles.requestTag, selected && styles.requestTagActive]}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => toggleRecommendationRequestTag(tag)}
                        style={({ pressed }) => [styles.requestTagLabelButton, pressed && styles.requestTagPressed]}
                      >
                        <Text style={[styles.requestTagText, selected && styles.requestTagTextActive]}>{tag}</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('recommendations.deleteTag', { tag })}
                        onPress={() => void deleteRecommendationRequestTag(tag)}
                        style={({ pressed }) => [styles.requestTagDelete, pressed && styles.requestTagPressed]}
                      >
                        <Text style={[styles.requestTagDeleteText, selected && styles.requestTagDeleteTextActive]}>x</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
              <View style={styles.requestAddRow}>
                <TextInput
                  value={newRequestTag}
                  onChangeText={setNewRequestTag}
                  placeholder={t('recommendations.tagPlaceholder')}
                  placeholderTextColor={colors.muted}
                  returnKeyType="done"
                  onSubmitEditing={() => void addRecommendationRequestTag()}
                  style={styles.requestTagInput}
                />
                <PrimaryButton
                  title={t('recommendations.tagAdd')}
                  variant="secondary"
                  onPress={() => void addRecommendationRequestTag()}
                  disabled={loading || loadingMore}
                  style={styles.requestAddButton}
                />
              </View>
              <View style={styles.requestActions}>
                {recommendationRequest.trim() ? (
                  <PrimaryButton
                    title={t('recommendations.requestClear')}
                    variant="secondary"
                    onPress={clearRecommendationRequest}
                    disabled={loading || loadingMore}
                    style={styles.requestActionButton}
                  />
                ) : null}
                <PrimaryButton
                  title={t('recommendations.applyRequest')}
                  onPress={applyRecommendationRequest}
                  loading={loading}
                  disabled={loadingMore}
                  style={styles.requestActionButton}
                />
              </View>
            </View>
            <View style={styles.headerActions}>
              <PrimaryButton
                title={t('recommendations.refresh')}
                variant="secondary"
                onPress={refreshRecommendations}
                loading={loading}
                style={styles.headerActionButton}
              />
              <PrimaryButton
                title={t('recommendations.changeBatch')}
                variant="secondary"
                onPress={changeBatch}
                loading={loadingMore}
                disabled={loading || ragResult?.mode !== 'rag'}
                style={styles.headerActionButton}
              />
            </View>
            {isFridgeEmpty ? (
              <View style={styles.notice}>
                <Text style={styles.noticeTitle}>{t('recommendations.fridgeEmptyTitle')}</Text>
                <Text style={styles.noticeText}>{t('recommendations.fridgeEmptyText')}</Text>
                <View style={styles.noticeActions}>
                  <PrimaryButton title={t('recommendations.addIngredient')} onPress={() => navigation.navigate('AddIngredient')} />
                  <PrimaryButton
                    title={t('recommendations.photoRecognize')}
                    variant="secondary"
                    onPress={() => navigation.navigate('AddIngredient', { mode: 'photo' })}
                  />
                </View>
              </View>
            ) : null}
            {ragResult?.mode === 'unavailable' ? (
              <View style={styles.notice}>
                <Text style={styles.noticeTitle}>{t('recommendations.ragUnavailable')}</Text>
                <Text style={styles.noticeText}>{formatRagUnavailableMessage(ragResult, t)}</Text>
                {ragResult.reason === 'no_dataset' ? (
                  <PrimaryButton title={t('recommendations.goDataset')} variant="secondary" onPress={() => navigation.navigate('DatasetLibrary')} />
                ) : null}
                {ragResult.reason === 'no_model' ? (
                  <>
                    <PrimaryButton title={t('recommendations.downloadModel')} onPress={installOnnxModel} loading={modelDownloading} />
                    {modelProgress ? (
                      <Text style={styles.noticeText}>
                        {modelProgress.fileName} · {modelProgress.completedFiles}/{modelProgress.totalFiles} {t('common.files')} ·{' '}
                        {formatBytes(modelProgress.completedBytes)} / {formatBytes(modelProgress.totalBytes)}
                      </Text>
                    ) : null}
                  </>
                ) : null}
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            {loading ? (
              <>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.emptyTitle}>{t('recommendations.loadingTitle')}</Text>
                <Text style={styles.emptyText}>{t('recommendations.loadingText')}</Text>
              </>
            ) : (
              <>
                <Text style={styles.emptyTitle}>{t('recommendations.emptyTitle')}</Text>
                <Text style={styles.emptyText}>{refineMessage || t('recommendations.emptyText')}</Text>
                {needsGeminiKey ? (
                  <PrimaryButton title={t('recommendations.goGeminiSettings')} variant="secondary" onPress={() => navigation.navigate('Settings')} />
                ) : null}
              </>
            )}
          </View>
        }
        ListFooterComponent={
          ragResult?.mode === 'rag' ? (
            <View style={styles.footer}>
              <PrimaryButton
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
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.recipeTitleBlock}>
                <Text style={styles.recipeTitle}>{item.recommendation.title}</Text>
                <Text style={styles.sourceLine}>{getRagSourceLabel(item.recommendation.source, t)}</Text>
              </View>
            </View>
            <View style={styles.reasonBox}>
              <Text style={styles.reasonLabel}>{t('recommendations.whyRecommended')}</Text>
              <Text style={styles.reason}>{item.recommendation.scoreReason}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaPill}>{t('recommendations.difficulty')}：{difficultyLabel(item.recommendation.difficulty, t)}</Text>
              <Text style={styles.metaPill}>{t('recommendations.time')}：{formatMinutes(item.recommendation.estimatedTimeMinutes, t)}</Text>
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
              <PrimaryButton
                title={t('recommendations.markCooked')}
                variant="secondary"
                onPress={() => markCooked(item.recommendation.recipeId ?? item.recommendation.id, item.recommendation.title)}
                style={styles.cardFooterButton}
              />
              <Pressable
                accessibilityRole="button"
                style={styles.dismissButton}
                onPress={() => dismissRecommendation(item.recommendation)}
              >
                <Text style={styles.dismissButtonText}>{t('recommendations.replaceThis')}</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </Screen>
  );
}

async function refineWithRetry(task: () => Promise<RefinedRagRecommendation[]>, t: TFunction) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= GEMINI_RETRY_COUNT; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(t('recommendations.geminiFailed'));
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

function buildSubtitle({
  isFridgeEmpty,
  ragResult,
  ingredientCount,
  t,
}: {
  isFridgeEmpty: boolean;
  ragResult: RagResult | null;
  ingredientCount: number;
  t: TFunction;
}) {
  if (ragResult?.mode === 'rag') {
    const datasetName = formatRagDatasetName(ragResult.datasetName, t);
    const modelName = formatRagModelName(ragResult.modelName, t);
    return isFridgeEmpty
      ? t('recommendations.subtitleRagEmpty', { dataset: datasetName, model: modelName })
      : t('recommendations.subtitleRagIngredients', {
          count: ingredientCount,
          dataset: datasetName,
          model: modelName,
        });
  }

  return isFridgeEmpty
    ? t('recommendations.subtitleEmpty')
    : t('recommendations.subtitleWithIngredients', { count: ingredientCount });
}

function formatRagDatasetName(value: string, t: TFunction) {
  return value
    .split('+')
    .map((item) => formatRagDatasetNamePart(item, t))
    .filter(Boolean)
    .join(' + ') || t('recommendations.sourceFallback');
}

function formatRagDatasetNamePart(value: string, t: TFunction) {
  const trimmed = value.trim();
  const personalPrefix = '我的菜谱库：';
  if (trimmed.startsWith(personalPrefix)) {
    return t('recommendations.sourcePersonal', { name: trimmed.slice(personalPrefix.length) });
  }

  const normalized = formatOfficialDatasetName(trimmed, t);
  if (normalized === '我的菜谱库') {
    return t('recommendations.datasetPersonal');
  }

  if (normalized === 'RAG 菜谱库') {
    return t('recommendations.sourceFallback');
  }

  return normalized;
}

function formatOfficialDatasetName(value: string, t: TFunction) {
  return value
    .replace(/吃什么\s*官方菜谱库/g, t('dataset.officialLibraryName'))
    .replace(/\b(?:10k|100k|1m)\b/gi, '')
    .replace(/\s*[-_]\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function formatRagModelName(value: string, t: TFunction) {
  if (value === '随机灵感推荐') {
    return t('recommendations.modelRandom');
  }

  if (value === '本地文本检索') {
    return t('recommendations.modelText');
  }

  return value;
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

async function getRecommendationInputSnapshot(language: 'zh' | 'en', extraPreference = '') {
  const settings = await getSettings();
  const [ingredients, recentCookedRecipeIds, datasets, libraries] = await Promise.all([
    listIngredients(),
    getRecentCookedRecipeIds(settings.recentHistoryDays),
    listInstalledDatasets(),
    listUserRecipeLibraries(),
  ]);

  return {
    settings,
    ingredients,
    recentCookedRecipeIds,
    inputSignature: buildRecommendationInputSignature({
      language,
      settings,
      ingredients,
      recentCookedRecipeIds,
      datasets,
      libraries,
      extraPreference,
    }),
  };
}

function buildRecommendationInputSignature({
  language,
  settings,
  ingredients,
  recentCookedRecipeIds,
  datasets,
  libraries,
  extraPreference,
}: {
  language: 'zh' | 'en';
  settings: AppSettings;
  ingredients: Ingredient[];
  recentCookedRecipeIds: Set<string>;
  datasets: InstalledDataset[];
  libraries: UserRecipeLibrary[];
  extraPreference: string;
}) {
  const activeDataset = datasets.find((item) => item.active) ?? null;

  return JSON.stringify({
    language,
    extraPreference: normalizeSignatureText(extraPreference),
    settings: {
      servings: settings.servings,
      dietaryPreferences: normalizeSignatureText(settings.dietaryPreferences),
      maxTimeMinutes: settings.maxTimeMinutes ?? null,
      preferredDifficulty: settings.preferredDifficulty,
      recentHistoryDays: settings.recentHistoryDays,
    },
    ingredients: ingredients
      .map((item) => ({
        id: item.id,
        name: normalizeSignatureText(item.name),
        quantity: item.quantity,
        unit: normalizeSignatureText(item.unit),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    recentCookedRecipeIds: Array.from(recentCookedRecipeIds).sort(),
    activeDataset: activeDataset
      ? {
          id: activeDataset.id,
          version: activeDataset.version,
          recipeCount: activeDataset.recipeCount,
          chunkCount: activeDataset.chunkCount,
        }
      : null,
    enabledPersonalLibraries: libraries
      .filter((item) => item.enabled)
      .map((item) => ({
        id: item.id,
        recipeCount: item.recipeCount,
        updatedAt: item.updatedAt,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
}

function normalizeSignatureText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
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

  if (
    error instanceof SyntaxError ||
    message.includes('recommendations 数组') ||
    message.includes('JSON') ||
    normalized.includes('json')
  ) {
    return t('recommendations.geminiInvalidResponse');
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

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  loadingHero: {
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    ...shadows.lift,
  },
  loadingTitle: {
    color: colors.textInverse,
    fontSize: 28,
    fontWeight: '900',
    fontFamily: typography.display,
    textAlign: 'center',
  },
  loadingText: {
    color: 'rgba(255, 255, 255, 0.74)',
    lineHeight: 23,
    fontSize: 15,
    fontFamily: typography.body,
    textAlign: 'center',
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
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
  headerActionButton: {
    flexGrow: 1,
  },
  requestPanel: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  requestTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  requestHelper: {
    color: colors.muted,
    lineHeight: 21,
    fontWeight: '700',
    fontFamily: typography.body,
  },
  requestSummary: {
    gap: spacing.xs,
    borderRadius: radii.md,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
  },
  requestSummaryLabel: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
    fontFamily: typography.strong,
    letterSpacing: 0.6,
  },
  requestSummaryText: {
    color: colors.text,
    lineHeight: 21,
    fontWeight: '800',
    fontFamily: typography.body,
  },
  requestAddRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  requestTagInput: {
    minHeight: 50,
    flexGrow: 1,
    flexBasis: 180,
    borderRadius: radii.pill,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
    fontFamily: typography.body,
  },
  requestAddButton: {
    flexGrow: 1,
  },
  requestTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  requestTag: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderRadius: radii.pill,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surfaceAlt,
  },
  requestTagLabelButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  requestTagActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  requestTagPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.98 }],
  },
  requestTagText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  requestTagTextActive: {
    color: colors.textInverse,
  },
  requestTagDelete: {
    minWidth: 34,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftColor: 'rgba(119, 100, 83, 0.22)',
    borderLeftWidth: 1,
    paddingHorizontal: spacing.sm,
  },
  requestTagDeleteText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  requestTagDeleteTextActive: {
    color: colors.textInverse,
  },
  requestActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  requestActionButton: {
    flexGrow: 1,
  },
  hero: {
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
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
    fontSize: 32,
    fontWeight: '900',
    fontFamily: typography.display,
    letterSpacing: 0.3,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.74)',
    lineHeight: 23,
    fontSize: 15,
    fontFamily: typography.body,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  modeBadge: {
    color: colors.textInverse,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    fontWeight: '900',
  },
  notice: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  noticeTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  noticeText: {
    color: colors.muted,
    lineHeight: 21,
    fontFamily: typography.body,
  },
  refineText: {
    color: colors.muted,
    lineHeight: 21,
    fontWeight: '700',
  },
  historyText: {
    color: colors.primary,
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
  },
  emptyText: {
    color: colors.muted,
    lineHeight: 22,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
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
    color: colors.text,
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
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.pill,
    color: colors.text,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontWeight: '800',
  },
  ingredientGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ingredientPanel: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  panelLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  panelValue: {
    color: colors.text,
    lineHeight: 20,
    fontWeight: '800',
  },
  reasonBox: {
    gap: spacing.xs,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  reasonLabel: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
    fontFamily: typography.strong,
    letterSpacing: 0.6,
  },
  reason: {
    color: colors.text,
    lineHeight: 23,
    fontSize: 15,
  },
  line: {
    color: colors.muted,
    lineHeight: 21,
  },
  sourceLine: {
    color: colors.muted,
    lineHeight: 19,
    fontWeight: '800',
  },
  stepsBox: {
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  stepsTitle: {
    color: colors.text,
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
    backgroundColor: colors.surface,
    color: colors.primary,
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  stepLine: {
    flex: 1,
    color: colors.text,
    lineHeight: 22,
  },
  notes: {
    color: colors.muted,
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
    borderRadius: radii.pill,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButtonText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
});
