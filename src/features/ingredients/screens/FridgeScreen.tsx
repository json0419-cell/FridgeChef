import { useCallback, useEffect, useMemo } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { Apple, SlidersHorizontal } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIngredientInventory } from '../hooks/useIngredientInventory';
import { useI18n } from '../../../i18n/i18n';
import { Button } from '../../../shared/components';
import { spacing, typography, useAppTheme, type AppColorTokens } from '../../../shared/theme/theme';
import type { FridgeStackScreenProps, Ingredient } from '../../../types';

type Props = FridgeStackScreenProps<'Fridge'>;
export function FridgeScreen({ navigation }: Props) {
  const { language, t } = useI18n();
  const { colors: appColors } = useAppTheme();
  const styles = useMemo(() => createStyles(appColors), [appColors]);
  const tabBarHeight = useBottomTabBarHeight();
  const { ingredients, loading, loadError, deleteError, loadIngredients, deleteInventoryIngredient } = useIngredientInventory();

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity accessibilityLabel={t('nav.settings')} accessibilityRole="button" onPress={() => navigation.navigate('Settings')} style={styles.headerSettingsButton}>
          <SlidersHorizontal size={20} color={appColors.textSecondary} strokeWidth={2} />
        </TouchableOpacity>
      ),
    });
  }, [appColors.textSecondary, navigation, styles.headerSettingsButton, t]);

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
    <SafeAreaView style={[styles.screen, { backgroundColor: appColors.canvas }]}>
      <FlatList
        data={ingredients}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={loadIngredients}
        contentContainerStyle={[styles.content, { paddingBottom: spacing.lg + tabBarHeight }]}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.intakeSection}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>{t('fridge.actionsTitle')}</Text>
              <View style={styles.actionRow}>
                <Button
                  title={t('fridge.addManual')}
                  onPress={() => navigation.navigate('AddIngredient', { mode: 'manual' })}
                  style={styles.actionButton}
                />
                <Button
                  title={t('fridge.scanPhoto')}
                  variant="secondary"
                  onPress={() => navigation.navigate('AddIngredient', { mode: 'photo' })}
                  style={styles.actionButton}
                />
              </View>
            </View>

            {loadError ? (
              <View accessible accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.errorCard}>
                <Text style={styles.errorTitle}>{t('fridge.loadFailed')}</Text>
                <Text style={styles.errorText}>{loadError}</Text>
              </View>
            ) : null}

            {deleteError ? (
              <View accessible accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.errorCard}>
                <Text style={styles.errorTitle}>{t('fridge.deleteFailed')}</Text>
                <Text style={styles.errorText}>{deleteError}</Text>
              </View>
            ) : null}

            <View style={styles.inventoryHeader}>
              <Text accessibilityRole="header" style={styles.inventoryTitle}>{t('fridge.inventoryTitle')}</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View accessible accessibilityLiveRegion="polite" accessibilityState={{ busy: true }} style={styles.loadingCard}>
              <ActivityIndicator color={appColors.primary} />
              <Text style={styles.loadingText}>{t('fridge.loading')}</Text>
            </View>
          ) : (
            <View style={styles.emptyStateCard}>
              <Text accessibilityRole="header" style={styles.emptyTitle}>{t('fridge.emptyTitle')}</Text>
              <Text style={styles.emptyText}>{t('fridge.emptyText')}</Text>
              <View style={styles.emptyActions}>
                <Button title={t('fridge.addManual')} onPress={() => navigation.navigate('AddIngredient', { mode: 'manual' })} />
                <Button
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
            <IngredientAvatar color={appColors.primary} backgroundColor={appColors.surfaceMuted} />
            <View style={styles.ingredientSummary}>
              <Text style={styles.ingredientName}>{item.name}</Text>
              <Text style={styles.meta}>
                {formatQuantity(item.quantity)} {item.unit}
              </Text>
              <Text style={styles.sourceText}>
                {item.source === 'photo' ? t('home.sourceAi') : t('home.sourceManual')} · {formatDate(item.createdAt, language)}
              </Text>
            </View>
            <View style={styles.rowActions}>
              <Pressable
                accessibilityLabel={t('fridge.editIngredient', { name: item.name })}
                accessibilityRole="button"
                style={styles.linkButton}
                onPress={() => navigation.navigate('AddIngredient', { ingredientId: item.id })}
              >
                <Text style={styles.linkText}>{t('common.edit')}</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={t('fridge.deleteIngredient', { name: item.name })}
                accessibilityRole="button"
                style={styles.linkButton}
                onPress={() => confirmDelete(item)}
              >
                <Text style={[styles.linkText, styles.deleteText]}>{t('common.delete')}</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function IngredientAvatar({ color, backgroundColor }: { color: string; backgroundColor: string }) {
  return (
    <View style={[avatarStyles.ingredientAvatar, { backgroundColor }]}>
      <Apple size={20} color={color} strokeWidth={2} />
    </View>
  );
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatDate(value: string, language: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(language === 'en' ? 'en-US' : 'zh-CN');
}

const avatarStyles = StyleSheet.create({
  ingredientAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

function createStyles(appColors: AppColorTokens) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: appColors.canvas,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: 0,
  },
  headerSettingsButton: {
    minHeight: 48,
    minWidth: 48,
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
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  sectionTitle: {
    color: appColors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 22,
  },
  actionButton: {
    flexGrow: 1,
    flexBasis: 160,
  },
  errorCard: {
    backgroundColor: appColors.surface,
    borderWidth: 1,
    borderColor: appColors.border,
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  errorTitle: {
    color: appColors.danger,
    fontSize: 16,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  errorText: {
    color: appColors.textPrimary,
    lineHeight: 21,
    fontFamily: typography.body,
  },
  loadingCard: {
    alignItems: 'center',
    backgroundColor: appColors.surface,
    borderWidth: 1,
    borderColor: appColors.border,
    borderRadius: 12,
    padding: 20,
    gap: spacing.sm,
  },
  loadingText: {
    color: appColors.textSecondary,
    fontWeight: '700',
    fontFamily: typography.body,
  },
  emptyActions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  emptyStateCard: {
    backgroundColor: appColors.surface,
    borderWidth: 1,
    borderColor: appColors.border,
    borderRadius: 12,
    padding: 20,
    gap: 8,
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
    fontWeight: '400',
    lineHeight: 20,
  },
  ingredientRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: appColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: appColors.border,
    paddingVertical: 10,
  },
  inventoryHeader: {
    marginBottom: 4,
  },
  inventoryTitle: {
    color: appColors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 22,
  },
  ingredientSummary: {
    flex: 1,
    gap: 2,
  },
  ingredientName: {
    color: appColors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: typography.strong,
  },
  meta: {
    color: appColors.textSecondary,
    fontSize: 14,
    fontWeight: '400',
  },
  sourceText: {
    color: appColors.textTertiary,
    fontSize: 12,
    fontFamily: typography.body,
  },
  rowActions: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
  },
  linkButton: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  linkText: {
    color: appColors.primary,
    fontSize: 15,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  deleteText: {
    color: appColors.danger,
  },
  });
}
