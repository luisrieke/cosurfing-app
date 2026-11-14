import { Image } from 'expo-image';
import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdminShell } from '@/components/admin/AdminShell';
import { Button, Card, Notice, Skeleton, Text } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { adminGetPendingCityCovers, approveCityCover, type PendingCityCover, rejectCityCover } from '@/lib/queries';
import { cityCoverFileUrl, coverUrl } from '@/lib/storage';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';

export default function AdminCityCovers() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const covers = useQuery('admin-city-covers', adminGetPendingCityCovers, isAdmin);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (cover: PendingCityCover, decision: 'approve' | 'reject') => {
    setBusy(`${cover.id}:${decision}`);
    setError(null);
    try {
      if (decision === 'approve') await approveCityCover(cover);
      else await rejectCityCover(cover);
      await covers.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminShell title={strings.admin.cityCovers}>
      <Head>
        <title>City covers · Admin · Cosurfing</title>
      </Head>
      <Text tone="muted">{strings.admin.cityCoversHint}</Text>
      {error ? <Notice tone="danger" body={error} /> : null}
      {covers.loading && !covers.data ? (
        <Skeleton height={240} />
      ) : covers.error ? (
        <Notice tone="danger" body={covers.error.message} />
      ) : (covers.data ?? []).length === 0 ? (
        <Text tone="muted">{strings.admin.noItems}</Text>
      ) : (
        <View style={styles.grid}>
          {(covers.data ?? []).map((c) => (
            <Card key={c.id} style={styles.card}>
              <Image source={{ uri: cityCoverFileUrl(c.full_path) }} style={styles.image} contentFit="cover" />
              <View style={styles.titleRow}>
                <View style={styles.titleText}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {c.city ? `${c.city.name}, ${c.city.country_name}` : 'Deleted city'}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {strings.admin.uploadedBy(c.uploader?.display_name ?? 'Cosurfer')} · {formatDateTime(c.created_at)}
                  </Text>
                </View>
                {c.city?.cover_thumb_url ? (
                  <View style={styles.current}>
                    <Image source={{ uri: coverUrl(c.city.cover_thumb_url, 240) }} style={styles.currentImage} contentFit="cover" />
                    <Text variant="caption" tone="faint">
                      {strings.admin.currentCover}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.actions}>
                <Button
                  title={strings.admin.approveCover}
                  size="sm"
                  loading={busy === `${c.id}:approve`}
                  disabled={busy !== null}
                  onPress={() => act(c, 'approve')}
                />
                <Button
                  title={strings.admin.rejectPhoto}
                  size="sm"
                  variant="secondary"
                  loading={busy === `${c.id}:reject`}
                  disabled={busy !== null}
                  onPress={() => act(c, 'reject')}
                />
                {c.city ? <Button title="Open city" size="sm" variant="ghost" onPress={() => router.push(`/${c.city!.slug}`)} /> : null}
              </View>
            </Card>
          ))}
        </View>
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  card: {
    width: 420,
    maxWidth: '100%',
    gap: spacing.sm,
  },
  image: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    backgroundColor: colors.bgMuted,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  titleText: {
    flex: 1,
    minWidth: 0,
  },
  current: {
    alignItems: 'center',
    gap: 2,
  },
  currentImage: {
    width: 80,
    height: 45,
    borderRadius: radius.sm,
    backgroundColor: colors.bgMuted,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
});
