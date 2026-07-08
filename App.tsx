import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppFeedbackProvider } from './src/components/AppFeedbackProvider';
import { initializeDatabase } from './src/db/database';
import { I18nProvider, useI18n } from './src/i18n/i18n';
import { AddIngredientScreen } from './src/screens/AddIngredientScreen';
import { AddUserRecipeScreen } from './src/screens/AddUserRecipeScreen';
import { ConfirmRecognizedFoodScreen } from './src/screens/ConfirmRecognizedFoodScreen';
import { DatasetLibraryScreen } from './src/screens/DatasetLibraryScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { RecommendationsScreen } from './src/screens/RecommendationsScreen';
import { RecipeDetailScreen } from './src/screens/RecipeDetailScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { UserRecipeLibrariesScreen } from './src/screens/UserRecipeLibrariesScreen';
import { UserRecipeLibraryDetailScreen } from './src/screens/UserRecipeLibraryDetailScreen';
import { colors, typography } from './src/styles/theme';
import type { RootStackParamList } from './src/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

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
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerShadowVisible: false,
            headerTintColor: colors.text,
            headerTitleStyle: {
              fontFamily: typography.display,
              fontSize: 24,
              fontWeight: '900',
            },
            headerTransparent: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: t('nav.home') }} />
          <Stack.Screen name="AddIngredient" component={AddIngredientScreen} options={{ title: t('nav.addIngredient') }} />
          <Stack.Screen
            name="ConfirmRecognizedFood"
            component={ConfirmRecognizedFoodScreen}
            options={{ title: t('nav.confirmRecognizedFood') }}
          />
          <Stack.Screen name="Recommendations" component={RecommendationsScreen} options={{ title: t('nav.recommendations') }} />
          <Stack.Screen name="RecipeDetail" component={RecipeDetailScreen} options={{ title: t('nav.recipeDetail') }} />
          <Stack.Screen name="History" component={HistoryScreen} options={{ title: t('nav.history') }} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: t('nav.settings') }} />
          <Stack.Screen name="DatasetLibrary" component={DatasetLibraryScreen} options={{ title: t('nav.datasetLibrary') }} />
          <Stack.Screen name="UserRecipeLibraries" component={UserRecipeLibrariesScreen} options={{ title: t('nav.userRecipeLibraries') }} />
          <Stack.Screen
            name="UserRecipeLibraryDetail"
            component={UserRecipeLibraryDetailScreen}
            options={{ title: t('nav.userRecipeLibraryDetail') }}
          />
          <Stack.Screen name="AddUserRecipe" component={AddUserRecipeScreen} options={{ title: t('nav.addUserRecipe') }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

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
});
