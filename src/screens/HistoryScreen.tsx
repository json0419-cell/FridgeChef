import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { deleteCookedHistory, listCookedHistory } from '../db/cookedHistoryRepository';
import { useI18n } from '../i18n/i18n';
import { colors, radii, shadows, spacing, typography } from '../styles/theme';
import type { CookedRecipeHistory, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'History'>;
type TFunction = ReturnType<typeof useI18n>['t'];

type TimelineItem =
  | { kind: 'date'; id: string; label: string }
  | { kind: 'history'; id: string; item: CookedRecipeHistory };

export function HistoryScreen({ navigation }: Props) {
  const { language, t } = useI18n();
  const [history, setHistory] = useState<CookedRecipeHistory[]>([]);
  const [loading, setLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      setHistory(await listCookedHistory(200));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadHistory();
    }, [loadHistory]),
  );

  const timelineItems = useMemo(() => buildTimelineItems(history, language, t), [history, language, t]);

  const removeItem = (item: CookedRecipeHistory) => {
    Alert.alert(t('history.deleteTitle'), t('history.deleteBody', { title: item.title }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteCookedHistory(item.id);
          await loadHistory();
        },
      },
    ]);
  };

  return (
    <Screen>
      <FlatList
        data={timelineItems}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={loadHistory}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>{t('history.title')}</Text>
            <PrimaryButton title={t('history.goRecommendations')} variant="secondary" onPress={() => navigation.navigate('Recommendations')} />
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t('history.emptyTitle')}</Text>
            <Text style={styles.emptyText}>{t('history.emptyText')}</Text>
            <PrimaryButton title={t('history.goPage')} onPress={() => navigation.navigate('Recommendations')} />
          </View>
        }
        renderItem={({ item }) =>
          item.kind === 'date' ? (
            <View style={styles.dateRow}>
              <View style={styles.dateDot} />
              <Text style={styles.dateLabel}>{item.label}</Text>
            </View>
          ) : (
            <View style={styles.historyRow}>
              <View style={styles.timelineRail}>
                <View style={styles.timelineDot} />
              </View>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleBox}>
                    <Text style={styles.recipeTitle}>{item.item.title}</Text>
                    <Text style={styles.meta}>
                      {formatTime(item.item.cookedAt, language)} · {sourceLabel(item.item.source, t)}
                    </Text>
                  </View>
                  <Pressable accessibilityRole="button" style={styles.deleteButton} onPress={() => removeItem(item.item)}>
                    <Text style={styles.deleteText}>{t('common.delete')}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )
        }
      />
    </Screen>
  );
}

function buildTimelineItems(history: CookedRecipeHistory[], language: string, t: TFunction): TimelineItem[] {
  const items: TimelineItem[] = [];
  let currentDateKey = '';

  for (const item of history) {
    const dateKey = toDateKey(item.cookedAt);
    if (dateKey !== currentDateKey) {
      currentDateKey = dateKey;
      items.push({
        kind: 'date',
        id: `date_${dateKey}`,
        label: formatDateLabel(item.cookedAt, language, t),
      });
    }

    items.push({
      kind: 'history',
      id: item.id,
      item,
    });
  }

  return items;
}

function toDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function formatDateLabel(value: string, language: string, t: TFunction) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const today = new Date();
  if (isSameDate(date, today)) {
    return t('history.today');
  }

  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (isSameDate(date, yesterday)) {
    return t('history.yesterday');
  }

  return date.toLocaleDateString(language === 'en' ? 'en-US' : 'zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

function isSameDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatTime(value: string, language: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString(language === 'en' ? 'en-US' : 'zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function sourceLabel(value: CookedRecipeHistory['source'], t: TFunction) {
  if (value === 'refined') {
    return t('history.sourceRefined');
  }

  if (value === 'rag') {
    return t('history.sourceRag');
  }

  return t('history.sourceStructured');
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: spacing.xl,
    ...shadows.card,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
    fontFamily: typography.display,
  },
  empty: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.xl,
    ...shadows.card,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    fontFamily: typography.display,
  },
  emptyText: {
    color: colors.muted,
    lineHeight: 22,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  dateDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.accent,
  },
  dateLabel: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    fontFamily: typography.display,
  },
  historyRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  timelineRail: {
    width: 14,
    alignItems: 'center',
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: spacing.lg,
  },
  card: {
    flex: 1,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  cardTitleBox: {
    flex: 1,
    gap: spacing.xs,
  },
  recipeTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    fontFamily: typography.strong,
  },
  meta: {
    color: colors.muted,
    fontWeight: '700',
  },
  deleteButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  deleteText: {
    color: colors.danger,
    fontWeight: '900',
  },
});
