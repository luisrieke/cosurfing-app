import Head from 'expo-router/head';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Icon, Input, Notice, Screen, Text, TopBar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/env';
import { isValidEmail } from '@/lib/format';
import { getProfile } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { strings } from '@/lib/strings';
import { TERMS_VERSION } from '@/lib/terms';
import { colors, spacing } from '@/lib/theme';

export default function SignInScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ redirect?: string; mode?: string }>();
  const redirect = params.redirect;
  const [mode, setMode] = useState<'signup' | 'login'>(params.mode === 'login' ? 'login' : 'signup');
  const { user, ready } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ageConfirmed, setAgeConfirmed] = useState(false);

  const safeRedirect = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : null;
  const target: Href = (safeRedirect ?? '/') as Href;

  // Set while verifying a code, so the post-sign-in routing below decides where to go.
  const verifying = useRef(false);
  useEffect(() => {
    if (ready && user && !verifying.current) router.replace(target);
  }, [ready, user, router, target]);

  const sendCode = async () => {
    if (!supabase) return;
    if (!isValidEmail(email)) {
      setError(strings.auth.invalidEmail);
      return;
    }
    const signup = mode === 'signup';
    if (signup && !ageConfirmed) {
      setError(strings.auth.needAge);
      return;
    }
    setBusy(true);
    setError(null);
    const now = new Date().toISOString();
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      // Only stored when this call creates the account: evidence of which Terms were accepted and that the age was confirmed.
      // Logging in never creates an account, so nobody skips the age confirmation.
      options: signup
        ? { shouldCreateUser: true, data: { terms_version: TERMS_VERSION, terms_accepted_at: now, age_confirmed_at: now } }
        : { shouldCreateUser: false },
    });
    setBusy(false);
    if (err) {
      setError(!signup && /signups? not allowed|user not found/i.test(err.message) ? strings.auth.noAccount : err.message);
      return;
    }
    setStep('code');
  };

  const verify = async () => {
    if (!supabase) return;
    const token = code.replace(/\s+/g, '');
    if (token.length < 8) {
      setError(strings.auth.invalidCode);
      return;
    }
    setBusy(true);
    setError(null);
    verifying.current = true;
    const { data, error: err } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: 'email',
    });
    setBusy(false);
    if (err || !data.user) {
      verifying.current = false;
      setError(strings.auth.invalidCode);
      return;
    }
    // New accounts get the short onboarding first, then continue where they came from.
    const profile = await getProfile(data.user.id).catch(() => null);
    if (profile && !profile.onboarded_at) {
      router.replace({ pathname: '/welcome', params: safeRedirect ? { redirect: safeRedirect } : {} });
      return;
    }
    router.replace(target);
  };

  return (
    <Screen>
      <Head>
        <title>{`${mode === 'login' ? strings.nav.logIn : strings.nav.signUp} · Cosurfing`}</title>
      </Head>
      <TopBar title={mode === 'login' ? strings.nav.logIn : strings.nav.signUp} />
      <View style={styles.intro}>
        <Text variant="title">{mode === 'login' ? strings.auth.titleLogin : strings.auth.title}</Text>
        <Text tone="muted">{strings.auth.intro}</Text>
      </View>
      {mode === 'signup' && step === 'email' ? (
        <View style={styles.benefits}>
          {strings.auth.benefits.map((b) => (
            <View key={b} style={styles.benefit}>
              <Icon name="check" size={16} color={colors.accent} />
              <Text variant="small">{b}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {!isSupabaseConfigured ? <Notice tone="warning" body={strings.common.backendNotConfigured} /> : null}

      {step === 'email' ? (
        <View style={styles.form}>
          <Input
            label={strings.auth.email}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            autoFocus
            returnKeyType="send"
            onSubmitEditing={sendCode}
            error={error}
          />
          {mode === 'signup' ? (
            <Pressable
              style={styles.check}
              onPress={() => setAgeConfirmed(!ageConfirmed)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: ageConfirmed }}
            >
              <Icon name={ageConfirmed ? 'check-square' : 'square'} size={20} color={ageConfirmed ? colors.accent : colors.textMuted} />
              <Text variant="small">{strings.auth.ageConfirm}</Text>
            </Pressable>
          ) : null}
          <Button title={strings.auth.sendCode} size="lg" fullWidth loading={busy} onPress={sendCode} disabled={!isSupabaseConfigured} />
          <Text variant="small" tone="muted">
            {strings.auth.legal}{' '}
            <Text variant="smallStrong" tone="accent" onPress={() => router.push('/terms')} accessibilityRole="link">
              {strings.auth.termsLink}
            </Text>
            {strings.auth.legalRights}
            <Text variant="smallStrong" tone="accent" onPress={() => router.push('/privacy')} accessibilityRole="link">
              {strings.auth.privacyLink}
            </Text>
            .
          </Text>
          <Button
            title={mode === 'login' ? strings.auth.switchToSignUp : strings.auth.switchToLogin}
            variant="ghost"
            size="sm"
            onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}
          />
        </View>
      ) : (
        <View style={styles.form}>
          <Notice tone="success" body={strings.auth.codeSent(email.trim())} />
          <Input
            label={strings.auth.code}
            value={code}
            onChangeText={setCode}
            placeholder="12345678"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            autoFocus
            maxLength={8}
            returnKeyType="done"
            onSubmitEditing={verify}
            error={error}
          />
          <Button title={strings.auth.verify} size="lg" fullWidth loading={busy} onPress={verify} />
          <View style={styles.links}>
            <Button title={strings.auth.resend} variant="ghost" size="sm" onPress={sendCode} disabled={busy} />
            <Button
              title={strings.auth.useDifferentEmail}
              variant="ghost"
              size="sm"
              onPress={() => {
                setStep('email');
                setCode('');
                setError(null);
              }}
            />
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    gap: spacing.sm,
  },
  form: {
    gap: spacing.lg,
  },
  benefits: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
