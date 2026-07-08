import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { getRecipeById } from '../db/recipesRepository';
import { useI18n } from '../i18n/i18n';
import { colors, spacing } from '../styles/theme';
import type { Recipe, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'RecipeDetail'>;

export function RecipeDetailScreen({ route }: Props) {
  const { language, t } = useI18n();
  const [recipe, setRecipe] = useState<Recipe | null>(null);

  useEffect(() => {
    void getRecipeById(route.params.recipeId).then(setRecipe);
  }, [route.params.recipeId]);

  if (!recipe) {
    return (
      <Screen>
        <View style={styles.content}>
          <Text style={styles.title}>{t('recipe.notFound')}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{recipe.title}</Text>
        <View style={styles.chips}>
          {recipe.tags.map((tag) => (
            <Text key={tag} style={styles.chip}>
              {tag}
            </Text>
          ))}
        </View>
        <Section title={t('recipe.mainIngredients')} items={recipe.mainIngredients} language={language} />
        <Section
          title={t('recipe.seasonings')}
          items={recipe.seasonings.length > 0 ? recipe.seasonings : [t('recipe.noSeasonings')]}
          language={language}
        />
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('recipe.steps')}</Text>
          {recipe.steps.map((step, index) => (
            <View key={`${index}_${step}`} style={styles.stepRow}>
              <Text style={styles.stepNumber}>{index + 1}</Text>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

function Section({ title, items, language }: { title: string; items: string[]; language: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionText}>{items.join(language === 'en' ? ', ' : '、')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.chip,
    color: colors.primary,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontWeight: '800',
  },
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  sectionText: {
    color: colors.text,
    lineHeight: 23,
  },
  stepRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: colors.primary,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 26,
    fontWeight: '900',
  },
  stepText: {
    flex: 1,
    color: colors.text,
    lineHeight: 24,
  },
});
