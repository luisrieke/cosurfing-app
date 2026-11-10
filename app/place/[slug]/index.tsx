import Head from 'expo-router/head';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';

import { RankedPlaceRow } from '@/components/city/RankedPlaceRow';
import { LaptopHoursCard, OpeningHoursCard } from '@/components/hours';
import { PhotoGallery } from '@/components/PhotoGallery';
import { AddPhotos } from '@/components/place/AddPhotos';
import { OwnerCta } from '@/components/place/OwnerCta';
import {
  DetailRatings,
  FactTable,
  MenuGallery,
  OfferList,
  RatingDistribution,
  ScoreBreakdownCard,
  ScoreInfoModal,
  SpeedTestHistory,
  VenueFactsList,
  WifiNoteList,
  hardFacts,
  hoursText,
  laptopAnswer,
  mobileFacts,
  wifiFacts,
} from '@/components/place/PlaceSections';
import { PlusUpsell } from '@/components/PlusUpsell';
import { ReviewItem, Stars } from '@/components/Reviews';
import { ScoreBadge } from '@/components/ScoreBadge';
import { SignupBanner } from '@/components/SignupBanner';
import { SignupGate } from '@/components/SignupGate';
import { TransparencyLink } from '@/components/TransparencyLink';
import { SignupInterstitial } from '@/components/SignupInterstitial';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader, SiteHeaderSpacer } from '@/components/SiteHeader';
import { SpeedTestPanel } from '@/components/SpeedTest';
import { Button, CategoryBadge, EmptyState, ErrorState, Icon, IconButton, Notice, Section, Skeleton, Text } from '@/components/ui';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useNow } from '@/hooks/useNow';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { env, isSupabaseConfigured } from '@/lib/env';
import { summarizeFacts } from '@/lib/facts';
import { formatDate, formatRating, hostFromUrl, liveWebsite } from '@/lib/format';
import { canShowInterstitial, markInterstitialShown, dismissInterstitial, recordPlaceView, signUpHref } from '@/lib/funnel';
import { openDirections } from '@/lib/geo';
import { deletePlaceMenu, deleteWifiNote } from '@/lib/photoUpload';
import {
  deleteOffer,
  getCityRanking,
  getPlaceBySlug,
  getPlaceFacts,
  getPlaceMenus,
  getPlaceOffers,
  getPlacePhotos,
  getPlaceRank,
  getPlaceRatingStats,
  getPlaceReviews,
  getPlaceSpeedTests,
  getPlaceWifiNotes,
  getReviewUnlockQuota,
  unlockReview,
  UnlockLimitError,
} from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, layout, radius, spacing } from '@/lib/theme';
import { defaultRankingFilters, type PlaceMenu, type PlaceOffer, type PlaceWifiNote, type SpeedTestKind } from '@/lib/types';

const INTERSTITIAL_AFTER_VIEWS = 2;
const INTERSTITIAL_DELAY_MS = 4_000;

