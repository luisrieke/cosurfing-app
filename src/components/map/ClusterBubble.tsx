import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { colors, shadow } from '@/lib/theme';

import { clusterCountLabel, clusterSize } from './cluster';
import type { MapCluster } from './types';

/** Native version of the zoomed-out bubble; the web map draws the same thing in plain DOM. */
export function ClusterBubble({ cluster }: { cluster: MapCluster }) {
  const size = clusterSize(cluster.count);
  return (
    <View style={[styles.bubble, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text variant="smallStrong" style={styles.count}>
        {clusterCountLabel(cluster.count)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: '#fff',
    ...(shadow.pin as object),
  },
  count: {
    color: '#fff',
  },
});
