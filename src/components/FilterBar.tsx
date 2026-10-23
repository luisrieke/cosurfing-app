import { ScrollView, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/ui';
import { strings } from '@/lib/strings';
import { colors, spacing } from '@/lib/theme';
import type { PlaceFilters } from '@/lib/types';

interface FilterBarProps {
  filters: PlaceFilters;
  onChange: (next: PlaceFilters) => void;
  /** Horizontal scroll (mobile overlay) or wrapping row (desktop sidebar). */
  wrap?: boolean;
}

export function FilterBar({ filters, onChange, wrap }: FilterBarProps) {
  const chips = (
    <>
      <View style={styles.group}>
        <Chip
          label={strings.explore.all}
          selected={filters.category === 'all'}
          onPress={() => onChange({ ...filters, category: 'all' })}
        />
        <Chip
          label={strings.explore.coworking}
          icon="briefcase"
          color={colors.coworking}
          selected={filters.category === 'coworking'}
          onPress={() => onChange({ ...filters, category: filters.category === 'coworking' ? 'all' : 'coworking' })}
        />
        <Chip
          label={strings.explore.cafe}
          icon="coffee"
          color={colors.cafe}
          selected={filters.category === 'cafe'}
          onPress={() => onChange({ ...filters, category: filters.category === 'cafe' ? 'all' : 'cafe' })}
        />
      </View>
      <View style={styles.divider} />
      <View style={styles.group}>
        <Chip
          label={strings.explore.wifi}
          icon="wifi"
          selected={filters.wifi}
          onPress={() => onChange({ ...filters, wifi: !filters.wifi })}
        />
        <Chip
          label={strings.explore.power}
          icon="zap"
          selected={filters.power}
          onPress={() => onChange({ ...filters, power: !filters.power })}
        />
        <Chip
          label={strings.explore.calls}
          icon="phone"
          selected={filters.calls}
          onPress={() => onChange({ ...filters, calls: !filters.calls })}
        />
      </View>
    </>
  );

  if (wrap) {
    return <View style={styles.wrapRow}>{chips}</View>;
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollRow}
      keyboardShouldPersistTaps="handled"
    >
      {chips}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  wrapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: colors.borderStrong,
    marginHorizontal: spacing.xs,
  },
});
