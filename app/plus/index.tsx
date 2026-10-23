import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Icon, Notice, Screen, Text, TopBar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { BillingApiError, createCheckout, createPortal, getBillingStatus, setDevEntitlement } from '@/lib/billing';
import { isDev, isSupabaseConfigured, isWebPaymentsConfigured } from '@/lib/env';
import { formatDate } from '@/lib/format';
import {
  configurePurchases,
  getManagementUrl,
  getWeeklyOffer,
  purchaseWeekly,
  purchasesConfigured,
  PurchasesUnavailableError,
  restorePurchases,
} from '@/lib/purchases';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';

async function openUrl(url: string) {
  if (Platform.OS === 'web') {
    window.location.assign(url);
    return;
  }
  await WebBrowser.openBrowserAsync(url);
}

export default function PlusScreen() {
  const router = useRouter();
  const { ready, user, isPlus, entitlement, refresh } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [devAllowed, setDevAllowed] = useState<boolean | null>(null);
  const [nativePrice, setNativePrice] = useState<string | null>(null);
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

  // Native: configure RevenueCat and fetch the localized price.
  useEffect(() => {
    if (isWeb || !purchasesConfigured || !user) return;
    let cancelled = false;
    configurePurchases(user.id)
      .then(getWeeklyOffer)
      .then((offer) => {
        if (!cancelled && offer) setNativePrice(offer.priceString);
      })
      .catch((e) => {
        if (!cancelled && e instanceof PurchasesUnavailableError) setNativeUnavailable(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isWeb, user]);

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
      else setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(null);
    }
  };

  const startWeb = () =>
    run('checkout', async () => {
      const { url } = await createCheckout();
      await openUrl(url);
    });

  const manageWeb = () =>
    run('portal', async () => {
      const { url } = await createPortal();
      await openUrl(url);
    });

  const startNative = () =>
    run('purchase', async () => {
      await configurePurchases(user!.id);
      const ok = await purchaseWeekly();
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
        <View style={styles.priceRow}>
          <Text variant="display" tone="plus">
            {nativePrice ?? strings.plus.price}
          </Text>
          {!isWeb && nativePrice ? <Badge label={strings.plus.price} tone="neutral" /> : null}
        </View>
        <Text variant="small" tone="muted">
          {strings.plus.billing} {strings.plus.cancelAnytime}
        </Text>
        <View style={styles.features}>
          {strings.plus.features.map((f) => (
            <View key={f} style={styles.feature}>
              <Icon name="check" size={18} color={colors.plus} />
              <Text>{f}</Text>
            </View>
          ))}
        </View>
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
            <Button title={strings.plus.manage} variant="secondary" loading={busy === 'portal'} onPress={manageWeb} />
          ) : entitlement?.source === 'revenuecat' && !isWeb ? (
            <Button title={strings.plus.manage} variant="secondary" loading={busy === 'manage'} onPress={manageNative} />
          ) : entitlement?.source === 'dev' ? (
            <Notice tone="warning" title={strings.plus.devModeTitle} body={strings.plus.devModeBody} />
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
          {isWeb && isWebPaymentsConfigured ? (
            <Button title={strings.plus.cta} variant="plus" size="lg" fullWidth loading={busy === 'checkout'} onPress={startWeb} />
          ) : !isWeb && purchasesConfigured ? (
            <>
              {nativeUnavailable ? <Notice tone="warning" body={strings.plus.nativeUnavailable} /> : null}
              <Button
                title={strings.plus.cta}
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

const styles = StyleSheet.create({
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
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
