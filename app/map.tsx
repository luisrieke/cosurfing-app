import Head from 'expo-router/head';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { clusterCities, type MapCluster, type MapHandle, type MapViewport, PlacesMap } from '@/components/map';
import { HoursStatusLine } from '@/components/hours';
import { pinColor } from '@/components/map/pinSvg';
import { ScoreBadge } from '@/components/ScoreBadge';
import { SiteHeader, SiteHeaderSpacer } from '@/components/SiteHeader';
import { suggestRoute, type SuggestTarget } from '@/components/SuggestPlaceCta';
import { Button, CategoryBadge, categoryIcon, Chip, Glass, glassSurface, Icon, IconButton, Notice, Text } from '@/components/ui';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useNow, useTimeFilterRefresh } from '@/hooks/useNow';
import { useQuery } from '@/hooks/useQuery';
import { useUserLocation } from '@/hooks/useUserLocation';
import { isSupabaseConfigured } from '@/lib/env';
import { distanceKm, formatDistance } from '@/lib/geo';
import { localWeekMinute, matchesTimeFilter } from '@/lib/hours';
import { useAuth } from '@/lib/auth';
import { getMapCities, getMyReviewedPlaces, getPlacesInBounds } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import type { LatLng, MapPlace, PlaceCategory } from '@/lib/types';

const CATEGORIES: PlaceCategory[] = ['coworking', 'cafe', 'library', 'coliving'];

/** Below this zoom an area holds too many places to load at once. */
const MIN_ZOOM = 9;
const LIMIT = 300;
const NEAR_ME_ZOOM = 14;
const DEFAULT_VIEW = { center: { lat: 48.5, lng: 10 }, zoom: 4 };

