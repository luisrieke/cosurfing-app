import Head from 'expo-router/head';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FactRow } from '@/components/FactRow';
import { PhotoGallery } from '@/components/PhotoGallery';
import { PlusUpsell } from '@/components/PlusUpsell';
import { ReviewItem, Stars } from '@/components/Reviews';
import {
  Badge,
  Button,
  CategoryBadge,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  Notice,
  Section,
  Skeleton,
  Text,
} from '@/components/ui';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { env, isSupabaseConfigured } from '@/lib/env';
import { formatDate, formatEuroCents, formatRating, hostFromUrl } from '@/lib/format';
import { openDirections } from '@/lib/geo';
import { getPlaceBySlug, getPlacePhotos, getPlaceReviews } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, layout, radius, spacing } from '@/lib/theme';
import type { Place } from '@/lib/types';

function factValue(place: Place) {
  const s = strings.place;
  const wifi =
    place.wifi === 'yes' ? { v: s.wifi_yes, t: 'good' as const } : place.wifi === 'no' ? { v: s.wifi_no, t: 'bad' as const } : null;
  const power =
    place.power_outlets === 'plenty'
      ? { v: s.power_plenty, t: 'good' as const }
      : place.power_outlets === 'some'
        ? { v: s.power_some, t: 'okay' as const }
        : place.power_outlets === 'none'
          ? { v: s.power_none, t: 'bad' as const }
          : null;
  const focus =
    place.focus === 'great'
      ? { v: s.focus_great, t: 'good' as const }
      : place.focus === 'okay'
        ? { v: s.focus_okay, t: 'okay' as const }
        : place.focus === 'poor'
          ? { v: s.focus_poor, t: 'bad' as const }
          : null;
  const calls =
    place.calls === 'yes'
      ? { v: s.calls_yes, t: 'good' as const }
      : place.calls === 'limited'
        ? { v: s.calls_limited, t: 'okay' as const }
        : place.calls === 'no'
          ? { v: s.calls_no, t: 'bad' as const }
          : null;
  const price =
    place.category === 'coworking' && place.day_pass_price_cents !== null
      ? `${s.dayPass} ${formatEuroCents(place.day_pass_price_cents)}`
      : place.price_level
        ? s.priceLevelLabel(place.price_level)
        : null;
  return { wifi, power, focus, calls, price };
}

