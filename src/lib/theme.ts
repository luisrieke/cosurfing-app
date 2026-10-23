import { Platform } from 'react-native';

export const colors = {
  bg: '#FFFFFF',
  bgMuted: '#F7F5F0',
  bgSubtle: '#FBFAF7',
  border: '#E8E5DE',
  borderStrong: '#D6D2C8',
  text: '#17150F',
  textMuted: '#6B675E',
  textFaint: '#9B968B',
  accent: '#0E7C7B',
  accentHover: '#0B6766',
  accentSoft: '#E1F1F0',
  onAccent: '#FFFFFF',
  coworking: '#0E7C7B',
  coworkingSoft: '#E1F1F0',
  cafe: '#C8642A',
  cafeSoft: '#FBEBDF',
  plus: '#4F46E5',
  plusSoft: '#EEEDFC',
  danger: '#B42318',
  dangerSoft: '#FDECEA',
  success: '#027A48',
  successSoft: '#E3F5EC',
  warning: '#B54708',
  warningSoft: '#FEF3E2',
  overlay: 'rgba(23, 21, 15, 0.45)',
  star: '#E5A100',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const fontFamily = Platform.select({
  web: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  default: undefined,
});

export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700' as const, letterSpacing: -0.6 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' as const, letterSpacing: -0.4 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' as const },
  small: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  smallStrong: { fontSize: 14, lineHeight: 20, fontWeight: '600' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const, letterSpacing: 0.2 },
} as const;

export const shadow = {
  card: Platform.select({
    web: { boxShadow: '0 1px 2px rgba(23,21,15,0.06), 0 8px 24px rgba(23,21,15,0.06)' },
    ios: {
      shadowColor: '#17150F',
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    android: { elevation: 3 },
    default: {},
  }),
  sheet: Platform.select({
    web: { boxShadow: '0 -4px 24px rgba(23,21,15,0.12)' },
    ios: {
      shadowColor: '#17150F',
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: -4 },
    },
    android: { elevation: 12 },
    default: {},
  }),
  pin: Platform.select({
    web: { boxShadow: '0 2px 6px rgba(23,21,15,0.3)' },
    ios: {
      shadowColor: '#17150F',
      shadowOpacity: 0.3,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
    },
    android: { elevation: 4 },
    default: {},
  }),
};

export const layout = {
  desktopBreakpoint: 900,
  maxContentWidth: 720,
  maxAdminWidth: 960,
  sidebarWidth: 420,
  touchTarget: 44,
} as const;
