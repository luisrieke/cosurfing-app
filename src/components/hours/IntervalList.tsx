import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import {
  DAY_MINUTES,
  dayError,
  endClock,
  type Interval,
  makeInterval,
  MAX_INTERVALS_PER_DAY,
  nextIntervalFor,
  sortIntervals,
} from '@/lib/hours';
import { strings } from '@/lib/strings';
import { colors, spacing } from '@/lib/theme';

import { TimeField } from './TimeField';

/** Time ranges of one day: "09:00 – 12:00", "14:00 – 18:00", plus add/remove. */
export function IntervalList({
  intervals,
  onChange,
  dayLabel,
}: {
  intervals: Interval[];
  onChange: (next: Interval[]) => void;
  dayLabel: string;
}) {
  const e = strings.hours.editor;
  const error = dayError(sortIntervals(intervals));
  const next = nextIntervalFor(sortIntervals(intervals));

  const update = (i: number, iv: Interval) => onChange(intervals.map((x, j) => (j === i ? iv : x)));

  return (
    <View style={styles.wrap}>
      {intervals.map((iv, i) => (
        // Rows are edited in place and never reordered while editing, so the index is stable.
        <View key={i} style={styles.row}>
          <TimeField
            value={iv[0]}
            onChange={(m) => update(i, makeInterval(Math.min(m, DAY_MINUTES - 1), endClock(iv[1])))}
            accessibilityLabel={`${dayLabel} ${e.opens}`}
          />
          <Text tone="muted">–</Text>
          <TimeField
            value={endClock(iv[1])}
            onChange={(m) => update(i, makeInterval(iv[0], m))}
            accessibilityLabel={`${dayLabel} ${e.closes}`}
          />
          {iv[1] > DAY_MINUTES ? (
            <Text variant="caption" tone="muted">
              +1 {strings.hours.nextDay}
            </Text>
          ) : null}
          <Pressable
            onPress={() => onChange(intervals.filter((_, j) => j !== i))}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${e.removeRange} (${dayLabel})`}
            style={styles.iconButton}
          >
            <Icon name="x" size={16} color={colors.textMuted} />
          </Pressable>
        </View>
      ))}
      {next && intervals.length < MAX_INTERVALS_PER_DAY ? (
        <Pressable
          onPress={() => onChange([...intervals, next])}
          accessibilityRole="button"
          accessibilityLabel={`${e.addRange} (${dayLabel})`}
          style={styles.add}
          hitSlop={6}
        >
          <Icon name="plus" size={14} color={colors.accent} />
          <Text variant="small" tone="accent">
            {e.addRange}
          </Text>
        </Pressable>
      ) : null}
      {error ? (
        <Text variant="small" tone="danger">
          {e.errors[error]}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  iconButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
});
