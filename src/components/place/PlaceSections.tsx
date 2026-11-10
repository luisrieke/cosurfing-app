import { Image } from 'expo-image';
import { useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ReportButton } from '@/components/ReportButton';
import { Stars } from '@/components/Reviews';
import { TransparencyLink } from '@/components/TransparencyLink';
import { Badge, Icon, type IconName, Text } from '@/components/ui';
import { communityFact, formatFactValue, type FactSummary } from '@/lib/facts';
import { dayPassLabel, formatDate, formatMbps, hostFromUrl, liveWebsite } from '@/lib/format';
import { menuUrl } from '@/lib/storage';
import { strings } from '@/lib/strings';
import { colors, radius, scoreColor, spacing } from '@/lib/theme';
import type {
  FactKey,
  MenuKind,
  Place,
  PlaceMenu,
  PlaceOffer,
  PlaceRatingStats,
  PlaceReview,
  PlaceWifiNote,
  SpeedTest,
  WebFacts,
} from '@/lib/types';

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
      <TransparencyLink />
    </View>
  );
}

function scorePartWhy(key: (typeof SCORE_PARTS)[number]['key'], place: Place): string {
  const why = strings.place.scoreInfoWhy;
  switch (key) {
    case 'reviews':
      return place.review_count === 0 || place.rating_avg === null
        ? why.reviewsNone
        : why.reviews(Number(place.rating_avg).toFixed(1), place.review_count);
    case 'wifi': {
      const base =
        place.download_median_mbps !== null
          ? why.wifiMeasured(Number(place.download_median_mbps), place.speed_test_count)
          : why.wifiUnmeasured;
      return place.wifi_community === 'unreliable' ? `${base} ${why.wifiUnreliable}` : base;
    }
    case 'facts':
      return why.facts;
    case 'completeness': {
      const f = why.completenessFields;
      const hasPrice = place.day_pass_price_cents !== null || place.price_level !== null || Boolean(place.web_facts?.day_pass);
      const missing: string[] = [
        place.opening_hours ? null : f.hours,
        place.website ? null : f.website,
        place.address ? null : f.address,
        hasPrice ? null : f.price,
      ].filter((m) => m !== null);
      return why.completeness(missing);
    }
    case 'category':
      return why.category;
  }
}

