import type { ComponentType } from 'react';
import { useState } from 'react';
import { Archive, BookOpen, Clock, Cpu, Database, Key, Refrigerator, Trash2 } from 'lucide-react-native';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../../../i18n/i18n';
import { AppConfirmModal } from '../../../shared/components/AppConfirmModal';
import { useFeedback } from '../../../shared/components/AppFeedbackProvider';
import { radii, spacing, type AppColorTokens, useAppTheme } from '../../../shared/theme/theme';
import { clearLocalData } from '../../../storage/local-data-cleanup';
import {
  DATA_CLEANUP_STEP_TITLE_KEYS,
  DataCleanupAggregateError,
  type DataCleanupCategory,
  type DataCleanupStep,
} from '../../../storage/data-cleanup-policy';

interface CleanupItem {
  category: DataCleanupCategory;
  description: string;
  icon: ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  title: string;
}

export function DataManagementScreen() {
  const { resetLanguagePreference, t } = useI18n();
  const { showFeedback } = useFeedback();
  const { colors } = useAppTheme();
  const [pendingItem, setPendingItem] = useState<CleanupItem | null>(null);
  const [busyCategory, setBusyCategory] = useState<DataCleanupCategory | null>(null);
  const items: CleanupItem[] = [
    {
      category: 'caches',
      description: t('dataManagement.cachesDescription'),
      icon: Database,
      title: t('dataManagement.cachesTitle'),
    },
    {
      category: 'ingredients',
      description: t('dataManagement.ingredientsDescription'),
      icon: Refrigerator,
      title: t('dataManagement.ingredientsTitle'),
    },
    {
      category: 'history',
      description: t('dataManagement.historyDescription'),
      icon: Clock,
      title: t('dataManagement.historyTitle'),
    },
    {
      category: 'personalRecipes',
      description: t('dataManagement.personalRecipesDescription'),
      icon: BookOpen,
      title: t('dataManagement.personalRecipesTitle'),
    },
    {
      category: 'downloadedPacks',
      description: t('dataManagement.downloadedPacksDescription'),
      icon: Archive,
      title: t('dataManagement.downloadedPacksTitle'),
    },
    {
      category: 'model',
      description: t('dataManagement.modelDescription'),
      icon: Cpu,
      title: t('dataManagement.modelTitle'),
    },
    {
      category: 'apiKey',
      description: t('dataManagement.apiKeyDescription'),
      icon: Key,
      title: t('dataManagement.apiKeyTitle'),
    },
    {
      category: 'allUserData',
      description: t('dataManagement.allUserDataDescription'),
      icon: Trash2,
      title: t('dataManagement.allUserDataTitle'),
    },
  ];

  const stepTitle = (step: DataCleanupStep) => t(DATA_CLEANUP_STEP_TITLE_KEYS[step]);

  const confirmCleanup = async () => {
    const item = pendingItem;
    if (!item || busyCategory) {
      return;
    }

    setPendingItem(null);
    setBusyCategory(item.category);
    let cleanupError: unknown = null;

    try {
      await clearLocalData(item.category);
    } catch (error) {
      cleanupError = error;
    }

    if (item.category === 'allUserData') {
      try {
        await resetLanguagePreference();
      } catch (error) {
        cleanupError ??= error;
      }
    }

    if (!cleanupError) {
      showFeedback({
        tone: 'success',
        title: t('dataManagement.successTitle'),
        message: t('dataManagement.successBody', { name: item.title }),
      });
    } else if (cleanupError instanceof DataCleanupAggregateError) {
      // Only the failed steps' own category titles reach the user: never an error message, which
      // could carry a file path or stored content.
      const categories = cleanupError.failedSteps.map(stepTitle).join(t('dataManagement.partialCategorySeparator'));
      showFeedback({
        tone: 'error',
        title: t('dataManagement.partialTitle'),
        message: categories
          ? t('dataManagement.partialBodyCategories', { categories })
          : t('dataManagement.partialBody'),
      });
    } else {
      showFeedback({
        tone: 'error',
        title: t('dataManagement.failureTitle'),
        message: t('dataManagement.failureBody'),
      });
    }

    setBusyCategory(null);
  };

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg, paddingBottom: spacing.xxxl }}
      >
        <Text selectable style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 22 }}>
          {t('dataManagement.subtitle')}
        </Text>

        <View style={{ gap: spacing.md }}>
          {items.map((item) => (
            <CleanupCard
              key={item.category}
              busy={busyCategory === item.category}
              colors={colors}
              disabled={busyCategory !== null}
              item={item}
              onPress={() => setPendingItem(item)}
              actionLabel={t('dataManagement.clearAction')}
            />
          ))}
        </View>
      </ScrollView>

      <AppConfirmModal
        visible={Boolean(pendingItem)}
        title={t('dataManagement.confirmTitle', { name: pendingItem?.title ?? '' })}
        message={
          pendingItem?.category === 'allUserData'
            ? t('dataManagement.confirmAllBody')
            : t('dataManagement.confirmBody')
        }
        cancelLabel={t('common.cancel')}
        confirmLabel={t('dataManagement.confirmAction')}
        toneLabel={t('common.confirmation')}
        tone="danger"
        onCancel={() => setPendingItem(null)}
        onConfirm={() => void confirmCleanup()}
      />
    </SafeAreaView>
  );
}

function CleanupCard({
  actionLabel,
  busy,
  colors,
  disabled,
  item,
  onPress,
}: {
  actionLabel: string;
  busy: boolean;
  colors: AppColorTokens;
  disabled: boolean;
  item: CleanupItem;
  onPress: () => void;
}) {
  const Icon = item.icon;
  const isClearAll = item.category === 'allUserData';

  return (
    <View
      style={{
        borderRadius: radii.md,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: isClearAll ? colors.danger : colors.border,
        backgroundColor: colors.surface,
        padding: spacing.lg,
        gap: spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            borderCurve: 'continuous',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isClearAll ? colors.dangerMuted : colors.surfaceMuted,
          }}
        >
          <Icon color={isClearAll ? colors.danger : colors.primary} size={22} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text selectable style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700', lineHeight: 23 }}>
            {item.title}
          </Text>
          <Text selectable style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
            {item.description}
          </Text>
        </View>
      </View>

      <Pressable
        accessibilityLabel={`${actionLabel} ${item.title}`}
        accessibilityRole="button"
        accessibilityState={{ busy, disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => ({
          minHeight: 48,
          borderRadius: 12,
          borderCurve: 'continuous',
          borderWidth: 1,
          borderColor: colors.danger,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed && !disabled ? colors.dangerMuted : colors.surface,
          opacity: disabled && !busy ? 0.48 : 1,
        })}
      >
        {busy ? (
          <ActivityIndicator color={colors.danger} size="small" />
        ) : (
          <Text style={{ color: colors.danger, fontSize: 15, fontWeight: '700' }}>{actionLabel}</Text>
        )}
      </Pressable>
    </View>
  );
}
