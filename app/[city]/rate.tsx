import Head from 'expo-router/head';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RequireAuth } from '@/components/RequireAuth';
import { SearchField } from '@/components/SearchField';
import { suggestRoute } from '@/components/SuggestPlaceCta';
import { Button, CategoryBadge, EmptyState, ErrorState, Glass, Icon, Skeleton, Text, TopBar } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { getCityBySlug, getPlacesToRate } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, layout, radius, spacing } from '@/lib/theme';

const MAX_PLACES = 100;

export default function RatePlacesRoute() {
  const { city: slug } = useLocalSearchParams<{ city: string }>();
  return (
    <RequireAuth title={strings.ratePicker.title} message={strings.place.signInToReview} redirect={`/${slug}/rate`}>
      <RatePlacesScreen slug={slug!} />
    </RequireAuth>
  );
}

/** Step 1 of rating: the visitor ticks the places they know, then reviews them one after another. */
function RatePlacesScreen({ slug }: { slug: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const cityQuery = useQuery(`city:${slug}`, () => getCityBySlug(slug));
  const city = cityQuery.data ?? null;
  const placesQuery = useQuery(`rate-picker:${city?.id}`, () => getPlacesToRate(city!.id, MAX_PLACES), Boolean(city));
  const places = useMemo(() => placesQuery.data ?? [], [placesQuery.data]);

  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      needle
        ? places.filter((p) => p.name.toLowerCase().includes(needle) || (p.address ?? '').toLowerCase().includes(needle))
        : places,
    [places, needle],
  );

  const back = () => (router.canGoBack() ? router.back() : router.replace(`/${slug}`));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const start = () => {
    // Keep the ranking order, so the best known places come first.
    const picked = places.filter((p) => selected.includes(p.id));
    const [first, ...rest] = picked;
    if (!first) return;
    router.push({
      pathname: '/place/[slug]/review',
      params: { slug: first.slug, queue: rest.map((p) => p.slug).join(','), of: String(picked.length) },
    });
  };

  const loading = cityQuery.loading || (Boolean(city) && placesQuery.loading);
  const error = cityQuery.error ?? placesQuery.error;

  let body;
  if (loading) {
    body = (
      <View style={styles.gap}>
        <Skeleton height={44} />
        <Skeleton height={64} />
        <Skeleton height={64} />
        <Skeleton height={64} />
      </View>
    );
  } else if (error) {
    body = <ErrorState body={error.message} onAction={() => void (city ? placesQuery.refetch() : cityQuery.refetch())} />;
  } else if (!city) {
    body = <EmptyState icon="map-pin" title={strings.ratePicker.cityNotFound} actionLabel={strings.notFound.home} onAction={() => router.replace('/')} />;
  } else if (places.length === 0) {
    body = (
      <EmptyState
        icon="check-circle"
        title={strings.ratePicker.emptyTitle}
        body={strings.ratePicker.emptyBody}
        actionLabel={strings.ratePicker.suggest}
        onAction={() => router.push(suggestRoute({ city: city.slug, name: null }))}
      />
    );
  } else {
    body = (
      <>
        <View style={styles.gap}>
          <Text variant="title">{strings.ratePicker.heading(city.name)}</Text>
          <Text tone="muted">{strings.ratePicker.body}</Text>
        </View>
        <SearchField value={query} onChangeText={setQuery} placeholder={strings.ratePicker.searchPlaceholder} />
        {visible.length === 0 ? (
          <Text tone="muted">{strings.ratePicker.noMatch}</Text>
        ) : (
          <Glass variant="strong" style={styles.list}>
            {visible.map((p, i) => {
              const on = selected.includes(p.id);
              return (
                <Pressable
                  key={p.id}
                  onPress={() => toggle(p.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={strings.ratePicker.toggle(p.name)}
                  style={({ pressed }) => [styles.row, i < visible.length - 1 && styles.rowDivider, on && styles.rowOn, pressed && styles.pressed]}
                >
                  <View style={[styles.box, on && styles.boxOn]}>{on ? <Icon name="check" size={16} color={colors.onAccent} /> : null}</View>
                  <View style={styles.rowText}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {p.name}
                    </Text>
                    <View style={styles.meta}>
                      <CategoryBadge category={p.category} />
                      {p.address ? (
                        <Text variant="caption" tone="muted" numberOfLines={1} style={styles.shrink}>
                          {p.address}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </Glass>
        )}
      </>
    );
  }

  const showFooter = !loading && !error && Boolean(city) && places.length > 0;

  return (
    <View style={styles.root}>
      <Head>
        <title>{`${strings.ratePicker.title} · ${city?.name ?? ''} · Cosurfing`}</title>
      </Head>
      <TopBar title={strings.ratePicker.title} onBack={back} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: showFooter ? 140 + insets.bottom : insets.bottom + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>{body}</View>
      </ScrollView>
      {showFooter ? (
        <Glass variant="strong" style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.footerInner}>
            <View style={styles.footerText}>
              <Text variant="smallStrong">{selected.length > 0 ? strings.ratePicker.selected(selected.length) : strings.ratePicker.none}</Text>
              {selected.length > 0 ? (
                <Pressable onPress={() => setSelected([])} accessibilityRole="button" hitSlop={8}>
                  <Text variant="caption" tone="accent">
                    {strings.ratePicker.clear}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <Button
              title={selected.length > 0 ? strings.ratePicker.continue(selected.length) : strings.ratePicker.continueEmpty}
              icon="star"
              disabled={selected.length === 0}
              onPress={start}
            />
          </View>
        </Glass>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
  },
  content: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  gap: {
    gap: spacing.sm,
  },
  list: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowOn: {
    backgroundColor: colors.accentSoft,
  },
  pressed: {
    backgroundColor: colors.bgSubtle,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.textFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  shrink: {
    flexShrink: 1,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 0,
    paddingTop: spacing.md,
    alignItems: 'center',
  },
  footerInner: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  footerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});
