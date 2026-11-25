import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useState } from 'react';
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import NotFound from '../+not-found';
import { AdSlot } from '@/components/AdSlot';
import { RankedPlaceRow } from '@/components/city/RankedPlaceRow';
import { DirectoryTabs } from '@/components/DirectoryTabs';
import { CategorySwitcher } from '@/components/rankings/CategorySwitcher';
import { RankingFaq } from '@/components/rankings/RankingFaq';
import { SignupBanner } from '@/components/SignupBanner';
import { SignupGate } from '@/components/SignupGate';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader, SiteHeaderSpacer } from '@/components/SiteHeader';
import { SuggestPlaceCta } from '@/components/SuggestPlaceCta';
import { Button, Chip, EmptyState, ErrorState, Glass, Notice, Skeleton, Text } from '@/components/ui';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { usePaged } from '@/hooks/usePaged';
import { useAuth } from '@/lib/auth';
import { env, isSupabaseConfigured } from '@/lib/env';
import { getGlobalRanking } from '@/lib/queries';
import {
  categoryFromSlug,
  CONTINENT_NAMES,
  RANKING_COPY,
  rankingDescription,
  rankingTitle,
  slugForCategory,
} from '@/lib/rankingCategories';
import { strings } from '@/lib/strings';
import { colors, fontFamily, layout, radius, spacing, typography } from '@/lib/theme';
import type { Continent, GlobalRankedPlace } from '@/lib/types';

const PAGE_SIZE = 20;
const GATE_AFTER = 10;
const CONTINENTS: Continent[] = ['EU', 'AS', 'NA', 'SA', 'AF', 'OC'];
const SKELETON_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6'];

export default function GlobalRankingRoute() {
  const { category: slug } = useLocalSearchParams<{ category: string }>();
  const category = categoryFromSlug(slug);
  if (!category) return <NotFound />;
  return <GlobalRankingScreen key={category} category={category} />;
}

function GlobalRankingScreen({ category }: { category: NonNullable<ReturnType<typeof categoryFromSlug>> }) {
  const router = useRouter();
  const { width, isDesktop } = useBreakpoint();
  const { user } = useAuth();
  const [continent, setContinent] = useState<Continent | null>(null);
  const copy = RANKING_COPY[category];
  const slug = slugForCategory(category)!;
  const year = new Date().getFullYear();
  const where = continent ? CONTINENT_NAMES[continent]! : null;

  const ranking = usePaged<GlobalRankedPlace>(
    `global:${category}:${continent ?? ''}`,
    (offset, limit) => getGlobalRanking(category, continent, limit, offset),
    PAGE_SIZE,
    isSupabaseConfigured,
  );
  const compact = width < 640;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!user) return;
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 1200) ranking.loadMore();
  };

  const cities = Array.from(new Map(ranking.items.map((p) => [p.city_slug, p])).values()).slice(0, 24);

  return (
    <View style={styles.root}>
      <Head>
        <title>{`${rankingTitle(category, where, year)} · Cosurfing`}</title>
        <meta name="description" content={rankingDescription(category, where)} />
        <link rel="canonical" href={`${env.siteUrl}/rankings/${slug}`} />
      </Head>
      <SiteHeader />
      <ScrollView onScroll={onScroll} scrollEventThrottle={200} contentContainerStyle={styles.scroll}>
        <SiteHeaderSpacer />
        <View style={styles.page}>
          <DirectoryTabs active="rankings" style={styles.tabs} />
          <CategorySwitcher active={category} />

          <View style={[styles.hero, isDesktop && styles.heroDesktop]}>
            <Text variant={isDesktop ? 'display' : 'title'} role="heading" aria-level={1}>
              {rankingTitle(category, where, year)}
            </Text>
            <Text tone="muted" style={isDesktop ? styles.intro : undefined}>
              {rankingDescription(category, where)}
            </Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip label={strings.rankings.worldwide} selected={continent === null} onPress={() => setContinent(null)} color={colors.text} />
            {CONTINENTS.map((c) => (
              <Chip
                key={c}
                label={strings.home.continents[c]}
                selected={continent === c}
                onPress={() => setContinent(continent === c ? null : c)}
                color={colors.text}
              />
            ))}
          </ScrollView>

          {category === 'coliving' ? (
            <Notice tone="warning" title={strings.city.colivingNoticeTitle} body={strings.city.colivingNoticeBody} />
          ) : null}

          <Text variant="caption" tone="muted">
            {ranking.loading
              ? strings.common.loading
              : `${strings.rankings.topCount(ranking.total)} · ${strings.city.rankExplainer}`}
          </Text>

          {!isSupabaseConfigured ? (
            <Notice tone="warning" body={strings.common.backendNotConfigured} />
          ) : ranking.loading ? (
            <View style={styles.skeletons}>
              {SKELETON_KEYS.map((k) => (
                <Skeleton key={k} height={compact ? 76 : 96} />
              ))}
            </View>
          ) : ranking.error ? (
            <ErrorState body={ranking.error.message} onAction={() => void ranking.refresh()} />
          ) : ranking.items.length === 0 ? (
            <EmptyState icon={category === 'coliving' ? 'home' : 'map-pin'} title={strings.rankings.empty} />
          ) : (
            <Glass variant="strong" style={styles.list}>
              {ranking.items.map((p, i) => (
                <View key={p.id}>
                  <RankedPlaceRow
                    place={p}
                    rank={i + 1}
                    signedIn={Boolean(user)}
                    compact={compact}
                    location={strings.rankings.inCity(p.city_name, p.country_name)}
                    onPress={() => router.push(`/place/${p.slug}`)}
                  />
                  {!user && i === GATE_AFTER - 1 ? <SignupGate style={styles.gate} /> : null}
                  {i === 19 ? <AdSlot /> : null}
                </View>
              ))}
            </Glass>
          )}

          {ranking.loadingMore ? <ActivityIndicator color={colors.accent} style={styles.more} /> : null}
          {!ranking.loading && ranking.hasMore && !ranking.loadingMore ? (
            <Button title={strings.rankings.loadMore} variant="secondary" onPress={ranking.loadMore} style={styles.moreButton} />
          ) : null}

          {cities.length > 0 ? (
            <View style={styles.cityLinks}>
              <Text variant="heading" role="heading" aria-level={2}>
                {strings.rankings.cityLinksTitle}
              </Text>
              <View style={styles.cityLinkRow}>
                {cities.map((p) => (
                  <Link key={p.city_slug} href={`/${p.city_slug}/${slug}`} style={styles.cityLink}>
                    {strings.rankings.moreInCity(copy.noun, p.city_name)}
                  </Link>
                ))}
              </View>
            </View>
          ) : null}

          <RankingFaq />
          <SuggestPlaceCta style={styles.suggest} />
        </View>
        <SiteFooter />
      </ScrollView>
      <SignupBanner />
    </View>
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
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  heroDesktop: {
    paddingTop: spacing.lg,
  },
  intro: {
    maxWidth: 760,
    fontSize: 18,
    lineHeight: 27,
  },
  chips: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
  skeletons: {
    gap: spacing.sm,
  },
  list: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    overflow: 'hidden',
  },
  gate: {
    marginVertical: spacing.lg,
  },
  more: {
    marginVertical: spacing.lg,
  },
  moreButton: {
    alignSelf: 'center',
  },
  cityLinks: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  cityLinkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.lg,
    rowGap: spacing.xs,
  },
  cityLink: {
    ...typography.small,
    fontFamily,
    color: colors.text,
    textDecorationLine: 'underline',
  },
  suggest: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
  },
});
