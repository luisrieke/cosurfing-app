import { Platform } from 'react-native';

export const colors = {
  bg: '#F4EFE6',
  surface: '#FFFCF7',
  bgMuted: '#EAE3D6',
  bgSubtle: '#F8F4EC',
  border: '#E2D9C9',
  borderStrong: '#CFC3AE',
  text: '#2A211A',
  textMuted: '#76695B',
  textFaint: '#A89A88',
  accent: '#2A211A',
  accentHover: '#3B2F25',
  accentPressed: '#1C1611',
  accentSoft: '#EAE3D6',
  onAccent: '#FFF9F0',
  coworking: '#4F6B3A',
  coworkingSoft: '#E4E8D6',
  cafe: '#B5573A',
  cafeSoft: '#F5E1D7',
  library: '#4A5D7A',
  librarySoft: '#E3E8EF',
  coliving: '#2F6B68',
  colivingSoft: '#DCEAE7',
  scoreGreat: '#4F6B3A',
  scoreGood: '#6F7F45',
  scoreOkay: '#B5573A',
  scoreLow: '#8A7D6E',
  plus: '#6B4A5E',
  plusPressed: '#573B4C',
  plusSoft: '#EFE4EA',
  danger: '#A63A2A',
  dangerSoft: '#F6E0DA',
  dangerSoftPressed: '#EECFC6',
  success: '#4F6B3A',
  successSoft: '#E4E8D6',
  warning: '#A8642A',
  warningSoft: '#F6E7D3',
  /** Map pin rings for places the signed-in user reviewed (light) or reviewed with photos (dark). */
  mineReviewed: '#8ED16B',
  mineWithPhotos: '#1E7A3A',
  overlay: 'rgba(42, 33, 26, 0.45)',
  star: '#D99A2B',
  glass: 'rgba(255, 253, 249, 0.42)',
  glassStrong: 'rgba(255, 253, 249, 0.62)',
  glassBorder: 'rgba(255, 255, 255, 0.85)',
  glassDark: 'rgba(40, 28, 18, 0.25)',
  glassDarkBorder: 'rgba(255, 255, 255, 0.35)',
  glassInk: 'rgba(36, 28, 21, 0.72)',
  glassInkBorder: 'rgba(255, 255, 255, 0.14)',
  ambientTop: '#FBF9F5',
  ambientBottom: '#F3EEE6',
  ambientPeach: '#F3D3BF',
  ambientSage: '#D7DFC4',
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
  md: 14,
  lg: 22,
  xl: 28,
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
    web: { boxShadow: '0 1px 2px rgba(60,40,20,0.06), 0 8px 24px rgba(60,40,20,0.08)' },
    ios: {
      shadowColor: '#3C2814',
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    android: { elevation: 3 },
    default: {},
  }),
  glass: Platform.select({
    web: {
      boxShadow:
        'inset 0 1px 0 rgba(255,255,255,0.95), inset 0 0 0 0.5px rgba(255,255,255,0.4), 0 1px 2px rgba(60,40,20,0.04), 0 10px 30px rgba(60,40,20,0.07)',
    },
    ios: {
      shadowColor: '#3C2814',
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
    },
    android: { elevation: 2 },
    default: {},
  }),
  accent: Platform.select({
    web: { boxShadow: '0 4px 12px rgba(42,33,26,0.25)' },
    ios: {
      shadowColor: '#2A211A',
      shadowOpacity: 0.25,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 4 },
    },
    android: { elevation: 3 },
    default: {},
  }),
  sheet: Platform.select({
    web: { boxShadow: '0 -4px 24px rgba(60,40,20,0.12)' },
    ios: {
      shadowColor: '#3C2814',
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: -4 },
    },
    android: { elevation: 12 },
    default: {},
  }),
  pin: Platform.select({
    web: { boxShadow: '0 2px 6px rgba(42,33,26,0.3)' },
    ios: {
      shadowColor: '#2A211A',
      shadowOpacity: 0.3,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
    },
    android: { elevation: 4 },
    default: {},
  }),
};

export function scoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return colors.scoreLow;
  // Match the one-decimal value shown next to the colour.
  score = Math.round(Number(score) * 10) / 10;
  if (score >= 7.5) return colors.scoreGreat;
  if (score >= 6) return colors.scoreGood;
  if (score >= 4.5) return colors.scoreOkay;
  return colors.scoreLow;
}

export const layout = {
  desktopBreakpoint: 900,
  maxContentWidth: 720,
  maxWideWidth: 1200,
  maxAdminWidth: 960,
  sidebarWidth: 420,
  touchTarget: 44,
} as const;
