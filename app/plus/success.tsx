import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, Icon, Notice, Screen, Text, TopBar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { strings } from '@/lib/strings';
import { colors, spacing } from '@/lib/theme';

/**
 * Landing page after a Stripe checkout (or a native purchase). The entitlement is written by
 * the webhook, so we poll the session a few times until Plus shows up.
 */
export default function PlusSuccessScreen() {
  const router = useRouter();
  const { ready, user, isPlus, refresh } = useAuth();
  const [attempts, setAttempts] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ready || !user || isPlus || attempts >= 8) return;
    timer.current = setTimeout(async () => {
      await refresh();
      setAttempts((a) => a + 1);
    }, 1500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [ready, user, isPlus, attempts, refresh]);

  const waiting = ready && user && !isPlus && attempts < 8;

  return (
    <Screen>
      <Head>
        <title>Cosurfing Plus</title>
      </Head>
      <TopBar title={strings.plus.title} onBack={() => router.replace('/account')} />
      <View style={styles.hero}>
        <View style={[styles.icon, { backgroundColor: isPlus ? colors.plus : colors.bgMuted }]}>
          {waiting ? <ActivityIndicator color={colors.plus} /> : <Icon name={isPlus ? 'check' : 'clock'} size={26} color={isPlus ? colors.onAccent : colors.textMuted} />}
        </View>
        <Text variant="title" align="center">
          {isPlus ? strings.plus.successTitle : strings.plus.title}
        </Text>
        <Text tone="muted" align="center">
          {strings.plus.successBody}
        </Text>
      </View>
      {!user && ready ? <Notice tone="info" body={strings.plus.signInFirst} /> : null}
      {!waiting && !isPlus && user ? (
        <Notice tone="warning" body="Your subscription has not shown up yet. Payments can take a minute to confirm. Pull to refresh or check back shortly." />
      ) : null}
      <Button title={strings.common.account} onPress={() => router.replace('/account')} />
      <Button title={strings.notFound.home} variant="ghost" onPress={() => router.replace('/')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
});