/** Popup that explains how the work score of one place adds up. */
export function ScoreInfoModal({ place, visible, onClose }: { place: Place; visible: boolean; onClose: () => void }) {
  const b = place.score_breakdown;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.infoBackdrop} onPress={onClose} accessibilityLabel={strings.common.close}>
        <Pressable style={styles.infoSheet} onPress={() => undefined}>
          <View style={styles.infoHead}>
            <Text variant="heading" style={styles.infoTitle}>
              {strings.place.scoreInfoTitle}
            </Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={strings.common.close}>
              <Icon name="x" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView style={styles.infoScroll} contentContainerStyle={styles.infoBody}>
            <Text variant="small" tone="muted">
              {strings.place.scoreInfoIntro}
            </Text>
            {SCORE_PARTS.map(({ key, weight }) => {
              const v = Number(b?.[key] ?? 0);
              return (
                <View key={key} style={styles.infoPart}>
                  <View style={styles.infoPartHead}>
                    <Text variant="smallStrong" style={styles.infoPartLabel}>
                      {strings.place.scoreParts[key]}
                    </Text>
                    <Text variant="small" tone="muted">
                      {`${v.toFixed(1)} × ${weight}%`}
                    </Text>
                    <Text variant="smallStrong" style={styles.infoPoints}>
                      {strings.place.scoreInfoPoints((v * weight) / 100)}
                    </Text>
                  </View>
                  <View style={styles.infoBar}>
                    <View style={[styles.barFill, { width: `${Math.max(2, v * 10)}%`, backgroundColor: scoreColor(v) }]} />
                  </View>
                  <Text variant="caption" tone="muted">
                    {scorePartWhy(key, place)}
                  </Text>
                </View>
              );
            })}
            <View style={styles.infoTotal}>
              <Text variant="bodyStrong" style={styles.infoPartLabel}>
                {strings.place.scoreInfoTotal}
              </Text>
              <Text variant="bodyStrong">{`${Number(place.work_score).toFixed(2)} ${strings.place.scoreOutOf}`}</Text>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
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
export function hardFacts(place: Place, facts: FactSummary[] = [], hasHoursPhotos = false): FactLine[] {
  const s = strings.place;
  const wf = place.web_facts ?? {};
  const lines: FactLine[] = [];
  const community = (key: FactKey) => communityFact(facts, key);
  const coliving = place.category === 'coliving';

  if (coliving) {
    const [guest, guestTone] = pick(place.non_guest_work, { yes: [s.nonGuest_yes, 'okay'], no: [s.nonGuest_no, 'bad'] });
    lines.push({
      icon: 'key',
      label: s.nonGuestWork,
      value: guest ? (place.non_guest_note ? `${guest} · ${place.non_guest_note}` : guest) : null,
      tone: guestTone,
      empty: s.nonGuest_no,
    });
    const [season, seasonTone] = pick(place.season, { year_round: [s.season_year_round, 'neutral'], seasonal: [s.season_seasonal, 'okay'] });
    lines.push({
      icon: 'calendar',
      label: s.season,
      value: season ? (place.season_note ? `${season} · ${place.season_note}` : season) : null,
      tone: seasonTone,
    });
    if (place.min_stay) lines.push({ icon: 'moon', label: s.minStay, value: place.min_stay, tone: 'neutral' });
  }

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
  if (place.category === 'coworking' || (dayPass && !coliving)) {
    lines.push({ icon: 'tag', label: s.dayPass, value: dayPass, tone: dayPass ? 'neutral' : 'unknown' });
  }
  const price =
    community('price_range')?.display ??
    (place.price_level ? s.priceLevelLabel(place.price_level) : (wf.price_range?.value ?? null));
  if ((place.category !== 'coworking' && !coliving) || price) {
    lines.push({ icon: 'dollar-sign', label: s.priceLevel, value: price, tone: price ? 'neutral' : 'unknown' });
  }

  const hours = community('opening_hours')?.display ?? place.opening_hours ?? wf.opening_hours?.value ?? null;
  if (!coliving || hours || hasHoursPhotos) {
    lines.push({
      icon: 'clock',
      label: s.openingHours,
      value: hours,
      tone: hours ? 'neutral' : 'unknown',
      hint: hours && hasHoursPhotos ? s.hoursSeePhoto : undefined,
      empty: hasHoursPhotos ? s.hoursSeePhoto : undefined,
    });
  }

  const laptopsFact = community('laptops');
  const laptops =
    laptopsFact?.display ??
    place.laptop_rules ??
    (wf.laptops ? (wf.laptops.value === 'welcome' ? s.laptopsWelcome : s.laptopsNotAllowed) : null);
  const laptopsBanned = laptopsFact ? laptopsFact.value === 'not_allowed' : wf.laptops?.value === 'not_allowed' && !place.laptop_rules;
  if (!coliving) {
    lines.push({
      icon: 'monitor',
      label: s.laptopRules,
      value: laptops,
      tone: laptops ? (laptopsBanned ? 'bad' : 'neutral') : 'unknown',
    });
    const [outdoor, outdoorTone] = pick(place.outdoor_seating, { yes: [strings.common.yes, 'neutral'], no: [strings.common.no, 'neutral'] });
    lines.push({ icon: 'sun', label: s.outdoorSeating, value: outdoor, tone: outdoorTone });
  }

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

/** Speed, availability and fee; shown in the Wi-Fi section. */
export function wifiFacts(place: Place, facts: FactSummary[] = []): FactLine[] {
  const s = strings.place;
  const wf = place.web_facts ?? {};
  const lines: FactLine[] = [];

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

  const wifiFact = communityFact(facts, 'wifi');
  if (wifiFact) {
    const [value, tone]: [string, FactLine['tone']] =
      wifiFact.value === 'unreliable' ? [s.wifi_unreliable, 'okay'] : wifiFact.value ? [s.wifi_yes, 'good'] : [s.wifi_no, 'bad'];
    lines.push({ icon: 'wifi', label: s.wifi, value, tone });
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
  return lines;
}

/** Median of the mobile data tests on site; shown in the mobile data part of the Wi-Fi section. */
export function mobileFacts(place: Place): FactLine[] {
  const label = strings.mobile.speed;
  if (place.mobile_download_median_mbps === null) {
    return [{ icon: 'smartphone', label, value: null, tone: 'unknown', empty: strings.place.wifiNotMeasured }];
  }
  const down = Number(place.mobile_download_median_mbps);
  const up = place.mobile_upload_median_mbps === null ? null : Number(place.mobile_upload_median_mbps);
  return [
    {
      icon: 'smartphone',
      label,
      value: strings.place.wifiMeasured(down, up, place.mobile_speed_test_count),
      tone: down >= 25 ? 'good' : down >= 10 ? 'okay' : 'bad',
    },
  ];
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

export function VenueFactsList({ facts, web, pendingNote }: { facts: FactSummary[]; web: WebFacts; pendingNote?: string | null }) {
  const [open, setOpen] = useState<FactKey | null>(null);
  return (
    <View style={styles.box}>
      <Text variant="caption" tone="muted">
        {strings.place.venueFactsHint}
      </Text>
      {pendingNote ? (
        <Text variant="caption" tone="muted">
          {pendingNote}
        </Text>
      ) : null}
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
// Offers
// ---------------------------------------------------------------------------

async function copyText(text: string): Promise<boolean> {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  if (Platform.OS !== 'web' || !nav?.clipboard) return false;
  try {
    await nav.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function OfferCard({ offer, onDelete }: { offer: PlaceOffer; onDelete?: () => void }) {
  const c = strings.costs;
  const [copied, setCopied] = useState(false);
  const referral = offer.kind === 'referral';
  return (
    <View style={styles.offer}>
      <View style={styles.offerHead}>
        <Badge
          label={referral ? c.kindReferral : c.kindDeal}
          tone={referral ? 'plus' : 'success'}
          icon={referral ? 'users' : 'tag'}
        />
        {offer.expires_on ? (
          <Text variant="caption" tone="muted">
            {c.validUntil(formatDate(offer.expires_on))}
          </Text>
        ) : null}
        <View style={styles.flex} />
        {onDelete ? (
          <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel={c.deleteOffer} hitSlop={8}>
            <Icon name="trash-2" size={15} color={colors.textMuted} />
          </Pressable>
        ) : null}
        {!offer.is_own ? <ReportButton type="offer" id={offer.id} /> : null}
      </View>
      <Text variant="bodyStrong">{offer.title}</Text>
      {referral ? (
        <Text variant="caption" tone="muted">
          {c.referralDisclosure(offer.author_name, offer.is_own)}
        </Text>
      ) : null}
      {offer.details ? (
        <Text variant="small" tone="muted">
          {offer.details}
        </Text>
      ) : null}
      {offer.code ? (
        <Pressable
          onPress={async () => {
            if (await copyText(offer.code!)) {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }
          }}
          accessibilityRole="button"
          accessibilityLabel={c.copyCode}
          style={styles.code}
        >
          <Text variant="caption" tone="muted">
            {c.code}
          </Text>
          <Text variant="smallStrong" selectable style={styles.codeText}>
            {offer.code}
          </Text>
          {Platform.OS === 'web' ? (
            <Text variant="caption" tone={copied ? 'success' : 'accent'}>
              {copied ? c.codeCopied : c.copyCode}
            </Text>
          ) : null}
        </Pressable>
      ) : null}
      {offer.url ? (
        <Pressable onPress={() => void Linking.openURL(offer.url!)} accessibilityRole="link" style={styles.offerLink}>
          <Icon name="external-link" size={14} color={colors.accent} />
          <Text variant="smallStrong" tone="accent">
            {`${c.openLink} · ${hostFromUrl(offer.url)}`}
          </Text>
        </Pressable>
      ) : null}
      {offer.author_name ? (
        <Text variant="caption" tone="faint">
          {`${c.sharedBy(offer.author_name)}${offer.is_own ? ' (you)' : ''} · ${formatDate(offer.created_at)}`}
        </Text>
      ) : null}
      {offer.is_own && offer.status === 'pending' ? (
        <Text variant="caption" tone="muted">
          {strings.account.underReview}
        </Text>
      ) : null}
    </View>
  );
}

export function OfferList({
  offers,
  onDelete,
  canDelete,
}: {
  offers: PlaceOffer[];
  onDelete?: (offer: PlaceOffer) => void;
  canDelete?: (offer: PlaceOffer) => boolean;
}) {
  return (
    <View style={styles.box}>
      <Text variant="caption" tone="muted">
        {strings.costs.offersHint}
      </Text>
      {offers.map((o) => (
        <OfferCard key={o.id} offer={o} onDelete={onDelete && canDelete?.(o) ? () => onDelete(o) : undefined} />
      ))}
    </View>
  );
}

const GALLERY_LABELS: Record<MenuKind, { hint: string; open: string; delete: string }> = {
  menu: { hint: strings.costs.menuHint, open: strings.costs.openMenu, delete: strings.costs.deleteMenu },
  hours: { hint: strings.place.hoursPhotosHint, open: strings.place.openHoursPhoto, delete: strings.place.deleteHoursPhoto },
};

export function MenuGallery({
  menus,
  kind = 'menu',
  showHint = true,
  onDelete,
  canDelete,
}: {
  menus: PlaceMenu[];
  kind?: MenuKind;
  showHint?: boolean;
  onDelete?: (menu: PlaceMenu) => void;
  canDelete?: (menu: PlaceMenu) => boolean;
}) {
  const c = strings.costs;
  const labels = GALLERY_LABELS[kind];
  const [open, setOpen] = useState<PlaceMenu | null>(null);
  return (
    <View style={styles.box}>
      {showHint ? (
        <Text variant="caption" tone="muted">
          {labels.hint}
        </Text>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.menuRow}>
        {menus.map((m) => (
          <View key={m.id} style={styles.menuItem}>
            <Pressable onPress={() => setOpen(m)} accessibilityRole="imagebutton" accessibilityLabel={labels.open}>
              <Image source={{ uri: menuUrl(m.path) }} style={styles.menuThumb} contentFit="cover" transition={150} />
            </Pressable>
            <View style={styles.menuMeta}>
              <View style={styles.flex}>
                <Text variant="caption" tone="muted">
                  {formatDate(m.created_at)}
                </Text>
                {m.author_name ? (
                  <Text variant="caption" tone="faint" numberOfLines={1}>
                    {`${c.menuBy(m.author_name)}${m.is_own ? ' (you)' : ''}`}
                  </Text>
                ) : null}
                {m.is_own && m.status === 'pending' ? (
                  <Text variant="caption" tone="muted">
                    {strings.account.underReview}
                  </Text>
                ) : null}
              </View>
              {onDelete && canDelete?.(m) ? (
                <Pressable onPress={() => onDelete(m)} accessibilityRole="button" accessibilityLabel={labels.delete} hitSlop={8}>
                  <Icon name="trash-2" size={14} color={colors.textMuted} />
                </Pressable>
              ) : null}
              {!m.is_own ? <ReportButton type="menu" id={m.id} /> : null}
            </View>
          </View>
        ))}
      </ScrollView>
      <ImageViewer uri={open ? menuUrl(open.path) : null} onClose={() => setOpen(null)} />
    </View>
  );
}

function ImageViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  return (
    <Modal visible={uri !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewer}>
        {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" /> : null}
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={strings.costs.closeMenu}
          hitSlop={12}
          style={styles.viewerClose}
        >
          <Icon name="x" size={22} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Wi-Fi notes (members only)
// ---------------------------------------------------------------------------

export function WifiNoteList({
  notes,
  showHint = true,
  onDelete,
  canDelete,
}: {
  notes: PlaceWifiNote[];
  showHint?: boolean;
  onDelete?: (note: PlaceWifiNote) => void;
  canDelete?: (note: PlaceWifiNote) => boolean;
}) {
  const w = strings.wifi;
  const [open, setOpen] = useState<string | null>(null);
  return (
    <View style={styles.box}>
      {showHint ? (
        <Text variant="caption" tone="muted">
          {w.notesHint}
        </Text>
      ) : null}
      {notes.map((n) => (
        <View key={n.id} style={styles.offer}>
          <View style={styles.offerHead}>
            <Icon name="user" size={13} color={colors.textMuted} />
            <Text variant="caption" tone="muted" style={styles.flex} numberOfLines={1}>
              {`${n.author_name ?? strings.place.factAuthorHidden}${n.is_own ? ' (you)' : ''} · ${formatDate(n.created_at)}`}
            </Text>
            {onDelete && canDelete?.(n) ? (
              <Pressable onPress={() => onDelete(n)} accessibilityRole="button" accessibilityLabel={w.deleteNote} hitSlop={8}>
                <Icon name="trash-2" size={15} color={colors.textMuted} />
              </Pressable>
            ) : null}
            {!n.is_own ? <ReportButton type="wifi_note" id={n.id} /> : null}
          </View>
          {n.body ? (
            <Text variant="small" selectable>
              {n.body}
            </Text>
          ) : null}
          {n.photo_url ? (
            <Pressable onPress={() => setOpen(n.photo_url)} accessibilityRole="imagebutton" accessibilityLabel={w.openPhoto}>
              <Image source={{ uri: n.photo_url }} style={styles.wifiThumb} contentFit="cover" transition={150} />
            </Pressable>
          ) : null}
        </View>
      ))}
      <ImageViewer uri={open} onClose={() => setOpen(null)} />
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
        <View key={t.id} style={[styles.testRow, i === tests.length - 1 && styles.factRowLast]}>
          <View style={styles.testMain}>
            <View style={styles.factLabel}>
              <Icon name={t.on_site ? 'map-pin' : 'help-circle'} size={14} color={t.on_site ? colors.success : colors.textFaint} />
              <View>
                <Text variant="small">
                  {t.author_name ?? 'Cosurfer'}
                  {t.is_own ? ' (you)' : ''}
                </Text>
                <Text variant="caption" tone="faint">
                  {formatDate(t.created_at)} · {t.on_site ? strings.place.onSite : strings.place.notOnSite}
                  {t.carrier ? ` · ${strings.mobile.carrier(t.carrier)}` : ''}
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
          {t.note ? (
            <View style={styles.testNote}>
              <Icon name="message-square" size={13} color={colors.textMuted} />
              <Text variant="small" tone="muted" style={styles.flex} selectable>
                {t.note}
              </Text>
            </View>
          ) : null}
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
  infoBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  infoSheet: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  infoHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  infoTitle: {
    flex: 1,
  },
  infoScroll: {
    flexGrow: 0,
  },
  infoBody: {
    gap: spacing.lg,
  },
  infoPart: {
    gap: 6,
  },
  infoPartHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  infoPartLabel: {
    flex: 1,
  },
  infoBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.bgMuted,
    overflow: 'hidden',
  },
  infoPoints: {
    minWidth: 48,
    textAlign: 'right',
  },
  infoTotal: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
  testRow: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  testMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  testNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingLeft: 22,
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
  flex: {
    flex: 1,
  },
  offer: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  offerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  code: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgSubtle,
  },
  codeText: {
    letterSpacing: 0.5,
  },
  offerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  menuRow: {
    gap: spacing.md,
  },
  menuItem: {
    width: 132,
    gap: spacing.xs,
  },
  menuThumb: {
    width: 132,
    height: 176,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgMuted,
  },
  wifiThumb: {
    width: 160,
    height: 160,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgMuted,
  },
  menuMeta: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  viewer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  viewerClose: {
    position: 'absolute',
    top: spacing.xl,
    right: spacing.lg,
    padding: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.5)',
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
