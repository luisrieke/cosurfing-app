import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/lib/theme';
import type { PlaceCategory } from '@/lib/types';

import { pinColor, pinIconPaths } from './pinSvg';
import type { MapHandle, MapProps } from './types';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const CSS_ID = 'cosurfing-map-css';

// MapLibre resolves its worker relative to `import.meta.url`, which Metro does not provide.
// The worker bundle is copied into `public/` by scripts/copy-maplibre-worker.mjs (postinstall)
// and served from the site root on every platform that hosts the web build.
let workerConfigured = false;
function ensureWorker() {
  if (workerConfigured || typeof window === 'undefined') return;
  workerConfigured = true;
  maplibregl.setWorkerUrl(`/maplibre-gl-worker.mjs?v=${encodeURIComponent(maplibregl.getVersion())}`);
}

const css = `
.cs-pin { position: relative; width: 36px; height: 44px; border: 0; padding: 0; background: transparent; cursor: pointer; transform-origin: 50% 100%; transition: transform 160ms ease; }
.cs-pin:focus-visible { outline: 2px solid ${colors.accent}; outline-offset: 2px; border-radius: 18px; }
.cs-pin__body { position: absolute; left: 2px; top: 2px; width: 32px; height: 32px; border-radius: 16px; border: 2px solid #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(42,33,26,0.3); }
.cs-pin__tail { position: absolute; left: 50%; bottom: 4px; width: 10px; height: 10px; margin-left: -5px; transform: rotate(45deg); border-radius: 1px; box-shadow: 2px 2px 3px rgba(42,33,26,0.15); }
.cs-pin svg { width: 16px; height: 16px; stroke: #fff; fill: none; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.cs-pin--selected { transform: scale(1.25); z-index: 5; }
.cs-pin--selected .cs-pin__body { border-color: ${colors.text}; }
.cs-user { width: 18px; height: 18px; border-radius: 9px; background: #1D6FE8; border: 3px solid #fff; box-shadow: 0 0 0 6px rgba(29,111,232,0.2); }
.maplibregl-ctrl-attrib { font-size: 10px; }
.maplibregl-ctrl-group { border-radius: 999px !important; overflow: hidden; background: ${colors.glassStrong} !important; backdrop-filter: blur(18px) saturate(1.6); -webkit-backdrop-filter: blur(18px) saturate(1.6); border: 1px solid ${colors.glassBorder} !important; box-shadow: 0 1px 2px rgba(42,33,26,0.08), 0 8px 24px rgba(42,33,26,0.08) !important; }
.maplibregl-ctrl-group button { width: 36px !important; height: 36px !important; }
`;

function ensureCss() {
  if (typeof document === 'undefined' || document.getElementById(CSS_ID)) return;
  const style = document.createElement('style');
  style.id = CSS_ID;
  style.textContent = css;
  document.head.appendChild(style);
}

function buildPin(category: PlaceCategory, name: string): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'cs-pin';
  el.setAttribute('aria-label', name);
  const color = pinColor(category);
  el.innerHTML = `<span class="cs-pin__tail" style="background:${color}"></span><span class="cs-pin__body" style="background:${color}"><svg viewBox="0 0 24 24" aria-hidden="true">${pinIconPaths[category]}</svg></span>`;
  return el;
}

export const PlacesMap = forwardRef<MapHandle, MapProps>(function PlacesMap(
  { center, zoom, markers, selectedId, onSelect, userLocation, showControls, style },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRefs = useRef<Map<string, { marker: maplibregl.Marker; el: HTMLButtonElement }>>(
    new Map(),
  );
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const markersRef = useRef(markers);
  markersRef.current = markers;

  // The map is created once with the mount-time view; later camera moves go through
  // flyTo / fitMarkers. A snapshot, not the live props, is therefore the effect's input.
  const [initialView] = useState(() => ({
    center: [center.lng, center.lat] as [number, number],
    zoom,
    showControls,
  }));

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    ensureCss();
    ensureWorker();
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: initialView.center,
      zoom: initialView.zoom,
      attributionControl: { compact: true },
      cooperativeGestures: false,
    });
    if (initialView.showControls) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    }
    map.on('click', () => onSelectRef.current(null));
    mapRef.current = map;
    const markerStore = markerRefs.current;
    return () => {
      map.remove();
      mapRef.current = null;
      markerStore.clear();
    };
  }, [initialView]);

  // Sync markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const existing = markerRefs.current;
    const nextIds = new Set(markers.map((m) => m.id));
    for (const [id, entry] of existing) {
      if (!nextIds.has(id)) {
        entry.marker.remove();
        existing.delete(id);
      }
    }
    for (const m of markers) {
      if (existing.has(m.id)) continue;
      const el = buildPin(m.category, m.name);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectRef.current(m.id);
      });
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([m.lng, m.lat])
        .addTo(map);
      existing.set(m.id, { marker, el });
    }
  }, [markers]);

  // Selected state. Runs after the marker sync above, so pins created in the same
  // commit get the class too; iterating `markers` makes that dependency explicit.
  useEffect(() => {
    const store = markerRefs.current;
    for (const m of markers) {
      store.get(m.id)?.el.classList.toggle('cs-pin--selected', m.id === selectedId);
    }
  }, [selectedId, markers]);

  // User location
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!userLocation) {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      return;
    }
    if (!userMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'cs-user';
      el.setAttribute('aria-label', 'Your location');
      userMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat([userLocation.lng, userLocation.lat]).addTo(map);
    } else {
      userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
    }
  }, [userLocation]);

  // Resize when the container changes size (sidebar layouts).
  useEffect(() => {
    const el = containerRef.current;
    const map = mapRef.current;
    if (!el || !map || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      flyTo: (target, nextZoom, offsetY = 0) => {
        const map = mapRef.current;
        if (!map) return;
        map.easeTo({
          center: [target.lng, target.lat],
          zoom: nextZoom ?? Math.max(map.getZoom(), 14),
          offset: [0, -offsetY],
          duration: 600,
        });
      },
      fitMarkers: (padding = { top: 80, right: 40, bottom: 160, left: 40 }) => {
        const map = mapRef.current;
        const ms = markersRef.current;
        if (!map || ms.length === 0) return;
        if (ms.length === 1) {
          map.easeTo({ center: [ms[0]!.lng, ms[0]!.lat], zoom: 15, duration: 500 });
          return;
        }
        const bounds = new maplibregl.LngLatBounds();
        for (const m of ms) bounds.extend([m.lng, m.lat]);
        map.fitBounds(bounds, { padding, maxZoom: 16, duration: 600 });
      },
    }),
    [],
  );

  return (
    <View style={[styles.wrap, style]}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.bgMuted,
  },
});