export default function PlaceScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, isDesktop } = useBreakpoint();
  const { user, isPlus, isAdmin, favoriteIds, toggleFavorite } = useAuth();
  const [flash, setFlash] = useState<string | null>(null);

  const placeQuery = useQuery(`place:${slug}`, () => getPlaceBySlug(slug!), Boolean(slug) && isSupabaseConfigured);
  const place = placeQuery.data ?? null;
  const gateKey = `${isPlus}:${isAdmin}:${user?.id ?? ''}`;
  const photosQuery = useQuery(`photos:${place?.id}:${gateKey}`, () => getPlacePhotos(place!.id), Boolean(place));
  const reviewsQuery = useQuery(`reviews:${place?.id}:${gateKey}`, () => getPlaceReviews(place!.id), Boolean(place));

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  const contentWidth = Math.min(width, layout.maxContentWidth);
  const galleryHeight = Math.min(Math.round(contentWidth * 0.66), isDesktop ? 440 : 320);
  const pageUrl = `${env.siteUrl}/place/${slug}`;

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
    router.push({ pathname: '/auth/sign-in', params: { redirect: next } });
    return false;
  };

  if (!isSupabaseConfigured) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Header onBack={() => router.replace('/')} />
        <Notice tone="warning" body={strings.common.backendNotConfigured} style={{ margin: spacing.lg }} />
      </View>
    );
  }

  if (placeQuery.loading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Header onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <View style={styles.center}>
          <Skeleton height={galleryHeight} />
          <View style={styles.pad}>
            <Skeleton width="60%" height={28} />
            <Skeleton width="40%" height={16} />
            <Skeleton width="90%" height={16} />
          </View>
        </View>
      </View>
    );
  }

  if (placeQuery.error) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Header onBack={() => router.replace('/')} />
        <ErrorState body={placeQuery.error.message} onAction={() => placeQuery.refetch()} />
      </View>
    );
  }

  if (!place) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Header onBack={() => router.replace('/')} />
        <EmptyState icon="map-pin" title={strings.place.notFound} actionLabel={strings.notFound.home} onAction={() => router.replace('/')} />
      </View>
    );
  }

  const facts = factValue(place);
  const isFav = favoriteIds.has(place.id);
  const reviews = reviewsQuery.data ?? [];
  const ownReview = reviews.find((r) => r.is_own);
  const anyLocked = reviews.some((r) => r.is_locked);
  const photosLocked = (photosQuery.data ?? []).some((p) => p.locked);
  const canReview = place.status === 'published';
  const cityHref = `/${place.city.slug}` as const;

  return (
    <View style={styles.root}>
      <Head>
        <title>{`${place.name} · ${place.city.name} · Cosurfing`}</title>
        <meta name="description" content={place.description ?? `${place.name} in ${place.city.name}`} />
      </Head>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xxl }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.center, { width: '100%' }]}>
          <View style={[styles.galleryWrap, isDesktop && styles.galleryDesktop]}>
            <PhotoGallery
              photos={photosQuery.data ?? []}
              category={place.category}
              width={contentWidth}
              height={galleryHeight}
              loading={photosQuery.loading && !photosQuery.data}
            />
            <View style={[styles.overlayHeader, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
              <IconButton
                icon="arrow-left"
                accessibilityLabel={strings.common.back}
                onPress={() => (router.canGoBack() ? router.back() : router.replace(cityHref))}
              />
              <View style={styles.overlayRight}>
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
          </View>

          <View style={styles.pad}>
            {flash ? <Notice tone="success" body={flash} /> : null}
            {place.is_example ? <Notice tone="warning" title={strings.common.example} body={strings.common.exampleHint} /> : null}
            {place.status !== 'published' ? <Notice tone="warning" body={`${strings.admin.fields.status}: ${place.status}`} /> : null}

            <View style={styles.titleBlock}>
              <View style={styles.badges}>
                <CategoryBadge category={place.category} />
                {place.is_example ? <Badge label={strings.common.example} tone="warning" /> : null}
              </View>
              <Text variant="title">{place.name}</Text>
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
                    {strings.place.reviewCount(0)}
                  </Text>
                )}
                <Pressable onPress={() => router.push(cityHref)} accessibilityRole="link">
                  <Text variant="small" tone="accent">
                    {place.city.name}
                  </Text>
                </Pressable>
              </View>
              {place.address ? (
                <Text tone="muted">{place.address}</Text>
              ) : (
                <Text tone="faint">{strings.place.address}: {strings.common.unknown}</Text>
              )}
            </View>

            <View style={styles.actions}>
              <Button title={strings.common.directions} icon="navigation" onPress={() => openDirections(place, place.name)} />
              {place.website ? (
                <Button
                  title={hostFromUrl(place.website)}
                  icon="external-link"
                  variant="secondary"
                  onPress={() => Linking.openURL(place.website!)}
                />
              ) : null}
            </View>

            <Section title={strings.place.facts}>
              <View style={styles.factGrid}>
                <FactRow icon="wifi" label={strings.place.wifi} value={facts.wifi?.v} tone={facts.wifi?.t ?? 'unknown'} />
                <FactRow icon="zap" label={strings.place.power} value={facts.power?.v} tone={facts.power?.t ?? 'unknown'} />
                <FactRow icon="headphones" label={strings.place.focus} value={facts.focus?.v} tone={facts.focus?.t ?? 'unknown'} />
                <FactRow icon="phone" label={strings.place.callsLabel} value={facts.calls?.v} tone={facts.calls?.t ?? 'unknown'} />
                <FactRow icon="credit-card" label={strings.place.price} value={facts.price} tone={facts.price ? 'neutral' : 'unknown'} />
                <FactRow icon="clock" label={strings.place.openingHours} value={place.opening_hours} tone={place.opening_hours ? 'neutral' : 'unknown'} />
              </View>
              <View style={styles.factNotes}>
                <View style={styles.factNote}>
                  <Icon name="monitor" size={16} color={colors.textMuted} />
                  <View style={styles.factNoteText}>
                    <Text variant="caption" tone="muted">
                      {strings.place.laptopRules}
                    </Text>
                    <Text variant="small" tone={place.laptop_rules ? 'default' : 'faint'}>
                      {place.laptop_rules ?? strings.common.unknown}
                    </Text>
                  </View>
                </View>
                <View style={styles.factNote}>
                  <Icon name="check-circle" size={16} color={place.last_verified_at ? colors.success : colors.textFaint} />
                  <View style={styles.factNoteText}>
                    <Text variant="caption" tone="muted">
                      {strings.place.lastVerified}
                    </Text>
                    <Text variant="small" tone={place.last_verified_at ? 'default' : 'faint'}>
                      {place.last_verified_at ? formatDate(place.last_verified_at) : strings.place.neverVerified}
                    </Text>
                  </View>
                </View>
              </View>
            </Section>

            {place.description ? (
              <Section title={strings.place.about}>
                <Text>{place.description}</Text>
              </Section>
            ) : null}

            {photosLocked ? <PlusUpsell message={strings.plus.upsellPhotos} compact /> : null}

            <Section
              title={strings.place.reviews}
              right={
                canReview ? (
                  <Button
                    title={ownReview ? strings.place.editReview : strings.place.writeReview}
                    size="sm"
                    variant="secondary"
                    icon="edit-3"
                    onPress={() => {
                      if (requireUser(`/place/${slug}/review`)) router.push(`/place/${slug}/review`);
                    }}
                  />
                ) : undefined
              }
            >
              {reviewsQuery.loading && !reviewsQuery.data ? (
                <View style={{ gap: spacing.md }}>
                  <Skeleton height={64} />
                  <Skeleton height={64} />
                </View>
              ) : reviewsQuery.error ? (
                <Notice tone="danger" body={reviewsQuery.error.message} />
              ) : reviews.length === 0 ? (
                <Text tone="muted">{strings.place.noReviews}</Text>
              ) : (
                <View>
                  {anyLocked ? <PlusUpsell message={strings.plus.upsellReviews} compact style={{ marginBottom: spacing.sm }} /> : null}
                  {reviews.map((r) => (
                    <ReviewItem key={r.id} review={r} />
                  ))}
                </View>
              )}
            </Section>

            <Pressable
              style={styles.reportLink}
              onPress={() => {
                if (requireUser(`/place/${slug}/report`)) router.push(`/place/${slug}/report`);
              }}
              accessibilityRole="button"
            >
              <Icon name="flag" size={16} color={colors.textMuted} />
              <Text variant="small" tone="muted">
                {strings.place.reportIssue}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.simpleHeader}>
      <IconButton icon="arrow-left" accessibilityLabel={strings.common.back} onPress={onBack} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
  },
  center: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
  },
  galleryWrap: {
    width: '100%',
    overflow: 'hidden',
  },
  galleryDesktop: {
    marginTop: spacing.lg,
    borderRadius: radius.xl,
  },
  overlayHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  overlayRight: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  simpleHeader: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  pad: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  titleBlock: {
    gap: spacing.sm,
  },
  badges: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  factGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  factNotes: {
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  factNote: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  factNoteText: {
    flex: 1,
    gap: 2,
  },
  reportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
  },
});
