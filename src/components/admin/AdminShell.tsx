import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button, Icon, type IconName, Notice, Screen, Text, TopBar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/env';
import { strings } from '@/lib/strings';
import { colors, layout, radius, spacing } from '@/lib/theme';

interface AdminShellProps {
  title: string;
  children: ReactNode;
  right?: ReactNode;
  backTo?: string;
}

/** Guard + chrome for admin pages. Admin status comes from the is_admin() RPC, never from the client. */
export function AdminShell({ title, children, right, backTo = '/admin' }: AdminShellProps) {
  const router = useRouter();
  const { ready, user, isAdmin } = useAuth();
  const onBack = () => (router.canGoBack() ? router.back() : router.replace(backTo as never));

  if (!isSupabaseConfigured) {
    return (
      <Screen maxWidth={layout.maxAdminWidth}>
        <TopBar title={title} onBack={onBack} maxWidth={layout.maxAdminWidth} />
        <Notice tone="warning" body={strings.common.backendNotConfigured} />
      </Screen>
    );
  }
  if (!ready) {
    return (
      <Screen scroll={false}>
        <TopBar title={title} onBack={onBack} maxWidth={layout.maxAdminWidth} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }
  if (!user) {
    return (
      <Screen maxWidth={layout.maxAdminWidth}>
        <TopBar title={title} onBack={onBack} maxWidth={layout.maxAdminWidth} />
        <Notice tone="info" body={strings.admin.notAllowed} />
        <Button title={strings.common.signIn} onPress={() => router.push({ pathname: '/auth/sign-in', params: { redirect: '/admin' } })} />
      </Screen>
    );
  }
  if (!isAdmin) {
    return (
      <Screen maxWidth={layout.maxAdminWidth}>
        <TopBar title={title} onBack={onBack} maxWidth={layout.maxAdminWidth} />
        <Notice tone="warning" body={strings.admin.notAllowed} />
        <Button title={strings.notFound.home} variant="secondary" onPress={() => router.replace('/')} />
      </Screen>
    );
  }
  return (
    <Screen maxWidth={layout.maxAdminWidth}>
      <TopBar title={title} onBack={onBack} right={right} maxWidth={layout.maxAdminWidth} />
      {children}
    </Screen>
  );
}

export function AdminRow({
  title,
  subtitle,
  meta,
  onPress,
  right,
  icon,
}: {
  title: string;
  subtitle?: string | null;
  meta?: ReactNode;
  onPress?: () => void;
  right?: ReactNode;
  icon?: IconName;
}) {
  const content = (
    <View style={styles.row}>
      {icon ? <Icon name={icon} size={18} color={colors.textMuted} /> : null}
      <View style={styles.rowText}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" tone="muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? <View style={styles.meta}>{meta}</View> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-right" size={18} color={colors.textFaint} /> : null)}
    </View>
  );
  if (!onPress) return <View style={styles.rowWrap}>{content}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.rowWrap, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

export function AdminList({ children }: { children: ReactNode }) {
  return <View style={styles.list}>{children}</View>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  rowWrap: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pressed: {
    backgroundColor: colors.bgSubtle,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: 4,
  },
});
