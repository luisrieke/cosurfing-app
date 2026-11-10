import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { AdminList, AdminRow, AdminShell } from '@/components/admin/AdminShell';
import { Badge, Button, Chip, Notice, Skeleton, Text } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatMbps } from '@/lib/format';
import { type AdminSpeedTest, adminGetSpeedTests, adminSetSpeedTestStatus } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { spacing } from '@/lib/theme';
import type { SpeedTestVerification } from '@/lib/types';

type Filter = 'visible' | 'hidden' | 'off-site' | 'all' | SpeedTestVerification;

const FILTERS: Filter[] = ['all', 'visible', 'hidden', 'off-site', 'verified', 'too_far', 'low_accuracy', 'no_location', 'cellular'];

function matches(t: AdminSpeedTest, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'off-site') return !t.on_site;
  if (filter === 'visible' || filter === 'hidden') return t.status === filter;
  return t.verification === filter;
}

function filterLabel(f: Filter): string {
  return f in strings.admin.verification ? strings.admin.verification[f as SpeedTestVerification] : f;
}

function subtitle(t: AdminSpeedTest): string {
  const parts = [t.kind === 'mobile' ? `${strings.mobile.speed}${t.carrier ? ` (${t.carrier})` : ''}` : strings.place.wifi];
  parts.push(`↓ ${formatMbps(Number(t.download_mbps))}`);
  if (t.upload_mbps !== null) parts.push(`↑ ${formatMbps(Number(t.upload_mbps))}`);
  if (t.ping_ms !== null) parts.push(`${t.ping_ms} ms`);
  if (t.distance_m !== null) {
    const accuracy = t.accuracy_m !== null ? ` (${strings.admin.gpsAccuracy(t.accuracy_m)})` : '';
    parts.push(`${Math.round(Number(t.distance_m))} m away${accuracy}`);
  }
  if (t.network_type !== 'unknown') parts.push(t.network_type);
  if (t.note) parts.push(`“${t.note}”`);
  return parts.join(' · ');
}

export default function AdminSpeedTests() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const tests = useQuery('admin-speed-tests', adminGetSpeedTests, isAdmin);
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = (tests.data ?? []).filter((t) => matches(t, filter));

  const setStatus = async (id: string, status: 'visible' | 'hidden') => {
    setBusy(id);
    setError(null);
    try {
      await adminSetSpeedTestStatus(id, status);
      await tests.refetch(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminShell title={strings.admin.speedTests}>
      <Head>
        <title>Speed tests · Admin · Cosurfing</title>
      </Head>
      <Text variant="small" tone="muted">
        {strings.admin.speedTestsHint}
      </Text>
      <View style={styles.chips}>
        {FILTERS.map((f) => (
          <Chip key={f} label={filterLabel(f)} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>
      {error ? <Notice tone="danger" body={error} /> : null}
      {tests.loading && !tests.data ? (
        <Skeleton height={80} />
      ) : tests.error ? (
        <Notice tone="danger" body={tests.error.message} />
      ) : rows.length === 0 ? (
        <Text tone="muted">{strings.admin.noItems}</Text>
      ) : (
        <AdminList>
          {rows.map((t) => (
            <AdminRow
              key={t.id}
              title={t.place?.name ?? 'Deleted place'}
              subtitle={subtitle(t)}
              meta={
                <>
                  <Badge label={t.status} tone={t.status === 'visible' ? 'success' : 'danger'} />
                  {t.verification ? (
                    <Badge
                      label={strings.admin.verification[t.verification]}
                      tone={t.verification === 'verified' ? 'success' : 'warning'}
                    />
                  ) : (
                    <>
                      <Badge label={strings.admin.legacyTest} tone="neutral" />
                      {!t.on_site ? <Badge label={strings.admin.offSite} tone="warning" /> : null}
                    </>
                  )}
                  <Text variant="caption" tone="faint">
                    {formatDateTime(t.created_at)}
                  </Text>
                </>
              }
              right={
                <View style={styles.rowActions}>
                  {t.place ? <Button title="View" size="sm" variant="ghost" onPress={() => router.push(`/place/${t.place!.slug}`)} /> : null}
                  {t.lat !== null && t.lng !== null ? (
                    <Button
                      title={strings.admin.openTestLocation}
                      size="sm"
                      variant="ghost"
                      icon="external-link"
                      onPress={() => Linking.openURL(`https://www.openstreetmap.org/?mlat=${t.lat}&mlon=${t.lng}#map=19/${t.lat}/${t.lng}`)}
                    />
                  ) : null}
                  {t.status === 'visible' ? (
                    <Button title={strings.admin.hide} size="sm" variant="secondary" loading={busy === t.id} onPress={() => setStatus(t.id, 'hidden')} />
                  ) : (
                    <Button title={strings.admin.unhide} size="sm" variant="secondary" loading={busy === t.id} onPress={() => setStatus(t.id, 'visible')} />
                  )}
                </View>
              }
            />
          ))}
        </AdminList>
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  rowActions: {
    flexDirection: 'column',
    gap: spacing.xs,
    alignItems: 'flex-end',
  },
});
