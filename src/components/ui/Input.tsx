import { useState } from 'react';
import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { colors, fontFamily, radius, spacing } from '@/lib/theme';

import { Text } from './Text';

export interface InputProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string | null;
  optional?: boolean;
}

export function Input({ label, hint, error, optional, style, multiline, onFocus, onBlur, ...rest }: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text variant="smallStrong" style={styles.label}>
          {label}
          {optional ? (
            <Text variant="small" tone="muted">
              {'  '}optional
            </Text>
          ) : null}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={colors.textFaint}
        multiline={multiline}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          multiline && styles.multiline,
          focused && styles.inputFocused,
          error ? styles.inputError : null,
          style,
        ]}
      />
      {error ? (
        <Text variant="small" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  label: {
    marginBottom: 2,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    fontFamily,
    outlineWidth: 0,
  },
  inputFocused: {
    borderColor: colors.textMuted,
  },
  multiline: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: colors.danger,
  },
});
