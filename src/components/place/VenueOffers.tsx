import { Linking, StyleSheet, View } from 'react-native';

import { Button, Section, Text } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { formatMoney } from '@/lib/format';
import { getVenueOffers } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import type { VenueOffer } from '@/lib/types';

export function venueOfferPrice(offer: Pick<VenueOffer, 'price_cents' | 'currency' | 'price_unit'>): string | null {
  if (offer.price_cents === null) return null;
  const v = strings.venueOffers;
  if (offer.price_cents === 0) return v.free;
  const amount = formatMoney(offer.price_cents / 100, offer.currency);
  return offer.price_unit ? `${amount} ${v.per[offer.price_unit]}` : amount;
}

/** Offers from the venue itself on the place page; renders nothing when there are none. */
export function VenueOffersSection({ placeId }: { placeId: string }) {
  const v = strings.venueOffers;
  const offers = useQuery(`venue-offers:${placeId}`, () => getVenueOffers(placeId));
  const rows = offers.data ?? [];
  if (rows.length === 0) return null;
  return (
    <Section title={v.title}>
      <Text variant="small" tone="muted">
        {v.fromVenue}
      </Text>
      <View style={styles.list}>
        {rows.map((o) => {
          const price = venueOfferPrice(o);
          return (
            <View key={o.id} style={styles.card}>
              <View style={styles.text}>
                <Text variant="bodyStrong">{o.title}</Text>
                {o.description ? (
                  <Text variant="small" tone="muted">
                    {o.description}
                  </Text>
                ) : null}
              </View>
              <View style={styles.side}>
                {price ? <Text variant="bodyStrong">{price}</Text> : null}
                {o.booking_url ? (
                  <Button
                    title={v.book}
                    size="sm"
                    icon="external-link"
                    onPress={() => void Linking.openURL(o.booking_url!)}
                    accessibilityLabel={`${v.book}: ${o.title}`}
                  />
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  text: {
    flex: 1,
    minWidth: 180,
    gap: 2,
  },
  side: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
});
