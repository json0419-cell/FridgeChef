import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { AppConfirmModal } from '../components/AppConfirmModal';
import { useFeedback } from '../components/AppFeedbackProvider';
import { testProviderConnection } from '../ai/providerAdapter';
import { useI18n, type LanguagePreference } from '../i18n/i18n';
import { clearApiKey, getApiKey, getSettings, saveApiKey, saveSettings } from '../storage/settingsStorage';
import { colors, gradients, radii, shadows, spacing, typography } from '../styles/theme';
import type { RecommendationDifficultyPreference, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;
const GEMINI_API_KEY_URL = 'https://aistudio.google.com/app/apikey';

type ConfirmDialogState = {
  title: string;
  message: string;
  confirmLabel: string;
  tone: 'danger' | 'info';
  onConfirm: () => void;
} | null;

export function SettingsScreen({ navigation }: Props) {
  const { languagePreference, setLanguagePreference, t } = useI18n();
  const { showFeedback } = useFeedback();
  const [servings, setServings] = useState('2');
  const [dietaryPreferences, setDietaryPreferences] = useState('');
  const [maxTimeMinutes, setMaxTimeMinutes] = useState('');
  const [preferredDifficulty, setPreferredDifficulty] = useState<RecommendationDifficultyPreference>('any');
  const [recentHistoryDays, setRecentHistoryDays] = useState('7');
  const [apiKey, setApiKey] = useState('');
  const [savedApiKeyValue, setSavedApiKeyValue] = useState('');
  const [savedKey, setSavedKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const skipUnsavedApiKeyPromptRef = useRef(false);
  const hasUnsavedApiKey = apiKey.trim() !== savedApiKeyValue;

  useEffect(() => {
    void loadSettings();
  }, []);

  useEffect(() => {
    if (!hasUnsavedApiKey) {
      return undefined;
    }

    return navigation.addListener('beforeRemove', (event) => {
      if (skipUnsavedApiKeyPromptRef.current) {
        return;
      }

      if (!hasUnsavedApiKey) {
        return;
      }

      event.preventDefault();
      setConfirmDialog({
        title: t('settings.unsavedApiKeyTitle'),
        message: t('settings.unsavedApiKeyBody'),
        confirmLabel: t('settings.unsavedApiKeyDiscard'),
        tone: 'danger',
        onConfirm: () => {
          skipUnsavedApiKeyPromptRef.current = true;
          setConfirmDialog(null);
          navigation.dispatch(event.data.action);
        },
      });
    });
  }, [hasUnsavedApiKey, navigation, t]);

  const loadSettings = async () => {
    const settings = await getSettings();
    setServings(String(settings.servings));
    setDietaryPreferences(settings.dietaryPreferences);
    setMaxTimeMinutes(settings.maxTimeMinutes ? String(settings.maxTimeMinutes) : '');
    setPreferredDifficulty(settings.preferredDifficulty);
    setRecentHistoryDays(String(settings.recentHistoryDays));
    const key = await getApiKey('gemini');
    setApiKey(key ?? '');
    setSavedApiKeyValue(key ?? '');
    setSavedKey(Boolean(key));
  };

  const savePlainSettings = async () => {
    try {
      await saveSettings({
        provider: 'gemini',
        servings: Number(servings),
        dietaryPreferences,
        maxTimeMinutes: parseOptionalNumber(maxTimeMinutes),
        preferredDifficulty,
        recentHistoryDays: parsePositiveNumber(recentHistoryDays, 7),
      });
      showFeedback({ tone: 'success', title: t('settings.saved') });
    } catch (error) {
      showFeedback({ tone: 'error', title: t('settings.saveFailed'), message: formatError(error, t) });
    }
  };

  const saveCurrentApiKey = async () => {
    setBusy(true);
    try {
      const trimmedApiKey = apiKey.trim();
      await savePlainSettingsValue();
      await saveApiKey('gemini', trimmedApiKey);
      setApiKey(trimmedApiKey);
      setSavedApiKeyValue(trimmedApiKey);
      setSavedKey(Boolean(trimmedApiKey));
      showFeedback({ tone: 'success', title: t('settings.apiKeySavedTitle'), message: t('settings.apiKeySavedBody') });
    } catch (error) {
      showFeedback({ tone: 'error', title: t('settings.saveFailed'), message: formatError(error, t) });
    } finally {
      setBusy(false);
    }
  };

  const savePlainSettingsValue = async () =>
    saveSettings({
      provider: 'gemini',
      servings: Number(servings),
      dietaryPreferences,
      maxTimeMinutes: parseOptionalNumber(maxTimeMinutes),
      preferredDifficulty,
      recentHistoryDays: parsePositiveNumber(recentHistoryDays, 7),
    });

  const clearCurrentApiKey = async () => {
    setBusy(true);
    try {
      await clearApiKey('gemini');
      setApiKey('');
      setSavedApiKeyValue('');
      setSavedKey(false);
      showFeedback({ tone: 'success', title: t('settings.apiKeyCleared') });
    } catch (error) {
      showFeedback({ tone: 'error', title: t('settings.clearFailed'), message: formatError(error, t) });
    } finally {
      setBusy(false);
    }
  };

  const confirmClearApiKey = () => {
    setConfirmDialog({
      title: t('settings.clearApiKeyConfirmTitle'),
      message: t('settings.clearApiKeyConfirmBody'),
      confirmLabel: t('settings.clearApiKeyConfirmAction'),
      tone: 'danger',
      onConfirm: () => {
        setConfirmDialog(null);
        void clearCurrentApiKey();
      },
    });
  };

  const testConnection = async () => {
    setBusy(true);
    try {
      const key = apiKey.trim() || (await getApiKey('gemini')) || '';
      await testProviderConnection('gemini', key);
      showFeedback({ tone: 'success', title: t('settings.connectionSuccess'), message: t('common.gemini') });
    } catch (error) {
      showFeedback({ tone: 'error', title: t('settings.connectionFailed'), message: formatError(error, t) });
    } finally {
      setBusy(false);
    }
  };

  const openGeminiApiKeyPage = async () => {
    try {
      await Linking.openURL(GEMINI_API_KEY_URL);
    } catch (error) {
      showFeedback({ tone: 'error', title: t('settings.openApiKeyHelpFailed'), message: formatError(error, t) });
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <Text style={styles.eyebrow}>{t('settings.eyebrow')}</Text>
            <Text style={styles.title}>{t('settings.title')}</Text>
            <Text style={styles.subtitle}>{t('settings.subtitle')}</Text>
          </LinearGradient>

          <View style={[styles.section, styles.languageSection]}>
            <Text style={styles.label}>{t('settings.language')}</Text>
            <View style={styles.dropdown}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setLanguageMenuOpen((current) => !current)}
                style={({ pressed }) => [styles.dropdownButton, pressed && styles.dropdownButtonPressed]}
              >
                <Text style={styles.dropdownButtonText}>{languagePreferenceLabel(languagePreference, t)}</Text>
                <Text style={styles.dropdownCaret}>{languageMenuOpen ? '^' : 'v'}</Text>
              </Pressable>
              {languageMenuOpen ? (
                <View style={styles.dropdownMenu}>
                  {(['system', 'zh', 'en'] as LanguagePreference[]).map((item) => {
                    const selected = languagePreference === item;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        key={item}
                        onPress={() => {
                          setLanguageMenuOpen(false);
                          void setLanguagePreference(item);
                        }}
                        style={({ pressed }) => [
                          styles.dropdownOption,
                          selected && styles.dropdownOptionActive,
                          pressed && styles.dropdownOptionPressed,
                        ]}
                      >
                        <Text style={[styles.dropdownOptionText, selected && styles.dropdownOptionTextActive]}>
                          {languagePreferenceLabel(item, t)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>{t('settings.geminiApiKey')}</Text>
            <TextInput
              value={apiKey}
              onChangeText={setApiKey}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={t('settings.apiKeyPlaceholder')}
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <Pressable
              accessibilityRole="link"
              onPress={openGeminiApiKeyPage}
              style={({ pressed }) => [styles.apiKeyHelpLink, pressed && styles.apiKeyHelpLinkPressed]}
            >
              <Text style={styles.apiKeyHelpLinkText}>{t('settings.apiKeyHelpLink')}</Text>
            </Pressable>
            <View style={styles.apiKeyActions}>
              <View style={styles.apiKeyActionRow}>
                <PrimaryButton
                  title={t('settings.clearApiKey')}
                  variant="danger"
                  onPress={confirmClearApiKey}
                  disabled={busy || !savedKey}
                  style={styles.apiKeyActionButton}
                />
                <PrimaryButton
                  title={t('settings.saveApiKey')}
                  onPress={saveCurrentApiKey}
                  loading={busy}
                  style={styles.apiKeyActionButton}
                />
              </View>
              <PrimaryButton
                title={t('settings.testConnection')}
                variant="secondary"
                onPress={testConnection}
                disabled={busy}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>{t('settings.servings')}</Text>
            <TextInput
              value={servings}
              onChangeText={setServings}
              keyboardType="number-pad"
              placeholder="2"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <Text style={styles.label}>{t('settings.maxTimeMinutes')}</Text>
            <TextInput
              value={maxTimeMinutes}
              onChangeText={setMaxTimeMinutes}
              keyboardType="number-pad"
              placeholder="30"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <Text style={styles.label}>{t('settings.preferredDifficulty')}</Text>
            <View style={styles.chipRow}>
              {(['any', '简单', '中等', '偏难'] as RecommendationDifficultyPreference[]).map((item) => {
                const selected = preferredDifficulty === item;
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={item}
                    onPress={() => setPreferredDifficulty(item)}
                    style={[styles.choiceChip, selected && styles.choiceChipActive]}
                  >
                    <Text style={[styles.choiceChipText, selected && styles.choiceChipTextActive]}>
                      {difficultyPreferenceLabel(item, t)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.label}>{t('settings.recentHistoryDays')}</Text>
            <TextInput
              value={recentHistoryDays}
              onChangeText={setRecentHistoryDays}
              keyboardType="number-pad"
              placeholder="7"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <Text style={styles.label}>{t('settings.dietaryPreferences')}</Text>
            <TextInput
              value={dietaryPreferences}
              onChangeText={setDietaryPreferences}
              placeholder={t('settings.dietaryPreferencesPlaceholder')}
              placeholderTextColor={colors.muted}
              multiline
              textAlignVertical="top"
              style={[styles.input, styles.multilineInput]}
            />
            <PrimaryButton title={t('settings.savePlain')} variant="secondary" onPress={savePlainSettings} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <AppConfirmModal
        visible={Boolean(confirmDialog)}
        title={confirmDialog?.title ?? ''}
        message={confirmDialog?.message ?? ''}
        cancelLabel={t('common.cancel')}
        confirmLabel={confirmDialog?.confirmLabel ?? ''}
        tone={confirmDialog?.tone}
        onCancel={() => setConfirmDialog(null)}
        onConfirm={() => confirmDialog?.onConfirm()}
      />
    </Screen>
  );
}

function languagePreferenceLabel(
  value: LanguagePreference,
  t: ReturnType<typeof useI18n>['t'],
) {
  if (value === 'system') {
    return t('settings.systemLanguage');
  }

  return value === 'zh' ? t('settings.chinese') : t('settings.english');
}

function difficultyPreferenceLabel(
  value: RecommendationDifficultyPreference,
  t: ReturnType<typeof useI18n>['t'],
) {
  if (value === '简单') {
    return t('difficulty.easy');
  }

  if (value === '中等') {
    return t('difficulty.medium');
  }

  if (value === '偏难') {
    return t('difficulty.hard');
  }

  return t('settings.difficultyAny');
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : null;
}

function parsePositiveNumber(value: string, fallback: number) {
  const numeric = Number(value.trim());
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : fallback;
}

function formatError(error: unknown, t: ReturnType<typeof useI18n>['t']) {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : t('common.unknown');
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  hero: {
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.sm,
    ...shadows.lift,
  },
  eyebrow: {
    color: 'rgba(255, 255, 255, 0.62)',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
    fontFamily: typography.strong,
  },
  title: {
    color: colors.textInverse,
    fontSize: 34,
    fontWeight: '900',
    fontFamily: typography.display,
    letterSpacing: 0.2,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.74)',
    lineHeight: 23,
    fontFamily: typography.body,
  },
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  languageSection: {
    zIndex: 30,
    elevation: 30,
  },
  label: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  dropdown: {
    gap: spacing.xs,
    position: 'relative',
    zIndex: 40,
  },
  dropdownButton: {
    minHeight: 52,
    borderRadius: radii.md,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownButtonPressed: {
    opacity: 0.86,
  },
  dropdownButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  dropdownCaret: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 58,
    left: 0,
    right: 0,
    zIndex: 50,
    ...shadows.card,
    elevation: 50,
    overflow: 'hidden',
    borderRadius: radii.md,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  dropdownOption: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  dropdownOptionActive: {
    backgroundColor: colors.ink,
  },
  dropdownOptionPressed: {
    opacity: 0.88,
  },
  dropdownOptionText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  dropdownOptionTextActive: {
    color: colors.textInverse,
  },
  input: {
    minHeight: 52,
    borderRadius: radii.md,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
    fontFamily: typography.body,
  },
  helper: {
    color: colors.muted,
    lineHeight: 20,
    fontWeight: '700',
  },
  apiKeyHelpLink: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  apiKeyHelpLinkPressed: {
    opacity: 0.72,
  },
  apiKeyHelpLinkText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '900',
    fontFamily: typography.strong,
    textDecorationLine: 'underline',
  },
  apiKeyActions: {
    gap: spacing.sm,
  },
  apiKeyActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  apiKeyActionButton: {
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  choiceChip: {
    borderRadius: radii.pill,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  choiceChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  choiceChipText: {
    color: colors.text,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  choiceChipTextActive: {
    color: colors.textInverse,
  },
  multilineInput: {
    minHeight: 104,
    paddingTop: spacing.md,
    lineHeight: 22,
  },
});
