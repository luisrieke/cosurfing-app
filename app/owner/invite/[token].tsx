import Head from 'expo-router/head';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, Icon, Notice, Screen, Text, TopBar } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { signUpHref } from '@/lib/funnel';
import { acceptOwnerInvite, getOwnerInvite } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, spacing } from '@/lib/theme';

export default function OwnerInviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const { ready, user, refresh } = useAuth();
  const o = strings.owner;
  // Keyed by user: the state ("accepted" vs "used") depends on who is asking.
  const invite = useQuery(`owner-invite:${token}:${user?.id ?? ''}`, () => getOwnerInvite(token!), Boolean(token) && ready);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const placeId = await acceptOwnerInvite(token!);
      await refresh();
      router.replace(`/owner/${placeId}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      setError(
        message.includes('invite_used')
          ? o.inviteUsed
          : message.includes('invite_expired')
            ? o.inviteExpired
            : message.includes('invite_invalid')
              ? o.inviteInvalid
              : message || strings.common.somethingWentWrong,
      );
      setBusy(false);
    }
  };

  const data = invite.data;
  return (
    <Screen>
      <Head>
        <title>{`${o.inviteTitle} · Cosurfing`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <TopBar title={o.inviteTitle} onBack={() => router.replace('/')} />
      {!ready || invite.loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : invite.error ? (
        <Notice tone="danger" body={invite.error.message} />
      ) : !data ? (
        <Notice tone="warning" body={o.inviteInvalid} />
      ) : (
        <View style={styles.body}>
          <View style={styles.iconCircle}>
            <Icon name="key" size={24} color={colors.accent} />
          </View>
          <Text variant="title">{data.place_name}</Text>
          {data.city_name ? <Text tone="muted">{data.city_name}</Text> : null}
          <Text>{o.inviteBody(data.place_name)}</Text>
          {data.state === 'accepted' ? (
            <>
              <Notice tone="success" body={o.inviteAlready} />
              <Button title={o.edit} icon="edit-3" onPress={() => router.replace(`/owner/${data.place_id}`)} />
            </>
          ) : data.state === 'used' ? (
            <Notice tone="warning" body={o.inviteUsed} />
          ) : data.state === 'expired' ? (
            <Notice tone="warning" body={o.inviteExpired} />
          ) : !user ? (
            <>
              <Text tone="muted">{o.inviteSignIn}</Text>
              <Button title={strings.common.signIn} icon="log-in" onPress={() => router.push(signUpHref(`/owner/invite/${token}`))} />
            </>
          ) : (
            <>
              {error ? <Notice tone="danger" body={error} /> : null}
              <Button title={busy ? o.inviteAccepting : o.inviteAccept} icon="check" loading={busy} disabled={busy} onPress={() => void accept()} />
              <Text variant="caption" tone="faint">
                {user.email}
              </Text>
            </>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  body: {
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
