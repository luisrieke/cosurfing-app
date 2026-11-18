import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { AdminShell } from '@/components/admin/AdminShell';
import { VenueReviewKit } from '@/components/admin/VenueReviewKit';
import { Button, Card, Chip, Input, Notice, Skeleton, Text } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useDebounced } from '@/hooks/useDebounced';
import { useAuth } from '@/lib/auth';
import { normalizeWebsite } from '@/lib/format';
import { adminGetOutreach, adminSetOutreachStage, OUTREACH_STAGES, type OutreachPlace, type OutreachStage } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { spacing } from '@/lib/theme';

const PAGE_SIZE = 50;

export default function AdminOutreach() {
  const { isAdmin } = useAuth();
  const [filter, setFilter] = useState<OutreachStage | 'all'>('to_contact');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const q = useDebounced(search.trim(), 300);
  // The offset belongs to one filter and search; changing either starts again at the first page.
  const listKey = `${filter}|${q}`;
  const [pager, setPager] = useState({ key: listKey, offset: 0 });
  const offset = pager.key === listKey ? pager.offset : 0;
  const goTo = (next: number) => setPager({ key: listKey, offset: Math.max(0, next) });

  const places = useQuery(
    `admin-outreach|${filter}|${q}|${offset}`,
    () => adminGetOutreach({ stage: filter === 'all' ? null : filter, search: q, offset, limit: PAGE_SIZE }),
    isAdmin,
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { ...places.data?.counts };
    c.all = Object.values(c).reduce((sum, n) => sum + n, 0);
    return c;
  }, [places.data]);
  const visible = places.data?.items ?? [];
  const total = counts[filter] ?? 0;

  // Optimistic: show the new stage right away, roll back when saving fails. The place stays on
  // the current page until the next fetch, so it can be moved on again without hunting for it.
  const setStage = async (place: OutreachPlace, stage: OutreachStage) => {
    if (place.stage === stage) return;
    setError(null);
    const update = (from: OutreachStage, to: OutreachStage) =>
      places.setData((prev) =>
        prev && {
          counts: { ...prev.counts, [from]: (prev.counts[from] ?? 1) - 1, [to]: (prev.counts[to] ?? 0) + 1 },
          items: prev.items.map((p) => (p.id === place.id ? { ...p, stage: to } : p)),
        },
      );
    update(place.stage, stage);
    try {
      await adminSetOutreachStage(place.id, stage);
    } catch (e) {
      update(stage, place.stage);
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
          <Text variant="bodyStrong">{strings.admin.outreachProgress(counts.confirmed ?? 0, counts.all ?? 0)}</Text>
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
          {total > PAGE_SIZE ? (
            <View style={styles.pager}>
              <Button title={strings.admin.outreachPrev} size="sm" variant="secondary" disabled={offset === 0} onPress={() => goTo(offset - PAGE_SIZE)} />
              <Text variant="small" tone="muted">
                {strings.admin.outreachRange(offset + 1, Math.min(offset + PAGE_SIZE, total), total)}
              </Text>
              <Button
                title={strings.admin.outreachNext}
                size="sm"
                variant="secondary"
                disabled={offset + PAGE_SIZE >= total}
                onPress={() => goTo(offset + PAGE_SIZE)}
              />
            </View>
          ) : null}
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
        <VenueReviewKit slug={place.slug} compact />
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
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
});
