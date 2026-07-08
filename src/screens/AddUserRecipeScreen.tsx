import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { generateRecipeFromYouTubeWithGemini } from '../ai/geminiAdapter';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
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
import { colors, gradients, radii, shadows, spacing, typography } from '../styles/theme';
import type {
  RootStackParamList,
  UserRecipe,
  UserRecipeDifficulty,
  UserRecipeLibrary,
  UserRecipeSourceType,
} from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'AddUserRecipe'>;
type TFunction = ReturnType<typeof useI18n>['t'];

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
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <Text style={styles.eyebrow}>{t('addRecipe.eyebrow')}</Text>
            <Text style={styles.title}>{existing ? t('addRecipe.editTitle') : t('addRecipe.addTitle')}</Text>
            <Text style={styles.subtitle}>{t('addRecipe.subtitle')}</Text>
          </LinearGradient>

          <View style={styles.card}>
            <Text style={styles.label}>{t('addRecipe.saveToLibrary')}</Text>
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
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>{t('addRecipe.youtubeTitle')}</Text>
            <Text style={styles.helper}>{t('addRecipe.youtubeHelper')}</Text>
            <TextInput
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
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            {youtubeDuplicateTitle ? (
              <Text style={styles.warningText}>{t('addRecipe.duplicateInline', { title: youtubeDuplicateTitle })}</Text>
            ) : null}
            <PrimaryButton
              title={t('addRecipe.youtubeButton')}
              variant="secondary"
              onPress={() => void generateFromYoutube()}
              loading={generatingFromYoutube || checkingYoutubeDuplicate}
              disabled={saving || Boolean(youtubeDuplicateTitle)}
            />
          </View>

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
              <Text style={styles.label}>{t('addRecipe.difficulty')}</Text>
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
          <PrimaryButton
            title={existing ? t('addRecipe.saveChanges') : t('addRecipe.saveToMine')}
            onPress={save}
            loading={saving}
            disabled={generatingFromYoutube}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
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
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
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
    fontSize: 34,
    fontWeight: '900',
    fontFamily: typography.display,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.74)',
    lineHeight: 22,
  },
  card: {
    gap: spacing.md,
    borderRadius: radii.lg,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    ...shadows.card,
  },
  field: {
    gap: spacing.sm,
  },
  label: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  helper: {
    color: colors.muted,
    lineHeight: 20,
    fontWeight: '700',
  },
  warningText: {
    color: colors.danger,
    lineHeight: 20,
    fontWeight: '800',
  },
  input: {
    minHeight: 54,
    borderRadius: radii.md,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    fontFamily: typography.body,
    ...shadows.card,
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
    borderRadius: radii.pill,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surface,
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
  },
  choiceChipTextActive: {
    color: colors.textInverse,
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
    borderRadius: radii.pill,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  difficultyChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  difficultyText: {
    color: colors.text,
    fontWeight: '900',
  },
  difficultyTextActive: {
    color: colors.textInverse,
  },
});
