import Head from 'expo-router/head';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, type ScrollViewInstance, StyleSheet, View } from 'react-native';

import { CoffeeDashboard, coffeeError } from '@/components/coffee/CoffeeDashboard';
import { Checklist, CoffeeCups, Faq, SpotsBar, StepCards } from '@/components/coffee/CoffeeSections';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader, SiteHeaderSpacer } from '@/components/SiteHeader';
import { Badge, Button, Glass, Icon, Notice, Skeleton, Text } from '@/components/ui';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { type CoffeeCampaign, type CoffeeStatus, getCoffeeCampaign, getCoffeeStatus, joinCoffeeCampaign, spotsLeft } from '@/lib/coffee';
import { env, isSupabaseConfigured } from '@/lib/env';
import { formatDate } from '@/lib/format';
import { signUpHref } from '@/lib/funnel';
import { strings } from '@/lib/strings';
import { colors, layout, radius, spacing } from '@/lib/theme';

const s = strings.coffee;
const PAGE_URL = `${env.siteUrl}/free-coffee`;

const FAQ_JSON_LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: s.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
});

type CampaignState = 'unknown' | 'launching' | 'open' | 'full' | 'paused' | 'closed';

function campaignState(c: CoffeeCampaign | null | undefined): CampaignState {
  if (!c) return 'unknown';
  if (c.status === 'closed' || (c.ends_at && new Date(c.ends_at) <= new Date())) return 'closed';
  if (c.status === 'paused') return 'paused';
  if (c.status === 'draft' || (c.starts_at && new Date(c.starts_at) > new Date())) return 'launching';
  return spotsLeft(c) > 0 ? 'open' : 'full';
}

