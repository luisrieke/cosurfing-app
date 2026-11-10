import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Icon, Text } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { getCoffeeStatus, isCampaignOpen, spotsLeft } from '@/lib/coffee';
import { isSupabaseConfigured } from '@/lib/env';
import { strings } from '@/lib/strings';
import { colors, spacing } from '@/lib/theme';

import { CoffeeCups } from './CoffeeSections';

const s = strings.coffee;

/** Shown to signed-in users while the program takes participants, and to participants until it ends. */
export function CoffeeAccountCard({ userId }: { userId: string }) {
  const router = useRouter();
  const { data } = useQuery(`coffee-status:${userId}`, getCoffeeStatus, isSupabaseConfigured);
  if (!data) return null;
  const { campaign, participant } = data;
  const taking = isCampaignOpen(campaign) && spotsLeft(campaign) > 0;
  const active = participant && participant.spot_status !== 'released' && campaign.status !== 'closed';
  if (!active && !(taking && !participant)) return null;
  const earned = data.rewards.filter((r) => r.status === 'approved' || r.status === 'paid').length;

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.icon}>
          <Icon name="coffee" size={18} color={colors.onAccent} />
        </View>
        <View style={styles.text}>
          <Text variant="bodyStrong">{participant ? s.accountProgress : s.accountTitle}</Text>
          {participant ? null : (
            <Text variant="small" tone="muted">
              {s.accountBody}
            </Text>
          )}
        </View>
        {participant ? <CoffeeCups filled={earned} size={14} /> : null}
      </View>
      <Button
        title={participant ? s.ctaContinue : s.accountCta}
        variant="secondary"
        onPress={() => router.push('/free-coffee')}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.cafe,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
});
