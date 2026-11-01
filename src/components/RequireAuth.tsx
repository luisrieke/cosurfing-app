import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, Icon, Notice, Screen, Text, TopBar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/env';
import { signUpHref } from '@/lib/funnel';
import { strings } from '@/lib/strings';
import { colors, spacing } from '@/lib/theme';

interface RequireAuthProps {
  children: ReactNode;
  title: string;
  message: string;
  redirect: string;
}

/** Renders children for signed-in users, otherwise a friendly sign-in prompt. */
export function RequireAuth({ children, title, message, redirect }: RequireAuthProps) {
  const router = useRouter();
  const { ready, user } = useAuth();

  if (!isSupabaseConfigured) {
    return (
      <Screen>
        <TopBar title={title} />
        <Notice tone="warning" body={strings.common.backendNotConfigured} />
      </Screen>
    );
  }
  if (!ready) {
    return (
      <Screen scroll={false}>
        <TopBar title={title} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }
  if (!user) {
    return (
      <Screen>
        <TopBar title={title} />
        <View style={styles.prompt}>
          <View style={styles.iconCircle}>
            <Icon name="log-in" size={24} color={colors.accent} />
          </View>
          <Text variant="heading" align="center">
            {message}
          </Text>
          <Text tone="muted" align="center">
            {strings.auth.intro}
          </Text>
          <Button
            title={strings.common.signIn}
            onPress={() => router.push(signUpHref(redirect))}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      </Screen>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prompt: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
});
