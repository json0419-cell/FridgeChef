import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { recognizeFoodWithProvider } from '../ai/providerAdapter';
import { addIngredient, getIngredientById, updateIngredient } from '../db/ingredientsRepository';
import { useI18n } from '../i18n/i18n';
import { getApiKey, hasApiKey } from '../storage/settingsStorage';
import { colors, gradients, radii, shadows, spacing, typography } from '../styles/theme';
import type { Ingredient, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'AddIngredient'>;

export function AddIngredientScreen({ navigation, route }: Props) {
  const { language, t } = useI18n();
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
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(false);
    if (!permission.granted) {
      Alert.alert(t('addIngredient.permissionLibraryTitle'), t('addIngredient.permissionLibraryBody'));
      return;
    }

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
      Alert.alert(t('addIngredient.permissionCameraTitle'), t('addIngredient.permissionCameraBody'));
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
      Alert.alert(t('addIngredient.imageReadFailedTitle'), t('addIngredient.imageReadFailedBody'));
      return;
    }

    setPreviewUri(asset.uri);
    await recognize(asset);
  };

  const recognize = async (asset: ImagePicker.ImagePickerAsset) => {
    const apiKey = await getApiKey('gemini');

    if (!apiKey) {
      Alert.alert(t('addIngredient.missingKeyTitle'), t('addIngredient.missingKeyBody'));
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
      Alert.alert(t('addIngredient.recognitionFailed'), error instanceof Error ? error.message : t('common.unknown'));
    } finally {
      setRecognizing(false);
    }
  };

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert(t('addIngredient.nameRequired'));
      return;
    }

    setSaving(true);
    try {
      const numericQuantity = Number(quantity);
      if (existing) {
        await updateIngredient({
          ...existing,
          name: trimmedName,
          quantity: numericQuantity,
          unit: unit.trim() || t('common.defaultUnit'),
        });
      } else {
        await addIngredient({
          name: trimmedName,
          quantity: numericQuantity,
          unit: unit.trim() || t('common.defaultUnit'),
          source: 'manual',
        });
      }
      navigation.goBack();
    } catch (error) {
      Alert.alert(t('addIngredient.saveFailed'), error instanceof Error ? error.message : t('common.unknown'));
    } finally {
      setSaving(false);
    }
  };

  const showPhotoMode = !ingredientId && mode !== 'manual';
  const showManualMode = Boolean(ingredientId) || mode !== 'photo';

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <Text style={styles.eyebrow}>{t('addIngredient.eyebrow')}</Text>
            <Text style={styles.title}>
              {existing
                ? t('addIngredient.editTitle')
                : mode === 'photo'
                  ? t('addIngredient.photoTitle')
                  : mode === 'manual'
                    ? t('addIngredient.manualTitle')
                    : t('addIngredient.addTitle')}
            </Text>
            <Text style={styles.subtitle}>
              {existing
                ? t('addIngredient.editSubtitle')
                : mode === 'photo'
                  ? t('addIngredient.photoSubtitle')
                  : mode === 'manual'
                    ? t('addIngredient.manualSubtitle')
                    : t('addIngredient.addSubtitle')}
            </Text>
          </LinearGradient>

          {showPhotoMode ? (
            <View style={styles.aiCard}>
              <Text style={styles.aiTitle}>{t('addIngredient.photoCardTitle')}</Text>
              <Text style={styles.aiText}>Gemini · {apiKeyReady ? t('common.apiKeyConfigured') : t('common.apiKeyMissing')}</Text>
              {previewUri ? <Image source={{ uri: previewUri }} style={styles.preview} /> : null}
              <View style={styles.aiActions}>
                <PrimaryButton title={t('addIngredient.takePhoto')} onPress={takePhoto} loading={recognizing} style={styles.aiButton} />
                <PrimaryButton
                  title={t('addIngredient.pickPhoto')}
                  variant="secondary"
                  onPress={chooseFromLibrary}
                  disabled={recognizing}
                  style={styles.aiButton}
                />
                <PrimaryButton title={t('addIngredient.goSettings')} variant="secondary" onPress={() => navigation.navigate('Settings')} style={styles.aiButton} />
              </View>
            </View>
          ) : null}

          {showManualMode ? (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>{t('addIngredient.name')}</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder={t('addIngredient.namePlaceholder')}
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />
              </View>
              <View style={styles.row}>
                <View style={[styles.field, styles.flex]}>
                  <Text style={styles.label}>{t('addIngredient.quantity')}</Text>
                  <TextInput
                    value={quantity}
                    onChangeText={setQuantity}
                    keyboardType="decimal-pad"
                    placeholder="4"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                  />
                </View>
                <View style={[styles.field, styles.flex]}>
                  <Text style={styles.label}>{t('addIngredient.unit')}</Text>
                  <TextInput
                    value={unit}
                    onChangeText={setUnit}
                    placeholder={t('addIngredient.unitPlaceholder')}
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                  />
                </View>
              </View>
              <PrimaryButton title={existing ? t('addIngredient.saveChanges') : t('addIngredient.addManual')} onPress={save} loading={saving} />
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
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
    letterSpacing: 1.6,
    fontFamily: typography.strong,
  },
  title: {
    color: colors.textInverse,
    fontSize: 36,
    fontWeight: '900',
    fontFamily: typography.display,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.74)',
    lineHeight: 22,
  },
  aiCard: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  aiTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  aiText: {
    color: colors.muted,
    lineHeight: 21,
  },
  preview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radii.lg,
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
  },
  field: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  label: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  input: {
    minHeight: 54,
    borderRadius: radii.md,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    fontSize: 17,
    fontFamily: typography.body,
    ...shadows.card,
  },
});
