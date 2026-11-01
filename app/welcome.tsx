import Head from 'expo-router/head';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { RequireAuth } from '@/components/RequireAuth';
import { Stars } from '@/components/Reviews';
import { SearchField } from '@/components/SearchField';
import { Button, CategoryBadge, Icon, Input, Notice, Screen, Skeleton, Text } from '@/components/ui';
import { useDebounced } from '@/hooks/useDebounced';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { getCityById, getPlacesToRate, listCities, updateProfile, upsertReview } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import type { CityListItem } from '@/lib/types';

const GOAL = 3;

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
  const { user, profile, refresh } = useAuth();
  const [step, setStep] = useState<'profile' | 'rate'>('profile');
  const [name, setName] = useState(profile?.display_name ?? '');
  const [query, setQuery] = useState('');
  const [city, setCity] = useState<Pick<CityListItem, 'id' | 'name' | 'slug' | 'country_name'> | null>(null);
  const [rated, setRated] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = useDebounced(query.trim(), 200);

  const homeQuery = useQuery(`home-city:${profile?.home_city_id}`, () => getCityById(profile!.home_city_id!), Boolean(profile?.home_city_id) && !city);
  const selectedCity = city ?? (homeQuery.data ? { id: homeQuery.data.id, name: homeQuery.data.name, slug: homeQuery.data.slug, country_name: homeQuery.data.country_name } : null);
  const citiesQuery = useQuery(`welcome-cities:${q}`, () => listCities({ q, continent: null, sort: q ? 'population' : 'score', limit: 6, offset: 0 }), q.length >= 2);
  const placesQuery = useQuery(`welcome-rate:${selectedCity?.id}`, () => getPlacesToRate(selectedCity!.id, 8), step === 'rate' && Boolean(selectedCity));

  const safeRedirect = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : null;
  const ratedCount = Object.keys(rated).length;

  const saveProfile = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await updateProfile(user.id, { display_name: name.trim() || null, home_city_id: selectedCity?.id ?? null });
      void refresh();
      if (selectedCity) setStep('rate');
      else await finish();
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(false);
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

  const finish = async () => {
    if (!user) return;
    await updateProfile(user.id, { onboarded_at: new Date().toISOString() }).catch(() => undefined);
    void refresh();
    const dest = safeRedirect ?? (selectedCity ? `/${selectedCity.slug}` : '/');
    router.replace(dest as Href);
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
            {selectedCity ? (
              <Pressable onPress={() => setCity(null)} style={styles.selectedCity} accessibilityRole="button">
                <Icon name="map-pin" size={16} color={colors.accent} />
                <Text variant="bodyStrong" style={styles.flex}>
                  {selectedCity.name}, {selectedCity.country_name}
                </Text>
                <Icon name="x" size={16} color={colors.textMuted} />
              </Pressable>
            ) : (
              <>
                <SearchField value={query} onChangeText={setQuery} placeholder={strings.welcome.cityPlaceholder} />
                {(citiesQuery.data?.items ?? []).map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      setCity(c);
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
            )}
          </View>
          <Button title={strings.welcome.continue} size="lg" fullWidth loading={busy} onPress={() => void saveProfile()} />
          <Button title={strings.welcome.rateSkip} variant="ghost" onPress={() => void finish()} />
        </View>
      ) : (
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
            <View style={styles.list}>
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
            </View>
          )}
          <Button
            title={strings.welcome.finish}
            size="lg"
            fullWidth
            variant={ratedCount >= GOAL ? 'primary' : 'secondary'}
            onPress={() => void finish()}
          />
          {ratedCount < GOAL ? <Button title={strings.welcome.rateSkip} variant="ghost" onPress={() => void finish()} /> : null}
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
});
