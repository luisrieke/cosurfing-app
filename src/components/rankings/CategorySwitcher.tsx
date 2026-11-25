import { type Href, Link } from 'expo-router';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { categoryIcon, Glass, Icon, Text } from '@/components/ui';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { categoryFromSlug, RANKING_COPY, RANKING_SLUGS, type RankedCategory } from '@/lib/rankingCategories';
import { colors, radius, spacing } from '@/lib/theme';

const SOFT: Record<RankedCategory, string> = {
  cafe: colors.cafeSoft,
  coworking: colors.coworkingSoft,
  coliving: colors.colivingSoft,
};

/**
 * The three ranking categories as large link cards. `hrefFor` decides where they point:
 * /rankings/cafes on the global pages, /lisbon/cafes inside a city.
 */
export function CategorySwitcher({
  active,
  hrefFor = (slug) => `/rankings/${slug}` as Href,
  replace = false,
  style,
}: {
  active: RankedCategory | null;
  hrefFor?: (slug: string) => Href;
  replace?: boolean;
  style?: ViewStyle;
}) {
  const { isDesktop } = useBreakpoint();
  return (
    <View style={[styles.row, style]} accessibilityRole="tablist">
      {RANKING_SLUGS.map((slug) => {
        const category = categoryFromSlug(slug)!;
        const copy = RANKING_COPY[category];
        const selected = category === active;
        const tint = colors[category];
        return (
          <Link key={slug} href={hrefFor(slug)} replace={replace} asChild>
            <Pressable accessibilityRole="tab" accessibilityState={{ selected }} style={styles.cell}>
              <Glass
                variant="strong"
                style={[styles.card, !isDesktop && styles.cardCompact, selected && { backgroundColor: tint, borderColor: tint }]}
              >
                <View style={[styles.icon, { backgroundColor: selected ? 'rgba(255,255,255,0.18)' : SOFT[category] }]}>
                  <Icon name={categoryIcon(category)} size={isDesktop ? 20 : 16} color={selected ? '#fff' : tint} />
                </View>
                <View style={styles.text}>
                  <Text variant={isDesktop ? 'heading' : 'smallStrong'} style={selected ? styles.light : undefined} numberOfLines={2}>
                    {copy.label}
                  </Text>
                  {isDesktop ? (
                    <Text variant="small" style={selected ? styles.lightMuted : undefined} tone="muted" numberOfLines={2}>
                      {copy.cardBody}
                    </Text>
                  ) : null}
                </View>
              </Glass>
            </Pressable>
          </Link>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cell: {
    flex: 1,
    minWidth: 0,
  },
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  cardCompact: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  light: {
    color: '#fff',
  },
  lightMuted: {
    color: 'rgba(255,255,255,0.85)',
  },
});
