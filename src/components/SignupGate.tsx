import { usePathname, useRouter } from 'expo-router';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Button, Glass, Icon, Text } from '@/components/ui';
import { signUpHref } from '@/lib/funnel';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';

/**
 * Sign-up prompt shown wherever account-only content would be. Visitors still see the ranking,
 * scores and hard facts; this card explains what an account adds.
 */
export function SignupGate({
  title = strings.funnel.gateTitle,
  body = strings.funnel.gateBody,
  compact,
  style,
}: {
  title?: string;
  body?: string;
  compact?: boolean;
  style?: ViewStyle;
}) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <Glass variant="strong" style={[styles.card, compact && styles.compact, style]}>
      <View style={styles.header}>
        <View style={styles.lock}>
          <Icon name="unlock" size={18} color={colors.onAccent} />
        </View>
        <View style={styles.headerText}>
          <Text variant={compact ? 'bodyStrong' : 'heading'}>{title}</Text>
          <Text variant="small" tone="muted">
            {body}
          </Text>
        </View>
      </View>
      {!compact ? (
        <View style={styles.bullets}>
          {strings.funnel.gateBullets.map((b) => (
            <View key={b} style={styles.bullet}>
              <Icon name="check" size={16} color={colors.accent} />
              <Text variant="small">{b}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.actions}>
        <Button title={strings.funnel.gateCta} onPress={() => router.push(signUpHref(pathname))} />
        {!compact ? (
          <Button
            title={strings.funnel.gateLogin}
            variant="ghost"
            onPress={() => router.push(signUpHref(pathname, 'login'))}
          />
        ) : null}
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  compact: {
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  lock: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bullets: {
    gap: spacing.xs,
  },
  bullet: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
