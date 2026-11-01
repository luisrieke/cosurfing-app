import Head from 'expo-router/head';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { RequireAuth } from '@/components/RequireAuth';
import { Stars } from '@/components/Reviews';
import { ScoreBadge } from '@/components/ScoreBadge';
import { Button, CategoryBadge, Chip, EmptyState, Input, Notice, Screen, Skeleton, Text, TopBar } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { deleteReview, getMyReview, getPlaceBySlug, getPlacesToRate, upsertReview } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import type { ReviewInput } from '@/lib/types';

type DetailKey = 'wifi_rating' | 'power_rating' | 'quiet_rating' | 'comfort_rating' | 'value_rating';

const DETAILS: { key: DetailKey; label: string }[] = [
  { key: 'wifi_rating', label: strings.review.wifi },
  { key: 'power_rating', label: strings.review.power },
  { key: 'quiet_rating', label: strings.review.quiet },
  { key: 'comfort_rating', label: strings.review.comfort },
  { key: 'value_rating', label: strings.review.value },
];

const EMPTY: ReviewInput = {
  rating: 0,
  body: '',
  wifi_rating: null,
  power_rating: null,
  quiet_rating: null,
  comfort_rating: null,
  value_rating: null,
  calls_ok: null,
};

const POINTS_PER_REVIEW = 10;

export default function ReviewRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return (
    <RequireAuth title={strings.review.title} message={strings.place.signInToReview} redirect={`/place/${slug}/review`}>
      <ReviewScreen key={slug} slug={slug!} />
    </RequireAuth>
  );
}

function ReviewScreen({ slug }: { slug: string }) {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const placeQuery = useQuery(`place:${slug}`, () => getPlaceBySlug(slug));
  const place = placeQuery.data ?? null;
  const mineQuery = useQuery(`my-review:${place?.id}:${user?.id}`, () => getMyReview(user!.id, place!.id), Boolean(place && user));
  const own = mineQuery.data ?? null;

  const [form, setForm] = useState<ReviewInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ isNew: boolean } | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Prefill from the existing review once it has loaded (state adjustment during render, no effect).
  if (!hydrated && mineQuery.data !== undefined) {
    if (own) setForm({ ...EMPTY, ...own, body: own.body ?? '' });
    setHydrated(true);
  }

  const nextQuery = useQuery(
    `to-rate:${place?.city_id}`,
    () => getPlacesToRate(place!.city_id, 6),
    Boolean(place && done),
  );

  const back = () => (router.canGoBack() ? router.back() : router.replace(`/place/${slug}`));
  const set = <K extends keyof ReviewInput>(key: K, value: ReviewInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    if (!user || !place) return;
    if (form.rating < 1) {
      setError(strings.review.pickRating);
      return;
    }
    const len = form.body.trim().length;
    if (len > 0 && len < 3) {
      setError(strings.review.minBody);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await upsertReview(user.id, place.id, form);
      setDone({ isNew: !own });
      void refresh();
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
      void refresh();
      router.replace(`/place/${slug}`);
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

  if (done) {
    const next = (nextQuery.data ?? []).filter((p) => p.id !== place.id).slice(0, 5);
    return (
      <Screen>
        <Head>
          <title>{`${strings.review.saved} · Cosurfing`}</title>
        </Head>
        <TopBar title={place.name} onBack={() => router.replace(`/place/${slug}`)} />
        <View style={styles.thanks}>
          <Text variant="title">{strings.review.saved}</Text>
          {done.isNew ? (
            <View style={styles.points}>
              <Text variant="bodyStrong" tone="inverse">
                {strings.review.pointsEarned(POINTS_PER_REVIEW)}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.block}>
          <Text variant="heading">{strings.review.nextTitle}</Text>
          <Text tone="muted">{strings.review.nextBody}</Text>
        </View>
        {nextQuery.loading ? (
          <Skeleton height={160} />
        ) : next.length === 0 ? (
          <Notice tone="success" body={strings.review.nextNone} />
        ) : (
          <View style={styles.nextList}>
            {next.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => router.replace(`/place/${p.slug}/review`)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.nextItem, pressed && styles.pressed]}
              >
                <View style={styles.nextText}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {p.name}
                  </Text>
                  <View style={styles.nextMeta}>
                    <CategoryBadge category={p.category} />
                    {p.address ? (
                      <Text variant="caption" tone="muted" numberOfLines={1} style={styles.shrink}>
                        {p.address}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <ScoreBadge score={p.work_score} size="sm" />
                <Text variant="smallStrong" tone="accent">
                  {strings.place.rateThis}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        <Button title={strings.review.nextSkip} variant="ghost" onPress={() => router.replace(`/place/${slug}`)} />
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
        <CategoryBadge category={place.category} />
        <Text variant="title">{place.name}</Text>
        <Text tone="muted">{place.address ?? place.city.name}</Text>
      </View>

      <View style={styles.block}>
        <Text variant="smallStrong">{strings.review.rating}</Text>
        <Text variant="caption" tone="muted">
          {strings.review.ratingHint}
        </Text>
        <View style={styles.starsRow}>
          <Stars value={form.rating} size={32} onChange={(v) => set('rating', v)} />
          {form.rating > 0 ? (
            <Text variant="small" tone="muted">
              {form.rating} / 5
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.block}>
          <Text variant="bodyStrong">{strings.review.details}</Text>
          <Text variant="caption" tone="muted">
            {strings.review.detailsHint}
          </Text>
        </View>
        {DETAILS.map((d) => (
          <View key={d.key} style={styles.detailRow}>
            <Text variant="small" style={styles.detailLabel}>
              {d.label}
            </Text>
            <Stars
              value={form[d.key] ?? 0}
              size={24}
              onChange={(v) => set(d.key, form[d.key] === v ? null : v)}
            />
          </View>
        ))}
        <View style={styles.block}>
          <Text variant="small">{strings.review.callsOk}</Text>
          <View style={styles.chips}>
            <Chip label={strings.common.yes} icon="check" selected={form.calls_ok === true} onPress={() => set('calls_ok', form.calls_ok === true ? null : true)} />
            <Chip label={strings.common.no} icon="x" selected={form.calls_ok === false} onPress={() => set('calls_ok', form.calls_ok === false ? null : false)} />
          </View>
        </View>
      </View>

      <Input
        label={`${strings.review.bodyLabel} (${strings.common.optional})`}
        value={form.body}
        onChangeText={(v) => set('body', v)}
        placeholder={strings.review.bodyPlaceholder}
        multiline
        maxLength={2000}
        error={error}
        hint={`${form.body.trim().length} / 2000`}
      />

      <Button title={own ? strings.review.update : strings.review.submit} size="lg" fullWidth loading={busy} onPress={submit} />
      {own ? <Button title={strings.review.delete} variant="danger" icon="trash-2" onPress={remove} disabled={busy} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  block: {
    gap: spacing.xs,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignSelf: 'flex-start',
  },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  detailLabel: {
    flexShrink: 1,
  },
  chips: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  thanks: {
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  points: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  nextList: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nextItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pressed: {
    backgroundColor: colors.bgSubtle,
  },
  nextText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  nextMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  shrink: {
    flexShrink: 1,
  },
});
