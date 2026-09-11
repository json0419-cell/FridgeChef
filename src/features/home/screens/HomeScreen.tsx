import { useCallback, useMemo, useState, type ComponentType } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { AlertTriangle, ChevronRight, Refrigerator, Settings2, Sparkles } from 'lucide-react-native';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { listInstalledDatasets } from '../../../datasets/datasetRegistry';
import { listRecipes } from '../../../db/recipesRepository';
import { listEnabledUserRecipesWithLibraries } from '../../../db/userRecipesRepository';
import { useI18n } from '../../../i18n/i18n';
import { hasAiDataConsent } from '../../../privacy/ai-data-consent';
import { getActiveEmbeddingModel } from '../../../rag/model/modelRegistry';
import { radii, spacing, type AppColorTokens, useAppTheme } from '../../../shared/theme/theme';
import { hasVerifiedApiKey } from '../../../storage/settingsStorage';
import type { HomeStackScreenProps, Ingredient } from '../../../types';
import { getRecommendationInputSnapshot } from '../../recommendations/recommendation-input';

type Props = HomeStackScreenProps<'Home'>;
type HomePrompt = 'setup' | 'fridge' | 'inventoryError' | null;

type HomeSnapshot = {
  consentReady: boolean;
  error: string | null;
  ingredients: Ingredient[];
  keyReady: boolean;
  loading: boolean;
  modelReady: boolean;
  sourceReady: boolean;
};

const INITIAL_SNAPSHOT: HomeSnapshot = {
  consentReady: false,
  error: null,
  ingredients: [],
  keyReady: false,
  loading: true,
  modelReady: false,
  sourceReady: false,
};

export function HomeScreen({ navigation }: Props) {
  const { language, t } = useI18n();
  const { colors } = useAppTheme();
  const { fontScale, height } = useWindowDimensions();
  const [snapshot, setSnapshot] = useState<HomeSnapshot>(INITIAL_SNAPSHOT);
  const [prompt, setPrompt] = useState<HomePrompt>(null);
  const visualLift = getResponsiveVisualLift(height, fontScale);

  const loadSnapshot = useCallback(async () => {
    setSnapshot((current) => ({ ...current, error: null, loading: true }));
    const results = await Promise.allSettled([
      getRecommendationInputSnapshot(language),
      hasVerifiedApiKey('gemini'),
      hasAiDataConsent(),
      listInstalledDatasets(),
      listEnabledUserRecipesWithLibraries(),
      getActiveEmbeddingModel(),
      listRecipes(),
    ]);

    const [inputResult, keyResult, consentResult, datasetsResult, personalResult, modelResult, recipesResult] = results;
    const input = settledValue(inputResult, null);
    const datasets = settledValue(datasetsResult, []);
    const personalRecipes = settledValue(personalResult, []);
    const baseRecipes = settledValue(recipesResult, []);

    setSnapshot({
      consentReady: settledValue(consentResult, false),
      error: firstRejectedMessage([inputResult]),
      ingredients: input?.ingredients ?? [],
      keyReady: settledValue(keyResult, false),
      loading: false,
      modelReady: Boolean(settledValue(modelResult, null)),
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

  const setupReady = missingSetup.length === 0;

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
        contentContainerStyle={{ flexGrow: 1, gap: spacing.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
          <IconButton colors={colors} icon={Settings2} label={t('nav.settings')} onPress={openSettings} />
        </View>

        <View style={{ flex: 1, justifyContent: 'center', gap: spacing.xl, transform: [{ translateY: -visualLift }] }}>
          <View style={{ alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.sm }}>
            <View style={{ width: 104, height: 104, borderRadius: 32, borderCurve: 'continuous', overflow: 'hidden' }}>
              <Image
                accessibilityLabel={t('home.brandMark')}
                accessible
                resizeMode="cover"
                source={require('../../../../assets/icon.png')}
                style={{ width: '100%', height: '100%' }}
              />
            </View>
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
              accessibilityLabel={t('home.generate')}
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
                {t('home.generate')}
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
        </View>
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

function getResponsiveVisualLift(height: number, fontScale: number) {
  if (fontScale >= 1.4 || height < 640) return 0;
  const maxLift = height < 760 ? 24 : 40;
  return Math.round(Math.min(maxLift, Math.max(16, height * 0.04)));
}
