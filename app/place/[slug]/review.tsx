import Head from 'expo-router/head';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { RequireAuth } from '@/components/RequireAuth';
import { Stars } from '@/components/Reviews';
import { Button, EmptyState, Input, Notice, Screen, Skeleton, Text, TopBar } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { deleteReview, getPlaceBySlug, getPlaceReviews, upsertReview } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, spacing } from '@/lib/theme';

export default function ReviewRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return (
    <RequireAuth title={strings.review.title} message={strings.place.signInToReview} redirect={`/place/${slug}/review`}>
      <ReviewScreen slug={slug!} />
    </RequireAuth>
  );
}

function ReviewScreen({ slug }: { slug: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const placeQuery = useQuery(`place:${slug}`, () => getPlaceBySlug(slug));
  const place = placeQuery.data ?? null;
  const reviewsQuery = useQuery(`reviews:${place?.id}:${user?.id}`, () => getPlaceReviews(place!.id), Boolean(place));
  const own = (reviewsQuery.data ?? []).find((r) => r.is_own) ?? null;

  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Prefill from the existing review once it has loaded (state adjustment during render, no effect).
  if (!hydrated && reviewsQuery.data) {
    if (own) {
      setRating(own.rating);
      setBody(own.body ?? '');
    }
    setHydrated(true);
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace(`/place/${slug}`));

  const submit = async () => {
    if (!user || !place) return;
    if (rating < 1) {
      setError(strings.review.pickRating);
      return;
    }
    if (body.trim().length < 10) {
      setError(strings.review.minBody);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await upsertReview(user.id, place.id, rating, body);
      setDone(true);
      setTimeout(back, 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!user || !place) return;
    setBusy(true);
    try {
      await deleteReview(user.id, place.id);
      back();
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
      setBusy(false);
    }
  };

  if (placeQuery.loading) {
    return (
      <Screen>
        <TopBar title={strings.review.title} onBack={back} />
        <Skeleton height={28} width="60%" />
        <Skeleton height={120} />
      </Screen>
    );
  }
  if (!place || place.status !== 'published') {
    return (
      <Screen>
        <TopBar title={strings.review.title} onBack={back} />
        <EmptyState icon="map-pin" title={strings.place.notFound} actionLabel={strings.notFound.home} onAction={() => router.replace('/')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Head>
        <title>{`Review · ${place.name} · Cosurfing`}</title>
      </Head>
      <TopBar title={own ? strings.place.editReview : strings.place.writeReview} onBack={back} />
      <View style={styles.intro}>
        <Text variant="title">{place.name}</Text>
        <Text tone="muted">{place.address ?? place.city.name}</Text>
      </View>

      {done ? <Notice tone="success" body={strings.review.saved} /> : null}
      {own?.status === 'hidden' ? <Notice tone="warning" body={strings.review.hiddenNote} /> : null}

      <View style={styles.block}>
        <Text variant="smallStrong">{strings.review.rating}</Text>
        <View style={styles.starsRow}>
          <Stars value={rating} size={32} onChange={setRating} />
          {rating > 0 ? (
            <Text variant="small" tone="muted">
              {rating} / 5
            </Text>
          ) : null}
        </View>
      </View>

      <Input
        label={strings.review.title}
        value={body}
        onChangeText={setBody}
        placeholder={strings.review.bodyPlaceholder}
        multiline
        maxLength={2000}
        error={error}
        hint={`${body.trim().length} / 2000`}
      />

      <Button
        title={own ? strings.review.update : strings.review.submit}
        size="lg"
        fullWidth
        loading={busy}
        onPress={submit}
      />
      {own ? <Button title={strings.review.delete} variant="danger" icon="trash-2" onPress={remove} disabled={busy} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    gap: spacing.xs,
  },
  block: {
    gap: spacing.sm,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
});
