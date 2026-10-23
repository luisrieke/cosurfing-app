import { forwardRef, useMemo } from 'react';
import { FlatList, StyleSheet, View, type ViewStyle } from 'react-native';

import { AdSlot } from '@/components/AdSlot';
import { PlaceCard } from '@/components/PlaceCard';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { distanceKm } from '@/lib/geo';
import { strings } from '@/lib/strings';
import { spacing } from '@/lib/theme';
import type { LatLng, PublicPlace } from '@/lib/types';

type Row = { type: 'place'; place: PublicPlace } | { type: 'ad' };

interface PlaceListProps {
  places: PublicPlace[] | undefined;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  userLocation: LatLng | null;
  selectedId: string | null;
  onSelect: (place: PublicPlace) => void;
  onSuggest: () => void;
  hasFilters: boolean;
  cityName: string;
  contentContainerStyle?: ViewStyle;
  header?: React.ReactElement | null;
}

export const PlaceList = forwardRef<FlatList<Row>, PlaceListProps>(function PlaceList(
  {
    places,
    loading,
    error,
    onRetry,
    userLocation,
    selectedId,
    onSelect,
    onSuggest,
    hasFilters,
    cityName,
    contentContainerStyle,
    header,
  },
  ref,
) {
  const rows = useMemo<Row[]>(() => {
    if (!places) return [];
    const list: Row[] = places.map((p) => ({ type: 'place', place: p }));
    if (list.length >= 2) list.splice(2, 0, { type: 'ad' });
    else list.push({ type: 'ad' });
    return list;
  }, [places]);

  if (loading && !places) {
    return (
      <View style={[styles.skeletons, contentContainerStyle]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.skeletonRow}>
            <Skeleton width={84} height={84} />
            <View style={styles.skeletonText}>
              <Skeleton width="70%" height={18} />
              <Skeleton width="40%" height={14} />
              <Skeleton width="90%" height={14} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (error) {
    return <ErrorState title={strings.explore.loadError} body={error.message} onAction={onRetry} />;
  }

  if (places && places.length === 0) {
    return hasFilters ? (
      <EmptyState
        icon="filter"
        title={strings.explore.emptyTitle}
        body={strings.explore.emptyBody}
        actionLabel={strings.explore.suggestPlace}
        onAction={onSuggest}
      />
    ) : (
      <EmptyState
        icon="map-pin"
        title={strings.explore.noPlacesTitle(cityName)}
        body={strings.explore.noPlacesBody}
        actionLabel={strings.explore.suggestPlace}
        onAction={onSuggest}
      />
    );
  }

  return (
    <FlatList
      ref={ref}
      data={rows}
      keyExtractor={(row, i) => (row.type === 'place' ? row.place.id : `ad-${i}`)}
      renderItem={({ item }) =>
        item.type === 'ad' ? (
          <AdSlot />
        ) : (
          <PlaceCard
            place={item.place}
            selected={item.place.id === selectedId}
            distanceKm={userLocation ? distanceKm(userLocation, item.place) : null}
            onPress={() => onSelect(item.place)}
          />
        )
      }
      ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
      ListHeaderComponent={header ?? undefined}
      contentContainerStyle={[styles.content, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      onScrollToIndexFailed={() => undefined}
    />
  );
});

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
  },
  skeletons: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  skeletonText: {
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
  },
});
