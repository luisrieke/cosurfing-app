import { StyleSheet, View } from 'react-native';

import { Icon, type IconName, Text } from '@/components/ui';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';

type Tone = 'good' | 'okay' | 'bad' | 'unknown' | 'neutral';

interface FactRowProps {
  icon: IconName;
  label: string;
  value: string | null | undefined;
  tone?: Tone;
}

const toneColors: Record<Tone, string> = {
  good: colors.success,
  okay: colors.warning,
  bad: colors.danger,
  unknown: colors.textFaint,
  neutral: colors.text,
};

export function FactRow({ icon, label, value, tone = 'neutral' }: FactRowProps) {
  const isUnknown = !value || tone === 'unknown';
  return (
    <View style={styles.row}>
      <View style={styles.iconWrap}>
        <Icon name={icon} size={16} color={isUnknown ? colors.textFaint : colors.textMuted} />
      </View>
      <View style={styles.text}>
        <Text variant="caption" tone="muted">
          {label}
        </Text>
        <Text variant="small" style={{ color: isUnknown ? colors.textFaint : toneColors[tone], fontWeight: '600' }}>
          {isUnknown ? strings.common.unknown : value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    width: '50%',
    paddingVertical: spacing.sm,
    paddingRight: spacing.md,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.bgMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
});
