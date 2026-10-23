import { Pressable, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';

import { colors, radius, shadow, spacing } from '@/lib/theme';

interface CardProps extends ViewProps {
  onPress?: () => void;
  padded?: boolean;
  selected?: boolean;
  style?: ViewStyle;
}

export function Card({ onPress, padded = true, selected, style, children, ...rest }: CardProps) {
  const content = (
    <View
      {...rest}
      style={[
        styles.card,
        padded && styles.padded,
        selected && styles.selected,
        style,
      ]}
    >
      {children}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...(shadow.card as object),
  },
  padded: {
    padding: spacing.lg,
  },
  selected: {
    borderColor: colors.accent,
  },
  pressed: {
    opacity: 0.92,
  },
});
