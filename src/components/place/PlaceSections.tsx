import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Stars } from '@/components/Reviews';
import { Icon, type IconName, Text } from '@/components/ui';
import { communityFact, formatFactValue, type FactSummary } from '@/lib/facts';
import { dayPassLabel, formatDate, formatMbps, hostFromUrl, liveWebsite } from '@/lib/format';
import { strings } from '@/lib/strings';
import { colors, radius, scoreColor, spacing } from '@/lib/theme';
import type { FactKey, Place, PlaceRatingStats, PlaceReview, SpeedTest, WebFacts } from '@/lib/types';

type Tone = 'good' | 'okay' | 'bad' | 'neutral' | 'unknown';

const toneColor: Record<Tone, string> = {
  good: colors.success,
  okay: colors.warning,
  bad: colors.danger,
  neutral: colors.text,
  unknown: colors.textFaint,
};

// ---------------------------------------------------------------------------
// Score breakdown
// ---------------------------------------------------------------------------

const SCORE_PARTS: { key: 'reviews' | 'wifi' | 'facts' | 'completeness' | 'category'; weight: number }[] = [
  { key: 'reviews', weight: 55 },
  { key: 'wifi', weight: 20 },
  { key: 'facts', weight: 10 },
  { key: 'completeness', weight: 10 },
  { key: 'category', weight: 5 },
];

