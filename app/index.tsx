import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { AdSlot } from '@/components/AdSlot';
import { CityCard } from '@/components/CityCard';
import { CitySearch } from '@/components/CitySearch';
import { SearchField } from '@/components/SearchField';
import { SignupBanner } from '@/components/SignupBanner';
import { SignupGate } from '@/components/SignupGate';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader, SiteHeaderSpacer } from '@/components/SiteHeader';
import { SuggestPlaceCta } from '@/components/SuggestPlaceCta';
import { Button, Chip, EmptyState, ErrorState, Glass, Icon, Notice, Skeleton, Text } from '@/components/ui';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useDebounced } from '@/hooks/useDebounced';
import { usePaged } from '@/hooks/usePaged';
import { useAuth } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/env';
import { findCityByNameAndCountry, listCities } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, layout, radius, spacing } from '@/lib/theme';
import type { CityListItem, CitySearchResult, CitySort, Continent } from '@/lib/types';

const PAGE_SIZE = 40;
const CONTINENTS: Continent[] = ['EU', 'AS', 'NA', 'SA', 'AF', 'OC'];
const SORTS: CitySort[] = ['score', 'places', 'wifi', 'reviews', 'population', 'name'];

function columnsFor(width: number): number {
  if (width < 560) return 2;
  if (width < 900) return 3;
  if (width < 1120) return 4;
  return 5;
}

/** One key per grid column (max of columnsFor) for placeholder cells that have no data. */
const COLUMN_KEYS = ['c1', 'c2', 'c3', 'c4', 'c5'];

