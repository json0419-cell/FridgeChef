import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { DarkTheme, DefaultTheme, NavigationContainer, type InitialState } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, type NativeStackHeaderProps } from '@react-navigation/native-stack';
import { House, Refrigerator, Sparkles, UserRound } from 'lucide-react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppFeedbackProvider, Button } from '../shared/components';
import { initializeDatabase } from '../db/database';
import {
  createDatabaseStartupDiagnostic,
  type DatabaseStartupDiagnostic,
} from '../db/database-diagnostics';
import { I18nProvider, useI18n } from '../i18n/i18n';
import { AddIngredientScreen, ConfirmRecognizedFoodScreen, FridgeScreen } from '../features/ingredients';
import {
  AddUserRecipeScreen,
  RecipeDetailScreen,
  UserRecipeLibrariesScreen,
  UserRecipeLibraryDetailScreen,
} from '../features/recipes';
import { DatasetLibraryScreen } from '../features/datasets';
import { HistoryScreen } from '../features/history';
import { HomeScreen } from '../features/home';
import { MyScreen } from '../features/my';
import { RecommendationsScreen } from '../features/recommendations';
import { ApiKeySettingsScreen, DataManagementScreen, PrivacyPolicyScreen, SettingsScreen } from '../features/settings';
import { loadNavigationState, saveNavigationState } from '../storage/navigation-state-storage';
import { spacing, type AppColorTokens, useAppTheme } from '../shared/theme/theme';
import type {
  FridgeStackParamList,
  HomeStackParamList,
  MainTabParamList,
  MyStackParamList,
  RecommendationsStackParamList,
  RootNativeStackParamList,
} from '../types';

const RootStack = createNativeStackNavigator<RootNativeStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const FridgeStack = createNativeStackNavigator<FridgeStackParamList>();
const RecommendationsStack = createNativeStackNavigator<RecommendationsStackParamList>();
const MyStack = createNativeStackNavigator<MyStackParamList>();

const TAB_CONFIG = {
  HomeStack: { Icon: House, accessibilityLabelKey: 'nav.home', visibleLabelKey: 'nav.home' },
  FridgeStack: { Icon: Refrigerator, accessibilityLabelKey: 'nav.fridge', visibleLabelKey: 'nav.fridge' },
  RecommendationsStack: {
    Icon: Sparkles,
    accessibilityLabelKey: 'nav.recommendations',
    visibleLabelKey: 'nav.recommendationIdeas',
  },
  MyStack: { Icon: UserRound, accessibilityLabelKey: 'nav.my', visibleLabelKey: 'nav.my' },
} as const;

type StartupState =
  | { status: 'loading' }
  | { status: 'ready'; navigationState?: InitialState }
  | { status: 'failed'; diagnostic: DatabaseStartupDiagnostic };

export default function App() {
  return (
    <I18nProvider>
      <AppFeedbackProvider>
        <AppContent />
      </AppFeedbackProvider>
    </I18nProvider>
  );
}

