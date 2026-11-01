import Head from 'expo-router/head';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { AdminList, AdminRow, AdminShell } from '@/components/admin/AdminShell';
import { Badge, Button, Input, Notice, Section, Skeleton, Text } from '@/components/ui';
import { useDebounced } from '@/hooks/useDebounced';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import {
  adminCountExamplePlaces,
  adminDeleteExamplePlaces,
  adminGetCrawlOverview,
  adminRequeueCity,
  adminRequeueEnrich,
  adminSearchCities,
  adminSetCityStatus,
} from '@/lib/queries';
import { strings } from '@/lib/strings';
import { spacing } from '@/lib/theme';
import type { City, CrawlStatus } from '@/lib/types';

const crawlTone: Record<CrawlStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  done: 'success',
  running: 'warning',
  pending: 'neutral',
  failed: 'danger',
};

function confirm(message: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(message)) onYes();
    return;
  }
  Alert.alert(message, undefined, [
    { text: strings.common.cancel, style: 'cancel' },
    { text: strings.common.delete, style: 'destructive', onPress: onYes },
  ]);
}

export default function AdminCities() {
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 250);
  const cities = useQuery(`admin-cities:${q}`, () => adminSearchCities(q, 60), isAdmin);
  const overview = useQuery('admin-crawl-overview', adminGetCrawlOverview, isAdmin);
  const examples = useQuery('admin-example-count', adminCountExamplePlaces, isAdmin);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const run = async (key: string, fn: () => Promise<string | null>) => {
    setBusy(key);
    setMessage(null);
    try {
      const text = await fn();
      if (text) setMessage({ tone: 'success', text });
      await Promise.all([cities.refetch(true), overview.refetch(true)]);
    } catch (e) {
      setMessage({ tone: 'danger', text: e instanceof Error ? e.message : strings.common.somethingWentWrong });
    } finally {
      setBusy(null);
    }
  };

  const toggle = (c: City) =>
    run(`status:${c.id}`, async () => {
      await adminSetCityStatus(c.id, c.status === 'active' ? 'waitlist' : 'active');
      return null;
    });

  const deleteExamples = () =>
    confirm(`${strings.admin.deleteExamples}? ${examples.data ?? 0} places flagged as example data will be removed, including their photos and reviews.`, () =>
      void run('examples', async () => {
        const n = await adminDeleteExamplePlaces();
        await examples.refetch(true);
        return `${n} example places deleted.`;
      }),
    );

  return (
    <AdminShell title={strings.admin.cities}>
      <Head>
        <title>Cities · Admin · Cosurfing</title>
      </Head>
      {message ? <Notice tone={message.tone} body={message.text} /> : null}

      <Section title={strings.admin.crawlOverview}>
        <Text variant="small" tone="muted">
          {strings.admin.citiesHint}
        </Text>
        <View style={styles.row}>
          {(overview.data ?? []).map((o) => (
            <Badge key={o.status} label={strings.admin.crawlCounts(o.status, o.count)} tone={crawlTone[o.status as CrawlStatus] ?? 'neutral'} />
          ))}
        </View>
      </Section>

      <Input value={search} onChangeText={setSearch} placeholder={strings.admin.fields.citySearch} autoCapitalize="none" />

      {cities.loading && !cities.data ? (
        <Skeleton height={80} />
      ) : cities.error ? (
        <Notice tone="danger" body={cities.error.message} />
      ) : (
        <AdminList>
          {(cities.data ?? []).map((c) => (
            <AdminRow
              key={c.id}
              title={`${c.name}, ${c.country_name}`}
              subtitle={`/${c.slug} · ${strings.admin.cityMeta(c.place_count, c.crawled_at ? formatDate(c.crawled_at) : null)}${
                c.crawl_error ? ` · ${c.crawl_error.slice(0, 80)}` : ''
              }`}
              meta={
                <>
                  <Badge label={c.crawl_status} tone={crawlTone[c.crawl_status]} />
                  {c.status !== 'active' ? <Badge label="waitlist" tone="neutral" /> : null}
                  {c.is_hotspot ? <Badge label="hotspot" tone="accent" /> : null}
                </>
              }
              right={
                <View style={styles.actions}>
                  <Button
                    title={strings.admin.recrawl}
                    size="sm"
                    variant="secondary"
                    loading={busy === `crawl:${c.id}`}
                    onPress={() =>
                      void run(`crawl:${c.id}`, async () => {
                        await adminRequeueCity(c.id);
                        return strings.admin.recrawlQueued(c.name);
                      })
                    }
                  />
                  <Button
                    title={strings.admin.reenrich}
                    size="sm"
                    variant="ghost"
                    loading={busy === `enrich:${c.id}`}
                    onPress={() => void run(`enrich:${c.id}`, async () => strings.admin.reenrichQueued(await adminRequeueEnrich(c.id)))}
                  />
                  <Button
                    title={c.status === 'active' ? strings.admin.deactivateCity : strings.admin.activateCity}
                    size="sm"
                    variant="ghost"
                    loading={busy === `status:${c.id}`}
                    onPress={() => void toggle(c)}
                  />
                </View>
              }
            />
          ))}
        </AdminList>
      )}

      {(examples.data ?? 0) > 0 ? (
        <Section title={strings.common.example}>
          <Text variant="small" tone="muted">
            Places flagged with is_example are hidden from visitors. Delete them before launch.
          </Text>
          <View style={styles.row}>
            <Button
              title={`${strings.admin.deleteExamples} (${examples.data})`}
              variant="danger"
              icon="trash-2"
              loading={busy === 'examples'}
              onPress={deleteExamples}
            />
          </View>
        </Section>
      ) : null}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'flex-end',
  },
});
