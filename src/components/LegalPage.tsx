import Head from 'expo-router/head';
import type { ReactNode } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader, SiteHeaderSpacer } from '@/components/SiteHeader';
import { Glass, Icon, Text } from '@/components/ui';
import { OPERATOR } from '@/lib/legal';
import { colors, layout, radius, spacing } from '@/lib/theme';

export interface LegalClause {
  title: string;
  paragraphs: string[];
}

export function LegalPage({
  title,
  description,
  updated,
  summary,
  clauses,
  contactLabel,
  children,
}: {
  title: string;
  description: string;
  updated?: string;
  summary?: string[];
  clauses: LegalClause[];
  contactLabel?: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.root}>
      <Head>
        <title>{`${title} · Cosurfing`}</title>
        <meta name="description" content={description} />
      </Head>
      <SiteHeader />
      <ScrollView contentContainerStyle={styles.scroll}>
        <SiteHeaderSpacer />
        <View style={styles.page}>
          <View style={styles.intro}>
            <Text variant="title">{title}</Text>
            {updated ? (
              <Text variant="small" tone="muted">
                Last updated {updated}
              </Text>
            ) : null}
          </View>
          {summary ? (
            <Glass variant="strong" style={styles.summary}>
              <Text variant="bodyStrong">In short</Text>
              {summary.map((s) => (
                <View key={s.slice(0, 40)} style={styles.summaryRow}>
                  <Icon name="check" size={16} color={colors.accent} />
                  <Text variant="small" style={styles.flex}>
                    {s}
                  </Text>
                </View>
              ))}
            </Glass>
          ) : null}
          {children}
          {clauses.map((c) => (
            <View key={c.title} style={styles.clause}>
              <Text variant="bodyStrong">{c.title}</Text>
              {c.paragraphs.map((p) => (
                <Text key={p.slice(0, 40)}>{p}</Text>
              ))}
            </View>
          ))}
          {contactLabel ? (
            <View style={styles.clause}>
              <Text variant="bodyStrong">Contact</Text>
              <Text>
                {contactLabel}{' '}
                <Text tone="accent" onPress={() => void Linking.openURL(`mailto:${OPERATOR.email}`)} accessibilityRole="link">
                  {OPERATOR.email}
                </Text>
              </Text>
            </View>
          ) : null}
        </View>
        <SiteFooter />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    alignItems: 'center',
    paddingBottom: 64,
  },
  page: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.xl,
  },
  intro: {
    gap: spacing.xs,
  },
  clause: {
    gap: spacing.sm,
  },
  summary: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
});
