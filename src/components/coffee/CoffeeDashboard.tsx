import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Badge, Button, Glass, Icon, Input, Notice, Text } from '@/components/ui';
import {
  COFFEE_STEPS,
  type CoffeeReward,
  type CoffeeStatus,
  coffeeFormUrl,
  formatEuros,
  isCoffeeFormConfigured,
  joinCoffeeCampaign,
  saveCoffeePayoutDetails,
  withdrawFromCoffeeCampaign,
} from '@/lib/coffee';
import { formatDate, formatDateTime } from '@/lib/format';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';

import { CoffeeCups, STATUS_TONE, STEP_META } from './CoffeeSections';

const s = strings.coffee;

export function coffeeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : '';
  return s.errors[msg] ?? s.payoutErrors[msg] ?? strings.common.somethingWentWrong;
}

function confirm(message: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(message)) onYes();
    return;
  }
  Alert.alert(message, undefined, [
    { text: strings.common.cancel, style: 'cancel' },
    { text: s.withdraw, style: 'destructive', onPress: onYes },
  ]);
}

/** Opens the Tally form with a fresh one-time token. On web the tab is opened before the token request so popup blockers allow it. */
async function openForm() {
  if (Platform.OS === 'web') {
    const tab = window.open('about:blank', '_blank');
    try {
      const url = await coffeeFormUrl();
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        window.location.assign(url);
      }
    } catch (e) {
      tab?.close();
      throw e;
    }
    return;
  }
  await WebBrowser.openBrowserAsync(await coffeeFormUrl());
}

function hint(r: CoffeeReward): string {
  switch (r.status) {
    case 'approved':
      return s.statusHint.approved(formatEuros(r.approved_cents));
    case 'paid':
      return s.statusHint.paid(formatEuros(r.paid_cents));
    case 'rejected':
      return r.can_submit ? s.statusHint.rejectedRetry : s.statusHint.rejected;
    default:
      return s.statusHint[r.status];
  }
}

