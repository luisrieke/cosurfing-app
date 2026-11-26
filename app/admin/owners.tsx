import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';

import { AdminList, AdminRow, AdminShell } from '@/components/admin/AdminShell';
import { AdminPlaceOwners } from '@/components/admin/AdminPlaceOwners';
import { Badge, Button, Card, Input, Notice, Section, Skeleton, Text } from '@/components/ui';
import { useDebounced } from '@/hooks/useDebounced';
import { useNow } from '@/hooks/useNow';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { formatDate, formatDateTime } from '@/lib/format';
import { adminGetAllOwnerInvites, adminGetOwnerChanges, adminGetPlaceOwners, adminSearchPlaces } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { spacing } from '@/lib/theme';
import type { PlaceStatus } from '@/lib/types';
import { ownerInviteUrl } from '@/lib/venueLink';

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
  const now = useNow().getTime();
  const owners = useQuery(`admin-all-owners:${user?.id}`, () => adminGetPlaceOwners(), isAdmin);
  const invites = useQuery(`admin-all-invites:${user?.id}`, adminGetAllOwnerInvites, isAdmin);
  const changes = useQuery(`admin-owner-changes:${user?.id}`, () => adminGetOwnerChanges(50), isAdmin);

  const [q, setQ] = useState('');
  const term = useDebounced(q.trim(), 250);
  const results = useQuery(`admin-owner-place-search:${term}`, () => adminSearchPlaces({ q: term, status: 'all', limit: 8 }), isAdmin && term.length >= 2);
  const [selected, setSelected] = useState<{ id: string; name: string; city: string | null; status: PlaceStatus } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const refreshAll = () => {
    void invites.refetch(true);
    void owners.refetch(true);
  };

  const copy = async (id: string, token: string) => {
    const url = ownerInviteUrl(token);
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
      return;
    }
    await Share.share({ message: url });
  };

  return (
    <AdminShell title={a.title}>
      <Head>
        <title>Venue owners · Admin · Cosurfing</title>
      </Head>
      <Text tone="muted">{a.sectionHint}</Text>

      <Section title={a.createTitle}>
        {selected ? (
          <>
            <View style={styles.selected}>
              <View style={styles.flex}>
                <Text variant="bodyStrong">{selected.name}</Text>
                {selected.city ? (
                  <Text variant="small" tone="muted">
                    {selected.city}
                  </Text>
                ) : null}
              </View>
              <Button title={a.changePlace} size="sm" variant="ghost" icon="search" onPress={() => setSelected(null)} />
            </View>
            <AdminPlaceOwners key={selected.id} placeId={selected.id} published={selected.status === 'published'} onChanged={refreshAll} />
          </>
        ) : (
          <>
            <Input value={q} onChangeText={setQ} placeholder={a.searchPlaceholder} autoCapitalize="none" />
            {results.error ? <Notice tone="danger" body={results.error.message} /> : null}
            {term.length >= 2 && results.data ? (
              results.data.items.length === 0 ? (
                <Text tone="muted">{a.noResults}</Text>
              ) : (
                <AdminList>
                  {results.data.items.map((p) => (
                    <AdminRow
                      key={p.id}
                      icon="map-pin"
                      title={p.name}
                      subtitle={[p.city?.name, p.status !== 'published' ? strings.admin[p.status] : null].filter(Boolean).join(' · ')}
                      onPress={() => setSelected({ id: p.id, name: p.name, city: p.city?.name ?? null, status: p.status })}
                    />
                  ))}
                </AdminList>
              )
            ) : null}
          </>
        )}
      </Section>

      <Section title={a.allInvites}>
        {invites.error ? <Notice tone="danger" body={invites.error.message} /> : null}
        {invites.loading && !invites.data ? (
          <Skeleton height={64} />
        ) : (invites.data ?? []).length === 0 ? (
          <Text tone="muted">{a.noInvites}</Text>
        ) : (
          <AdminList>
            {(invites.data ?? []).map((inv) => {
              const expired = !inv.accepted_at && new Date(inv.expires_at).getTime() < now;
              const open = !inv.accepted_at && !expired;
              return (
                <AdminRow
                  key={inv.id}
                  icon="link"
                  title={inv.place?.name ?? inv.place_id}
                  subtitle={[inv.sent_to, `${a.created} ${formatDate(inv.created_at)}`].filter(Boolean).join(' · ')}
                  meta={
                    inv.accepted_at ? (
                      <Badge label={a.inviteAccepted(formatDate(inv.accepted_at))} tone="success" />
                    ) : expired ? (
                      <Badge label={a.inviteExpired} tone="neutral" />
                    ) : (
                      <Badge label={a.inviteOpen(formatDate(inv.expires_at))} tone="accent" />
                    )
                  }
                  right={
                    open ? (
                      <Button title={copied === inv.id ? a.copied : a.copy} size="sm" variant="secondary" icon="copy" onPress={() => void copy(inv.id, inv.token)} />
                    ) : (
                      <Button title={strings.admin.places} size="sm" variant="ghost" icon="external-link" onPress={() => router.push(`/admin/places/${inv.place_id}`)} />
                    )
                  }
                />
              );
            })}
          </AdminList>
        )}
      </Section>

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
  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  change: {
    gap: spacing.xs,
  },
  fields: {
    gap: 2,
    paddingTop: spacing.xs,
  },
});
