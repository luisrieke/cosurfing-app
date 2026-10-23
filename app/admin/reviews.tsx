import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdminList, AdminRow, AdminShell } from '@/components/admin/AdminShell';
import { Stars } from '@/components/Reviews';
import { Badge, Button, Chip, Notice, Skeleton, Text } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { adminGetReviews, adminSetReviewStatus } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { spacing } from '@/lib/theme';

type Filter = 'visible' | 'hidden' | 'all';

export default function AdminReviews() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const reviews = useQuery('admin-reviews', adminGetReviews, isAdmin);
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = (reviews.data ?? []).filter((r) => filter === 'all' || r.status === filter);

  const setStatus = async (id: string, status: 'visible' | 'hidden') => {
    setBusy(id);
    try {
      await adminSetReviewStatus(id, status);
      await reviews.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminShell title={strings.admin.reviews}>
      <Head>
        <title>Reviews · Admin · Cosurfing</title>
      </Head>
      <View style={styles.chips}>
        {(['all', 'visible', 'hidden'] as Filter[]).map((f) => (
          <Chip key={f} label={f} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>
      {error ? <Notice tone="danger" body={error} /> : null}
      {reviews.loading && !reviews.data ? (
        <Skeleton height={80} />
      ) : reviews.error ? (
        <Notice tone="danger" body={reviews.error.message} />
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
                  <Stars value={r.rating} size={12} />
                  <Badge label={r.status} tone={r.status === 'visible' ? 'success' : 'danger'} />
                  <Text variant="caption" tone="faint">
                    {formatDateTime(r.created_at)}
                  </Text>
                </>
              }
              right={
                <View style={styles.rowActions}>
                  {r.place ? <Button title="View" size="sm" variant="ghost" onPress={() => router.push(`/place/${r.place!.slug}`)} /> : null}
                  {r.status === 'visible' ? (
                    <Button title={strings.admin.hide} size="sm" variant="secondary" loading={busy === r.id} onPress={() => setStatus(r.id, 'hidden')} />
                  ) : (
                    <Button title={strings.admin.unhide} size="sm" variant="secondary" loading={busy === r.id} onPress={() => setStatus(r.id, 'visible')} />
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
