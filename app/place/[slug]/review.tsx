import { Image } from 'expo-image';
import Head from 'expo-router/head';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { RequireAuth } from '@/components/RequireAuth';
import { MenuGallery } from '@/components/place/PlaceSections';
import { Stars } from '@/components/Reviews';
import { ScoreBadge } from '@/components/ScoreBadge';
import { Button, CategoryBadge, Chip, EmptyState, Icon, Input, Notice, Screen, Skeleton, Text, TopBar } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { FACT_KEYS, dayPassCurrency, factAppliesTo, formatFactValue, summarizeFacts, type FactSummary } from '@/lib/facts';
import {
  MAX_MENU_PHOTOS_PER_UPLOAD,
  MAX_USER_PHOTOS_PER_UPLOAD,
  MenuLimitError,
  deletePlaceMenu,
  pickImages,
  uploadPlaceMenu,
  uploadPlacePhoto,
} from '@/lib/photoUpload';
import {
  deleteReview,
  getMyFacts,
  getMyReview,
  getPlaceBySlug,
  getPlaceFacts,
  getPlaceMenus,
  getPlacesToRate,
  savePlaceFacts,
  upsertReview,
} from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import type { FactInput, FactKey, FactValue, PlaceMenu, ReviewInput, WebFacts } from '@/lib/types';

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

/** Facts answered with chips; opening hours and the day pass price are typed. */
function factChoices(key: FactKey, web: WebFacts): { value: FactValue; label: string }[] {
  const yesNo = [
    { value: true, label: strings.common.yes },
    { value: false, label: strings.common.no },
  ];
  switch (key) {
    case 'laptops':
      return [
        { value: 'welcome', label: strings.place.laptopsWelcome },
        { value: 'not_allowed', label: strings.place.laptopsNotAllowed },
      ];
    case 'price_range':
      return [1, 2, 3, 4].map((level) => ({ value: level, label: formatFactValue('price_range', level, web) }));
    case 'opening_hours':
    case 'day_pass':
      return [];
    default:
      return yesNo;
  }
}

interface FactDraft {
  choices: FactInput;
  hours: string;
  dayPass: string;
}

function toDraft(input: FactInput): FactDraft {
  const { opening_hours, day_pass, ...choices } = input;
  return {
    choices,
    hours: typeof opening_hours === 'string' ? opening_hours : '',
    dayPass: day_pass && typeof day_pass === 'object' ? String(day_pass.amount) : '',
  };
}

/** The draft with the combined value of a fact copied in, or null if that value can't be taken over as is. */
function withConfirmedFact(draft: FactDraft, f: FactSummary, web: WebFacts): FactDraft | null {
  const v = f.value;
  switch (f.key) {
    case 'opening_hours':
      return typeof v === 'string' ? { ...draft, hours: v } : null;
    case 'day_pass':
      return v && typeof v === 'object' && v.currency === dayPassCurrency(web) ? { ...draft, dayPass: String(v.amount) } : null;
    case 'price_range':
      return typeof v === 'number'
        ? { ...draft, choices: { ...draft.choices, price_range: Math.min(4, Math.max(1, Math.round(v))) } }
        : null;
    default:
      return { ...draft, choices: { ...draft.choices, [f.key]: v } };
  }
}

function sameFactValue(a: FactDraft, b: FactDraft, key: FactKey): boolean {
  if (key === 'opening_hours') return a.hours.trim() === b.hours.trim();
  if (key === 'day_pass') {
    const amount = (d: FactDraft) => (d.dayPass.trim() ? Number(d.dayPass.trim().replace(',', '.')) : NaN);
    return amount(a) === amount(b);
  }
  return a.choices[key] === b.choices[key];
}

type ConfirmState = { next: FactDraft } | 'confirmed' | null;

function confirmState(draft: FactDraft, f: FactSummary | undefined, web: WebFacts): ConfirmState {
  const next = f ? withConfirmedFact(draft, f, web) : null;
  if (!f || !next) return null;
  return sameFactValue(draft, next, f.key) ? 'confirmed' : { next };
}

