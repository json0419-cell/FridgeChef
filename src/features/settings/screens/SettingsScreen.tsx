import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as ScreenCapture from 'expo-screen-capture';
import { AppCard, AppTextInput, FieldLabel, SectionHeader } from '../../../shared/components/AppLayout';
import { AppConfirmModal } from '../../../shared/components/AppConfirmModal';
import { useFeedback } from '../../../shared/components/AppFeedbackProvider';
import { testProviderConnection } from '../../../ai/providerAdapter';
import { useI18n, type LanguagePreference } from '../../../i18n/i18n';
import { requestAiDataConsent } from '../../../privacy/request-ai-data-consent';
import {
  clearApiKey,
  getApiKey,
  getSettings,
  markApiKeyVerified,
  saveApiKey,
  saveSettings,
} from '../../../storage/settingsStorage';
import { colors, spacing, typography } from '../../../shared/theme/theme';
import type { RecommendationDifficultyPreference, SettingsScreenProps } from '../../../types';

type Props = SettingsScreenProps;
type ActionButtonVariant = 'primary' | 'secondary' | 'destructive';
const GEMINI_API_KEY_URL = 'https://aistudio.google.com/app/apikey';
const CREDENTIAL_SCREEN_CAPTURE_KEY = 'gemini-api-key-settings';

type ConfirmDialogState = {
  title: string;
  message: string;
  confirmLabel: string;
  tone: 'danger' | 'info';
  onConfirm: () => void;
} | null;

export function SettingsScreen({ navigation }: Props) {
  useFocusEffect(
    useCallback(() => {
      void ScreenCapture.preventScreenCaptureAsync(CREDENTIAL_SCREEN_CAPTURE_KEY);
      return () => {
        void ScreenCapture.allowScreenCaptureAsync(CREDENTIAL_SCREEN_CAPTURE_KEY);
      };
    }, []),
  );
  const { language, languagePreference, setLanguagePreference, t } = useI18n();
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
    navigation.setOptions({
      headerStyle: { backgroundColor: '#FFFFFF' },
      headerShadowVisible: false,
      headerTintColor: '#1A1A1A',
      headerTitleStyle: {
        color: '#1A1A1A',
        fontSize: 20,
        fontWeight: '700',
      },
    });
  }, [navigation]);

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
    if (!(await requestAiDataConsent(language))) {
      return;
    }
    setBusy(true);
    try {
      const key = apiKey.trim() || (await getApiKey('gemini')) || '';
      await testProviderConnection('gemini', key);
      await saveApiKey('gemini', key);
      await markApiKeyVerified('gemini');
      setApiKey(key);
      setSavedApiKeyValue(key);
      setSavedKey(true);
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
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AppCard style={[styles.minimalCard, styles.languageSection]}>
            <FieldLabel>{t('settings.language')}</FieldLabel>
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
          </AppCard>

          <AppCard style={styles.minimalCard}>
            <SectionHeader title={t('settings.geminiApiKey')} />
            <AppTextInput
              value={apiKey}
              onChangeText={setApiKey}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={t('settings.apiKeyPlaceholder')}
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
                <ActionButton
                  title={t('settings.clearApiKey')}
                  variant="destructive"
                  onPress={confirmClearApiKey}
                  disabled={busy || !savedKey}
                  style={styles.apiKeyActionButton}
                />
                <ActionButton
                  title={t('settings.saveApiKey')}
                  onPress={saveCurrentApiKey}
                  loading={busy}
                  style={styles.apiKeyActionButton}
                />
              </View>
              <ActionButton
                title={t('settings.testConnection')}
                variant="secondary"
                onPress={testConnection}
                disabled={busy}
              />
            </View>
          </AppCard>

          <AppCard style={styles.minimalCard}>
            <SectionHeader title={t('settings.privacyTitle')} />
            <Text style={styles.helper}>{t('settings.privacySummary')}</Text>
            <ActionButton
              title={t('settings.openPrivacyPolicy')}
              variant="secondary"
              onPress={() => navigation.navigate('PrivacyPolicy')}
            />
          </AppCard>

          <AppCard style={styles.minimalCard}>
            <FieldLabel>{t('settings.servings')}</FieldLabel>
            <AppTextInput
              value={servings}
              onChangeText={setServings}
              keyboardType="number-pad"
              placeholder="2"
              style={styles.input}
            />
            <FieldLabel>{t('settings.maxTimeMinutes')}</FieldLabel>
            <AppTextInput
              value={maxTimeMinutes}
              onChangeText={setMaxTimeMinutes}
              keyboardType="number-pad"
              placeholder="30"
              style={styles.input}
            />
            <FieldLabel>{t('settings.preferredDifficulty')}</FieldLabel>
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
            <FieldLabel>{t('settings.recentHistoryDays')}</FieldLabel>
            <AppTextInput
              value={recentHistoryDays}
              onChangeText={setRecentHistoryDays}
              keyboardType="number-pad"
              placeholder="7"
              style={styles.input}
            />
            <FieldLabel>{t('settings.dietaryPreferences')}</FieldLabel>
            <AppTextInput
              value={dietaryPreferences}
              onChangeText={setDietaryPreferences}
              placeholder={t('settings.dietaryPreferencesPlaceholder')}
              multiline
              style={[styles.input, styles.multilineInput]}
            />
            <ActionButton title={t('settings.savePlain')} onPress={savePlainSettings} />
          </AppCard>
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
    </SafeAreaView>
  );
}