export default function FreeCoffeeScreen() {
  const router = useRouter();
  const { isDesktop } = useBreakpoint();
  const { ready, user } = useAuth();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const actionY = useRef(0);

  const campaignQ = useQuery('coffee-campaign', () => getCoffeeCampaign(true), isSupabaseConfigured);
  const statusQ = useQuery(`coffee-status:${user?.id ?? ''}`, getCoffeeStatus, Boolean(user));
  const status = statusQ.data;
  const campaign = status?.campaign ?? campaignQ.data;
  const participant = status?.participant ?? null;
  const state = campaignState(campaign);

  const refetchStatus = statusQ.refetch;
  const refresh = useCallback(() => {
    if (user) void refetchStatus(true);
  }, [user, refetchStatus]);

  useFocusEffect(refresh);
  useEffect(() => {
    if (Platform.OS === 'web') {
      const onVisible = () => document.visibilityState === 'visible' && refresh();
      document.addEventListener('visibilitychange', onVisible);
      return () => document.removeEventListener('visibilitychange', onVisible);
    }
    const sub = AppState.addEventListener('change', (next) => next === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  const scrollToAction = () => scrollRef.current?.scrollTo({ y: Math.max(0, actionY.current - 96), animated: true });
  const goSignUp = () => router.push(signUpHref('/free-coffee'));
  const onHeroCta = () => (!user ? goSignUp() : scrollToAction());

  const onStatus = (next?: CoffeeStatus) => {
    if (next) statusQ.setData(() => next);
    else void statusQ.refetch(true);
    void campaignQ.refetch(true);
  };

  const stateNotice =
    state === 'launching' ? s.launching : state === 'paused' ? s.paused : state === 'closed' ? s.closed : state === 'full' ? s.full : null;

  const action = (
    <View
      onLayout={(e) => {
        actionY.current = e.nativeEvent.layout.y;
      }}
    >
      {!ready || (user && statusQ.loading && !status) ? (
        <Skeleton height={220} style={styles.skeleton} />
      ) : participant && status ? (
        <CoffeeDashboard status={status} onChange={onStatus} />
      ) : (
        <JoinCard campaign={campaign} state={state} signedIn={Boolean(user)} onSignUp={goSignUp} onJoined={onStatus} />
      )}
      {statusQ.error ? <Notice tone="danger" body={coffeeError(statusQ.error)} style={styles.topGap} /> : null}
    </View>
  );

  return (
    <View style={styles.root}>
      <Head>
        <title>{s.metaTitle}</title>
        <meta name="description" content={s.metaDescription} />
        <link rel="canonical" href={PAGE_URL} />
        <meta property="og:title" content={s.title} />
        <meta property="og:description" content={s.metaDescription} />
        <meta property="og:url" content={PAGE_URL} />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{FAQ_JSON_LD}</script>
      </Head>
      <SiteHeader />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <SiteHeaderSpacer />
        <View style={[styles.page, isDesktop && styles.pageDesktop]}>
          <View style={[styles.hero, isDesktop && styles.heroDesktop]}>
            <View style={[styles.heroText, isDesktop && styles.heroTextDesktop]}>
              <Badge label={s.eyebrow} tone="cafe" icon="coffee" />
              <Text variant="display" role="heading" style={isDesktop ? styles.heroTitleDesktop : undefined}>
                {s.title}
              </Text>
              <Text style={styles.lead}>{s.intro}</Text>
              <View style={styles.founder}>
                <View style={styles.founderAvatar}>
                  <Text variant="bodyStrong" tone="inverse">
                    L
                  </Text>
                </View>
                <Text variant="small" tone="muted">
                  {s.signature}
                </Text>
              </View>
              <View style={styles.ctaRow}>
                <Button
                  title={participant ? s.ctaContinue : s.cta}
                  size="lg"
                  icon="coffee"
                  onPress={onHeroCta}
                  disabled={!isSupabaseConfigured}
                  style={isDesktop ? undefined : styles.ctaMobile}
                />
                <Button title={s.rulesLink} variant="ghost" onPress={() => router.push('/free-coffee/terms')} />
              </View>
              {campaign && (state === 'open' || state === 'full') ? (
                <SpotsBar taken={campaign.spots_taken} total={campaign.max_participants} />
              ) : null}
              {stateNotice && !participant ? <Notice tone={state === 'closed' ? 'warning' : 'info'} body={stateNotice} /> : null}
              {!isSupabaseConfigured ? <Notice tone="warning" body={strings.common.backendNotConfigured} /> : null}
            </View>
            <Glass variant="strong" style={[styles.heroCard, isDesktop && styles.heroCardDesktop]}>
              <CoffeeCups filled={3} size={isDesktop ? 40 : 32} />
              <Text variant="heading" align="center">
                {s.maxCaption}
              </Text>
              <View style={styles.heroCardList}>
                {(['contribute', 'new_place', 'spread'] as const).map((step, i) => (
                  <View key={step} style={styles.heroCardRow}>
                    <Text variant="smallStrong" tone="muted" style={styles.heroCardNum}>
                      {i + 1}
                    </Text>
                    <Text variant="small" style={styles.flex}>
                      {s.steps[step].title}
                    </Text>
                    <Text variant="smallStrong">☕</Text>
                  </View>
                ))}
              </View>
              <Text variant="caption" tone="muted" align="center">
                {s.organizer}
              </Text>
            </Glass>
          </View>

          {participant ? action : null}

          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text variant="title" role="heading">
                {s.howTitle}
              </Text>
              <Text tone="muted">{s.howBody}</Text>
            </View>
            <StepCards
              statuses={participant ? Object.fromEntries((status?.rewards ?? []).map((r) => [r.step, r.status])) : undefined}
            />
            <View style={styles.receipt}>
              <Icon name="file-text" size={16} color={colors.textMuted} />
              <Text variant="small" tone="muted" style={styles.flex}>
                {s.receiptNote}
              </Text>
            </View>
          </View>

          {participant ? null : action}

          <View style={[styles.twoCol, isDesktop && styles.twoColDesktop]}>
            <Glass variant="strong" style={[styles.panel, isDesktop && styles.flex]}>
              <Text variant="heading" role="heading">
                {s.rulesTitle}
              </Text>
              <Checklist items={s.rules} color={colors.cafe} />
              <Text variant="small" tone="accent" onPress={() => router.push('/free-coffee/terms')} accessibilityRole="link">
                {s.rulesLink} →
              </Text>
            </Glass>
            <View style={[styles.panel, styles.honest, isDesktop && styles.honestDesktop]}>
              <Icon name="thumbs-up" size={22} color={colors.coworking} />
              <Text variant="heading" role="heading">
                {s.honestTitle}
              </Text>
              <Text>{s.honestBody}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text variant="title" role="heading">
              {s.faqTitle}
            </Text>
            <Faq />
          </View>

          <Glass variant="strong" style={styles.final}>
            <CoffeeCups filled={0} size={24} />
            <Text variant="title" align="center">
              {s.title}
            </Text>
            {campaign?.ends_at ? (
              <Text tone="muted" align="center">
                {s.endsOn(formatDate(campaign.ends_at))}
              </Text>
            ) : null}
            <Button
              title={participant ? s.ctaContinue : s.cta}
              size="lg"
              icon="coffee"
              onPress={onHeroCta}
              disabled={!isSupabaseConfigured || state === 'closed'}
            />
            <Text variant="caption" tone="muted" align="center">
              {s.organizer}
            </Text>
          </Glass>
        </View>
        <SiteFooter />
      </ScrollView>
    </View>
  );
}

function JoinCard({
  campaign,
  state,
  signedIn,
  onSignUp,
  onJoined,
}: {
  campaign: CoffeeCampaign | null | undefined;
  state: CampaignState;
  signedIn: boolean;
  onSignUp: () => void;
  onJoined: (next: CoffeeStatus) => void;
}) {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const joinable = state === 'open' || state === 'full';

  const join = async () => {
    if (!accepted) return;
    setBusy(true);
    setError(null);
    try {
      onJoined(await joinCoffeeCampaign());
    } catch (e) {
      setError(coffeeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Glass variant="strong" style={styles.join}>
      <Text variant="title">{s.joinTitle}</Text>
      {!signedIn ? (
        <>
          <Text tone="muted">{s.joinBody(campaign?.reservation_days ?? 7)}</Text>
          <Button title={s.ctaSignIn} size="lg" fullWidth onPress={onSignUp} disabled={!isSupabaseConfigured} />
          <Button title={strings.funnel.gateLogin} variant="ghost" fullWidth onPress={() => router.push(signUpHref('/free-coffee', 'login'))} />
        </>
      ) : !joinable ? (
        <Notice tone="info" body={state === 'closed' ? s.closed : state === 'paused' ? s.paused : s.launching} />
      ) : (
        <>
          <Text tone="muted">{s.joinBody(campaign?.reservation_days ?? 7)}</Text>
          {state === 'full' ? <Notice tone="warning" body={s.full} /> : null}
          <Pressable
            style={styles.consent}
            onPress={() => setAccepted(!accepted)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: accepted }}
          >
            <Icon name={accepted ? 'check-square' : 'square'} size={20} color={accepted ? colors.cafe : colors.textMuted} />
            <Text variant="small" style={styles.flex}>
              {s.joinAccept}{' '}
              <Text variant="small" tone="accent" onPress={() => router.push('/free-coffee/terms')} accessibilityRole="link">
                {s.rulesLink}
              </Text>
              {' · '}
              <Text variant="small" tone="accent" onPress={() => router.push('/privacy')} accessibilityRole="link">
                {strings.legal.privacy}
              </Text>
            </Text>
          </Pressable>
          {error ? <Notice tone="danger" body={error} /> : null}
          <Button
            title={state === 'full' ? s.joinWaitlistCta : s.joinCta}
            size="lg"
            fullWidth
            loading={busy}
            disabled={!accepted}
            onPress={join}
          />
        </>
      )}
    </Glass>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  skeleton: {
    borderRadius: radius.xl,
  },
  topGap: {
    marginTop: spacing.md,
  },
  scroll: {
    alignItems: 'center',
    paddingBottom: 64,
  },
  page: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.xxxl,
  },
  pageDesktop: {
    maxWidth: 1080,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
  },
  hero: {
    gap: spacing.xl,
  },
  heroDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxxl,
  },
  heroText: {
    gap: spacing.lg,
    alignItems: 'flex-start',
  },
  heroTextDesktop: {
    flex: 1.3,
  },
  heroTitleDesktop: {
    fontSize: 46,
    lineHeight: 52,
    letterSpacing: -1,
  },
  lead: {
    fontSize: 18,
    lineHeight: 28,
  },
  founder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  founderAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cafe,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
  },
  ctaMobile: {
    width: '100%',
  },
  heroCard: {
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.xl,
  },
  heroCardDesktop: {
    flex: 1,
  },
  heroCardList: {
    alignSelf: 'stretch',
    gap: spacing.sm,
  },
  heroCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  heroCardNum: {
    width: 16,
  },
  section: {
    gap: spacing.lg,
  },
  sectionHead: {
    gap: spacing.xs,
  },
  receipt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  twoCol: {
    gap: spacing.md,
  },
  twoColDesktop: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  panel: {
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.xl,
  },
  honest: {
    backgroundColor: colors.coworkingSoft,
  },
  honestDesktop: {
    flex: 0.8,
  },
  join: {
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.xl,
  },
  consent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  final: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
    borderRadius: radius.xl,
  },
});
