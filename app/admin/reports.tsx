import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdminList, AdminRow, AdminShell } from '@/components/admin/AdminShell';
import { Badge, Button, Chip, Notice, Skeleton, Text } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { adminGetReports, adminSetReportStatus } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { spacing } from '@/lib/theme';

type Filter = 'open' | 'resolved' | 'all';

export default function AdminReports() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const reports = useQuery('admin-reports', adminGetReports, isAdmin);
  const [filter, setFilter] = useState<Filter>('open');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = (reports.data ?? []).filter((r) => filter === 'all' || r.status === filter);

  const setStatus = async (id: string, status: 'open' | 'resolved') => {
    setBusy(id);
    try {
      await adminSetReportStatus(id, status);
      await reports.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminShell title={strings.admin.reports}>
      <Head>
        <title>Reports · Admin · Cosurfing</title>
      </Head>
      <View style={styles.chips}>
        {(['open', 'resolved', 'all'] as Filter[]).map((f) => (
          <Chip key={f} label={f} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>
      {error ? <Notice tone="danger" body={error} /> : null}
      {reports.loading && !reports.data ? (
        <Skeleton height={80} />
      ) : reports.error ? (
        <Notice tone="danger" body={reports.error.message} />
      ) : rows.length === 0 ? (
        <Text tone="muted">{strings.admin.noItems}</Text>
      ) : (
        <AdminList>
          {rows.map((r) => (
            <AdminRow
              key={r.id}
              title={r.place?.name ?? 'Deleted place'}
              subtitle={r.body}
              meta={
                <>
                  <Badge label={r.status} tone={r.status === 'open' ? 'danger' : 'success'} />
                  {r.kind === 'closed' ? <Badge label={strings.report.kindClosed} tone="warning" /> : null}
                  <Text variant="caption" tone="faint">
                    {formatDateTime(r.created_at)}
                  </Text>
                </>
              }
              right={
                <View style={styles.rowActions}>
                  {r.place ? <Button title="Edit place" size="sm" variant="ghost" onPress={() => router.push(`/admin/places/${r.place!.id}`)} /> : null}
                  {r.status === 'open' ? (
                    <Button title={strings.admin.resolve} size="sm" variant="secondary" loading={busy === r.id} onPress={() => setStatus(r.id, 'resolved')} />
                  ) : (
                    <Button title={strings.admin.reopen} size="sm" variant="ghost" loading={busy === r.id} onPress={() => setStatus(r.id, 'open')} />
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
