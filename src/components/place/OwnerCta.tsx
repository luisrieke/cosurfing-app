import { useRouter } from 'expo-router';
import { Linking, StyleSheet, View } from 'react-native';

import { Button, Icon, type IconName, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { env } from '@/lib/env';
import { strings } from '@/lib/strings';
import { placeFormParams, tallyUrl } from '@/lib/tally';
import { colors, radius, spacing } from '@/lib/theme';
import type { City, Place } from '@/lib/types';

export function OwnerCta({ place }: { place: Place & { city: City } }) {
  const router = useRouter();
  const { user, ownedPlaceIds } = useAuth();
  const o = strings.owner;
  if (ownedPlaceIds.has(place.id)) {
    return (
      <View style={styles.wrap}>
        <View style={styles.text}>
          <Text variant="bodyStrong">{o.managedTitle}</Text>
          <Text variant="small" tone="muted">
            {o.managedBody}
          </Text>
        </View>
        <Button title={o.edit} icon="edit-3" size="sm" onPress={() => router.push(`/owner/${place.id}`)} style={styles.selfStart} />
      </View>
    );
  }
  const perks: { icon: IconName; text: string }[] = [
    { icon: 'calendar', text: o.perkPasses },
    { icon: 'gift', text: o.perkOffers },
    { icon: 'clock', text: o.perkHours },
  ];
  const open = () => void Linking.openURL(tallyUrl(env.ownerFormUrl, placeFormParams(place, user)));
  return (
    <View style={styles.wrap}>
      <View style={styles.text}>
        <Text variant="bodyStrong">{o.title}</Text>
        <Text variant="small" tone="muted">
          {o.body}
        </Text>
      </View>
      <View style={styles.perks}>
        {perks.map((p) => (
          <View key={p.icon} style={styles.perk}>
            <Icon name={p.icon} size={15} color={colors.accent} />
            <Text variant="small" style={styles.flex}>
              {p.text}
            </Text>
          </View>
        ))}
      </View>
      <Button title={o.cta} icon="briefcase" variant="secondary" size="sm" onPress={open} style={styles.selfStart} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSubtle,
  },
  text: {
    gap: spacing.xs,
  },
  perks: {
    gap: spacing.sm,
  },
  perk: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  selfStart: {
    alignSelf: 'flex-start',
  },
});
