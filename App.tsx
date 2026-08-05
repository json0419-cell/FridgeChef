import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppFeedbackProvider } from './src/components/AppFeedbackProvider';
import { initializeDatabase } from './src/db/database';
import { I18nProvider, useI18n } from './src/i18n/i18n';
import { AddIngredientScreen } from './src/screens/AddIngredientScreen';
import { AddUserRecipeScreen } from './src/screens/AddUserRecipeScreen';
import { ConfirmRecognizedFoodScreen } from './src/screens/ConfirmRecognizedFoodScreen';
import { DatasetLibraryScreen } from './src/screens/DatasetLibraryScreen';
import { FridgeScreen } from './src/screens/FridgeScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { RecommendationsScreen } from './src/screens/RecommendationsScreen';
import { RecipeDetailScreen } from './src/screens/RecipeDetailScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { UserRecipeLibrariesScreen } from './src/screens/UserRecipeLibrariesScreen';
import { UserRecipeLibraryDetailScreen } from './src/screens/UserRecipeLibraryDetailScreen';
import { colors, typography } from './src/styles/theme';
import type {
  FridgeStackParamList,
  HistoryStackParamList,
  HomeStackParamList,
  MainTabParamList,
  RecipesStackParamList,
  RootNativeStackParamList,
} from './src/types';

const RootStack = createNativeStackNavigator<RootNativeStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const FridgeStack = createNativeStackNavigator<FridgeStackParamList>();
const RecipesStack = createNativeStackNavigator<RecipesStackParamList>();
const HistoryStack = createNativeStackNavigator<HistoryStackParamList>();

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
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <View style={styles.center}>
          <Text style={styles.errorTitle}>{t('app.startFailed')}</Text>
          <Text style={styles.errorText}>{error === '__DATABASE_INIT_FAILED__' ? t('app.databaseInitFailed') : error}</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  if (!ready) {
    return (
      <SafeAreaProvider>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>{t('app.loadingDatabase')}</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <RootStack.Navigator screenOptions={stackScreenOptions}>
          <RootStack.Screen name="MainTabs" component={MainTabsNavigator} options={{ headerShown: false }} />
          <RootStack.Screen name="Settings" component={SettingsScreen} options={{ title: t('nav.settings') }} />
        </RootStack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

function MainTabsNavigator() {
  const { t } = useI18n();

  return (
    <Tab.Navigator
      initialRouteName="HomeStack"
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: false,
        headerStyle: {
          backgroundColor: '#FFFFFF',
        },
        headerTitleStyle: {
          fontSize: 20,
          fontWeight: '700',
          color: '#1A1A1A',
        },
        headerTintColor: '#1A1A1A',
        headerShadowVisible: false,
        tabBarIcon: () => null,
        tabBarIconStyle: styles.tabIcon,
        tabBarItemStyle: styles.tabItem,
        tabBarLabel: ({ color, children }) => (
          <Text allowFontScaling={false} numberOfLines={1} style={[styles.tabLabel, { color }]}>
            {children}
          </Text>
        ),
        tabBarLabelPosition: 'below-icon',
        tabBarLabelVisibilityMode: 'labeled',
        tabBarActiveTintColor: '#1B4332',
        tabBarInactiveTintColor: '#6B6B6B',
        tabBarStyle: styles.tabBar,
        sceneStyle: { backgroundColor: '#FFFFFF' },
      }}
    >
      <Tab.Screen name="HomeStack" component={HomeStackNavigator} options={{ title: t('nav.home') }} />
      <Tab.Screen name="FridgeStack" component={FridgeStackNavigator} options={{ title: t('nav.fridge') }} />
      <Tab.Screen name="RecipesStack" component={RecipesStackNavigator} options={{ title: t('nav.recipes') }} />
      <Tab.Screen name="HistoryStack" component={HistoryStackNavigator} options={{ title: t('nav.history') }} />
    </Tab.Navigator>
  );
}

function HomeStackNavigator() {
  const { t } = useI18n();

  return (
    <HomeStack.Navigator initialRouteName="Home" screenOptions={stackScreenOptions}>
      <HomeStack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="Recommendations" component={RecommendationsScreen} options={{ title: t('nav.recommendations') }} />
      <HomeStack.Screen name="RecipeDetail" component={RecipeDetailScreen} options={{ title: t('nav.recipeDetail') }} />
    </HomeStack.Navigator>
  );
}

function FridgeStackNavigator() {
  const { t } = useI18n();

  return (
    <FridgeStack.Navigator initialRouteName="Fridge" screenOptions={stackScreenOptions}>
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

function RecipesStackNavigator() {
  const { t } = useI18n();

  return (
    <RecipesStack.Navigator initialRouteName="DatasetLibrary" screenOptions={stackScreenOptions}>
      <RecipesStack.Screen name="DatasetLibrary" component={DatasetLibraryScreen} options={{ title: t('nav.datasetLibrary') }} />
      <RecipesStack.Screen name="UserRecipeLibraries" component={UserRecipeLibrariesScreen} options={{ title: t('nav.userRecipeLibraries') }} />
      <RecipesStack.Screen
        name="UserRecipeLibraryDetail"
        component={UserRecipeLibraryDetailScreen}
        options={{ title: t('nav.userRecipeLibraryDetail') }}
      />
      <RecipesStack.Screen name="AddUserRecipe" component={AddUserRecipeScreen} options={{ title: t('nav.addUserRecipe') }} />
      <RecipesStack.Screen name="RecipeDetail" component={RecipeDetailScreen} options={{ title: t('nav.recipeDetail') }} />
    </RecipesStack.Navigator>
  );
}

function HistoryStackNavigator() {
  const { t } = useI18n();

  return (
    <HistoryStack.Navigator initialRouteName="History" screenOptions={stackScreenOptions}>
      <HistoryStack.Screen name="History" component={HistoryScreen} options={{ title: t('nav.history') }} />
      <HistoryStack.Screen name="RecipeDetail" component={RecipeDetailScreen} options={{ title: t('nav.recipeDetail') }} />
    </HistoryStack.Navigator>
  );
}

const stackScreenOptions = {
  headerStyle: {
    backgroundColor: '#FFFFFF',
  },
  headerTitleStyle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: '#1A1A1A',
  },
  headerTintColor: '#1A1A1A',
  headerShadowVisible: false,
  headerBackTitleVisible: false,
  contentStyle: { backgroundColor: '#FFFFFF' },
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: colors.background,
  },
  loadingText: {
    color: colors.muted,
    fontFamily: typography.body,
  },
  errorTitle: {
    color: colors.danger,
    fontSize: 20,
    fontWeight: '800',
    fontFamily: typography.display,
  },
  errorText: {
    color: colors.text,
    textAlign: 'center',
    lineHeight: 22,
    fontFamily: typography.body,
  },
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    elevation: 0,
    shadowOpacity: 0,
    paddingTop: 6,
  },
  tabItem: {
    flex: 1,
    justifyContent: 'center',
  },
  tabIcon: {
    display: 'none',
    height: 0,
    margin: 0,
    width: 0,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '500',
    includeFontPadding: false,
    lineHeight: 16,
    textAlign: 'center',
  },
});
