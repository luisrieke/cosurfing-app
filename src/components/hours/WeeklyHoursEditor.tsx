import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Chip, Icon, Text } from '@/components/ui';
import {
  cloneIntervals,
  copyDay,
  DAY_KEYS,
  type DayKey,
  defaultPreset,
  hasAnyHours,
  type HoursPreset,
  type Interval,
  presetHours,
  type WeeklyHours,
} from '@/lib/hours';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';

import { CopyDays } from './CopyDays';
import { IntervalList } from './IntervalList';

const PRESETS: HoursPreset[] = ['weekdays', 'cafe', 'daily', 'late', 'always'];

/** Hours a day gets when it is switched to open: the closest earlier open day's, else 09:00–18:00. */
function hoursForNewlyOpenDay(week: WeeklyHours, day: DayKey): Interval[] {
  const i = DAY_KEYS.indexOf(day);
  for (let k = 1; k < 7; k++) {
    const other = week[DAY_KEYS[(i - k + 7) % 7]!];
    if (other.length) return cloneIntervals(other);
  }
  return [[540, 1080]];
}

/**
 * Weekly opening hours, Monday to Sunday: open or closed per day, several time ranges per day,
 * overnight ranges, presets to start from and copying a day to other days.
 */
export function WeeklyHoursEditor({
  value,
  onChange,
  category,
}: {
  value: WeeklyHours;
  onChange: (next: WeeklyHours) => void;
  category: string;
}) {
  const e = strings.hours.editor;
  const [copyFrom, setCopyFrom] = useState<DayKey | null>(null);
  const first = defaultPreset(category);
  const presets = [first, ...PRESETS.filter((p) => p !== first)];

  const setDay = (day: DayKey, intervals: Interval[]) => onChange({ ...value, [day]: intervals });

  return (
    <View style={styles.wrap}>
      <View style={styles.presets}>
        <Text variant="caption" tone="muted">
          {e.presets}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
          {presets.map((p) => (
            <Chip key={p} label={e.preset[p]} onPress={() => onChange(presetHours(p))} />
          ))}
        </ScrollView>
      </View>

      {!hasAnyHours(value) ? (
        <Text variant="small" tone="muted">
          {e.empty}
        </Text>
      ) : null}

      {DAY_KEYS.map((day) => {
        const intervals = value[day];
        const open = intervals.length > 0;
        const label = strings.hours.dayLong[day];
        return (
          <View key={day} style={styles.day}>
            <View style={styles.dayHead}>
              <Text variant="smallStrong" style={styles.dayName}>
                {strings.hours.day[day]}
              </Text>
              <Pressable
                onPress={() => setDay(day, open ? [] : hoursForNewlyOpenDay(value, day))}
                accessibilityRole="switch"
                accessibilityState={{ checked: open }}
                accessibilityLabel={`${label}: ${open ? e.open : e.closed}`}
                style={[styles.toggle, open ? styles.toggleOn : styles.toggleOff]}
              >
                <View style={[styles.knob, open && styles.knobOn]} />
                <Text variant="small" style={{ color: open ? colors.success : colors.textMuted }}>
                  {open ? e.open : e.closed}
                </Text>
              </Pressable>
              <View style={styles.spacer} />
              <Pressable
                onPress={() => setCopyFrom(copyFrom === day ? null : day)}
                accessibilityRole="button"
                accessibilityLabel={e.copyTitle(label)}
                hitSlop={6}
                style={styles.copy}
              >
                <Icon name="copy" size={14} color={colors.textMuted} />
                <Text variant="small" tone="muted">
                  {e.copy}
                </Text>
              </Pressable>
            </View>
            {open ? <IntervalList intervals={intervals} onChange={(next) => setDay(day, next)} dayLabel={label} /> : null}
            {copyFrom === day ? (
              <CopyDays
                from={day}
                onCancel={() => setCopyFrom(null)}
                onApply={(to) => {
                  onChange(copyDay(value, day, to, cloneIntervals));
                  setCopyFrom(null);
                }}
              />
            ) : null}
          </View>
        );
      })}
      <Text variant="caption" tone="muted">
        {e.timeHint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  presets: {
    gap: spacing.xs,
  },
  presetRow: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
  day: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dayHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dayName: {
    width: 36,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 32,
    paddingLeft: 4,
    paddingRight: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  toggleOn: {
    backgroundColor: colors.successSoft,
    borderColor: colors.success,
  },
  toggleOff: {
    backgroundColor: colors.bgSubtle,
    borderColor: colors.border,
  },
  knob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.borderStrong,
  },
  knobOn: {
    backgroundColor: colors.success,
  },
  spacer: {
    flex: 1,
  },
  copy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
});
