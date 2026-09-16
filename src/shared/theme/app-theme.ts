export interface AppColorTokens {
  canvas: string;
  canvasSubtle: string;
  surface: string;
  surfaceRaised: string;
  surfaceMuted: string;
  surfacePressed: string;
  surfaceDisabled: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;
  border: string;
  borderStrong: string;
  primary: string;
  primaryPressed: string;
  primaryMuted: string;
  onPrimary: string;
  accent: string;
  accentMuted: string;
  success: string;
  warning: string;
  danger: string;
  dangerMuted: string;
  info: string;
  infoMuted: string;
  overlay: string;
}

export const lightAppColors: AppColorTokens = {
  canvas: '#F4F7F4',
  canvasSubtle: '#EDF2EE',
  surface: '#FFFFFF',
  surfaceRaised: '#FBFCFB',
  surfaceMuted: '#E8EFEA',
  surfacePressed: '#DCE7E0',
  surfaceDisabled: '#E9EEEA',
  textPrimary: '#17211C',
  textSecondary: '#5D6B63',
  textTertiary: '#7C8982',
  textInverse: '#FFFFFF',
  border: '#D8E1DB',
  borderStrong: '#B8C6BD',
  primary: '#245C45',
  primaryPressed: '#194634',
  primaryMuted: '#DCEBE2',
  onPrimary: '#FFFFFF',
  accent: '#C58A3C',
  accentMuted: '#F3E8D4',
  success: '#2D6A4F',
  warning: '#986018',
  danger: '#B33A3A',
  dangerMuted: '#F6DEDC',
  info: '#3F6F78',
  infoMuted: '#DCECEF',
  overlay: 'rgba(14, 22, 17, 0.48)',
};

export const darkAppColors: AppColorTokens = {
  canvas: '#101512',
  canvasSubtle: '#141B17',
  surface: '#181F1B',
  surfaceRaised: '#1D2520',
  surfaceMuted: '#222C26',
  surfacePressed: '#2A3730',
  surfaceDisabled: '#222924',
  textPrimary: '#F0F5F1',
  textSecondary: '#B3BEB7',
  textTertiary: '#8E9B93',
  textInverse: '#132018',
  border: '#2D3932',
  borderStrong: '#46564D',
  primary: '#83B99B',
  primaryPressed: '#A0CFB5',
  primaryMuted: '#263C30',
  onPrimary: '#102018',
  accent: '#D7AA68',
  accentMuted: '#3D3222',
  success: '#83B99B',
  warning: '#E1B46F',
  danger: '#F08B87',
  dangerMuted: '#442726',
  info: '#8BBCC4',
  infoMuted: '#243A3E',
  overlay: 'rgba(0, 0, 0, 0.66)',
};

export type AppColorScheme = 'light' | 'dark';
export type AppStatusBarStyle = 'light' | 'dark';
export type SystemColorScheme = AppColorScheme | 'unspecified' | null | undefined;

export interface AppTheme {
  colorScheme: AppColorScheme;
  colors: AppColorTokens;
  isDark: boolean;
  statusBarStyle: AppStatusBarStyle;
}

export function resolveAppTheme(colorScheme: SystemColorScheme): AppTheme {
  const isDark = colorScheme === 'dark';

  return {
    colorScheme: isDark ? 'dark' : 'light',
    colors: isDark ? darkAppColors : lightAppColors,
    isDark,
    statusBarStyle: isDark ? 'light' : 'dark',
  };
}
