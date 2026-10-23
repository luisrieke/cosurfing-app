import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExploreScreen } from '@/components/explore/ExploreScreen';
import { ErrorState, Notice, Skeleton, TopBar } from '@/components/ui';
import { WaitlistScreen } from '@/components/waitlist/WaitlistScreen';
import { useQuery } from '@/hooks/useQuery';
import { isSupabaseConfigured } from '@/lib/env';
import { titleFromSlug } from '@/lib/format';
import { getCityBySlug } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, spacing } from '@/lib/theme';

export default function CityRoute() {
  const { city: slug } = useLocalSearchParams<{ city: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cityQuery = useQuery(`city:${slug}`, () => getCityBySlug(slug!), Boolean(slug) && isSupabaseConfigured);

  if (!isSupabaseConfigured) {
    return (
      <View style={styles.root}>
        <TopBar title={titleFromSlug(slug ?? '')} onBack={() => router.replace('/')} />
        <Notice tone="warning" body={strings.common.backendNotConfigured} style={styles.notice} />
      </View>
    );
  }

  if (cityQuery.loading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.skeletons}>
          <Skeleton width={120} height={28} />
          <Skeleton height={220} />
          <Skeleton width="80%" height={16} />
        </View>
      </View>
    );
  }

  if (cityQuery.error) {
    return (
      <View style={styles.root}>
        <TopBar title={titleFromSlug(slug ?? '')} onBack={() => router.replace('/')} />
        <ErrorState body={cityQuery.error.message} onAction={() => cityQuery.refetch()} />
      </View>
    );
  }

  const city = cityQuery.data ?? null;
  if (city && city.status === 'active') {
    return <ExploreScreen city={city} />;
  }
  // Unknown slug or a city that is still on the waiting list.
  return <WaitlistScreen city={city} cityName={city?.name ?? titleFromSlug(slug ?? '')} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  notice: {
    margin: spacing.lg,
  },
  skeletons: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
});
