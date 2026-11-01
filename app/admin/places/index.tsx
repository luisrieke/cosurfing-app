import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdminList, AdminRow, AdminShell } from '@/components/admin/AdminShell';
import { Badge, Button, CategoryBadge, Chip, Input, Notice, Skeleton, Text } from '@/components/ui';
import { useDebounced } from '@/hooks/useDebounced';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { adminSearchPlaces } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { spacing } from '@/lib/theme';
import type { PlaceStatus } from '@/lib/types';

const statusTone: Record<PlaceStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  published: 'success',
  draft: 'warning',
  needs_review: 'danger',
  archived: 'neutral',
};

export default function AdminPlaces() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [filter, setFilter] = useState<PlaceStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 250);
  const places = useQuery(`admin-places:${q}:${filter}`, () => adminSearchPlaces({ q, status: filter, limit: 60 }), isAdmin);
  const rows = places.data?.items ?? [];

  return (
    <AdminShell
      title={strings.admin.places}
      right={<Button title={strings.admin.newPlace} size="sm" icon="plus" onPress={() => router.push('/admin/places/new')} />}
    >
      <Head>
        <title>Places · Admin · Cosurfing</title>
      </Head>
      <Input value={search} onChangeText={setSearch} placeholder="Search by name" autoCapitalize="none" />
      <View style={styles.chips}>
        {(['all', 'published', 'draft', 'needs_review', 'archived'] as const).map((s) => (
          <Chip key={s} label={s === 'all' ? strings.explore.all : strings.admin[s]} selected={filter === s} onPress={() => setFilter(s)} />
        ))}
      </View>
      {places.data ? (
        <Text variant="caption" tone="muted">
          {rows.length < places.data.total ? `${rows.length} of ${places.data.total.toLocaleString('en-US')} places` : `${rows.length} places`}
        </Text>
      ) : null}
      {places.loading && !places.data ? (
        <View style={{ gap: spacing.sm }}>
          <Skeleton height={64} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      ) : places.error ? (
        <Notice tone="danger" body={places.error.message} />
      ) : rows.length === 0 ? (
        <Text tone="muted">{strings.admin.noItems}</Text>
      ) : (
        <AdminList>
          {rows.map((p) => (
            <AdminRow
              key={p.id}
              title={p.name}
              subtitle={`${p.city.name}${p.address ? ` · ${p.address}` : ''}`}
              meta={
                <>
                  <CategoryBadge category={p.category} />
                  <Badge label={strings.admin[p.status]} tone={statusTone[p.status]} />
                  {p.is_example ? <Badge label={strings.common.example} tone="warning" /> : null}
                </>
              }
              onPress={() => router.push(`/admin/places/${p.id}`)}
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
});
