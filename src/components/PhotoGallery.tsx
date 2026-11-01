import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Icon, Text, categoryIcon } from '@/components/ui';
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
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const locked = photos.length > 0 && photos.every((p) => p.locked);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(width, 1));
    if (i !== index) setIndex(i);
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
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
        scrollEnabled={!locked}
        style={{ width, height }}
      >
        {photos.map((photo) => (
          <Image
            key={photo.id}
            source={{ uri: photo.locked || !photo.full_url ? photo.preview_url : photo.full_url }}
            style={{ width, height }}
            contentFit="cover"
            blurRadius={photo.locked ? 10 : 0}
            transition={200}
            accessibilityLabel={photo.locked ? strings.place.lockedPhotos : undefined}
          />
        ))}
      </ScrollView>
      {locked ? (
        <View style={styles.lockOverlay}>
          <View style={styles.lockBadge}>
            <Icon name="lock" size={18} color={colors.onAccent} />
          </View>
          <Text variant="bodyStrong" tone="inverse" align="center">
            {strings.place.lockedPhotos}
          </Text>
          <Text variant="small" style={styles.lockSub} align="center">
            {strings.plus.upsellPhotos} {strings.plus.price}.
          </Text>
          <Button title={strings.plus.unlock} variant="plus" onPress={() => router.push('/plus')} />
        </View>
      ) : photos.length > 1 ? (
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
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  lockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(23,21,15,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  lockBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.plus,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  lockSub: {
    color: 'rgba(255,255,255,0.85)',
    marginBottom: spacing.sm,
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