function CurrentValueRow({ text, state, onConfirm }: { text: string; state: ConfirmState; onConfirm: () => void }) {
  return (
    <View style={styles.currentRow}>
      <Text variant="caption" tone="muted" style={styles.shrink}>
        {text}
      </Text>
      {state === 'confirmed' ? (
        <View style={styles.confirmed}>
          <Icon name="check" size={13} color={colors.textMuted} />
          <Text variant="caption" tone="muted">
            {strings.review.factConfirmed}
          </Text>
        </View>
      ) : state ? (
        <Pressable
          onPress={onConfirm}
          accessibilityRole="button"
          hitSlop={6}
          style={({ pressed }) => [styles.confirmPill, pressed && styles.pressed]}
        >
          <Icon name="check" size={13} color={colors.accent} />
          <Text variant="caption" tone="accent">
            {strings.review.confirmFact}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

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
  const { user, refresh, isAdmin, isLocalGuide } = useAuth();
  const photosGoLive = isAdmin || isLocalGuide;
  const placeQuery = useQuery(`place:${slug}`, () => getPlaceBySlug(slug));
  const place = placeQuery.data ?? null;
  const mineQuery = useQuery(`my-review:${place?.id}:${user?.id}`, () => getMyReview(user!.id, place!.id), Boolean(place && user));
  const own = mineQuery.data ?? null;

  const [form, setForm] = useState<ReviewInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{
    isNew: boolean;
    photosSent: number;
    photosFailed: number;
    photoFailReason: string | null;
  } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const myFactsQuery = useQuery(`my-facts:${place?.id}:${user?.id}`, () => getMyFacts(user!.id, place!.id), Boolean(place && user));
  const factsQuery = useQuery(`facts:${place?.id}`, () => getPlaceFacts(place!.id), Boolean(place));
  const [facts, setFacts] = useState<FactDraft>(() => toDraft({}));
  const [factError, setFactError] = useState<{ key: FactKey; message: string } | null>(null);
  const [factsHydrated, setFactsHydrated] = useState(false);
  const menusQuery = useQuery(`menus:${place?.id}:${user?.id}`, () => getPlaceMenus(place!.id), Boolean(place && user));
  const [hoursBusy, setHoursBusy] = useState<string | null>(null);
  const [hoursError, setHoursError] = useState<string | null>(null);
  const [hoursSaved, setHoursSaved] = useState(0);

  // Prefill from the existing review once it has loaded (state adjustment during render, no effect).
  if (!hydrated && mineQuery.data !== undefined) {
    if (own) setForm({ ...EMPTY, ...own, body: own.body ?? '' });
    setHydrated(true);
  }
  if (!factsHydrated && myFactsQuery.data !== undefined) {
    setFacts(toDraft(myFactsQuery.data));
    setFactsHydrated(true);
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
    const factInput: FactInput = { ...facts.choices };
    const hours = facts.hours.trim();
    if (hours) {
      if (hours.length < 3) {
        setFactError({ key: 'opening_hours', message: strings.review.invalidOpeningHours });
        return;
      }
      factInput.opening_hours = hours;
    }
    const dayPass = facts.dayPass.trim().replace(',', '.');
    if (dayPass) {
      const amount = Number(dayPass);
      if (!Number.isFinite(amount) || amount < 0 || amount > 10_000) {
        setFactError({ key: 'day_pass', message: strings.review.invalidDayPass });
        return;
      }
      factInput.day_pass = { amount, currency: dayPassCurrency(place.web_facts ?? {}) };
    }
    setFactError(null);
    setPhotoError(null);
    setBusy(true);
    setError(null);
    try {
      await upsertReview(user.id, place.id, form);
      // Only replace the stored facts once we know what they were, so a failed load never wipes them.
      if (factsHydrated) await savePlaceFacts(place.id, factInput);
      const rightsAcceptedAt = new Date().toISOString();
      let sent = 0;
      let photoFailReason: string | null = null;
      for (const [i, uri] of photos.entries()) {
        setProgress(strings.photos.uploading(i + 1, photos.length));
        try {
          await uploadPlacePhoto(place.id, uri, 1000 + i, { userId: user.id, rightsAcceptedAt });
          sent += 1;
        } catch (e) {
          // The review is already saved; report failed photos on the thanks screen instead.
          console.error('Photo upload failed', e);
          photoFailReason ??= e instanceof Error ? e.message : null;
        }
      }
      setDone({ isNew: !own, photosSent: sent, photosFailed: photos.length - sent, photoFailReason });
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const addPhotos = async () => {
    setPhotoError(null);
    try {
      const uris = await pickImages(MAX_USER_PHOTOS_PER_UPLOAD - photos.length);
      if (uris.length > 0) setPhotos((p) => [...p, ...uris].slice(0, MAX_USER_PHOTOS_PER_UPLOAD));
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    }
  };

  const uploadHours = async () => {
    if (!user || !place) return;
    setHoursError(null);
    setHoursSaved(0);
    let done = 0;
    try {
      const uris = await pickImages(MAX_MENU_PHOTOS_PER_UPLOAD);
      if (uris.length === 0) return;
      for (const uri of uris) {
        setHoursBusy(strings.review.hoursUploading(done + 1, uris.length));
        await uploadPlaceMenu(place.id, user.id, uri, 'hours');
        done += 1;
      }
    } catch (e) {
      const message = e instanceof MenuLimitError ? strings.review.hoursLimit : e instanceof Error ? e.message : strings.common.somethingWentWrong;
      setHoursError(message);
    } finally {
      setHoursBusy(null);
      setHoursSaved(done);
      if (done > 0) void menusQuery.refetch(true);
    }
  };

  const removeHours = async (m: PlaceMenu) => {
    setHoursError(null);
    try {
      await deletePlaceMenu(m);
      void menusQuery.refetch(true);
    } catch (e) {
      setHoursError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
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
          <Text variant="title">
          {photosGoLive ? strings.review.saved : done.isNew ? strings.review.savedPending : strings.review.editPendingNote}
        </Text>
          {done.isNew ? (
            <View style={styles.points}>
              <Text variant="bodyStrong" tone="inverse">
                {strings.review.pointsEarned(POINTS_PER_REVIEW)}
              </Text>
            </View>
          ) : null}
        </View>
        {done.photosSent > 0 ? <Notice tone="success" body={photosGoLive ? strings.photos.thanksLive(done.photosSent) : strings.photos.thanks(done.photosSent)} /> : null}
        {done.photosFailed > 0 ? (
          <Notice
            tone="danger"
            body={done.photoFailReason ? `${strings.review.photosFailed(done.photosFailed)} ${done.photoFailReason}` : strings.review.photosFailed(done.photosFailed)}
          />
        ) : null}

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

  const web = place.web_facts ?? {};
  const summaries = summarizeFacts(web, factsQuery.data ?? []);
  const factKeys = FACT_KEYS.filter(
    (k) => factAppliesTo(k, place.category) || summaries.some((s) => s.key === k) || myFactsQuery.data?.[k] !== undefined,
  );
  const confirmable = summaries.filter((s) => {
    const state = factKeys.includes(s.key) ? confirmState(facts, s, web) : null;
    return state !== null && state !== 'confirmed';
  });
  const setChoice = (key: FactKey, value: FactValue) =>
    setFacts((f) => {
      const choices = { ...f.choices };
      if (choices[key] === value) delete choices[key];
      else choices[key] = value;
      return { ...f, choices };
    });

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

      <View style={styles.card}>
        <View style={styles.block}>
          <Text variant="bodyStrong">{strings.review.facts}</Text>
          <Text variant="caption" tone="muted">
            {strings.review.factsHint}
          </Text>
        </View>
        {confirmable.length >= 2 ? (
          <Button
            title={strings.review.confirmAllFacts}
            icon="check-circle"
            variant="secondary"
            size="sm"
            onPress={() => {
              setFacts((f) => confirmable.reduce((d, s) => withConfirmedFact(d, s, web) ?? d, f));
              setFactError(null);
            }}
            style={styles.selfStart}
          />
        ) : null}
        {factKeys.map((key) => {
          const current = summaries.find((s) => s.key === key);
          const state = confirmState(facts, current, web);
          const currentRow = current ? (
            <CurrentValueRow
              text={strings.review.factsCurrently(current.display)}
              state={state}
              onConfirm={() => {
                setFacts((f) => withConfirmedFact(f, current, web) ?? f);
                if (factError?.key === key) setFactError(null);
              }}
            />
          ) : null;
          const label = strings.place.factLabels[key];
          if (key === 'opening_hours' || key === 'day_pass') {
            const isHours = key === 'opening_hours';
            const currency = dayPassCurrency(web);
            const input = (
              <Input
                label={isHours ? label : `${label} (${currency})`}
                value={isHours ? facts.hours : facts.dayPass}
                onChangeText={(v) => setFacts((f) => (isHours ? { ...f, hours: v } : { ...f, dayPass: v }))}
                placeholder={isHours ? strings.review.openingHoursPlaceholder : strings.review.dayPassPlaceholder(currency)}
                keyboardType={isHours ? 'default' : 'decimal-pad'}
                maxLength={isHours ? 300 : 10}
                error={factError?.key === key ? factError.message : null}
              />
            );
            if (!isHours) {
              return (
                <View key={key} style={styles.block}>
                  {input}
                  {currentRow}
                </View>
              );
            }
            const myHoursPhotos = (menusQuery.data ?? []).filter((m) => m.kind === 'hours' && m.is_own);
            return (
              <View key={key} style={styles.block}>
                {input}
                {currentRow}
                <Text variant="caption" tone="muted">
                  {strings.review.hoursPhotosHint}
                </Text>
                {myHoursPhotos.length > 0 ? (
                  <MenuGallery kind="hours" showHint={false} menus={myHoursPhotos} onDelete={removeHours} canDelete={() => true} />
                ) : null}
                {hoursError ? <Notice tone="danger" body={hoursError} /> : null}
                {hoursSaved > 0 ? (
                  <Notice
                    tone="success"
                    body={photosGoLive ? strings.review.hoursSaved(hoursSaved) : strings.review.hoursSavedPending(hoursSaved)}
                  />
                ) : null}
                <Button
                  title={hoursBusy ?? strings.review.addHoursPhotos}
                  icon="camera"
                  variant="secondary"
                  size="sm"
                  loading={hoursBusy !== null}
                  disabled={hoursBusy !== null}
                  onPress={uploadHours}
                  style={styles.selfStart}
                />
              </View>
            );
          }
          return (
            <View key={key} style={styles.block}>
              <Text variant="small">{label}</Text>
              {currentRow}
              <View style={styles.chips}>
                {factChoices(key, web).map((c) => (
                  <Chip
                    key={String(c.value)}
                    label={c.label}
                    selected={facts.choices[key] === c.value}
                    onPress={() => setChoice(key, c.value)}
                  />
                ))}
              </View>
            </View>
          );
        })}
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

      <View style={styles.card}>
        <View style={styles.block}>
          <Text variant="bodyStrong">{`${strings.review.photos} (${strings.common.optional})`}</Text>
          <Text variant="caption" tone="muted">
            {strings.review.photosHint}
          </Text>
        </View>
        {photos.length > 0 ? (
          <View style={styles.thumbs}>
            {photos.map((uri) => (
              <View key={uri} style={styles.thumb}>
                <Image source={{ uri }} style={styles.thumbImage} contentFit="cover" />
                <Pressable
                  onPress={() => setPhotos((p) => p.filter((u) => u !== uri))}
                  disabled={busy}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={strings.review.removePhoto}
                  style={styles.thumbRemove}
                >
                  <Icon name="x" size={14} color={colors.surface} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        {photos.length < MAX_USER_PHOTOS_PER_UPLOAD ? (
          <Button
            title={strings.review.addPhotos}
            icon="camera"
            variant="secondary"
            size="sm"
            onPress={addPhotos}
            disabled={busy}
            style={styles.selfStart}
          />
        ) : null}
        {photos.length > 0 ? (
          <Text variant="caption" tone="muted">
            {strings.photos.rules}
            {photosGoLive ? '' : ` ${strings.photos.reviewNote}`}
          </Text>
        ) : null}
        {photoError ? <Notice tone="danger" body={photoError} /> : null}
      </View>

      <Button
        title={progress ?? (own ? strings.review.update : strings.review.submit)}
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
    flexWrap: 'wrap',
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
  thumbs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  thumb: {
    width: 80,
    height: 80,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.bgMuted,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selfStart: {
    alignSelf: 'flex-start',
  },
  currentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  confirmed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  confirmPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accent,
  },
});
