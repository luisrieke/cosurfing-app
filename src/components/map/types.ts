import type { ViewStyle } from 'react-native';

import type { LatLng, PlaceCategory } from '@/lib/types';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  name: string;
}

export interface MapProps {
  center: LatLng;
  zoom: number;
  markers: MapMarker[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  userLocation: LatLng | null;
  /** Show zoom controls (desktop web). */
  showControls?: boolean;
  style?: ViewStyle;
}

export interface MapHandle {
  /** Move the camera. `offsetY` shifts the target up by this many pixels (to clear a bottom sheet). */
  flyTo: (target: LatLng, zoom?: number, offsetY?: number) => void;
  fitMarkers: (padding?: { top: number; right: number; bottom: number; left: number }) => void;
}
