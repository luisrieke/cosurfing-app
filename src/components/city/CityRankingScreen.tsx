import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { AdSlot } from '@/components/AdSlot';
import { type MapHandle, PlacesMap } from '@/components/map';
import { ScoreBadge } from '@/components/ScoreBadge';
import { SearchField } from '@/components/SearchField';
import { Shade } from '@/components/Shade';
import { SignupBanner } from '@/components/SignupBanner';
import { SignupGate } from '@/components/SignupGate';
import { SignupInterstitial } from '@/components/SignupInterstitial';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader, SiteHeaderSpacer } from '@/components/SiteHeader';
import { SuggestPlaceCta, suggestRoute, type SuggestTarget } from '@/components/SuggestPlaceCta';
import { Button, Chip, EmptyState, ErrorState, Glass, Icon, Notice, Skeleton, Text } from '@/components/ui';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useDebounced } from '@/hooks/useDebounced';
import { useNow, useTimeFilterRefresh } from '@/hooks/useNow';
import { usePaged } from '@/hooks/usePaged';
import { useQuery } from '@/hooks/useQuery';
import { useSlowConnection } from '@/hooks/useSlowConnection';
import { useUserLocation } from '@/hooks/useUserLocation';
import { useAuth } from '@/lib/auth';
import { formatMbps } from '@/lib/format';
import { localWeekMinute, matchesTimeFilter } from '@/lib/hours';
import { canShowInterstitial, dismissInterstitial, markInterstitialShown, signUpHref } from '@/lib/funnel';
import { LevelMark, UserAvatar } from '@/components/UserBadge';
import { getCityContributors, getCityRanking, getPlacesToRate, requestCityCrawl } from '@/lib/queries';
import { coverUrl } from '@/lib/storage';
import { strings } from '@/lib/strings';
import { colors, layout, radius, spacing } from '@/lib/theme';
import type { City, PlaceCategory, RankedPlace, RankingFilters, RankingSort } from '@/lib/types';

import { RankedPlaceRow } from './RankedPlaceRow';

const PAGE_SIZE = 30;
const GATE_AFTER = 10;
const SKELETON_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6'];
const POLL_MS = 15_000;
const SORTS: RankingSort[] = ['score', 'rating', 'wifi', 'reviews', 'name'];
const TABS: (PlaceCategory | 'all')[] = ['all', 'coworking', 'cafe', 'library', 'coliving'];

