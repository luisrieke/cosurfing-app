import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LaptopHoursEditor, type LaptopWeek, WeeklyHoursEditor } from '@/components/hours';
import { Badge, Button, Chip, Input, Notice, Section, Text } from '@/components/ui';
import { defaultPreset, fullLaptopWeek, type HoursFlag, normalizeWeek, presetHours } from '@/lib/hours';
import { formatLaptopWeekSummary, formatWeekSummary } from '@/lib/hoursText';
import { parseOpeningHoursText, type PlaceInput } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { spacing } from '@/lib/theme';

type HoursFields = Pick<
  PlaceInput,
  'opening_hours' | 'hours' | 'hours_source' | 'hours_status' | 'laptop_hours' | 'laptop_source' | 'category'
>;

/**
 * Opening hours and laptop hours in the admin place editor. The listing text stays the fallback;
 * hours entered here (source "team") win until the admin switches back to the listing.
 */
export function AdminHoursSection({
  value,
  note,
  flags,
  laptopWeek,
  onLaptopWeek,
  onChange,
}: {
  value: HoursFields;
  /** Why the text needs review, from the last save. */
  note: string | null;
  flags: HoursFlag[];
  laptopWeek: LaptopWeek | null;
  onLaptopWeek: (week: LaptopWeek | null) => void;
  onChange: (patch: Partial<PlaceInput>) => void;
}) {
  const h = strings.hours;
  const a = h.admin;
  const e = h.editor;
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const team = value.hours_source === 'team';
  const ownLaptop = value.laptop_source === 'venue' || value.laptop_source === 'team';

  const importText = async () => {
    const text = value.opening_hours?.trim();
    if (!text) return;
    setImporting(true);
    setImportError(null);
    try {
      const res = await parseOpeningHoursText(text);
      if (res.ok) onChange({ hours: normalizeWeek(res.hours), hours_source: 'team' });
      else setImportError(e.importFailed(h.reviewReasons[res.reason] ?? res.reason));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : strings.common.somethingWentWrong);
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Section title={h.title}>
        <View style={styles.badges}>
          {value.hours_source ? <Badge label={h.source[value.hours_source]} tone={team ? 'success' : 'neutral'} /> : null}
          {value.hours_status ? (
            <Badge
              label={a.status[value.hours_status] ?? value.hours_status}
              tone={value.hours_status === 'needs_review' ? 'danger' : value.hours_status === 'text_only' ? 'warning' : 'success'}
            />
          ) : null}
        </View>
        {!team && value.hours_status === 'needs_review' && note ? (
          <Text variant="small" tone="danger">
            {a.reason(h.reviewReasons[note] ?? note)}
          </Text>
        ) : null}
        {flags.includes('holidays') ? (
          <Text variant="caption" tone="muted">
            {h.flagHolidays}
          </Text>
        ) : null}
        {flags.includes('date_exceptions') ? (
          <Text variant="caption" tone="muted">
            {h.flagDateExceptions}
          </Text>
        ) : null}

        <Input
          label={a.listing}
          optional
          value={value.opening_hours ?? ''}
          onChangeText={(v) => onChange({ opening_hours: v })}
          placeholder="Mo-Fr 08:00-18:00; Sa 09:00-14:00"
          hint={a.listingHint}
          multiline
        />

        {team && value.hours ? (
          <View style={styles.block}>
            <Text variant="caption" tone="muted">
              {a.editHint}
            </Text>
            <WeeklyHoursEditor value={value.hours} onChange={(hours) => onChange({ hours })} category={value.category} />
            <Button
              title={e.reset}
              icon="rotate-ccw"
              variant="ghost"
              size="sm"
              onPress={() => onChange({ hours: null, hours_source: null })}
              style={styles.selfStart}
            />
            <Text variant="caption" tone="muted">
              {e.resetHint}
            </Text>
          </View>
        ) : (
          <View style={styles.block}>
            <Text variant="smallStrong">{a.current}</Text>
            <Text variant="small" tone={value.hours ? undefined : 'muted'}>
              {value.hours ? formatWeekSummary(value.hours) : a.none}
            </Text>
            <View style={styles.chips}>
              <Button
                title={a.edit}
                icon="edit-2"
                variant="secondary"
                size="sm"
                onPress={() =>
                  onChange({
                    hours: value.hours ? normalizeWeek(value.hours) : presetHours(defaultPreset(value.category)),
                    hours_source: 'team',
                  })
                }
              />
              {value.opening_hours?.trim() ? (
                <Button title={e.importLabel} icon="refresh-cw" variant="secondary" size="sm" loading={importing} onPress={() => void importText()} />
              ) : null}
              {value.hours_status === 'needs_review' ? (
                <Button title={e.markTextOnly} icon="file-text" variant="ghost" size="sm" onPress={() => onChange({ hours_status: 'text_only' })} />
              ) : null}
            </View>
            {value.hours_status === 'needs_review' ? (
              <Text variant="caption" tone="muted">
                {e.markTextOnlyHint}
              </Text>
            ) : null}
            {importError ? <Notice tone="warning" body={importError} /> : null}
          </View>
        )}
      </Section>

      {value.category !== 'coliving' ? (
        <Section title={h.laptopTitle}>
          <Text variant="small" tone="muted">
            {h.laptopSeparate}
          </Text>
          {value.laptop_source ? <Badge label={h.laptopSource[value.laptop_source]} tone="neutral" /> : null}
          {ownLaptop && laptopWeek ? (
            <View style={styles.block}>
              <Text variant="smallStrong">{e.laptopSourceLabel}</Text>
              <View style={styles.chips}>
                {(['venue', 'team'] as const).map((s) => (
                  <Chip key={s} label={a.laptopSourceShort[s]} selected={value.laptop_source === s} onPress={() => onChange({ laptop_source: s })} />
                ))}
              </View>
              <LaptopHoursEditor value={laptopWeek} onChange={onLaptopWeek} hours={value.hours} />
              <Button
                title={a.laptopRemove}
                icon="rotate-ccw"
                variant="ghost"
                size="sm"
                onPress={() => {
                  onLaptopWeek(null);
                  onChange({ laptop_hours: null, laptop_source: null });
                }}
                style={styles.selfStart}
              />
            </View>
          ) : (
            <View style={styles.block}>
              {value.laptop_hours ? (
                <Text variant="small">{formatLaptopWeekSummary(value.laptop_hours)}</Text>
              ) : (
                <Text variant="small" tone="muted">
                  {h.laptopUnknown}
                </Text>
              )}
              <Button
                title={value.laptop_hours ? a.laptopOverride : a.laptopSet}
                icon="monitor"
                variant="secondary"
                size="sm"
                onPress={() => {
                  onLaptopWeek(fullLaptopWeek(value.laptop_hours));
                  onChange({ laptop_source: 'venue' });
                }}
                style={styles.selfStart}
              />
            </View>
          )}
        </Section>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  block: {
    gap: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  selfStart: {
    alignSelf: 'flex-start',
  },
});
