import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, layout, radius, spacing } from '@/lib/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'plus';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

const palette: Record<Variant, { bg: string; bgPressed: string; fg: string; border?: string }> = {
  primary: { bg: colors.accent, bgPressed: colors.accentHover, fg: colors.onAccent },
  secondary: { bg: colors.bg, bgPressed: colors.bgMuted, fg: colors.text, border: colors.borderStrong },
  ghost: { bg: 'transparent', bgPressed: colors.bgMuted, fg: colors.text },
  danger: { bg: colors.dangerSoft, bgPressed: '#F9D9D5', fg: colors.danger },
  plus: { bg: colors.plus, bgPressed: '#4338CA', fg: colors.onAccent },
};

const heights: Record<Size, number> = { sm: 36, md: layout.touchTarget, lg: 52 };

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading,
  disabled,
  fullWidth,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const p = palette[variant];
  const isDisabled = disabled || loading;
  const iconSize = size === 'sm' ? 16 : 18;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          height: heights[size],
          backgroundColor: pressed ? p.bgPressed : p.bg,
          borderColor: p.border ?? 'transparent',
          borderWidth: p.border ? 1 : 0,
          paddingHorizontal: size === 'sm' ? spacing.md : spacing.lg,
          opacity: isDisabled ? 0.55 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={iconSize} color={p.fg} /> : null}
          <Text
            variant={size === 'sm' ? 'smallStrong' : 'bodyStrong'}
            style={{ color: p.fg }}
            numberOfLines={1}
          >
            {title}
          </Text>
          {iconRight ? <Icon name={iconRight} size={iconSize} color={p.fg} /> : null}
        </View>
      )}
    </Pressable>
  );
}

interface IconButtonProps {
  icon: IconName;
  onPress?: () => void;
  accessibilityLabel: string;
  size?: number;
  color?: string;
  background?: string;
  style?: ViewStyle;
  disabled?: boolean;
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  size = layout.touchTarget,
  color = colors.text,
  background = colors.bg,
  style,
  disabled,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconButton,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: pressed ? colors.bgMuted : background,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.45)} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
});