function AppContent() {
  const { t } = useI18n();
  const { colors, isDark, statusBarStyle } = useAppTheme();
  const [startupState, setStartupState] = useState<StartupState>({ status: 'loading' });
  const navigationTheme = useMemo(
    () => ({
      ...(isDark ? DarkTheme : DefaultTheme),
      colors: {
        ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
        primary: colors.primary,
        background: colors.canvas,
        card: colors.surface,
        text: colors.textPrimary,
        border: colors.border,
        notification: colors.accent,
      },
    }),
    [colors, isDark],
  );

  const prepareDatabase = useCallback(async () => {
    setStartupState({ status: 'loading' });
    try {
      const [navigationState] = await Promise.all([
        loadNavigationState(),
        initializeDatabase(),
      ]);
      setStartupState({ status: 'ready', navigationState });
    } catch (error) {
      setStartupState({ status: 'failed', diagnostic: createDatabaseStartupDiagnostic(error) });
    }
  }, []);

  useEffect(() => {
    void prepareDatabase();
  }, [prepareDatabase]);

  if (startupState.status === 'failed') {
    const { diagnostic } = startupState;
    const diagnosticText = [
      t('app.databaseDiagnosticCode', { code: diagnostic.code }),
      t('app.databaseDiagnosticTime', { time: diagnostic.occurredAt }),
      t('app.databaseDiagnosticFromVersion', {
        version: diagnostic.fromVersion ?? t('app.databaseDiagnosticUnknownVersion'),
      }),
      t('app.databaseDiagnosticTargetVersion', { version: diagnostic.targetVersion }),
    ].join('\n');

    return (
      <SafeAreaProvider>
        <StatusBar style={statusBarStyle} />
        <SafeAreaView style={[startupStyles.safeArea, { backgroundColor: colors.canvas }]}>
          <ScrollView contentContainerStyle={startupStyles.recoveryScroll}>
            <View
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
              style={[
                startupStyles.recoveryCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[startupStyles.failureTitle, { color: colors.danger }]}>{t('app.startFailed')}</Text>
              <Text style={[startupStyles.recoveryText, { color: colors.textPrimary }]}>
                {t('app.databaseRecoveryText')}
              </Text>
              <Button fullWidth title={t('common.retry')} onPress={() => void prepareDatabase()} />
              <View
                style={[
                  startupStyles.diagnosticCard,
                  { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
                ]}
              >
                <Text style={[startupStyles.diagnosticTitle, { color: colors.textPrimary }]}>
                  {t('app.databaseDiagnosticTitle')}
                </Text>
                <Text selectable style={[startupStyles.diagnosticText, { color: colors.textSecondary }]}>
                  {diagnosticText}
                </Text>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (startupState.status === 'loading') {
    return (
      <SafeAreaProvider>
        <StatusBar style={statusBarStyle} />
        <View
          accessibilityLiveRegion="polite"
          accessibilityState={{ busy: true }}
          style={[startupStyles.loading, { backgroundColor: colors.canvas }]}
        >
          <ActivityIndicator color={colors.primary} size="large" />
          <Text selectable style={[startupStyles.loadingText, { color: colors.textSecondary }]}>
            {t('app.loadingDatabase')}
          </Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer
        initialState={startupState.navigationState}
        onStateChange={(state) => {
          if (state) {
            void saveNavigationState(state);
          }
        }}
        theme={navigationTheme}
      >
        <StatusBar style={statusBarStyle} />
        <RootStack.Navigator screenOptions={createStackScreenOptions(colors)}>
          <RootStack.Screen name="MainTabs" component={MainTabsNavigator} options={{ headerShown: false }} />
          <RootStack.Screen name="Settings" component={SettingsScreen} options={{ title: t('nav.settings') }} />
          <RootStack.Screen
            name="ApiKeySettings"
            component={ApiKeySettingsScreen}
            options={{ title: t('nav.apiKeySettings') }}
          />
          <RootStack.Screen
            name="DataManagement"
            component={DataManagementScreen}
            options={{ title: t('nav.dataManagement') }}
          />
          <RootStack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} options={{ title: t('nav.privacyPolicy') }} />
        </RootStack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

function MainTabsNavigator() {
  const { t } = useI18n();
  const { colors } = useAppTheme();
  const { fontScale } = useWindowDimensions();
  const accessibleFontScale = Math.min(Math.max(fontScale, 1), 2);
  const tabBarHeight = 72 + Math.ceil((accessibleFontScale - 1) * 24);

  return (
    <Tab.Navigator
      initialRouteName="HomeStack"
      backBehavior="initialRoute"
      screenOptions={({ route }) => {
        const { Icon, accessibilityLabelKey, visibleLabelKey } = TAB_CONFIG[route.name];

        return {
          headerShown: false,
          sceneStyle: { backgroundColor: colors.canvas },
          tabBarActiveTintColor: colors.primary,
          tabBarAccessibilityLabel: t(accessibilityLabelKey),
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarHideOnKeyboard: true,
          tabBarIcon: ({ color, size }) => <Icon color={color} size={Math.min(size, 23)} strokeWidth={2} />,
          tabBarItemStyle: { minHeight: tabBarHeight - 8, paddingVertical: 5 },
          tabBarLabel: ({ color, focused }) => (
            <Text
              allowFontScaling
              adjustsFontSizeToFit
              maxFontSizeMultiplier={2}
              minimumFontScale={0.5}
              numberOfLines={1}
              style={{ color, fontSize: 12, fontWeight: focused ? '900' : '600', lineHeight: 15, textAlign: 'center', textDecorationLine: focused ? 'underline' : 'none' }}
            >
              {t(visibleLabelKey)}
            </Text>
          ),
          tabBarStyle: {
            height: tabBarHeight,
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            elevation: 0,
          },
        };
      }}
    >
      <Tab.Screen name="HomeStack" component={HomeStackNavigator} options={{ title: t(TAB_CONFIG.HomeStack.accessibilityLabelKey) }} />
      <Tab.Screen name="FridgeStack" component={FridgeStackNavigator} options={{ title: t(TAB_CONFIG.FridgeStack.accessibilityLabelKey) }} />
      <Tab.Screen name="RecommendationsStack" component={RecommendationsStackNavigator} options={{ title: t(TAB_CONFIG.RecommendationsStack.accessibilityLabelKey) }} />
      <Tab.Screen name="MyStack" component={MyStackNavigator} options={{ title: t(TAB_CONFIG.MyStack.accessibilityLabelKey) }} />
    </Tab.Navigator>
  );
}

function HomeStackNavigator() {
  const { t } = useI18n();
  const { colors } = useAppTheme();

  return (
    <HomeStack.Navigator initialRouteName="Home" screenOptions={createStackScreenOptions(colors)}>
      <HomeStack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="RecipeDetail" component={RecipeDetailScreen} options={{ title: t('nav.recipeDetail') }} />
    </HomeStack.Navigator>
  );
}

function FridgeStackNavigator() {
  const { t } = useI18n();
  const { colors } = useAppTheme();

  return (
    <FridgeStack.Navigator initialRouteName="Fridge" screenOptions={createStackScreenOptions(colors)}>
      <FridgeStack.Screen name="Fridge" component={FridgeScreen} options={{ header: StackRootHeader, title: t('nav.fridge') }} />
      <FridgeStack.Screen name="AddIngredient" component={AddIngredientScreen} options={{ title: t('nav.addIngredient') }} />
      <FridgeStack.Screen
        name="ConfirmRecognizedFood"
        component={ConfirmRecognizedFoodScreen}
        options={{ title: t('nav.confirmRecognizedFood') }}
      />
    </FridgeStack.Navigator>
  );
}

function RecommendationsStackNavigator() {
  const { t } = useI18n();
  const { colors } = useAppTheme();

  return (
    <RecommendationsStack.Navigator initialRouteName="Recommendations" screenOptions={createStackScreenOptions(colors)}>
      <RecommendationsStack.Screen
        name="Recommendations"
        component={RecommendationsScreen}
        options={{ header: StackRootHeader, title: t('nav.recommendations') }}
      />
      <RecommendationsStack.Screen name="RecipeDetail" component={RecipeDetailScreen} options={{ title: t('nav.recipeDetail') }} />
    </RecommendationsStack.Navigator>
  );
}

function MyStackNavigator() {
  const { t } = useI18n();
  const { colors } = useAppTheme();

  return (
    <MyStack.Navigator initialRouteName="My" screenOptions={createStackScreenOptions(colors)}>
      <MyStack.Screen name="My" component={MyScreen} options={{ headerShown: false }} />
      <MyStack.Screen name="DatasetLibrary" component={DatasetLibraryScreen} options={{ title: t('nav.datasetLibrary') }} />
      <MyStack.Screen name="UserRecipeLibraries" component={UserRecipeLibrariesScreen} options={{ title: t('nav.userRecipeLibraries') }} />
      <MyStack.Screen
        name="UserRecipeLibraryDetail"
        component={UserRecipeLibraryDetailScreen}
        options={{ title: t('nav.userRecipeLibraryDetail') }}
      />
      <MyStack.Screen name="AddUserRecipe" component={AddUserRecipeScreen} options={{ title: t('nav.addUserRecipe') }} />
      <MyStack.Screen name="History" component={HistoryScreen} options={{ title: t('nav.history') }} />
      <MyStack.Screen name="RecipeDetail" component={RecipeDetailScreen} options={{ title: t('nav.recipeDetail') }} />
    </MyStack.Navigator>
  );
}

// The native Android toolbar truncates titles and clips header actions, so destination roots
// render a header that wraps at large font sizes and keeps full-size action targets.
function StackRootHeader({ options, route }: NativeStackHeaderProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[stackRootHeaderStyles.container, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <View style={stackRootHeaderStyles.row}>
        <Text accessibilityRole="header" style={[stackRootHeaderStyles.title, { color: colors.textPrimary }]}>
          {options.title ?? route.name}
        </Text>
        {options.headerRight?.({ canGoBack: false, tintColor: colors.textPrimary })}
      </View>
    </View>
  );
}

function createStackScreenOptions(colors: AppColorTokens) {
  return {
    headerStyle: { backgroundColor: colors.surface },
    headerTitleStyle: { fontSize: 19, fontWeight: '700' as const, color: colors.textPrimary },
    headerTintColor: colors.textPrimary,
    headerShadowVisible: false,
    headerBackTitleVisible: false,
    contentStyle: { backgroundColor: colors.canvas },
  };
}

const stackRootHeaderStyles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: 19,
    fontWeight: '700',
    paddingVertical: spacing.sm,
  },
});

const startupStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  loadingText: {
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
  },
  recoveryScroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  recoveryCard: {
    width: '100%',
    maxWidth: 620,
    gap: spacing.lg,
    borderWidth: 1,
    borderRadius: 24,
    padding: spacing.xl,
  },
  failureTitle: {
    fontSize: 24,
    lineHeight: 31,
    fontWeight: '800',
    textAlign: 'center',
  },
  recoveryText: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  diagnosticCard: {
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: 16,
    padding: spacing.lg,
  },
  diagnosticTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
  },
  diagnosticText: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'monospace',
  },
});
