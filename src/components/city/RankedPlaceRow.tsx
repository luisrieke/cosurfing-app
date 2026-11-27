import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { Stars } from '@/components/Reviews';
import { HoursStatusLine } from '@/components/hours';
import { ScoreBadge } from '@/components/ScoreBadge';
import { CategoryBadge, Icon, type IconName, Text, categoryIcon } from '@/components/ui';
import { dayPassLabel, formatMbps, formatRating } from '@/lib/format';
import { workForbidden } from '@/lib/hours';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import type { RankedPlace } from '@/lib/types';

import { FORBIDDEN_PIN_OPACITY, pinColor } from '@/components/map/pinSvg';
import { useSlowConnection } from '@/hooks/useSlowConnection';

export function RankedPlaceRow({
  place,
  rank,
  signedIn,
  compact,
  onPress,
  timezone = null,
  now,
  showWork = false,
  location = null,
}: {
  place: RankedPlace;
  /** Shown instead of the address, e.g. "Lisbon, Portugal" in rankings across cities. */
  location?: string | null;
  rank: number;
  signedIn: boolean;
  compact: boolean;
  onPress: () => void;
  /** The city's time zone; without it (or `now`) no open/closed line is shown. */
  timezone?: string | null;
  now?: Date;
  showWork?: boolean;
}) {
  const facts: { icon: IconName; label: string; strong?: boolean }[] = [];
  if (place.download_median_mbps !== null) {
    facts.push({ icon: 'wifi', label: formatMbps(place.download_median_mbps), strong: true });
  } else if (place.wifi === 'yes') {
    facts.push({ icon: 'wifi', label: place.internet_fee === 'no' ? strings.ranking.freeWifi : strings.ranking.wifiYes });
  } else if (place.wifi === 'no') {
    facts.push({ icon: 'wifi-off', label: strings.ranking.wifiNo });
  } else {
    facts.push({ icon: 'wifi', label: strings.ranking.wifiUnknown });
  }
  if (place.power_outlets === 'plenty' || place.power_outlets === 'some') facts.push({ icon: 'battery-charging', label: strings.ranking.power });
  if (place.calls === 'yes') facts.push({ icon: 'video', label: strings.ranking.calls });
  const dayPass = dayPassLabel(place.day_pass_price_cents, place.web_day_pass);
  if (dayPass) {
    facts.push({ icon: 'tag', label: dayPass === strings.place.dayPassFree ? dayPass : strings.ranking.dayPass(dayPass) });
  }

  const forbidden = workForbidden(place.laptop_hours, place.laptop_source);
  const slow = useSlowConnection();
  const full = slow ? null : place.cover_full_url;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${rank}. ${forbidden ? strings.map.pinWorkForbidden(place.name) : place.name}`}
      style={({ pressed }) => [styles.row, forbidden && styles.forbidden, pressed && styles.pressed]}
    >
      <Text variant={compact ? 'smallStrong' : 'heading'} tone={rank <= 3 ? 'accent' : 'faint'} style={[styles.rank, compact && styles.rankCompact]}>
        {rank}
      </Text>

      <View style={[styles.thumb, compact && styles.thumbCompact, { backgroundColor: `${pinColor(place.category, forbidden)}18` }]}>
        {place.cover_preview_url || full ? (
          <>
            {place.cover_preview_url ? (
              <Image source={{ uri: place.cover_preview_url }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={6} />
            ) : null}
            {full ? (
              <Image
                source={{ uri: full }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={200}
                loading="lazy"
                priority="low"
                recyclingKey={place.id}
              />
            ) : null}
          </>
        ) : (
          <Icon name={categoryIcon(place.category)} size={compact ? 20 : 24} color={pinColor(place.category, forbidden)} />
        )}
      </View>

      <View style={styles.body}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {place.name}
        </Text>
        <View style={styles.meta}>
          <CategoryBadge category={place.category} />
          {location || place.address ? (
            <Text variant="small" tone="muted" numberOfLines={1} style={styles.address}>
              {location ?? place.address}
            </Text>
          ) : null}
        </View>
        {forbidden ? (
          <View style={styles.forbiddenLine}>
            <Icon name="slash" size={13} color={colors.danger} />
            <Text variant="caption" style={{ color: colors.danger }}>
              {strings.map.notLaptopFriendly}
            </Text>
          </View>
        ) : null}
        {now ? (
          <HoursStatusLine
            hours={place.hours}
            laptop={place.laptop_hours}
            category={place.category}
            timezone={timezone}
            now={now}
            showWork={showWork}
          />
        ) : null}
        <View style={styles.facts}>
          {facts.map((f) => (
            <View key={f.label} style={styles.fact}>
              <Icon name={f.icon} size={13} color={f.strong ? colors.success : colors.textMuted} />
              <Text variant="caption" style={{ color: f.strong ? colors.success : colors.textMuted }}>
                {f.label}
              </Text>
            </View>
          ))}
        </View>
        {forbidden ? null : place.review_count === 0 && place.category !== 'coliving' ? (
          <Text variant="caption" style={styles.beFirst}>
            {strings.ranking.beFirst}
          </Text>
        ) : !(place.review_count > 0 && place.rating_avg !== null) ? (
          <Text variant="caption" tone="faint">
            {strings.ranking.provisional}
          </Text>
        ) : null}
        {!signedIn && place.text_review_count > 0 ? (
          <View style={styles.locked}>
            <Icon name="lock" size={12} color={colors.accent} />
            <Text variant="caption" tone="accent">
              {strings.ranking.lockedReviews(place.text_review_count)}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.side}>
        <ScoreBadge score={place.work_score} size={compact ? 'sm' : 'md'} />
        {place.review_count > 0 && place.rating_avg !== null ? (
          <View style={styles.rating}>
            {!compact ? <Stars value={Math.round(Number(place.rating_avg))} size={12} /> : <Icon name="star" size={12} color={colors.star} />}
            <Text variant="caption" tone="muted">
              {formatRating(place.rating_avg)} ({place.review_count})
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(58,46,36, 0.08)',
  },
  pressed: {
    backgroundColor: colors.glass,
  },
  forbidden: {
    opacity: FORBIDDEN_PIN_OPACITY + 0.15,
  },
  forbiddenLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rank: {
    width: 36,
    textAlign: 'center',
  },
  rankCompact: {
    width: 22,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbCompact: {
    width: 52,
    height: 52,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  address: {
    flexShrink: 1,
  },
  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.md,
    rowGap: 2,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  beFirst: {
    color: colors.warning,
  },
  locked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  side: {
    flexShrink: 0,
    alignItems: 'flex-end',
    gap: 4,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
