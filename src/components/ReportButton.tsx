import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { strings } from '@/lib/strings';
import { colors } from '@/lib/theme';
import type { ReportTargetType } from '@/lib/types';

/** Entry point to the notice-and-action form (Art. 16 DSA) for one piece of user content. */
export function ReportButton({ type, id, label = false, color = colors.textFaint }: { type: ReportTargetType; id: string; label?: boolean; color?: string }) {
  const router = useRouter();
  const a11y = `${strings.contentReport.action} ${strings.contentReport.targets[type]}`;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/report', params: { type, id } })}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={8}
      style={styles.row}
    >
      <Icon name="flag" size={13} color={color} />
      {label ? (
        <Text variant="caption" style={{ color }}>
          {strings.contentReport.action}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
