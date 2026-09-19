import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppCard, AppTextInput, SectionHeader } from '../../../shared/components/AppLayout';
import { Button as ActionButton } from '../../../shared/components/Foundation';
import { AppConfirmModal } from '../../../shared/components/AppConfirmModal';
import { useFeedback } from '../../../shared/components/AppFeedbackProvider';
import { testProviderConnection } from '../../../ai/providerAdapter';
import { useI18n } from '../../../i18n/i18n';
import { localizeError } from '../../../i18n/error-messages';
import { useCredentialCaptureProtection } from '../../../privacy/credential-capture-protection';
import { redactCredentials } from '../../../privacy/credential-redaction';
import { requestAiDataConsent } from '../../../privacy/request-ai-data-consent';
import { clearApiKey, getApiKey, markApiKeyVerified, saveApiKey } from '../../../storage/settingsStorage';
import { spacing, typography, useAppTheme, type AppColorTokens } from '../../../shared/theme/theme';
import type { ApiKeySettingsScreenProps } from '../../../types';

const GEMINI_API_KEY_URL = 'https://aistudio.google.com/app/apikey';

type ConfirmDialogState = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
} | null;

export function ApiKeySettingsScreen({ navigation, route }: ApiKeySettingsScreenProps) {
  useCredentialCaptureProtection();
  const { language, t } = useI18n();
  const { colors: appColors } = useAppTheme();
  const styles = useMemo(() => createStyles(appColors), [appColors]);
  const { showFeedback } = useFeedback();
  const [apiKey, setApiKey] = useState('');
  const [savedApiKeyValue, setSavedApiKeyValue] = useState('');
  const [savedKey, setSavedKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [keyRevealed, setKeyRevealed] = useState(false);
  const skipUnsavedApiKeyPromptRef = useRef(false);
  const hasUnsavedApiKey = apiKey.trim() !== savedApiKeyValue;

  useEffect(() => {
    void loadApiKey();
  }, []);

  useEffect(() => {
    if (!hasUnsavedApiKey) {
      return undefined;
    }

    return navigation.addListener('beforeRemove', (event) => {
      if (skipUnsavedApiKeyPromptRef.current) {
        return;
      }

      event.preventDefault();
      setConfirmDialog({
        title: t('settings.unsavedApiKeyTitle'),
        message: t('settings.unsavedApiKeyBody'),
        confirmLabel: t('settings.unsavedApiKeyDiscard'),
        onConfirm: () => {
          skipUnsavedApiKeyPromptRef.current = true;
          setConfirmDialog(null);
          navigation.dispatch(event.data.action);
        },
      });
    });
  }, [hasUnsavedApiKey, navigation, t]);

  const loadApiKey = async () => {
    const key = await getApiKey('gemini');
    setApiKey(key ?? '');
    setSavedApiKeyValue(key ?? '');
    setSavedKey(Boolean(key));
  };

  const saveCurrentApiKey = async () => {
    setBusy(true);
    try {
      const trimmedApiKey = apiKey.trim();
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
      // A setup step that sent the user here expects them back once the key passes. The key is
      // already saved, but `hasUnsavedApiKey` still reads stale this tick, so the unsaved-changes
      // guard would prompt about a draft that no longer exists. Skip it deliberately.
      if (route.params?.returnAfterVerified && navigation.canGoBack()) {
        skipUnsavedApiKeyPromptRef.current = true;
        navigation.goBack();
      }
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
    <SafeAreaView style={[styles.screen, { backgroundColor: appColors.canvas }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AppCard style={styles.minimalCard}>
            <SectionHeader title={t('settings.geminiApiKey')} />
            <AppTextInput
              accessibilityLabel={t('settings.geminiApiKey')}
              value={apiKey}
              onChangeText={setApiKey}
              secureTextEntry={!keyRevealed}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={t('settings.apiKeyPlaceholder')}
              style={styles.input}
            />
            <View style={styles.apiKeyInlineRow}>
              <Pressable
                accessibilityRole="link"
                onPress={openGeminiApiKeyPage}
                style={({ pressed }) => [styles.apiKeyHelpLink, pressed && styles.apiKeyHelpLinkPressed]}
              >
                <Text style={styles.apiKeyHelpLinkText}>{t('settings.apiKeyHelpLink')}</Text>
              </Pressable>
              {/* Revealing the key never lifts capture protection: the hook holds it for the
                  whole screen, so a revealed key stays out of screenshots and task previews. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={keyRevealed ? t('settings.hideApiKey') : t('settings.revealApiKey')}
                accessibilityState={{ expanded: keyRevealed }}
                onPress={() => setKeyRevealed((revealed) => !revealed)}
                style={({ pressed }) => [styles.apiKeyHelpLink, pressed && styles.apiKeyHelpLinkPressed]}
              >
                <Text style={styles.apiKeyHelpLinkText}>
                  {keyRevealed ? t('settings.hideApiKey') : t('settings.revealApiKey')}
                </Text>
              </Pressable>
            </View>
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
        </ScrollView>
      </KeyboardAvoidingView>
      <AppConfirmModal
        visible={Boolean(confirmDialog)}
        title={confirmDialog?.title ?? ''}
        message={confirmDialog?.message ?? ''}
        cancelLabel={t('common.cancel')}
        confirmLabel={confirmDialog?.confirmLabel ?? ''}
        toneLabel={t('common.confirmation')}
        tone="danger"
        onCancel={() => setConfirmDialog(null)}
        onConfirm={() => confirmDialog?.onConfirm()}
      />
    </SafeAreaView>
  );
}

function formatError(error: unknown, t: ReturnType<typeof useI18n>['t']) {
  const message = localizeError(error, t);
  // Storage and provider failures can quote the credential they were handed; this screen is the
  // one surface where the user may also have it revealed, so nothing key-shaped is shown back.
  return redactCredentials(message);
}

function createStyles(appColors: AppColorTokens) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: appColors.canvas,
    },
    flex: {
      flex: 1,
    },
    content: {
      padding: spacing.lg,
      gap: spacing.lg,
    },
    minimalCard: {
      backgroundColor: appColors.surface,
      borderColor: appColors.border,
      borderRadius: 12,
      shadowOpacity: 0,
      elevation: 0,
    },
    input: {
      height: 48,
      minHeight: 48,
      backgroundColor: appColors.surface,
      borderWidth: 1,
      borderColor: appColors.border,
      borderRadius: 10,
      paddingHorizontal: 16,
      fontSize: 16,
    },
    apiKeyInlineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    apiKeyHelpLink: {
      alignSelf: 'flex-start',
      minHeight: 48,
      minWidth: 48,
      justifyContent: 'center',
      paddingVertical: spacing.xs,
    },
    apiKeyHelpLinkPressed: {
      opacity: 0.72,
    },
    apiKeyHelpLinkText: {
      color: appColors.primary,
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
  });
}
