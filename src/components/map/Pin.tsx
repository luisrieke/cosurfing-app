import { StyleSheet, View } from 'react-native';

import { categoryIcon } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { colors, shadow } from '@/lib/theme';
import type { MyPlaceContribution, PlaceCategory } from '@/lib/types';

import { pinColor, pinRingColor } from './pinSvg';

export function Pin({
  category,
  selected,
  mine,
}: {
  category: PlaceCategory;
  selected?: boolean;
  mine?: MyPlaceContribution;
}) {
  const color = pinColor(category);
  const ring = pinRingColor(mine);
  const scale = selected ? 1.2 : 1;
  return (
    <View style={[styles.wrap, { transform: [{ scale }] }]}>
      <View style={[styles.tail, { backgroundColor: color }]} />
      {ring ? <View style={[styles.ring, { backgroundColor: ring }]} /> : null}
      <View style={[styles.body, { backgroundColor: color, borderColor: selected ? colors.text : '#fff' }]}>
        <Icon name={categoryIcon(category)} size={16} color="#fff" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 36,
    height: 44,
    alignItems: 'center',
  },
  // Stays inside the 36 px wrap: native marker views clip anything drawn outside their bounds.
  ring: {
    position: 'absolute',
    top: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  body: {
    position: 'absolute',
    top: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...(shadow.pin as object),
  },
  tail: {
    position: 'absolute',
    bottom: 4,
    width: 10,
    height: 10,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }],
  },
});
