import { Text as RNText, type TextProps as RNTextProps, StyleSheet } from 'react-native';

import { colors, fontFamily, typography } from '@/lib/theme';

type Variant = keyof typeof typography;
type Tone = 'default' | 'muted' | 'faint' | 'accent' | 'danger' | 'success' | 'inverse' | 'plus';

export interface TextProps extends RNTextProps {
  variant?: Variant;
  tone?: Tone;
  align?: 'left' | 'center' | 'right';
}

const toneColor: Record<Tone, string> = {
  default: colors.text,
  muted: colors.textMuted,
  faint: colors.textFaint,
  accent: colors.accent,
  danger: colors.danger,
  success: colors.success,
  inverse: colors.onAccent,
  plus: colors.plus,
};

export function Text({ variant = 'body', tone = 'default', align, style, ...rest }: TextProps) {
  return (
    <RNText
      {...rest}
      style={[
        styles.base,
        typography[variant],
        { color: toneColor[tone] },
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    fontFamily,
  },
});
