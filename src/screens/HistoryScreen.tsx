import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Clock, SlidersHorizontal } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { deleteCookedHistory, listCookedHistory } from '../db/cookedHistoryRepository';
import { useI18n } from '../i18n/i18n';
import { colors, spacing, typography } from '../styles/theme';
import type { CookedRecipeHistory, HistoryStackScreenProps } from '../types';

type Props = HistoryStackScreenProps<'History'>;
type TFunction = ReturnType<typeof useI18n>['t'];
type ActionButtonVariant = 'primary' | 'secondary';

type TimelineItem =
  | { kind: 'date'; id: string; label: string }
  | { kind: 'history'; id: string; item: CookedRecipeHistory };

export function HistoryScreen({ navigation }: Props) {
  const { language, t } = useI18n();
  const [history, setHistory] = useState<CookedRecipeHistory[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity accessibilityLabel={t('nav.settings')} accessibilityRole="button" onPress={() => navigation.navigate('Settings')} style={styles.headerSettingsButton}>
          <SlidersHorizontal size={20} color="#6B6B6B" strokeWidth={2} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, t]);

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
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.screen}>
      <FlatList
        data={timelineItems}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={loadHistory}
        contentContainerStyle={[styles.content, timelineItems.length === 0 && styles.emptyContent]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Clock size={48} color="#E5E5E5" strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>{t('history.emptyTitle')}</Text>
            <Text style={styles.emptyText}>{emptyHistoryText(language)}</Text>
            <ActionButton title={t('history.goPage')} onPress={() => navigation.navigate('HomeStack', { screen: 'Recommendations', initial: false })} />
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
              <View style={styles.cardTitleBox}>
                <Text style={styles.recipeTitle} numberOfLines={1}>{item.item.title}</Text>
                <Text style={styles.meta}>
                  {formatTime(item.item.cookedAt, language)} · {sourceLabel(item.item.source, t)}
                </Text>
              </View>
              <Pressable accessibilityRole="button" style={styles.deleteButton} onPress={() => removeItem(item.item)}>
                <Text style={styles.deleteText}>{t('common.delete')}</Text>
              </Pressable>
            </View>
          )
        }
      />
    </SafeAreaView>
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

function emptyHistoryText(language: string) {
  return language === 'en' ? 'Cook a recommendation to see it here.' : '烹饪一次推荐后会显示在这里。';
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: 24,
    paddingBottom: 40,
    gap: spacing.lg,
  },
  emptyContent: {
    flexGrow: 1,
  },
  headerSettingsButton: {
    padding: 12,
    marginRight: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  solidButton: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  solidButtonPrimary: {
    backgroundColor: '#1B4332',
  },
  solidButtonSecondary: {
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
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: 80,
  },
  emptyTitle: {
    color: '#1A1A1A',
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 22,
    marginTop: 16,
    textAlign: 'center',
  },
  emptyText: {
    color: '#6B6B6B',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
    marginBottom: 20,
    textAlign: 'center',
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
    fontSize: 15,
    fontWeight: '600',
    fontFamily: typography.strong,
  },
  historyRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    paddingVertical: 10,
  },
  cardTitleBox: {
    flex: 1,
    gap: 2,
  },
  recipeTitle: {
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
  deleteButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  deleteText: {
    color: colors.danger,
    fontWeight: '900',
  },
});
