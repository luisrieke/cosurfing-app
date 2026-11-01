import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge, Button, Icon, Input, Notice, Screen, Text, TopBar } from '@/components/ui';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { countries, countryName } from '@/lib/citySearch';
import { isSupabaseConfigured } from '@/lib/env';
import { isValidEmail } from '@/lib/format';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import type { City } from '@/lib/types';
import { type JoinStatus, joinWaitlist, WaitlistApiError } from '@/lib/waitlistApi';

interface WaitlistScreenProps {
  /** Existing waiting-list city row, when known. */
  city?: City | null;
  cityName: string;
  countryCode?: string;
  countryName?: string;
  lat?: number;
  lng?: number;
}

export function WaitlistScreen(props: WaitlistScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useBreakpoint();
  const initialCountry = props.city?.country_code ?? props.countryCode ?? '';
  const [cityName, setCityName] = useState(props.city?.name ?? props.cityName);
  const [country, setCountry] = useState(initialCountry.toUpperCase());
  const [countryQuery, setCountryQuery] = useState('');
  const [countryFocused, setCountryFocused] = useState(false);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; city?: string; country?: string; form?: string }>({});
  const [result, setResult] = useState<{ status: JoinStatus; city?: { slug: string; name: string } } | null>(null);

  const countryMatches = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    if (!q) return [];
    return countries.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q).slice(0, 6);
  }, [countryQuery]);

  const displayCity = cityName.trim() || props.cityName;

  const submit = async () => {
    const next: typeof errors = {};
    if (!isValidEmail(email)) next.email = strings.waitlist.invalidEmail;
    if (!cityName.trim()) next.city = strings.waitlist.missingCity;
    if (!/^[A-Z]{2}$/.test(country)) next.country = strings.waitlist.missingCountry;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSubmitting(true);
    try {
      const res = await joinWaitlist({
        email: email.trim(),
        city: cityName.trim(),
        country: props.city?.country_name ?? props.countryName ?? countryName(country),
        countryCode: country,
        firstName: firstName.trim() || undefined,
        lat: props.city?.lat ?? props.lat,
        lng: props.city?.lng ?? props.lng,
        website,
      });
      setResult(res);
    } catch (e) {
      const code = e instanceof WaitlistApiError ? e.code : 'server_error';
      const map: Record<string, string> = {
        invalid_email: strings.waitlist.invalidEmail,
        missing_city: strings.waitlist.missingCity,
        missing_country: strings.waitlist.missingCountry,
        rate_limited: strings.waitlist.rateLimited,
        email_not_configured: strings.waitlist.emailNotConfigured,
        email_failed: strings.common.somethingWentWrong,
        network: strings.common.offline,
      };
      setErrors({ form: map[code] ?? strings.common.somethingWentWrong });
    } finally {
      setSubmitting(false);
    }
  };

  const head = (
    <Head>
      <title>{`Cosurfing in ${displayCity} · Waiting list`}</title>
    </Head>
  );

  if (result) {
    const r = result;
    return (
      <Screen>
        {head}
        <TopBar back onBack={() => router.replace('/')} />
        <View style={[styles.hero, { paddingTop: isDesktop ? spacing.xxl : spacing.lg }]}>
          <View style={[styles.iconCircle, { backgroundColor: r.status === 'city_active' ? colors.accentSoft : colors.successSoft }]}>
            <Icon
              name={r.status === 'city_active' ? 'map-pin' : r.status === 'already_verified' ? 'check-circle' : 'mail'}
              size={28}
              color={r.status === 'city_active' ? colors.accent : colors.success}
            />
          </View>
          {r.status === 'city_active' ? (
            <>
              <Text variant="title" align="center">
                {strings.waitlist.cityIsLive(r.city?.name ?? displayCity)}
              </Text>
              <Text tone="muted" align="center">
                {strings.waitlist.alreadyActiveCity}
              </Text>
              <Button title={strings.waitlist.openCity(r.city?.name ?? displayCity)} onPress={() => router.replace(`/${r.city?.slug}`)} />
            </>
          ) : r.status === 'already_verified' ? (
            <>
              <Text variant="title" align="center">
                {strings.waitlist.confirmTitle}
              </Text>
              <Text tone="muted" align="center">
                {strings.waitlist.alreadyVerified}
              </Text>
              <Button title={strings.waitlist.backHome} variant="secondary" onPress={() => router.replace('/')} />
            </>
          ) : (
            <>
              <Text variant="title" align="center">
                {strings.waitlist.checkInbox}
              </Text>
              <Text tone="muted" align="center">
                {strings.waitlist.checkInboxBody(email.trim())}
              </Text>
              {r.status === 'pending_resent' ? <Notice tone="info" body={strings.waitlist.alreadyPending} /> : null}
              <Button title={strings.waitlist.backHome} variant="secondary" onPress={() => router.replace('/')} />
            </>
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {head}
      <TopBar back onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <View style={[styles.hero, { paddingTop: isDesktop ? spacing.xl : spacing.sm }]}>
        <Badge label={strings.home.comingSoon} tone="accent" icon="clock" />
        <Text variant={isDesktop ? 'display' : 'title'} align="center">
          {strings.waitlist.title(displayCity)}
        </Text>
        <Text tone="muted" align="center">
          {strings.waitlist.subtitle}
        </Text>
      </View>

      {!isSupabaseConfigured ? <Notice tone="warning" body={strings.common.backendNotConfigured} /> : null}

      <View style={styles.form}>
        <Input
          label={strings.waitlist.email}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          error={errors.email}
        />
        <Input
          label={strings.waitlist.city}
          value={cityName}
          onChangeText={setCityName}
          autoCapitalize="words"
          error={errors.city}
        />
        <View style={styles.countryField}>
          <Text variant="smallStrong">{strings.waitlist.country}</Text>
          {country ? (
            <View style={styles.countryChosen}>
              <Text>
                {countryName(country)} <Text tone="muted">({country})</Text>
              </Text>
              <Pressable onPress={() => setCountry('')} hitSlop={8} accessibilityRole="button">
                <Text variant="smallStrong" tone="accent">
                  Change
                </Text>
              </Pressable>
            </View>
          ) : (
            <View>
              <TextInput
                value={countryQuery}
                onChangeText={setCountryQuery}
                onFocus={() => setCountryFocused(true)}
                onBlur={() => setCountryFocused(false)}
                placeholder="Start typing a country…"
                placeholderTextColor={colors.textFaint}
                autoCorrect={false}
                style={[
                  styles.countryInput,
                  countryFocused && { borderColor: colors.textMuted },
                  errors.country ? { borderColor: colors.danger } : null,
                ]}
                accessibilityLabel={strings.waitlist.country}
              />
              {countryMatches.length > 0 ? (
                <View style={styles.countryList}>
                  {countryMatches.map((c) => (
                    <Pressable
                      key={c.code}
                      style={styles.countryRow}
                      onPress={() => {
                        setCountry(c.code);
                        setCountryQuery('');
                      }}
                      accessibilityRole="button"
                    >
                      <Text>{c.name}</Text>
                      <Text variant="small" tone="muted">
                        {c.code}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          )}
          <Text variant="small" tone={errors.country ? 'danger' : 'muted'}>
            {errors.country ?? strings.waitlist.countryHint}
          </Text>
        </View>
        <Input
          label={strings.waitlist.firstName}
          optional
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
          autoComplete="given-name"
        />
        {/* Honeypot: hidden from humans, bots tend to fill it. */}
        <View
          style={styles.honeypot}
          pointerEvents="none"
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <TextInput value={website} onChangeText={setWebsite} placeholder="Website" tabIndex={-1} autoComplete="off" />
        </View>

        {errors.form ? <Notice tone="danger" body={errors.form} /> : null}

        <Button
          title={strings.waitlist.submit}
          size="lg"
          fullWidth
          loading={submitting}
          disabled={!isSupabaseConfigured}
          onPress={submit}
        />
        <Text variant="small" tone="muted">
          {strings.waitlist.consent(displayCity)}
        </Text>
      </View>
      <View style={{ height: insets.bottom }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  form: {
    gap: spacing.lg,
  },
  countryField: {
    gap: 6,
  },
  countryChosen: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgSubtle,
  },
  countryInput: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
    outlineWidth: 0,
  },
  countryList: {
    marginTop: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  countryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  honeypot: {
    position: 'absolute',
    left: -9999,
    width: 1,
    height: 1,
    opacity: 0,
  },
});
