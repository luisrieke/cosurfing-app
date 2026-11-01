import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CityRankingScreen } from '@/components/city/CityRankingScreen';
import { ErrorState, Notice, Skeleton, TopBar } from '@/components/ui';
import { WaitlistScreen } from '@/components/waitlist/WaitlistScreen';
import { useQuery } from '@/hooks/useQuery';
import { isSupabaseConfigured } from '@/lib/env';
import { titleFromSlug } from '@/lib/format';
import { getCityBySlug } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { spacing } from '@/lib/theme';

export default function CityRoute() {
  const { city: slug } = useLocalSearchParams<{ city: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cityQuery = useQuery(`city:${slug}`, () => getCityBySlug(slug!), Boolean(slug) && isSupabaseConfigured);
  const refetch = cityQuery.refetch;
  const refreshCity = useCallback(() => refetch(true), [refetch]);

  if (!isSupabaseConfigured) {
    return (
      <View style={styles.root}>
        <TopBar title={titleFromSlug(slug ?? '')} onBack={() => router.replace('/')} />
        <Notice tone="warning" body={strings.common.backendNotConfigured} style={styles.notice} />
      </View>
    );
  }

  if (cityQuery.loading && !cityQuery.data) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.skeletons}>
          <Skeleton height={220} />
          <Skeleton width="60%" height={28} />
          <Skeleton height={96} />
          <Skeleton height={96} />
        </View>
      </View>
    );
  }

  if (cityQuery.error && !cityQuery.data) {
    return (
      <View style={styles.root}>
        <TopBar title={titleFromSlug(slug ?? '')} onBack={() => router.replace('/')} />
        <ErrorState body={cityQuery.error.message} onAction={() => cityQuery.refetch()} />
      </View>
    );
  }

  const city = cityQuery.data ?? null;
  if (city && city.status === 'active') {
    return <CityRankingScreen city={city} onRefreshCity={refreshCity} />;
  }
  // Unknown slug or a city that is still on the waiting list.
  return <WaitlistScreen city={city} cityName={city?.name ?? titleFromSlug(slug ?? '')} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  notice: {
    margin: spacing.lg,
  },
  skeletons: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
});
