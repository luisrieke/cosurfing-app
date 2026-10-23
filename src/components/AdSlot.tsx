import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isDev } from '@/lib/env';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';

/**
 * A single, clearly labelled ad position in the results list.
 * No ad provider is integrated yet: in development we render a labelled placeholder,
 * in production builds nothing is rendered until a provider is configured here.
 */
const AD_PROVIDER_CONFIGURED = false;

export function AdSlot() {
  const { isPlus } = useAuth();
  if (isPlus) return null;
  if (!AD_PROVIDER_CONFIGURED) {
    if (!isDev) return null;
    return (
      <View style={styles.slot} accessibilityLabel={strings.plus.adLabel}>
        <Text variant="caption" tone="faint" style={styles.label}>
          {strings.plus.adLabel}
        </Text>
        <Text variant="small" tone="muted">
          {strings.plus.adPlaceholder}
        </Text>
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  slot: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgSubtle,
    gap: 4,
  },
  label: {
    textTransform: 'uppercase',
  },
});
