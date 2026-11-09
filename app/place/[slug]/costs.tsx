import Head from 'expo-router/head';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MenuGallery, OfferList } from '@/components/place/PlaceSections';
import { RequireAuth } from '@/components/RequireAuth';
import { Button, CategoryBadge, Chip, EmptyState, Input, Notice, Screen, Skeleton, Text, TopBar } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { normalizeWebsite } from '@/lib/format';
import { MAX_MENU_PHOTOS_PER_UPLOAD, MenuLimitError, deletePlaceMenu, pickImages, uploadPlaceMenu } from '@/lib/photoUpload';
import { OfferLimitError, createOffer, deleteOffer, getPlaceBySlug, getPlaceMenus, getPlaceOffers } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import type { OfferKind, PlaceMenu, PlaceOffer } from '@/lib/types';

interface OfferDraft {
  kind: OfferKind;
  title: string;
  details: string;
  url: string;
  code: string;
  expires: string;
}

const EMPTY_OFFER: OfferDraft = { kind: 'referral', title: '', details: '', url: '', code: '', expires: '' };

type OfferField = 'title' | 'url' | 'expires' | 'form';

function isFutureDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T23:59:59`);
  return !Number.isNaN(d.getTime()) && d.getTime() >= Date.now();
}

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

  const [offer, setOffer] = useState<OfferDraft>(EMPTY_OFFER);
  const [offerError, setOfferError] = useState<{ key: OfferField; message: string } | null>(null);
  const [offerBusy, setOfferBusy] = useState(false);
  const [offerSaved, setOfferSaved] = useState(false);

  const [menuBusy, setMenuBusy] = useState<string | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [menuSaved, setMenuSaved] = useState(0);

  const back = () => (router.canGoBack() ? router.back() : router.replace(`/place/${slug}`));

  const submitOffer = async () => {
    if (!user || !place) return;
    const c = strings.costs;
    const title = offer.title.trim();
    const details = offer.details.trim();
    const url = normalizeWebsite(offer.url);
    const code = offer.code.trim();
    const expires = offer.expires.trim();
    if (title.length < 3) {
      setOfferError({ key: 'title', message: c.invalidTitle });
      return;
    }
    if (url && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(url)) {
      setOfferError({ key: 'url', message: c.invalidUrl });
      return;
    }
    if (expires && !isFutureDate(expires)) {
      setOfferError({ key: 'expires', message: c.invalidExpires });
      return;
    }
    if (!url && !code && !details) {
      setOfferError({ key: 'form', message: c.needLinkOrCode });
      return;
    }
    setOfferError(null);
    setOfferBusy(true);
    setOfferSaved(false);
    try {
      await createOffer(user.id, place.id, {
        kind: offer.kind,
        title,
        details: details || null,
        url,
        code: code || null,
        expires_on: expires || null,
      });
      setOffer(EMPTY_OFFER);
      setOfferSaved(true);
      void offersQuery.refetch(true);
    } catch (e) {
      const message = e instanceof OfferLimitError ? c.offerLimit : e instanceof Error ? e.message : strings.common.somethingWentWrong;
      setOfferError({ key: 'form', message });
    } finally {
      setOfferBusy(false);
    }
  };

  const removeOffer = async (o: PlaceOffer) => {
    setOfferError(null);
    try {
      await deleteOffer(o.id);
      void offersQuery.refetch(true);
    } catch (e) {
      setOfferError({ key: 'form', message: e instanceof Error ? e.message : strings.common.somethingWentWrong });
    }
  };

  const uploadMenus = async () => {
    if (!user || !place) return;
    setMenuError(null);
    setMenuSaved(0);
    let done = 0;
    try {
      const uris = await pickImages(MAX_MENU_PHOTOS_PER_UPLOAD);
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
  const setOfferField = <K extends keyof OfferDraft>(key: K, value: OfferDraft[K]) => {
    setOffer((o) => ({ ...o, [key]: value }));
    setOfferSaved(false);
  };

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
          <OfferList offers={myOffers} onDelete={removeOffer} canDelete={() => true} />
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.block}>
          <Text variant="bodyStrong">{c.newOffer}</Text>
          <Text variant="caption" tone="muted">
            {c.newOfferHint}
          </Text>
        </View>
        <View style={styles.block}>
          <View style={styles.chips}>
            <Chip
              label={c.kindReferral}
              icon="users"
              selected={offer.kind === 'referral'}
              onPress={() => setOfferField('kind', 'referral')}
            />
            <Chip label={c.kindDeal} icon="tag" selected={offer.kind === 'deal'} onPress={() => setOfferField('kind', 'deal')} />
          </View>
          <Text variant="caption" tone="muted">
            {offer.kind === 'referral' ? c.kindReferralHint : c.kindDealHint}
          </Text>
        </View>
        <Input
          label={c.offerTitle}
          value={offer.title}
          onChangeText={(v) => setOfferField('title', v)}
          placeholder={c.offerTitlePlaceholder}
          maxLength={120}
          error={offerError?.key === 'title' ? offerError.message : null}
        />
        <Input
          label={c.offerDetails}
          optional
          value={offer.details}
          onChangeText={(v) => setOfferField('details', v)}
          placeholder={c.offerDetailsPlaceholder}
          multiline
          maxLength={1000}
        />
        <Input
          label={c.offerUrl}
          optional
          value={offer.url}
          onChangeText={(v) => setOfferField('url', v)}
          placeholder={c.offerUrlPlaceholder}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={500}
          error={offerError?.key === 'url' ? offerError.message : null}
        />
        <View style={styles.row}>
          <View style={styles.flex}>
            <Input
              label={c.offerCode}
              optional
              value={offer.code}
              onChangeText={(v) => setOfferField('code', v)}
              placeholder={c.offerCodePlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={60}
            />
          </View>
          <View style={styles.flex}>
            <Input
              label={c.offerExpires}
              optional
              value={offer.expires}
              onChangeText={(v) => setOfferField('expires', v)}
              placeholder={c.offerExpiresPlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={10}
              error={offerError?.key === 'expires' ? offerError.message : null}
            />
          </View>
        </View>
        {offerError?.key === 'form' ? <Notice tone="danger" body={offerError.message} /> : null}
        {offerSaved ? <Notice tone="success" body={c.offerSaved} /> : null}
        <Button title={c.offerSubmit} icon="send" fullWidth loading={offerBusy} onPress={submitOffer} />
      </View>

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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  flex: {
    flex: 1,
    minWidth: 160,
  },
});
