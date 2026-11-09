import { Image } from 'expo-image';
import Head from 'expo-router/head';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Stars } from '@/components/Reviews';
import { LevelMark, UserAvatar } from '@/components/UserBadge';
import { type MapHandle, PlacesMap } from '@/components/map';
import {
  Badge,
  Button,
  Card,
  CategoryBadge,
  EmptyState,
  Notice,
  Screen,
  Section,
  Skeleton,
  Text,
  TopBar,
} from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { signUpHref } from '@/lib/funnel';
import { confirmedPoints, GUIDE_POINTS, levelFor } from '@/lib/levels';
import {
  getProfilePhotos,
  getProfilePlaces,
  getProfileReviews,
  getPublicProfile,
  setGuideRevoked,
  unlockReview,
} from '@/lib/queries';
import { previewUrl } from '@/lib/storage';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import type { PlaceCategory } from '@/lib/types';

export default function ProfileRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = typeof id === 'string' ? id : '';
  return <ProfileScreen userId={userId} />;
}

function ProfileScreen({ userId }: { userId: string }) {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const profile = useQuery(`profile:${userId}`, () => getPublicProfile(userId), Boolean(userId));
  const places = useQuery(`profile-places:${userId}:${user?.id ?? ''}`, () => getProfilePlaces(userId), Boolean(userId));
  const reviews = useQuery(`profile-reviews:${userId}:${user?.id ?? ''}`, () => getProfileReviews(userId), Boolean(userId));
  const photos = useQuery(`profile-photos:${userId}:${user?.id ?? ''}`, () => getProfilePhotos(userId), Boolean(userId));
  const mapRef = useRef<MapHandle>(null);
  const [revoking, setRevoking] = useState(false);
  const [unlocking, setUnlocking] = useState<string | null>(null);

  const markers = useMemo(
    () =>
      (places.data ?? []).map((p) => ({
        id: p.id,
        lat: Number(p.lat),
        lng: Number(p.lng),
        category: p.category,
        name: p.name,
      })),
    [places.data],
  );
  const center = markers[0] ? { lat: markers[0].lat, lng: markers[0].lng } : { lat: 48.5, lng: 10 };

  useEffect(() => {
    if (markers.length === 0) return;
    const timer = setTimeout(() => mapRef.current?.fitMarkers({ top: 32, right: 32, bottom: 32, left: 32 }), 400);
    return () => clearTimeout(timer);
  }, [markers]);

  if (!userId) {
    return (
      <Screen>
        <TopBar title={strings.profile.title} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <EmptyState icon="user" title={strings.profile.notFound} />
      </Screen>
    );
  }
  if (profile.loading && !profile.data) {
    return (
      <Screen>
        <TopBar title={strings.profile.title} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Skeleton height={120} />
      </Screen>
    );
  }
  if (profile.error) {
    return (
      <Screen>
        <TopBar title={strings.profile.title} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Notice tone="danger" body={profile.error.message} />
      </Screen>
    );
  }
  if (!profile.data) {
    return (
      <Screen>
        <TopBar title={strings.profile.title} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <EmptyState icon="user" title={strings.profile.notFound} actionLabel={strings.notFound.home} onAction={() => router.replace('/')} />
      </Screen>
    );
  }

  const person = profile.data;
  const confirmed = confirmedPoints(person.points, person.points_pending);
  const level = levelFor(confirmed);
  const own = user?.id === person.id;

  const toggleRevoke = async () => {
    setRevoking(true);
    try {
      await setGuideRevoked(person.id, !person.guide_revoked);
      await profile.refetch();
    } finally {
      setRevoking(false);
    }
  };

  const unlock = async (reviewId: string) => {
    setUnlocking(reviewId);
    try {
      await unlockReview(reviewId);
      await reviews.refetch();
    } finally {
      setUnlocking(null);
    }
  };

  return (
    <Screen>
      <Head>
        <title>{`${person.display_name} · Cosurfing`}</title>
      </Head>
      <TopBar title={person.display_name} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />

      <Card style={styles.header}>
        <View style={styles.identity}>
          <UserAvatar name={person.display_name} path={person.avatar_path} size={64} />
          <View style={styles.identityText}>
            <Text variant="title">{person.display_name}</Text>
            <LevelMark points={person.points} pending={person.points_pending} guide={person.is_guide} />
            <Text variant="bodyStrong">{strings.levels.points(person.points)}</Text>
            {person.points_pending > 0 ? (
              <Text variant="caption" tone="muted">
                {strings.levels.underReview(person.points_pending)}
              </Text>
            ) : null}
            <Text variant="caption" tone="faint">
              {person.is_guide
                ? strings.levels.guideLive
                : confirmed >= GUIDE_POINTS
                  ? strings.levels.guideHeld
                  : `${strings.levels.confirmed(confirmed)} · ${strings.levels.toGuide(GUIDE_POINTS - confirmed)}`}
            </Text>
          </View>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${level.progress * 100}%` }]} />
        </View>
        {isAdmin ? (
          <Button
            title={person.guide_revoked ? strings.profile.allowAutoPublish : strings.profile.stopAutoPublish}
            variant="secondary"
            size="sm"
            loading={revoking}
            onPress={() => void toggleRevoke()}
            style={styles.selfStart}
          />
        ) : null}
      </Card>

      <Section title={strings.profile.places}>
        {places.loading && !places.data ? (
          <Skeleton height={280} />
        ) : markers.length === 0 ? (
          <Text tone="muted">{strings.profile.emptyPlaces}</Text>
        ) : (
          <PlacesMap
              ref={mapRef}
              center={center}
              zoom={markers.length === 1 ? 13 : 4}
              markers={markers}
              selectedId={null}
              onSelect={(placeId) => {
                const place = (places.data ?? []).find((p) => p.id === placeId);
                if (place) router.push(`/place/${place.slug}`);
              }}
              userLocation={null}
              showControls
              style={styles.map}
            />
        )}
        <View style={styles.list}>
          {(places.data ?? []).map((p) => (
            <Pressable key={p.id} style={styles.row} onPress={() => router.push(`/place/${p.slug}`)} accessibilityRole="link">
              <View style={styles.rowText}>
                <Text variant="bodyStrong">{p.name}</Text>
                <View style={styles.inline}>
                  {p.rating ? <Stars value={p.rating} size={12} /> : null}
                  {own && p.review_status === 'pending' ? <Badge label={strings.account.underReview} tone="warning" /> : null}
                  {own && p.review_status === 'rejected' ? <Badge label={strings.account.notAccepted} tone="danger" /> : null}
                </View>
              </View>
              <CategoryBadge category={p.category as PlaceCategory} />
            </Pressable>
          ))}
        </View>
      </Section>

      <Section title={strings.profile.reviews}>
        {reviews.loading && !reviews.data ? (
          <Skeleton height={80} />
        ) : (reviews.data ?? []).length === 0 ? (
          <Text tone="muted">{strings.profile.emptyReviews}</Text>
        ) : (
          <View style={styles.list}>
            {(reviews.data ?? []).map((r) => (
              <View key={r.id} style={styles.review}>
                <Pressable onPress={() => router.push(`/place/${r.place_slug}`)} accessibilityRole="link" style={styles.reviewHead}>
                  <Text variant="bodyStrong" style={styles.flex}>
                    {r.place_name}
                  </Text>
                  <Text variant="caption" tone="faint">
                    {formatDate(r.created_at)}
                  </Text>
                </Pressable>
                <View style={styles.inline}>
                  <Stars value={r.rating} size={14} />
                  {own && r.status === 'pending' ? <Badge label={strings.account.underReview} tone="warning" /> : null}
                  {own && r.status === 'rejected' ? <Badge label={strings.account.notAccepted} tone="danger" /> : null}
                  {own && r.edit_status === 'pending' ? <Badge label={strings.account.underReview} tone="warning" /> : null}
                </View>
                {r.body ? <Text>{r.body}</Text> : null}
                {r.body_locked ? (
                  user ? (
                    <Button
                      title={strings.place.unlockReview}
                      icon="unlock"
                      size="sm"
                      variant="secondary"
                      loading={unlocking === r.id}
                      onPress={() => void unlock(r.id)}
                      style={styles.selfStart}
                    />
                  ) : (
                    <Button
                      title={strings.profile.signInToRead}
                      size="sm"
                      variant="secondary"
                      onPress={() => router.push(signUpHref(`/u/${userId}`))}
                      style={styles.selfStart}
                    />
                  )
                ) : null}
              </View>
            ))}
          </View>
        )}
      </Section>

      <Section title={strings.profile.photos}>
        {photos.loading && !photos.data ? (
          <Skeleton height={120} />
        ) : (photos.data ?? []).length === 0 ? (
          <Text tone="muted">{strings.profile.emptyPhotos}</Text>
        ) : (
          <View style={styles.photos}>
            {(photos.data ?? []).map((p) => (
              <Pressable key={p.id} style={styles.photo} onPress={() => router.push(`/place/${p.place_slug}`)} accessibilityRole="link">
                <Image source={{ uri: previewUrl(p.preview_path) }} style={styles.photoImage} contentFit="cover" />
                <Text variant="caption" numberOfLines={1}>
                  {p.place_name}
                </Text>
                {own && p.status === 'pending' ? (
                  <Text variant="caption" tone="muted">
                    {strings.account.underReview}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.md,
  },
  identity: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  identityText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.bgMuted,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  map: {
    height: 280,
    borderRadius: radius.lg,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  review: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  reviewHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  photos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  photo: {
    width: 160,
    maxWidth: '48%',
    gap: 4,
  },
  photoImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    backgroundColor: colors.bgMuted,
  },
  selfStart: {
    alignSelf: 'flex-start',
  },
});
