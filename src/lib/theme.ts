import { Platform } from 'react-native';

export const colors = {
  bg: '#FFF6EC',
  surface: '#FFFFFF',
  bgMuted: '#FCEADB',
  bgSubtle: '#FFFAF4',
  border: '#F3E1CF',
  borderStrong: '#E6C9AE',
  text: '#2B2238',
  textMuted: '#6B6178',
  textFaint: '#A89FB2',
  accent: '#D9452F',
  accentHover: '#E85A3F',
  accentPressed: '#BF3823',
  accentSoft: '#FFE3DA',
  onAccent: '#FFFFFF',
  coworking: '#228A4E',
  coworkingSoft: '#DDF3E3',
  cafe: '#E9683A',
  cafeSoft: '#FFE5D6',
  library: '#2F6FD6',
  librarySoft: '#E0EBFD',
  coliving: '#0B8A85',
  colivingSoft: '#D5F1EE',
  scoreGreat: '#228A4E',
  scoreGood: '#4C9A2A',
  scoreOkay: '#D46A14',
  scoreLow: '#8E8699',
  plus: '#7C4DDB',
  plusPressed: '#6639C2',
  plusSoft: '#EEE6FD',
  danger: '#D0342C',
  dangerSoft: '#FDE2DF',
  dangerSoftPressed: '#F9CFCA',
  success: '#228A4E',
  successSoft: '#DDF3E3',
  warning: '#C96A12',
  warningSoft: '#FFEBCF',
  /** Map pin rings for places the signed-in user reviewed (light) or reviewed with photos (dark). */
  mineReviewed: '#7ED957',
  mineWithPhotos: '#18A34A',
  /** Pins and rows of places whose venue told us laptop work is not allowed. */
  workForbidden: '#A8A1AE',
  overlay: 'rgba(43, 34, 56, 0.45)',
  star: '#FFB627',
  glass: 'rgba(255, 253, 249, 0.42)',
  glassStrong: 'rgba(255, 253, 249, 0.62)',
  glassBorder: 'rgba(255, 255, 255, 0.85)',
  glassDark: 'rgba(43, 34, 56, 0.25)',
  glassDarkBorder: 'rgba(255, 255, 255, 0.35)',
  glassInk: 'rgba(43, 34, 56, 0.72)',
  glassInkBorder: 'rgba(255, 255, 255, 0.14)',
  ambientTop: '#FFFAF3',
  ambientBottom: '#FFF1E3',
  ambientPeach: '#FFC9A8',
  ambientSage: '#BFEBD3',
  ambientSky: '#C7E3FF',
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
    web: { boxShadow: '0 1px 2px rgba(80,40,60,0.06), 0 8px 24px rgba(80,40,60,0.08)' },
    ios: {
      shadowColor: '#50283C',
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
        'inset 0 1px 0 rgba(255,255,255,0.95), inset 0 0 0 0.5px rgba(255,255,255,0.4), 0 1px 2px rgba(80,40,60,0.04), 0 10px 30px rgba(80,40,60,0.07)',
    },
    ios: {
      shadowColor: '#50283C',
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
    },
    android: { elevation: 2 },
    default: {},
  }),
  accent: Platform.select({
    web: { boxShadow: '0 4px 12px rgba(43,34,56,0.25)' },
    ios: {
      shadowColor: '#2B2238',
      shadowOpacity: 0.25,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 4 },
    },
    android: { elevation: 3 },
    default: {},
  }),
  sheet: Platform.select({
    web: { boxShadow: '0 -4px 24px rgba(80,40,60,0.12)' },
    ios: {
      shadowColor: '#50283C',
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: -4 },
    },
    android: { elevation: 12 },
    default: {},
  }),
  pin: Platform.select({
    web: { boxShadow: '0 2px 6px rgba(43,34,56,0.3)' },
    ios: {
      shadowColor: '#2B2238',
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
