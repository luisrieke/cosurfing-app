import { useRouter } from 'expo-router';
import { Linking, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { strings } from '@/lib/strings';
import { colors, layout, spacing } from '@/lib/theme';

export function SiteFooter({ extra }: { extra?: string | null }) {
  const router = useRouter();
  return (
    <View style={styles.footer}>
      <View style={styles.inner}>
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
        <Text variant="caption" tone="muted" onPress={() => router.push('/terms')} accessibilityRole="link">
          {strings.attribution.terms}
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
});