export function CoffeeDashboard({ status, onChange }: { status: CoffeeStatus; onChange: (next?: CoffeeStatus) => void }) {
  const p = status.participant!;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const rewards = COFFEE_STEPS.map(
    (step) =>
      status.rewards.find((r) => r.step === step) ??
      ({ step, status: 'not_started', attempts: 0, approved_cents: null, paid_cents: null, decision_reason: null, decision_note: null, submitted_at: null, paid_at: null, can_submit: false } as CoffeeReward),
  );
  const earned = rewards.filter((r) => r.status === 'approved' || r.status === 'paid').length;
  const canSubmit = rewards.some((r) => r.can_submit);
  const baseOpen = rewards[0]?.can_submit ?? false;
  const active = p.spot_status !== 'released';

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (e) {
      setError(coffeeError(e));
    } finally {
      setBusy(null);
    }
  };

  const submit = () =>
    run('form', async () => {
      if (!isCoffeeFormConfigured()) {
        setInfo(s.formNotReady);
        return;
      }
      await openForm();
    });

  const withdraw = () =>
    confirm(s.withdrawConfirm, () =>
      void run('withdraw', async () => {
        await withdrawFromCoffeeCampaign();
        onChange();
      }),
    );

  const rejoin = () =>
    run('rejoin', async () => {
      onChange(await joinCoffeeCampaign());
    });

  const spotText =
    p.spot_status === 'reserved'
      ? s.spot.reserved(formatDateTime(p.reserved_until))
      : p.spot_status === 'held'
        ? s.spot.held
        : p.spot_status === 'confirmed'
          ? s.spot.confirmed
          : p.spot_status === 'waitlisted'
            ? s.spot.waitlisted(p.waitlist_position)
            : s.spot.released[p.released_reason ?? 'expired'];
  const spotTone = p.spot_status === 'released' ? 'warning' : p.spot_status === 'confirmed' ? 'success' : 'info';

  return (
    <Glass variant="strong" style={styles.card}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text variant="title">{s.yourProgress}</Text>
          <Text tone="muted">{s.maxCaption}</Text>
        </View>
        <CoffeeCups filled={earned} size={28} />
      </View>

      <Notice tone={spotTone} body={spotText} />
      {p.spot_status === 'released' && p.can_rejoin ? (
        <Button title={s.spot.rejoin} variant="secondary" loading={busy === 'rejoin'} onPress={rejoin} />
      ) : null}

      <View style={styles.rows}>
        {rewards.map((r) => {
          const meta = STEP_META[r.step];
          const reason = r.status === 'rejected' && r.decision_reason ? s.reasons[r.decision_reason] : null;
          return (
            <View key={r.step} style={styles.row}>
              <View style={[styles.rowIcon, { backgroundColor: meta.soft }]}>
                <Icon name={meta.icon} size={18} color={meta.color} />
              </View>
              <View style={styles.rowText}>
                <View style={styles.rowHead}>
                  <Text variant="smallStrong" style={styles.flex}>
                    {s.steps[r.step].label}
                  </Text>
                  <Badge label={s.status[r.status]} tone={STATUS_TONE[r.status]} />
                </View>
                <Text variant="small" tone="muted">
                  {hint(r)}
                  {r.submitted_at && (r.status === 'submitted' || r.status === 'under_review') ? ` · ${formatDate(r.submitted_at)}` : ''}
                </Text>
                {reason ? (
                  <Text variant="small" tone="danger">
                    {reason}
                  </Text>
                ) : null}
                {r.decision_note ? (
                  <Text variant="small" tone="muted">
                    “{r.decision_note}”
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      {error ? <Notice tone="danger" body={error} /> : null}
      {info ? <Notice tone="warning" body={info} /> : null}

      {active && canSubmit ? (
        <View style={styles.block}>
          <Button
            title={baseOpen ? s.submitBase : s.submitBonus}
            icon="upload"
            size="lg"
            fullWidth
            loading={busy === 'form'}
            onPress={submit}
          />
          <Text variant="caption" tone="muted" align="center">
            {s.submitHint}
          </Text>
          <Text variant="caption" tone="muted" align="center">
            {s.receiptNote}
          </Text>
        </View>
      ) : null}

      {status.payout?.needed || status.payout?.method ? <PayoutSection status={status} onSaved={() => onChange()} /> : null}

      <View style={styles.footer}>
        <Button title={s.refresh} variant="ghost" size="sm" icon="refresh-cw" onPress={() => onChange()} />
        {active ? <Button title={s.withdraw} variant="ghost" size="sm" loading={busy === 'withdraw'} onPress={withdraw} /> : null}
      </View>
    </Glass>
  );
}

function PayoutSection({ status, onSaved }: { status: CoffeeStatus; onSaved: () => void }) {
  const saved = status.payout?.method ? status.payout : null;
  const [editing, setEditing] = useState(!saved);
  const [method, setMethod] = useState<'paypal' | 'sepa'>(saved?.method ?? 'paypal');
  const [holder, setHolder] = useState('');
  const [email, setEmail] = useState('');
  const [iban, setIban] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (holder.trim().length < 2) {
      setError(s.payoutErrors.invalid_name ?? null);
      return;
    }
    setBusy(true);
    try {
      await saveCoffeePayoutDetails({
        method,
        accountHolder: holder.trim(),
        paypalEmail: email.trim(),
        iban: iban.replace(/\s+/g, '').toUpperCase(),
      });
      setEditing(false);
      setIban('');
      onSaved();
    } catch (e) {
      setError(coffeeError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!editing && saved) {
    return (
      <View style={styles.payoutSaved}>
        <Icon name="credit-card" size={18} color={colors.textMuted} />
        <Text variant="small" style={styles.flex}>
          {s.payoutSaved(saved.hint ?? '')}
        </Text>
        {status.payout?.needed ? <Button title={s.payoutChange} variant="ghost" size="sm" onPress={() => setEditing(true)} /> : null}
      </View>
    );
  }

  return (
    <View style={styles.payout}>
      <Text variant="heading">{s.payoutTitle}</Text>
      <Text variant="small" tone="muted">
        {s.payoutBody}
      </Text>
      <View style={styles.methods} accessibilityRole="radiogroup">
        {(['paypal', 'sepa'] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMethod(m)}
            accessibilityRole="radio"
            accessibilityState={{ checked: method === m }}
            style={[styles.method, method === m && styles.methodSelected]}
          >
            <Icon name={m === 'paypal' ? 'mail' : 'credit-card'} size={16} color={method === m ? colors.text : colors.textMuted} />
            <Text variant="smallStrong">{m === 'paypal' ? s.payoutPaypal : s.payoutSepa}</Text>
          </Pressable>
        ))}
      </View>
      <Input label={s.payoutName} value={holder} onChangeText={setHolder} autoComplete="name" maxLength={120} />
      {method === 'paypal' ? (
        <Input
          label={s.payoutEmail}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          inputMode="email"
          maxLength={254}
        />
      ) : (
        <Input label={s.payoutIban} value={iban} onChangeText={setIban} autoCapitalize="characters" autoCorrect={false} maxLength={42} />
      )}
      {error ? <Notice tone="danger" body={error} /> : null}
      <Button title={s.payoutSave} loading={busy} onPress={save} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  card: {
    gap: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.xl,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  rows: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  block: {
    gap: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  payout: {
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  payoutSaved: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  methods: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  method: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  methodSelected: {
    borderWidth: 2,
    borderColor: colors.text,
    backgroundColor: colors.surface,
  },
});
