import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { type FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/BottomSheet';
import { FilterBar } from '@/components/FilterBar';
import { type MapHandle, type MapMarker, PlacesMap } from '@/components/map';
import { PlaceCard } from '@/components/PlaceCard';
import { Icon, IconButton, Notice, Text } from '@/components/ui';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useQuery } from '@/hooks/useQuery';
import { useUserLocation } from '@/hooks/useUserLocation';
import { useAuth } from '@/lib/auth';
import { distanceKm } from '@/lib/geo';
import { getPlacesForCity } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, layout, radius, shadow, spacing } from '@/lib/theme';
import { type City, defaultFilters, type PlaceFilters, type PublicPlace } from '@/lib/types';

import { PlaceList } from './PlaceList';

interface ExploreScreenProps {
  city: City;
}

const COLLAPSED = 96;
const PEEK_WITH_CARD = 196;

export function ExploreScreen({ city }: ExploreScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDesktop, height: windowHeight } = useBreakpoint();
  const { user, isPlus, isAdmin } = useAuth();
  const [filters, setFilters] = useState<PlaceFilters>(defaultFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [containerHeight, setContainerHeight] = useState(windowHeight);
  const mapRef = useRef<MapHandle>(null);
  const listRef = useRef<FlatList<unknown>>(null);
  const userLoc = useUserLocation();

  const canSeeCafePhotos = isPlus || isAdmin;
  const filterKey = `${filters.category}|${filters.wifi}|${filters.power}|${filters.calls}`;
  const placesQuery = useQuery(
    `places:${city.id}:${filterKey}:${canSeeCafePhotos}`,
    () => getPlacesForCity(city.id, filters, canSeeCafePhotos),
  );

  const places = useMemo(() => {
    const list = placesQuery.data ?? [];
    if (!userLoc.location) return list;
    const loc = userLoc.location;
    return [...list].sort((a, b) => distanceKm(loc, a) - distanceKm(loc, b));
  }, [placesQuery.data, userLoc.location]);

  const markers = useMemo<MapMarker[]>(
    () => places.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, category: p.category, name: p.name })),
    [places],
  );

  // A selection that no longer matches the filters is simply treated as "nothing selected".
  const selected = useMemo(() => places.find((p) => p.id === selectedId) ?? null, [places, selectedId]);
  const hasFilters = filterKey !== `${defaultFilters.category}|false|false|false`;

  const handleSelectMarker = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (!id) return;
      const place = places.find((p) => p.id === id);
      if (!place) return;
      if (isDesktop) {
        mapRef.current?.flyTo(place, undefined, 0);
        const index = places.findIndex((p) => p.id === id);
        if (index >= 0) listRef.current?.scrollToIndex?.({ index: index >= 2 ? index + 1 : index, animated: true, viewPosition: 0.2 });
      } else {
        setSheetIndex(0);
        mapRef.current?.flyTo(place, undefined, PEEK_WITH_CARD / 2);
      }
    },
    [places, isDesktop],
  );

  const openPlace = useCallback(
    (place: PublicPlace) => {
      router.push(`/place/${place.slug}`);
    },
    [router],
  );

  const handleNearMe = useCallback(async () => {
    const loc = userLoc.location ?? (await userLoc.request());
    if (loc) mapRef.current?.flyTo(loc, 14, isDesktop ? 0 : COLLAPSED / 2);
  }, [userLoc, isDesktop]);

  const goHome = () => router.replace('/');
  const goAccount = () => router.push(user ? '/account' : '/auth/sign-in');
  const goSuggest = () => router.push({ pathname: '/suggest', params: { city: city.slug } });

  const summary = placesQuery.loading && !placesQuery.data
    ? strings.common.loading
    : `${strings.home.placesCount(places.length)} · ${city.name}`;

  const head = (
    <Head>
      <title>{`Places to work in ${city.name} · Cosurfing`}</title>
      <meta name="description" content={`Coworking spaces and laptop-friendly cafés in ${city.name}.`} />
    </Head>
  );

  const locationNotice = userLoc.message ? (
    <Notice tone="warning" body={userLoc.message} style={styles.notice} />
  ) : null;

  if (isDesktop) {
    return (
      <View style={styles.desktopRoot}>
        {head}
        <View style={[styles.sidebar, { paddingTop: insets.top }]}>
          <View style={styles.sidebarHeader}>
            <IconButton icon="arrow-left" accessibilityLabel={strings.common.back} onPress={goHome} />
            <View style={styles.sidebarTitle}>
              <Text variant="title">{city.name}</Text>
              <Text variant="small" tone="muted">
                {city.country_name}
              </Text>
            </View>
            <IconButton
              icon={user ? 'user' : 'log-in'}
              accessibilityLabel={user ? strings.common.account : strings.common.signIn}
              onPress={goAccount}
            />
          </View>
          <View style={styles.sidebarFilters}>
            <FilterBar filters={filters} onChange={setFilters} wrap />
          </View>
          <View style={styles.sidebarSummary}>
            <Text variant="smallStrong" tone="muted">
              {summary}
            </Text>
            <Pressable onPress={goSuggest} accessibilityRole="button" hitSlop={6}>
              <Text variant="smallStrong" tone="accent">
                {strings.explore.suggestPlace}
              </Text>
            </Pressable>
          </View>
          {locationNotice}
          <PlaceList
            ref={listRef as never}
            places={placesQuery.data ? places : undefined}
            loading={placesQuery.loading}
            error={placesQuery.error}
            onRetry={() => placesQuery.refetch()}
            userLocation={userLoc.location}
            selectedId={selectedId}
            onSelect={(p) => {
              if (selectedId === p.id) openPlace(p);
              else handleSelectMarker(p.id);
            }}
            onSuggest={goSuggest}
            hasFilters={hasFilters}
            cityName={city.name}
          />
        </View>
        <View style={styles.desktopMap}>
          <PlacesMap
            ref={mapRef}
            center={{ lat: city.lat, lng: city.lng }}
            zoom={city.zoom}
            markers={markers}
            selectedId={selectedId}
            onSelect={handleSelectMarker}
            userLocation={userLoc.location}
            showControls
          />
          <View style={[styles.desktopFabs, { top: 110 + insets.top }]}>
            <IconButton
              icon="crosshair"
              accessibilityLabel={strings.explore.nearMe}
              onPress={handleNearMe}
              disabled={userLoc.status === 'loading'}
              style={styles.fab}
            />
            <IconButton
              icon="maximize-2"
              accessibilityLabel={strings.explore.recenter}
              onPress={() => mapRef.current?.fitMarkers({ top: 80, right: 80, bottom: 80, left: 80 })}
              style={styles.fab}
            />
          </View>
          {selected ? (
            <View style={styles.desktopSelected}>
              <PlaceCard place={selected} onPress={() => openPlace(selected)} />
              <Pressable style={styles.desktopSelectedClose} onPress={() => setSelectedId(null)} accessibilityLabel={strings.common.close}>
                <Icon name="x" size={16} color={colors.textMuted} />
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  const bottomInset = insets.bottom;
  const collapsedHeight = (selected ? PEEK_WITH_CARD : COLLAPSED) + bottomInset;
  const snapPoints = [collapsedHeight, Math.round(containerHeight * 0.5), containerHeight - insets.top - 72];
  const isFull = sheetIndex === 2;

  return (
    <View style={styles.mobileRoot} onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}>
      {head}
      <PlacesMap
        ref={mapRef}
        center={{ lat: city.lat, lng: city.lng }}
        zoom={city.zoom}
        markers={markers}
        selectedId={selectedId}
        onSelect={handleSelectMarker}
        userLocation={userLoc.location}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.overlayTop, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
        <View style={styles.overlayRow} pointerEvents="box-none">
          <IconButton icon="arrow-left" accessibilityLabel={strings.common.back} onPress={goHome} style={styles.floating} />
          <Pressable onPress={goHome} style={styles.cityPill} accessibilityRole="button" accessibilityLabel={city.name}>
            <Icon name="map-pin" size={14} color={colors.accent} />
            <Text variant="smallStrong">{city.name}</Text>
            <Icon name="chevron-down" size={14} color={colors.textMuted} />
          </Pressable>
          <IconButton
            icon={user ? 'user' : 'log-in'}
            accessibilityLabel={user ? strings.common.account : strings.common.signIn}
            onPress={goAccount}
            style={styles.floating}
          />
        </View>
        <View style={styles.filtersRow} pointerEvents="box-none">
          <FilterBar filters={filters} onChange={setFilters} />
        </View>
        {locationNotice ? <View style={styles.noticeWrap}>{locationNotice}</View> : null}
      </View>

      {!isFull ? (
        <View style={[styles.mobileFabs, { bottom: collapsedHeight + spacing.lg }]} pointerEvents="box-none">
          <IconButton
            icon="crosshair"
            accessibilityLabel={strings.explore.nearMe}
            onPress={handleNearMe}
            disabled={userLoc.status === 'loading'}
            style={styles.fab}
          />
        </View>
      ) : null}

      <BottomSheet
        snapPoints={snapPoints}
        index={sheetIndex}
        onIndexChange={setSheetIndex}
        containerHeight={containerHeight}
        header={
          <View style={styles.sheetHeader}>
            {selected ? (
              <View style={styles.selectedWrap}>
                <PlaceCard place={selected} onPress={() => openPlace(selected)} compact
                  distanceKm={userLoc.location ? distanceKm(userLoc.location, selected) : null}
                />
                <Pressable style={styles.selectedClose} onPress={() => setSelectedId(null)} accessibilityLabel={strings.common.close} hitSlop={8}>
                  <Icon name="x" size={16} color={colors.textMuted} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.summaryRow}>
                <Text variant="bodyStrong">{summary}</Text>
                <Pressable onPress={goSuggest} accessibilityRole="button" hitSlop={6}>
                  <Text variant="smallStrong" tone="accent">
                    {strings.explore.suggestPlace}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        }
      >
        <PlaceList
          places={placesQuery.data ? places : undefined}
          loading={placesQuery.loading}
          error={placesQuery.error}
          onRetry={() => placesQuery.refetch()}
          userLocation={userLoc.location}
          selectedId={selectedId}
          onSelect={openPlace}
          onSuggest={goSuggest}
          hasFilters={hasFilters}
          cityName={city.name}
          contentContainerStyle={{ paddingBottom: bottomInset + 88 }}
        />
      </BottomSheet>

      {/* Collapsed: float above the sheet next to the map controls. Expanded: pin to the screen bottom over the list. */}
      <View
        style={[styles.togglePill, { bottom: (sheetIndex === 0 ? collapsedHeight : bottomInset) + spacing.lg }]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={() => setSheetIndex(isFull ? 0 : 2)}
          style={({ pressed }) => [styles.toggle, pressed && { opacity: 0.9 }]}
          accessibilityRole="button"
          accessibilityLabel={isFull ? strings.explore.showMap : strings.explore.showList}
        >
          <Icon name={isFull ? 'map' : 'list'} size={16} color={colors.onAccent} />
          <Text variant="smallStrong" tone="inverse">
            {isFull ? strings.explore.map : strings.explore.list}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mobileRoot: {
    flex: 1,
    backgroundColor: colors.bgMuted,
  },
  overlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    gap: spacing.sm,
  },
  overlayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  floating: {
    ...(shadow.card as object),
  },
  cityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    ...(shadow.card as object),
  },
  filtersRow: {},
  noticeWrap: {
    paddingHorizontal: spacing.lg,
  },
  notice: {
    marginBottom: spacing.sm,
  },
  mobileFabs: {
    position: 'absolute',
    right: spacing.lg,
    gap: spacing.sm,
  },
  fab: {
    ...(shadow.card as object),
  },
  sheetHeader: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  selectedWrap: {
    paddingTop: spacing.xs,
  },
  selectedClose: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgMuted,
  },
  togglePill: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 44,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
    ...(shadow.card as object),
  },
  desktopRoot: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.bg,
  },
  sidebar: {
    width: layout.sidebarWidth,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: colors.bg,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sidebarTitle: {
    flex: 1,
  },
  sidebarFilters: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  sidebarSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  desktopMap: {
    flex: 1,
  },
  desktopFabs: {
    position: 'absolute',
    right: 10,
    gap: spacing.sm,
  },
  desktopSelected: {
    position: 'absolute',
    left: spacing.xl,
    bottom: spacing.xl,
    width: 380,
    ...(shadow.card as object),
  },
  desktopSelectedClose: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgMuted,
  },
});
