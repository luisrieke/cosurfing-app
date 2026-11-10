import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Chip, Text } from '@/components/ui';
import { DAY_KEYS, type DayKey, WEEKDAYS, WEEKEND } from '@/lib/hours';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';

/** Picks the days to copy one day's schedule to; shortcuts for weekdays, weekend and every day. */
export function CopyDays({
  from,
  onApply,
  onCancel,
}: {
  from: DayKey;
  onApply: (to: DayKey[]) => void;
  onCancel: () => void;
}) {
  const e = strings.hours.editor;
  const [targets, setTargets] = useState<DayKey[]>([]);
  const toggle = (d: DayKey) => setTargets((t) => (t.includes(d) ? t.filter((x) => x !== d) : [...t, d]));
  const others = (days: readonly DayKey[]) => days.filter((d) => d !== from);
  const quick = (days: readonly DayKey[]) => onApply(others(days));

  return (
    <View style={styles.panel}>
      <Text variant="smallStrong">{e.copyTitle(strings.hours.dayLong[from])}</Text>
      <View style={styles.row}>
        <Chip label={e.copyWeekdays} onPress={() => quick(WEEKDAYS)} />
        <Chip label={e.copyWeekend} onPress={() => quick(WEEKEND)} />
        <Chip label={e.copyAll} onPress={() => quick(DAY_KEYS)} />
      </View>
      <View style={styles.row}>
        {others(DAY_KEYS).map((d) => (
          <Chip key={d} label={strings.hours.day[d]} selected={targets.includes(d)} onPress={() => toggle(d)} color={colors.text} />
        ))}
      </View>
      <View style={styles.row}>
        <Button title={e.copyApply} size="sm" disabled={targets.length === 0} onPress={() => onApply(targets)} />
        <Button title={strings.common.cancel} size="sm" variant="ghost" onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
