import { usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Glass, IconButton, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dismissBanner, isBannerDismissed, signUpHref } from '@/lib/funnel';
import { strings } from '@/lib/strings';
import { colors, layout, radius, spacing } from '@/lib/theme';

/** Sticky bottom banner for visitors without an account. Hidden for the rest of the session once closed. */
export function SignupBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { ready, user } = useAuth();
  const [hidden, setHidden] = useState(isBannerDismissed());
  if (!ready || user || hidden) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: insets.bottom + spacing.md }]}>
      <Glass variant="ink" style={styles.banner}>
        <View style={styles.text}>
          <Text variant="smallStrong" style={styles.light}>
            {strings.funnel.bannerTitle}
          </Text>
          <Text variant="caption" style={styles.lightMuted}>
            {strings.funnel.bannerBody}
          </Text>
        </View>
        <Button
          title={strings.funnel.bannerCta}
          size="sm"
          style={styles.cta}
          onPress={() => router.push(signUpHref(pathname))}
        />
        <IconButton
          icon="x"
          size={32}
          color={colors.onAccent}
          background="transparent"
          accessibilityLabel={strings.common.close}
          style={styles.close}
          onPress={() => {
            dismissBanner();
            setHidden(true);
          }}
        />
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    zIndex: 40,
  },
  banner: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    borderRadius: radius.lg,
  },
  text: {
    flex: 1,
  },
  light: {
    color: colors.onAccent,
  },
  lightMuted: {
    color: 'rgba(255,255,255,0.75)',
  },
  cta: {
    alignSelf: 'center',
  },
  close: {
    borderWidth: 0,
  },
});
