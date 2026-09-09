import { useCallback, useEffect } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { Apple, SlidersHorizontal } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIngredientInventory } from '../hooks/useIngredientInventory';
import { useI18n } from '../../../i18n/i18n';
import { colors, spacing, typography } from '../../../shared/theme/theme';
import type { FridgeStackScreenProps, Ingredient } from '../../../types';

type Props = FridgeStackScreenProps<'Fridge'>;
type ActionButtonVariant = 'primary' | 'secondary';

export function FridgeScreen({ navigation }: Props) {
  const { language, t } = useI18n();
  const tabBarHeight = useBottomTabBarHeight();
  const { ingredients, loading, loadError, deleteError, loadIngredients, deleteInventoryIngredient } = useIngredientInventory();

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity accessibilityLabel={t('nav.settings')} accessibilityRole="button" onPress={() => navigation.navigate('Settings')} style={styles.headerSettingsButton}>
          <SlidersHorizontal size={20} color="#6B6B6B" strokeWidth={2} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, t]);

  useFocusEffect(
    useCallback(() => {
      void loadIngredients();
    }, [loadIngredients]),
  );

  const confirmDelete = (ingredient: Ingredient) => {
    Alert.alert(t('home.deleteIngredientTitle'), t('home.deleteIngredientBody', { name: ingredient.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          const message = await deleteInventoryIngredient(ingredient.id);
          if (message) {
            Alert.alert(t('fridge.deleteFailed'), message);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={ingredients}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={loadIngredients}
        contentContainerStyle={[styles.content, { paddingBottom: spacing.lg + tabBarHeight }]}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.intakeSection}>
              <Text style={styles.sectionTitle}>{t('fridge.actionsTitle')}</Text>
              <View style={styles.actionRow}>
                <ActionButton
                  title={t('fridge.addManual')}
                  onPress={() => navigation.navigate('AddIngredient', { mode: 'manual' })}
                  style={styles.actionButton}
                />
                <ActionButton
                  title={t('fridge.scanPhoto')}
                  variant="secondary"
                  onPress={() => navigation.navigate('AddIngredient', { mode: 'photo' })}
                  style={styles.actionButton}
                />
              </View>
            </View>

            {loadError ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>{t('fridge.loadFailed')}</Text>
                <Text style={styles.errorText}>{loadError}</Text>
              </View>
            ) : null}

            {deleteError ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>{t('fridge.deleteFailed')}</Text>
                <Text style={styles.errorText}>{deleteError}</Text>
              </View>
            ) : null}

            <View style={styles.inventoryHeader}>
              <Text style={styles.inventoryTitle}>{t('fridge.inventoryTitle')}</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loadingText}>{t('fridge.loading')}</Text>
            </View>
          ) : (
            <View style={styles.emptyStateCard}>
              <Text style={styles.emptyTitle}>{t('fridge.emptyTitle')}</Text>
              <Text style={styles.emptyText}>{t('fridge.emptyText')}</Text>
              <View style={styles.emptyActions}>
                <ActionButton title={t('fridge.addManual')} onPress={() => navigation.navigate('AddIngredient', { mode: 'manual' })} />
                <ActionButton
                  title={t('fridge.scanPhoto')}
                  variant="secondary"
                  onPress={() => navigation.navigate('AddIngredient', { mode: 'photo' })}
                />
              </View>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.ingredientRow}>
            <IngredientAvatar />
            <View style={styles.ingredientSummary}>
              <Text style={styles.ingredientName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.meta}>
                {formatQuantity(item.quantity)} {item.unit}
              </Text>
              <Text style={styles.sourceText}>
                {item.source === 'photo' ? t('home.sourceAi') : t('home.sourceManual')} · {formatDate(item.createdAt, language)}
              </Text>
            </View>
            <View style={styles.rowActions}>
              <Pressable accessibilityRole="button" style={styles.linkButton} onPress={() => navigation.navigate('AddIngredient', { ingredientId: item.id })}>
                <Text style={styles.linkText}>{t('common.edit')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={styles.linkButton} onPress={() => confirmDelete(item)}>
                <Text style={[styles.linkText, styles.deleteText]}>{t('common.delete')}</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function IngredientAvatar() {
  return (
    <View style={styles.ingredientAvatar}>
      <Apple size={20} color="#1B4332" strokeWidth={2} />
    </View>
  );
}

function ActionButton({
  title,
  onPress,
  variant = 'primary',
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ActionButtonVariant;
  style?: StyleProp<ViewStyle>;
}) {
  const secondary = variant === 'secondary';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.solidButton,
        secondary ? styles.solidButtonSecondary : styles.solidButtonPrimary,
        pressed && styles.solidButtonPressed,
        style,
      ]}
    >
      <Text style={[styles.solidButtonText, secondary && styles.solidButtonTextSecondary]}>{title}</Text>
    </Pressable>
  );
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatDate(value: string, language: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(language === 'en' ? 'en-US' : 'zh-CN');
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: 0,
  },
  headerSettingsButton: {
    padding: 12,
    marginRight: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  intakeSection: {
    gap: spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  sectionTitle: {
    color: '#1A1A1A',
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 22,
  },
  actionButton: {
    flex: 1,
  },
  errorCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  errorTitle: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  errorText: {
    color: colors.text,
    lineHeight: 21,
    fontFamily: typography.body,
  },
  loadingCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    padding: 20,
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.muted,
    fontWeight: '700',
    fontFamily: typography.body,
  },
  emptyActions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  emptyStateCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    padding: 20,
    gap: 8,
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
    fontWeight: '400',
    lineHeight: 20,
  },
  solidButton: {
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  solidButtonPrimary: {
    height: 48,
    backgroundColor: '#1B4332',
  },
  solidButtonSecondary: {
    height: 48,
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E5E5',
    borderWidth: 1,
  },
  solidButtonPressed: {
    opacity: 0.88,
  },
  solidButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    fontFamily: typography.strong,
  },
  solidButtonTextSecondary: {
    color: '#1B4332',
  },
  ingredientRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    paddingVertical: 10,
  },
  ingredientAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F7F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inventoryHeader: {
    marginBottom: 4,
  },
  inventoryTitle: {
    color: '#1A1A1A',
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 22,
  },
  ingredientSummary: {
    flex: 1,
    gap: 2,
  },
  ingredientName: {
    color: '#1A1A1A',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: typography.strong,
  },
  meta: {
    color: '#6B6B6B',
    fontSize: 14,
    fontWeight: '400',
  },
  sourceText: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: typography.body,
  },
  rowActions: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
  },
  linkButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  linkText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  deleteText: {
    color: colors.danger,
  },
});
