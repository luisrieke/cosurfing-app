import Head from 'expo-router/head';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { CitySearch } from '@/components/CitySearch';
import { Button, Chip, Icon, Input, Notice, Screen, Text, TopBar } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/env';
import { normalizeWebsite } from '@/lib/format';
import { clearSuggestionDraft, loadSuggestionDraft, saveSuggestionDraft, signUpHref, type SuggestionDraft } from '@/lib/funnel';
import { createSuggestion, findCityByNameAndCountry, getActiveCities } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import type { CitySearchResult, PlaceCategory } from '@/lib/types';

type Step = 'details' | 'account';

export default function SuggestRoute() {
  const { city, name } = useLocalSearchParams<{ city?: string; name?: string }>();
  return <SuggestScreen presetCitySlug={city ?? null} presetName={name?.trim().slice(0, 120) || null} />;
}

function SuggestScreen({ presetCitySlug, presetName }: { presetCitySlug: string | null; presetName: string | null }) {
  const router = useRouter();
  const { user, ready, isAdmin, isLocalGuide } = useAuth();
  const publishesDirectly = isAdmin || isLocalGuide;
  const cities = useQuery('active-cities', getActiveCities);
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState<Step>('details');
  const [awaitingAccount, setAwaitingAccount] = useState(false);
  const [pickedCity, setCity] = useState<SuggestionDraft['city']>(null);
  const [cityCleared, setCityCleared] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PlaceCategory>('cafe');
  const [address, setAddress] = useState('');
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const autoSending = useRef(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  useEffect(() => {
    let active = true;
    loadSuggestionDraft().then((draft) => {
      if (!active) return;
      if (draft) {
        setCity(draft.city ?? null);
        setName(draft.name);
        setCategory(draft.category);
        setAddress(draft.address);
        setWebsite(draft.website);
        setNotes(draft.notes);
        setAwaitingAccount(draft.awaitingAccount);
        if (draft.awaitingAccount) setStep('account');
      }
      // A search that found nothing (?name=...) starts a fresh suggestion unless one is already being written.
      if (presetName && !draft?.name.trim()) setName(presetName);
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [presetName]);

  // Coming from a city page (?city=slug) preselects that city unless the draft already has one
  // or the visitor cleared it.
  const presetCity = presetCitySlug ? cities.data?.find((c) => c.slug === presetCitySlug) : undefined;
  const city = useMemo<SuggestionDraft['city']>(() => {
    if (pickedCity) return pickedCity;
    if (!presetCity || cityCleared) return null;
    return { id: presetCity.id, label: `${presetCity.name}, ${presetCity.country_name}` };
  }, [pickedCity, presetCity, cityCleared]);

  const changeCity = () => {
    setCity(null);
    setCityCleared(true);
  };

  useEffect(() => {
    if (!hydrated || sent) return;
    saveSuggestionDraft({ city, name, category, address, website, notes, awaitingAccount });
  }, [hydrated, sent, city, name, category, address, website, notes, awaitingAccount]);

  const pickOtherCity = async (r: CitySearchResult) => {
    const label = `${r.name}, ${r.countryName}`;
    const existing = await findCityByNameAndCountry(r.name, r.countryCode).catch(() => null);
    setCity({ id: existing?.id ?? null, label });
  };

  const validate = (): boolean => {
    if (name.trim().length < 2) {
      setError(`${strings.suggest.name}: ${strings.common.notProvided}`);
      return false;
    }
    if (!city || city.label.trim().length < 2) {
      setError(strings.waitlist.missingCity);
      return false;
    }
    setError(null);
    return true;
  };

  const send = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createSuggestion({
        userId: user.id,
        cityId: city?.id ?? null,
        cityText: city?.id ? null : (city?.label.trim() ?? null),
        name,
        category,
        address: address.trim() || null,
        website: normalizeWebsite(website),
        notes: notes.trim() || null,
      });
      await clearSuggestionDraft();
      setPublishedSlug(result.placeSlug);
      setSent(true);
    } catch (e) {
      setAwaitingAccount(false);
      setStep('details');
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(false);
    }
  }, [user, city, name, category, address, website, notes]);

  // A visitor who finished the form and just signed up gets their suggestion sent right away.
  useEffect(() => {
    if (!hydrated || !ready || !user || !awaitingAccount || sent || autoSending.current) return;
    autoSending.current = true;
    send();
  }, [hydrated, ready, user, awaitingAccount, sent, send]);

  const submit = () => {
    if (!validate()) return;
    if (user) {
      send();
      return;
    }
    setAwaitingAccount(true);
    setStep('account');
  };

  const editDraft = () => {
    setAwaitingAccount(false);
    setStep('details');
  };

  const redirect = '/suggest';
  const autoSendPending = Boolean(user && awaitingAccount && !sent);

  return (
    <Screen>
      <Head>
        <title>Suggest a place · Cosurfing</title>
      </Head>
      <TopBar title={strings.suggest.title} onBack={back} />
      <Text tone="muted">{strings.suggest.intro}</Text>

      {!isSupabaseConfigured ? <Notice tone="warning" body={strings.common.backendNotConfigured} /> : null}

      {sent ? (
        publishedSlug ? (
          <>
            <Notice tone="success" body={isAdmin ? strings.suggest.published : strings.suggest.guidePublished} />
            <Button title={strings.suggest.viewPlace} onPress={() => router.replace(`/place/${publishedSlug}`)} />
            {isAdmin ? (
              <Button title={strings.suggest.reviewQueue} variant="secondary" onPress={() => router.push('/admin')} />
            ) : null}
          </>
        ) : isAdmin ? (
          <>
            <Notice tone="info" body={strings.suggest.adminNeedsCity} />
            <Button title={strings.admin.suggestions} variant="secondary" onPress={() => router.push('/admin/suggestions')} />
          </>
        ) : (
          <>
            <Notice tone="success" body={strings.suggest.sent} />
            <Button title={strings.common.back} variant="secondary" onPress={back} />
          </>
        )
      ) : !hydrated || autoSendPending ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          {autoSendPending ? <Text tone="muted">{strings.suggest.sending}</Text> : null}
        </View>
      ) : (
        <>
          {!user ? <Steps step={step} /> : null}

          {step === 'account' && !user ? (
            <View style={styles.form}>
              <View style={styles.summary}>
                <Text variant="smallStrong">{name.trim()}</Text>
                <Text variant="small" tone="muted">
                  {[city?.label, address.trim() || null].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Notice tone="info" title={strings.suggest.accountTitle} body={strings.suggest.accountBody} />
              <Button title={strings.suggest.createAccount} size="lg" fullWidth onPress={() => router.push(signUpHref(redirect))} />
              <Button title={strings.suggest.logIn} variant="secondary" fullWidth onPress={() => router.push(signUpHref(redirect, 'login'))} />
              <Button title={strings.suggest.editDraft} variant="ghost" size="sm" icon="edit-2" onPress={editDraft} />
            </View>
          ) : (
            <View style={styles.form}>
              <View style={styles.field}>
                <Text variant="smallStrong">{strings.suggest.category}</Text>
                <View style={styles.chips}>
                  <Chip label={strings.explore.coworking} icon="briefcase" color={colors.coworking} selected={category === 'coworking'} onPress={() => setCategory('coworking')} />
                  <Chip label={strings.explore.cafe} icon="coffee" color={colors.cafe} selected={category === 'cafe'} onPress={() => setCategory('cafe')} />
                  <Chip label={strings.explore.library} icon="book-open" color={colors.library} selected={category === 'library'} onPress={() => setCategory('library')} />
                  <Chip label={strings.explore.coliving} icon="home" color={colors.coliving} selected={category === 'coliving'} onPress={() => setCategory('coliving')} />
                </View>
              </View>

              <Input label={strings.suggest.name} value={name} onChangeText={setName} placeholder="e.g. Café Example" maxLength={120} autoCapitalize="words" />

              <View style={[styles.field, styles.cityField]}>
                <Text variant="smallStrong">{strings.suggest.city}</Text>
                {city ? (
                  <View style={styles.selectedCity}>
                    <Icon name="map-pin" size={18} color={colors.accent} />
                    <Text variant="bodyStrong" style={styles.selectedCityLabel}>
                      {city.label}
                    </Text>
                    <Button title={strings.suggest.changeCity} variant="ghost" size="sm" onPress={changeCity} />
                  </View>
                ) : (
                  <CitySearch
                    activeCities={cities.data ?? []}
                    onSelectActive={(c) => setCity({ id: c.id, label: `${c.name}, ${c.country_name}` })}
                    onSelectOther={pickOtherCity}
                    onManual={(q) => (q.length >= 2 ? setCity({ id: null, label: q }) : undefined)}
                  />
                )}
              </View>

              <Input label={strings.suggest.address} optional value={address} onChangeText={setAddress} placeholder="Street and number" maxLength={200} />
              <Input
                label={strings.suggest.website}
                optional
                value={website}
                onChangeText={setWebsite}
                placeholder="example.com"
                autoCapitalize="none"
                keyboardType="url"
                maxLength={200}
              />
              <Input
                label={strings.suggest.notes}
                optional
                value={notes}
                onChangeText={setNotes}
                placeholder={strings.suggest.notesPlaceholder}
                multiline
                maxLength={1000}
              />

              {error ? <Notice tone="danger" body={error} /> : null}
              <Text variant="small" tone="muted">
                {isAdmin
                  ? strings.suggest.adminReviewNote
                  : isLocalGuide
                    ? strings.suggest.guideReviewNote
                    : strings.suggest.reviewNote}
                {!user ? ` ${strings.suggest.draftSaved}` : ''}
              </Text>
              <Button
                title={user ? (publishesDirectly ? strings.suggest.publish : strings.suggest.submit) : strings.suggest.continueToAccount}
                size="lg"
                fullWidth
                loading={busy}
                onPress={submit}
                disabled={!isSupabaseConfigured}
              />
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

function Steps({ step }: { step: Step }) {
  const items: { key: Step; label: string }[] = [
    { key: 'details', label: strings.suggest.stepDetails },
    { key: 'account', label: strings.suggest.stepAccount },
  ];
  const current = items.findIndex((i) => i.key === step);
  return (
    <View style={styles.steps}>
      {items.map((item, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <View key={item.key} style={styles.step}>
            <View style={[styles.stepDot, (active || done) && styles.stepDotActive]}>
              {done ? (
                <Icon name="check" size={14} color={colors.onAccent} />
              ) : (
                <Text variant="caption" style={{ color: active ? colors.onAccent : colors.textMuted }}>
                  {index + 1}
                </Text>
              )}
            </View>
            <Text variant="smallStrong" tone={active ? 'default' : 'muted'}>
              {item.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.lg,
  },
  field: {
    gap: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  center: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
  },
  steps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgMuted,
  },
  stepDotActive: {
    backgroundColor: colors.accent,
  },
  cityField: {
    zIndex: 20,
  },
  selectedCity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    minHeight: 56,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  selectedCityLabel: {
    flex: 1,
  },
  summary: {
    gap: 2,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.bgSubtle,
  },
});
