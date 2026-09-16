import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { CommonActions } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppCard, AppTextInput, Button, StatusBadge } from '../../../shared/components';
import { addIngredients } from '../../../db/ingredientsRepository';
import { useI18n } from '../../../i18n/i18n';
import { spacing, useAppTheme, type AppColorTokens } from '../../../shared/theme/theme';
import type { FridgeStackScreenProps, IngredientDraft } from '../../../types';

type Props = FridgeStackScreenProps<'ConfirmRecognizedFood'>;

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
  const { colors: appColors } = useAppTheme();
  const styles = useMemo(() => createStyles(appColors), [appColors]);
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
    const drafts: IngredientDraft[] = [];
    for (const item of items) {
      const name = item.name.trim();
      if (!name) {
        continue;
      }

      const quantity = parseConfirmedQuantity(item.quantity);
      if (quantity === null) {
        Alert.alert(t('confirm.quantityInvalid'));
        return;
      }

      drafts.push({
        name,
        quantity,
        unit: item.unit.trim() || t('common.defaultUnit'),
        source: 'photo' as const,
      });
    }

    if (drafts.length === 0) {
      Alert.alert(t('confirm.noItems'));
      return;
    }

    setSaving(true);
    try {
      await addIngredients(drafts);
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'Fridge' }],
        }),
      );
    } catch (error) {
      Alert.alert(t('confirm.addFailed'), error instanceof Error ? error.message : t('common.unknown'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.localId}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.pageTitle}>{t('confirm.title')}</Text>
            <Text style={styles.pageSubtitle}>{t('confirm.subtitle')}</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyStateCard}>
            <Text style={styles.emptyTitle}>{t('confirm.emptyTitle')}</Text>
            <Text style={styles.emptyText}>{t('confirm.emptyText')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <AppCard style={styles.card}>
            <View style={styles.cardTop}>
              <StatusBadge label={item.category || t('confirm.uncategorized')} tone="success" />
              <Pressable accessibilityLabel={t('common.delete')} accessibilityRole="button" onPress={() => removeItem(item.localId)} style={styles.deleteButton}>
                <Text style={styles.deleteText}>{t('common.delete')}</Text>
              </Pressable>
            </View>
            <AppTextInput
              value={item.name}
              onChangeText={(value) => updateItem(item.localId, { name: value })}
              placeholder={t('confirm.namePlaceholder')}
              style={styles.input}
            />
            <View style={styles.row}>
              <AppTextInput
                value={item.quantity}
                onChangeText={(value) => updateItem(item.localId, { quantity: value })}
                keyboardType="decimal-pad"
                placeholder={t('confirm.quantityPlaceholder')}
                style={[styles.input, styles.flex]}
              />
              <AppTextInput
                value={item.unit}
                onChangeText={(value) => updateItem(item.localId, { unit: value })}
                placeholder={t('confirm.unitPlaceholder')}
                style={[styles.input, styles.flex]}
              />
            </View>
            <Text style={styles.notes}>
              {t('confirm.confidence', { value: Math.round(item.confidence * 100) })}
              {item.notes ? ` · ${item.notes}` : ''}
            </Text>
          </AppCard>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <Button title={t('confirm.submit', { count: validCount })} onPress={confirm} loading={saving} disabled={validCount === 0} fullWidth />
          </View>
        }
      />
    </SafeAreaView>
  );
}

function parseConfirmedQuantity(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function createStyles(appColors: AppColorTokens) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: appColors.canvas,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    backgroundColor: appColors.canvas,
  },
  header: {
    gap: 6,
  },
  pageTitle: {
    color: appColors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
  },
  pageSubtitle: {
    color: appColors.textSecondary,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
  card: {
    backgroundColor: appColors.surface,
    borderWidth: 1,
    borderColor: appColors.border,
    borderRadius: 12,
    padding: 16,
    shadowOpacity: 0,
    elevation: 0,
  },
  emptyStateCard: {
    backgroundColor: appColors.surface,
    borderWidth: 1,
    borderColor: appColors.border,
    borderRadius: 12,
    padding: 20,
    gap: 6,
  },
  emptyTitle: {
    color: appColors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 22,
  },
  emptyText: {
    color: appColors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deleteButton: {
    minHeight: 48,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    color: appColors.danger,
    fontWeight: '900',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
  input: {
    height: 48,
    minHeight: 48,
    backgroundColor: appColors.surface,
    borderWidth: 1,
    borderColor: appColors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
  },
  notes: {
    color: appColors.textSecondary,
    lineHeight: 20,
    fontWeight: '700',
  },
  footer: {
    marginTop: spacing.sm,
  },
  });
}
