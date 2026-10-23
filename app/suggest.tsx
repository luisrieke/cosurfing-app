import Head from 'expo-router/head';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { RequireAuth } from '@/components/RequireAuth';
import { Button, Chip, Input, Notice, Screen, Text, TopBar } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { normalizeWebsite } from '@/lib/format';
import { createSuggestion, getActiveCities } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, spacing } from '@/lib/theme';
import type { PlaceCategory } from '@/lib/types';

export default function SuggestRoute() {
  const { city } = useLocalSearchParams<{ city?: string }>();
  return (
    <RequireAuth title={strings.suggest.title} message={strings.suggest.signInFirst} redirect={city ? `/suggest?city=${city}` : '/suggest'}>
      <SuggestScreen presetCitySlug={city ?? null} />
    </RequireAuth>
  );
}

function SuggestScreen({ presetCitySlug }: { presetCitySlug: string | null }) {
  const router = useRouter();
  const { user } = useAuth();
  const cities = useQuery('active-cities', getActiveCities);
  const [citySlug, setCitySlug] = useState<string | 'other' | null>(presetCitySlug);
  const [cityText, setCityText] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PlaceCategory>('cafe');
  const [address, setAddress] = useState('');
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const selectedCity = (cities.data ?? []).find((c) => c.slug === citySlug) ?? null;

  const submit = async () => {
    if (!user) return;
    if (name.trim().length < 2) {
      setError(`${strings.suggest.name}: ${strings.common.notProvided}`);
      return;
    }
    if (!selectedCity && cityText.trim().length < 2) {
      setError(strings.waitlist.missingCity);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createSuggestion({
        userId: user.id,
        cityId: selectedCity?.id ?? null,
        cityText: selectedCity ? null : cityText.trim(),
        name,
        category,
        address: address.trim() || null,
        website: normalizeWebsite(website),
        notes: notes.trim() || null,
      });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Head>
        <title>Suggest a place · Cosurfing</title>
      </Head>
      <TopBar title={strings.suggest.title} onBack={back} />
      <Text tone="muted">{strings.suggest.intro}</Text>

      {sent ? (
        <>
          <Notice tone="success" body={strings.suggest.sent} />
          <Button title={strings.common.back} variant="secondary" onPress={back} />
        </>
      ) : (
        <View style={styles.form}>
          <View style={styles.field}>
            <Text variant="smallStrong">{strings.suggest.category}</Text>
            <View style={styles.chips}>
              <Chip label={strings.explore.coworking} icon="briefcase" color={colors.coworking} selected={category === 'coworking'} onPress={() => setCategory('coworking')} />
              <Chip label={strings.explore.cafe} icon="coffee" color={colors.cafe} selected={category === 'cafe'} onPress={() => setCategory('cafe')} />
            </View>
          </View>

          <Input label={strings.suggest.name} value={name} onChangeText={setName} placeholder="e.g. Café Example" maxLength={120} autoCapitalize="words" />

          <View style={styles.field}>
            <Text variant="smallStrong">{strings.suggest.city}</Text>
            <View style={styles.chips}>
              {(cities.data ?? []).map((c) => (
                <Chip key={c.id} label={c.name} selected={citySlug === c.slug} onPress={() => setCitySlug(c.slug)} />
              ))}
              <Chip label="Other city" selected={citySlug === 'other'} onPress={() => setCitySlug('other')} />
            </View>
            {citySlug === 'other' ? (
              <Input value={cityText} onChangeText={setCityText} placeholder="City, country" hint={strings.suggest.cityHint} />
            ) : (
              <Text variant="small" tone="muted">
                {strings.suggest.cityHint}
              </Text>
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
          <Button title={strings.suggest.submit} size="lg" fullWidth loading={busy} onPress={submit} />
        </View>
      )}
    </Screen>
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
});
