import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AdminList, AdminRow, AdminShell } from '@/components/admin/AdminShell';
import { Card, Notice, Section, Skeleton, Text } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { formatDate, formatDateTime } from '@/lib/format';
import { adminGetOwnerChanges, adminGetPlaceOwners } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { spacing } from '@/lib/theme';

function short(value: unknown): string {
  if (value === null || value === undefined || value === '') return '–';
  if (typeof value === 'object') return '(schedule)';
  const s = String(value);
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}

export default function AdminOwners() {
  const router = useRouter();
  const { isAdmin, user } = useAuth();
  const a = strings.owner.admin;
  const owners = useQuery(`admin-all-owners:${user?.id}`, () => adminGetPlaceOwners(), isAdmin);
  const changes = useQuery(`admin-owner-changes:${user?.id}`, () => adminGetOwnerChanges(50), isAdmin);

  return (
    <AdminShell title={a.title}>
      <Head>
        <title>Venue owners · Admin · Cosurfing</title>
      </Head>
      <Text tone="muted">{a.sectionHint}</Text>

      <Section title={a.allOwners}>
        {owners.error ? <Notice tone="danger" body={owners.error.message} /> : null}
        {owners.loading && !owners.data ? (
          <Skeleton height={64} />
        ) : (owners.data ?? []).length === 0 ? (
          <Text tone="muted">{a.noOwners}</Text>
        ) : (
          <AdminList>
            {(owners.data ?? []).map((o) => (
              <AdminRow
                key={`${o.place_id}:${o.user_id}`}
                icon="key"
                title={o.place_name}
                subtitle={`${o.email ?? o.user_id} · ${formatDate(o.created_at)}`}
                onPress={() => router.push(`/admin/places/${o.place_id}`)}
              />
            ))}
          </AdminList>
        )}
      </Section>

      <Section title={a.recentChanges}>
        {changes.error ? <Notice tone="danger" body={changes.error.message} /> : null}
        {changes.loading && !changes.data ? (
          <Skeleton height={96} />
        ) : (changes.data ?? []).length === 0 ? (
          <Text tone="muted">{a.noChanges}</Text>
        ) : (
          (changes.data ?? []).map((c) => (
            <Card key={c.id} style={styles.change}>
              <Text variant="bodyStrong" onPress={() => router.push(`/admin/places/${c.place_id}`)}>
                {c.place_name}
              </Text>
              <Text variant="caption" tone="muted">
                {formatDateTime(c.created_at)} · {a.by(c.email)}
              </Text>
              <View style={styles.fields}>
                {Object.entries(c.changes).map(([field, v]) => (
                  <Text key={field} variant="small">
                    <Text variant="smallStrong">{field}</Text>: {short(v.from)} → {short(v.to)}
                  </Text>
                ))}
              </View>
            </Card>
          ))
        )}
      </Section>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  change: {
    gap: spacing.xs,
  },
  fields: {
    gap: 2,
    paddingTop: spacing.xs,
  },
});
