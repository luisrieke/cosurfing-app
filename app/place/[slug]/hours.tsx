import Head from 'expo-router/head';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LaptopHoursEditor, type LaptopWeek, WeeklyHoursEditor } from '@/components/hours';
import { RequireAuth } from '@/components/RequireAuth';
import { Button, CategoryBadge, EmptyState, Notice, Screen, Skeleton, Text, TopBar } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import {
  compactLaptopWeek,
  dayError,
  DAY_KEYS,
  defaultPreset,
  fullLaptopWeek,
  isLaptopHours,
  isWeeklyHours,
  laptopsAnswer,
  normalizeWeek,
  presetHours,
  sameWeek,
  sortIntervals,
  weekError,
  type WeeklyHours,
} from '@/lib/hours';
import { getMyFacts, getPlaceBySlug, savePlaceFacts } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import type { FactInput } from '@/lib/types';

export default function HoursRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return (
    <RequireAuth title={strings.hours.editTitle} message={strings.hours.editSignIn} redirect={`/place/${slug}/hours`}>
      <HoursScreen key={slug} slug={slug!} />
    </RequireAuth>
  );
}

function HoursScreen({ slug }: { slug: string }) {
  const router = useRouter();
  const { user, isAdmin, isLocalGuide } = useAuth();
  const placeQuery = useQuery(`place:${slug}`, () => getPlaceBySlug(slug));
  const place = placeQuery.data ?? null;
  const myFactsQuery = useQuery(`my-facts:${place?.id}:${user?.id}`, () => getMyFacts(user!.id, place!.id), Boolean(place && user));
  const mine = myFactsQuery.data;

  const [hours, setHours] = useState<WeeklyHours | null>(null);
  const [laptop, setLaptop] = useState<LaptopWeek | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  // Start from the member's own answer, else the hours shown on the place page (state adjustment during render).
  if (!hydrated && place && mine !== undefined) {
    setHours(isWeeklyHours(mine.opening_hours) ? normalizeWeek(mine.opening_hours) : place.hours ? normalizeWeek(place.hours) : null);
    setLaptop(isLaptopHours(mine.laptop_hours) ? fullLaptopWeek(mine.laptop_hours) : null);
    setHydrated(true);
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace(`/place/${slug}`));

  if (placeQuery.loading || (place && !hydrated && !myFactsQuery.error)) {
    return (
      <Screen>
        <TopBar title={strings.hours.editTitle} onBack={back} />
        <Skeleton height={28} width="60%" />
        <Skeleton height={320} />
      </Screen>
    );
  }
  if (!place || place.status !== 'published') {
    return (
      <Screen>
        <TopBar title={strings.hours.editTitle} onBack={back} />
        <EmptyState icon="map-pin" title={strings.place.notFound} actionLabel={strings.notFound.home} onAction={() => router.replace('/')} />
      </Screen>
    );
  }

  const h = strings.hours;
  const he = h.editor;
  const coliving = place.category === 'coliving';
  const ownHours = mine && isWeeklyHours(mine.opening_hours);

  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setSaved(false);
    setError(null);
  };

  const save = async () => {
    if (!mine) return;
    const next: FactInput = { ...mine };
    delete next.opening_hours;
    delete next.laptop_hours;

    if (hours) {
      const bad = weekError(hours);
      if (bad) {
        setError(he.invalidDay(h.dayLong[bad.day], he.errors[bad.error] ?? ''));
        return;
      }
    }
    // Unchanged prefilled hours are not an answer of the member's own.
    if (hours && (ownHours || !place.hours || !sameWeek(hours, place.hours))) {
      next.opening_hours = normalizeWeek(hours);
    } else if (typeof mine.opening_hours === 'string') {
      next.opening_hours = mine.opening_hours;
    }

    if (laptop && !coliving) {
      const badDay = DAY_KEYS.find((d) => {
        const day = laptop[d];
        return day.mode === 'specific' && dayError(sortIntervals(day.ranges)) !== null;
      });
      if (badDay) {
        const day = laptop[badDay];
        const err = day.mode === 'specific' ? dayError(sortIntervals(day.ranges)) : null;
        setError(he.invalidDay(h.dayLong[badDay], err ? (he.errors[err] ?? '') : ''));
        return;
      }
      const compact = compactLaptopWeek(laptop);
      if (!compact) {
        setError(he.laptopEmpty);
        return;
      }
      next.laptop_hours = compact;
      if (next.laptops === undefined) {
        const answer = laptopsAnswer(compact);
        if (answer) next.laptops = answer;
      }
    } else if (mine.laptop_hours !== undefined && coliving) {
      next.laptop_hours = mine.laptop_hours;
    }

    setError(null);
    setBusy(true);
    try {
      await savePlaceFacts(place.id, next);
      await myFactsQuery.refetch(true);
      void placeQuery.refetch(true);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Head>
        <title>{`${h.editTitle} · ${place.name} · Cosurfing`}</title>
      </Head>
      <TopBar title={h.editTitle} onBack={back} />
      <View style={styles.intro}>
        <CategoryBadge category={place.category} />
        <Text variant="title">{place.name}</Text>
        <Text tone="muted">{h.editIntro}</Text>
      </View>

      <View style={styles.card}>
        <Text variant="bodyStrong">{h.title}</Text>
        {place.hours_source === 'team' ? <Notice tone="info" body={h.editTeamChecked} /> : null}
        {hours ? (
          <>
            <WeeklyHoursEditor value={hours} onChange={change(setHours)} category={place.category} />
            <Button
              title={ownHours ? he.reviewRemove : h.editClear}
              icon="x"
              variant="ghost"
              size="sm"
              onPress={() => change(setHours)(null)}
              style={styles.selfStart}
            />
          </>
        ) : (
          <View style={styles.row}>
            <Button
              title={he.reviewAdd}
              icon="clock"
              variant="secondary"
              size="sm"
              onPress={() => change(setHours)(presetHours(defaultPreset(place.category)))}
            />
            {place.hours ? (
              <Button
                title={he.reviewStartCurrent}
                icon="copy"
                variant="ghost"
                size="sm"
                onPress={() => change(setHours)(normalizeWeek(place.hours!))}
              />
            ) : null}
          </View>
        )}
      </View>

      {!coliving ? (
        <View style={styles.card}>
          <Text variant="bodyStrong">{h.laptopTitle}</Text>
          <Text variant="caption" tone="muted">
            {he.reviewLaptopHint}
          </Text>
          {laptop ? (
            <>
              <LaptopHoursEditor value={laptop} onChange={change(setLaptop)} hours={hours ?? place.hours} />
              <Button
                title={he.reviewRemove}
                icon="x"
                variant="ghost"
                size="sm"
                onPress={() => change(setLaptop)(null)}
                style={styles.selfStart}
              />
            </>
          ) : (
            <Button
              title={he.reviewLaptopAdd}
              icon="monitor"
              variant="secondary"
              size="sm"
              onPress={() => change(setLaptop)(fullLaptopWeek(null))}
              style={styles.selfStart}
            />
          )}
        </View>
      ) : null}

      {myFactsQuery.error ? <Notice tone="danger" body={myFactsQuery.error.message} /> : null}
      {error ? <Notice tone="danger" body={error} /> : null}
      {saved ? <Notice tone="success" body={isAdmin || isLocalGuide ? h.editSaved : h.editSavedPending} /> : null}
      <Button
        title={busy ? h.editSaving : h.editSave}
        icon="check"
        fullWidth
        loading={busy}
        disabled={busy || !mine}
        onPress={save}
      />
      <Button title={strings.review.backToPlace} variant="ghost" onPress={() => router.replace(`/place/${slug}`)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  selfStart: {
    alignSelf: 'flex-start',
  },
});
