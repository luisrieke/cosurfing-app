import type { ViewStyle } from 'react-native';

import type { LatLng, MyPlaceContribution, PlaceCategory } from '@/lib/types';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  name: string;
  /** Drawn as a green ring: light for a review, dark for a review with photos. */
  mine?: MyPlaceContribution;
}

/** Several places drawn as one bubble, used when the map is zoomed out too far for single pins. */
export interface MapCluster {
  id: string;
  lat: number;
  lng: number;
  count: number;
  /** City name when the bubble stands for one city or is dominated by one. */
  label: string | null;
  /** Where a tap should take the camera. */
  target: { lat: number; lng: number; zoom: number };
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface MapViewport {
  center: LatLng;
  zoom: number;
  bounds: MapBounds;
}

export interface MapProps {
  center: LatLng;
  zoom: number;
  markers: MapMarker[];
  clusters?: MapCluster[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClusterPress?: (cluster: MapCluster) => void;
  userLocation: LatLng | null;
  /** Called once the map is ready and after every pan or zoom. */
  onMoveEnd?: (viewport: MapViewport) => void;
  /** Show zoom controls (desktop web). */
  showControls?: boolean;
  style?: ViewStyle;
}

export interface MapHandle {
  /** Move the camera. `offsetY` shifts the target up by this many pixels (to clear a bottom sheet). */
  flyTo: (target: LatLng, zoom?: number, offsetY?: number) => void;
  fitMarkers: (padding?: { top: number; right: number; bottom: number; left: number }) => void;
}
