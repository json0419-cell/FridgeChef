import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { generateRecipeFromYouTubeWithGemini } from '../ai/geminiAdapter';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppCard, AppTextInput, FieldLabel, SectionHeader } from '../components/AppLayout';
import {
  addUserRecipe,
  ensureDefaultUserRecipeLibrary,
  getUserRecipeById,
  listUserRecipeLibraries,
  listUserRecipes,
  updateUserRecipe,
} from '../db/userRecipesRepository';
import { useI18n } from '../i18n/i18n';
import { indexPersonalRecipeEmbedding } from '../rag/personalRagService';
import { getApiKey } from '../storage/settingsStorage';
import { colors, spacing, typography } from '../styles/theme';
import type {
  RecipesStackScreenProps,
  UserRecipe,
  UserRecipeDifficulty,
  UserRecipeLibrary,
  UserRecipeSourceType,
} from '../types';

type Props = RecipesStackScreenProps<'AddUserRecipe'>;
type TFunction = ReturnType<typeof useI18n>['t'];
type ActionButtonVariant = 'primary' | 'secondary';

const DIFFICULTIES: UserRecipeDifficulty[] = ['简单', '中等', '偏难', '未知'];

export function AddUserRecipeScreen({ navigation, route }: Props) {
  const { language, t } = useI18n();
  const recipeId = route.params?.recipeId;
  const initialLibraryId = route.params?.libraryId;
  const [existing, setExisting] = useState<UserRecipe | null>(null);
  const [libraries, setLibraries] = useState<UserRecipeLibrary[]>([]);
  const [libraryId, setLibraryId] = useState(initialLibraryId ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mainIngredients, setMainIngredients] = useState('');
  const [seasonings, setSeasonings] = useState('');
  const [steps, setSteps] = useState('');
  const [tags, setTags] = useState('');
  const [estimatedTimeMinutes, setEstimatedTimeMinutes] = useState('');
  const [difficulty, setDifficulty] = useState<UserRecipeDifficulty>('未知');
  const [sourceType, setSourceType] = useState<UserRecipeSourceType>('manual');
  const [sourceUrl, setSourceUrl] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeDuplicateTitle, setYoutubeDuplicateTitle] = useState('');
  const [checkingYoutubeDuplicate, setCheckingYoutubeDuplicate] = useState(false);
  const [generatingFromYoutube, setGeneratingFromYoutube] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const defaultLibrary = await ensureDefaultUserRecipeLibrary();
      const nextLibraries = await listUserRecipeLibraries();
      if (cancelled) {
        return;
      }

      setLibraries(nextLibraries);
      setLibraryId((current) => current || initialLibraryId || defaultLibrary.id);

      if (!recipeId) {
        return;
      }

      const recipe = await getUserRecipeById(recipeId);
      if (!recipe || cancelled) {
        return;
      }

      setExisting(recipe);
      setLibraryId(recipe.libraryId);
      setTitle(recipe.title);
      setDescription(recipe.description);
      setMainIngredients(recipe.mainIngredients.join('\n'));
      setSeasonings(recipe.seasonings.join('\n'));
      setSteps(recipe.steps.join('\n'));
      setTags(recipe.tags.join(language === 'en' ? ', ' : '、'));
      setEstimatedTimeMinutes(recipe.estimatedTimeMinutes ? String(recipe.estimatedTimeMinutes) : '');
      setDifficulty(recipe.difficulty);
      setSourceType(recipe.sourceType);
      setSourceUrl(recipe.sourceUrl);
      if (recipe.sourceType === 'youtube') {
        setYoutubeUrl(recipe.sourceUrl);
      }
    }

    void load().catch((error) => Alert.alert(t('addRecipe.loadFailed'), formatError(error, t)));
    return () => {
      cancelled = true;
    };
  }, [initialLibraryId, language, recipeId, t]);

  const save = async () => {
    const selectedLibraryId = libraryId.trim();
    const draft = {
      libraryId: selectedLibraryId,
      title: title.trim(),
      description: description.trim(),
      mainIngredients: parseList(mainIngredients),
      seasonings: parseList(seasonings),
      steps: parseSteps(steps),
      tags: parseList(tags),
      estimatedTimeMinutes: parseMinutes(estimatedTimeMinutes),
      difficulty,
      sourceUrl: sourceUrl.trim(),
      sourceType: inferSourceType(sourceType, sourceUrl),
    };

    if (!draft.libraryId) {
      Alert.alert(t('addRecipe.selectLibrary'));
      return;
    }

    if (!draft.title) {
      Alert.alert(t('addRecipe.titleRequired'));
      return;
    }

    if (draft.mainIngredients.length === 0) {
      Alert.alert(t('addRecipe.mainRequired'));
      return;
    }

    if (draft.steps.length === 0) {
      Alert.alert(t('addRecipe.stepsRequired'));
      return;
    }

    setSaving(true);
    try {
      const duplicate = await findDuplicateYoutubeRecipe(draft.libraryId, draft.sourceUrl, existing?.id);
      if (duplicate) {
        Alert.alert(t('addRecipe.duplicateTitle'), t('addRecipe.duplicateBody', { title: duplicate.title }));
        return;
      }

      if (existing) {
        await updateUserRecipe(existing.id, draft);
        void indexPersonalRecipeEmbedding(existing.id);
      } else {
        const savedRecipe = await addUserRecipe(draft);
        void indexPersonalRecipeEmbedding(savedRecipe.id);
      }
      navigation.goBack();
    } catch (error) {
      Alert.alert(t('addRecipe.saveFailed'), formatError(error, t));
    } finally {
      setSaving(false);
    }
  };

  const generateFromYoutube = async () => {
    const url = (youtubeUrl.trim() || sourceUrl.trim()).trim();
    const selectedLibraryId = libraryId.trim();

    if (!isYoutubeUrl(url)) {
      Alert.alert(t('addRecipe.invalidYoutubeTitle'), t('addRecipe.invalidYoutubeBody'));
      return;
    }

    if (!selectedLibraryId) {
      Alert.alert(t('addRecipe.selectLibrary'));
      return;
    }

    const duplicate = await checkYoutubeDuplicateForUrl(url, selectedLibraryId, true);
    if (duplicate) {
      Alert.alert(t('addRecipe.duplicateTitle'), t('addRecipe.duplicateBody', { title: duplicate.title }));
      return;
    }

    if (hasDraftContent({ title, description, mainIngredients, seasonings, steps, tags })) {
      Alert.alert(t('addRecipe.overwriteTitle'), t('addRecipe.overwriteBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('addRecipe.overwriteAction'), onPress: () => void runYoutubeGeneration(url) },
      ]);
      return;
    }

    void runYoutubeGeneration(url);
  };

  const checkYoutubeDuplicateForUrl = async (url: string, selectedLibraryId: string, updateInline: boolean) => {
    setCheckingYoutubeDuplicate(true);
    try {
      const duplicate = await findDuplicateYoutubeRecipe(selectedLibraryId, url, existing?.id);
      if (updateInline) {
        setYoutubeDuplicateTitle(duplicate?.title ?? '');
      }
      return duplicate;
    } finally {
      setCheckingYoutubeDuplicate(false);
    }
  };

  const runYoutubeGeneration = async (url: string) => {
    const apiKey = await getApiKey('gemini');

    if (!apiKey) {
      Alert.alert(t('addRecipe.missingKeyTitle'), t('addRecipe.missingKeyBody'));
      return;
    }

    setGeneratingFromYoutube(true);
    try {
      const generated = await generateRecipeFromYouTubeWithGemini({ apiKey, youtubeUrl: url, outputLanguage: language });
      setTitle(generated.title);
      setDescription(generated.description);
      setMainIngredients(generated.mainIngredients.join('\n'));
      setSeasonings(generated.seasonings.join('\n'));
      setSteps(generated.steps.join('\n'));
      setTags(generated.tags.join(language === 'en' ? ', ' : '、'));
      setEstimatedTimeMinutes(generated.estimatedTimeMinutes ? String(generated.estimatedTimeMinutes) : '');
      setDifficulty(generated.difficulty);
      setSourceType('youtube');
      setSourceUrl(generated.sourceUrl);
      setYoutubeUrl(generated.sourceUrl);
      Alert.alert(t('addRecipe.generatedTitle'), t('addRecipe.generatedBody'));
    } catch (error) {
      Alert.alert(t('addRecipe.youtubeFailed'), formatError(error, t));
    } finally {
      setGeneratingFromYoutube(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.pageIntro}>
            <Text style={styles.pageTitle}>{existing ? t('addRecipe.editTitle') : t('addRecipe.addTitle')}</Text>
            <Text style={styles.pageSubtitle}>{t('addRecipe.subtitle')}</Text>
          </View>

          <AppCard style={styles.card}>
            <SectionHeader title={t('addRecipe.saveToLibrary')} />
            <View style={styles.chipRow}>
              {libraries.map((library) => (
                <Pressable
                  key={library.id}
                  accessibilityRole="button"
                  onPress={() => {
                    setLibraryId(library.id);
                    setYoutubeDuplicateTitle('');
                  }}
                  style={[styles.choiceChip, library.id === libraryId && styles.choiceChipActive]}
                >
                  <Text style={[styles.choiceChipText, library.id === libraryId && styles.choiceChipTextActive]}>
                    {library.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </AppCard>

          <AppCard style={styles.card}>
            <SectionHeader title={t('addRecipe.youtubeTitle')} detail={t('addRecipe.youtubeHelper')} />
            <AppTextInput
              value={youtubeUrl}
              onChangeText={(value) => {
                setYoutubeUrl(value);
                setYoutubeDuplicateTitle('');
              }}
              onEndEditing={() => {
                const url = youtubeUrl.trim();
                const selectedLibraryId = libraryId.trim();
                if (isYoutubeUrl(url) && selectedLibraryId) {
                  void checkYoutubeDuplicateForUrl(url, selectedLibraryId, true);
                }
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://www.youtube.com/watch?v=..."
              style={styles.input}
            />
            {youtubeDuplicateTitle ? (
              <Text style={styles.warningText}>{t('addRecipe.duplicateInline', { title: youtubeDuplicateTitle })}</Text>
            ) : null}
            <ActionButton
              title={t('addRecipe.youtubeButton')}
              variant="secondary"
              onPress={() => void generateFromYoutube()}
              loading={generatingFromYoutube || checkingYoutubeDuplicate}
              disabled={saving || Boolean(youtubeDuplicateTitle)}
            />
          </AppCard>

          <Field label={t('addRecipe.recipeName')} value={title} onChangeText={setTitle} placeholder={t('addRecipe.recipeNamePlaceholder')} />
          <Field
            label={t('addRecipe.description')}
            value={description}
            onChangeText={setDescription}
            placeholder={t('addRecipe.descriptionPlaceholder')}
            multiline
          />
          <Field
            label={t('addRecipe.mainIngredients')}
            value={mainIngredients}
            onChangeText={setMainIngredients}
            placeholder={t('addRecipe.mainIngredientsPlaceholder')}
            multiline
          />
          <Field
            label={t('addRecipe.seasonings')}
            value={seasonings}
            onChangeText={setSeasonings}
            placeholder={t('addRecipe.seasoningsPlaceholder')}
            multiline
          />
          <Field
            label={t('addRecipe.steps')}
            value={steps}
            onChangeText={setSteps}
            placeholder={t('addRecipe.stepsPlaceholder')}
            multiline
            tall
          />
          <Field label={t('addRecipe.tags')} value={tags} onChangeText={setTags} placeholder={t('addRecipe.tagsPlaceholder')} />

          <View style={styles.row}>
            <View style={styles.flex}>
              <Field
                label={t('addRecipe.timeMinutes')}
                value={estimatedTimeMinutes}
                onChangeText={setEstimatedTimeMinutes}
                placeholder="15"
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.flex}>
              <FieldLabel>{t('addRecipe.difficulty')}</FieldLabel>
              <View style={styles.difficultyBox}>
                {DIFFICULTIES.map((item) => (
                  <Pressable
                    key={item}
                    accessibilityRole="button"
                    onPress={() => setDifficulty(item)}
                    style={[styles.difficultyChip, item === difficulty && styles.difficultyChipActive]}
                  >
                    <Text style={[styles.difficultyText, item === difficulty && styles.difficultyTextActive]}>{difficultyLabel(item, t)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          <Field
            label={t('addRecipe.sourceUrl')}
            value={sourceUrl}
            onChangeText={(value) => {
              setSourceUrl(value);
              if (!isYoutubeUrl(value)) {
                setSourceType('manual');
              }
            }}
            placeholder={t('addRecipe.sourceUrlPlaceholder')}
          />
          <ActionButton
            title={existing ? t('addRecipe.saveChanges') : t('addRecipe.saveToMine')}
            onPress={save}
            loading={saving}
            disabled={generatingFromYoutube}
          />
        </ScrollView>
      </KeyboardAvoidingView>
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

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.localButton,
        secondary && styles.localButtonSecondary,
        inactive && styles.localButtonDisabled,
        pressed && !inactive && styles.localButtonPressed,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={secondary ? '#1B4332' : '#FFFFFF'} size="small" /> : null}
      <Text style={[styles.localButtonText, secondary && styles.localButtonTextSecondary]}>{title}</Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  tall = false,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  tall?: boolean;
  keyboardType?: 'default' | 'number-pad';
}) {
  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <AppTextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        multiline={multiline}
        keyboardType={keyboardType}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[styles.input, multiline && styles.multilineInput, tall && styles.tallInput]}
      />
    </View>
  );
}

function parseList(value: string) {
  return value
    .split(/[\n,，、;；]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSteps(value: string) {
  return value
    .split(/\n+/)
    .map((item) => item.replace(/^\s*\d+[.、)]\s*/, '').trim())
    .filter(Boolean);
}

function parseMinutes(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : null;
}

function inferSourceType(currentSourceType: UserRecipeSourceType, sourceUrl: string): UserRecipeSourceType {
  if (isYoutubeUrl(sourceUrl)) {
    return 'youtube';
  }

  return currentSourceType === 'text' ? 'text' : 'manual';
}

function isYoutubeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.replace(/^www\./, '').toLowerCase();
    return hostname === 'youtube.com' || hostname.endsWith('.youtube.com') || hostname === 'youtu.be';
  } catch {
    return false;
  }
}

function hasDraftContent(fields: Record<string, string>) {
  return Object.values(fields).some((value) => value.trim().length > 0);
}

async function findDuplicateYoutubeRecipe(libraryId: string, sourceUrl: string, currentRecipeId?: string) {
  const targetKey = toYoutubeDuplicateKey(sourceUrl);
  if (!targetKey) {
    return null;
  }

  const recipes = await listUserRecipes(libraryId);
  return (
    recipes.find((recipe) => {
      if (recipe.id === currentRecipeId) {
        return false;
      }

      return toYoutubeDuplicateKey(recipe.sourceUrl) === targetKey;
    }) ?? null
  );
}

function toYoutubeDuplicateKey(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.replace(/^www\./, '').toLowerCase();
    if (hostname === 'youtu.be') {
      const videoId = firstPathSegment(url);
      return videoId ? `youtube:${videoId}` : normalizedUrlKey(url);
    }

    if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com')) {
      const watchVideoId = url.searchParams.get('v')?.trim();
      if (watchVideoId) {
        return `youtube:${watchVideoId}`;
      }

      const pathParts = url.pathname.split('/').filter(Boolean);
      if (['embed', 'shorts', 'live'].includes(pathParts[0]) && pathParts[1]) {
        return `youtube:${pathParts[1]}`;
      }

      return normalizedUrlKey(url);
    }

    return null;
  } catch {
    return null;
  }
}

function firstPathSegment(url: URL) {
  return url.pathname.split('/').filter(Boolean)[0]?.trim() ?? '';
}

function normalizedUrlKey(url: URL) {
  url.hash = '';
  url.searchParams.sort();
  return url.toString().replace(/\/$/, '').toLowerCase();
}

function difficultyLabel(value: UserRecipeDifficulty, t: TFunction) {
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

function formatError(error: unknown, t: TFunction) {
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
    paddingBottom: 40,
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
  pageSubtitle: {
    color: '#6B6B6B',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    padding: 16,
    shadowOpacity: 0,
    elevation: 0,
  },
  field: {
    gap: spacing.sm,
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
  warningText: {
    color: colors.danger,
    lineHeight: 20,
    fontWeight: '800',
  },
  multilineInput: {
    minHeight: 94,
    lineHeight: 22,
  },
  tallInput: {
    minHeight: 160,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  choiceChip: {
    borderRadius: 10,
    borderColor: '#E5E5E5',
    borderWidth: 1,
    backgroundColor: '#F5F7F5',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  choiceChipActive: {
    backgroundColor: '#1B4332',
    borderColor: '#1B4332',
  },
  choiceChipText: {
    color: '#1A1A1A',
    fontWeight: '600',
  },
  choiceChipTextActive: {
    color: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  difficultyBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    minHeight: 54,
    alignItems: 'center',
  },
  difficultyChip: {
    borderRadius: 10,
    borderColor: '#E5E5E5',
    borderWidth: 1,
    backgroundColor: '#F5F7F5',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  difficultyChipActive: {
    backgroundColor: '#1B4332',
    borderColor: '#1B4332',
  },
  difficultyText: {
    color: '#1A1A1A',
    fontWeight: '600',
  },
  difficultyTextActive: {
    color: '#FFFFFF',
  },
  localButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#1B4332',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  localButtonSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  localButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  localButtonTextSecondary: {
    color: '#1B4332',
  },
  localButtonDisabled: {
    opacity: 0.46,
  },
  localButtonPressed: {
    opacity: 0.88,
  },
});