function ActionButton({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ActionButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const inactive = disabled || loading;
  const secondary = variant === 'secondary';
  const destructive = variant === 'destructive';
  const spinnerColor = secondary ? '#1B4332' : '#FFFFFF';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        secondary && styles.actionButtonSecondary,
        destructive && styles.actionButtonDestructive,
        inactive && styles.actionButtonDisabled,
        pressed && !inactive && styles.actionButtonPressed,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={spinnerColor} size="small" /> : null}
      <Text style={[styles.actionButtonText, secondary && styles.actionButtonTextSecondary, inactive && styles.actionButtonTextDisabled]}>{title}</Text>
    </Pressable>
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
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  languageSection: {
    zIndex: 30,
    elevation: 30,
  },
  actionButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#1B4332',
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButtonSecondary: {
    backgroundColor: 'transparent',
    borderColor: '#1B4332',
    borderWidth: 1,
  },
  actionButtonDestructive: {
    backgroundColor: '#E07A5F',
  },
  actionButtonDisabled: {
    opacity: 0.46,
  },
  actionButtonPressed: {
    opacity: 0.88,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    fontFamily: typography.strong,
  },
  actionButtonTextSecondary: {
    color: '#1B4332',
  },
  actionButtonTextDisabled: {
    color: '#6B6B6B',
  },
  minimalCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E5E5',
    borderRadius: 12,
    shadowOpacity: 0,
    elevation: 0,
  },
  input: {
    height: 48,
    minHeight: 48,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  dropdown: {
    gap: spacing.xs,
    position: 'relative',
    zIndex: 40,
  },
  dropdownButton: {
    minHeight: 52,
    borderRadius: 10,
    borderColor: '#E5E5E5',
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
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
    elevation: 50,
    overflow: 'hidden',
    borderRadius: 10,
    borderColor: '#E5E5E5',
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
  },
  dropdownOption: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  dropdownOptionActive: {
    backgroundColor: '#F5F7F5',
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
    color: '#1B4332',
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
    height: 32,
    borderRadius: 10,
    borderColor: '#E5E5E5',
    borderWidth: 1,
    backgroundColor: '#F5F7F5',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceChipActive: {
    backgroundColor: '#1B4332',
    borderColor: '#1B4332',
  },
  choiceChipText: {
    color: '#1A1A1A',
    fontWeight: '600',
    fontFamily: typography.strong,
  },
  choiceChipTextActive: {
    color: '#FFFFFF',
  },
  multilineInput: {
    height: 104,
    minHeight: 104,
    lineHeight: 22,
  },
});
