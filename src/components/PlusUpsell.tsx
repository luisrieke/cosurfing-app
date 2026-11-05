import { useRouter } from 'expo-router';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Badge, Button, Text } from '@/components/ui';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';

interface PlusUpsellProps {
  message: string;
  title?: string;
  style?: ViewStyle;
  compact?: boolean;
}

export function PlusUpsell({ message, title, style, compact }: PlusUpsellProps) {
  const router = useRouter();
  return (
    <View style={[styles.wrap, compact && styles.compact, style]}>
      <View style={styles.text}>
        <Badge label={strings.plus.title} tone="plus" icon="star" />
        {title ? <Text variant="bodyStrong">{title}</Text> : null}
        <Text variant={compact ? 'small' : 'body'}>{message}</Text>
        <Text variant="caption" tone="muted">
          {strings.plus.priceSummary} · {strings.plus.cancelAnytime}
        </Text>
      </View>
      <Button
        title={strings.plus.unlock}
        variant="plus"
        size={compact ? 'sm' : 'md'}
        onPress={() => router.push('/plus')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.plusSoft,
  },
  compact: {
    padding: spacing.md,
  },
  text: {
    gap: spacing.sm,
  },
});
