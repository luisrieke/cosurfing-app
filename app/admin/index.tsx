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
          icon="inbox"
          title={strings.admin.contributions}
          subtitle={strings.admin.contributionsHint}
          meta={counts.data && counts.data.contributions > 0 ? <Badge label={`${counts.data.contributions} ${strings.admin.pending}`} tone="accent" /> : null}
          onPress={() => router.push('/admin/contributions')}
        />
        <AdminRow
          icon="map-pin"
          title={strings.admin.places}
          subtitle="Create, edit, publish and photograph places"
          meta={counts.data && counts.data.drafts > 0 ? <Badge label={`${counts.data.drafts} ${strings.admin.draft.toLowerCase()}`} tone="warning" /> : null}
          onPress={() => router.push('/admin/places')}
        />
        <AdminRow
          icon="check-circle"
          title={strings.admin.verify}
          subtitle="Places with a parked or dead website, or reported as closed"
          meta={counts.data && counts.data.toVerify > 0 ? <Badge label={`${counts.data.toVerify} to check`} tone="danger" /> : null}
          onPress={() => router.push('/admin/verify')}
        />
        <AdminRow
          icon="mail"
          title={strings.admin.outreach}
          subtitle={strings.admin.outreachRow}
          meta={counts.data && counts.data.outreachOpen > 0 ? <Badge label={strings.admin.outreachOpen(counts.data.outreachOpen)} tone="accent" /> : null}
          onPress={() => router.push('/admin/outreach')}
        />
        <AdminRow
          icon="image"
          title={strings.admin.photos}
          subtitle="Approve photos uploaded by users"
          meta={counts.data && counts.data.pendingPhotos > 0 ? <Badge label={`${counts.data.pendingPhotos} ${strings.admin.pending}`} tone="accent" /> : null}
          onPress={() => router.push('/admin/photos')}
        />
        <AdminRow
          icon="camera"
          title={strings.admin.cityCovers}
          subtitle={strings.admin.cityCoversRow}
          meta={counts.data && counts.data.pendingCityCovers > 0 ? <Badge label={`${counts.data.pendingCityCovers} ${strings.admin.pending}`} tone="accent" /> : null}
          onPress={() => router.push('/admin/city-covers')}
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
        <AdminRow
          icon="coffee"
          title="Coffee program"
          subtitle="Review proof, approve and record coffee reimbursements"
          onPress={() => router.push('/admin/coffee')}
        />
        <AdminRow icon="message-square" title={strings.admin.reviews} subtitle="Hide or restore reviews" onPress={() => router.push('/admin/reviews')} />
        <AdminRow icon="mail" title={strings.admin.waitlist} subtitle="Entries per city, CSV export, email retries" onPress={() => router.push('/admin/waitlist')} />
        <AdminRow icon="activity" title={strings.admin.speedTests} subtitle="Hide implausible Wi‑Fi speed tests" onPress={() => router.push('/admin/speed-tests')} />
        <AdminRow icon="globe" title={strings.admin.cities} subtitle="Crawl status, re-crawl and city visibility" onPress={() => router.push('/admin/cities')} />
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