export function CityRankingScreen({ city, onRefreshCity }: { city: City; onRefreshCity: () => Promise<void> }) {
  const router = useRouter();
  const { isDesktop, width } = useBreakpoint();
  const slow = useSlowConnection();
  const heroSource = (slow ? city.cover_thumb_url : null) ?? city.cover_url;
  const heroCover = heroSource ? coverUrl(heroSource, slow ? 640 : 1600) : null;
  const heroPlaceholder = city.cover_thumb_url ? coverUrl(city.cover_thumb_url, 480) : null;
  const { user } = useAuth();
  const [category, setCategory] = useState<PlaceCategory | 'all'>('all');
  const [sort, setSort] = useState<RankingSort>('score');
  const [wifi, setWifi] = useState(false);
  const [power, setPower] = useState(false);
  const [calls, setCalls] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [openNow, setOpenNow] = useState(false);
  const [workNow, setWorkNow] = useState(false);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [interstitial, setInterstitial] = useState(false);
  const [findingPlace, setFindingPlace] = useState(false);
  const q = useDebounced(query.trim(), 250);
  const mapRef = useRef<MapHandle | null>(null);
  const location = useUserLocation();

  const now = useNow();
  const timeFilter = openNow || workNow;
  const filters: RankingFilters = { category, sort, wifi, power, calls, reviewed, q, openNow, workNow };
  const filtered = category !== 'all' || wifi || power || calls || reviewed || timeFilter || q !== '';
  const ranking = usePaged<RankedPlace>(
    `ranking:${city.id}:${category}:${sort}:${wifi}:${power}:${calls}:${reviewed}:${openNow}:${workNow}:${q}`,
    (offset, limit) => getCityRanking(city.id, filters, limit, offset),
    PAGE_SIZE,
  );
  const contributors = useQuery(`contributors:${city.id}`, () => getCityContributors(city.id, 5));

  const collecting = city.place_count === 0 && city.crawl_status !== 'done' && city.crawl_status !== 'failed';

  // A visitor opening a city that has not been crawled yet moves it to the front of the queue.
  const requested = useRef(false);
  useEffect(() => {
    if (!collecting || requested.current) return;
    requested.current = true;
    requestCityCrawl(city.id).catch(() => undefined);
  }, [collecting, city.id]);

  const refreshRanking = ranking.refresh;
  useEffect(() => {
    if (!collecting) return;
    const t = setInterval(() => {
      void onRefreshCity();
      void refreshRanking();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [collecting, onRefreshCity, refreshRanking]);

  useTimeFilterRefresh(timeFilter, now, refreshRanking);

  // The server filtered at query time; drop places that closed since, until the next refresh.
  const localMinute = timeFilter ? localWeekMinute(now, city.timezone) : null;
  const items = useMemo(
    () =>
      timeFilter
        ? ranking.items.filter((p) => matchesTimeFilter(p.hours, p.laptop_hours, p.category, localMinute, { openNow, workNow }))
        : ranking.items,
    [ranking.items, timeFilter, localMinute, openNow, workNow],
  );
  const markers = useMemo(
    () => items.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, category: p.category, name: p.name })),
    [items],
  );
  const selected = items.find((p) => p.id === selectedId) ?? null;
  const compact = width < 640;
  const sideBySide = width >= 1024;
  const suggestTarget: SuggestTarget = { city: city.slug, name: q || null };

  const locateOnMap = async () => {
    const here = await location.request();
    if (here) mapRef.current?.flyTo(here, 15);
  };

  const loadMore = async () => {
    if (!user && (await canShowInterstitial())) {
      markInterstitialShown();
      setInterstitial(true);
    }
    ranking.loadMore();
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (view !== 'list' || !user) return;
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 1200) ranking.loadMore();
  };

  const rateSomething = async () => {
    if (!user) {
      router.push(signUpHref(`/${city.slug}`));
      return;
    }
    setFindingPlace(true);
    try {
      const next = await getPlacesToRate(city.id, 1);
      if (next[0]) router.push(`/place/${next[0].slug}/review`);
      else router.push(suggestRoute(suggestTarget));
    } catch {
      router.push(suggestRoute(suggestTarget));
    } finally {
      setFindingPlace(false);
    }
  };

  const counts: Record<PlaceCategory | 'all', number> = {
    all: city.place_count + city.coliving_count,
    coworking: city.coworking_count,
    cafe: city.cafe_count,
    library: city.library_count,
    coliving: city.coliving_count,
  };
  const tabs = TABS.filter((t) => t !== 'coliving' || counts.coliving > 0 || category === 'coliving');
  const coliving = category === 'coliving';

  const facts: { label: string; value: string; accent?: boolean }[] = [
    { label: strings.city.factPlaces, value: city.place_count.toLocaleString('en-US') },
    {
      label: strings.city.factWifi,
      value: city.median_download_mbps !== null ? formatMbps(city.median_download_mbps) : strings.common.unknown,
    },
    { label: strings.city.factReviews, value: city.review_count.toLocaleString('en-US') },
    { label: strings.city.factSpeedTests, value: city.speed_test_count.toLocaleString('en-US') },
  ];

  const list = (
    <Glass variant="strong" style={styles.list}>
      {items.map((p, i) => (
        <View key={p.id}>
          <RankedPlaceRow
            place={p}
            rank={i + 1}
            signedIn={Boolean(user)}
            compact={compact}
            timezone={city.timezone}
            now={now}
            showWork={workNow}
            onPress={() => router.push(`/place/${p.slug}`)}
          />
          {!user && i === GATE_AFTER - 1 ? (
            <SignupGate
              title={strings.funnel.rankingGateTitle(city.name)}
              body={strings.funnel.rankingGateBody}
              style={styles.gate}
            />
          ) : null}
          {i === 19 ? <AdSlot /> : null}
        </View>
      ))}
    </Glass>
  );

  const sidebar = (
    <View style={[styles.sidebar, sideBySide && styles.sidebarDesktop]}>
      <Glass variant="strong" style={styles.rateCta}>
        <Text variant="heading">{strings.city.rateCtaTitle(city.name)}</Text>
        <Text variant="small" tone="muted">
          {strings.city.rateCtaBody}
        </Text>
        <Button
          title={user ? strings.city.rateCtaButton : strings.nav.signUp}
          icon="star"
          onPress={() => void rateSomething()}
          loading={findingPlace}
        />
      </Glass>
      {sideBySide ? (
        <SuggestPlaceCta title={strings.suggestCta.cityTitle(city.name)} target={{ city: city.slug }} />
      ) : null}
      <Glass style={styles.contributors}>
        <Text variant="bodyStrong">{strings.city.contributorsTitle}</Text>
        {contributors.loading ? (
          <Skeleton height={60} />
        ) : !contributors.data || contributors.data.length === 0 ? (
          <Text variant="small" tone="muted">
            {strings.city.contributorsEmpty(city.name)}
          </Text>
        ) : (
          contributors.data.map((c) => (
            <Pressable
              key={c.user_id}
              style={styles.contributor}
              onPress={() => router.push(`/u/${c.user_id}`)}
              accessibilityRole="link"
            >
              <UserAvatar name={c.display_name ?? 'Cosurfer'} path={c.avatar_path} size={32} />
              <View style={styles.contributorText}>
                <Text variant="smallStrong" numberOfLines={1}>
                  {c.display_name ?? 'Cosurfer'}
                </Text>
                <LevelMark points={c.points} pending={c.points_pending} guide={c.is_guide} />
                <Text variant="caption" tone="muted">
                  {strings.city.contributorReviews(c.city_reviews)}
                </Text>
              </View>
              <Text variant="caption" tone="faint">
                {c.points} pts
              </Text>
            </Pressable>
          ))
        )}
      </Glass>
    </View>
  );

  return (
    <View style={styles.root}>
      <Head>
        <title>{`${strings.city.rankingTitle(city.name)} · Cosurfing`}</title>
        <meta name="description" content={strings.city.metaDescription(city.name, city.place_count)} />
      </Head>
      <SiteHeader />
      <ScrollView onScroll={onScroll} scrollEventThrottle={200} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <SiteHeaderSpacer />
        <View style={[styles.hero, isDesktop && styles.heroDesktop]}>
          {heroCover ? (
            <Image
              source={{ uri: heroCover }}
              placeholder={heroPlaceholder ? { uri: heroPlaceholder } : undefined}
              placeholderContentFit="cover"
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={200}
              priority="high"
            />
          ) : null}
          <Shade colors={['rgba(23,21,15,0.2)', 'rgba(23,21,15,0.35)', 'rgba(23,21,15,0.8)']} locations={[0, 0.45, 1]} />
          <View style={styles.heroInner}>
            <Pressable onPress={() => router.push('/')} accessibilityRole="link" style={styles.back}>
              <Icon name="arrow-left" size={14} color="#fff" />
              <Text variant="smallStrong" style={styles.light}>
                {strings.city.allCities}
              </Text>
            </Pressable>
            <Text variant={isDesktop ? 'display' : 'title'} style={styles.light}>
              {strings.city.rankingTitle(city.name)}
            </Text>
            <Text style={styles.lightMuted}>
              {city.country_name}
              {city.population ? ` · ${strings.city.population(city.population)}` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.page}>
          <View style={styles.factStrip}>
            <Glass variant="strong" style={[styles.fact, styles.factScore]}>
              {city.review_count > 0 && city.city_score !== null ? (
                <ScoreBadge score={city.city_score} size="md" />
              ) : null}
              <View>
                <Text variant="caption" tone="muted">
                  {strings.city.factScore}
                </Text>
                <Text variant="bodyStrong">
                  {city.review_count > 0 && city.city_score !== null
                    ? `${Number(city.city_score).toFixed(1)} / 10`
                    : strings.city.noScoreYet}
                </Text>
              </View>
            </Glass>
            {facts.map((f) => (
              <Glass key={f.label} style={styles.fact}>
                <Text variant="caption" tone="muted">
                  {f.label}
                </Text>
                <Text variant="bodyStrong">{f.value}</Text>
              </Glass>
            ))}
          </View>

          <View style={[styles.columns, sideBySide && styles.columnsDesktop]}>
            <View style={styles.main}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {tabs.map((t) => (
                  <Chip
                    key={t}
                    label={`${strings.city.tabs[t]} ${counts[t] > 0 ? counts[t].toLocaleString('en-US') : ''}`.trim()}
                    selected={category === t}
                    onPress={() => setCategory(t)}
                    color={colors.text}
                  />
                ))}
              </ScrollView>

              <View style={styles.toolbar}>
                <SearchField
                  value={query}
                  onChangeText={setQuery}
                  placeholder={strings.city.searchPlaceholder}
                  style={styles.search}
                />
                <Button
                  title={view === 'list' ? strings.city.showMap : strings.city.showList}
                  icon={view === 'list' ? 'map' : 'list'}
                  variant="secondary"
                  size="sm"
                  onPress={() => setView(view === 'list' ? 'map' : 'list')}
                />
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                <Icon name="bar-chart-2" size={14} color={colors.textMuted} />
                {SORTS.map((s) => (
                  <Chip key={s} label={strings.city.sort[s]} selected={sort === s} onPress={() => setSort(s)} />
                ))}
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                <Text variant="caption" tone="muted">
                  {strings.city.filtersLabel}
                </Text>
                <Chip label={strings.explore.wifi} icon="wifi" selected={wifi} onPress={() => setWifi(!wifi)} />
                <Chip label={strings.explore.power} icon="battery-charging" selected={power} onPress={() => setPower(!power)} />
                <Chip label={strings.explore.calls} icon="video" selected={calls} onPress={() => setCalls(!calls)} />
                <Chip label={strings.explore.reviewed} icon="star" selected={reviewed} onPress={() => setReviewed(!reviewed)} />
                <Chip label={strings.hours.filterOpenNow} icon="clock" selected={openNow} onPress={() => setOpenNow(!openNow)} />
                <Chip label={strings.hours.filterWorkNow} icon="monitor" selected={workNow} onPress={() => setWorkNow(!workNow)} />
              </ScrollView>
              {workNow ? (
                <Text variant="caption" tone="muted">
                  {strings.hours.filterWorkNowHint}
                </Text>
              ) : null}
              {timeFilter && !city.timezone ? <Notice tone="info" body={strings.hours.filterNoTimezone} /> : null}

              {coliving ? (
                <Notice tone="warning" title={strings.city.colivingNoticeTitle} body={strings.city.colivingNoticeBody} />
              ) : null}

              <Text variant="caption" tone="muted">
                {ranking.loading
                  ? strings.common.loading
                  : `${(coliving ? strings.city.colivingResultCount : strings.city.resultCount)(ranking.total)} · ${strings.city.rankExplainer}`}
              </Text>

              {collecting && ranking.items.length === 0 ? (
                <Glass variant="strong" style={styles.collecting}>
                  <ActivityIndicator color={colors.accent} />
                  <Text variant="heading" align="center">
                    {strings.city.collectingTitle(city.name)}
                  </Text>
                  <Text tone="muted" align="center">
                    {strings.city.collectingBody}
                  </Text>
                </Glass>
              ) : ranking.loading ? (
                <View style={styles.skeletons}>
                  {SKELETON_KEYS.map((k) => (
                    <Skeleton key={k} height={compact ? 76 : 96} />
                  ))}
                </View>
              ) : ranking.error ? (
                <ErrorState body={ranking.error.message} onAction={() => void ranking.refresh()} />
              ) : items.length === 0 ? (
                q ? (
                  <SuggestPlaceCta
                    title={strings.suggestCta.searchMissTitle(q)}
                    body={strings.suggestCta.searchMissBody}
                    buttonLabel={strings.suggestCta.addNamed(q)}
                    target={suggestTarget}
                  />
                ) : coliving && !wifi && !power && !calls && !reviewed && !timeFilter ? (
                  <EmptyState icon="home" title={strings.city.colivingEmpty(city.name)} />
                ) : reviewed ? (
                  <EmptyState
                    icon="star"
                    title={strings.city.noReviewedTitle}
                    body={strings.city.noReviewedBody}
                    actionLabel={user ? strings.city.rateCtaButton : strings.nav.signUp}
                    onAction={() => void rateSomething()}
                  />
                ) : filtered ? (
                  <EmptyState icon="filter" title={strings.city.noMatchTitle} body={strings.city.noMatchBody} />
                ) : (
                  <EmptyState
                    icon="map-pin"
                    title={strings.city.emptyTitle(city.name)}
                    body={city.crawl_status === 'failed' ? strings.city.crawlFailed : strings.city.emptyBody}
                    actionLabel={strings.nav.suggest}
                    onAction={() => router.push(suggestRoute(suggestTarget))}
                  />
                )
              ) : view === 'map' ? (
                <View style={styles.mapWrap}>
                  <View style={styles.mapActions}>
                    <Button
                      title={strings.city.nearMe}
                      icon="navigation"
                      variant="secondary"
                      size="sm"
                      loading={location.status === 'loading'}
                      onPress={() => void locateOnMap()}
                    />
                    <Button
                      title={strings.city.fullMap}
                      icon="maximize-2"
                      variant="secondary"
                      size="sm"
                      onPress={() =>
                        router.push({
                          pathname: '/map',
                          params: {
                            lat: String(city.lat),
                            lng: String(city.lng),
                            zoom: String(city.zoom),
                            ...(reviewed ? { reviewed: '1' } : null),
                          },
                        })
                      }
                    />
                  </View>
                  {location.message ? <Notice tone="warning" body={location.message} /> : null}
                  <PlacesMap
                    ref={mapRef}
                    center={{ lat: city.lat, lng: city.lng }}
                    zoom={city.zoom}
                    markers={markers}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    userLocation={location.location}
                    showControls={isDesktop}
                    style={compact ? styles.mapCompact : styles.map}
                  />
                  {selected ? (
                    <RankedPlaceRow
                      place={selected}
                      rank={items.indexOf(selected) + 1}
                      signedIn={Boolean(user)}
                      compact={compact}
                      timezone={city.timezone}
                      now={now}
                      showWork={workNow}
                      onPress={() => router.push(`/place/${selected.slug}`)}
                    />
                  ) : null}
                </View>
              ) : (
                list
              )}

              {ranking.loadingMore ? <ActivityIndicator color={colors.accent} style={styles.more} /> : null}
              {!ranking.loading && ranking.hasMore && !ranking.loadingMore ? (
                <Button title={strings.city.loadMore} variant="secondary" onPress={() => void loadMore()} style={styles.moreButton} />
              ) : null}
              {items.length > 0 ? (
                <SuggestPlaceCta
                  title={q ? strings.suggestCta.searchMissTitle(q) : strings.suggestCta.cityTitle(city.name)}
                  buttonLabel={q ? strings.suggestCta.addNamed(q) : strings.suggestCta.button}
                  target={suggestTarget}
                  style={styles.suggestCta}
                />
              ) : null}
            </View>
            {sidebar}
          </View>
        </View>
        <SiteFooter extra={city.cover_attribution ? strings.city.coverCredit(city.cover_attribution) : null} />
      </ScrollView>
      <SignupBanner />
      <SignupInterstitial
        visible={interstitial}
        onClose={() => {
          setInterstitial(false);
          void dismissInterstitial();
        }}
      />
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
  hero: {
    width: '100%',
    minHeight: 200,
    justifyContent: 'flex-end',
    backgroundColor: colors.text,
    overflow: 'hidden',
  },
  heroDesktop: {
    minHeight: 300,
  },
  heroInner: {
    width: '100%',
    maxWidth: layout.maxWideWidth,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.xs,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
    alignSelf: 'flex-start',
  },
  light: {
    color: '#fff',
  },
  lightMuted: {
    color: 'rgba(255,255,255,0.85)',
  },
  page: {
    width: '100%',
    maxWidth: layout.maxWideWidth,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  factStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  fact: {
    flexGrow: 1,
    minWidth: 130,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    gap: 2,
  },
  factScore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minWidth: 180,
  },
  columns: {
    gap: spacing.xl,
  },
  columnsDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  main: {
    flex: 1,
    minWidth: 0,
    gap: spacing.md,
  },
  chips: {
    gap: spacing.sm,
    alignItems: 'center',
    paddingVertical: 2,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  search: {
    flex: 1,
  },
  collecting: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
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
  mapWrap: {
    gap: spacing.sm,
  },
  mapActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  map: {
    height: 560,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  mapCompact: {
    height: 340,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  more: {
    marginVertical: spacing.lg,
  },
  moreButton: {
    alignSelf: 'center',
    marginTop: spacing.md,
  },
  suggestCta: {
    marginTop: spacing.md,
  },
  sidebar: {
    gap: spacing.lg,
  },
  sidebarDesktop: {
    width: 320,
    ...(Platform.OS === 'web' ? { position: 'sticky' as 'relative', top: spacing.lg } : null),
  },
  rateCta: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  contributors: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  contributor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  contributorText: {
    flex: 1,
    minWidth: 0,
  },
});
