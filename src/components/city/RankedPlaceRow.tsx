import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { Stars } from '@/components/Reviews';
import { ScoreBadge } from '@/components/ScoreBadge';
import { CategoryBadge, Icon, type IconName, Text, categoryIcon } from '@/components/ui';
import { dayPassLabel, formatMbps, formatRating } from '@/lib/format';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import type { RankedPlace } from '@/lib/types';

import { pinColor } from '@/components/map/pinSvg';
import { useSlowConnection } from '@/hooks/useSlowConnection';

export function RankedPlaceRow({
  place,
  rank,
  signedIn,
  compact,
  onPress,
}: {
  place: RankedPlace;
  rank: number;
  signedIn: boolean;
  compact: boolean;
  onPress: () => void;
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
  if (dayPass) facts.push({ icon: 'tag', label: strings.ranking.dayPass(dayPass) });

  const slow = useSlowConnection();
  const full = slow ? null : place.cover_full_url;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${rank}. ${place.name}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text variant={compact ? 'smallStrong' : 'heading'} tone={rank <= 3 ? 'accent' : 'faint'} style={[styles.rank, compact && styles.rankCompact]}>
        {rank}
      </Text>

      <View style={[styles.thumb, compact && styles.thumbCompact, { backgroundColor: `${pinColor(place.category)}18` }]}>
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
          <Icon name={categoryIcon(place.category)} size={compact ? 20 : 24} color={pinColor(place.category)} />
        )}
      </View>

      <View style={styles.body}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {place.name}
        </Text>
        <View style={styles.meta}>
          <CategoryBadge category={place.category} />
          {place.address ? (
            <Text variant="small" tone="muted" numberOfLines={1} style={styles.address}>
              {place.address}
            </Text>
          ) : null}
        </View>
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
        ) : (
          <Text variant="caption" tone="faint">
            {strings.ranking.provisional}
          </Text>
        )}
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
    borderBottomColor: 'rgba(42, 33, 26, 0.08)',
  },
  pressed: {
    backgroundColor: colors.glass,
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
  locked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  side: {
    alignItems: 'flex-end',
    gap: 4,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
