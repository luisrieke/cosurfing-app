import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Glass, Text } from '@/components/ui';
import { strings } from '@/lib/strings';
import { colors, fontFamily, radius, spacing, typography } from '@/lib/theme';

export function RankingFaq() {
  return (
    <Glass style={styles.box}>
      <Text variant="heading" role="heading" aria-level={2}>
        {strings.rankings.faqTitle}
      </Text>
      {strings.rankings.faq.map((item) => (
        <View key={item.q} style={styles.item}>
          <Text variant="bodyStrong">{item.q}</Text>
          <Text variant="small" tone="muted">
            {item.a}
          </Text>
        </View>
      ))}
      <Link href="/how-rankings-work" style={styles.link}>
        {strings.rankings.faqMore}
      </Link>
    </Glass>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  item: {
    gap: 2,
  },
  link: {
    ...typography.smallStrong,
    fontFamily,
    color: colors.accent,
    textDecorationLine: 'underline',
  },
});
