import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, type RenderResult } from '@testing-library/react-native';
import { DataManagementScreen } from '../src/features/settings/screens/data-management-screen';
import { DataCleanupAggregateError } from '../src/storage/data-cleanup-policy';
import { renderWithAppProviders } from './support/app-providers';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Icon = (props: object) => React.createElement(View, props);
  return new Proxy({}, { get: () => Icon });
});
jest.mock('../src/storage/local-data-cleanup', () => ({ clearLocalData: jest.fn(async () => undefined) }));

const { clearLocalData } = require('../src/storage/local-data-cleanup') as { clearLocalData: jest.Mock };

// Clear All resets the language preference, so the report that follows it renders in the system
// language. These matchers accept either dictionary so the assertions test the report, not the locale.
const partialTitle = /Some data could not be cleared|部分数据未能清除/;
const partialReport = /These categories did not finish|以下类别没有完成/;
const downloadedPacksTitle = /Downloaded recipe packs|已下载菜谱包/;
const preferencesTitle = /Preferences, AI data consent, and language|偏好、AI 数据同意与语言设置/;
const ingredientsTitle = /Fridge ingredients|冰箱食材/;

describe('scoped data deletion', () => {
  beforeEach(async () => {
    clearLocalData.mockClear();
    clearLocalData.mockImplementation(async () => undefined);
    await AsyncStorage.clear();
    await AsyncStorage.setItem('chi_shen_me.language', 'en');
  });

  it('deletes nothing until Clear All is explicitly confirmed', async () => {
    const screen = await renderDataManagement();

    await press(screen, 'Clear All local user data');

    expect(screen.getByText('Clear “All local user data”?')).toBeTruthy();
    expect(clearLocalData).not.toHaveBeenCalled();

    await press(screen, 'Cancel');
    expect(clearLocalData).not.toHaveBeenCalled();

    await press(screen, 'Clear All local user data');
    await press(screen, 'Clear now');

    expect(clearLocalData).toHaveBeenCalledTimes(1);
    expect(clearLocalData).toHaveBeenCalledWith('allUserData');
  });

  it('names the categories a partial Clear All could not finish and nothing else', async () => {
    clearLocalData.mockImplementation(async () => {
      throw new DataCleanupAggregateError(['downloadedPacks', 'apiKey', 'preferences']);
    });
    const screen = await renderDataManagement();

    await press(screen, 'Clear All local user data');
    await press(screen, 'Clear now');

    expect(screen.getByText(partialTitle)).toBeTruthy();
    const message = String(screen.getByText(partialReport).props.children);
    expect(message).toMatch(downloadedPacksTitle);
    expect(message).toMatch(/Gemini API Key/);
    expect(message).toMatch(preferencesTitle);
    expect(message).not.toMatch(ingredientsTitle);
    expect(message).not.toMatch(/file:\/\/|\/data\/|AIza/);
    // Titles may contain commas, so the categories are separated by something a title cannot hold.
    expect(message).toMatch(/Downloaded recipe packs; Gemini API Key;|已下载菜谱包；Gemini API Key；/);
  });

  it('reports a failed single-category action without naming another category', async () => {
    clearLocalData.mockImplementation(async () => {
      throw new Error('file:///data/user/0/datasets/official-lite_1.0.0 could not be deleted');
    });
    const screen = await renderDataManagement();

    await press(screen, 'Clear Downloaded recipe packs');
    await press(screen, 'Clear now');

    expect(clearLocalData).toHaveBeenCalledTimes(1);
    expect(clearLocalData).toHaveBeenCalledWith('downloadedPacks');
    expect(screen.getByText('Clear failed')).toBeTruthy();
    expect(screen.queryByText(/file:\/\/|official-lite/)).toBeNull();
  });
});

async function renderDataManagement(): Promise<RenderResult> {
  const screen = await renderWithAppProviders(<DataManagementScreen />);
  await screen.findByText('Each action has an isolated scope. Only Clear All removes data from other categories.');
  return screen;
}

async function press(screen: RenderResult, name: string) {
  await fireEvent.press(await screen.findByRole('button', { name }));
}
