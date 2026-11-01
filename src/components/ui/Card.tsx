import { Pressable, StyleSheet, type ViewProps, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/lib/theme';

import { Glass } from './Glass';

interface CardProps extends ViewProps {
  onPress?: () => void;
  padded?: boolean;
  selected?: boolean;
  style?: ViewStyle;
}

export function Card({ onPress, padded = true, selected, style, children, ...rest }: CardProps) {
  const content = (
    <Glass
      {...rest}
      variant="strong"
      style={[
        styles.card,
        padded && styles.padded,
        selected && styles.selected,
        style,
      ]}
    >
      {children}
    </Glass>
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
    borderRadius: radius.lg,
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
