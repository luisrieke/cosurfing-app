import { StyleSheet, View } from 'react-native';

import { Button, Icon, Notice, Text } from '@/components/ui';
import {
  DAY_KEYS,
  type DayKey,
  dayOfWeekMinute,
  type HoursFlag,
  type HoursSource,
  type HoursStatus,
  type LaptopHours,
  type LaptopSource,
  laptopDay,
  localClock,
  localWeekMinute,
  openStatus,
  type WeeklyHours,
  workStatus,
} from '@/lib/hours';
import { formatDayIntervals, formatLaptopDay, openStatusText, workStatusText } from '@/lib/hoursText';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';

import { toneColor } from './HoursStatusLine';

const h = strings.hours;

function StatusRow({ label, detail, color, clock }: { label: string; detail: string | null; color: string; clock: string | null }) {
  return (
    <View style={styles.status}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text variant="bodyStrong" style={{ color }}>
        {label}
      </Text>
      {detail ? <Text tone="muted">{`· ${detail}`}</Text> : null}
      <View style={styles.spacer} />
      {clock ? (
        <Text variant="caption" tone="muted">
          {h.localTime(clock)}
        </Text>
      ) : null}
    </View>
  );
}

function WeekTable({ today, cell, tone }: { today: DayKey | null; cell: (d: DayKey) => string; tone?: (d: DayKey) => string | undefined }) {
  return (
    <View style={styles.table}>
      {DAY_KEYS.map((d) => {
        const isToday = d === today;
        return (
          <View key={d} style={[styles.tableRow, isToday && styles.today]}>
            <Text variant={isToday ? 'smallStrong' : 'small'} style={styles.tableDay}>
              {h.dayLong[d]}
              {isToday ? (
                <Text variant="caption" tone="muted">
                  {`  ${h.today}`}
                </Text>
              ) : null}
            </Text>
            <Text variant={isToday ? 'smallStrong' : 'small'} style={[styles.tableValue, { color: tone?.(d) ?? colors.text }]}>
              {cell(d)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function Note({ icon, text }: { icon: 'info' | 'calendar' | 'check-circle' | 'users'; text: string }) {
  return (
    <View style={styles.note}>
      <Icon name={icon} size={13} color={colors.textMuted} />
      <Text variant="caption" tone="muted" style={styles.noteText}>
        {text}
      </Text>
    </View>
  );
}

/** Opening hours on the place page: open now, the week with today marked, and where it comes from. */
export function OpeningHoursCard({
  hours,
  status,
  source,
  flags,
  text,
  timezone,
  now,
  onAdd,
}: {
  hours: WeeklyHours | null;
  status: HoursStatus | null;
  source: HoursSource | null;
  flags: HoursFlag[];
  /** Original listing text, or member text that could not be read. */
  text: string | null;
  timezone: string | null;
  now: Date;
  onAdd?: () => void;
}) {
  const minute = localWeekMinute(now, timezone);
  const today = minute === null ? null : dayOfWeekMinute(minute);
  const clock = localClock(now, timezone);
  const structured = Boolean(hours);
  const showText = Boolean(text) && (!structured || flags.length > 0);

  if (!hours && !text) {
    return (
      <View style={styles.card}>
        <Text tone="muted">{h.unknown}</Text>
        {onAdd ? <Button title={h.addHours} icon="clock" size="sm" variant="secondary" onPress={onAdd} style={styles.add} /> : null}
      </View>
    );
  }

  const st = hours ? openStatusText(openStatus(hours, minute), minute) : null;

  return (
    <View style={styles.card}>
      {st && minute !== null ? <StatusRow label={st.label} detail={st.detail} color={toneColor[st.tone]} clock={clock} /> : null}
      {hours && minute === null ? <Note icon="info" text={h.noTimezone} /> : null}
      {hours ? <WeekTable today={today} cell={(d) => formatDayIntervals(hours[d])} tone={(d) => (hours[d].length ? undefined : colors.textMuted)} /> : null}
      {flags.includes('holidays') ? <Note icon="calendar" text={h.flagHolidays} /> : null}
      {flags.includes('date_exceptions') ? <Note icon="calendar" text={h.flagDateExceptions} /> : null}
      {showText ? (
        <View style={styles.listing}>
          <Text variant="caption" tone="muted">
            {structured ? h.originalText : h.asListed}
          </Text>
          <Text variant="small" selectable>
            {text}
          </Text>
        </View>
      ) : null}
      {!structured && status === 'needs_review' ? <Notice tone="info" body={h.needsReview} /> : null}
      {!structured && status === 'text_only' ? <Note icon="info" text={h.textOnly} /> : null}
      {structured && source ? <Note icon={source === 'team' ? 'check-circle' : source === 'community' ? 'users' : 'info'} text={h.source[source]} /> : null}
    </View>
  );
}

/**
 * Laptop hours on the place page. Separate from the opening hours: open does not mean laptops are
 * welcome. Unknown stays unknown; a simple yes/no answer is shown when that is all we have.
 */
export function LaptopHoursCard({
  laptop,
  source,
  hours,
  category,
  timezone,
  now,
  answer,
  answerBanned,
  onAdd,
}: {
  laptop: LaptopHours | null;
  source: LaptopSource | null;
  hours: WeeklyHours | null;
  category: string;
  timezone: string | null;
  now: Date;
  /** Yes/no answer from members, the venue website or the listing, when there is no schedule. */
  answer: string | null;
  answerBanned: boolean;
  onAdd?: () => void;
}) {
  const minute = localWeekMinute(now, timezone);
  const today = minute === null ? null : dayOfWeekMinute(minute);
  const byDesign = !laptop && category === 'coworking';
  const work = hours && (laptop || byDesign) ? workStatusText(workStatus(hours, laptop, category, minute), minute) : null;

  return (
    <View style={styles.card}>
      <Text variant="smallStrong">{h.laptopTitle}</Text>
      {work && minute !== null ? <StatusRow label={work.label} detail={null} color={toneColor[work.tone]} clock={null} /> : null}
      {laptop ? (
        <>
          <WeekTable
            today={today}
            cell={(d) => {
              const day = laptopDay(laptop, d);
              if (day.mode === 'all' && hours && hours[d].length === 0) return h.laptopDay.allClosed;
              if (day.mode === 'all' && hours) return formatDayIntervals(hours[d]);
              return formatLaptopDay(laptop, d);
            }}
            tone={(d) => {
              const m = laptopDay(laptop, d).mode;
              return m === 'none' ? colors.danger : m === 'unknown' ? colors.textMuted : undefined;
            }}
          />
          {source ? <Note icon={source === 'community' ? 'users' : 'check-circle'} text={h.laptopSource[source]} /> : null}
        </>
      ) : byDesign ? (
        <Note icon="check-circle" text={h.laptopByDesign} />
      ) : (
        <>
          {answer ? (
            <Text style={{ color: answerBanned ? colors.danger : colors.text }}>
              {`${strings.place.laptopRules}: ${answer}`}
            </Text>
          ) : null}
          <Text variant="small" tone="muted">
            {h.laptopUnknown}
          </Text>
          {onAdd ? <Button title={h.laptopAdd} icon="monitor" size="sm" variant="secondary" onPress={onAdd} style={styles.add} /> : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  spacer: {
    flex: 1,
  },
  table: {
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  today: {
    backgroundColor: colors.bgSubtle,
  },
  tableDay: {
    width: 130,
  },
  tableValue: {
    flex: 1,
    fontVariant: ['tabular-nums'],
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  noteText: {
    flex: 1,
  },
  listing: {
    gap: 2,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.bgSubtle,
  },
  add: {
    alignSelf: 'flex-start',
  },
});
