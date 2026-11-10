import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { formatMinute, parseTimeInput } from '@/lib/hours';
import { strings } from '@/lib/strings';
import { colors, fontFamily, radius } from '@/lib/theme';

/**
 * A time of day. Accepts "9", "930", "9:30", "21h" or "9pm" and shows it as "09:30" once the field
 * loses focus. Every valid value is passed on while typing; an invalid one keeps the last valid value
 * and turns the field red.
 */
export function TimeField({
  value,
  onChange,
  accessibilityLabel,
}: {
  /** Minutes after midnight; 1440 is shown as 24:00. */
  value: number;
  onChange: (minutes: number) => void;
  accessibilityLabel: string;
}) {
  const [text, setText] = useState(formatMinute(value));
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(value);
  const invalid = parseTimeInput(text) === null;

  // Follow outside changes (presets, copying) unless the user is typing.
  if (!focused && value !== shown) {
    setShown(value);
    setText(formatMinute(value));
  }

  return (
    <TextInput
      value={text}
      onChangeText={(t) => {
        setText(t);
        const m = parseTimeInput(t);
        if (m !== null) onChange(m);
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        const m = parseTimeInput(text);
        setShown(value);
        setText(formatMinute(m ?? value));
      }}
      placeholder={strings.hours.editor.timePlaceholder}
      placeholderTextColor={colors.textFaint}
      keyboardType="numbers-and-punctuation"
      inputMode="text"
      autoCorrect={false}
      autoCapitalize="none"
      maxLength={7}
      selectTextOnFocus
      accessibilityLabel={accessibilityLabel}
      style={[styles.input, focused && styles.focused, invalid && styles.invalid]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    width: 76,
    height: 40,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 15,
    fontFamily,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    outlineWidth: 0,
    outlineStyle: 'solid',
  },
  focused: {
    borderColor: colors.textMuted,
  },
  invalid: {
    borderColor: colors.danger,
  },
});
