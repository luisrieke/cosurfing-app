import { usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button, Icon, Text } from '@/components/ui';
import { canShowCoffeePromo, dismissCoffeePromo } from '@/lib/coffee';
import { dismissInterstitial, signUpHref } from '@/lib/funnel';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';

/**
 * Full-screen prompt for visitors without an account. Callers decide when to open it (see lib/funnel).
 * While the coffee program has free spots it invites to /free-coffee instead of the plain sign-up pitch.
 */
export function SignupInterstitial({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [variant, setVariant] = useState<'coffee' | 'signup' | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void canShowCoffeePromo()
      .catch(() => false)
      .then((coffee) => {
        if (!cancelled) setVariant(coffee ? 'coffee' : 'signup');
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const later = () => {
    if (variant === 'coffee') void dismissCoffeePromo();
    void dismissInterstitial();
    onClose();
  };
  const signUp = () => {
    onClose();
    router.push(signUpHref(pathname));
  };

  return (
    <Modal visible={visible && variant !== null} transparent animationType="fade" onRequestClose={later}>
      <Pressable style={styles.backdrop} onPress={later} accessibilityLabel={strings.common.close}>
        {variant === 'coffee' ? (
          <Pressable style={styles.sheet} onPress={() => undefined} accessibilityViewIsModal>
            <View style={[styles.icon, styles.coffeeIcon]}>
              <Icon name="coffee" size={24} color={colors.onAccent} />
            </View>
            <Text variant="title" align="center">
              {strings.coffee.popupTitle}
            </Text>
            <Text tone="muted" align="center">
              {strings.coffee.popupBody}
            </Text>
            <Text variant="caption" tone="faint" align="center">
              {strings.coffee.popupFine}
            </Text>
            <Button
              title={strings.coffee.popupCta}
              icon="coffee"
              size="lg"
              fullWidth
              onPress={() => {
                void dismissCoffeePromo();
                onClose();
                router.push('/free-coffee');
              }}
            />
            <Button title={strings.coffee.popupLater} variant="ghost" fullWidth onPress={later} />
            <Text variant="small" tone="accent" align="center" onPress={signUp} accessibilityRole="link">
              {strings.coffee.popupSignIn}
            </Text>
          </Pressable>
        ) : (
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <View style={styles.icon}>
              <Icon name="star" size={22} color={colors.onAccent} />
            </View>
            <Text variant="title" align="center">
              {strings.funnel.interstitialTitle}
            </Text>
            <Text tone="muted" align="center">
              {strings.funnel.interstitialBody}
            </Text>
            <View style={styles.bullets}>
              {strings.funnel.gateBullets.map((b) => (
                <View key={b} style={styles.bullet}>
                  <Icon name="check" size={16} color={colors.accent} />
                  <Text variant="small">{b}</Text>
                </View>
              ))}
            </View>
            <Button title={strings.funnel.interstitialCta} size="lg" fullWidth onPress={signUp} />
            <Button title={strings.funnel.interstitialLater} variant="ghost" fullWidth onPress={later} />
          </Pressable>
        )}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: 'center',
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coffeeIcon: {
    backgroundColor: colors.cafe,
  },
  bullets: {
    alignSelf: 'stretch',
    gap: spacing.xs,
    marginVertical: spacing.sm,
  },
  bullet: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
});
