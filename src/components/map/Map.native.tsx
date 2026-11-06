import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';

import { colors } from '@/lib/theme';
import type { LatLng } from '@/lib/types';

import { Pin } from './Pin';
import type { MapHandle, MapProps, MapViewport } from './types';

function regionFromZoom(center: LatLng, zoom: number, width: number, height: number): Region {
  const longitudeDelta = (360 * width) / (256 * Math.pow(2, zoom));
  const latitudeDelta = longitudeDelta * (height / Math.max(width, 1)) * 0.8;
  return { latitude: center.lat, longitude: center.lng, latitudeDelta, longitudeDelta };
}

function viewportFromRegion(r: Region, width: number): MapViewport {
  return {
    center: { lat: r.latitude, lng: r.longitude },
    zoom: Math.log2((360 * width) / (256 * Math.max(r.longitudeDelta, 1e-6))),
    bounds: {
      north: r.latitude + r.latitudeDelta / 2,
      south: r.latitude - r.latitudeDelta / 2,
      east: r.longitude + r.longitudeDelta / 2,
      west: r.longitude - r.longitudeDelta / 2,
    },
  };
}

export const PlacesMap = forwardRef<MapHandle, MapProps>(function PlacesMap(
  { center, zoom, markers, selectedId, onSelect, userLocation, onMoveEnd, style },
  ref,
) {
  const mapRef = useRef<MapView | null>(null);
  const { width, height } = useWindowDimensions();
  // Snapshot taken once on mount: MapView only reads `initialRegion` when it mounts,
  // later camera moves go through `flyTo` / `fitMarkers`.
  const [initialRegion] = useState(() => regionFromZoom(center, zoom, width, height));
  const markersRef = useRef(markers);
  markersRef.current = markers;
  const regionRef = useRef<Region>(initialRegion);

  useImperativeHandle(
    ref,
    () => ({
      flyTo: (target, nextZoom, offsetY = 0) => {
        const current = regionRef.current;
        const z = nextZoom ?? 15;
        const region = nextZoom
          ? regionFromZoom(target, z, width, height)
          : { ...current, latitude: target.lat, longitude: target.lng };
        // Shift the center down so the marker sits above a bottom sheet.
        const latShift = (offsetY / Math.max(height, 1)) * region.latitudeDelta;
        mapRef.current?.animateToRegion({ ...region, latitude: region.latitude - latShift }, 500);
      },
      fitMarkers: (padding = { top: 80, right: 40, bottom: 160, left: 40 }) => {
        const ms = markersRef.current;
        if (ms.length === 0) return;
        mapRef.current?.fitToCoordinates(
          ms.map((m) => ({ latitude: m.lat, longitude: m.lng })),
          { edgePadding: padding, animated: true },
        );
      },
    }),
    [width, height],
  );

  return (
    <View style={[styles.wrap, style]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        onMapReady={() => onMoveEnd?.(viewportFromRegion(regionRef.current, width))}
        onRegionChangeComplete={(r) => {
          regionRef.current = r;
          onMoveEnd?.(viewportFromRegion(r, width));
        }}
        onPress={() => onSelect(null)}
        showsUserLocation={Boolean(userLocation)}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
      >
        {markers.map((m) => (
          <Marker
            key={m.id}
            coordinate={{ latitude: m.lat, longitude: m.lng }}
            anchor={{ x: 0.5, y: 1 }}
            onPress={(e) => {
              e.stopPropagation?.();
              onSelect(m.id);
            }}
            tracksViewChanges={m.id === selectedId}
            accessibilityLabel={m.name}
          >
            <Pin category={m.category} selected={m.id === selectedId} />
          </Marker>
        ))}
      </MapView>
    </View>
  );
});

const styles = StyleSheet.create({
  // Callers size the map through `style`; flex: 1 would override a fixed height inside a ScrollView.
  wrap: {
    overflow: 'hidden',
    backgroundColor: colors.bgMuted,
  },
});
