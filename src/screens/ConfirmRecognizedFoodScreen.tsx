import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { addIngredients } from '../db/ingredientsRepository';
import { useI18n } from '../i18n/i18n';
import { colors, gradients, radii, shadows, spacing, typography } from '../styles/theme';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ConfirmRecognizedFood'>;

interface EditableRecognizedItem {
  localId: string;
  name: string;
  quantity: string;
  unit: string;
  category: string;
  confidence: number;
  notes: string;
}

export function ConfirmRecognizedFoodScreen({ navigation, route }: Props) {
  const { t } = useI18n();
  const [items, setItems] = useState<EditableRecognizedItem[]>(
    route.params.items.map((item, index) => ({
      localId: `${index}_${item.name}`,
      name: item.name,
      quantity: item.estimatedQuantity === null ? '' : String(item.estimatedQuantity),
      unit: item.unit || t('common.defaultUnit'),
      category: item.category,
      confidence: item.confidence,
      notes: item.notes,
    })),
  );
  const [saving, setSaving] = useState(false);

  const validCount = useMemo(() => items.filter((item) => item.name.trim()).length, [items]);

  const updateItem = (localId: string, patch: Partial<EditableRecognizedItem>) => {
    setItems((current) => current.map((item) => (item.localId === localId ? { ...item, ...patch } : item)));
  };

  const removeItem = (localId: string) => {
    setItems((current) => current.filter((item) => item.localId !== localId));
  };

  const confirm = async () => {
    const drafts = items
      .filter((item) => item.name.trim())
      .map((item) => ({
        name: item.name.trim(),
        quantity: Number(item.quantity),
        unit: item.unit.trim() || t('common.defaultUnit'),
        source: 'photo' as const,
    }));

    if (drafts.length === 0) {
      Alert.alert(t('confirm.noItems'));
      return;
    }

    setSaving(true);
    try {
      await addIngredients(drafts);
      navigation.popToTop();
    } catch (error) {
      Alert.alert(t('confirm.addFailed'), error instanceof Error ? error.message : t('common.unknown'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(item) => item.localId}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
              <Text style={styles.eyebrow}>{t('confirm.eyebrow')}</Text>
              <Text style={styles.title}>{t('confirm.title')}</Text>
              <Text style={styles.subtitle}>{t('confirm.subtitle')}</Text>
            </LinearGradient>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t('confirm.emptyTitle')}</Text>
            <Text style={styles.emptyText}>{t('confirm.emptyText')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.category}>{item.category || t('confirm.uncategorized')}</Text>
              <Pressable accessibilityRole="button" onPress={() => removeItem(item.localId)}>
                <Text style={styles.deleteText}>{t('common.delete')}</Text>
              </Pressable>
            </View>
            <TextInput
              value={item.name}
              onChangeText={(value) => updateItem(item.localId, { name: value })}
              placeholder={t('confirm.namePlaceholder')}
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <View style={styles.row}>
              <TextInput
                value={item.quantity}
                onChangeText={(value) => updateItem(item.localId, { quantity: value })}
                keyboardType="decimal-pad"
                placeholder={t('confirm.quantityPlaceholder')}
                placeholderTextColor={colors.muted}
                style={[styles.input, styles.flex]}
              />
              <TextInput
                value={item.unit}
                onChangeText={(value) => updateItem(item.localId, { unit: value })}
                placeholder={t('confirm.unitPlaceholder')}
                placeholderTextColor={colors.muted}
                style={[styles.input, styles.flex]}
              />
            </View>
            <Text style={styles.notes}>
              {t('confirm.confidence', { value: Math.round(item.confidence * 100) })}
              {item.notes ? ` · ${item.notes}` : ''}
            </Text>
          </View>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <PrimaryButton title={t('confirm.submit', { count: validCount })} onPress={confirm} loading={saving} disabled={validCount === 0} />
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.sm,
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
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.74)',
    lineHeight: 22,
  },
  empty: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    borderColor: colors.border,
    borderWidth: 1,
    ...shadows.card,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    fontFamily: typography.display,
    marginBottom: spacing.sm,
  },
  emptyText: {
    color: colors.muted,
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
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  category: {
    color: colors.primary,
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    fontWeight: '900',
    overflow: 'hidden',
  },
  deleteText: {
    color: colors.danger,
    fontWeight: '900',
  },
  input: {
    minHeight: 50,
    borderRadius: radii.md,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    fontFamily: typography.body,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
  notes: {
    color: colors.muted,
    lineHeight: 20,
    fontWeight: '700',
  },
  footer: {
    marginTop: spacing.sm,
  },
});
