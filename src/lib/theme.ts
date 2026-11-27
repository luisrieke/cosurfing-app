import { Platform } from 'react-native';

export const colors = {
  bg: '#F7F2EA',
  surface: '#FFFDF9',
  bgMuted: '#EEE6D9',
  bgSubtle: '#FBF8F2',
  border: '#E8DFD1',
  borderStrong: '#D6C9B5',
  text: '#3A332C',
  textMuted: '#7A6F63',
  textFaint: '#AEA394',
  accent: '#577A5A',
  accentHover: '#658A67',
  accentPressed: '#4A6A4D',
  accentSoft: '#E3EBDC',
  onAccent: '#FFFDF9',
  coworking: '#6F8F64',
  coworkingSoft: '#E3EBDC',
  cafe: '#C9805F',
  cafeSoft: '#F6E3D8',
  library: '#6E8CA6',
  librarySoft: '#E2EAF1',
  coliving: '#C99A4B',
  colivingSoft: '#F5EAD3',
  scoreGreat: '#577A5A',
  scoreGood: '#8A9A55',
  scoreOkay: '#C9805F',
  scoreLow: '#A39A8E',
  plus: '#8C6E8F',
  plusPressed: '#765A79',
  plusSoft: '#EFE6EF',
  danger: '#B5524A',
  dangerSoft: '#F6E1DD',
  dangerSoftPressed: '#EFD0CB',
  success: '#577A5A',
  successSoft: '#E3EBDC',
  warning: '#B9803A',
  warningSoft: '#F7EBD6',
  /** Map pin rings for places the signed-in user reviewed (light) or reviewed with photos (dark). */
  mineReviewed: '#A9C98E',
  mineWithPhotos: '#4F7A4A',
  /** Pins and rows of places whose venue told us laptop work is not allowed. */
  workForbidden: '#B5ADA3',
  overlay: 'rgba(58, 46, 36, 0.45)',
  star: '#E0A93B',
  glass: 'rgba(255, 252, 246, 0.74)',
  glassStrong: 'rgba(255, 252, 246, 0.88)',
  glassBorder: 'rgba(255, 255, 255, 0.85)',
  glassDark: 'rgba(58, 46, 36, 0.25)',
  glassDarkBorder: 'rgba(255, 255, 255, 0.35)',
  glassInk: 'rgba(58, 46, 36, 0.72)',
  glassInkBorder: 'rgba(255, 255, 255, 0.14)',
  ambientTop: '#FBF8F2',
  ambientBottom: '#F4EDE2',
  ambientPeach: '#F2D8C4',
  ambientSage: '#DCE5CC',
  ambientSky: '#EBDFCF',
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
    web: { boxShadow: '0 1px 2px rgba(58,46,36,0.06), 0 8px 24px rgba(58,46,36,0.08)' },
    ios: {
      shadowColor: '#3A2E24',
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
        'inset 0 1px 0 rgba(255,255,255,0.95), inset 0 0 0 0.5px rgba(255,255,255,0.4), 0 1px 2px rgba(58,46,36,0.04), 0 10px 30px rgba(58,46,36,0.07)',
    },
    ios: {
      shadowColor: '#3A2E24',
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
    },
    android: { elevation: 2 },
    default: {},
  }),
  accent: Platform.select({
    web: { boxShadow: '0 4px 12px rgba(58,46,36,0.25)' },
    ios: {
      shadowColor: '#3A2E24',
      shadowOpacity: 0.25,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 4 },
    },
    android: { elevation: 3 },
    default: {},
  }),
  sheet: Platform.select({
    web: { boxShadow: '0 -4px 24px rgba(58,46,36,0.12)' },
    ios: {
      shadowColor: '#3A2E24',
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: -4 },
    },
    android: { elevation: 12 },
    default: {},
  }),
  pin: Platform.select({
    web: { boxShadow: '0 2px 6px rgba(58,46,36,0.3)' },
    ios: {
      shadowColor: '#3A2E24',
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
