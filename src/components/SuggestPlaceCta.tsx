import { useRouter } from 'expo-router';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Button, Glass, Icon, Text } from '@/components/ui';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';

export interface SuggestTarget {
  /** Slug of a live city to preselect. */
  city?: string | null;
  /** Prefills the place name, e.g. from a search that found nothing. */
  name?: string | null;
}

export function suggestRoute({ city, name }: SuggestTarget = {}) {
  const params: Record<string, string> = {};
  if (city) params.city = city;
  if (name?.trim()) params.name = name.trim();
  return { pathname: '/suggest' as const, params };
}

/** Card that invites people to add a place Cosurfing does not know yet. */
export function SuggestPlaceCta({
  title = strings.suggestCta.title,
  body = strings.suggestCta.body,
  buttonLabel = strings.suggestCta.button,
  target,
  style,
}: {
  title?: string;
  body?: string;
  buttonLabel?: string;
  target?: SuggestTarget;
  style?: ViewStyle;
}) {
  const router = useRouter();
  return (
    <Glass variant="strong" style={[styles.card, style]}>
      <View style={styles.head}>
        <View style={styles.icon}>
          <Icon name="plus" size={18} color={colors.accent} />
        </View>
        <Text variant="heading" style={styles.title}>
          {title}
        </Text>
      </View>
      <Text variant="small" tone="muted">
        {body}
      </Text>
      <Button title={buttonLabel} icon="map-pin" onPress={() => router.push(suggestRoute(target))} />
    </Glass>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
  },
});
