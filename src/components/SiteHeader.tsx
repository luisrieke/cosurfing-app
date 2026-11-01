import { Image } from 'expo-image';
import { usePathname, useRouter } from 'expo-router';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Glass, Icon, IconButton, Text } from '@/components/ui';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useAuth } from '@/lib/auth';
import { signUpHref } from '@/lib/funnel';
import { levelFor } from '@/lib/levels';
import { strings } from '@/lib/strings';
import { colors, layout, radius, spacing } from '@/lib/theme';

const BAR_HEIGHT = 56;
const BAR_MARGIN = spacing.sm;

function useTopInset() {
  const insets = useSafeAreaInsets();
  return insets.top + (Platform.OS === 'web' ? 0 : spacing.xs);
}

/** Space the floating header covers; render it at the top of the content below the header. */
export function SiteHeaderSpacer() {
  const top = useTopInset();
  return <View style={{ height: top + BAR_HEIGHT + BAR_MARGIN * 2 }} />;
}

/**
 * Floating glass navigation for public pages. It overlays the content, so screens put a
 * `SiteHeaderSpacer` first in their scroll content. Signed-out visitors always see the sign-up button.
 */
export function SiteHeader({ back }: { back?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const top = useTopInset();
  const { isDesktop } = useBreakpoint();
  const { user, profile, isPlus } = useAuth();
  const points = profile?.points ?? 0;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingTop: top + BAR_MARGIN }]}>
      <Glass variant="strong" style={styles.bar}>
        <View style={styles.left}>
          {back && !isDesktop ? (
            <IconButton
              icon="arrow-left"
              accessibilityLabel={strings.common.back}
              onPress={goBack}
              size={40}
              background="transparent"
              style={styles.noBorder}
            />
          ) : null}
          <Pressable onPress={() => router.push('/')} accessibilityRole="link" style={styles.brand}>
            <Image source={require('../../assets/logo-mark.png')} style={styles.logo} accessibilityIgnoresInvertColors />
            <Text variant="heading">{strings.app.name}</Text>
          </Pressable>
          {isDesktop ? (
            <View style={styles.nav}>
              <NavLink label={strings.nav.cities} active={pathname === '/'} onPress={() => router.push('/')} />
              <NavLink label={strings.nav.suggest} active={pathname === '/suggest'} onPress={() => router.push('/suggest')} />
              {!isPlus ? (
                <NavLink label={strings.nav.plus} active={pathname.startsWith('/plus')} onPress={() => router.push('/plus')} />
              ) : null}
            </View>
          ) : null}
        </View>
        <View style={styles.right}>
          {user ? (
            <Pressable
              onPress={() => router.push('/account')}
              accessibilityRole="button"
              accessibilityLabel={strings.nav.account}
              style={({ pressed }) => [styles.accountPill, pressed && { backgroundColor: colors.glassStrong }]}
            >
              <Icon name="award" size={16} color={colors.accent} />
              <Text variant="smallStrong">{points}</Text>
              {isDesktop ? (
                <Text variant="small" tone="muted">
                  {levelFor(points).name}
                </Text>
              ) : null}
              <View style={styles.avatar}>
                <Icon name="user" size={14} color={colors.onAccent} />
              </View>
            </Pressable>
          ) : (
            <>
              {isDesktop ? (
                <Button
                  title={strings.nav.logIn}
                  variant="ghost"
                  size="sm"
                  onPress={() => router.push(signUpHref(pathname, 'login'))}
                />
              ) : null}
              <Button title={strings.nav.signUp} size="sm" onPress={() => router.push(signUpHref(pathname))} />
            </>
          )}
        </View>
      </Glass>
    </View>
  );
}

function NavLink({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      style={({ pressed, hovered }) => [
        styles.navLink,
        (pressed || hovered) && { backgroundColor: colors.glass },
        active && styles.navLinkActive,
      ]}
    >
      <Text variant="smallStrong" tone={active ? 'default' : 'muted'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    zIndex: 30,
  },
  bar: {
    width: '100%',
    maxWidth: layout.maxWideWidth,
    height: BAR_HEIGHT,
    borderRadius: radius.pill,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  logo: {
    width: 30,
    height: 30,
    borderRadius: 8,
  },
  nav: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginLeft: spacing.lg,
  },
  navLink: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  navLinkActive: {
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    paddingHorizontal: spacing.md - 1,
    paddingVertical: spacing.sm - 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  accountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingLeft: spacing.md,
    paddingRight: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noBorder: {
    borderWidth: 0,
  },
});
