import { type ReactNode, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { colors, radius, shadow } from '@/lib/theme';

interface BottomSheetProps {
  /** Visible heights (px from the bottom), ascending. */
  snapPoints: number[];
  index: number;
  onIndexChange: (index: number) => void;
  containerHeight: number;
  /** Pannable header area (drag handle + summary). */
  header: ReactNode;
  children: ReactNode;
}

const SPRING = { damping: 24, stiffness: 220, mass: 0.8 };

export function BottomSheet({ snapPoints, index, onIndexChange, containerHeight, header, children }: BottomSheetProps) {
  const positions = snapPoints.map((h) => Math.max(0, containerHeight - h));
  const minTop = positions[positions.length - 1] ?? 0;
  const maxTop = positions[0] ?? containerHeight;
  const top = useSharedValue(positions[index] ?? maxTop);
  const startTop = useSharedValue(0);

  // Animate whenever the resolved target (a number) changes: covers index changes
  // and layout changes without depending on the freshly built `positions` array.
  const target = positions[index];
  useEffect(() => {
    if (target !== undefined) top.set(withSpring(target, SPRING));
  }, [target, top]);

  const pan = Gesture.Pan()
    .onStart(() => {
      startTop.set(top.get());
    })
    .onUpdate((e) => {
      const next = startTop.get() + e.translationY;
      top.set(Math.min(maxTop, Math.max(minTop, next)));
    })
    .onEnd((e) => {
      const projected = top.get() + e.velocityY * 0.15;
      let best = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < positions.length; i++) {
        const d = Math.abs(positions[i]! - projected);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      top.set(withSpring(positions[best]!, SPRING));
      runOnJS(onIndexChange)(best);
    });

  const sheetStyle = useAnimatedStyle(() => ({ top: top.get() }));

  return (
    <Animated.View style={[styles.sheet, sheetStyle]} pointerEvents="box-none">
      <GestureDetector gesture={pan}>
        <View style={styles.header}>
          <View style={styles.handle} />
          {header}
        </View>
      </GestureDetector>
      <View style={styles.content}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...(shadow.sheet as object),
  },
  header: {
    paddingTop: 8,
    paddingBottom: 4,
    alignItems: 'stretch',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.borderStrong,
    marginBottom: 8,
  },
  content: {
    flex: 1,
    overflow: 'hidden',
  },
});
