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
import { adminApprovePhoto, adminGetPendingPhotos, moderateContribution, type PendingPhoto } from '@/lib/queries';
import { signedPhotoUrls } from '@/lib/storage';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';

async function loadPending(): Promise<(PendingPhoto & { url: string | null })[]> {
  const photos = await adminGetPendingPhotos();
  const urls = await signedPhotoUrls(photos.map((p) => p.full_path));
  return photos.map((p) => ({ ...p, url: urls.get(p.full_path) ?? null }));
}

export default function AdminPhotos() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const photos = useQuery('admin-photos', loadPending, isAdmin);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (photo: PendingPhoto, decision: 'approve' | 'reject') => {
    setBusy(`${photo.id}:${decision}`);
    setError(null);
    try {
      if (decision === 'approve') await adminApprovePhoto(photo.id);
      else await moderateContribution({ kind: 'photo', decision: 'reject', id: photo.id });
      await photos.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminShell title={strings.admin.photos}>
      <Head>
        <title>Photos · Admin · Cosurfing</title>
      </Head>
      <Text tone="muted">{strings.admin.photosHint}</Text>
      {error ? <Notice tone="danger" body={error} /> : null}
      {photos.loading && !photos.data ? (
        <Skeleton height={240} />
      ) : photos.error ? (
        <Notice tone="danger" body={photos.error.message} />
      ) : (photos.data ?? []).length === 0 ? (
        <Text tone="muted">{strings.admin.noItems}</Text>
      ) : (
        <View style={styles.grid}>
          {(photos.data ?? []).map((p) => (
            <Card key={p.id} style={styles.card}>
              {p.url ? (
                <Image source={{ uri: p.url }} style={styles.image} contentFit="cover" />
              ) : (
                <View style={[styles.image, styles.missing]} />
              )}
              <Text variant="bodyStrong" numberOfLines={1}>
                {p.place?.name ?? 'Deleted place'}
              </Text>
              <Text variant="caption" tone="muted">
                {strings.admin.uploadedBy(p.uploader?.display_name ?? 'Cosurfer')} · {formatDateTime(p.created_at)}
              </Text>
              <View style={styles.actions}>
                <Button
                  title={strings.admin.approvePhoto}
                  size="sm"
                  loading={busy === `${p.id}:approve`}
                  onPress={() => act(p, 'approve')}
                />
                <Button
                  title={strings.admin.rejectPhoto}
                  size="sm"
                  variant="secondary"
                  loading={busy === `${p.id}:reject`}
                  onPress={() => act(p, 'reject')}
                />
                {p.place ? (
                  <Button title="Open place" size="sm" variant="ghost" onPress={() => router.push(`/place/${p.place!.slug}`)} />
                ) : null}
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
    width: 300,
    maxWidth: '100%',
    gap: spacing.sm,
  },
  image: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
  },
  missing: {
    backgroundColor: colors.bgMuted,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
});
