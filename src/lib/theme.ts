import { Platform } from 'react-native';

export const colors = {
  bg: '#FBF8EF',
  surface: '#FFFFFF',
  bgMuted: '#F3EEDF',
  bgSubtle: '#FFFDF6',
  border: '#EDE6D3',
  borderStrong: '#DCD1B8',
  text: '#33302A',
  textMuted: '#726B5F',
  textFaint: '#ABA392',
  accent: '#2F8551',
  accentHover: '#389A5E',
  accentPressed: '#267046',
  accentSoft: '#FFF3C4',
  onAccent: '#FFFFFF',
  coworking: '#D9971A',
  coworkingSoft: '#FFF0C9',
  cafe: '#3E9E62',
  cafeSoft: '#DDF2E3',
  library: '#5A9BD5',
  librarySoft: '#E1EEFA',
  coliving: '#E8825F',
  colivingSoft: '#FCE4DA',
  scoreGreat: '#2F8551',
  scoreGood: '#7BAA3A',
  scoreOkay: '#E0A21F',
  scoreLow: '#A39A8E',
  plus: '#8B6FC9',
  plusPressed: '#7458B3',
  plusSoft: '#EEE8FA',
  danger: '#C9473D',
  dangerSoft: '#FBE2DE',
  dangerSoftPressed: '#F5CFC9',
  success: '#2F8551',
  successSoft: '#DDF2E3',
  warning: '#C98612',
  warningSoft: '#FFF1CF',
  /** Map pin rings for places the signed-in user reviewed (light) or reviewed with photos (dark). */
  mineReviewed: '#9BDB6F',
  mineWithPhotos: '#2F8551',
  /** Pins and rows of places whose venue told us laptop work is not allowed. */
  workForbidden: '#B5ADA3',
  overlay: 'rgba(58, 46, 36, 0.45)',
  /** Sunny yellow highlight (cluster rings, glows, soft accent backgrounds). */
  sunny: '#F7CB45',
  star: '#F5B82E',
  glass: 'rgba(255, 254, 248, 0.74)',
  glassStrong: 'rgba(255, 254, 248, 0.88)',
  glassBorder: 'rgba(255, 255, 255, 0.85)',
  glassDark: 'rgba(58, 46, 36, 0.25)',
  glassDarkBorder: 'rgba(255, 255, 255, 0.35)',
  glassInk: 'rgba(58, 46, 36, 0.72)',
  glassInkBorder: 'rgba(255, 255, 255, 0.14)',
  ambientTop: '#FFFDF6',
  ambientBottom: '#F8F3E4',
  ambientPeach: '#FFE58A',
  ambientSage: '#C9ECCF',
  ambientSky: '#D6EAFB',
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