export default function HomeScreen() {
  const router = useRouter();
  const { width, isDesktop } = useBreakpoint();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [continent, setContinent] = useState<Continent | null>(null);
  const [sort, setSort] = useState<CitySort>('score');
  const q = useDebounced(query.trim(), 250);

  const cities = usePaged<CityListItem>(
    `cities:${q}:${continent ?? ''}:${sort}`,
    (offset, limit) => listCities({ q, continent, sort, limit, offset }),
    PAGE_SIZE,
    isSupabaseConfigured,
  );

  const cols = columnsFor(Math.min(width, layout.maxWideWidth));
  const cellWidth = (Math.min(width, layout.maxWideWidth) - spacing.lg * 2 - spacing.md * (cols - 1)) / cols;
  const skeletonHeight = Math.round(cellWidth / 0.82);
  const rows: CityListItem[][] = [];
  for (let i = 0; i < cities.items.length; i += cols) rows.push(cities.items.slice(i, i + cols));
  // Rank numbers only make sense for the unfiltered "best for work" order.
  const ranked = sort === 'score' && !q;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 900) cities.loadMore();
  };

  const openSearchResult = async (r: CitySearchResult) => {
    const existing = await findCityByNameAndCountry(r.name, r.countryCode).catch(() => null);
    if (existing) {
      router.push(`/${existing.slug}`);
      return;
    }
    router.push({
      pathname: '/waitlist',
      params: { city: r.name, country: r.countryName, countryCode: r.countryCode, lat: String(r.lat), lng: String(r.lng) },
    });
  };

  return (
    <View style={styles.root}>
      <Head>
        <title>Cosurfing · The best places to work in every big city</title>
        <meta
          name="description"
          content="Coworking spaces, laptop-friendly cafés and libraries in 1,000+ cities, ranked by measured Wi‑Fi speed, power outlets and reviews from remote workers."
        />
      </Head>
      <SiteHeader />
      <ScrollView onScroll={onScroll} scrollEventThrottle={200} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <SiteHeaderSpacer />
        <View style={styles.page}>
          <View style={[styles.hero, isDesktop && styles.heroDesktop]}>
            <Text variant={isDesktop ? 'display' : 'title'} align={isDesktop ? 'center' : 'left'} style={isDesktop ? styles.heroTitle : undefined}>
              {strings.home.title}
            </Text>
            <Text tone="muted" align={isDesktop ? 'center' : 'left'} style={isDesktop ? styles.heroSubtitle : undefined}>
              {strings.home.subtitle}
            </Text>
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder={strings.home.searchPlaceholder}
              large
              style={isDesktop ? styles.heroSearch : undefined}
            />
            <View style={[styles.heroActions, isDesktop && styles.heroActionsDesktop]}>
              <Button title={strings.home.nearMe} icon="navigation" onPress={() => router.push('/map')} />
              <Button title={strings.home.addPlace} icon="plus" variant="secondary" onPress={() => router.push('/suggest')} />
            </View>
          </View>

          {!isSupabaseConfigured ? <Notice tone="warning" body={strings.common.backendNotConfigured} /> : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip label={strings.home.filterAll} selected={continent === null} onPress={() => setContinent(null)} color={colors.text} />
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

          <View style={styles.toolbar}>
            <Text variant="smallStrong" tone="muted">
              {cities.loading ? strings.common.loading : strings.home.resultCount(cities.total)}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sorts}>
              <Icon name="bar-chart-2" size={14} color={colors.textMuted} />
              {SORTS.map((s) => (
                <Chip key={s} label={strings.home.sort[s]} selected={sort === s} onPress={() => setSort(s)} />
              ))}
            </ScrollView>
          </View>

          {cities.loading ? (
            <View style={styles.grid}>
              {[0, 1].map((r) => (
                <View key={r} style={styles.row}>
                  {COLUMN_KEYS.slice(0, cols).map((k) => (
                    <View key={k} style={styles.cell}>
                      <Skeleton height={skeletonHeight} style={styles.skeletonCard} />
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ) : cities.error ? (
            <ErrorState body={cities.error.message} onAction={() => void cities.refresh()} />
          ) : cities.items.length === 0 ? (
            <>
              <EmptyState icon="search" title={strings.home.noCitiesTitle} body={strings.home.noCitiesBody} />
              {q ? (
                <SuggestPlaceCta
                  title={strings.suggestCta.homeSearchMiss(q)}
                  body={strings.suggestCta.searchMissBody}
                  buttonLabel={strings.suggestCta.addNamed(q)}
                  target={{ name: q }}
                  style={styles.suggestCta}
                />
              ) : null}
            </>
          ) : (
            <View style={styles.grid}>
              {rows.map((row, rowIndex) => (
                <View key={row[0]!.id} style={styles.rowGroup}>
                  <View style={styles.row}>
                    {row.map((city, i) => (
                      <View key={city.id} style={styles.cell}>
                        <CityCard
                          city={city}
                          rank={ranked ? rowIndex * cols + i + 1 : null}
                          onPress={() => router.push(`/${city.slug}`)}
                        />
                      </View>
                    ))}
                    {COLUMN_KEYS.slice(row.length, cols).map((k) => (
                      <View key={k} style={styles.cell} />
                    ))}
                  </View>
                  {!user && rowIndex === Math.max(1, Math.ceil(8 / cols) - 1) ? <SignupGate style={styles.inlineGate} /> : null}
                  {rowIndex === Math.ceil(24 / cols) - 1 ? <AdSlot /> : null}
                </View>
              ))}
            </View>
          )}

          {cities.loadingMore ? <ActivityIndicator color={colors.accent} style={styles.more} /> : null}
          {!cities.loading && cities.hasMore && !cities.loadingMore ? (
            <Button title={strings.home.loadMore} variant="secondary" onPress={cities.loadMore} style={styles.moreButton} />
          ) : null}

          {cities.items.length > 0 ? <SuggestPlaceCta style={styles.suggestCta} /> : null}

          <View style={[styles.how, isDesktop && styles.howDesktop]}>
            <Text variant="heading">{strings.home.howTitle}</Text>
            <View style={[styles.howSteps, isDesktop && styles.howStepsDesktop]}>
              {strings.home.howSteps.map((step, i) => (
                <Glass key={step.title} variant="strong" style={[styles.howStep, isDesktop && styles.howStepDesktop]}>
                  <View style={styles.howNumber}>
                    <Text variant="smallStrong" tone="inverse">
                      {i + 1}
                    </Text>
                  </View>
                  <Text variant="bodyStrong">{step.title}</Text>
                  <Text variant="small" tone="muted">
                    {step.body}
                  </Text>
                </Glass>
              ))}
            </View>
          </View>

          <View style={styles.request}>
            <Text variant="heading">{strings.home.requestTitle}</Text>
            <Text variant="small" tone="muted">
              {strings.home.requestBody}
            </Text>
            <CitySearch
              activeCities={[]}
              onSelectActive={(c) => router.push(`/${c.slug}`)}
              onSelectOther={(r) => void openSearchResult(r)}
              onManual={(text) => router.push({ pathname: '/waitlist', params: { city: text } })}
            />
          </View>
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
  hero: {
    gap: spacing.md,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  heroDesktop: {
    alignItems: 'center',
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.lg,
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
  heroSearch: {
    width: '100%',
    maxWidth: 560,
    marginTop: spacing.sm,
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  heroActionsDesktop: {
    justifyContent: 'center',
  },
  suggestCta: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
  },
  chips: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  sorts: {
    gap: spacing.xs,
    alignItems: 'center',
  },
  grid: {
    gap: spacing.md,
  },
  rowGroup: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cell: {
    flex: 1,
    minWidth: 0,
  },
  skeletonCard: {
    borderRadius: radius.lg,
  },
  inlineGate: {
    marginVertical: spacing.sm,
  },
  more: {
    marginVertical: spacing.lg,
  },
  moreButton: {
    alignSelf: 'center',
  },
  how: {
    marginTop: spacing.xxl,
    gap: spacing.md,
  },
  howDesktop: {
    alignItems: 'center',
  },
  howSteps: {
    gap: spacing.md,
  },
  howStepsDesktop: {
    flexDirection: 'row',
  },
  howStep: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  howStepDesktop: {
    flex: 1,
  },
  howNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  request: {
    marginTop: spacing.xl,
    gap: spacing.sm,
    maxWidth: layout.maxContentWidth,
    width: '100%',
    alignSelf: 'center',
    zIndex: 5,
  },
});
