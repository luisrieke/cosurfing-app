import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui';
import { colors, radius, scoreColor } from '@/lib/theme';

const sizes = {
  sm: { box: 36, font: 'smallStrong' as const },
  md: { box: 48, font: 'heading' as const },
  lg: { box: 72, font: 'title' as const },
};

/** Work score on a 0–10 scale, colored by quality. */
export function ScoreBadge({
  score,
  size = 'md',
  style,
}: {
  score: number | null | undefined;
  size?: keyof typeof sizes;
  style?: ViewStyle;
}) {
  const s = sizes[size];
  const value = score === null || score === undefined ? null : Number(score);
  return (
    <View
      style={[styles.badge, { width: s.box, height: s.box, backgroundColor: scoreColor(value) }, style]}
      accessibilityLabel={value === null ? 'No score' : `Work score ${value.toFixed(1)} out of 10`}
    >
      <Text variant={s.font} style={styles.text}>
        {value === null ? '–' : value.toFixed(1)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.glassDarkBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: colors.onAccent,
  },
});
