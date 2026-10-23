import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, CategoryBadge, Icon, Text } from '@/components/ui';
import { formatDistance } from '@/lib/geo';
import { formatRating } from '@/lib/format';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import type { PublicPlace } from '@/lib/types';

interface PlaceCardProps {
  place: PublicPlace;
  distanceKm?: number | null;
  selected?: boolean;
  onPress: () => void;
  compact?: boolean;
}

function factIcon(place: PublicPlace) {
  const items: { icon: 'wifi' | 'zap' | 'phone'; label: string; ok: boolean | null }[] = [
    {
      icon: 'wifi',
      label: strings.explore.wifi,
      ok: place.wifi === 'unknown' ? null : place.wifi === 'yes',
    },
    {
      icon: 'zap',
      label: strings.explore.power,
      ok: place.power_outlets === 'unknown' ? null : place.power_outlets !== 'none',
    },
    {
      icon: 'phone',
      label: strings.explore.calls,
      ok: place.calls === 'unknown' ? null : place.calls !== 'no',
    },
  ];
  return items;
}

export const PlaceCard = memo(function PlaceCard({ place, distanceKm, selected, onPress, compact }: PlaceCardProps) {
  const facts = factIcon(place);
  const thumb = place.cover_full_url ?? place.cover_preview_url;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={place.name}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        pressed && styles.cardPressed,
        compact && styles.cardCompact,
      ]}
    >
      <View style={styles.thumbWrap}>
        {thumb ? (
          <Image
            source={{ uri: thumb }}
            style={styles.thumb}
            contentFit="cover"
            blurRadius={place.cover_photo_locked ? 6 : 0}
            transition={150}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Icon name={place.category === 'coworking' ? 'briefcase' : 'coffee'} size={22} color={colors.textFaint} />
          </View>
        )}
        {place.cover_photo_locked ? (
          <View style={styles.lock}>
            <Icon name="lock" size={12} color="#fff" />
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text variant="bodyStrong" numberOfLines={1} style={styles.title}>
            {place.name}
          </Text>
          {place.rating_avg !== null && place.review_count > 0 ? (
            <View style={styles.rating}>
              <Icon name="star" size={13} color={colors.star} />
              <Text variant="smallStrong">{formatRating(place.rating_avg)}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.metaRow}>
          <CategoryBadge category={place.category} />
          {place.is_example ? <Badge label={strings.common.example} tone="warning" /> : null}
          {distanceKm !== null && distanceKm !== undefined ? (
            <Text variant="small" tone="muted">
              {formatDistance(distanceKm)}
            </Text>
          ) : null}
        </View>
        <View style={styles.facts}>
          {facts.map((f) => (
            <View key={f.icon} style={styles.fact} accessibilityLabel={`${f.label}: ${f.ok === null ? strings.common.unknown : f.ok ? strings.common.yes : strings.common.no}`}>
              <Icon
                name={f.icon}
                size={14}
                color={f.ok === null ? colors.textFaint : f.ok ? colors.success : colors.danger}
              />
              <Text variant="caption" tone={f.ok === null ? 'faint' : 'muted'}>
                {f.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  cardCompact: {
    borderWidth: 0,
    padding: 0,
  },
  cardSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.bgSubtle,
  },
  cardPressed: {
    opacity: 0.9,
  },
  thumbWrap: {
    width: 84,
    height: 84,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.bgMuted,
  },
  thumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  lock: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(23,21,15,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 6,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  facts: {
    flexDirection: 'row',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
