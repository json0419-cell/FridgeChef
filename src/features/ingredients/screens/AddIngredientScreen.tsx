import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronRight } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppTextInput } from '../../../shared/components/AppLayout';
import { useFeedback } from '../../../shared/components/AppFeedbackProvider';
import { recognizeFoodWithProvider } from '../../../ai/providerAdapter';
import { addIngredient, getIngredientById, updateIngredient } from '../../../db/ingredientsRepository';
import { useI18n } from '../../../i18n/i18n';
import { requestAiDataConsent } from '../../../privacy/request-ai-data-consent';
import { getApiKey, hasApiKey } from '../../../storage/settingsStorage';
import { colors, spacing } from '../../../shared/theme/theme';
import type { FridgeStackScreenProps, Ingredient } from '../../../types';

type Props = FridgeStackScreenProps<'AddIngredient'>;
type ActionButtonVariant = 'primary' | 'secondary';

export function AddIngredientScreen({ navigation, route }: Props) {
  const { language, t } = useI18n();
  const { showFeedback } = useFeedback();
  const ingredientId = route.params?.ingredientId;
  const mode = route.params?.mode;
  const [existing, setExisting] = useState<Ingredient | null>(null);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState(t('common.defaultPieceUnit'));
  const [saving, setSaving] = useState(false);
  const [apiKeyReady, setApiKeyReady] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [recognizing, setRecognizing] = useState(false);

  useEffect(() => {
    if (!ingredientId) {
      return;
    }

    void getIngredientById(ingredientId).then((ingredient) => {
      if (!ingredient) {
        return;
      }

      setExisting(ingredient);
      setName(ingredient.name);
      setQuantity(String(ingredient.quantity));
      setUnit(ingredient.unit);
    });
  }, [ingredientId]);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;

      void hasApiKey('gemini').then((ready) => {
        if (!mounted) {
          return;
        }

        setApiKeyReady(ready);
      });

      return () => {
        mounted = false;
      };
    }, []),
  );

  const chooseFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.7,
    });

    await handlePickerResult(result);
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showFeedback({ tone: 'info', title: t('addIngredient.permissionCameraTitle'), message: t('addIngredient.permissionCameraBody') });
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.7,
    });

    await handlePickerResult(result);
  };

  const handlePickerResult = async (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];
    if (!asset?.base64) {
      showFeedback({ tone: 'error', title: t('addIngredient.imageReadFailedTitle'), message: t('addIngredient.imageReadFailedBody') });
      return;
    }

    setPreviewUri(asset.uri);
    await recognize(asset);
  };

  const recognize = async (asset: ImagePicker.ImagePickerAsset) => {
    const apiKey = await getApiKey('gemini');

    if (!apiKey) {
      showFeedback({ tone: 'info', title: t('addIngredient.missingKeyTitle'), message: t('addIngredient.missingKeyBody') });
      return;
    }

    if (!(await requestAiDataConsent(language))) {
      return;
    }

    setRecognizing(true);
    try {
      const result = await recognizeFoodWithProvider({
        provider: 'gemini',
        apiKey,
        imageBase64: asset.base64 ?? '',
        mimeType: guessMimeType(asset),
        outputLanguage: language,
      });

      navigation.navigate('ConfirmRecognizedFood', { items: result.items });
    } catch (error) {
      showFeedback({
        tone: 'error',
        title: t('addIngredient.recognitionFailed'),
        message: error instanceof Error ? error.message : t('common.unknown'),
      });
    } finally {
      setRecognizing(false);
    }
  };

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showFeedback({ tone: 'error', title: t('addIngredient.nameRequired') });
      return;
    }

    const parsedQuantity = parseIngredientQuantity(quantity);
    if (parsedQuantity === null) {
      showFeedback({ tone: 'error', title: t('addIngredient.quantityInvalid') });
      return;
    }

    setSaving(true);
    try {
      if (existing) {
        await updateIngredient({
          ...existing,
          name: trimmedName,
          quantity: parsedQuantity,
          unit: unit.trim(),
        });
      } else {
        await addIngredient({
          name: trimmedName,
          quantity: parsedQuantity,
          unit: unit.trim(),
          source: 'manual',
        });
      }
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('Fridge');
      }
    } catch (error) {
      showFeedback({
        tone: 'error',
        title: t('addIngredient.saveFailed'),
        message: error instanceof Error ? error.message : t('common.unknown'),
      });
    } finally {
      setSaving(false);
    }
  };

  const showPhotoMode = !ingredientId && mode !== 'manual';
  const showManualMode = Boolean(ingredientId) || mode !== 'photo';

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {showManualMode ? (
            <View style={styles.pageIntro}>
              <Text style={styles.pageTitle}>
                {existing ? t('addIngredient.editTitle') : mode === 'manual' ? t('addIngredient.manualTitle') : t('addIngredient.addTitle')}
              </Text>
            </View>
          ) : null}

          {showPhotoMode ? (
            <View style={styles.scanSection}>
              {previewUri ? <Image source={{ uri: previewUri }} style={styles.preview} /> : null}
              <View style={styles.aiActions}>
                <ActionButton title={t('addIngredient.takePhoto')} onPress={takePhoto} loading={recognizing} style={styles.aiButton} />
                <ActionButton
                  title={t('addIngredient.pickPhoto')}
                  variant="secondary"
                  onPress={chooseFromLibrary}
                  disabled={recognizing}
                  style={styles.aiButton}
                />
              </View>
              {!apiKeyReady ? (
                <TouchableOpacity accessibilityRole="link" onPress={() => navigation.navigate('ApiKeySettings')} style={styles.setupRow}>
                  <Text style={styles.setupRowText}>{scanSetupText(language)}</Text>
                  <ChevronRight size={14} color="#6B6B6B" />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {showManualMode ? (
            <>
              <View style={styles.field}>
                <FormLabel>{t('addIngredient.name')}</FormLabel>
                <AppTextInput
                  value={name}
                  onChangeText={setName}
                  placeholder={t('addIngredient.namePlaceholder')}
                  style={styles.input}
                />
              </View>
              <View style={styles.row}>
                <View style={[styles.field, styles.flex]}>
                  <FormLabel>{t('addIngredient.quantity')}</FormLabel>
                  <AppTextInput
                    value={quantity}
                    onChangeText={setQuantity}
                    keyboardType="decimal-pad"
                    placeholder="4"
                    style={styles.input}
                  />
                </View>
                <View style={[styles.field, styles.flex]}>
                  <FormLabel>{t('addIngredient.unit')}</FormLabel>
                  <AppTextInput
                    value={unit}
                    onChangeText={setUnit}
                    placeholder={t('addIngredient.unitPlaceholder')}
                    style={styles.input}
                  />
                </View>
              </View>
              <ActionButton title={existing ? t('addIngredient.saveChanges') : t('addIngredient.addManual')} onPress={save} loading={saving} />
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FormLabel({ children }: { children: string }) {
  return <Text style={styles.formLabel}>{children}</Text>;
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

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        secondary ? styles.actionButtonSecondary : styles.actionButtonPrimary,
        inactive && styles.actionButtonDisabled,
        pressed && !inactive && styles.actionButtonPressed,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={secondary ? '#1B4332' : '#FFFFFF'} size="small" /> : null}
      <Text style={[styles.actionButtonText, secondary && styles.actionButtonTextSecondary]}>{title}</Text>
    </Pressable>
  );
}

function guessMimeType(asset: ImagePicker.ImagePickerAsset) {
  if (asset.mimeType) {
    return asset.mimeType;
  }

  const uri = asset.uri.toLowerCase();
  if (uri.endsWith('.png')) {
    return 'image/png';
  }

  if (uri.endsWith('.webp')) {
    return 'image/webp';
  }

  return 'image/jpeg';
}

function parseIngredientQuantity(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function scanSetupText(language: string) {
  return language === 'en' ? 'Photo scan requires Gemini setup' : '照片识别需要先设置 Gemini';
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
    backgroundColor: '#FFFFFF',
  },
  pageIntro: {
    gap: 6,
  },
  pageTitle: {
    color: '#1A1A1A',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
  },
  scanSection: {
    gap: spacing.sm,
  },
  preview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 12,
    backgroundColor: colors.border,
    borderColor: colors.borderStrong,
    borderWidth: 1,
  },
  aiActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  aiButton: {
    flexGrow: 1,
    flexBasis: 0,
  },
  setupRow: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#E5E5E5',
  },
  setupRowText: {
    flex: 1,
    color: '#6B6B6B',
    fontSize: 14,
    fontWeight: '400',
  },
  actionButton: {
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButtonPrimary: {
    height: 48,
    backgroundColor: '#1B4332',
  },
  actionButtonSecondary: {
    height: 40,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  actionButtonTextSecondary: {
    color: '#1B4332',
  },
  actionButtonDisabled: {
    opacity: 0.46,
  },
  actionButtonPressed: {
    opacity: 0.88,
  },
  field: {
    gap: 0,
  },
  formLabel: {
    color: '#6B6B6B',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  input: {
    height: 48,
    minHeight: 48,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});
