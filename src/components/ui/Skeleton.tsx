import { useEffect } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius } from '@/lib/theme';

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  round?: boolean;
  style?: ViewStyle;
}

export function Skeleton({ width = '100%', height = 16, round, style }: SkeletonProps) {
  const opacity = useSharedValue(0.6);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, [opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[
        styles.base,
        { width, height, borderRadius: round ? height / 2 : radius.sm },
        animated,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.bgMuted,
  },
});
