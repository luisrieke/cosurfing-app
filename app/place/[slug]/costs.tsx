import Head from 'expo-router/head';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MenuGallery, OfferList } from '@/components/place/PlaceSections';
import { RequireAuth } from '@/components/RequireAuth';
import { Button, CategoryBadge, EmptyState, Notice, Screen, Skeleton, Text, TopBar } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { MAX_MENU_PHOTOS_PER_UPLOAD, MenuLimitError, deletePlaceMenu, pickImages, uploadPlaceMenu } from '@/lib/photoUpload';
import { deleteOffer, getPlaceBySlug, getPlaceMenus, getPlaceOffers } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import type { PlaceMenu, PlaceOffer } from '@/lib/types';

export default function CostsRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return (
    <RequireAuth title={strings.costs.screenTitle} message={strings.costs.signIn} redirect={`/place/${slug}/costs`}>
      <CostsScreen key={slug} slug={slug!} />
    </RequireAuth>
  );
}

function CostsScreen({ slug }: { slug: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const placeQuery = useQuery(`place:${slug}`, () => getPlaceBySlug(slug));
  const place = placeQuery.data ?? null;
  const ready = Boolean(place && user);
  const offersQuery = useQuery(`offers:${place?.id}:${user?.id}`, () => getPlaceOffers(place!.id), ready);
  const menusQuery = useQuery(`menus:${place?.id}:${user?.id}`, () => getPlaceMenus(place!.id), ready);

  const [offerError, setOfferError] = useState<string | null>(null);

  const [menuBusy, setMenuBusy] = useState<string | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [menuSaved, setMenuSaved] = useState(0);

  const back = () => (router.canGoBack() ? router.back() : router.replace(`/place/${slug}`));

  const removeOffer = async (o: PlaceOffer) => {
    setOfferError(null);
    try {
      await deleteOffer(o.id);
      void offersQuery.refetch(true);
    } catch (e) {
      setOfferError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    }
  };

  const uploadMenus = async () => {
    if (!user || !place) return;
    setMenuError(null);
    setMenuSaved(0);
    let done = 0;
    try {
      const uris = await pickImages(MAX_MENU_PHOTOS_PER_UPLOAD, (count) => setMenuBusy(strings.costs.menuUploading(1, count)));
      if (uris.length === 0) return;
      for (const uri of uris) {
        setMenuBusy(strings.costs.menuUploading(done + 1, uris.length));
        await uploadPlaceMenu(place.id, user.id, uri);
        done += 1;
      }
    } catch (e) {
      const message = e instanceof MenuLimitError ? strings.costs.menuLimit : e instanceof Error ? e.message : strings.common.somethingWentWrong;
      setMenuError(message);
    } finally {
      setMenuBusy(null);
      setMenuSaved(done);
      if (done > 0) void menusQuery.refetch(true);
    }
  };

  const removeMenu = async (m: PlaceMenu) => {
    setMenuError(null);
    try {
      await deletePlaceMenu(m);
      void menusQuery.refetch(true);
    } catch (e) {
      setMenuError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    }
  };

  if (placeQuery.loading) {
    return (
      <Screen>
        <TopBar title={strings.costs.screenTitle} onBack={back} />
        <Skeleton height={28} width="60%" />
        <Skeleton height={240} />
      </Screen>
    );
  }
  if (!place || place.status !== 'published') {
    return (
      <Screen>
        <TopBar title={strings.costs.screenTitle} onBack={back} />
        <EmptyState icon="map-pin" title={strings.place.notFound} actionLabel={strings.notFound.home} onAction={() => router.replace('/')} />
      </Screen>
    );
  }

  const c = strings.costs;
  const myOffers = (offersQuery.data ?? []).filter((o) => o.is_own);
  const myMenus = (menusQuery.data ?? []).filter((m) => m.is_own && m.kind !== 'hours');

  return (
    <Screen>
      <Head>
        <title>{`${c.screenTitle} · ${place.name} · Cosurfing`}</title>
      </Head>
      <TopBar title={c.screenTitle} onBack={back} />
      <View style={styles.intro}>
        <CategoryBadge category={place.category} />
        <Text variant="title">{place.name}</Text>
        <Text tone="muted">{c.intro}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.block}>
          <Text variant="bodyStrong">{c.menuTitle}</Text>
          <Text variant="caption" tone="muted">
            {c.menuIntro}
          </Text>
        </View>
        {myMenus.length > 0 ? (
          <View style={styles.block}>
            <Text variant="smallStrong">{c.yourMenus}</Text>
            <MenuGallery menus={myMenus} onDelete={removeMenu} canDelete={() => true} />
          </View>
        ) : null}
        {menuError ? <Notice tone="danger" body={menuError} /> : null}
        {menuSaved > 0 ? <Notice tone="success" body={c.menuSaved(menuSaved)} /> : null}
        <Button
          title={menuBusy ?? c.chooseMenu}
          icon="camera"
          variant="secondary"
          fullWidth
          loading={menuBusy !== null}
          disabled={menuBusy !== null}
          onPress={uploadMenus}
        />
      </View>

      {myOffers.length > 0 ? (
        <View style={styles.block}>
          <Text variant="heading">{c.yourOffers}</Text>
          {offerError ? <Notice tone="danger" body={offerError} /> : null}
          <OfferList offers={myOffers} onDelete={removeOffer} canDelete={() => true} />
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
});