export function ScoreBreakdownCard({ place }: { place: Place }) {
  const b = place.score_breakdown;
  if (!b) return null;
  return (
    <View style={styles.box}>
      {SCORE_PARTS.map(({ key, weight }) => {
        const v = Number(b[key] ?? 0);
        const empty = key === 'reviews' && place.review_count === 0;
        return (
          <View key={key} style={styles.barRow}>
            <Text variant="small" style={styles.barLabel}>
              {strings.place.scoreParts[key]}
              <Text variant="caption" tone="faint">
                {`  ${weight}%`}
              </Text>
            </Text>
            <View style={styles.barTrack}>
              {empty ? null : (
                <View style={[styles.barFill, { width: `${Math.max(2, v * 10)}%`, backgroundColor: scoreColor(v) }]} />
              )}
            </View>
            <Text variant="smallStrong" style={styles.barValue} tone={empty ? 'faint' : 'default'}>
              {empty ? '–' : v.toFixed(1)}
            </Text>
          </View>
        );
      })}
      <Text variant="caption" tone="muted">
        {strings.place.scoreExplainer}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Hard facts
// ---------------------------------------------------------------------------

interface FactLine {
  icon: IconName;
  label: string;
  value: string | null;
  tone: Tone;
  hint?: string;
  /** Shown instead of "Unknown" when there is no value. */
  empty?: string;
  onPress?: () => void;
}

function pick<T extends string>(value: T, map: Partial<Record<T, [string, Tone]>>): [string | null, Tone] {
  return map[value] ?? [null, 'unknown'];
}

/** Member answers (see VenueFactsList) take precedence over imported data. */
export function hardFacts(place: Place, facts: FactSummary[] = []): FactLine[] {
  const s = strings.place;
  const wf = place.web_facts ?? {};
  const lines: FactLine[] = [];
  const community = (key: FactKey) => communityFact(facts, key);

  if (place.download_median_mbps !== null) {
    const down = Number(place.download_median_mbps);
    lines.push({
      icon: 'activity',
      label: s.wifiSpeed,
      value: s.wifiMeasured(down, place.upload_median_mbps === null ? null : Number(place.upload_median_mbps), place.speed_test_count),
      tone: down >= 25 ? 'good' : down >= 10 ? 'okay' : 'bad',
    });
  } else {
    lines.push({
      icon: 'activity',
      label: s.wifiSpeed,
      value: null,
      tone: 'unknown',
      empty: s.wifiNotMeasured,
      hint: wf.advertised_mbps ? s.advertisedMbps(wf.advertised_mbps.value) : undefined,
    });
  }

  const wifiFact = community('wifi');
  if (wifiFact) {
    lines.push({ icon: 'wifi', label: s.wifi, value: wifiFact.value ? s.wifi_yes : s.wifi_no, tone: wifiFact.value ? 'good' : 'bad' });
  } else {
    const [wifi, wifiTone] = pick(place.wifi, { yes: [s.wifi_yes, 'good'], no: [s.wifi_no, 'bad'] });
    lines.push({ icon: 'wifi', label: s.wifi, value: wifi ?? (wf.wifi_mentioned ? s.wifi_yes : null), tone: wifi ? wifiTone : wf.wifi_mentioned ? 'good' : 'unknown' });
  }

  const [fee, feeTone] = pick(place.internet_fee, {
    no: [s.internetFee_no, 'good'],
    customers: [s.internetFee_customers, 'good'],
    yes: [s.internetFee_yes, 'okay'],
  });
  lines.push({ icon: 'credit-card', label: s.internetFee, value: fee, tone: feeTone });

  const [power, powerTone] = pick(place.power_outlets, {
    plenty: [s.power_plenty, 'good'],
    some: [s.power_some, 'okay'],
    none: [s.power_none, 'bad'],
  });
  lines.push({ icon: 'battery-charging', label: s.power, value: power, tone: powerTone });

  const [calls, callsTone] = pick(place.calls, {
    yes: [s.calls_yes, 'good'],
    limited: [s.calls_limited, 'okay'],
    no: [s.calls_no, 'bad'],
  });
  lines.push({ icon: 'video', label: s.callsLabel, value: calls, tone: callsTone });

  const [focus, focusTone] = pick(place.focus, {
    great: [s.focus_great, 'good'],
    okay: [s.focus_okay, 'okay'],
    poor: [s.focus_poor, 'bad'],
  });
  lines.push({ icon: 'headphones', label: s.focus, value: focus, tone: focusTone });

  const dayPass = community('day_pass')?.display ?? dayPassLabel(place.day_pass_price_cents, wf.day_pass);
  if (place.category === 'coworking' || dayPass) {
    lines.push({ icon: 'tag', label: s.dayPass, value: dayPass, tone: dayPass ? 'neutral' : 'unknown' });
  }
  const price =
    community('price_range')?.display ??
    (place.price_level ? s.priceLevelLabel(place.price_level) : (wf.price_range?.value ?? null));
  if (place.category !== 'coworking' || price) {
    lines.push({ icon: 'dollar-sign', label: s.priceLevel, value: price, tone: price ? 'neutral' : 'unknown' });
  }

  const hours = community('opening_hours')?.display ?? place.opening_hours ?? wf.opening_hours?.value ?? null;
  lines.push({ icon: 'clock', label: s.openingHours, value: hours, tone: hours ? 'neutral' : 'unknown' });

  const laptopsFact = community('laptops');
  const laptops =
    laptopsFact?.display ??
    place.laptop_rules ??
    (wf.laptops ? (wf.laptops.value === 'welcome' ? s.laptopsWelcome : s.laptopsNotAllowed) : null);
  const laptopsBanned = laptopsFact ? laptopsFact.value === 'not_allowed' : wf.laptops?.value === 'not_allowed' && !place.laptop_rules;
  lines.push({
    icon: 'monitor',
    label: s.laptopRules,
    value: laptops,
    tone: laptops ? (laptopsBanned ? 'bad' : 'neutral') : 'unknown',
  });

  const [outdoor, outdoorTone] = pick(place.outdoor_seating, { yes: [strings.common.yes, 'neutral'], no: [strings.common.no, 'neutral'] });
  lines.push({ icon: 'sun', label: s.outdoorSeating, value: outdoor, tone: outdoorTone });

  const [wheel, wheelTone] = pick(place.wheelchair, {
    yes: [strings.common.yes, 'good'],
    limited: [s.wheelchair_limited, 'okay'],
    no: [strings.common.no, 'bad'],
  });
  lines.push({ icon: 'user', label: s.wheelchair, value: wheel, tone: wheelTone });

  if (place.phone) {
    const tel = place.phone.replace(/[^\d+]/g, '');
    lines.push({ icon: 'phone', label: s.phone, value: place.phone, tone: 'neutral', onPress: () => void Linking.openURL(`tel:${tel}`) });
  }
  const website = liveWebsite(place);
  if (website) {
    lines.push({ icon: 'globe', label: s.website, value: hostFromUrl(website), tone: 'neutral', onPress: () => void Linking.openURL(website) });
  }
  return lines;
}

export function FactTable({ lines: all, onHelp }: { lines: FactLine[]; onHelp?: () => void }) {
  const lines = onHelp ? all.filter((l) => l.value !== null || l.hint || l.empty) : all;
  const missing = onHelp ? all.filter((l) => l.value === null && !l.hint && !l.empty) : [];
  return (
    <View style={styles.table}>
      {lines.map((l, i) => {
        const unknown = l.value === null;
        const content = (
          <>
            <View style={styles.factLabel}>
              <Icon name={l.icon} size={15} color={colors.textMuted} />
              <Text variant="small" tone="muted">
                {l.label}
              </Text>
            </View>
            <View style={styles.factValue}>
              <Text
                variant="smallStrong"
                align="right"
                style={{ color: unknown ? toneColor.unknown : l.onPress ? colors.accent : toneColor[l.tone] }}
              >
                {unknown ? (l.empty ?? strings.common.unknown) : l.value}
              </Text>
              {l.hint ? (
                <Text variant="caption" tone="faint" align="right">
                  {l.hint}
                </Text>
              ) : null}
            </View>
          </>
        );
        const rowStyle = [styles.factRow, i === lines.length - 1 && missing.length === 0 && styles.factRowLast];
        return l.onPress ? (
          <Pressable key={l.label} onPress={l.onPress} accessibilityRole="link" style={rowStyle}>
            {content}
          </Pressable>
        ) : (
          <View key={l.label} style={rowStyle}>
            {content}
          </View>
        );
      })}
      {missing.length > 0 ? (
        <Pressable onPress={onHelp} accessibilityRole="button" style={[styles.factRow, styles.factRowLast, styles.missing]}>
          <View style={styles.missingText}>
            <Text variant="small" tone="muted">
              {strings.place.notKnownYet(missing.map((l) => l.label).join(' · '))}
            </Text>
            <Text variant="smallStrong" tone="accent">
              {strings.place.helpFillIn}
            </Text>
          </View>
          <Icon name="chevron-right" size={16} color={colors.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Venue facts: website + member entries, combined
// ---------------------------------------------------------------------------

function factCaption(f: FactSummary): string {
  const s = strings.place;
  const total = f.sources.length;
  if (total === 1) return f.sources[0]!.from === 'web' ? s.factFromWebsite : s.factOneEntry;
  return f.method === 'average' ? s.factAverage(f.agreeing) : s.factAgree(f.agreeing, total);
}

export function VenueFactsList({ facts, web }: { facts: FactSummary[]; web: WebFacts }) {
  const [open, setOpen] = useState<FactKey | null>(null);
  return (
    <View style={styles.box}>
      <Text variant="caption" tone="muted">
        {strings.place.venueFactsHint}
      </Text>
      <View style={styles.table}>
        {facts.map((f, i) => {
          const expanded = open === f.key;
          return (
            <View key={f.key} style={[styles.venueFact, i === facts.length - 1 && styles.factRowLast]}>
              <Pressable
                onPress={() => setOpen(expanded ? null : f.key)}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                style={styles.venueFactHead}
              >
                <Text variant="small" tone="muted" style={styles.venueFactLabel}>
                  {strings.place.factLabels[f.key]}
                </Text>
                <View style={styles.factValue}>
                  <Text variant="smallStrong" align="right">
                    {f.display}
                  </Text>
                  <Text variant="caption" tone="faint" align="right">
                    {factCaption(f)}
                  </Text>
                </View>
                <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textFaint} />
              </Pressable>
              {expanded ? (
                <View style={styles.sources}>
                  {f.sources.map((src) => (
                    <View key={src.id} style={styles.source}>
                      <View style={styles.sourceHead}>
                        <Icon name={src.from === 'web' ? 'globe' : 'user'} size={13} color={colors.textMuted} />
                        <Text variant="small" style={styles.sourceName}>
                          {src.from === 'web'
                            ? strings.place.factSourceWebsite
                            : `${src.author ?? strings.place.factAuthorHidden}${src.isOwn ? ' (you)' : ''}`}
                        </Text>
                        <Text variant="smallStrong">{formatFactValue(f.key, src.value, web)}</Text>
                      </View>
                      {src.at ? (
                        <Text variant="caption" tone="faint" style={styles.sourceMeta}>
                          {formatDate(src.at)}
                        </Text>
                      ) : null}
                      {src.snippet ? (
                        <Text variant="small" tone="muted" style={[styles.sourceMeta, styles.quote]}>
                          “{src.snippet}”
                        </Text>
                      ) : null}
                      {src.url ? (
                        <Pressable onPress={() => void Linking.openURL(src.url!)} accessibilityRole="link" style={styles.sourceMeta}>
                          <Text variant="caption" tone="accent">
                            {strings.place.sourceLabel}: {hostFromUrl(src.url)}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Detail ratings (members only)
// ---------------------------------------------------------------------------

export function DetailRatings({ stats }: { stats: PlaceRatingStats }) {
  const p = strings.place.detailParts;
  const rows = [
    { label: p.wifi, v: stats.wifi_avg },
    { label: p.power, v: stats.power_avg },
    { label: p.quiet, v: stats.quiet_avg },
    { label: p.comfort, v: stats.comfort_avg },
    { label: p.value, v: stats.value_avg },
  ];
  return (
    <View style={styles.box}>
      {rows.map((r) => (
        <View key={r.label} style={styles.barRow}>
          <Text variant="small" style={styles.barLabel}>
            {r.label}
          </Text>
          <View style={styles.barTrack}>
            {r.v !== null ? (
              <View style={[styles.barFill, { width: `${(Number(r.v) / 5) * 100}%`, backgroundColor: scoreColor(Number(r.v) * 2) }]} />
            ) : null}
          </View>
          <Text variant="smallStrong" style={styles.barValue} tone={r.v === null ? 'faint' : 'default'}>
            {r.v === null ? '–' : Number(r.v).toFixed(1)}
          </Text>
        </View>
      ))}
      {stats.calls_answers > 0 ? (
        <Text variant="small" tone="muted">
          {strings.place.callsOkShare(Math.round((stats.calls_ok_count / stats.calls_answers) * 100), stats.calls_answers)}
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Star distribution (public: star ratings are visible to everyone)
// ---------------------------------------------------------------------------

export function RatingDistribution({ reviews, avg }: { reviews: PlaceReview[]; avg: number | null }) {
  const counts = [5, 4, 3, 2, 1].map((star) => ({ star, n: reviews.filter((r) => r.rating === star).length }));
  const max = Math.max(1, ...counts.map((c) => c.n));
  return (
    <View style={styles.distribution}>
      <View style={styles.distributionAvg}>
        <Text variant="display">{avg !== null ? Number(avg).toFixed(1) : '–'}</Text>
        <Stars value={Math.round(Number(avg ?? 0))} size={14} />
        <Text variant="caption" tone="muted">
          {strings.place.reviewCount(reviews.length)}
        </Text>
      </View>
      <View style={styles.distributionBars}>
        {counts.map((c) => (
          <View key={c.star} style={styles.barRow}>
            <Text variant="caption" tone="muted" style={styles.starLabel}>
              {c.star}
            </Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${(c.n / max) * 100}%`, backgroundColor: colors.star }]} />
            </View>
            <Text variant="caption" tone="muted" style={styles.starCount}>
              {c.n}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Speed test history (members only)
// ---------------------------------------------------------------------------

export function SpeedTestHistory({ tests }: { tests: SpeedTest[] }) {
  return (
    <View style={styles.table}>
      {tests.map((t, i) => (
        <View key={t.id} style={[styles.factRow, i === tests.length - 1 && styles.factRowLast]}>
          <View style={styles.factLabel}>
            <Icon name={t.on_site ? 'map-pin' : 'help-circle'} size={14} color={t.on_site ? colors.success : colors.textFaint} />
            <View>
              <Text variant="small">
                {t.author_name ?? 'Cosurfer'}
                {t.is_own ? ' (you)' : ''}
              </Text>
              <Text variant="caption" tone="faint">
                {formatDate(t.created_at)} · {t.on_site ? strings.place.onSite : strings.place.notOnSite}
              </Text>
            </View>
          </View>
          <View style={styles.factValue}>
            <Text variant="smallStrong" align="right">
              ↓ {formatMbps(Number(t.download_mbps))}
            </Text>
            <Text variant="caption" tone="muted" align="right">
              {t.upload_mbps !== null ? `↑ ${formatMbps(Number(t.upload_mbps))}` : ''}
              {t.ping_ms !== null ? ` · ${t.ping_ms} ms` : ''}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: spacing.md,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  barLabel: {
    width: 130,
  },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.bgMuted,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  barValue: {
    width: 32,
    textAlign: 'right',
  },
  table: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  factRowLast: {
    borderBottomWidth: 0,
  },
  factLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 0,
  },
  factValue: {
    flex: 1,
    alignItems: 'flex-end',
  },
  missing: {
    justifyContent: 'flex-start',
  },
  missingText: {
    flex: 1,
    gap: 2,
  },
  venueFact: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  venueFactHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  venueFactLabel: {
    flexShrink: 0,
  },
  sources: {
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.bgSubtle,
  },
  source: {
    gap: 2,
  },
  sourceHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sourceName: {
    flex: 1,
  },
  sourceMeta: {
    marginLeft: 21,
  },
  quote: {
    fontStyle: 'italic',
  },
  distribution: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
  },
  distributionAvg: {
    alignItems: 'center',
    gap: 2,
  },
  distributionBars: {
    flex: 1,
    gap: 4,
  },
  starLabel: {
    width: 10,
  },
  starCount: {
    width: 24,
    textAlign: 'right',
  },
});
