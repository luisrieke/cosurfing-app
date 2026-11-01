import { usePathname, useRouter } from 'expo-router';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button, Icon, Text } from '@/components/ui';
import { dismissInterstitial, signUpHref } from '@/lib/funnel';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';

/** Full-screen sign-up prompt. Callers decide when to open it (see lib/funnel). */
export function SignupInterstitial({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const later = () => {
    void dismissInterstitial();
    onClose();
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={later}>
      <Pressable style={styles.backdrop} onPress={later} accessibilityLabel={strings.common.close}>
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
          <Button
            title={strings.funnel.interstitialCta}
            size="lg"
            fullWidth
            onPress={() => {
              onClose();
              router.push(signUpHref(pathname));
            }}
          />
          <Button title={strings.funnel.interstitialLater} variant="ghost" fullWidth onPress={later} />
        </Pressable>
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
