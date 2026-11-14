import { type Href, useRouter } from 'expo-router';
import { Linking, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { getCoffeeCampaign, isCampaignOpen } from '@/lib/coffee';
import { isSupabaseConfigured, isWebPaymentsConfigured } from '@/lib/env';
import { strings } from '@/lib/strings';
import { colors, layout, spacing } from '@/lib/theme';

export const LEGAL_LINKS: { label: string; href: Href }[] = [
  { label: strings.legal.imprint, href: '/imprint' },
  { label: strings.legal.privacy, href: '/privacy' },
  { label: strings.legal.terms, href: '/terms' },
  { label: strings.legal.ranking, href: '/how-rankings-work' },
  { label: strings.legal.withdrawal, href: '/withdrawal' },
  // § 312k BGB: must be reachable from every page as soon as subscriptions can be bought on the website.
  ...(isWebPaymentsConfigured ? [{ label: strings.legal.cancel, href: '/cancel' as Href }] : []),
];

export function SiteFooter({ extra }: { extra?: string | null }) {
  const router = useRouter();
  const coffee = useQuery('coffee-campaign', () => getCoffeeCampaign(), isSupabaseConfigured);
  return (
    <View style={styles.footer}>
      <View style={styles.inner}>
        {isCampaignOpen(coffee.data) ? (
          <Text variant="caption" tone="accent" onPress={() => router.push('/free-coffee')} accessibilityRole="link">
            {strings.coffee.footerLink}
          </Text>
        ) : null}
        <Text
          variant="caption"
          tone="faint"
          onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright')}
          accessibilityRole="link"
        >
          {strings.attribution.osm}
        </Text>
        <Text variant="caption" tone="faint">
          {strings.attribution.web}
        </Text>
        <Text variant="caption" tone="faint">
          {strings.attribution.geonames}
        </Text>
        <LegalLinks onNavigate={(href) => router.push(href)} />
        <Text variant="caption" tone="faint">
          {strings.attribution.copyright}
        </Text>
        {extra ? (
          <Text variant="caption" tone="faint">
            {extra}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function LegalLinks({ onNavigate }: { onNavigate: (href: Href) => void }) {
  return (
    <View style={styles.links}>
      {LEGAL_LINKS.map((l) => (
        <Text key={l.label} variant="caption" tone="muted" onPress={() => onNavigate(l.href)} accessibilityRole="link">
          {l.label}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: spacing.xxl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  inner: {
    width: '100%',
    maxWidth: layout.maxWideWidth,
    gap: 4,
  },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.md,
    rowGap: 4,
    paddingVertical: 4,
  },
});
