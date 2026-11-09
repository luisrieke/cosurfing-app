import { Image } from 'expo-image';
import Head from 'expo-router/head';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { WifiNoteList } from '@/components/place/PlaceSections';
import { RequireAuth } from '@/components/RequireAuth';
import { Button, CategoryBadge, EmptyState, Input, Notice, Screen, Skeleton, Text, TopBar } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { WifiNoteLimitError, createWifiNote, deleteWifiNote, pickImage } from '@/lib/photoUpload';
import { getPlaceBySlug, getPlaceWifiNotes } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import type { PlaceWifiNote } from '@/lib/types';

export default function WifiRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return (
    <RequireAuth title={strings.wifi.screenTitle} message={strings.wifi.signIn} redirect={`/place/${slug}/wifi`}>
      <WifiScreen key={slug} slug={slug!} />
    </RequireAuth>
  );
}

function WifiScreen({ slug }: { slug: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const placeQuery = useQuery(`place:${slug}`, () => getPlaceBySlug(slug));
  const place = placeQuery.data ?? null;
  const notesQuery = useQuery(`wifi-notes:${place?.id}:${user?.id}`, () => getPlaceWifiNotes(place!.id), Boolean(place && user));

  const [body, setBody] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace(`/place/${slug}`));

  const choosePhoto = async () => {
    setError(null);
    try {
      const uri = await pickImage();
      if (uri) {
        setPhotoUri(uri);
        setSaved(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    }
  };

  const submit = async () => {
    if (!user || !place) return;
    const text = body.trim();
    if (!text && !photoUri) {
      setError(strings.wifi.needContent);
      return;
    }
    setError(null);
    setBusy(true);
    setSaved(false);
    try {
      await createWifiNote(place.id, user.id, { body: text || null, photoUri });
      setBody('');
      setPhotoUri(null);
      setSaved(true);
      void notesQuery.refetch(true);
    } catch (e) {
      setError(e instanceof WifiNoteLimitError ? strings.wifi.limit : e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (note: PlaceWifiNote) => {
    setError(null);
    try {
      await deleteWifiNote(note);
      void notesQuery.refetch(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    }
  };

  if (placeQuery.loading) {
    return (
      <Screen>
        <TopBar title={strings.wifi.screenTitle} onBack={back} />
        <Skeleton height={28} width="60%" />
        <Skeleton height={240} />
      </Screen>
    );
  }
  if (!place || place.status !== 'published') {
    return (
      <Screen>
        <TopBar title={strings.wifi.screenTitle} onBack={back} />
        <EmptyState icon="map-pin" title={strings.place.notFound} actionLabel={strings.notFound.home} onAction={() => router.replace('/')} />
      </Screen>
    );
  }

  const w = strings.wifi;
  const myNotes = (notesQuery.data ?? []).filter((n) => n.is_own);

  return (
    <Screen>
      <Head>
        <title>{`${w.screenTitle} · ${place.name} · Cosurfing`}</title>
      </Head>
      <TopBar title={w.screenTitle} onBack={back} />
      <View style={styles.intro}>
        <CategoryBadge category={place.category} />
        <Text variant="title">{place.name}</Text>
        <Text tone="muted">{w.intro}</Text>
      </View>

      <View style={styles.card}>
        <Text variant="bodyStrong">{w.newNote}</Text>
        <Input
          label={w.body}
          optional
          value={body}
          onChangeText={(v) => {
            setBody(v);
            setSaved(false);
          }}
          placeholder={w.bodyPlaceholder}
          multiline
          maxLength={500}
        />
        <View style={styles.block}>
          <Text variant="smallStrong">{w.photo}</Text>
          <Text variant="caption" tone="muted">
            {w.photoHint}
          </Text>
          {photoUri ? <Image source={{ uri: photoUri }} style={styles.preview} contentFit="cover" /> : null}
          <View style={styles.row}>
            <Button
              title={photoUri ? w.changePhoto : w.choosePhoto}
              icon="camera"
              variant="secondary"
              size="sm"
              disabled={busy}
              onPress={choosePhoto}
            />
            {photoUri ? (
              <Button title={w.removePhoto} icon="x" variant="ghost" size="sm" disabled={busy} onPress={() => setPhotoUri(null)} />
            ) : null}
          </View>
        </View>
        {error ? <Notice tone="danger" body={error} /> : null}
        {saved ? <Notice tone="success" body={w.saved} /> : null}
        <Button title={busy ? w.saving : w.submit} icon="send" fullWidth loading={busy} disabled={busy} onPress={submit} />
      </View>

      {myNotes.length > 0 ? (
        <View style={styles.block}>
          <Text variant="heading">{w.yourNotes}</Text>
          <WifiNoteList notes={myNotes} showHint={false} onDelete={remove} canDelete={() => true} />
        </View>
      ) : null}

      <Button title={strings.review.backToPlace} variant="ghost" onPress={() => router.replace(`/place/${slug}`)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  block: {
    gap: spacing.sm,
  },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  preview: {
    width: 160,
    height: 160,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgMuted,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