function parseNumber(value: string | undefined): number | null {
  if (value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mostCommonCity(places: MapPlace[]): MapPlace['city'] {
  const counts = new Map<string, { city: NonNullable<MapPlace['city']>; n: number }>();
  for (const p of places) {
    if (!p.city) continue;
    const entry = counts.get(p.city.slug) ?? { city: p.city, n: 0 };
    entry.n += 1;
    counts.set(p.city.slug, entry);
  }
  let best: { city: NonNullable<MapPlace['city']>; n: number } | null = null;
  for (const entry of counts.values()) if (!best || entry.n > best.n) best = entry;
  return best?.city ?? null;
}

const chipGlass = glassSurface('strong', { flat: true });

/** A map filter that doubles as the legend: it shows the pin color and icon of its category. */
function LegendChip({ category, shown, onPress }: { category: PlaceCategory; shown: boolean; onPress: () => void }) {
  const label = strings.map.categories[category];
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: shown }}
      accessibilityLabel={strings.map.toggleCategory(label, shown)}
      onPress={onPress}
      style={({ pressed }) => [styles.legendChip, chipGlass, pressed && { backgroundColor: colors.surface }]}
    >
      <View style={[styles.legendDot, { backgroundColor: shown ? pinColor(category) : colors.bgMuted }]}>
        <Icon name={categoryIcon(category)} size={12} color={shown ? colors.onAccent : colors.textMuted} />
      </View>
      <Text
        variant="smallStrong"
        tone={shown ? undefined : 'muted'}
        style={!shown && styles.legendLabelOff}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function MapScreen() {
  const params = useLocalSearchParams<{ lat?: string; lng?: string; zoom?: string; reviewed?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useBreakpoint();
  const mapRef = useRef<MapHandle | null>(null);
  const location = useUserLocation();
  const { user } = useAuth();

  const [initial] = useState(() => {
    const lat = parseNumber(params.lat);
    const lng = parseNumber(params.lng);
    if (lat === null || lng === null) return { ...DEFAULT_VIEW, preset: false };
    return { center: { lat, lng }, zoom: parseNumber(params.zoom) ?? 12, preset: true };
  });

  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const [places, setPlaces] = useState<MapPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<PlaceCategory>>(() => new Set());
  const [reviewed, setReviewed] = useState(params.reviewed === '1');
  const [openNow, setOpenNow] = useState(false);
  const [workNow, setWorkNow] = useState(false);
  const [requery, setRequery] = useState(0);
  const now = useNow();
  const timeFilter = openNow || workNow;
  useTimeFilterRefresh(timeFilter, now, () => setRequery((n) => n + 1));
  const shownCategories = useMemo(() => CATEGORIES.filter((c) => !hidden.has(c)), [hidden]);
  const toggleCategory = (category: PlaceCategory) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });

  const zoomedIn = viewport !== null && viewport.zoom >= MIN_ZOOM;

  useEffect(() => {
    if (!viewport || viewport.zoom < MIN_ZOOM || !isSupabaseConfigured) return;
    let active = true;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const next = await getPlacesInBounds(viewport.bounds, shownCategories, LIMIT, { reviewed, openNow, workNow });
        if (!active) return;
        setPlaces(next);
        setError(null);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [viewport, shownCategories, reviewed, openNow, workNow, requery]);

  const cities = useQuery('map-cities', getMapCities, isSupabaseConfigured);
  const clusters = useMemo(
    () => (viewport && !zoomedIn && cities.data ? clusterCities(cities.data, viewport.zoom, viewport.bounds, MIN_ZOOM) : []),
    [viewport, zoomedIn, cities.data],
  );
  const clusterPlaces = clusters.reduce((sum, c) => sum + c.count, 0);
  const openCluster = (c: MapCluster) => mapRef.current?.flyTo(c.target, c.target.zoom);

  const filterNow = timeFilter ? now : null;
  const visible = useMemo(() => {
    if (!zoomedIn) return [];
    const shown = places.filter((p) => !hidden.has(p.category) && (!reviewed || p.review_count > 0));
    if (!filterNow) return shown;
    // The server filtered when the area loaded; drop places that closed since.
    const minutes = new Map<string | null, number | null>();
    const minuteIn = (tz: string | null) => {
      if (!minutes.has(tz)) minutes.set(tz, localWeekMinute(filterNow, tz));
      return minutes.get(tz) ?? null;
    };
    return shown.filter((p) => matchesTimeFilter(p.hours, p.laptop_hours, p.category, minuteIn(p.timezone), { openNow, workNow }));
  }, [zoomedIn, places, hidden, reviewed, filterNow, openNow, workNow]);
  const mineQuery = useQuery(`my-reviewed-places:${user?.id}`, () => getMyReviewedPlaces(user!.id), Boolean(user) && isSupabaseConfigured);
  const refetchMine = mineQuery.refetch;
  useFocusEffect(
    useCallback(() => {
      if (user) void refetchMine(true);
    }, [user, refetchMine]),
  );
  const mine = mineQuery.data;
  const markers = useMemo(
    () =>
      visible.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, category: p.category, name: p.name, mine: mine?.get(p.id) })),
    [visible, mine],
  );
  const selected = visible.find((p) => p.id === selectedId) ?? null;
  const areaCity = selected?.city ?? mostCommonCity(visible);
  const suggestTarget: SuggestTarget = { city: areaCity?.slug };

  const requestLocation = location.request;
  const locate = async () => {
    const here = await requestLocation();
    if (here) mapRef.current?.flyTo(here, NEAR_ME_ZOOM);
  };

  // Opening the map without a place to look at means "show me what is around me".
  const autoLocated = useRef(false);
  useEffect(() => {
    if (initial.preset || autoLocated.current) return;
    autoLocated.current = true;
    requestLocation().then((here: LatLng | null) => {
      if (here) mapRef.current?.flyTo(here, NEAR_ME_ZOOM);
    });
  }, [initial.preset, requestLocation]);

  const status = !isSupabaseConfigured
    ? strings.common.backendNotConfigured
    : !zoomedIn
      ? cities.loading
        ? strings.map.loading
        : clusters.length > 0
          ? strings.map.overview(clusterPlaces)
          : strings.map.zoomIn
      : loading && places.length === 0
        ? strings.map.loading
        : visible.length >= LIMIT
          ? strings.map.countCapped(LIMIT)
          : reviewed
            ? strings.map.countReviewed(visible.length)
            : strings.map.count(visible.length);
  const empty = zoomedIn && !loading && visible.length === 0;

  return (
    <View style={styles.root}>
      <Head>
        <title>{`${strings.map.title} · Cosurfing`}</title>
      </Head>
      <PlacesMap
        ref={mapRef}
        center={initial.center}
        zoom={initial.zoom}
        markers={markers}
        clusters={clusters}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onClusterPress={openCluster}
        userLocation={location.location}
        onMoveEnd={setViewport}
        showControls={isDesktop}
        style={StyleSheet.absoluteFill}
      />
      <SiteHeader back />

      <View pointerEvents="box-none" style={styles.overlayTop}>
        <SiteHeaderSpacer />
        <View pointerEvents="box-none" style={styles.topRow}>
          <Glass variant="strong" style={styles.status}>
            {loading ? <ActivityIndicator size="small" color={colors.accent} /> : <Icon name="map" size={14} color={colors.textMuted} />}
            <Text variant="smallStrong" numberOfLines={2} style={styles.statusText}>
              {status}
            </Text>
          </Glass>
          <Button
            title={location.status === 'loading' ? strings.map.locating : strings.map.nearMe}
            icon="navigation"
            variant="secondary"
            size="sm"
            loading={location.status === 'loading'}
            onPress={() => void locate()}
          />
        </View>
        {zoomedIn ? (
          <View pointerEvents="box-none" style={styles.legend}>
            {CATEGORIES.map((category) => (
              <LegendChip
                key={category}
                category={category}
                shown={!hidden.has(category)}
                onPress={() => toggleCategory(category)}
              />
            ))}
            <Chip label={strings.explore.reviewed} icon="star" selected={reviewed} onPress={() => setReviewed(!reviewed)} />
            <Chip label={strings.hours.filterOpenNow} icon="clock" selected={openNow} onPress={() => setOpenNow(!openNow)} />
            <Chip label={strings.hours.filterWorkNow} icon="monitor" selected={workNow} onPress={() => setWorkNow(!workNow)} />
          </View>
        ) : null}
        {zoomedIn && workNow ? <Notice tone="info" body={strings.hours.filterWorkNowHint} style={styles.notice} /> : null}
        {zoomedIn && shownCategories.length === 0 ? (
          <Notice tone="info" body={strings.map.allHidden} style={styles.notice} />
        ) : null}
        {selected?.category === 'coliving' ? (
          <Notice tone="warning" body={strings.map.colivingsHint} style={styles.notice} />
        ) : null}
        {location.message ? <Notice tone="warning" body={location.message} style={styles.notice} /> : null}
        {error ? <Notice tone="danger" body={error} style={styles.notice} /> : null}
      </View>

      <View pointerEvents="box-none" style={[styles.overlayBottom, { paddingBottom: insets.bottom + spacing.lg }]}>
        {selected ? (
          <Glass variant="strong" style={styles.sheet}>
            <Pressable
              onPress={() => router.push(`/place/${selected.slug}`)}
              accessibilityRole="link"
              accessibilityLabel={selected.name}
              style={styles.placeRow}
            >
              <ScoreBadge score={selected.work_score} size="md" />
              <View style={styles.placeText}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {selected.name}
                </Text>
                <View style={styles.placeMeta}>
                  <CategoryBadge category={selected.category} />
                  <Text variant="caption" tone="muted" numberOfLines={1} style={styles.placeMetaText}>
                    {[
                      location.location ? formatDistance(distanceKm(location.location, selected)) : null,
                      selected.review_count > 0 ? strings.ranking.reviews(selected.review_count) : strings.map.provisional,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                {selected.address ? (
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {selected.address}
                  </Text>
                ) : null}
                <HoursStatusLine
                  hours={selected.hours}
                  laptop={selected.laptop_hours}
                  category={selected.category}
                  timezone={selected.timezone}
                  now={now}
                  showWork={workNow || selected.laptop_hours !== null}
                />
              </View>
              <Icon name="chevron-right" size={20} color={colors.textMuted} />
            </Pressable>
            <IconButton
              icon="x"
              accessibilityLabel={strings.common.close}
              onPress={() => setSelectedId(null)}
              size={32}
              style={styles.close}
            />
          </Glass>
        ) : (
          <Glass variant="strong" style={styles.sheet}>
            <View style={styles.suggestText}>
              <Text variant="bodyStrong">
                {empty ? (reviewed ? strings.map.reviewedEmptyTitle : strings.map.emptyTitle) : strings.map.missingHere}
              </Text>
              <Text variant="small" tone="muted">
                {empty ? (reviewed ? strings.map.reviewedEmptyBody : strings.map.emptyBody) : strings.suggestCta.searchMissBody}
              </Text>
            </View>
            <Button title={strings.map.addPlace} icon="plus" onPress={() => router.push(suggestRoute(suggestTarget))} />
          </Glass>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgMuted,
  },
  overlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    alignItems: 'center',
  },
  topRow: {
    width: '100%',
    maxWidth: 720,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  status: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  statusText: {
    flexShrink: 1,
  },
  notice: {
    width: '100%',
    maxWidth: 720,
  },
  legend: {
    width: '100%',
    maxWidth: 720,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  legendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingLeft: 5,
    paddingRight: spacing.sm + 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  legendDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendLabelOff: {
    textDecorationLine: 'line-through',
  },
  overlayBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  placeRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minWidth: 0,
  },
  placeText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  placeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  placeMetaText: {
    flexShrink: 1,
  },
  close: {
    alignSelf: 'flex-start',
  },
  suggestText: {
    flex: 1,
    minWidth: 200,
    gap: 2,
  },
});
