import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

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

test('model installation commits only after verified downloads complete', () => {
  const source = read('src/rag/model/modelPack.ts');
  const verify = source.indexOf('await downloadAndVerifyModelFile(');
  const writeManifest = source.indexOf("writeTextFile(new File(stagingDirectory, 'model-pack.json')");
  const promote = source.indexOf('stagingDirectory.move(new Directory(root, directoryName))');
  const register = source.indexOf('await saveInstalledEmbeddingModel(installed)');

  assert.ok(verify >= 0);
  assert.ok(writeManifest > verify, 'manifest must be written after file verification');
  assert.ok(promote > writeManifest, 'staging must be promoted after manifest is written');
  assert.ok(register > promote, 'registry must be updated after the verified directory is promoted');
});

test('privacy policy and in-app disclosure remain present', () => {
  const policy = read('PRIVACY.md');
  const app = read('src/application/App.tsx');
  const client = read('src/ai/geminiClient.ts');

  assert.match(policy, /Google Gemini 数据披露/);
  assert.match(app, /PrivacyPolicyScreen/);
  assert.match(client, /assertAiDataConsent/);
});
