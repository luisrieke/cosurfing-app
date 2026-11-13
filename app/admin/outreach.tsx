import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { AdminShell } from '@/components/admin/AdminShell';
import { Button, Card, Chip, Input, Notice, Skeleton, Text } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { normalizeWebsite } from '@/lib/format';
import { adminGetOutreach, adminSetOutreachStage, OUTREACH_STAGES, type OutreachPlace, type OutreachStage } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { spacing } from '@/lib/theme';

export default function AdminOutreach() {
  const { isAdmin } = useAuth();
  const places = useQuery('admin-outreach', adminGetOutreach, isAdmin);
  const [filter, setFilter] = useState<OutreachStage | 'all'>('to_contact');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const all = useMemo(() => places.data ?? [], [places.data]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: all.length };
    for (const p of all) c[p.stage] = (c[p.stage] ?? 0) + 1;
    return c;
  }, [all]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(
      (p) =>
        (filter === 'all' || p.stage === filter) &&
        (!q || p.name.toLowerCase().includes(q) || (p.city?.name ?? '').toLowerCase().includes(q)),
    );
  }, [all, filter, search]);

  // Optimistic: show the new stage right away, roll back when saving fails.
  const setStage = async (place: OutreachPlace, stage: OutreachStage) => {
    if (place.stage === stage) return;
    setError(null);
    const update = (id: string, next: OutreachStage) =>
      places.setData((prev) => prev?.map((p) => (p.id === id ? { ...p, stage: next } : p)));
    update(place.id, stage);
    try {
      await adminSetOutreachStage(place.id, stage);
    } catch (e) {
      update(place.id, place.stage);
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    }
  };

  return (
    <AdminShell title={strings.admin.outreach}>
      <Head>
        <title>Outreach · Admin · Cosurfing</title>
      </Head>
      <Text tone="muted">{strings.admin.outreachHint}</Text>
      {places.loading && !places.data ? (
        <Skeleton height={120} />
      ) : places.error ? (
        <Notice tone="danger" body={places.error.message} />
      ) : (
        <>
          <Text variant="bodyStrong">{strings.admin.outreachProgress(counts.confirmed ?? 0, all.length)}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip label={`${strings.admin.outreachAll} · ${counts.all}`} selected={filter === 'all'} onPress={() => setFilter('all')} />
            {OUTREACH_STAGES.map((s) => (
              <Chip
                key={s}
                label={`${strings.admin.outreachStages[s] ?? s} · ${counts[s] ?? 0}`}
                selected={filter === s}
                onPress={() => setFilter(s)}
              />
            ))}
          </ScrollView>
          <Input value={search} onChangeText={setSearch} placeholder={strings.admin.outreachSearch} autoCapitalize="none" />
          {error ? <Notice tone="danger" body={error} /> : null}
          {visible.length === 0 ? (
            <Text tone="muted">{strings.admin.noItems}</Text>
          ) : (
            visible.map((p) => <OutreachItem key={p.id} place={p} onStage={(stage) => setStage(p, stage)} />)
          )}
        </>
      )}
    </AdminShell>
  );
}

function OutreachItem({ place, onStage }: { place: OutreachPlace; onStage: (stage: OutreachStage) => void }) {
  const router = useRouter();
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text variant="bodyStrong">{place.name}</Text>
        <Text variant="small" tone="muted">
          {[place.address, place.city?.name].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View style={styles.links}>
        {place.website ? (
          <Button title={strings.admin.openWebsite} size="sm" variant="ghost" onPress={() => {
              const url = normalizeWebsite(place.website);
              if (url) void Linking.openURL(url);
            }}
          />
        ) : null}
        <Button title={strings.admin.editPlace} size="sm" variant="ghost" onPress={() => router.push(`/admin/places/${place.id}`)} />
      </View>
      <View style={styles.stages}>
        {OUTREACH_STAGES.map((s) => (
          <Chip key={s} label={strings.admin.outreachStages[s] ?? s} selected={place.stage === s} onPress={() => onStage(s)} />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: {
    gap: spacing.xs,
  },
  card: {
    gap: spacing.sm,
  },
  head: {
    gap: 2,
  },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  stages: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
});