export default function PlaceScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { width } = useBreakpoint();
  const now = useNow();
  const { user, isPlus, isAdmin, favoriteIds, toggleFavorite, ready } = useAuth();
  const [flash, setFlash] = useState<string | null>(null);
  const [interstitial, setInterstitial] = useState(false);
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [wifiError, setWifiError] = useState<string | null>(null);
  const [scoreInfo, setScoreInfo] = useState(false);

  const placeQuery = useQuery(`place:${slug}`, () => getPlaceBySlug(slug!), Boolean(slug) && isSupabaseConfigured);
  const place = placeQuery.data ?? null;
  const website = place ? liveWebsite(place) : null;
  const gateKey = `${isPlus}:${isAdmin}:${user?.id ?? ''}`;
  const enabled = Boolean(place);
  const photosQuery = useQuery(`photos:${place?.id}:${gateKey}`, () => getPlacePhotos(place!.id), enabled);
  const reviewsQuery = useQuery(`reviews:${place?.id}:${gateKey}`, () => getPlaceReviews(place!.id), enabled);
  const factsQuery = useQuery(`facts:${place?.id}:${gateKey}`, () => getPlaceFacts(place!.id), enabled);
  const offersQuery = useQuery(`offers:${place?.id}:${gateKey}`, () => getPlaceOffers(place!.id), enabled);
  const menusQuery = useQuery(`menus:${place?.id}:${gateKey}`, () => getPlaceMenus(place!.id), enabled);
  const wifiNotesQuery = useQuery(`wifi-notes:${place?.id}:${gateKey}`, () => getPlaceWifiNotes(place!.id), enabled);
  const statsQuery = useQuery(`stats:${place?.id}:${gateKey}`, () => getPlaceRatingStats(place!.id), enabled && Boolean(user));
  const testsQuery = useQuery(`tests:${place?.id}:${gateKey}`, () => getPlaceSpeedTests(place!.id), enabled && Boolean(user));
  const quotaQuery = useQuery(`unlock-quota:${gateKey}`, getReviewUnlockQuota, Boolean(user));
  const placeId = place?.id;
  const rankQuery = useQuery(`rank:${place?.id}:${place?.work_score}`, () => getPlaceRank(place!.id), enabled);
  const coliving = place?.category === 'coliving';
  const moreQuery = useQuery(
    `more:${place?.city_id}:${coliving}`,
    () => getCityRanking(place!.city_id, { ...defaultRankingFilters, category: coliving ? 'coliving' : 'all' }, 6),
    enabled,
  );

  const refetchOffers = offersQuery.refetch;
  const refetchMenus = menusQuery.refetch;
  const refetchWifiNotes = wifiNotesQuery.refetch;
  useFocusEffect(
    useCallback(() => {
      if (!placeId) return;
      void refetchOffers(true);
      void refetchMenus(true);
      void refetchWifiNotes(true);
    }, [placeId, refetchOffers, refetchMenus, refetchWifiNotes]),
  );

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  // Visitors without an account get one sign-up interstitial from their second place on.
  useEffect(() => {
    if (!ready || user || !placeId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      const views = await recordPlaceView();
      if (cancelled || views < INTERSTITIAL_AFTER_VIEWS || !(await canShowInterstitial())) return;
      timer = setTimeout(() => {
        if (cancelled) return;
        markInterstitialShown();
        setInterstitial(true);
      }, INTERSTITIAL_DELAY_MS);
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [ready, user, placeId]);

  const pageUrl = `${env.siteUrl}/place/${slug}`;
  const wide = width >= 1024;

  const share = async () => {
    if (!place) return;
    if (Platform.OS === 'web') {
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      if (nav && 'share' in nav && typeof nav.share === 'function') {
        try {
          await nav.share({ title: place.name, url: pageUrl });
          return;
        } catch {
          /* fall through to clipboard */
        }
      }
      if (nav?.clipboard) {
        await nav.clipboard.writeText(pageUrl);
        setFlash(strings.common.linkCopied);
      }
      return;
    }
    await Share.share({ message: `${place.name} · ${pageUrl}`, url: pageUrl, title: place.name });
  };

  const requireUser = (next: string) => {
    if (user) return true;
    router.push(signUpHref(next));
    return false;
  };

  if (!isSupabaseConfigured) {
    return (
      <View style={styles.root}>
        <SiteHeader />
        <SiteHeaderSpacer />
        <Notice tone="warning" body={strings.common.backendNotConfigured} style={{ margin: spacing.lg }} />
      </View>
    );
  }

  if (placeQuery.loading) {
    return (
      <View style={styles.root}>
        <SiteHeader />
        <SiteHeaderSpacer />
        <View style={[styles.page, styles.skeletons]}>
          <Skeleton width="60%" height={32} />
          <Skeleton width="40%" height={16} />
          <Skeleton height={120} />
          <Skeleton height={320} />
        </View>
      </View>
    );
  }

  if (placeQuery.error) {
    return (
      <View style={styles.root}>
        <SiteHeader />
        <SiteHeaderSpacer />
        <ErrorState body={placeQuery.error.message} onAction={() => placeQuery.refetch()} />
      </View>
    );
  }

  if (!place) {
    return (
      <View style={styles.root}>
        <SiteHeader />
        <SiteHeaderSpacer />
        <EmptyState icon="map-pin" title={strings.place.notFound} actionLabel={strings.notFound.home} onAction={() => router.replace('/')} />
      </View>
    );
  }

  const isFav = favoriteIds.has(place.id);
  const reviews = reviewsQuery.data ?? [];
  const ownReview = reviews.find((r) => r.is_own);
  const lockedTexts = reviews.filter((r) => r.is_locked && r.has_body).length;
  const bodyLockedCount = reviews.filter((r) => r.body_locked).length;
  const quota = quotaQuery.data ?? null;
  const canUnlock = Boolean(user && quota && !quota.unlimited && quota.remaining > 0);
  const photos = photosQuery.data ?? [];
  const canReview = place.status === 'published';
  const cityHref = `/${place.city.slug}` as const;
  const reviewHref = `/place/${slug}/review` as const;
  const costsHref = `/place/${slug}/costs` as const;
  const wifiHref = `/place/${slug}/wifi` as const;
  const wifiNotes = wifiNotesQuery.data ?? [];
  const lockedWifiNotes = wifiNotes.filter((n) => n.is_locked).length;
  const offers = offersQuery.data ?? [];
  const lockedOffers = offers.filter((o) => o.is_locked).length;
  const menus = (menusQuery.data ?? []).filter((m) => m.kind !== 'hours');
  const hoursPhotos = (menusQuery.data ?? []).filter((m) => m.kind === 'hours');
  const rank = rankQuery.data ?? null;
  const more = (moreQuery.data?.items ?? []).filter((p) => p.id !== place.id).slice(0, 5);
  const webFacts = place.web_facts ?? {};
  const venueFacts = summarizeFacts(webFacts, factsQuery.data ?? []);
  const listingHours = hoursText(place, venueFacts);
  const laptop = laptopAnswer(place, venueFacts);
  const showHours = !coliving || Boolean(place.hours || listingHours || hoursPhotos.length > 0);
  const description = place.description ?? webFacts.description?.value ?? null;
  const contentWidth = Math.min(width, layout.maxWideWidth) - spacing.lg * 2 - (wide ? 340 + spacing.xl : 0);
  const galleryHeight = Math.min(Math.round(contentWidth * 0.56), 420);

  const goReview = () => {
    if (requireUser(reviewHref)) router.push(reviewHref);
  };

  const goCosts = () => {
    if (requireUser(costsHref)) router.push(costsHref);
  };

  const goWifi = () => {
    if (requireUser(wifiHref)) router.push(wifiHref);
  };

  const removeOffer = async (offer: PlaceOffer) => {
    setOfferError(null);
    try {
      await deleteOffer(offer.id);
      await offersQuery.refetch(true);
    } catch (e) {
      setOfferError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    }
  };

  const removeMenu = async (menu: PlaceMenu) => {
    setOfferError(null);
    try {
      await deletePlaceMenu(menu);
      await menusQuery.refetch(true);
    } catch (e) {
      setOfferError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    }
  };

  const removeWifiNote = async (note: PlaceWifiNote) => {
    setWifiError(null);
    try {
      await deleteWifiNote(note);
      await wifiNotesQuery.refetch(true);
    } catch (e) {
      setWifiError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    }
  };

  const unlock = async (reviewId: string) => {
    setUnlocking(reviewId);
    setUnlockError(null);
    try {
      const next = await unlockReview(reviewId);
      quotaQuery.setData(() => next);
      await reviewsQuery.refetch(true);
    } catch (e) {
      if (e instanceof UnlockLimitError) {
        setUnlockError(strings.place.unlockLimitReached);
        void quotaQuery.refetch(true);
      } else {
        setUnlockError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
      }
    } finally {
      setUnlocking(null);
    }
  };

  const scoreCard = (
    <View style={styles.scoreCard}>
      <View style={styles.scoreHead}>
        <ScoreBadge score={place.work_score} size="lg" />
        <View style={styles.scoreHeadText}>
          <View style={styles.scoreTitleRow}>
            <Text variant="bodyStrong">
              {strings.place.scoreTitle} {strings.place.scoreOutOf}
            </Text>
            {place.score_breakdown ? (
              <Pressable
                onPress={() => setScoreInfo(true)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={strings.place.scoreInfo}
              >
                <Icon name="info" size={16} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
          {place.review_count === 0 ? (
            <Text variant="caption" tone="muted">
              {strings.place.scoreProvisional}
            </Text>
          ) : null}
          {rank !== null ? (
            <Pressable onPress={() => router.push(cityHref)} accessibilityRole="link">
              <Text variant="small" tone="accent">
                {(coliving ? strings.place.rankInColiving : strings.place.rankIn)(rank, place.city.name)}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <Button title={ownReview ? strings.place.editReview : strings.place.rateThis} icon="star" onPress={goReview} disabled={!canReview} />
      <View style={styles.cardActions}>
        <Button
          title={strings.common.directions}
          icon="navigation"
          variant="secondary"
          size="sm"
          onPress={() => openDirections(place, place.name)}
        />
        {website ? (
          <Button
            title={hostFromUrl(website)}
            icon="external-link"
            variant="secondary"
            size="sm"
            onPress={() => Linking.openURL(website)}
          />
        ) : null}
      </View>
    </View>
  );

  const onTestSaved = () => {
    void placeQuery.refetch(true);
    void testsQuery.refetch(true);
  };
  const speedTest = <SpeedTestPanel placeId={place.id} onSaved={onTestSaved} />;
  const mobileSpeedTest = <SpeedTestPanel placeId={place.id} kind="mobile" onSaved={onTestSaved} />;

  const testHistory = (kind: SpeedTestKind, count: number, empty: string) => {
    if (!user) {
      return count > 0 ? (
        <SignupGate compact title={strings.funnel.lockedSpeedTitle} body={strings.funnel.gateBody} />
      ) : (
        <Text tone="muted">{empty}</Text>
      );
    }
    if (testsQuery.loading && !testsQuery.data) return <Skeleton height={80} />;
    const tests = (testsQuery.data ?? []).filter((t) => (t.kind ?? 'wifi') === kind);
    return tests.length === 0 ? <Text tone="muted">{empty}</Text> : <SpeedTestHistory tests={tests} />;
  };

  return (
    <View style={styles.root}>
      <Head>
        <title>{`${place.name} · ${place.city.name} · Cosurfing`}</title>
        <meta
          name="description"
          content={
            description ??
            (coliving
              ? `${place.name}, a coliving in ${place.city.name}: workspace for residents, season, Wi‑Fi and reviews from remote workers.`
              : `${place.name} in ${place.city.name}: Wi‑Fi, power outlets, opening hours and reviews from remote workers.`)
          }
        />
      </Head>
      <SiteHeader />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <SiteHeaderSpacer />
        <View style={styles.page}>
          <View style={styles.crumbs}>
            <Pressable onPress={() => router.push(cityHref)} accessibilityRole="link" style={styles.crumb}>
              <Icon name="arrow-left" size={14} color={colors.accent} />
              <Text variant="smallStrong" tone="accent">
                {strings.city.rankingTitle(place.city.name)}
              </Text>
            </Pressable>
            <View style={styles.crumbActions}>
              <IconButton icon="share" accessibilityLabel={strings.common.share} onPress={share} />
              <IconButton
                icon="heart"
                accessibilityLabel={isFav ? strings.place.favorited : strings.place.favorite}
                color={isFav ? colors.danger : colors.text}
                onPress={() => {
                  if (requireUser(`/place/${slug}`)) void toggleFavorite(place.id);
                }}
              />
            </View>
          </View>

          {flash ? <Notice tone="success" body={flash} /> : null}
          {place.status !== 'published' ? <Notice tone="warning" body={`${strings.admin.fields.status}: ${place.status}`} /> : null}

          <View style={styles.titleBlock}>
            <CategoryBadge category={place.category} />
            <Text variant="title">{place.name}</Text>
            {place.name_local && place.name_local !== place.name ? (
              <Text tone="muted">{place.name_local}</Text>
            ) : null}
            <View style={styles.metaRow}>
              {place.review_count > 0 && place.rating_avg !== null ? (
                <View style={styles.ratingRow}>
                  <Stars value={Math.round(Number(place.rating_avg))} size={14} />
                  <Text variant="smallStrong">{formatRating(place.rating_avg)}</Text>
                  <Text variant="small" tone="muted">
                    · {strings.place.reviewCount(place.review_count)}
                  </Text>
                </View>
              ) : (
                <Text variant="small" tone="muted">
                  {strings.ranking.noReviews}
                </Text>
              )}
              <Text variant="small" tone="muted">
                · {place.address ?? `${strings.place.address}: ${strings.common.unknown}`}
              </Text>
            </View>
          </View>

          {coliving ? (
            <View style={styles.notices}>
              <Notice
                tone="warning"
                title={strings.place.colivingStayTitle}
                body={
                  place.non_guest_work === 'yes'
                    ? strings.place.colivingStayBodyDayPass(place.non_guest_note)
                    : strings.place.colivingStayBody
                }
              />
              <Notice
                tone="info"
                title={strings.place.colivingSeasonTitle}
                body={
                  place.season === 'seasonal'
                    ? strings.place.colivingSeasonal(place.season_note)
                    : strings.place.colivingSeasonBody
                }
              />
            </View>
          ) : null}

          <View style={[styles.columns, wide && styles.columnsWide]}>
            <View style={styles.main}>
              {photos.length > 0 ? (
                <View style={styles.gallery}>
                  <PhotoGallery photos={photos} category={place.category} width={contentWidth} height={galleryHeight} loading={false} />
                </View>
              ) : null}
              {canReview ? (
                <AddPhotos placeId={place.id} userId={user?.id ?? null} onSignIn={() => requireUser(`/place/${slug}`)} />
              ) : null}

              {!wide ? scoreCard : null}

              <Section title={strings.place.hardFacts}>
                <FactTable lines={hardFacts(place, venueFacts)} onHelp={canReview ? goReview : undefined} />
              </Section>

              {showHours ? (
                <Section title={strings.place.openingHours}>
                  <OpeningHoursCard
                    hours={place.hours}
                    status={place.hours_status}
                    source={place.hours_source}
                    flags={place.hours_flags ?? []}
                    text={listingHours}
                    timezone={place.city.timezone}
                    now={now}
                    onAdd={canReview && hoursPhotos.length === 0 ? goReview : undefined}
                  />
                  {!coliving ? (
                    <LaptopHoursCard
                      laptop={place.laptop_hours}
                      source={place.laptop_source}
                      hours={place.hours}
                      category={place.category}
                      timezone={place.city.timezone}
                      now={now}
                      answer={laptop.answer}
                      answerBanned={laptop.banned}
                      onAdd={canReview ? goReview : undefined}
                    />
                  ) : null}
                  {hoursPhotos.length > 0 ? (
                    <View style={styles.hoursPhotos}>
                      <Text variant="smallStrong">{strings.hours.photos}</Text>
                      <MenuGallery kind="hours" menus={hoursPhotos} onDelete={removeMenu} canDelete={(m) => m.is_own || isAdmin} />
                    </View>
                  ) : null}
                </Section>
              ) : null}

              <Section
                title={strings.wifi.title}
                right={
                  canReview ? (
                    <Button title={strings.wifi.addNote} size="sm" variant="secondary" icon="camera" onPress={goWifi} />
                  ) : undefined
                }
              >
                <FactTable lines={wifiFacts(place, venueFacts)} onHelp={canReview ? goReview : undefined} />
                <View style={styles.wifiBlock}>
                  <Text variant="smallStrong">{strings.wifi.notes}</Text>
                  {!user && lockedWifiNotes > 0 ? (
                    <SignupGate compact title={strings.wifi.lockedTitle(lockedWifiNotes)} body={strings.funnel.gateBody} />
                  ) : wifiNotes.length > 0 ? (
                    <>
                      {wifiError ? <Notice tone="danger" body={wifiError} /> : null}
                      <WifiNoteList notes={wifiNotes} onDelete={removeWifiNote} canDelete={(n) => n.is_own || isAdmin} />
                    </>
                  ) : (
                    <Text tone="muted">{strings.wifi.noNotes}</Text>
                  )}
                </View>
                {!wide ? speedTest : null}
                <View style={styles.wifiBlock}>
                  <Text variant="smallStrong">{strings.wifi.speedTests}</Text>
                  {testHistory('wifi', place.speed_test_count, strings.place.speedTestsEmpty)}
                </View>

                <View style={[styles.wifiBlock, styles.mobileBlock]}>
                  <View style={styles.mobileHeader}>
                    <Text variant="bodyStrong">{strings.mobile.title}</Text>
                    <Text variant="small" tone="muted">
                      {strings.mobile.hint}
                    </Text>
                  </View>
                  <FactTable lines={mobileFacts(place)} />
                  {!wide ? mobileSpeedTest : null}
                  <Text variant="smallStrong">{strings.wifi.speedTests}</Text>
                  {testHistory('mobile', place.mobile_speed_test_count, strings.mobile.empty)}
                </View>
              </Section>

              {venueFacts.length > 0 || canReview ? (
                <Section
                  title={strings.place.venueFacts}
                  right={
                    canReview ? (
                      <Button title={strings.place.editFacts} size="sm" variant="secondary" icon="edit-3" onPress={goReview} />
                    ) : undefined
                  }
                >
                  {venueFacts.length > 0 ? (
                    <VenueFactsList
                      facts={venueFacts}
                      web={webFacts}
                      pendingNote={
                        (factsQuery.data ?? []).some(
                          (f) => f.is_own && (f.status === 'pending' || f.status === 'rejected' || f.pending_value != null || f.pending_delete),
                        )
                          ? strings.place.factsPending
                          : null
                      }
                    />
                  ) : (
                    <Text tone="muted">{strings.place.noVenueFacts}</Text>
                  )}
                </Section>
              ) : null}

              {menus.length > 0 || canReview ? (
                <Section
                  title={strings.costs.menu}
                  right={
                    canReview ? (
                      <Button title={strings.costs.addMenu} size="sm" variant="secondary" icon="camera" onPress={goCosts} />
                    ) : undefined
                  }
                >
                  {menus.length > 0 ? (
                    <MenuGallery menus={menus} onDelete={removeMenu} canDelete={(m) => m.is_own || isAdmin} />
                  ) : (
                    <Text tone="muted">{strings.costs.noMenu}</Text>
                  )}
                </Section>
              ) : null}

              {offers.length > 0 ? (
                <Section title={strings.costs.offers}>
                  {!user && lockedOffers > 0 ? (
                    <SignupGate compact title={strings.costs.lockedOffersTitle(lockedOffers)} body={strings.funnel.gateBody} />
                  ) : null}
                  {offerError ? <Notice tone="danger" body={offerError} /> : null}
                  <OfferList offers={offers} onDelete={removeOffer} canDelete={(o) => o.is_own || isAdmin} />
                </Section>
              ) : null}

              {canReview ? <OwnerCta place={place} /> : null}

              {description ? (
                <Section title={strings.place.about}>
                  <Text>{description}</Text>
                  {!place.description && webFacts.description ? (
                    <Text variant="caption" tone="faint">
                      {strings.place.sourceLabel}: {hostFromUrl(webFacts.description.url)}
                    </Text>
                  ) : null}
                </Section>
              ) : null}

              <Section title={strings.place.scoreTitle}>
                <ScoreBreakdownCard place={place} />
              </Section>

              <Section
                title={strings.place.reviews}
                right={
                  canReview ? (
                    <Button
                      title={ownReview ? strings.place.editReview : strings.place.writeReview}
                      size="sm"
                      variant="secondary"
                      icon="edit-3"
                      onPress={goReview}
                    />
                  ) : undefined
                }
              >
                {reviewsQuery.loading && !reviewsQuery.data ? (
                  <View style={styles.skeletons}>
                    <Skeleton height={64} />
                    <Skeleton height={64} />
                  </View>
                ) : reviewsQuery.error ? (
                  <Notice tone="danger" body={reviewsQuery.error.message} />
                ) : reviews.length === 0 ? (
                  <View style={styles.firstReview}>
                    <Text variant="bodyStrong">{strings.funnel.rateTitle}</Text>
                    <Text variant="small" tone="muted">
                      {strings.place.noReviews}
                    </Text>
                    <Button title={strings.funnel.rateCta} icon="star" onPress={goReview} style={styles.selfStart} />
                  </View>
                ) : (
                  <View style={styles.reviews}>
                    <RatingDistribution reviews={reviews.filter((r) => r.status === 'visible')} avg={place.rating_avg} />
                    {!user && lockedTexts > 0 ? (
                      <SignupGate
                        title={strings.funnel.lockedReviewsTitle(lockedTexts)}
                        body={strings.funnel.lockedReviewsBody}
                      />
                    ) : null}
                    {user && quota && !quota.unlimited && bodyLockedCount > 0 ? (
                      <PlusUpsell
                        compact
                        title={strings.place.unlocksLeft(quota.remaining)}
                        message={`${strings.place.unlocksReset} ${strings.place.unlockPlusHint}`}
                      />
                    ) : null}
                    {unlockError ? <Notice tone="warning" body={unlockError} /> : null}
                    <View>
                      {reviews.map((r) => (
                        <ReviewItem
                          key={r.id}
                          review={r}
                          onUnlock={canUnlock && r.body_locked ? () => void unlock(r.id) : undefined}
                          unlocking={unlocking === r.id}
                        />
                      ))}
                    </View>
                    <TransparencyLink label={strings.legal.reviewChecks} />
                  </View>
                )}
              </Section>

              {reviews.length > 0 ? (
                <Section title={strings.place.detailRatings}>
                  {!user ? (
                    <SignupGate compact title={strings.funnel.lockedDetailsTitle} body={strings.funnel.gateBody} />
                  ) : statsQuery.data ? (
                    <DetailRatings stats={statsQuery.data} />
                  ) : statsQuery.loading ? (
                    <Skeleton height={120} />
                  ) : (
                    <Text tone="muted">{strings.common.unknown}</Text>
                  )}
                </Section>
              ) : null}

              {more.length > 0 ? (
                <Section title={(coliving ? strings.place.alsoInColiving : strings.place.alsoIn)(place.city.name)}>
                  <View>
                    {more.map((p) => (
                      <RankedPlaceRow
                        key={p.id}
                        place={p}
                        rank={moreQuery.data!.items.indexOf(p) + 1}
                        signedIn={Boolean(user)}
                        compact
                        timezone={place.city.timezone}
                        now={now}
                        onPress={() => router.push(`/place/${p.slug}`)}
                      />
                    ))}
                  </View>
                  <Button
                    title={strings.city.rankingTitle(place.city.name)}
                    variant="ghost"
                    iconRight="arrow-right"
                    onPress={() => router.push(cityHref)}
                    style={styles.selfStart}
                  />
                </Section>
              ) : null}

              <View style={styles.footerLinks}>
                {place.osm_type && place.osm_id ? (
                  <>
                    <Text variant="caption" tone="faint">
                      {strings.place.osmAttribution}
                      {place.osm_seen_at ? ` · ${strings.place.checkedOn(formatDate(place.osm_seen_at))}` : ''}
                    </Text>
                    <Pressable
                      onPress={() => Linking.openURL(`https://www.openstreetmap.org/${place.osm_type}/${place.osm_id}`)}
                      accessibilityRole="link"
                      style={styles.inlineLink}
                    >
                      <Icon name="edit-2" size={13} color={colors.textMuted} />
                      <Text variant="caption" tone="muted">
                        {strings.place.editOnOsm}
                      </Text>
                    </Pressable>
                  </>
                ) : null}
                <Pressable
                  style={styles.inlineLink}
                  onPress={() => {
                    if (requireUser(`/place/${slug}/report`)) router.push(`/place/${slug}/report`);
                  }}
                  accessibilityRole="button"
                >
                  <Icon name="flag" size={13} color={colors.textMuted} />
                  <Text variant="caption" tone="muted">
                    {strings.place.reportIssue}
                  </Text>
                </Pressable>
              </View>
            </View>

            {wide ? (
              <View style={styles.side}>
                {scoreCard}
                {speedTest}
                {mobileSpeedTest}
              </View>
            ) : null}
          </View>
        </View>
        <SiteFooter />
      </ScrollView>
      <SignupBanner />
      <ScoreInfoModal place={place} visible={scoreInfo} onClose={() => setScoreInfo(false)} />
      <SignupInterstitial
        visible={interstitial}
        onClose={() => {
          setInterstitial(false);
          void dismissInterstitial();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    alignItems: 'center',
    paddingBottom: 96,
  },
  page: {
    width: '100%',
    maxWidth: layout.maxWideWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.lg,
  },
  skeletons: {
    gap: spacing.md,
  },
  crumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  crumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  crumbActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  notices: {
    gap: spacing.sm,
  },
  titleBlock: {
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  columns: {
    gap: spacing.xl,
  },
  columnsWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  main: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xl,
  },
  side: {
    width: 340,
    gap: spacing.lg,
    ...(Platform.OS === 'web' ? { position: 'sticky' as 'relative', top: spacing.lg } : null),
  },
  gallery: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  scoreCard: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  scoreHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  scoreHeadText: {
    flex: 1,
    gap: 2,
  },
  scoreTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  reviews: {
    gap: spacing.lg,
  },
  firstReview: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
  },
  selfStart: {
    alignSelf: 'flex-start',
  },
  hoursPhotos: {
    gap: spacing.sm,
  },
  wifiBlock: {
    gap: spacing.sm,
  },
  mobileBlock: {
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  mobileHeader: {
    gap: 2,
  },
  footerLinks: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  inlineLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
});
