import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });

test('release configuration blocks the overlay permission', () => {
  const appConfig = JSON.parse(read('app.json')) as {
    expo?: { android?: { blockedPermissions?: string[] } };
  };
  const mainManifest = read('android/app/src/main/AndroidManifest.xml');

  assert.equal(
    appConfig.expo?.android?.blockedPermissions?.includes('android.permission.SYSTEM_ALERT_WINDOW'),
    true,
  );
  assert.equal(mainManifest.includes('android.permission.SYSTEM_ALERT_WINDOW'), false);
});

test('Android follows the system color scheme', () => {
  const appConfig = JSON.parse(read('app.json')) as {
    expo?: { userInterfaceStyle?: string };
  };
  const nativeStrings = read('android/app/src/main/res/values/strings.xml');

  assert.equal(appConfig.expo?.userInterfaceStyle, 'automatic');
  assert.match(
    nativeStrings,
    /name="expo_system_ui_user_interface_style"[^>]*>automatic<\/string>/,
  );
});

test('Android backup rules exclude SecureStore credentials', () => {
  const appConfig = JSON.parse(read('app.json')) as {
    expo?: { plugins?: Array<string | [string, Record<string, unknown>]> };
  };
  const mainManifest = read('android/app/src/main/AndroidManifest.xml');
  const legacyRules = read('android/app/src/main/res/xml/secure_store_backup_rules.xml');
  const modernRules = read('android/app/src/main/res/xml/secure_store_data_extraction_rules.xml');
  const secureStorePlugin = appConfig.expo?.plugins?.find(
    (plugin): plugin is [string, Record<string, unknown>] => Array.isArray(plugin) && plugin[0] === 'expo-secure-store',
  );

  assert.equal(secureStorePlugin?.[1].configureAndroidBackup, true);
  assert.match(mainManifest, /android:fullBackupContent="@xml\/secure_store_backup_rules"/);
  assert.match(mainManifest, /android:dataExtractionRules="@xml\/secure_store_data_extraction_rules"/);
  assert.match(legacyRules, /<include domain="database" path="\."\s*\/>/);
  assert.equal((modernRules.match(/<include domain="database" path="\."\s*\/>/g) ?? []).length, 2);
  assert.match(legacyRules, /<exclude domain="sharedpref" path="SecureStore"\s*\/>/);
  assert.equal((modernRules.match(/<exclude domain="sharedpref" path="SecureStore"\s*\/>/g) ?? []).length, 2);
  assert.doesNotMatch(legacyRules, /domain="file"/);
  assert.doesNotMatch(modernRules, /domain="file"/);
});

