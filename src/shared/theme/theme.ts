import { useColorScheme } from 'react-native';

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

export function useAppTheme() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return {
    colorScheme: isDark ? ('dark' as const) : ('light' as const),
    colors: isDark ? darkAppColors : lightAppColors,
    isDark,
  };
}

export const colors = {
  background: '#FFF8EC',
  backgroundTop: '#FFF3DC',
  backgroundDeep: '#F3E2C4',
  surface: '#FFFDF8',
  surfaceRaised: '#FFFFFF',
  surfaceAlt: '#F7EBD4',
  surfaceMuted: '#F0DFC2',
  surfaceStrong: '#20160F',
  text: '#21160E',
  textInverse: '#FFF8EC',
  muted: '#776453',
  mutedOnDark: 'rgba(255, 248, 236, 0.74)',
  border: '#E8D7B8',
  borderStrong: '#D7B981',
  primary: '#1D6F50',
  primaryPressed: '#124A36',
  primarySoft: '#DDEDD5',
  accent: '#E84B2F',
  accentSoft: '#FFE1D3',
  warning: '#B35C00',
  danger: '#B42318',
  chip: '#E8F4D9',
  gold: '#F4B740',
  ink: '#120D09',
  sky: '#D8EEFF',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
};

export const shadows = {
  hairline: {
    elevation: 1,
    shadowColor: '#5B371E',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  card: {
    elevation: 4,
    shadowColor: '#5B371E',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  lift: {
    elevation: 8,
    shadowColor: '#4E2B12',
    shadowOpacity: 0.16,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
  },
};

export const radii = {
  sm: 12,
  md: 18,
  lg: 26,
  xl: 34,
  pill: 999,
};

export const gradients = {
  app: ['#FFF7E7', '#F5E3C5', '#FFF9ED'] as const,
  primary: ['#1E7A54', '#2E9F70', '#F4B740'] as const,
  hero: ['#20140D', '#6A321D', '#D95E32'] as const,
  heroQuiet: ['#2B2119', '#46301E', '#91623A'] as const,
  card: ['rgba(255,255,255,0.96)', 'rgba(255,248,236,0.92)'] as const,
  danger: ['#B42318', '#E85A3F'] as const,
};

export const typography = {
  display: 'sans-serif-condensed',
  body: 'sans-serif',
  strong: 'sans-serif-medium',
};

export const semanticColors = {
  canvas: '#FFF9EF',
  canvasSubtle: '#F8ECD8',
  surface: '#FFFDF8',
  surfaceMuted: '#F6ECD9',
  surfacePressed: '#EFE0C8',
  surfaceDisabled: '#EFE7DA',
  textPrimary: '#21160E',
  textSecondary: '#6E5B4A',
  textTertiary: '#927B66',
  textInverse: '#FFFDF8',
  border: '#E5D5B9',
  borderStrong: '#CDB58D',
  primary: '#1D6F50',
  primaryPressed: '#14513B',
  primaryMuted: '#DCEBDD',
  secondary: '#C47A2C',
  secondaryMuted: '#F4E0C4',
  success: '#1D6F50',
  warning: '#A85E12',
  danger: '#B42318',
  dangerMuted: '#F8D8D2',
  info: '#476D7C',
  infoMuted: '#DCEBF0',
  overlay: 'rgba(33, 22, 14, 0.42)',
} as const;

export const typeScale = {
  screenTitle: {
    fontFamily: typography.display,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900' as const,
  },
  sectionTitle: {
    fontFamily: typography.strong,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '900' as const,
  },
  cardTitle: {
    fontFamily: typography.strong,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900' as const,
  },
  body: {
    fontFamily: typography.body,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '400' as const,
  },
  bodyStrong: {
    fontFamily: typography.strong,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '800' as const,
  },
  label: {
    fontFamily: typography.strong,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900' as const,
  },
  caption: {
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600' as const,
  },
} as const;

export const borders = {
  hairline: 1,
  regular: 1,
  focus: 2,
} as const;

export const semanticShadows = {
  none: {
    elevation: 0,
    shadowOpacity: 0,
  },
  soft: {
    elevation: 1,
    shadowColor: '#6E4A2B',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  card: {
    elevation: 2,
    shadowColor: '#6E4A2B',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
  },
} as const;

export const iconSizes = {
  xs: 14,
  sm: 18,
  md: 22,
  lg: 28,
} as const;

export const buttonHeights = {
  sm: 40,
  md: 48,
  lg: 54,
} as const;

export const inputHeights = {
  md: 52,
  multiline: 112,
} as const;

export const contentWidths = {
  compact: 430,
  readable: 620,
  tablet: 720,
} as const;

export const safeAreaSpacing = {
  horizontal: spacing.lg,
  top: spacing.md,
  bottom: spacing.lg,
  contentGap: spacing.lg,
} as const;
