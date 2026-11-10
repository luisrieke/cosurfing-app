import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Notice, Text } from '@/components/ui';
import {
  cloneLaptopDay,
  copyDay,
  DAY_KEYS,
  type DayKey,
  DAY_MINUTES,
  type Interval,
  type LaptopDay,
  type LaptopMode,
  WEEKDAYS,
  WEEKEND,
  type WeeklyHours,
} from '@/lib/hours';
import { formatDayIntervals } from '@/lib/hoursText';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';

import { CopyDays } from './CopyDays';
import { IntervalList } from './IntervalList';

const MODES: LaptopMode[] = ['all', 'specific', 'none', 'unknown'];

export type LaptopWeek = Record<DayKey, LaptopDay>;

/** First laptop range for a day switched to "specific": the first four open hours, else 08:00–12:00. */
function defaultRanges(hours: WeeklyHours | null, day: DayKey): Interval[] {
  const first = hours?.[day][0];
  if (!first) return [[480, 720]];
  const end = Math.min(first[1], first[0] + 240, DAY_MINUTES);
  return [[first[0], end > first[0] ? end : first[0] + 60]];
}

function withMode(day: LaptopDay, mode: LaptopMode, hours: WeeklyHours | null, key: DayKey): LaptopDay {
  if (mode === day.mode) return day;
  if (mode === 'specific') return { mode, ranges: defaultRanges(hours, key) };
  return { mode };
}

function Segmented({
  value,
  onChange,
  label,
}: {
  value: LaptopMode | null;
  onChange: (mode: LaptopMode) => void;
  label: string;
}) {
  const s = strings.hours;
  const [narrow, setNarrow] = useState(false);
  const labels = narrow ? s.laptopModeTiny : s.laptopModeShort;
  return (
    <View
      style={styles.segmented}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      onLayout={(e) => setNarrow(e.nativeEvent.layout.width < 330)}
    >
      {MODES.map((m, i) => {
        const selected = value === m;
        return (
          <Pressable
            key={m}
            onPress={() => onChange(m)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${label}: ${s.laptopMode[m]}`}
            style={({ pressed }) => [
              styles.segment,
              i > 0 && styles.segmentDivider,
              selected && (m === 'none' ? styles.segmentNone : m === 'unknown' ? styles.segmentUnknown : styles.segmentOn),
              pressed && !selected && styles.segmentPressed,
            ]}
          >
            <Text
              variant="caption"
              numberOfLines={1}
              style={{ color: selected ? (m === 'unknown' ? colors.text : colors.onAccent) : colors.textMuted }}
            >
              {labels[m]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * When laptops are welcome, per weekday: all opening hours, specific hours, not allowed or unknown.
 * Quick rows set every day, weekdays or the weekend at once; any day can be copied to others.
 */
export function LaptopHoursEditor({
  value,
  onChange,
  hours,
}: {
  value: LaptopWeek;
  onChange: (next: LaptopWeek) => void;
  /** Opening hours, for "All opening hours" and sensible specific hours. */
  hours: WeeklyHours | null;
}) {
  const s = strings.hours;
  const e = s.editor;
  const [copyFrom, setCopyFrom] = useState<DayKey | null>(null);

  const setDays = (days: readonly DayKey[], mode: LaptopMode) => {
    const next = { ...value };
    for (const d of days) next[d] = withMode(value[d], mode, hours, d);
    onChange(next);
  };
  const groupMode = (days: readonly DayKey[]): LaptopMode | null => {
    const modes = new Set(days.map((d) => value[d].mode));
    return modes.size === 1 ? [...modes][0]! : null;
  };
  const needsHours = !hours && DAY_KEYS.some((d) => value[d].mode === 'all');

  const quick: { label: string; days: readonly DayKey[] }[] = [
    { label: e.laptopAllDays, days: DAY_KEYS },
    { label: e.laptopWeekdays, days: WEEKDAYS },
    { label: e.laptopWeekend, days: WEEKEND },
  ];

  return (
    <View style={styles.wrap}>
      <Text variant="small" tone="muted">
        {s.laptopSeparate}
      </Text>
      <View style={styles.quick}>
        {quick.map((q) => (
          <View key={q.label} style={styles.quickRow}>
            <Text variant="smallStrong" style={styles.quickLabel}>
              {q.label}
            </Text>
            <Segmented value={groupMode(q.days)} onChange={(m) => setDays(q.days, m)} label={q.label} />
          </View>
        ))}
      </View>

      {needsHours ? <Notice tone="warning" body={e.laptopNoHours} /> : null}

      {DAY_KEYS.map((day) => {
        const d = value[day];
        const label = s.dayLong[day];
        const closed = hours ? hours[day].length === 0 : false;
        return (
          <View key={day} style={styles.day}>
            <View style={styles.dayHead}>
              <Text variant="smallStrong" style={styles.dayName}>
                {s.day[day]}
              </Text>
              <Segmented value={d.mode} onChange={(m) => setDays([day], m)} label={label} />
              <Pressable
                onPress={() => setCopyFrom(copyFrom === day ? null : day)}
                accessibilityRole="button"
                accessibilityLabel={e.copyTitle(label)}
                hitSlop={6}
                style={styles.copy}
              >
                <Icon name="copy" size={14} color={colors.textMuted} />
              </Pressable>
            </View>
            {d.mode === 'all' && hours ? (
              <Text variant="caption" tone="muted" style={styles.indent}>
                {closed ? s.laptopDay.allClosed : formatDayIntervals(hours[day])}
              </Text>
            ) : null}
            {d.mode === 'specific' ? (
              <View style={styles.indent}>
                <IntervalList
                  intervals={d.ranges}
                  onChange={(ranges) => onChange({ ...value, [day]: ranges.length ? { mode: 'specific', ranges } : { mode: 'none' } })}
                  dayLabel={label}
                />
              </View>
            ) : null}
            {copyFrom === day ? (
              <CopyDays
                from={day}
                onCancel={() => setCopyFrom(null)}
                onApply={(to) => {
                  onChange(copyDay(value, day, to, cloneLaptopDay));
                  setCopyFrom(null);
                }}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  quick: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.bgSubtle,
  },
  quickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickLabel: {
    width: 64,
  },
  day: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dayHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dayName: {
    width: 36,
  },
  indent: {
    marginLeft: 36 + spacing.sm,
  },
  copy: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmented: {
    flex: 1,
    flexDirection: 'row',
    minWidth: 220,
    maxWidth: 420,
    height: 34,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  segment: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  segmentDivider: {
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  segmentOn: {
    backgroundColor: colors.success,
  },
  segmentNone: {
    backgroundColor: colors.danger,
  },
  segmentUnknown: {
    backgroundColor: colors.bgMuted,
  },
  segmentPressed: {
    backgroundColor: colors.bgSubtle,
  },
});
