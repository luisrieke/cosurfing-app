import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';

import { colors, shadow } from '@/lib/theme';

export type GlassVariant = 'light' | 'strong' | 'dark' | 'ink';

const fills: Record<GlassVariant, { bg: string; border: string; blur: number }> = {
  light: { bg: colors.glass, border: colors.glassBorder, blur: 24 },
  strong: { bg: colors.glassStrong, border: colors.glassBorder, blur: 32 },
  dark: { bg: colors.glassDark, border: colors.glassDarkBorder, blur: 14 },
  ink: { bg: colors.glassInk, border: colors.glassInkBorder, blur: 28 },
};

const isDark = (v: GlassVariant) => v === 'dark' || v === 'ink';

/**
 * Translucent surface style without a native blur layer. Cheap enough for many small
 * controls (chips, buttons); on web the browser still blurs what is behind it.
 */
export function glassSurface(variant: GlassVariant = 'light', { flat = false }: { flat?: boolean } = {}): ViewStyle {
  const f = fills[variant];
  return {
    backgroundColor: f.bg,
    borderWidth: 1,
    borderColor: f.border,
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: `blur(${f.blur}px) saturate(1.8)`,
          WebkitBackdropFilter: `blur(${f.blur}px) saturate(1.8)`,
        } as ViewStyle)
      : null),
    ...(variant === 'ink' ? (shadow.card as ViewStyle) : isDark(variant) || flat ? null : (shadow.glass as ViewStyle)),
  };
}

interface GlassProps extends ViewProps {
  variant?: GlassVariant;
}

/** Frosted surface: CSS backdrop blur on web, a native blur layer on iOS/Android. */
export function Glass({ variant = 'light', style, children, ...rest }: GlassProps) {
  if (Platform.OS === 'web') {
    return (
      <View {...rest} style={[glassSurface(variant), style]}>
        {children}
      </View>
    );
  }
  return (
    <View {...rest} style={[glassSurface(variant), styles.native, style]}>
      <BlurView
        intensity={isDark(variant) ? 30 : 50}
        tint={isDark(variant) ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  native: {
    overflow: 'hidden',
  },
});
