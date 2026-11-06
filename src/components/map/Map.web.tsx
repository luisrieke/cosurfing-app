import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/lib/theme';
import type { PlaceCategory } from '@/lib/types';

import { clusterCountLabel, clusterSize } from './cluster';
import { pinColor, pinIconPaths } from './pinSvg';
import type { MapCluster, MapHandle, MapProps } from './types';

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

// MapLibre positions a marker by setting `transform` on the element it is given, every frame.
// That element (.cs-marker) must therefore have no transform or transition of its own, or pins
// lag behind the map while panning and zooming. Visual effects live on the inner .cs-pin.
const css = `
.cs-marker { width: 36px; height: 44px; }
.cs-marker--selected { z-index: 5; }
.cs-pin { position: relative; display: block; width: 36px; height: 44px; border: 0; padding: 0; background: transparent; cursor: pointer; transform-origin: 50% 100%; transition: transform 160ms ease; }
.cs-pin:focus-visible { outline: 2px solid ${colors.accent}; outline-offset: 2px; border-radius: 18px; }
.cs-pin__body { position: absolute; left: 2px; top: 2px; width: 32px; height: 32px; border-radius: 16px; border: 2px solid #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(42,33,26,0.3); }
.cs-pin__tail { position: absolute; left: 50%; bottom: 4px; width: 10px; height: 10px; margin-left: -5px; transform: rotate(45deg); border-radius: 1px; box-shadow: 2px 2px 3px rgba(42,33,26,0.15); }
.cs-pin svg { width: 16px; height: 16px; stroke: #fff; fill: none; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.cs-marker--selected .cs-pin { transform: scale(1.25); }
.cs-marker--selected .cs-pin__body { border-color: ${colors.text}; }
.cs-cluster { display: flex; flex-direction: column; align-items: center; gap: 2px; border: 0; padding: 0; background: transparent; cursor: pointer; font-family: inherit; }
.cs-cluster__bubble { display: flex; align-items: center; justify-content: center; border-radius: 999px; background: ${colors.accent}; color: #fff; font-weight: 700; font-size: 13px; border: 2px solid #fff; box-shadow: 0 0 0 4px ${colors.accent}33, 0 2px 6px rgba(42,33,26,0.3); }
.cs-cluster__label { max-width: 140px; padding: 1px 6px; border-radius: 6px; background: rgba(255,255,255,0.85); color: ${colors.text}; font-size: 11px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cs-cluster:hover .cs-cluster__bubble, .cs-cluster:focus-visible .cs-cluster__bubble { filter: brightness(1.08); }
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

function buildPin(category: PlaceCategory, name: string): { root: HTMLDivElement; button: HTMLButtonElement } {
  const root = document.createElement('div');
  root.className = 'cs-marker';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cs-pin';
  button.setAttribute('aria-label', name);
  const color = pinColor(category);
  button.innerHTML = `<span class="cs-pin__tail" style="background:${color}"></span><span class="cs-pin__body" style="background:${color}"><svg viewBox="0 0 24 24" aria-hidden="true">${pinIconPaths[category]}</svg></span>`;
  root.appendChild(button);
  return { root, button };
}

function buildCluster(cluster: MapCluster): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'cs-cluster';
  el.setAttribute('aria-label', cluster.label ? `${cluster.label}: ${cluster.count}` : String(cluster.count));
  const size = clusterSize(cluster.count);
  const bubble = document.createElement('span');
  bubble.className = 'cs-cluster__bubble';
  bubble.style.width = `${size}px`;
  bubble.style.height = `${size}px`;
  bubble.textContent = clusterCountLabel(cluster.count);
  el.appendChild(bubble);
  if (cluster.label) {
    const label = document.createElement('span');
    label.className = 'cs-cluster__label';
    label.textContent = cluster.label;
    el.appendChild(label);
  }
  return el;
}

export const PlacesMap = forwardRef<MapHandle, MapProps>(function PlacesMap(
  { center, zoom, markers, clusters, selectedId, onSelect, onClusterPress, userLocation, onMoveEnd, showControls, style },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRefs = useRef<Map<string, { marker: maplibregl.Marker; el: HTMLDivElement }>>(
    new Map(),
  );
  const clusterRefs = useRef<Map<string, maplibregl.Marker>>(new Map());
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onClusterPressRef = useRef(onClusterPress);
  onClusterPressRef.current = onClusterPress;
  const onMoveEndRef = useRef(onMoveEnd);
  onMoveEndRef.current = onMoveEnd;
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
    const emitViewport = () => {
      const b = map.getBounds();
      const c = map.getCenter();
      onMoveEndRef.current?.({
        center: { lat: c.lat, lng: c.lng },
        zoom: map.getZoom(),
        bounds: { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() },
      });
    };
    map.on('load', emitViewport);
    map.on('moveend', emitViewport);
    mapRef.current = map;
    const markerStore = markerRefs.current;
    const clusterStore = clusterRefs.current;
    return () => {
      map.remove();
      mapRef.current = null;
      markerStore.clear();
      clusterStore.clear();
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
      const { root, button } = buildPin(m.category, m.name);
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectRef.current(m.id);
      });
      // The tail's tip sits 2 px above the element's bottom edge.
      const marker = new maplibregl.Marker({ element: root, anchor: 'bottom', offset: [0, 2] })
        .setLngLat([m.lng, m.lat])
        .addTo(map);
      existing.set(m.id, { marker, el: root });
    }
  }, [markers]);

  // Sync city clusters (zoomed-out overview).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const existing = clusterRefs.current;
    const next = clusters ?? [];
    const nextIds = new Set(next.map((c) => c.id));
    for (const [id, marker] of existing) {
      if (!nextIds.has(id)) {
        marker.remove();
        existing.delete(id);
      }
    }
    for (const c of next) {
      if (existing.has(c.id)) continue;
      const el = buildCluster(c);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onClusterPressRef.current?.(c);
      });
      const marker = new maplibregl.Marker({ element: el, anchor: 'top', offset: [0, -clusterSize(c.count) / 2] })
        .setLngLat([c.lng, c.lat])
        .addTo(map);
      existing.set(c.id, marker);
    }
  }, [clusters]);

  // Selected state. Runs after the marker sync above, so pins created in the same
  // commit get the class too; iterating `markers` makes that dependency explicit.
  useEffect(() => {
    const store = markerRefs.current;
    for (const m of markers) {
      store.get(m.id)?.el.classList.toggle('cs-marker--selected', m.id === selectedId);
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
  // No flex: 1 here. On web it sets flex-basis 0, which beats a caller's fixed height and collapses
  // the map to 0 px inside a ScrollView. Callers size the map through `style`.
  wrap: {
    overflow: 'hidden',
    backgroundColor: colors.bgMuted,
  },
});
