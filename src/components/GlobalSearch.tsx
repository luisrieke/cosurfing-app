import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { ScoreBadge } from '@/components/ScoreBadge';
import { SearchField } from '@/components/SearchField';
import { categoryIcon, Glass, Icon, Text } from '@/components/ui';
import { pinColor } from '@/components/map/pinSvg';
import { useDebounced } from '@/hooks/useDebounced';
import { useListNavigation } from '@/hooks/useListNavigation';
import { useQuery } from '@/hooks/useQuery';
import { isSupabaseConfigured } from '@/lib/env';
import { listCities, searchPlaces } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, radius, shadow, spacing } from '@/lib/theme';
import type { CityListItem, PlaceSearchResult } from '@/lib/types';

const MAX_CITIES = 4;
const MAX_PLACES = 6;

interface GlobalSearchProps {
  onSelectCity: (city: CityListItem) => void;
  onSelectPlace: (place: PlaceSearchResult) => void;
  /** Called on every keystroke, for screens that also filter a list by the same text. */
  onChangeQuery?: (query: string) => void;
  placeholder?: string;
  large?: boolean;
  style?: ViewStyle;
}

type Row = { kind: 'city'; city: CityListItem } | { kind: 'place'; place: PlaceSearchResult };

/**
 * One search field for cities and places. Results drop down in two groups; picking one hands it to the
 * screen, which decides what to do (fly the map there, open the page, ...). Enter picks the first result.
 */
export function GlobalSearch({ onSelectCity, onSelectPlace, onChangeQuery, placeholder, large, style }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const q = useDebounced(query.trim(), 200);
  const searchable = q.length >= 2 && isSupabaseConfigured;

  const cities = useQuery(
    `global-search-cities:${q}`,
    () => listCities({ q, sort: 'population', limit: MAX_CITIES, offset: 0 }),
    searchable,
  );
  const places = useQuery(`global-search-places:${q}`, () => searchPlaces(q, MAX_PLACES), searchable);

  useEffect(
    () => () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    },
    [],
  );

  const cityRows = searchable ? (cities.data?.items ?? []) : [];
  const placeRows = searchable ? (places.data ?? []) : [];
  const rows: Row[] = [
    ...cityRows.map((city): Row => ({ kind: 'city', city })),
    ...placeRows.map((place): Row => ({ kind: 'place', place })),
  ];
  const loading = searchable && (cities.loading || places.loading);
  const typing = query.trim().length >= 2;
  // Results of an older query stay visible until the new ones arrive, so the list does not flicker.
  const show = open && typing;

  const change = (text: string) => {
    setQuery(text);
    setOpen(true);
    onChangeQuery?.(text);
  };

  const reset = () => {
    setQuery('');
    setOpen(false);
    onChangeQuery?.('');
  };

  const pick = (row: Row) => {
    if (row.kind === 'city') onSelectCity(row.city);
    else onSelectPlace(row.place);
    reset();
  };

  const nav = useListNavigation({
    items: rows,
    getKey: (row) => (row.kind === 'city' ? `city:${row.city.id}` : `place:${row.place.id}`),
    onPick: pick,
    onClose: () => setOpen(false),
  });

  return (
    <View style={[styles.wrap, style]}>
      <SearchField
        value={query}
        onChangeText={change}
        placeholder={placeholder ?? strings.globalSearch.placeholder}
        large={large}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setOpen(true);
        }}
        // Delayed, so a tap on a result still lands before the list closes.
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        onKeyPress={(e) => {
          if (e.nativeEvent.key === 'ArrowDown' || e.nativeEvent.key === 'ArrowUp') setOpen(true);
          nav.onKeyPress(e);
        }}
        onSubmit={() => {
          if (nav.pickActive()) return;
          const first = rows[0];
          if (first) pick(first);
        }}
      />
      {show ? (
        <Glass variant="strong" style={[styles.dropdown, large && styles.dropdownLarge]}>
          {cityRows.length > 0 ? <Text variant="caption" tone="muted" style={styles.group}>{strings.globalSearch.cities}</Text> : null}
          {cityRows.map((city, i) => (
            <Pressable
              key={city.id}
              onPress={() => pick({ kind: 'city', city })}
              onHoverIn={() => nav.setActive(i)}
              accessibilityRole="button"
              accessibilityLabel={`${city.name}, ${city.country_name}`}
              accessibilityState={{ selected: nav.active === i }}
              style={({ pressed }) => [styles.row, (pressed || nav.active === i) && styles.pressed]}
            >
              <View style={styles.iconBox}>
                <Icon name="map-pin" size={16} color={colors.textMuted} />
              </View>
              <View style={styles.rowText}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {city.name}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {strings.globalSearch.cityMeta(city.country_name, city.place_count)}
                </Text>
              </View>
            </Pressable>
          ))}
          {placeRows.length > 0 ? <Text variant="caption" tone="muted" style={styles.group}>{strings.globalSearch.places}</Text> : null}
          {placeRows.map((place, j) => {
            const i = cityRows.length + j;
            return (
              <Pressable
                key={place.id}
                onPress={() => pick({ kind: 'place', place })}
                onHoverIn={() => nav.setActive(i)}
                accessibilityRole="button"
                accessibilityLabel={`${place.name}, ${place.city_name}`}
                accessibilityState={{ selected: nav.active === i }}
                style={({ pressed }) => [styles.row, (pressed || nav.active === i) && styles.pressed]}
              >
                <View style={[styles.iconBox, { backgroundColor: `${pinColor(place.category)}22` }]}>
                  <Icon name={categoryIcon(place.category)} size={16} color={pinColor(place.category)} />
                </View>
                <View style={styles.rowText}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {place.name}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {strings.globalSearch.placeMeta(place.city_name, place.country_name)}
                  </Text>
                </View>
                {place.review_count > 0 ? <ScoreBadge score={place.work_score} size="sm" /> : null}
              </Pressable>
            );
          })}
          {rows.length === 0 ? (
            loading ? (
              <View style={styles.status}>
                <ActivityIndicator size="small" color={colors.accent} />
              </View>
            ) : (
              <Text variant="small" tone="muted" style={styles.status}>
                {strings.globalSearch.noMatch}
              </Text>
            )
          ) : null}
        </Glass>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    // Above the content that follows, so the list is never covered by it.
    zIndex: 20,
  },
  dropdown: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    maxHeight: 460,
    overflow: 'hidden',
    // Solid, so the map and the controls behind it do not show through the results.
    backgroundColor: colors.surface,
    ...(shadow.card as object),
  },
  dropdownLarge: {
    top: 64,
  },
  group: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pressed: {
    backgroundColor: colors.bgSubtle,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bgMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  status: {
    padding: spacing.md,
    alignItems: 'center',
  },
});
