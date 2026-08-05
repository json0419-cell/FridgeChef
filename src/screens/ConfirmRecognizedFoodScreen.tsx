import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { CommonActions } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppCard, AppTextInput, Chip } from '../components/AppLayout';
import { addIngredients } from '../db/ingredientsRepository';
import { useI18n } from '../i18n/i18n';
import { colors, spacing } from '../styles/theme';
import type { FridgeStackScreenProps, IngredientDraft } from '../types';

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
              <Chip label={item.category || t('confirm.uncategorized')} tone="primary" />
              <Pressable accessibilityRole="button" onPress={() => removeItem(item.localId)}>
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
            <ActionButton title={t('confirm.submit', { count: validCount })} onPress={confirm} loading={saving} disabled={validCount === 0} />
          </View>
        }
      />
    </SafeAreaView>
  );
}

function ActionButton({ title, onPress, disabled = false, loading = false }: { title: string; onPress: () => void; disabled?: boolean; loading?: boolean }) {
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, inactive && styles.actionButtonDisabled, pressed && !inactive && styles.actionButtonPressed]}
    >
      {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
      <Text style={styles.actionButtonText}>{title}</Text>
    </Pressable>
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    backgroundColor: '#FFFFFF',
  },
  header: {
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
  emptyStateCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    padding: 20,
    gap: 6,
  },
  emptyTitle: {
    color: '#1A1A1A',
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 22,
  },
  emptyText: {
    color: '#6B6B6B',
    fontSize: 14,
    lineHeight: 20,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deleteText: {
    color: colors.danger,
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    paddingHorizontal: 16,
  },
  notes: {
    color: colors.muted,
    lineHeight: 20,
    fontWeight: '700',
  },
  footer: {
    marginTop: spacing.sm,
  },
  actionButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#1B4332',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  actionButtonDisabled: {
    opacity: 0.46,
  },
  actionButtonPressed: {
    opacity: 0.88,
  },
});
