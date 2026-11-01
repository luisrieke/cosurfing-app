import { LinearGradient } from 'expo-linear-gradient';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors } from '@/lib/theme';

const GLOWS: { color: string; style: ViewStyle }[] = [
  { color: colors.ambientPeach, style: { top: '-22%', right: '-12%', width: '58%', aspectRatio: 1 } },
  { color: colors.ambientSage, style: { top: '18%', left: '-24%', width: '52%', aspectRatio: 1 } },
];

/** Bright paper base with two faint glows, so glass surfaces have something to frost without looking muddy. */
export function AmbientBackground() {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.root]}>
      <LinearGradient colors={[colors.ambientTop, colors.ambientBottom]} style={StyleSheet.absoluteFill} />
      {GLOWS.map((g) =>
        Platform.OS === 'web' ? (
          <View
            key={g.color}
            style={[styles.glow, g.style, { backgroundColor: g.color, filter: 'blur(120px)', opacity: 0.5 } as ViewStyle]}
          />
        ) : (
          <LinearGradient
            key={g.color}
            colors={[`${g.color}99`, `${g.color}00`]}
            start={{ x: 0.5, y: 0.5 }}
            end={{ x: 1, y: 1 }}
            style={[styles.glow, g.style]}
          />
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.ambientTop,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    borderRadius: 9999,
  },
});
