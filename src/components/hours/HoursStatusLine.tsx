import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { type LaptopHours, localWeekMinute, openStatus, type WeeklyHours, workStatus } from '@/lib/hours';
import { openStatusText, type StatusTone, workStatusText } from '@/lib/hoursText';
import { colors, spacing } from '@/lib/theme';

export const toneColor: Record<StatusTone, string> = {
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
  muted: colors.textMuted,
};

/**
 * "● Open · closes 18:00 · Laptops welcome until 12:00" in the place's local time. Renders nothing
 * when the hours or the time zone are unknown.
 */
export function HoursStatusLine({
  hours,
  laptop,
  category,
  timezone,
  now,
  showWork = false,
}: {
  hours: WeeklyHours | null;
  laptop: LaptopHours | null;
  category: string;
  timezone: string | null;
  now: Date;
  /** Add the laptop status (while "Work here now" matters). */
  showWork?: boolean;
}) {
  const minute = localWeekMinute(now, timezone);
  const open = openStatus(hours, minute);
  if (open.kind === 'unknown') return null;
  const text = openStatusText(open, minute);
  const work = showWork ? workStatusText(workStatus(hours, laptop, category, minute), minute) : null;

  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: toneColor[text.tone] }]} />
      <Text variant="caption" numberOfLines={1} style={styles.text}>
        <Text variant="caption" style={{ color: toneColor[text.tone], fontWeight: '600' }}>
          {text.label}
        </Text>
        {text.detail ? <Text variant="caption" tone="muted">{` · ${text.detail}`}</Text> : null}
        {work ? <Text variant="caption" style={{ color: toneColor[work.tone] }}>{` · ${work.label}`}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    minWidth: 0,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  text: {
    flexShrink: 1,
  },
});
