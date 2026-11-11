import Head from 'expo-router/head';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AdminShell } from '@/components/admin/AdminShell';
import { STATUS_TONE } from '@/components/coffee/CoffeeSections';
import { Badge, Button, Card, Chip, Icon, Input, Notice, Skeleton, Text } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import {
  COFFEE_CHANNELS,
  type CoffeeAdminDetail,
  type CoffeeAdminReward,
  coffeeAdmin,
  coffeeAdminError as adminCoffeeError,
  formatEuros,
} from '@/lib/coffee';
import { formatDate, formatDateTime } from '@/lib/format';
import { strings } from '@/lib/strings';
import { colors, spacing } from '@/lib/theme';

const STEP_TITLE = { contribute: 'Step 1 · Contribute', new_place: 'Step 2 · New place', spread: 'Step 3 · Spread the word' } as const;

const REJECT_REASONS: Record<CoffeeAdminReward['step'], string[]> = {
  contribute: ['proof_not_received', 'low_effort', 'not_authentic', 'evidence_missing', 'receipt_invalid', 'receipt_reused', 'not_coffee', 'other'],
  new_place: ['proof_not_received', 'place_exists', 'place_inaccurate', 'evidence_missing', 'receipt_invalid', 'receipt_reused', 'not_coffee', 'other'],
  spread: ['proof_not_received', 'referral_invalid', 'post_invalid', 'evidence_missing', 'receipt_invalid', 'receipt_reused', 'not_coffee', 'other'],
};

/** Signals computed when the step was marked as sent. */
const CHECKS: Record<string, string> = {
  review_found: 'Review with 120+ characters since joining',
  photo_found: 'Photo uploaded since joining',
  suggestion_found: 'Place suggestion since joining',
};

function inboxUrl(channel: string | null, handle: string | null): string | null {
  if (!handle) return null;
  if (channel === 'instagram') return `https://www.instagram.com/${handle}`;
  if (channel === 'tiktok') return `https://www.tiktok.com/@${handle}`;
  if (channel === 'x') return `https://x.com/${handle}`;
  return null;
}

function confirm(message: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(message)) onYes();
    return;
  }
  Alert.alert(message, undefined, [
    { text: strings.common.cancel, style: 'cancel' },
    { text: 'OK', style: 'destructive', onPress: onYes },
  ]);
}

