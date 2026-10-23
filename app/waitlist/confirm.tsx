import Head from 'expo-router/head';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, Icon, Screen, Text, TopBar } from '@/components/ui';
import { strings } from '@/lib/strings';
import { colors, spacing } from '@/lib/theme';
import { confirmWaitlist } from '@/lib/waitlistApi';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; city: { slug: string; name: string; status: 'active' | 'waitlist' } }
  | { kind: 'invalid' };

export default function ConfirmRoute() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const [state, setState] = useState<State>(token ? { kind: 'loading' } : { kind: 'invalid' });

  useEffect(() => {
    let active = true;
    if (!token) return;
    confirmWaitlist(token)
      .then((res) => active && setState({ kind: 'ok', city: res.city }))
      .catch(() => active && setState({ kind: 'invalid' }));
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <Screen>
      <Head>
        <title>Confirm · Cosurfing</title>
      </Head>
      <TopBar back onBack={() => router.replace('/')} />
      <View style={styles.hero}>
        {state.kind === 'loading' ? (
          <>
            <ActivityIndicator color={colors.accent} />
            <Text tone="muted">{strings.waitlist.confirming}</Text>
          </>
        ) : state.kind === 'ok' ? (
          <>
            <View style={[styles.iconCircle, { backgroundColor: colors.successSoft }]}>
              <Icon name="check-circle" size={28} color={colors.success} />
            </View>
            <Text variant="title" align="center">
              {strings.waitlist.confirmTitle}
            </Text>
            <Text tone="muted" align="center">
              {strings.waitlist.confirmBody(state.city.name)}
            </Text>
            {state.city.status === 'active' ? (
              <Button title={strings.waitlist.openCity(state.city.name)} onPress={() => router.replace(`/${state.city.slug}`)} />
            ) : (
              <Button title={strings.waitlist.backHome} variant="secondary" onPress={() => router.replace('/')} />
            )}
          </>
        ) : (
          <>
            <View style={[styles.iconCircle, { backgroundColor: colors.dangerSoft }]}>
              <Icon name="alert-triangle" size={28} color={colors.danger} />
            </View>
            <Text variant="title" align="center">
              {strings.common.somethingWentWrong}
            </Text>
            <Text tone="muted" align="center">
              {strings.waitlist.confirmInvalid}
            </Text>
            <Button title={strings.waitlist.backHome} variant="secondary" onPress={() => router.replace('/')} />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.xxl,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
});
