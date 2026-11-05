import { Image } from 'expo-image';
import { useState } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, Text, categoryIcon } from '@/components/ui';
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
        style={{ width, height }}
      >
        {photos.map((photo) => (
          <Image
            key={photo.id}
            source={{ uri: photo.full_url ?? photo.preview_url }}
            style={{ width, height }}
            contentFit="cover"
            transition={200}
          />
        ))}
      </ScrollView>
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
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
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
