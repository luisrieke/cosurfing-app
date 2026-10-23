import Head from 'expo-router/head';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { AdminList, AdminRow, AdminShell } from '@/components/admin/AdminShell';
import { Badge, Button, Notice, Section, Skeleton, Text } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { env } from '@/lib/env';
import { adminDeleteExamplePlaces, adminGetPlaces, adminSetCityStatus, getAllCities } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { spacing } from '@/lib/theme';

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
  const cities = useQuery('admin-cities', getAllCities, isAdmin);
  const places = useQuery('admin-places-for-cities', adminGetPlaces, isAdmin);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const exampleCount = (places.data ?? []).filter((p) => p.is_example).length;
  const publishedByCity = new Map<string, number>();
  for (const p of places.data ?? []) {
    if (p.status === 'published') publishedByCity.set(p.city_id, (publishedByCity.get(p.city_id) ?? 0) + 1);
  }

  const toggle = async (id: string, next: 'active' | 'waitlist') => {
    setBusy(id);
    setMessage(null);
    try {
      await adminSetCityStatus(id, next);
      await cities.refetch();
    } catch (e) {
      setMessage({ tone: 'danger', text: e instanceof Error ? e.message : strings.common.somethingWentWrong });
    } finally {
      setBusy(null);
    }
  };

  const deleteExamples = () =>
    confirm(`${strings.admin.deleteExamples}? ${exampleCount} places flagged as example data will be removed, including their photos and reviews.`, async () => {
      setBusy('examples');
      try {
        const n = await adminDeleteExamplePlaces();
        setMessage({ tone: 'success', text: `${n} example places deleted.` });
        await places.refetch();
      } catch (e) {
        setMessage({ tone: 'danger', text: e instanceof Error ? e.message : strings.common.somethingWentWrong });
      } finally {
        setBusy(null);
      }
    });

  return (
    <AdminShell title={strings.admin.cities}>
      <Head>
        <title>Cities · Admin · Cosurfing</title>
      </Head>
      {message ? <Notice tone={message.tone} body={message.text} /> : null}
      <Text variant="small" tone="muted">
        Active cities get the map and list. Every other city shows the waiting list. Cities appear here automatically once someone joins their
        waiting list.
      </Text>
      {cities.loading && !cities.data ? (
        <Skeleton height={80} />
      ) : cities.error ? (
        <Notice tone="danger" body={cities.error.message} />
      ) : (
        <AdminList>
          {(cities.data ?? []).map((c) => {
            const published = publishedByCity.get(c.id) ?? 0;
            return (
              <AdminRow
                key={c.id}
                title={`${c.name}, ${c.country_name}`}
                subtitle={`/${c.slug} · ${published} published ${published === 1 ? 'place' : 'places'}`}
                meta={<Badge label={c.status === 'active' ? 'active' : strings.home.comingSoon} tone={c.status === 'active' ? 'success' : 'neutral'} />}
                right={
                  c.status === 'active' ? (
                    <Button title={strings.admin.deactivateCity} size="sm" variant="ghost" loading={busy === c.id} onPress={() => toggle(c.id, 'waitlist')} />
                  ) : (
                    <Button
                      title={strings.admin.activateCity}
                      size="sm"
                      variant="secondary"
                      loading={busy === c.id}
                      onPress={() => {
                        if (published === 0 && Platform.OS === 'web' && !window.confirm(`Activate ${c.name} with no published places yet?`)) return;
                        void toggle(c.id, 'active');
                      }}
                    />
                  )
                }
              />
            );
          })}
        </AdminList>
      )}

      <Section title={strings.common.example}>
        <Text variant="small" tone="muted">
          Seeded example places are flagged with is_example and are hidden from visitors unless EXPO_PUBLIC_SHOW_EXAMPLE_PLACES=true
          (currently {env.showExamplePlaces ? 'on' : 'off'} in this build). Delete them before launch.
        </Text>
        <View style={styles.row}>
          <Button
            title={`${strings.admin.deleteExamples} (${exampleCount})`}
            variant="danger"
            icon="trash-2"
            loading={busy === 'examples'}
            disabled={exampleCount === 0}
            onPress={deleteExamples}
          />
        </View>
      </Section>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
