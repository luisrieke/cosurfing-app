import { Link } from 'expo-router';
import Head from 'expo-router/head';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { DirectoryTabs } from '@/components/DirectoryTabs';
import { RankingFaq } from '@/components/rankings/RankingFaq';
import { ScoreBadge } from '@/components/ScoreBadge';
import { SignupBanner } from '@/components/SignupBanner';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader, SiteHeaderSpacer } from '@/components/SiteHeader';
import { categoryIcon, ErrorState, Glass, Icon, Notice, Skeleton, Text } from '@/components/ui';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useQuery } from '@/hooks/useQuery';
import { env, isSupabaseConfigured } from '@/lib/env';
import { getGlobalRanking } from '@/lib/queries';
import {
  categoryFromSlug,
  RANKING_COPY,
  RANKING_SLUGS,
  RANKINGS_HUB,
  type RankedCategory,
  type RankingSlug,
} from '@/lib/rankingCategories';
import { strings } from '@/lib/strings';
import { colors, fontFamily, layout, radius, spacing, typography } from '@/lib/theme';

const TOP = 5;
const SKELETON_KEYS = ['s1', 's2', 's3', 's4', 's5'];

const SOFT: Record<RankedCategory, string> = {
  cafe: colors.cafeSoft,
  coworking: colors.coworkingSoft,
  coliving: colors.colivingSoft,
};

export default function RankingsHub() {
  const { isDesktop } = useBreakpoint();
  return (
    <View style={styles.root}>
      <Head>
        <title>{`${RANKINGS_HUB.title} · Cosurfing`}</title>
        <meta name="description" content={RANKINGS_HUB.description} />
        <link rel="canonical" href={`${env.siteUrl}/rankings`} />
      </Head>
      <SiteHeader />
      <ScrollView contentContainerStyle={styles.scroll}>
        <SiteHeaderSpacer />
        <View style={styles.page}>
          <DirectoryTabs active="rankings" style={styles.tabs} />
          <View style={[styles.hero, isDesktop && styles.heroDesktop]}>
            <Text
              variant={isDesktop ? 'display' : 'title'}
              align={isDesktop ? 'center' : 'left'}
              role="heading"
              aria-level={1}
              style={isDesktop ? styles.heroTitle : undefined}
            >
              {strings.rankings.hubHeading}
            </Text>
            <Text tone="muted" align={isDesktop ? 'center' : 'left'} style={isDesktop ? styles.heroSubtitle : undefined}>
              {strings.rankings.hubSubtitle}
            </Text>
          </View>
          {!isSupabaseConfigured ? <Notice tone="warning" body={strings.common.backendNotConfigured} /> : null}
          <View style={[styles.columns, isDesktop && styles.columnsDesktop]}>
            {RANKING_SLUGS.map((slug) => (
              <CategoryColumn key={slug} slug={slug} />
            ))}
          </View>
          <RankingFaq />
        </View>
        <SiteFooter />
      </ScrollView>
      <SignupBanner />
    </View>
  );
}

function CategoryColumn({ slug }: { slug: RankingSlug }) {
  const category = categoryFromSlug(slug)!;
  const copy = RANKING_COPY[category];
  const tint = colors[category];
  const top = useQuery(`global-top:${category}`, () => getGlobalRanking(category, null, TOP, 0), isSupabaseConfigured);

  return (
    <Glass variant="strong" style={styles.column}>
      <Link href={`/rankings/${slug}`} asChild>
        <Pressable accessibilityRole="link" style={styles.columnHead}>
          <View style={[styles.icon, { backgroundColor: SOFT[category] }]}>
            <Icon name={categoryIcon(category)} size={22} color={tint} />
          </View>
          <View style={styles.flex}>
            <Text variant="heading" role="heading" aria-level={2}>
              {copy.label}
            </Text>
            <Text variant="small" tone="muted">
              {copy.cardBody}
            </Text>
          </View>
        </Pressable>
      </Link>

      <View style={styles.top}>
        {top.loading ? (
          SKELETON_KEYS.map((k) => <Skeleton key={k} height={44} />)
        ) : top.error ? (
          <ErrorState body={top.error.message} onAction={() => void top.refetch()} />
        ) : (
          (top.data?.items ?? []).map((p, i) => (
            <Link key={p.id} href={`/place/${p.slug}`} asChild>
              <Pressable accessibilityRole="link" style={styles.topRow}>
                <Text variant="smallStrong" tone={i < 3 ? 'accent' : 'faint'} style={styles.rank}>
                  {i + 1}
                </Text>
                <View style={styles.flex}>
                  <Text variant="smallStrong" numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {strings.rankings.inCity(p.city_name, p.country_name)}
                  </Text>
                </View>
                <ScoreBadge score={p.work_score} size="sm" />
              </Pressable>
            </Link>
          ))
        )}
      </View>

      <Link href={`/rankings/${slug}`} style={[styles.seeAll, { color: tint }]}>
        {`${strings.rankings.seeFull} →`}
      </Link>
    </Glass>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    alignItems: 'center',
    paddingBottom: 96,
  },
  page: {
    width: '100%',
    maxWidth: layout.maxWideWidth,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  tabs: {
    marginTop: spacing.lg,
  },
  hero: {
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  heroDesktop: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  heroTitle: {
    maxWidth: 760,
    fontSize: 44,
    lineHeight: 52,
  },
  heroSubtitle: {
    maxWidth: 640,
    fontSize: 18,
    lineHeight: 27,
  },
  columns: {
    gap: spacing.lg,
  },
  columnsDesktop: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  column: {
    flex: 1,
    minWidth: 0,
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  columnHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  top: {
    gap: spacing.xs,
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  rank: {
    width: 20,
    textAlign: 'center',
  },
  seeAll: {
    ...typography.bodyStrong,
    fontFamily,
  },
});
