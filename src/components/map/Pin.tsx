import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { colors, shadow } from '@/lib/theme';
import type { PlaceCategory } from '@/lib/types';

import { pinColor } from './pinSvg';

export function Pin({ category, selected }: { category: PlaceCategory; selected?: boolean }) {
  const color = pinColor(category);
  const scale = selected ? 1.2 : 1;
  return (
    <View style={[styles.wrap, { transform: [{ scale }] }]}>
      <View style={[styles.tail, { backgroundColor: color }]} />
      <View style={[styles.body, { backgroundColor: color, borderColor: selected ? colors.text : '#fff' }]}>
        <Icon name={category === 'coworking' ? 'briefcase' : 'coffee'} size={16} color="#fff" />
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
