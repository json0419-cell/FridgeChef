import type { ComponentType } from 'react';
import { BookOpen, ChevronRight, Database, History, Library, Settings } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../../../i18n/i18n';
import { radii, spacing, type AppColorTokens, useAppTheme } from '../../../shared/theme/theme';
import type { MyStackScreenProps } from '../../../types';

type Props = MyStackScreenProps<'My'>;

interface MenuItemProps {
  colors: AppColorTokens;
  description: string;
  icon: ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  onPress: () => void;
  title: string;
}

export function MyScreen({ navigation }: Props) {
  const { t } = useI18n();
  const { colors } = useAppTheme();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ gap: spacing.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 112 }}
      >
        <View style={{ gap: spacing.sm }}>
          <Text selectable style={{ color: colors.textPrimary, fontSize: 30, fontWeight: '800', lineHeight: 37 }}>
            {t('my.title')}
          </Text>
          <Text selectable style={{ color: colors.textSecondary, fontSize: 16, lineHeight: 23 }}>
            {t('my.subtitle')}
          </Text>
        </View>

        <View style={{ gap: spacing.md }}>
          <MenuItem
            colors={colors}
            description={t('my.recipeSourcesDescription')}
            icon={Library}
            onPress={() => navigation.navigate('DatasetLibrary')}
            title={t('nav.datasetLibrary')}
          />
          <MenuItem
            colors={colors}
            description={t('my.personalRecipesDescription')}
            icon={BookOpen}
            onPress={() => navigation.navigate('UserRecipeLibraries')}
            title={t('nav.userRecipeLibraries')}
          />
          <MenuItem
            colors={colors}
            description={t('my.historyDescription')}
            icon={History}
            onPress={() => navigation.navigate('History')}
            title={t('nav.history')}
          />
          <MenuItem
            colors={colors}
            description={t('my.settingsDescription')}
            icon={Settings}
            onPress={() => navigation.navigate('Settings')}
            title={t('nav.settings')}
          />
          <MenuItem
            colors={colors}
            description={t('my.dataManagementDescription')}
            icon={Database}
            onPress={() => navigation.navigate('DataManagement')}
            title={t('nav.dataManagement')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuItem({ colors, description, icon: Icon, onPress, title }: MenuItemProps) {
  return (
    <Pressable
      accessibilityHint={description}
      accessibilityLabel={title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 84,
        borderRadius: radii.md,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.surfacePressed : colors.surface,
        padding: spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
      })}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          borderCurve: 'continuous',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.primaryMuted,
        }}
      >
        <Icon color={colors.primary} size={22} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text selectable style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700', lineHeight: 22 }}>
          {title}
        </Text>
        <Text selectable style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
          {description}
        </Text>
      </View>
      <ChevronRight color={colors.textTertiary} size={20} strokeWidth={2} />
    </Pressable>
  );
}