test('capture protection is limited to the API key surface without media or screenshot permissions', () => {
  const appConfig = JSON.parse(read('app.json')) as {
    expo?: { android?: { blockedPermissions?: string[]; permissions?: string[] } };
  };
  const mainManifest = read('android/app/src/main/AndroidManifest.xml');
  const packageJson = JSON.parse(read('package.json')) as { dependencies?: Record<string, string> };
  const protection = read('src/privacy/credential-capture-protection.ts');
  const sources = sourceFiles('src');

  assert.equal(packageJson.dependencies?.['expo-screen-capture'], '~57.0.2');
  assert.match(protection, /preventScreenCaptureAsync\(CREDENTIAL_SCREEN_CAPTURE_KEY\)/);
  assert.match(protection, /allowScreenCaptureAsync\(CREDENTIAL_SCREEN_CAPTURE_KEY\)/);
  assert.doesNotMatch(protection, /ScreenshotListener|requestPermissionsAsync/);
  assert.deepEqual(
    sources.filter((file) => read(file).includes('expo-screen-capture')),
    ['src/privacy/credential-capture-protection.ts'],
  );
  assert.deepEqual(
    sources.filter((file) => /^\s+useCredentialCaptureProtection\(\);/m.test(read(file))),
    ['src/features/settings/screens/api-key-settings-screen.tsx'],
  );

  assert.equal(
    appConfig.expo?.android?.blockedPermissions?.includes('android.permission.READ_MEDIA_IMAGES'),
    true,
  );
  for (const permission of ['READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'DETECT_SCREEN_CAPTURE']) {
    assert.equal(appConfig.expo?.android?.permissions?.includes(`android.permission.${permission}`) ?? false, false);
  }
  assert.doesNotMatch(mainManifest, /android\.permission\.DETECT_SCREEN_CAPTURE/);
});

test('all Gemini feature modules use the unified network client', () => {
  const featureFiles = [
    'src/ai/geminiAdapter.ts',
    'src/ai/recommendationRefiner.ts',
    'src/features/recipes/screens/RecipeDetailScreen.tsx',
  ];

  for (const file of featureFiles) {
    const source = read(file);
    assert.equal(source.includes('fetchGeminiGenerateContent'), true, `${file} must use the Gemini client`);
    assert.equal(/\bfetch\s*\(/.test(source), false, `${file} must not call fetch directly`);
    assert.equal(source.includes('?key='), false, `${file} must not place a key in the URL`);
  }
});

test('recommendation logs never serialize caught errors', () => {
  const source = read('src/features/recommendations/screens/RecommendationsScreen.tsx');

  assert.doesNotMatch(
    source,
    /console\.(?:log|warn|error)\([^;]*\berror\b[^;]*\);/s,
  );
});

test('Home requires a live-tested Gemini credential', () => {
  const source = read('src/features/home/screens/HomeScreen.tsx');
  const readiness = read('src/features/recommendations/recommendation-readiness.ts');

  assert.match(source, /loadRecommendationReadiness\(\)/);
  assert.doesNotMatch(source, /hasApiKey\('gemini'\)/);
  assert.match(readiness, /hasVerifiedApiKey\('gemini'\)/);
  assert.match(readiness, /model\?\.testEmbeddingVerifiedAt/);
});

test('model installation commits only after verified downloads complete', () => {
  const source = read('src/rag/model/modelPack.ts');
  const verify = source.indexOf('await downloadAndVerifyModelFile(');
  const writeManifest = source.indexOf("writeTextFile(new File(stagingDirectory, 'model-pack.json')");
  const promote = source.indexOf('stagingDirectory.move(installedDirectory)');
  const runtimeTest = source.indexOf('await verifyEmbeddingModelRuntime(installedCandidate)');
  const register = source.indexOf('await saveInstalledEmbeddingModel(installed)');

  assert.ok(verify >= 0);
  assert.ok(writeManifest > verify, 'manifest must be written after file verification');
  assert.ok(promote > writeManifest, 'staging must be promoted after manifest is written');
  assert.ok(runtimeTest > promote, 'runtime test must run after the verified directory is promoted');
  assert.ok(register > runtimeTest, 'registry must be updated after the runtime test passes');
});

test('pack installs and removals read the installed-source registry before touching files', () => {
  const dataset = read('src/datasets/datasetPack.ts');
  const datasetRead = dataset.indexOf('await listInstalledDatasets()');
  assert.ok(datasetRead >= 0);
  assert.ok(datasetRead < dataset.indexOf('ensureDirectory(root)'), 'dataset install must refuse before creating directories');

  const uninstall = dataset.slice(dataset.indexOf('export async function uninstallDataset'));
  assert.ok(
    uninstall.indexOf('await listInstalledDatasets()') < uninstall.indexOf('directory.delete()'),
    'dataset removal must refuse before deleting files',
  );

  const model = read('src/rag/model/modelPack.ts');
  const modelRead = model.indexOf('await listInstalledEmbeddingModels()');
  assert.ok(modelRead >= 0);
  assert.ok(modelRead < model.indexOf('ensureDirectory(root)'), 'model install must refuse before creating directories');
});

test('privacy policy and in-app disclosure remain present', () => {
  const policy = read('PRIVACY.md');
  const app = read('src/application/App.tsx');
  const client = read('src/ai/geminiClient.ts');

  assert.match(policy, /Google Gemini 数据披露/);
  assert.match(app, /PrivacyPolicyScreen/);
  assert.match(client, /assertAiDataConsent/);
});
