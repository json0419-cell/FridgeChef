import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { House, Refrigerator, Sparkles, UserRound } from 'lucide-react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppFeedbackProvider } from '../shared/components';
import { initializeDatabase } from '../db/database';
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
import { PrivacyPolicyScreen, SettingsScreen } from '../features/settings';
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

const TAB_ICONS = {
  HomeStack: House,
  FridgeStack: Refrigerator,
  RecommendationsStack: Sparkles,
  MyStack: UserRound,
} as const;

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
  const { colors, isDark } = useAppTheme();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    void initializeDatabase()
      .then(() => setReady(true))
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : '__DATABASE_INIT_FAILED__');
      });
  }, []);

  if (error) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl, backgroundColor: colors.canvas }}>
          <Text selectable style={{ color: colors.danger, fontSize: 21, fontWeight: '800', textAlign: 'center' }}>
            {t('app.startFailed')}
          </Text>
          <Text selectable style={{ color: colors.textPrimary, fontSize: 16, lineHeight: 23, textAlign: 'center' }}>
            {error === '__DATABASE_INIT_FAILED__' ? t('app.databaseInitFailed') : error}
          </Text>
        </View>
      </SafeAreaProvider>
    );
  }

  if (!ready) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl, backgroundColor: colors.canvas }}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text selectable style={{ color: colors.textSecondary, fontSize: 16 }}>
            {t('app.loadingDatabase')}
          </Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={navigationTheme}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <RootStack.Navigator screenOptions={createStackScreenOptions(colors)}>
          <RootStack.Screen name="MainTabs" component={MainTabsNavigator} options={{ headerShown: false }} />
          <RootStack.Screen name="Settings" component={SettingsScreen} options={{ title: t('nav.settings') }} />
          <RootStack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} options={{ title: t('nav.privacyPolicy') }} />
        </RootStack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

function MainTabsNavigator() {
  const { t } = useI18n();
  const { colors } = useAppTheme();

  return (
    <Tab.Navigator
      initialRouteName="HomeStack"
      backBehavior="initialRoute"
      screenOptions={({ route }) => {
        const Icon = TAB_ICONS[route.name];

        return {
          headerShown: false,
          sceneStyle: { backgroundColor: colors.canvas },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textTertiary,
          tabBarHideOnKeyboard: true,
          tabBarIcon: ({ color, size }) => <Icon color={color} size={Math.min(size, 23)} strokeWidth={2} />,
          tabBarItemStyle: { minHeight: 64, paddingVertical: 5 },
          tabBarLabel: ({ color, children }) => (
            <Text
              allowFontScaling
              maxFontSizeMultiplier={2}
              numberOfLines={2}
              style={{ color, fontSize: 12, fontWeight: '600', lineHeight: 15, textAlign: 'center' }}
            >
              {children}
            </Text>
          ),
          tabBarStyle: {
            minHeight: 72,
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            elevation: 0,
          },
        };
      }}
    >
      <Tab.Screen name="HomeStack" component={HomeStackNavigator} options={{ title: t('nav.home') }} />
      <Tab.Screen name="FridgeStack" component={FridgeStackNavigator} options={{ title: t('nav.fridge') }} />
      <Tab.Screen name="RecommendationsStack" component={RecommendationsStackNavigator} options={{ title: t('nav.recommendations') }} />
      <Tab.Screen name="MyStack" component={MyStackNavigator} options={{ title: t('nav.my') }} />
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
      <FridgeStack.Screen name="Fridge" component={FridgeScreen} options={{ title: t('nav.fridge') }} />
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
        options={{ title: t('nav.recommendations') }}
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
