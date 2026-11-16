import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PlacesMap, type MapMarker } from '@/components/map';
import { Button, Icon, Text } from '@/components/ui';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import type { Place } from '@/lib/types';

const PREVIEW_ZOOM = 15;

interface PlaceMapPreviewProps {
  place: Pick<Place, 'id' | 'name' | 'category' | 'lat' | 'lng' | 'address'>;
  height?: number;
  /** Opens the correction form for the pin position; hidden when not given. */
  onWrongPin?: () => void;
}

export function PlaceMapPreview({ place, height = 200, onWrongPin }: PlaceMapPreviewProps) {
  const router = useRouter();
  const markers = useMemo<MapMarker[]>(
    () => [{ id: place.id, lat: place.lat, lng: place.lng, category: place.category, name: place.name }],
    [place.id, place.lat, place.lng, place.category, place.name],
  );
  const openMap = () => router.push(`/?lat=${place.lat}&lng=${place.lng}&zoom=16`);

  return (
    <View style={styles.card}>
      <View style={[styles.mapWrap, { height }]}>
        {/* The map only reads its center on mount, so a moved pin needs a fresh map. */}
        <PlacesMap
          key={`${place.lat},${place.lng}`}
          center={{ lat: place.lat, lng: place.lng }}
          zoom={PREVIEW_ZOOM}
          markers={markers}
          selectedId={place.id}
          onSelect={() => {}}
          userLocation={null}
          interactive={false}
          style={StyleSheet.absoluteFill}
        />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={openMap}
          accessibilityRole="link"
          accessibilityLabel={strings.placeMap.a11y(place.name)}
        />
      </View>
      <View style={styles.body}>
        {place.address ? (
          <View style={styles.addressRow}>
            <Icon name="map-pin" size={14} color={colors.textMuted} />
            <Text variant="small" style={styles.flex}>
              {place.address}
            </Text>
          </View>
        ) : null}
        <Button title={strings.placeMap.openMap} icon="map" variant="secondary" size="sm" onPress={openMap} style={styles.selfStart} />
        {onWrongPin ? (
          <Pressable onPress={onWrongPin} accessibilityRole="button" style={styles.wrongPin} hitSlop={6}>
            <Icon name="edit-2" size={13} color={colors.textMuted} />
            <Text variant="caption" tone="muted">
              {strings.placeMap.wrongPin}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  mapWrap: {
    position: 'relative',
    backgroundColor: colors.bgMuted,
  },
  body: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  flex: {
    flex: 1,
  },
  selfStart: {
    alignSelf: 'flex-start',
  },
  wrongPin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
});
