import { Platform } from 'react-native';

export const colors = {
  bg: '#F3F8FC',
  surface: '#FFFFFF',
  bgMuted: '#E3EEF7',
  bgSubtle: '#F8FBFE',
  border: '#DCE7F1',
  borderStrong: '#BCD0E2',
  text: '#0F2A4A',
  textMuted: '#5B6B80',
  textFaint: '#9AA8B8',
  accent: '#1560BD',
  accentHover: '#1A6FD1',
  accentPressed: '#0D4F9E',
  accentSoft: '#DCEAFB',
  onAccent: '#FFFFFF',
  coworking: '#5E7D2A',
  coworkingSoft: '#E8F0D6',
  cafe: '#D6336C',
  cafeSoft: '#FCE1EC',
  library: '#D9822B',
  librarySoft: '#FFEFD6',
  coliving: '#0B8FA0',
  colivingSoft: '#D3F1F4',
  scoreGreat: '#3F7D20',
  scoreGood: '#6B8E23',
  scoreOkay: '#D9822B',
  scoreLow: '#8A97A8',
  plus: '#7048E8',
  plusPressed: '#5B37CC',
  plusSoft: '#ECE6FD',
  danger: '#D03A3A',
  dangerSoft: '#FCE3E3',
  dangerSoftPressed: '#F8D0D0',
  success: '#3F7D20',
  successSoft: '#E3F0D6',
  warning: '#C9631A',
  warningSoft: '#FFF1D6',
  /** Map pin rings for places the signed-in user reviewed (light) or reviewed with photos (dark). */
  mineReviewed: '#8FD46A',
  mineWithPhotos: '#2E8B3E',
  /** Pins and rows of places whose venue told us laptop work is not allowed. */
  workForbidden: '#A3AEBB',
  overlay: 'rgba(15, 42, 74, 0.45)',
  star: '#FFC83D',
  glass: 'rgba(255, 253, 249, 0.42)',
  glassStrong: 'rgba(255, 253, 249, 0.62)',
  glassBorder: 'rgba(255, 255, 255, 0.85)',
  glassDark: 'rgba(15, 42, 74, 0.25)',
  glassDarkBorder: 'rgba(255, 255, 255, 0.35)',
  glassInk: 'rgba(15, 42, 74, 0.72)',
  glassInkBorder: 'rgba(255, 255, 255, 0.14)',
  ambientTop: '#F8FCFF',
  ambientBottom: '#EAF4FB',
  ambientPeach: '#FFE9A8',
  ambientSage: '#B8E8F0',
  ambientSky: '#C9DDFF',
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
    web: { boxShadow: '0 1px 2px rgba(15,42,74,0.06), 0 8px 24px rgba(15,42,74,0.08)' },
    ios: {
      shadowColor: '#0F2A4A',
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
        'inset 0 1px 0 rgba(255,255,255,0.95), inset 0 0 0 0.5px rgba(255,255,255,0.4), 0 1px 2px rgba(15,42,74,0.04), 0 10px 30px rgba(15,42,74,0.07)',
    },
    ios: {
      shadowColor: '#0F2A4A',
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
    },
    android: { elevation: 2 },
    default: {},
  }),
  accent: Platform.select({
    web: { boxShadow: '0 4px 12px rgba(15,42,74,0.25)' },
    ios: {
      shadowColor: '#0F2A4A',
      shadowOpacity: 0.25,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 4 },
    },
    android: { elevation: 3 },
    default: {},
  }),
  sheet: Platform.select({
    web: { boxShadow: '0 -4px 24px rgba(15,42,74,0.12)' },
    ios: {
      shadowColor: '#0F2A4A',
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: -4 },
    },
    android: { elevation: 12 },
    default: {},
  }),
  pin: Platform.select({
    web: { boxShadow: '0 2px 6px rgba(15,42,74,0.3)' },
    ios: {
      shadowColor: '#0F2A4A',
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