function parseEuros(v: string): number | null {
  const n = Number.parseFloat(v.replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export default function AdminCoffeeParticipant() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const detail = useQuery(`admin-coffee:${id}`, () => coffeeAdmin.get(id!), isAdmin && Boolean(id));
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const reload = () => void detail.refetch(true);
  const run = async (key: string, fn: () => Promise<void>, done?: string) => {
    setBusy(key);
    setMessage(null);
    try {
      await fn();
      if (done) setMessage({ tone: 'success', text: done });
      reload();
    } catch (e) {
      setMessage({ tone: 'danger', text: adminCoffeeError(e) });
    } finally {
      setBusy(null);
    }
  };

  const d = detail.data;
  const p = d?.participant;
  const profile = p ? inboxUrl(p.social_channel, p.social_handle) : null;

  return (
    <AdminShell title="Coffee participant" backTo="/admin/coffee">
      <Head>
        <title>Coffee participant · Admin · Cosurfing</title>
      </Head>
      {detail.error ? <Notice tone="danger" body={adminCoffeeError(detail.error)} /> : null}
      {!d || !p ? (
        detail.loading ? <Skeleton height={200} /> : null
      ) : (
        <>
          <Card style={styles.card}>
            <View style={styles.header}>
              <View style={styles.flex}>
                <Text variant="heading" selectable>
                  {p.code} · {p.display_name ?? p.email}
                </Text>
                <Text variant="small">
                  {p.social_handle ? (
                    <>
                      Sent from {COFFEE_CHANNELS.find((c) => c.id === p.social_channel)?.label ?? p.social_channel}{' '}
                      <Text variant="smallStrong" tone="accent" onPress={profile ? () => void Linking.openURL(profile) : undefined} accessibilityRole="link">
                        @{p.social_handle}
                      </Text>
                    </>
                  ) : (
                    'No username yet. Match the direct message by the code.'
                  )}
                </Text>
                <Text variant="small" tone="muted">
                  {p.email} · account since {formatDate(p.account_created_at)} · joined {formatDateTime(p.joined_at)} · terms {p.terms_version}
                </Text>
              </View>
              <Badge
                label={`${p.spot_status}${p.released_reason ? ` (${p.released_reason})` : ''}`}
                tone={p.spot_status === 'released' ? 'danger' : p.spot_status === 'confirmed' ? 'success' : 'accent'}
              />
            </View>
            {p.reserved_until && p.spot_status === 'reserved' ? (
              <Text variant="small">Reserved until {formatDateTime(p.reserved_until)}</Text>
            ) : null}
            <View style={styles.actions}>
              {p.spot_status === 'reserved' ? (
                <Button title="Extend reservation" size="sm" variant="secondary" loading={busy === 'extend'} onPress={() => run('extend', () => coffeeAdmin.participant(p.id, 'extend'), 'Extended.')} />
              ) : null}
              {p.spot_status !== 'released' ? (
                <>
                  <Button
                    title="Release spot"
                    size="sm"
                    variant="secondary"
                    loading={busy === 'release'}
                    onPress={() => confirm('Release this spot to the next person? They can rejoin once, at the end of the waiting list.', () => void run('release', () => coffeeAdmin.participant(p.id, 'release'), 'Released.'))}
                  />
                  <Button
                    title="Disqualify"
                    size="sm"
                    variant="danger"
                    loading={busy === 'disqualify'}
                    onPress={() =>
                      confirm('Disqualify for breaking the rules? Pending and approved-but-unpaid steps are rejected. They cannot rejoin.', () =>
                        void run('disqualify', () => coffeeAdmin.participant(p.id, 'disqualify', note ?? undefined), 'Disqualified.'),
                      )
                    }
                  />
                </>
              ) : null}
            </View>
            <Input label="Internal note" value={note ?? p.admin_note ?? ''} onChangeText={setNote} multiline optional />
            {note !== null && note !== (p.admin_note ?? '') ? (
              <Button title="Save note" size="sm" loading={busy === 'note'} onPress={() => run('note', () => coffeeAdmin.participant(p.id, 'note', note), 'Note saved.')} />
            ) : null}
          </Card>

          {message ? <Notice tone={message.tone} body={message.text} /> : null}

          {d.rewards.map((r) => (
            <RewardCard key={r.id} reward={r} detail={d} busy={busy} run={run} />
          ))}

          <Notice
            tone="info"
            body="The proof lives in your direct messages. After deciding a step, delete the screenshots and receipt from the chat within 30 days (privacy policy 9a). Keep the receipt only if it is a paid reward and your accountant needs it."
          />

          <Card style={styles.card}>
            <Text variant="heading">Contributions since joining</Text>
            {d.reviews.length === 0 ? <Text tone="muted">No reviews.</Text> : null}
            {d.reviews.map((rv) => (
              <Pressable key={rv.id} onPress={() => router.push(`/place/${rv.place_slug}`)} style={styles.review}>
                <Text variant="smallStrong">
                  {rv.place_name} · {rv.rating}★ · {rv.status}
                  {rv.coffee_program ? ' · labelled' : ' · not labelled'}
                </Text>
                <Text variant="small" tone="muted">
                  {formatDateTime(rv.created_at)} · {(rv.body ?? '').length} characters
                </Text>
                {rv.body ? <Text variant="small">{rv.body}</Text> : null}
              </Pressable>
            ))}
            <Text variant="small">{d.photos} photo(s) uploaded since joining.</Text>
            {d.suggestions.map((sg) => (
              <Text key={sg.id} variant="small">
                Suggestion: {sg.name}
                {sg.city ? `, ${sg.city}` : ''} · {sg.status} · {formatDateTime(sg.created_at)}
              </Text>
            ))}
            {d.suggestions.length > 0 ? (
              <Button title="Open suggestions" size="sm" variant="ghost" onPress={() => router.push('/admin/suggestions')} />
            ) : null}
          </Card>

          {d.payouts.length > 0 ? (
            <Card style={styles.card}>
              <Text variant="heading">Payments</Text>
              {d.payouts.map((x) => (
                <Text key={x.id} variant="small">
                  {formatDateTime(x.paid_at)} · {x.step} · {formatEuros(x.amount_cents)} · {x.method}
                  {x.reference ? ` · ${x.reference}` : ''}
                </Text>
              ))}
            </Card>
          ) : null}
        </>
      )}
    </AdminShell>
  );
}

function RewardCard({
  reward: r,
  detail,
  busy,
  run,
}: {
  reward: CoffeeAdminReward;
  detail: CoffeeAdminDetail;
  busy: string | null;
  run: (key: string, fn: () => Promise<void>, done?: string) => Promise<void>;
}) {
  const max = 500;
  const [mode, setMode] = useState<'approve' | 'reject' | 'pay' | null>(null);
  const [amount, setAmount] = useState((max / 100).toFixed(2));
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState('');
  const [total, setTotal] = useState('');
  const [number, setNumber] = useState('');
  const [referral, setReferral] = useState('');
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [payMethod, setPayMethod] = useState<'paypal' | 'sepa' | 'other'>(detail.payout_details?.method ?? 'paypal');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reviewable = r.status === 'submitted' || r.status === 'under_review';
  const checks = Object.entries(r.checks ?? {}).filter(([k]) => k in CHECKS);
  const payout = detail.payout_details;

  const approve = () => {
    setError(null);
    const cents = parseEuros(amount);
    const totalCents = parseEuros(total);
    if (!cents || cents < 1 || cents > max) return setError('Amount must be between €0.01 and €5.');
    if (!merchant.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !totalCents) return setError('Enter venue, date (YYYY-MM-DD) and total from the receipt.');
    if (cents > totalCents) return setError('The amount cannot be higher than the receipt total.');
    void run(`approve:${r.id}`, () => coffeeAdmin.approve(r.id, { cents, note, merchant: merchant.trim(), date, totalCents, receiptNumber: number.trim(), referralEmail: referral.trim() }), 'Approved. The participant is asked for payout details.').then(() => setMode(null));
  };
  const reject = () => {
    setError(null);
    if (!reason) return setError('Pick a reason.');
    if (reason === 'other' && !note.trim()) return setError('Explain the reason in the note.');
    void run(`reject:${r.id}`, () => coffeeAdmin.reject(r.id, reason, note.trim()), 'Rejected. The participant gets an email with the reason.').then(() => setMode(null));
  };
  const pay = () => {
    setError(null);
    const cents = parseEuros(amount);
    if (!cents || cents < 1 || cents > (r.approved_cents ?? 0)) return setError(`Amount must be at most ${formatEuros(r.approved_cents)}.`);
    confirm(`Record that you sent ${formatEuros(cents)} by ${payMethod}? Send the money first; this does not pay anything.`, () =>
      void run(`pay:${r.id}`, () => coffeeAdmin.markPaid(r.id, cents, payMethod, reference.trim()), 'Marked as paid.').then(() => setMode(null)),
    );
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text variant="heading" style={styles.flex}>
          {STEP_TITLE[r.step]}
        </Text>
        <Badge label={strings.coffee.status[r.status]} tone={STATUS_TONE[r.status]} />
      </View>
      <Text variant="small" tone="muted">
        Attempt {r.attempts}
        {r.submitted_at ? ` · sent ${formatDateTime(r.submitted_at)}${r.submitted_by === 'admin' ? ' (recorded by admin)' : ''}` : ''}
        {r.approved_cents !== null ? ` · approved ${formatEuros(r.approved_cents)}` : ''}
        {r.paid_cents !== null ? ` · paid ${formatEuros(r.paid_cents)} on ${formatDate(r.paid_at)}` : ''}
      </Text>
      {r.decision_reason || r.decision_note ? (
        <Text variant="small">
          Decision: {r.decision_reason ?? ''} {r.decision_note ? `“${r.decision_note}”` : ''} {r.decided_at ? `· ${formatDateTime(r.decided_at)}` : ''}
        </Text>
      ) : null}
      {r.checks?.mode ? <Text variant="smallStrong">Mode: {String(r.checks.mode)}</Text> : null}
      {r.referral_email ? <Text variant="small">Referred account: {r.referral_email}</Text> : null}
      {checks.length > 0 ? (
        <View style={styles.checks}>
          {checks.map(([k, v]) => (
            <View key={k} style={styles.check}>
              <Icon name={v === true ? 'check-circle' : 'alert-triangle'} size={14} color={v === true ? colors.success : colors.warning} />
              <Text variant="small" style={styles.flex}>
                {CHECKS[k]}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {r.step === 'contribute' && reviewable ? (
        <Notice tone="info" body="Check: own visit, ≥3 work criteria covered, ≥2 own photos, receipt matches venue and date, coffee only. The rating does not matter. A location screenshot is not proof on its own." />
      ) : null}
      {r.can_record ? (
        <View style={styles.actions}>
          <Button
            title="Mark proof received"
            size="sm"
            variant="secondary"
            icon="inbox"
            loading={busy === `received:${r.id}`}
            onPress={() => run(`received:${r.id}`, () => coffeeAdmin.markReceived(r.id), 'Recorded as sent.')}
          />
          <Text variant="caption" tone="muted" style={styles.flex}>
            Use this when the direct message arrived but the participant did not tap “I’ve sent my proof”.
          </Text>
        </View>
      ) : null}

      {reviewable ? (
        <View style={styles.actions}>
          {r.status === 'submitted' ? (
            <Button title="Start review" size="sm" variant="secondary" loading={busy === `review:${r.id}`} onPress={() => run(`review:${r.id}`, () => coffeeAdmin.markUnderReview(r.id))} />
          ) : null}
          <Button title="Approve…" size="sm" onPress={() => setMode(mode === 'approve' ? null : 'approve')} />
          <Button title="Reject…" size="sm" variant="danger" onPress={() => setMode(mode === 'reject' ? null : 'reject')} />
        </View>
      ) : null}
      {r.status === 'approved' ? (
        <View style={styles.block}>
          {payout ? (
            <Notice
              tone="info"
              title="Payout details"
              body={`${payout.account_holder} · ${payout.method === 'paypal' ? `PayPal ${payout.paypal_email}` : `IBAN ${payout.iban}`}`}
            />
          ) : (
            <Notice tone="warning" body="Waiting for the participant to add payout details on /free-coffee." />
          )}
          <Button
            title="Mark as paid…"
            size="sm"
            variant="secondary"
            disabled={!payout}
            onPress={() => {
              setAmount(((r.approved_cents ?? 0) / 100).toFixed(2));
              setMode(mode === 'pay' ? null : 'pay');
            }}
          />
        </View>
      ) : null}

      {mode === 'approve' ? (
        <View style={styles.block}>
          <Text variant="small" tone="muted">
            Copy the details from the receipt. The same venue, date, total and number can only be reimbursed once.
          </Text>
          <View style={styles.fields}>
            <View style={styles.field}>
              <Input label="Amount to reimburse (€, max 5)" value={amount} onChangeText={setAmount} inputMode="decimal" />
            </View>
            <View style={styles.field}>
              <Input label="Venue on receipt" value={merchant} onChangeText={setMerchant} />
            </View>
            <View style={styles.field}>
              <Input label="Receipt date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
            </View>
            <View style={styles.field}>
              <Input label="Receipt total (€)" value={total} onChangeText={setTotal} inputMode="decimal" />
            </View>
            <View style={styles.field}>
              <Input label="Receipt number" value={number} onChangeText={setNumber} optional />
            </View>
          </View>
          {r.step === 'spread' ? (
            <Input
              label="Friend’s account email (referral)"
              value={referral}
              onChangeText={setReferral}
              optional
              autoCapitalize="none"
              keyboardType="email-address"
              hint="Leave empty for a public #ad post. The email is only used to find and check the account and is not stored."
            />
          ) : null}
          <Input label="Note to participant" value={note} onChangeText={setNote} optional multiline />
          {error ? <Notice tone="danger" body={error} /> : null}
          <Button title="Approve" loading={busy === `approve:${r.id}`} onPress={approve} />
        </View>
      ) : null}
      {mode === 'reject' ? (
        <View style={styles.block}>
          <View style={styles.chipsWrap}>
            {REJECT_REASONS[r.step].map((code) => (
              <Chip key={code} label={code.replace(/_/g, ' ')} selected={reason === code} onPress={() => setReason(code)} />
            ))}
          </View>
          {reason ? (
            <Text variant="small" tone="muted">
              Participant sees: “{strings.coffee.reasons[reason]}”
            </Text>
          ) : null}
          <Input label="Note to participant" value={note} onChangeText={setNote} optional={reason !== 'other'} multiline />
          {error ? <Notice tone="danger" body={error} /> : null}
          <Button title="Reject" variant="danger" loading={busy === `reject:${r.id}`} onPress={reject} />
        </View>
      ) : null}
      {mode === 'pay' ? (
        <View style={styles.block}>
          <View style={styles.chipsWrap}>
            {(['paypal', 'sepa', 'other'] as const).map((m) => (
              <Chip key={m} label={m} selected={payMethod === m} onPress={() => setPayMethod(m)} />
            ))}
          </View>
          <View style={styles.fields}>
            <View style={styles.field}>
              <Input label="Amount sent (€)" value={amount} onChangeText={setAmount} inputMode="decimal" />
            </View>
            <View style={styles.field}>
              <Input label="Transaction reference" value={reference} onChangeText={setReference} optional />
            </View>
          </View>
          {error ? <Notice tone="danger" body={error} /> : null}
          <Button title="Record payment" loading={busy === `pay:${r.id}`} onPress={pay} />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  card: {
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  block: {
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  fields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  field: {
    flexGrow: 1,
    flexBasis: 200,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  checks: {
    gap: spacing.xs,
  },
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  review: {
    gap: 2,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
