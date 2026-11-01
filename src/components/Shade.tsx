import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';

/** Darkening overlay that keeps white text readable on top of photos. */
export function Shade({ colors, locations }: { colors: readonly [string, string, ...string[]]; locations?: readonly [number, number, ...number[]] }) {
  return <LinearGradient pointerEvents="none" colors={colors} locations={locations} style={StyleSheet.absoluteFill} />;
}
