export const colors = {
  background: '#FFF8EC',
  backgroundDeep: '#F3E2C4',
  surface: '#FFFDF8',
  surfaceAlt: '#F7EBD4',
  surfaceStrong: '#20160F',
  text: '#21160E',
  textInverse: '#FFF8EC',
  muted: '#776453',
  border: '#E8D7B8',
  borderStrong: '#D7B981',
  primary: '#1D6F50',
  primaryPressed: '#124A36',
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
};

export const shadows = {
  card: {
    elevation: 5,
    shadowColor: '#5B371E',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  lift: {
    elevation: 9,
    shadowColor: '#4E2B12',
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
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
  app: ['#FFF8EC', '#F6E6C9', '#F7F0E3'] as const,
  primary: ['#1E7A54', '#2E9F70', '#F4B740'] as const,
  hero: ['#24160E', '#6C341F', '#E86C36'] as const,
  card: ['rgba(255,255,255,0.96)', 'rgba(255,248,236,0.92)'] as const,
  danger: ['#B42318', '#E85A3F'] as const,
};

export const typography = {
  display: 'sans-serif-condensed',
  body: 'sans-serif',
  strong: 'sans-serif-medium',
};
