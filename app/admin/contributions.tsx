import { Image } from 'expo-image';
import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdminShell } from '@/components/admin/AdminShell';
import { UserAvatar } from '@/components/UserBadge';
import { Button, Card, Notice, Skeleton, Text } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { getPendingContributions, moderateContribution } from '@/lib/queries';
import { menuUrl, previewUrl } from '@/lib/storage';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import type { PendingContribution } from '@/lib/types';

function itemKey(item: PendingContribution): string {
  return `${item.kind}:${item.id ?? ''}:${item.place_id ?? ''}:${item.user_id}:${item.fact_key ?? ''}`;
}

export default function AdminContributions() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const queue = useQuery('admin-contributions', getPendingContributions, isAdmin);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, { userId: string; name: string; avatar: string | null; items: PendingContribution[] }>();
    for (const item of queue.data ?? []) {
      const group = map.get(item.user_id) ?? {
        userId: item.user_id,
        name: item.author_name,
        avatar: item.avatar_path,
        items: [],
      };
      group.items.push(item);
      map.set(item.user_id, group);
    }
    return [...map.values()];
  }, [queue.data]);

  const act = async (item: PendingContribution, decision: 'approve' | 'reject') => {
    const key = `${itemKey(item)}:${decision}`;
    setBusy(key);
    setError(null);
    try {
      await moderateContribution({
        kind: item.kind,
        decision,
        id: item.id,
        placeId: item.place_id,
        userId: item.user_id,
        key: item.fact_key,
      });
      await queue.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminShell title={strings.admin.contributions}>
      <Head>
        <title>Contributions · Admin · Cosurfing</title>
      </Head>
      <Text tone="muted">{strings.admin.contributionsHint}</Text>
      {error ? <Notice tone="danger" body={error} /> : null}
      {queue.loading && !queue.data ? (
        <Skeleton height={160} />
      ) : queue.error ? (
        <Notice tone="danger" body={queue.error.message} />
      ) : groups.length === 0 ? (
        <Text tone="muted">{strings.admin.noItems}</Text>
      ) : (
        groups.map((group) => (
          <Card key={group.userId} style={styles.group}>
            <View style={styles.person}>
              <UserAvatar name={group.name} path={group.avatar} size={36} />
              <View style={styles.personText}>
                <Text variant="bodyStrong">{group.name}</Text>
                <Text variant="caption" tone="muted">
                  {group.items.length} {strings.admin.pending}
                </Text>
              </View>
              <Button title={strings.account.viewProfile} size="sm" variant="ghost" onPress={() => router.push(`/u/${group.userId}`)} />
            </View>
            {group.items.map((item) => {
              const key = itemKey(item);
              const image = item.image_path ? (item.kind === 'photo' ? previewUrl(item.image_path) : menuUrl(item.image_path)) : null;
              return (
                <View key={key} style={styles.item}>
                  {image ? <Image source={{ uri: image }} style={styles.image} contentFit="cover" /> : null}
                  <View style={styles.itemText}>
                    <Text variant="smallStrong">{item.summary}</Text>
                    <Text variant="caption" tone="muted">
                      {item.place_name} · {formatDateTime(item.created_at)}
                    </Text>
                    <View style={styles.actions}>
                      <Button
                        title={strings.admin.approveChange}
                        size="sm"
                        loading={busy === `${key}:approve`}
                        onPress={() => void act(item, 'approve')}
                      />
                      <Button
                        title={strings.admin.rejectChange}
                        size="sm"
                        variant="secondary"
                        loading={busy === `${key}:reject`}
                        onPress={() => void act(item, 'reject')}
                      />
                      {item.place_slug ? (
                        <Button title="Open place" size="sm" variant="ghost" onPress={() => router.push(`/place/${item.place_slug}`)} />
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })}
          </Card>
        ))
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.md,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  personText: {
    flex: 1,
    minWidth: 0,
  },
  item: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  image: {
    width: 96,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.bgMuted,
  },
  itemText: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
