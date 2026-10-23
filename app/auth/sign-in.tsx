import Head from 'expo-router/head';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Input, Notice, Screen, Text, TopBar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/env';
import { isValidEmail } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { strings } from '@/lib/strings';
import { spacing } from '@/lib/theme';

export default function SignInScreen() {
  const router = useRouter();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const { user, ready } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target: Href = (redirect && redirect.startsWith('/') ? redirect : '/account') as Href;

  useEffect(() => {
    if (ready && user) router.replace(target);
  }, [ready, user, router, target]);

  const sendCode = async () => {
    if (!supabase) return;
    if (!isValidEmail(email)) {
      setError(strings.auth.invalidEmail);
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setStep('code');
  };

  const verify = async () => {
    if (!supabase) return;
    const token = code.replace(/\s+/g, '');
    if (token.length < 6) {
      setError(strings.auth.invalidCode);
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: 'email',
    });
    setBusy(false);
    if (err) {
      setError(strings.auth.invalidCode);
      return;
    }
    router.replace(target);
  };

  return (
    <Screen>
      <Head>
        <title>Sign in · Cosurfing</title>
      </Head>
      <TopBar title={strings.common.signIn} />
      <View style={styles.intro}>
        <Text variant="title">{strings.auth.title}</Text>
        <Text tone="muted">{strings.auth.intro}</Text>
      </View>

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
          <Button title={strings.auth.sendCode} size="lg" fullWidth loading={busy} onPress={sendCode} disabled={!isSupabaseConfigured} />
          <Text variant="small" tone="muted">
            {strings.auth.legal}
          </Text>
        </View>
      ) : (
        <View style={styles.form}>
          <Notice tone="success" body={strings.auth.codeSent(email.trim())} />
          <Input
            label={strings.auth.code}
            value={code}
            onChangeText={setCode}
            placeholder="123456"
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
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
