import { type Href, Link } from 'expo-router';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { glassSurface, Icon, type IconName, Text } from '@/components/ui';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';

const TABS: { key: 'cities' | 'rankings'; href: Href; icon: IconName; label: string }[] = [
  { key: 'cities', href: '/cities', icon: 'map', label: strings.rankings.tabCities },
  { key: 'rankings', href: '/rankings', icon: 'award', label: strings.rankings.tabRankings },
];

/** "Cities | Rankings" switch at the top of /cities and /rankings. Real links, so crawlers follow them. */
export function DirectoryTabs({ active, style }: { active: 'cities' | 'rankings'; style?: ViewStyle }) {
  return (
    <View style={[styles.bar, style]} accessibilityRole="tablist">
      {TABS.map((t) => {
        const selected = t.key === active;
        return (
          <Link key={t.key} href={t.href} asChild>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={StyleSheet.flatten([styles.tab, selected && styles.tabSelected])}
            >
              <Icon name={t.icon} size={16} color={selected ? colors.onAccent : colors.textMuted} />
              <Text variant="bodyStrong" style={{ color: selected ? colors.onAccent : colors.text }}>
                {t.label}
              </Text>
            </Pressable>
          </Link>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    ...glassSurface('strong'),
    flexDirection: 'row',
    alignSelf: 'center',
    padding: 4,
    borderRadius: radius.pill,
    gap: 4,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
  },
  tabSelected: {
    backgroundColor: colors.accent,
  },
});
