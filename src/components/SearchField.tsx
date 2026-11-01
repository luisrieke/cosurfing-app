import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, type ViewStyle } from 'react-native';

import { Glass, Icon } from '@/components/ui';
import { strings } from '@/lib/strings';
import { colors, fontFamily, radius, spacing } from '@/lib/theme';

export function SearchField({
  value,
  onChangeText,
  placeholder,
  large,
  style,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  large?: boolean;
  style?: ViewStyle;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <Glass
      variant="strong"
      // Inline, because Glass sets its border inline and inline styles beat StyleSheet classes on web.
      style={[styles.row, large && styles.large, focused && { borderColor: colors.textFaint }, style]}
    >
      <Icon name="search" size={large ? 20 : 18} color={colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel={placeholder}
        style={[styles.input, large && styles.inputLarge]}
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={8} accessibilityLabel={strings.common.close}>
          <Icon name="x" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </Glass>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  large: {
    height: 58,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 15,
    color: colors.text,
    fontFamily,
    outlineWidth: 0,
  },
  inputLarge: {
    fontSize: 17,
  },
});
