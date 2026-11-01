import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { AdminShell } from '@/components/admin/AdminShell';
import { Badge, Button, Card, Input, Notice, Skeleton, Text } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { formatDate, normalizeWebsite } from '@/lib/format';
import { adminGetPlacesToVerify, adminReviewPlace, type PlaceToVerify } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { spacing } from '@/lib/theme';

export default function AdminVerify() {
  const { isAdmin } = useAuth();
  const places = useQuery('admin-verify', adminGetPlacesToVerify, isAdmin);

  return (
    <AdminShell title={strings.admin.verify}>
      <Head>
        <title>Verify places · Admin · Cosurfing</title>
      </Head>
      <Text tone="muted">{strings.admin.verifyHint}</Text>
      {places.loading && !places.data ? (
        <Skeleton height={120} />
      ) : places.error ? (
        <Notice tone="danger" body={places.error.message} />
      ) : (places.data ?? []).length === 0 ? (
        <Text tone="muted">{strings.admin.noItems}</Text>
      ) : (
        (places.data ?? []).map((p) => <VerifyItem key={p.id} place={p} onDone={places.refetch} />)
      )}
    </AdminShell>
  );
}

function VerifyItem({ place, onDone }: { place: PlaceToVerify; onDone: () => Promise<unknown> | void }) {
  const router = useRouter();
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState<'exists' | 'closed' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reports = place.closed_reports?.[0]?.count ?? 0;
  const mapsQuery = encodeURIComponent([place.name, place.address, place.city?.name].filter(Boolean).join(', '));

  const decide = async (decision: 'exists' | 'closed') => {
    const url = decision === 'exists' && website.trim() ? normalizeWebsite(website) : undefined;
    setBusy(decision);
    setError(null);
    try {
      await adminReviewPlace(place.id, decision, url ?? undefined);
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text variant="bodyStrong">{place.name}</Text>
        <Text variant="small" tone="muted">
          {[place.address, place.city?.name].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View style={styles.meta}>
        {place.review_reason ? <Badge label={strings.admin.reviewReasons[place.review_reason] ?? place.review_reason} tone="danger" /> : null}
        {reports > 0 ? <Badge label={strings.admin.closedReports(reports)} tone="warning" /> : null}
      </View>
      {place.flagged_website ? (
        <Text variant="small" tone="muted">
          {strings.admin.oldWebsite(place.flagged_website)}
        </Text>
      ) : null}
      {place.osm_seen_at ? (
        <Text variant="small" tone="muted">
          {strings.admin.osmSeen(formatDate(place.osm_seen_at))}
        </Text>
      ) : null}
      <View style={styles.links}>
        <Button
          title="Google Maps"
          size="sm"
          variant="ghost"
          onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`)}
        />
        {place.flagged_website ? (
          <Button title="Open old website" size="sm" variant="ghost" onPress={() => Linking.openURL(place.flagged_website!)} />
        ) : null}
        <Button title="Edit place" size="sm" variant="ghost" onPress={() => router.push(`/admin/places/${place.id}`)} />
      </View>
      <Input
        label={strings.admin.newWebsite}
        value={website}
        onChangeText={setWebsite}
        placeholder="https://"
        autoCapitalize="none"
        keyboardType="url"
        error={error}
      />
      <View style={styles.actions}>
        <Button title={strings.admin.placeExists} size="sm" loading={busy === 'exists'} onPress={() => decide('exists')} />
        <Button title={strings.admin.placeClosed} size="sm" variant="secondary" loading={busy === 'closed'} onPress={() => decide('closed')} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  head: {
    gap: 2,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
