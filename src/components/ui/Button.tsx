import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, layout, radius, shadow, spacing } from '@/lib/theme';

import { glassSurface } from './Glass';
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

const palette: Record<Variant, { bg: string; bgPressed: string; fg: string; glass?: boolean; raised?: boolean }> = {
  primary: { bg: colors.accent, bgPressed: colors.accentPressed, fg: colors.onAccent, raised: true },
  secondary: { bg: colors.glass, bgPressed: colors.glassStrong, fg: colors.text, glass: true },
  ghost: { bg: 'transparent', bgPressed: colors.glass, fg: colors.text },
  danger: { bg: colors.dangerSoft, bgPressed: colors.dangerSoftPressed, fg: colors.danger },
  plus: { bg: colors.plus, bgPressed: colors.plusPressed, fg: colors.onAccent, raised: true },
};

const glass = glassSurface('light');
const iconGlass = glassSurface('strong');

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
      style={({ pressed, hovered }) => [
        styles.base,
        p.glass ? glass : null,
        p.raised && !isDisabled ? (shadow.accent as ViewStyle) : null,
        {
          height: heights[size],
          backgroundColor: pressed ? p.bgPressed : hovered && variant === 'primary' ? colors.accentHover : p.bg,
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
  background,
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
        background === undefined ? iconGlass : null,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: pressed ? colors.glassStrong : (background ?? colors.glass),
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
    borderRadius: radius.pill,
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
    borderColor: colors.glassBorder,
  },
});
