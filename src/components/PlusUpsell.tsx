import { useRouter } from 'expo-router';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Badge, Button, Text } from '@/components/ui';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';

interface PlusUpsellProps {
  message: string;
  style?: ViewStyle;
  compact?: boolean;
}

export function PlusUpsell({ message, style, compact }: PlusUpsellProps) {
  const router = useRouter();
  return (
    <View style={[styles.wrap, compact && styles.compact, style]}>
      <View style={styles.text}>
        <Badge label={strings.plus.title} tone="plus" icon="star" />
        <Text variant={compact ? 'small' : 'body'}>{message}</Text>
        <Text variant="caption" tone="muted">
          {strings.plus.price} · {strings.plus.billing}
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
