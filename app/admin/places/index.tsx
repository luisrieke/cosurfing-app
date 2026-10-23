import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdminList, AdminRow, AdminShell } from '@/components/admin/AdminShell';
import { Badge, Button, CategoryBadge, Chip, Input, Notice, Skeleton, Text } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { adminGetPlaces } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { spacing } from '@/lib/theme';
import type { PlaceStatus } from '@/lib/types';

const statusTone: Record<PlaceStatus, 'success' | 'warning' | 'neutral'> = {
  published: 'success',
  draft: 'warning',
  archived: 'neutral',
};

export default function AdminPlaces() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const places = useQuery('admin-places', adminGetPlaces, isAdmin);
  const [filter, setFilter] = useState<PlaceStatus | 'all'>('all');
  const [search, setSearch] = useState('');

  const rows = (places.data ?? []).filter(
    (p) => (filter === 'all' || p.status === filter) && (!search || p.name.toLowerCase().includes(search.toLowerCase()) || p.city.name.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <AdminShell
      title={strings.admin.places}
      right={<Button title={strings.admin.newPlace} size="sm" icon="plus" onPress={() => router.push('/admin/places/new')} />}
    >
      <Head>
        <title>Places · Admin · Cosurfing</title>
      </Head>
      <Input value={search} onChangeText={setSearch} placeholder="Search by name or city" autoCapitalize="none" />
      <View style={styles.chips}>
        {(['all', 'published', 'draft', 'archived'] as const).map((s) => (
          <Chip key={s} label={s === 'all' ? strings.explore.all : strings.admin[s]} selected={filter === s} onPress={() => setFilter(s)} />
        ))}
      </View>
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
