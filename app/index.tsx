import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CitySearch } from '@/components/CitySearch';
import { Card, Icon, IconButton, Notice, Screen, Skeleton, Text } from '@/components/ui';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/env';
import { getActiveCities } from '@/lib/queries';
import { requireSupabase } from '@/lib/supabase';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import type { City } from '@/lib/types';

async function loadHome() {
  const cities = await getActiveCities();
  const { data } = await requireSupabase()
    .from('places')
    .select('city_id, category')
    .eq('status', 'published');
  const counts = new Map<string, { coworking: number; cafe: number }>();
  for (const row of data ?? []) {
    const entry = counts.get(row.city_id) ?? { coworking: 0, cafe: 0 };
    if (row.category === 'coworking') entry.coworking += 1;
    else entry.cafe += 1;
    counts.set(row.city_id, entry);
  }
  return { cities, counts };
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useBreakpoint();
  const { user } = useAuth();
  const { data, loading, error, refetch } = useQuery('home', loadHome, isSupabaseConfigured);
  const cities = data?.cities ?? [];

  const goToCity = (city: City) => router.push(`/${city.slug}`);

  return (
    <Screen contentStyle={{ paddingTop: insets.top + spacing.lg }}>
      <Head>
        <title>Cosurfing · Find great places to work</title>
        <meta name="description" content="Coworking spaces and laptop-friendly cafés in Berlin and Parga. More cities coming soon." />
      </Head>
      <View style={styles.brandRow}>
        <View style={styles.brand}>
          <View style={styles.brandDot} />
          <Text variant="heading">{strings.app.name}</Text>
        </View>
        <IconButton
          icon={user ? 'user' : 'log-in'}
          accessibilityLabel={user ? strings.common.account : strings.common.signIn}
          onPress={() => router.push(user ? '/account' : '/auth/sign-in')}
        />
      </View>

      <View style={[styles.hero, isDesktop && styles.heroDesktop]}>
        <Text variant={isDesktop ? 'display' : 'title'}>{strings.home.title}</Text>
        <Text tone="muted">{strings.home.subtitle}</Text>
      </View>

      {!isSupabaseConfigured ? <Notice tone="warning" body={strings.common.backendNotConfigured} /> : null}

      <CitySearch
        activeCities={cities}
        onSelectActive={goToCity}
        onSelectOther={(r) =>
          router.push({
            pathname: '/waitlist',
            params: {
              city: r.name,
              country: r.countryName,
              countryCode: r.countryCode,
              lat: String(r.lat),
              lng: String(r.lng),
            },
          })
        }
        onManual={(q) => router.push({ pathname: '/waitlist', params: { city: q } })}
      />

      <View style={styles.section}>
        <Text variant="caption" tone="muted" style={styles.sectionLabel}>
          {strings.home.activeCities.toUpperCase()}
        </Text>
        {loading ? (
          <View style={styles.cityGrid}>
            <Skeleton height={112} style={styles.cityCardSkeleton} />
            <Skeleton height={112} style={styles.cityCardSkeleton} />
          </View>
        ) : error ? (
          <Notice tone="danger" body={error.message}>
            <Pressable onPress={() => refetch()} accessibilityRole="button">
              <Text variant="smallStrong" tone="accent">
                {strings.common.retry}
              </Text>
            </Pressable>
          </Notice>
        ) : (
          <View style={[styles.cityGrid, isDesktop && styles.cityGridDesktop]}>
            {cities.map((city) => {
              const c = data?.counts.get(city.id) ?? { coworking: 0, cafe: 0 };
              return (
                <Card key={city.id} onPress={() => goToCity(city)} style={styles.cityCard}>
                  <View style={styles.cityCardTop}>
                    <View>
                      <Text variant="title">{city.name}</Text>
                      <Text variant="small" tone="muted">
                        {city.country_name}
                      </Text>
                    </View>
                    <View style={styles.cityArrow}>
                      <Icon name="arrow-right" size={18} color={colors.onAccent} />
                    </View>
                  </View>
                  <View style={styles.cityStats}>
                    <View style={styles.cityStat}>
                      <Icon name="briefcase" size={14} color={colors.coworking} />
                      <Text variant="small" tone="muted">
                        {c.coworking} {strings.explore.coworking.toLowerCase()}
                      </Text>
                    </View>
                    <View style={styles.cityStat}>
                      <Icon name="coffee" size={14} color={colors.cafe} />
                      <Text variant="small" tone="muted">
                        {c.cafe} {c.cafe === 1 ? 'café' : 'cafés'}
                      </Text>
                    </View>
                  </View>
                </Card>
              );
            })}
          </View>
        )}
        <Text variant="small" tone="muted">
          {strings.home.searchHint}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  brandDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent,
  },
  hero: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  heroDesktop: {
    paddingVertical: spacing.xl,
  },
  section: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  sectionLabel: {
    letterSpacing: 1,
  },
  cityGrid: {
    gap: spacing.md,
  },
  cityGridDesktop: {
    flexDirection: 'row',
  },
  cityCard: {
    flex: 1,
    gap: spacing.lg,
  },
  cityCardSkeleton: {
    borderRadius: radius.lg,
  },
  cityCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cityArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cityStats: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  cityStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
