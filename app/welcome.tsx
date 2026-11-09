import { Image } from 'expo-image';
import Head from 'expo-router/head';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AddPhotos } from '@/components/place/AddPhotos';
import { RequireAuth } from '@/components/RequireAuth';
import { Stars } from '@/components/Reviews';
import { SearchField } from '@/components/SearchField';
import { Badge, Button, CategoryBadge, Icon, Input, Notice, Screen, Skeleton, Text } from '@/components/ui';
import { useDebounced } from '@/hooks/useDebounced';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { deleteAvatar, pickImage, uploadAvatar } from '@/lib/photoUpload';
import { getCitiesByIds, getPlacesToRate, listCities, updateProfile, upsertReview } from '@/lib/queries';
import { avatarUrl } from '@/lib/storage';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import type { CityListItem } from '@/lib/types';

const GOAL = 3;
const MAX_CITIES = 3;

type PickedCity = Pick<CityListItem, 'id' | 'name' | 'slug' | 'country_name'>;

export default function WelcomeRoute() {
  return (
    <RequireAuth title={strings.welcome.title} message={strings.funnel.gateBody} redirect="/welcome">
      <WelcomeScreen />
    </RequireAuth>
  );
}

function WelcomeScreen() {
  const router = useRouter();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const { user, profile, isPlus, refresh } = useAuth();
  const [step, setStep] = useState<'profile' | 'rate' | 'details' | 'plus'>('profile');
  const [name, setName] = useState(profile?.display_name ?? '');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<PickedCity[] | null>(null);
  const [rated, setRated] = useState<Record<string, number>>({});
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [avatarPath, setAvatarPath] = useState<string | null>(profile?.avatar_path ?? null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = useDebounced(query.trim(), 200);

  const savedIds = profile?.city_ids?.length ? profile.city_ids : profile?.home_city_id ? [profile.home_city_id] : [];
  const savedQuery = useQuery(`profile-cities:${savedIds.join(',')}`, () => getCitiesByIds(savedIds), savedIds.length > 0 && !picked);
  const cities: PickedCity[] = picked ?? (savedQuery.data ?? []).map((c) => ({ id: c.id, name: c.name, slug: c.slug, country_name: c.country_name }));
  const selectedCity = cities[0] ?? null;
  const citiesQuery = useQuery(`welcome-cities:${q}`, () => listCities({ q, continent: null, sort: q ? 'population' : 'score', limit: 6, offset: 0 }), q.length >= 2);
  const results = (citiesQuery.data?.items ?? []).filter((c) => !cities.some((s) => s.id === c.id));
  const placesQuery = useQuery(`welcome-rate:${selectedCity?.id}`, () => getPlacesToRate(selectedCity!.id, 20), step !== 'profile' && Boolean(selectedCity));

  const safeRedirect = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : null;
  const ratedCount = Object.keys(rated).length;
  const ratedPlaces = (placesQuery.data ?? []).filter((p) => rated[p.id]);

  const saveProfile = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await updateProfile(user.id, {
        display_name: name.trim() || null,
        home_city_id: selectedCity?.id ?? null,
        city_ids: cities.map((c) => c.id),
      });
      void refresh();
      if (selectedCity) setStep('rate');
      else await finish();
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(false);
    }
  };

  const changeAvatar = async (remove = false) => {
    if (!user) return;
    setError(null);
    try {
      const uri = remove ? null : await pickImage(() => setAvatarBusy(true));
      if (!remove && !uri) return;
      setAvatarBusy(true);
      const previous = avatarPath;
      const next = uri ? await uploadAvatar(user.id, uri) : null;
      await updateProfile(user.id, { avatar_path: next });
      setAvatarPath(next);
      void refresh();
      if (previous) void deleteAvatar(previous).catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setAvatarBusy(false);
    }
  };

  const rate = async (placeId: string, value: number) => {
    if (!user) return;
    setRated((r) => ({ ...r, [placeId]: value }));
    try {
      await upsertReview(user.id, placeId, {
        rating: value,
        body: '',
        wifi_rating: null,
        power_rating: null,
        quiet_rating: null,
        comfort_rating: null,
        value_rating: null,
        calls_ok: null,
      });
    } catch {
      setRated((r) => {
        const next = { ...r };
        delete next[placeId];
        return next;
      });
      setError(strings.common.somethingWentWrong);
    }
  };

  const saveDetails = async () => {
    if (!user) return;
    const written = ratedPlaces
      .map((p) => ({ place: p, body: (bodies[p.id] ?? '').trim() }))
      .filter((w) => w.body.length > 0);
    if (written.some((w) => w.body.length < 3)) {
      setError(strings.review.minBody);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await Promise.all(
        written.map((w) =>
          upsertReview(user.id, w.place.id, {
            rating: rated[w.place.id] ?? 0,
            body: w.body,
            wifi_rating: null,
            power_rating: null,
            quiet_rating: null,
            comfort_rating: null,
            value_rating: null,
            calls_ok: null,
          }),
        ),
      );
      await finish();
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(false);
    }
  };

  const dest = (safeRedirect ?? (selectedCity ? `/${selectedCity.slug}` : '/')) as Href;

  const finish = async () => {
    if (!user) return;
    await updateProfile(user.id, { onboarded_at: new Date().toISOString() }).catch(() => undefined);
    void refresh();
    if (isPlus) router.replace(dest);
    else setStep('plus');
  };

  // Plus opens on top of the destination, so closing the paywall lands where onboarding would have.
  const openPlus = () => {
    router.replace(dest);
    router.push('/plus');
  };

  return (
    <Screen>
      <Head>
        <title>{`${strings.welcome.title} · Cosurfing`}</title>
      </Head>
      <View style={styles.intro}>
        <Text variant="title">{strings.welcome.title}</Text>
        <Text tone="muted">{strings.welcome.subtitle}</Text>
      </View>
      {error ? <Notice tone="danger" body={error} /> : null}

      {step === 'profile' ? (
        <View style={styles.form}>
          <View style={styles.avatarRow}>
            <Pressable
              onPress={() => void changeAvatar()}
              disabled={avatarBusy}
              style={styles.avatar}
              accessibilityRole="button"
              accessibilityLabel={avatarPath ? strings.welcome.avatarChange : strings.welcome.avatarAdd}
            >
              {avatarPath ? (
                <Image source={{ uri: avatarUrl(avatarPath) }} style={styles.avatarImage} contentFit="cover" />
              ) : (
                <Icon name="camera" size={28} color={colors.accent} />
              )}
            </Pressable>
            <View style={[styles.flex, styles.block]}>
              <Text variant="smallStrong">{strings.welcome.avatarLabel}</Text>
              <Text variant="small" tone="muted">
                {strings.welcome.avatarHint}
              </Text>
              <View style={styles.avatarActions}>
                <Button
                  title={avatarPath ? strings.welcome.avatarChange : strings.welcome.avatarAdd}
                  icon="image"
                  variant="secondary"
                  size="sm"
                  loading={avatarBusy}
                  onPress={() => void changeAvatar()}
                />
                {avatarPath && !avatarBusy ? (
                  <Button title={strings.welcome.avatarRemove} variant="ghost" size="sm" onPress={() => void changeAvatar(true)} />
                ) : null}
              </View>
            </View>
          </View>
          <Input
            label={strings.welcome.nameLabel}
            hint={strings.welcome.nameHint}
            value={name}
            onChangeText={setName}
            autoComplete="given-name"
            maxLength={40}
          />
          <View style={styles.block}>
            <Text variant="smallStrong">{strings.welcome.cityLabel}</Text>
            <Text variant="small" tone="muted">
              {strings.welcome.cityHint(MAX_CITIES)}
            </Text>
            {cities.map((c, i) => (
              <Pressable
                key={c.id}
                onPress={() => setPicked(cities.filter((s) => s.id !== c.id))}
                style={styles.selectedCity}
                accessibilityRole="button"
                accessibilityLabel={strings.welcome.removeCity(c.name)}
              >
                <Icon name="map-pin" size={16} color={colors.accent} />
                <Text variant="bodyStrong" style={styles.flex}>
                  {c.name}, {c.country_name}
                </Text>
                {i === 0 && cities.length > 1 ? (
                  <Text variant="caption" tone="muted">
                    {strings.welcome.homeCity}
                  </Text>
                ) : null}
                <Icon name="x" size={16} color={colors.textMuted} />
              </Pressable>
            ))}
            {cities.length < MAX_CITIES ? (
              <>
                <SearchField
                  value={query}
                  onChangeText={setQuery}
                  placeholder={cities.length ? strings.welcome.cityAddPlaceholder : strings.welcome.cityPlaceholder}
                />
                {results.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      setPicked([...cities, { id: c.id, name: c.name, slug: c.slug, country_name: c.country_name }]);
                      setQuery('');
                    }}
                    style={({ pressed }) => [styles.cityOption, pressed && styles.pressed]}
                    accessibilityRole="button"
                  >
                    <Text variant="body">{c.name}</Text>
                    <Text variant="small" tone="muted">
                      {c.country_name}
                    </Text>
                  </Pressable>
                ))}
              </>
            ) : null}
          </View>
          <Button title={strings.welcome.continue} size="lg" fullWidth loading={busy} onPress={() => void saveProfile()} />
          <Button title={strings.welcome.rateSkip} variant="ghost" onPress={() => void finish()} />
        </View>
      ) : step === 'rate' ? (
        <View style={styles.form}>
          <View style={styles.block}>
            <Text variant="heading">{strings.welcome.rateTitle(selectedCity?.name ?? '')}</Text>
            <Text tone="muted">{strings.welcome.rateBody}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.min(1, ratedCount / GOAL) * 100}%` }]} />
            </View>
            <Text variant="caption" tone="muted">
              {strings.welcome.rated(Math.min(ratedCount, GOAL))}
            </Text>
          </View>
          {placesQuery.loading ? (
            <Skeleton height={240} />
          ) : (
            <ScrollView style={styles.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {(placesQuery.data ?? []).map((p) => (
                <View key={p.id} style={styles.placeRow}>
                  <View style={styles.flex}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {p.name}
                    </Text>
                    <View style={styles.meta}>
                      <CategoryBadge category={p.category} />
                      {p.address ? (
                        <Text variant="caption" tone="muted" numberOfLines={1} style={styles.flex}>
                          {p.address}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <Stars value={rated[p.id] ?? 0} size={22} onChange={(v) => void rate(p.id, v)} />
                </View>
              ))}
            </ScrollView>
          )}
          <Button
            title={ratedCount > 0 ? strings.welcome.continue : strings.welcome.finish}
            size="lg"
            fullWidth
            variant={ratedCount >= GOAL ? 'primary' : 'secondary'}
            onPress={() => (ratedCount > 0 ? setStep('details') : void finish())}
          />
          {ratedCount < GOAL ? <Button title={strings.welcome.rateSkip} variant="ghost" onPress={() => void finish()} /> : null}
        </View>
      ) : step === 'plus' ? (
        <View style={styles.form}>
          <View style={styles.plusCard}>
            <Badge label={strings.plus.title} tone="plus" icon="star" />
            <Text variant="heading">{strings.welcome.plusTitle}</Text>
            <Text tone="muted">{strings.welcome.plusBody}</Text>
            <View style={styles.block}>
              {strings.plus.features.map((f) => (
                <View key={f} style={styles.plusFeature}>
                  <Icon name="check" size={18} color={colors.plus} />
                  <Text style={styles.flex}>{f}</Text>
                </View>
              ))}
            </View>
            <Text variant="smallStrong" tone="plus">
              {strings.plus.priceSummary}
            </Text>
          </View>
          <Button title={strings.welcome.plusCta} variant="plus" size="lg" fullWidth icon="star" onPress={openPlus} />
          <Button title={strings.welcome.plusSkip} variant="ghost" onPress={() => router.replace(dest)} />
        </View>
      ) : (
        <View style={styles.form}>
          <View style={styles.block}>
            <Text variant="heading">{strings.welcome.detailsTitle}</Text>
            <Text tone="muted">{strings.welcome.detailsBody}</Text>
          </View>
          {ratedPlaces.map((p) => (
            <View key={p.id} style={styles.detailCard}>
              <View style={styles.placeRow}>
                <View style={styles.flex}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {p.name}
                  </Text>
                  <View style={styles.meta}>
                    <CategoryBadge category={p.category} />
                    {p.address ? (
                      <Text variant="caption" tone="muted" numberOfLines={1} style={styles.flex}>
                        {p.address}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <Stars value={rated[p.id] ?? 0} size={18} />
              </View>
              <View style={styles.detailBody}>
                <Input
                  label={`${strings.review.bodyLabel} (${strings.common.optional})`}
                  value={bodies[p.id] ?? ''}
                  onChangeText={(v) => setBodies((b) => ({ ...b, [p.id]: v }))}
                  placeholder={strings.review.bodyPlaceholder}
                  multiline
                  maxLength={2000}
                />
                {user ? <AddPhotos placeId={p.id} userId={user.id} onSignIn={() => undefined} /> : null}
              </View>
            </View>
          ))}
          <Button title={strings.welcome.detailsSave} size="lg" fullWidth loading={busy} onPress={() => void saveDetails()} />
          <Button title={strings.welcome.rateSkip} variant="ghost" onPress={() => void finish()} disabled={busy} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    gap: spacing.xs,
  },
  form: {
    gap: spacing.lg,
  },
  block: {
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  selectedCity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  cityOption: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  pressed: {
    backgroundColor: colors.bgSubtle,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.bgMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  list: {
    maxHeight: 440,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  detailCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  detailBody: {
    gap: spacing.md,
    padding: spacing.md,
  },
  plusCard: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.plusSoft,
    alignItems: 'flex-start',
  },
  plusFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    alignSelf: 'stretch',
  },
});
