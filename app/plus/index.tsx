import Head from 'expo-router/head';
import { type Href, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Icon, Notice, Screen, Text, TopBar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  BillingApiError,
  createCheckout,
  createPortal,
  getBillingStatus,
  type PlusPlan,
  setDevEntitlement,
} from '@/lib/billing';
import { env, isDev, isPlusWaitlistEnabled, isSupabaseConfigured, isWebPaymentsConfigured } from '@/lib/env';
import { formatDate } from '@/lib/format';
import {
  configurePurchases,
  getManagementUrl,
  getPlanOffers,
  type PlanOffer,
  purchasePlan,
  purchasesConfigured,
  PurchasesUnavailableError,
  restorePurchases,
} from '@/lib/purchases';
import { strings } from '@/lib/strings';
import { TERMS_VERSION } from '@/lib/terms';
import { colors, radius, spacing } from '@/lib/theme';

const PLANS: PlusPlan[] = ['yearly', 'weekly'];

async function openUrl(url: string) {
  if (Platform.OS === 'web') {
    window.location.assign(url);
    return;
  }
  await WebBrowser.openBrowserAsync(url);
}

// Tally fills hidden fields (and fields with a matching pre-populate name) from query params.
function waitlistUrl(params: Record<string, string>) {
  const query = Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${env.plusWaitlistUrl}${env.plusWaitlistUrl.includes('?') ? '&' : '?'}${query}`;
}

export default function PlusScreen() {
  const router = useRouter();
  const { ready, user, isPlus, entitlement, refresh } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [devAllowed, setDevAllowed] = useState<boolean | null>(null);
  const [plan, setPlan] = useState<PlusPlan>('yearly');
  const [consent, setConsent] = useState(false);
  const [nativeOffers, setNativeOffers] = useState<Partial<Record<PlusPlan, PlanOffer>> | null>(null);
  const [nativeUnavailable, setNativeUnavailable] = useState(false);

  const isWeb = Platform.OS === 'web';
  const providerConfigured = isWeb ? isWebPaymentsConfigured : purchasesConfigured;
  const showDevTools = isDev && !providerConfigured && isSupabaseConfigured;

  // Server tells us whether the simulated toggle is allowed (dev only).
  useEffect(() => {
    if (!showDevTools || !user) return;
    getBillingStatus()
      .then((s) => setDevAllowed(s.devAllowed))
      .catch(() => setDevAllowed(false));
  }, [showDevTools, user]);

  // Native: configure RevenueCat and fetch the localized prices.
  useEffect(() => {
    if (isWeb || isPlusWaitlistEnabled || !purchasesConfigured || !user) return;
    let cancelled = false;
    configurePurchases(user.id)
      .then(getPlanOffers)
      .then((offers) => {
        if (cancelled) return;
        setNativeOffers(offers);
        if (!offers.yearly && offers.weekly) setPlan('weekly');
      })
      .catch((e) => {
        if (!cancelled && e instanceof PurchasesUnavailableError) setNativeUnavailable(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isWeb, user]);

  const priceOf = (p: PlusPlan) =>
    strings.plus.pricePer(nativeOffers?.[p]?.priceString ?? strings.plus.plans[p].price, strings.plus.plans[p].period);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const goSignIn = () => router.push({ pathname: '/auth/sign-in', params: { redirect: '/plus' } });

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (e) {
      if (e instanceof PurchasesUnavailableError) setError(strings.plus.nativeUnavailable);
      else if (e instanceof BillingApiError && e.code === 'dev_not_allowed') setError(strings.plus.devDisabledOnServer);
      else if (e instanceof BillingApiError && e.code === 'stripe_not_configured') setError(strings.plus.paymentsNotConfigured);
      else if (e instanceof BillingApiError && e.code === 'plan_not_configured') setError(strings.plus.planNotConfigured);
      else setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(null);
    }
  };

  const startWeb = () => {
    if (!consent) {
      setError(strings.plus.needConsent);
      return;
    }
    return run('checkout', async () => {
      const { url } = await createCheckout(plan, { immediateStart: true, termsVersion: TERMS_VERSION });
      await openUrl(url);
    });
  };

  const manageWeb = () =>
    run('portal', async () => {
      const { url } = await createPortal();
      await openUrl(url);
    });

  const startNative = () =>
    run('purchase', async () => {
      await configurePurchases(user!.id);
      const ok = await purchasePlan(plan);
      if (ok) {
        // The webhook writes the entitlement; give it a moment, then reload.
        await new Promise((r) => setTimeout(r, 1500));
        await refresh();
        router.replace('/plus/success');
      }
    });

  const restoreNative = () =>
    run('restore', async () => {
      await configurePurchases(user!.id);
      const ok = await restorePurchases();
      await new Promise((r) => setTimeout(r, 1000));
      await refresh();
      if (!ok) setInfo(strings.plus.restoreNothing);
    });

  const manageNative = () =>
    run('manage', async () => {
      const url = await getManagementUrl();
      if (url) await Linking.openURL(url);
      else if (Platform.OS === 'ios') await Linking.openURL('https://apps.apple.com/account/subscriptions');
      else await Linking.openURL('https://play.google.com/store/account/subscriptions');
    });

  const joinWaitlist = () =>
    run('waitlist', async () => {
      const url = waitlistUrl({ email: user?.email ?? '', user_id: user?.id ?? '', plan, platform: Platform.OS });
      if (Platform.OS === 'web') window.open(url, '_blank', 'noopener');
      else await WebBrowser.openBrowserAsync(url);
    });

  const toggleDev = (enabled: boolean) =>
    run('dev', async () => {
      await setDevEntitlement(enabled);
      await refresh();
    });

  return (
    <Screen>
      <Head>
        <title>Cosurfing Plus</title>
      </Head>
      <TopBar title={strings.plus.title} onBack={back} />

      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Icon name="star" size={26} color={colors.onAccent} />
        </View>
        <Text variant="title" align="center">
          {strings.plus.title}
        </Text>
        <Text tone="muted" align="center">
          {strings.plus.subtitle}
        </Text>
      </View>

      <Card style={styles.priceCard}>
        {isPlus ? (
          <Text variant="bodyStrong" tone="plus">
            {strings.plus.priceSummary}
          </Text>
        ) : (
          <View style={styles.plans} accessibilityRole="radiogroup">
            {PLANS.filter((p) => isWeb || !nativeOffers || nativeOffers[p]).map((p) => {
              const selected = plan === p;
              const info = strings.plus.plans[p];
              return (
                <Pressable
                  key={p}
                  onPress={() => setPlan(p)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  style={[styles.plan, selected && styles.planSelected]}
                >
                  <View style={[styles.radio, selected && styles.radioSelected]}>
                    {selected ? <View style={styles.radioDot} /> : null}
                  </View>
                  <View style={styles.planText}>
                    <View style={styles.planHead}>
                      <Text variant="bodyStrong">{info.label}</Text>
                      {'badge' in info ? <Badge label={info.badge} tone="plus" /> : null}
                    </View>
                    <Text variant="small" tone="muted">
                      {info.billing}
                    </Text>
                  </View>
                  <Text variant="heading" tone={selected ? 'plus' : 'default'}>
                    {priceOf(p)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <Text variant="small" tone="muted">
          {strings.plus.vatNote} {strings.plus.renewNote} {strings.plus.cancelAnytime}
        </Text>
        <View style={styles.features}>
          {strings.plus.features.map((f) => (
            <View key={f} style={styles.feature}>
              <Icon name="check" size={18} color={colors.plus} />
              <Text>{f}</Text>
            </View>
          ))}
        </View>
        <Notice tone="info" body={strings.plus.freeIncludes} />
      </Card>

      {!isSupabaseConfigured ? <Notice tone="warning" body={strings.common.backendNotConfigured} /> : null}
      {error ? <Notice tone="danger" body={error} /> : null}
      {info ? <Notice tone="info" body={info} /> : null}

      {!ready ? null : !user ? (
        <View style={styles.block}>
          <Notice tone="info" body={strings.plus.signInFirst} />
          <Button title={strings.common.signIn} size="lg" fullWidth onPress={goSignIn} disabled={!isSupabaseConfigured} />
        </View>
      ) : isPlus ? (
        <View style={styles.block}>
          <Notice tone="plus" title={strings.account.plusActive} body={strings.plus.active} />
          {entitlement?.current_period_end ? (
            <Text variant="small" tone="muted">
              {entitlement.cancel_at_period_end
                ? strings.plus.endsOn(formatDate(entitlement.current_period_end))
                : strings.plus.renews(formatDate(entitlement.current_period_end))}
            </Text>
          ) : null}
          {entitlement?.source === 'stripe' && isWeb ? (
            <>
              <Button title={strings.plus.manage} variant="secondary" loading={busy === 'portal'} onPress={manageWeb} />
              <Button title={strings.legal.cancel} variant="ghost" onPress={() => router.push('/cancel')} />
            </>
          ) : entitlement?.source === 'revenuecat' && !isWeb ? (
            <Button title={strings.plus.manage} variant="secondary" loading={busy === 'manage'} onPress={manageNative} />
          ) : entitlement?.source === 'dev' ? (
            <Notice tone="warning" title={strings.plus.devModeTitle} body={strings.plus.devModeBody} />
          ) : entitlement?.source === 'manual' ? (
            <Text variant="small" tone="muted">
              {strings.plus.manualSource}
            </Text>
          ) : entitlement?.source ? (
            <Text variant="small" tone="muted">
              {entitlement.source === 'stripe'
                ? 'Manage this subscription on the website.'
                : 'Manage this subscription in the app you subscribed with.'}
            </Text>
          ) : null}
          {entitlement?.source === 'dev' && showDevTools ? (
            <Button title={strings.plus.devDisable} variant="danger" loading={busy === 'dev'} onPress={() => toggleDev(false)} />
          ) : null}
        </View>
      ) : (
        <View style={styles.block}>
          {isPlusWaitlistEnabled ? (
            <>
              <Notice tone="plus" title={strings.plus.waitlistTitle} body={strings.plus.waitlistBody} />
              <Button
                title={strings.plus.waitlistCta}
                variant="plus"
                size="lg"
                fullWidth
                loading={busy === 'waitlist'}
                onPress={joinWaitlist}
              />
              <Text variant="small" tone="muted" align="center">
                {strings.plus.waitlistAfter}
              </Text>
            </>
          ) : isWeb && isWebPaymentsConfigured ? (
            <>
              <Pressable
                style={styles.consent}
                onPress={() => setConsent(!consent)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: consent }}
              >
                <Icon name={consent ? 'check-square' : 'square'} size={20} color={consent ? colors.plus : colors.textMuted} />
                <Text variant="small" style={styles.flex}>
                  {strings.plus.immediateConsent}
                </Text>
              </Pressable>
              <PlusLegal onNavigate={(href) => router.push(href)} />
              <Button title={strings.plus.cta(priceOf(plan))} variant="plus" size="lg" fullWidth loading={busy === 'checkout'} onPress={startWeb} />
            </>
          ) : !isWeb && purchasesConfigured ? (
            <>
              {nativeUnavailable ? <Notice tone="warning" body={strings.plus.nativeUnavailable} /> : null}
              <Text variant="small" tone="muted">
                {strings.plus.storeTerms}
              </Text>
              <PlusLegal onNavigate={(href) => router.push(href)} />
              <Button
                title={strings.plus.cta(priceOf(plan))}
                variant="plus"
                size="lg"
                fullWidth
                loading={busy === 'purchase'}
                disabled={nativeUnavailable}
                onPress={startNative}
              />
              <Button title={strings.plus.restore} variant="ghost" loading={busy === 'restore'} disabled={nativeUnavailable} onPress={restoreNative} />
            </>
          ) : (
            <Notice tone="warning" body={strings.plus.paymentsNotConfigured} />
          )}
        </View>
      )}

      {showDevTools && user && !isPlus ? (
        <View style={styles.devBox}>
          <View style={styles.devHeader}>
            <Icon name="tool" size={16} color={colors.warning} />
            <Text variant="smallStrong">{strings.plus.devModeTitle}</Text>
          </View>
          <Text variant="small" tone="muted">
            {strings.plus.devModeBody}
          </Text>
          {devAllowed === false ? <Text variant="small" tone="danger">{strings.plus.devDisabledOnServer}</Text> : null}
          <Button
            title={strings.plus.devEnable}
            variant="secondary"
            size="sm"
            loading={busy === 'dev'}
            disabled={devAllowed !== true}
            onPress={() => toggleDev(true)}
          />
        </View>
      ) : null}
    </Screen>
  );
}

function PlusLegal({ onNavigate }: { onNavigate: (href: Href) => void }) {
  const link = (label: string, href: Href) => (
    <Text variant="small" tone="accent" onPress={() => onNavigate(href)} accessibilityRole="link">
      {label}
    </Text>
  );
  return (
    <Text variant="small" tone="muted">
      {strings.plus.legalLead} {link(strings.legal.terms, '/terms')}. {strings.plus.legalAnd} {link(strings.legal.withdrawal, '/withdrawal')} ·{' '}
      {link(strings.legal.privacy, '/privacy')}
    </Text>
  );
}

const styles = StyleSheet.create({
  consent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.plus,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  priceCard: {
    gap: spacing.md,
  },
  plans: {
    gap: spacing.sm,
  },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  planSelected: {
    borderWidth: 2,
    borderColor: colors.plus,
    backgroundColor: colors.plusSoft,
  },
  planText: {
    flex: 1,
    gap: 2,
  },
  planHead: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.plus,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.plus,
  },
  features: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  block: {
    gap: spacing.md,
  },
  devBox: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.warning,
    backgroundColor: colors.warningSoft,
  },
  devHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
