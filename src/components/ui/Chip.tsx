import { Pressable, StyleSheet } from 'react-native';

import { colors, radius, spacing } from '@/lib/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  color?: string;
}

export function Chip({ label, selected, onPress, icon, color = colors.accent }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected
          ? { backgroundColor: color, borderColor: color }
          : { backgroundColor: pressed ? colors.bgMuted : colors.bg, borderColor: colors.borderStrong },
      ]}
    >
      {icon ? <Icon name={icon} size={14} color={selected ? colors.onAccent : colors.textMuted} /> : null}
      <Text variant="smallStrong" style={{ color: selected ? colors.onAccent : colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
