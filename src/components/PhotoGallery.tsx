import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  View,
} from 'react-native';

import { ReportButton } from '@/components/ReportButton';
import { Icon, Text, categoryIcon } from '@/components/ui';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useSlowConnection } from '@/hooks/useSlowConnection';
import { useAuth } from '@/lib/auth';
import { adminStarPhoto } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import type { PlaceCategory, PlacePhoto } from '@/lib/types';

interface PhotoGalleryProps {
  photos: PlacePhoto[];
  category: PlaceCategory;
  width: number;
  height: number;
  loading?: boolean;
}

export function PhotoGallery({ photos, category, width, height, loading }: PhotoGalleryProps) {
  const [index, setIndex] = useState(0);
  const [reached, setReached] = useState(0);
  const [stars, setStars] = useState<Record<string, number>>({});
  const scrollRef = useRef<ScrollViewInstance>(null);
  const { isDesktop } = useBreakpoint();
  const { isAdmin } = useAuth();
  const reach = useSlowConnection() ? 0 : 1;
  const loadUpTo = Math.max(reached, index) + reach;
  const showArrows = Platform.OS === 'web' && isDesktop && photos.length > 1;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(width, 1));
    if (i !== index) setIndex(i);
    if (i > reached) setReached(i);
  };

  const current = photos[index];
  const starOf = (photo: PlacePhoto) => stars[photo.id] ?? photo.stars ?? 0;

  // Optimistic so fast repeated taps each count; the order only changes on the next load.
  const star = (photo: PlacePhoto) => {
    setStars((s) => ({ ...s, [photo.id]: (s[photo.id] ?? photo.stars ?? 0) + 1 }));
    adminStarPhoto(photo.id).catch(() => {
      setStars((s) => ({ ...s, [photo.id]: (s[photo.id] ?? 1) - 1 }));
    });
  };

  const goTo = (i: number) => {
    const next = Math.max(0, Math.min(photos.length - 1, i));
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
  };

  if (loading) {
    return <View style={[styles.frame, { width, height }, styles.placeholder]} />;
  }

  if (photos.length === 0) {
    return (
      <View style={[styles.frame, { width, height }, styles.placeholder]}>
        <Icon name={categoryIcon(category)} size={32} color={colors.textFaint} />
        <Text variant="small" tone="faint">
          {strings.place.noPhotos}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.frame, { width, height }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
        style={{ width, height }}
      >
        {photos.map((photo, i) => (
          <View key={photo.id} style={{ width, height }}>
            <Image source={{ uri: photo.preview_url }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={8} />
            {photo.full_url && i <= loadUpTo ? (
              <Image
                source={{ uri: photo.full_url }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={200}
                priority={i === index ? 'high' : 'low'}
              />
            ) : null}
          </View>
        ))}
      </ScrollView>
      {showArrows && index > 0 ? (
        <Pressable
          onPress={() => goTo(index - 1)}
          accessibilityRole="button"
          accessibilityLabel={strings.place.prevPhoto}
          style={({ hovered }: { hovered?: boolean }) => [styles.arrow, styles.arrowLeft, hovered && styles.arrowHovered]}
        >
          <Icon name="chevron-left" size={22} color={colors.text} />
        </Pressable>
      ) : null}
      {showArrows && index < photos.length - 1 ? (
        <Pressable
          onPress={() => goTo(index + 1)}
          accessibilityRole="button"
          accessibilityLabel={strings.place.nextPhoto}
          style={({ hovered }: { hovered?: boolean }) => [styles.arrow, styles.arrowRight, hovered && styles.arrowHovered]}
        >
          <Icon name="chevron-right" size={22} color={colors.text} />
        </Pressable>
      ) : null}
      {current ? (
        <View style={styles.actions}>
          {isAdmin ? (
            <Pressable
              onPress={() => star(current)}
              accessibilityRole="button"
              accessibilityLabel={strings.place.starPhoto}
              hitSlop={8}
              style={[styles.chip, styles.starChip]}
            >
              <Icon name="star" size={13} color="#fff" />
              <Text variant="caption" style={styles.starCount}>
                {starOf(current)}
              </Text>
            </Pressable>
          ) : null}
          <View style={styles.chip}>
            <ReportButton type="photo" id={current.id} color="#fff" />
          </View>
        </View>
      ) : null}
      {photos.length > 1 ? (
        <View style={styles.dots} pointerEvents="none">
          {photos.map((p, i) => (
            <View key={p.id} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colors.bgMuted,
    overflow: 'hidden',
  },
  actions: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chip: {
    padding: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  starChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
  },
  starCount: {
    color: '#fff',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  arrowLeft: {
    left: spacing.md,
  },
  arrowRight: {
    right: spacing.md,
  },
  arrowHovered: {
    backgroundColor: '#fff',
  },
  dots: {
    position: 'absolute',
    bottom: spacing.md,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 16,
    borderRadius: radius.pill,
  },
});
