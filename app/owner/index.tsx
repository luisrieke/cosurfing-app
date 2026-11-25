import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AdminList, AdminRow } from '@/components/admin/AdminShell';
import { RequireAuth } from '@/components/RequireAuth';
import { Badge, Notice, Screen, Skeleton, Text, TopBar } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { getMyOwnedPlaces } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { spacing } from '@/lib/theme';

export default function OwnerHomeRoute() {
  return (
    <RequireAuth title={strings.owner.areaTitle} message={strings.owner.signIn} redirect="/owner">
      <OwnerHome />
    </RequireAuth>
  );
}

function OwnerHome() {
  const router = useRouter();
  const { user } = useAuth();
  const o = strings.owner;
  const places = useQuery(`owned-places:${user?.id}`, getMyOwnedPlaces, Boolean(user));

  return (
    <Screen>
      <Head>
        <title>{`${o.areaTitle} · Cosurfing`}</title>
      </Head>
      <TopBar title={o.areaTitle} onBack={() => (router.canGoBack() ? router.back() : router.replace('/account'))} />
      <Text tone="muted">{o.areaIntro}</Text>
      {places.error ? <Notice tone="danger" body={places.error.message} /> : null}
      {places.loading && !places.data ? (
        <Skeleton height={72} />
      ) : (places.data ?? []).length === 0 ? (
        <Notice tone="info" body={o.none} />
      ) : (
        <View style={styles.list}>
          <AdminList>
            {(places.data ?? []).map((p) => (
              <AdminRow
                key={p.id}
                icon="map-pin"
                title={p.name}
                subtitle={p.city_name}
                meta={p.status !== 'published' ? <Badge label={o.statusHidden} tone="warning" /> : null}
                onPress={() => router.push(`/owner/${p.id}`)}
              />
            ))}
          </AdminList>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingTop: spacing.sm,
  },
});
