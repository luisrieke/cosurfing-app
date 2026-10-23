import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AdminList, AdminRow, AdminShell } from '@/components/admin/AdminShell';
import { Badge, Notice, Text } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { env } from '@/lib/env';
import { adminGetCounts } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { spacing } from '@/lib/theme';

export default function AdminHome() {
  const router = useRouter();
  const { isAdmin, user } = useAuth();
  const counts = useQuery(`admin-counts:${user?.id}`, adminGetCounts, isAdmin);

  return (
    <AdminShell title={strings.admin.title} backTo="/account">
      <Head>
        <title>Admin · Cosurfing</title>
      </Head>
      {counts.error ? <Notice tone="danger" body={counts.error.message} /> : null}
      {env.showExamplePlaces ? (
        <Notice tone="warning" title={strings.common.example} body="EXPO_PUBLIC_SHOW_EXAMPLE_PLACES is on: example places are visible to visitors of this build." />
      ) : null}
      <AdminList>
        <AdminRow
          icon="map-pin"
          title={strings.admin.places}
          subtitle="Create, edit, publish and photograph places"
          meta={counts.data && counts.data.drafts > 0 ? <Badge label={`${counts.data.drafts} ${strings.admin.draft.toLowerCase()}`} tone="warning" /> : null}
          onPress={() => router.push('/admin/places')}
        />
        <AdminRow
          icon="inbox"
          title={strings.admin.suggestions}
          subtitle="Places suggested by users"
          meta={counts.data && counts.data.suggestions > 0 ? <Badge label={`${counts.data.suggestions} ${strings.admin.pending}`} tone="accent" /> : null}
          onPress={() => router.push('/admin/suggestions')}
        />
        <AdminRow
          icon="flag"
          title={strings.admin.reports}
          subtitle="Wrong information reported by users"
          meta={counts.data && counts.data.reports > 0 ? <Badge label={`${counts.data.reports} open`} tone="danger" /> : null}
          onPress={() => router.push('/admin/reports')}
        />
        <AdminRow icon="message-square" title={strings.admin.reviews} subtitle="Hide or restore reviews" onPress={() => router.push('/admin/reviews')} />
        <AdminRow icon="mail" title={strings.admin.waitlist} subtitle="Entries per city, CSV export, email retries" onPress={() => router.push('/admin/waitlist')} />
        <AdminRow icon="globe" title={strings.admin.cities} subtitle="Activate cities and clean up example data" onPress={() => router.push('/admin/cities')} />
      </AdminList>
      <View style={styles.footer}>
        <Text variant="caption" tone="faint">
          Signed in as {user?.email}
        </Text>
      </View>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingTop: spacing.sm,
  },
});
