import { Image } from 'expo-image';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { ScoreBadge } from '@/components/ScoreBadge';
import { Shade } from '@/components/Shade';
import { Icon, Text, glassSurface } from '@/components/ui';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import type { CityListItem } from '@/lib/types';

const PLACEHOLDER_COLORS = ['#4F6B3A', '#B5573A', '#B89A6A', '#3B2F25', '#6F7F45', '#8E3F2B'];
const darkGlass = glassSurface('dark');
const lightGlass = glassSurface('strong');

export function CityCard({
  city,
  rank,
  onPress,
  style,
}: {
  city: CityListItem;
  rank: number | null;
  onPress: () => void;
  style?: ViewStyle;
}) {
  const collecting = city.place_count === 0 && (city.crawl_status === 'pending' || city.crawl_status === 'running');
  const fallback = PLACEHOLDER_COLORS[city.name.charCodeAt(0) % PLACEHOLDER_COLORS.length]!;
  const hasScore = city.review_count > 0 && city.city_score !== null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${city.name}, ${city.country_name}`}
      style={({ pressed, hovered }) => [styles.card, style, (pressed || hovered) && styles.cardActive]}
    >
      {city.cover_thumb_url ? (
        <Image
          source={{ uri: city.cover_thumb_url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          recyclingKey={city.id}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: fallback }]}>
          <Text style={styles.initial}>{city.name.charAt(0)}</Text>
        </View>
      )}
      <Shade
        colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.7)']}
        locations={[0, 0.35, 0.55, 1]}
      />

      <View style={styles.top}>
        <View style={styles.topLeft}>
          {rank !== null ? (
            <View style={[darkGlass, styles.rank]}>
              <Text variant="smallStrong" style={styles.light}>
                {rank}
              </Text>
            </View>
          ) : null}
          {city.is_hotspot ? (
            <View style={[lightGlass, styles.pill]}>
              <Icon name="zap" size={11} color={colors.text} />
              <Text variant="caption">{strings.home.hotspot}</Text>
            </View>
          ) : null}
        </View>
        {hasScore ? <ScoreBadge score={city.city_score} size="sm" /> : null}
      </View>

      <View style={styles.center}>
        <Text variant="title" style={[styles.light, styles.name]} numberOfLines={2}>
          {city.name}
        </Text>
        <Text variant="small" style={styles.lightMuted} numberOfLines={1}>
          {city.country_name}
        </Text>
      </View>

      <View style={[darkGlass, styles.bottom]}>
        {collecting ? (
          <Stat icon="loader" label={strings.home.collecting} />
        ) : (
          <>
            <Stat icon="map-pin" label={strings.home.placesCount(city.place_count)} />
            {city.median_download_mbps !== null ? (
              <Stat icon="wifi" label={`${Math.round(Number(city.median_download_mbps))} Mbps`} />
            ) : null}
            {city.review_count > 0 ? <Stat icon="star" label={strings.home.reviewsCount(city.review_count)} /> : null}
          </>
        )}
      </View>
    </Pressable>
  );
}

function Stat({ icon, label }: { icon: 'map-pin' | 'wifi' | 'star' | 'loader'; label: string }) {
  return (
    <View style={styles.stat}>
      <Icon name={icon} size={12} color="rgba(255,255,255,0.9)" />
      <Text variant="caption" style={styles.light} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    aspectRatio: 0.82,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.bgMuted,
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  cardActive: {
    transform: [{ scale: 0.985 }],
  },
  initial: {
    position: 'absolute',
    right: -10,
    bottom: -40,
    fontSize: 180,
    lineHeight: 200,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.18)',
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  topLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 1,
  },
  rank: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 6,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    height: 24,
    borderRadius: 12,
  },
  center: {
    alignItems: 'center',
    gap: 2,
  },
  name: {
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowRadius: 8,
  },
  bottom: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  light: {
    color: '#FFFFFF',
  },
  lightMuted: {
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },
});
