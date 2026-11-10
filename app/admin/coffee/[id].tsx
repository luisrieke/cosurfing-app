import { Image } from 'expo-image';
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
  type CoffeeAdminDetail,
  type CoffeeAdminEvidence,
  type CoffeeAdminReward,
  coffeeAdmin,
  coffeeAdminError as adminCoffeeError,
  formatEuros,
} from '@/lib/coffee';
import { formatDate, formatDateTime } from '@/lib/format';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';

const STEP_TITLE = { contribute: 'Step 1 · Contribute', new_place: 'Step 2 · New place', spread: 'Step 3 · Spread the word' } as const;

const REJECT_REASONS: Record<CoffeeAdminReward['step'], string[]> = {
  contribute: ['low_effort', 'not_authentic', 'evidence_missing', 'receipt_invalid', 'receipt_reused', 'not_coffee', 'other'],
  new_place: ['place_exists', 'place_inaccurate', 'evidence_missing', 'receipt_invalid', 'receipt_reused', 'not_coffee', 'other'],
  spread: ['referral_invalid', 'post_invalid', 'evidence_missing', 'receipt_invalid', 'receipt_reused', 'not_coffee', 'other'],
};

/** Signals computed when the proof arrived. `bad` ones are a warning when true. */
const CHECKS: Record<string, { label: string; bad?: boolean }> = {
  receipt_attached: { label: 'Receipt attached' },
  receipt_reused: { label: 'Receipt file seen before', bad: true },
  claimed_over_cap: { label: 'Claimed more than the cap', bad: true },
  review_found: { label: 'Review with 120+ characters since joining' },
  photo_found: { label: 'Photo uploaded since joining' },
  visit_date_plausible: { label: 'Visit date within the last 30 days and after joining' },
  location_screenshot: { label: 'Location screenshot attached' },
  review_screenshot: { label: 'Review screenshot attached' },
  photos_screenshot: { label: 'Photos screenshot attached' },
  suggestion_found: { label: 'Place suggestion since joining' },
  place_screenshot: { label: 'Suggestion screenshot attached' },
  referral_account_found: { label: 'Friend’s account exists' },
  referral_not_self: { label: 'Friend is not the participant' },
  referral_created_after_join: { label: 'Friend’s account created after joining' },
  referral_unused: { label: 'Friend not used for another referral' },
  referral_not_participant_pair: { label: 'Not a mutual referral' },
  post_url_https: { label: 'Post link is a public https URL' },
  post_not_cosurfing: { label: 'Post link is not on cosurfing.app' },
  share_screenshot: { label: 'Post screenshot attached' },
};

const KIND_LABEL: Record<string, string> = {
  review_screenshot: 'Review',
  photos_screenshot: 'Photos',
  location_screenshot: 'Location',
  receipt: 'Receipt',
  place_screenshot: 'Place suggestion',
  share_screenshot: 'Post',
};

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
  const [urls, setUrls] = useState<Record<string, string> | null>(null);
  const [loadingUrls, setLoadingUrls] = useState(false);
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

  const loadEvidence = async () => {
    setLoadingUrls(true);
    setMessage(null);
    try {
      setUrls(await coffeeAdmin.evidenceUrls(id!));
    } catch (e) {
      setMessage({ tone: 'danger', text: adminCoffeeError(e) });
    } finally {
      setLoadingUrls(false);
    }
  };

  const d = detail.data;
  const p = d?.participant;

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
                <Text variant="heading">{p.display_name ?? p.email}</Text>
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
              <Button
                title="Delete proof files now"
                size="sm"
                variant="ghost"
                loading={busy === 'purge'}
                onPress={() => confirm('Delete all uploaded proof files of this participant now?', () => void run('purge', () => coffeeAdmin.participant(p.id, 'purge_evidence'), 'Files are deleted within 10 minutes.'))}
              />
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

          <Card style={styles.card}>
            <View style={styles.header}>
              <Text variant="heading" style={styles.flex}>
                Proof files ({d.evidence.filter((e) => e.available).length})
              </Text>
              <Button title={urls ? 'Reload links' : 'Show files'} size="sm" variant="secondary" icon="eye" loading={loadingUrls} onPress={loadEvidence} />
            </View>
            <Text variant="small" tone="muted">
              Receipts and location screenshots are sensitive. Opening them is logged; links expire after 5 minutes.
            </Text>
            <View style={styles.evidence}>
              {d.evidence.map((e) => (
                <EvidenceTile key={e.id} e={e} url={urls?.[e.id]} />
              ))}
            </View>
          </Card>

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

          <Card style={styles.card}>
            <Text variant="heading">Form submissions</Text>
            {d.submissions.length === 0 ? <Text tone="muted">None yet.</Text> : null}
            {d.submissions.map((sub) => (
              <View key={sub.id} style={styles.submission}>
                <Text variant="smallStrong">
                  {formatDateTime(sub.received_at)} · {sub.status} · steps: {sub.steps.join(', ') || 'none'}
                </Text>
                {Object.entries(sub.ignored ?? {}).map(([step, why]) => (
                  <Text key={step} variant="small" tone="danger">
                    Ignored {step}: {why}
                  </Text>
                ))}
                {Object.entries(sub.answers ?? {}).map(([k, v]) => (
                  <Text key={k} variant="small">
                    <Text variant="small" tone="muted">
                      {k}:{' '}
                    </Text>
                    {String(v ?? '')}
                  </Text>
                ))}
              </View>
            ))}
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

function EvidenceTile({ e, url }: { e: CoffeeAdminEvidence; url?: string }) {
  const isImage = /^image\/(jpeg|png|webp)$/.test(e.mime_type ?? '');
  return (
    <View style={styles.tile}>
      {url && isImage ? (
        <Pressable onPress={() => void Linking.openURL(url)} accessibilityRole="link" accessibilityLabel={`Open ${KIND_LABEL[e.kind] ?? e.kind}`}>
          <Image source={{ uri: url }} style={styles.thumb} contentFit="cover" />
        </Pressable>
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>
          <Icon name={e.available ? 'file' : 'trash-2'} size={22} color={colors.textMuted} />
        </View>
      )}
      <Text variant="caption">
        {STEP_TITLE[e.step].split(' · ')[0]} · {KIND_LABEL[e.kind] ?? e.kind}
      </Text>
      {e.duplicate_of ? (
        <Text variant="caption" tone="danger">
          {e.duplicate_user_is_other ? 'Same file as another participant' : 'Same file sent before'}
        </Text>
      ) : null}
      <Text variant="caption" tone="faint">
        {e.available ? `Deleted on ${formatDate(e.purge_after)}` : 'Deleted'}
      </Text>
      {url && !isImage ? (
        <Text variant="caption" tone="accent" onPress={() => void Linking.openURL(url)} accessibilityRole="link">
          Open file
        </Text>
      ) : null}
    </View>
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
  const [amount, setAmount] = useState(((Math.min(r.claimed_cents ?? max, max)) / 100).toFixed(2));
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState('');
  const [total, setTotal] = useState('');
  const [number, setNumber] = useState('');
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [payMethod, setPayMethod] = useState<'paypal' | 'sepa' | 'other'>(detail.payout_details?.method ?? 'paypal');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reviewable = r.status === 'submitted' || r.status === 'under_review';
  const checks = Object.entries(r.checks ?? {}).filter(([k]) => k !== 'mode');
  const payout = detail.payout_details;

  const approve = () => {
    setError(null);
    const cents = parseEuros(amount);
    const totalCents = parseEuros(total);
    if (!cents || cents < 1 || cents > max) return setError('Amount must be between €0.01 and €5.');
    if (!merchant.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !totalCents) return setError('Enter venue, date (YYYY-MM-DD) and total from the receipt.');
    if (cents > totalCents) return setError('The amount cannot be higher than the receipt total.');
    void run(`approve:${r.id}`, () => coffeeAdmin.approve(r.id, { cents, note, merchant: merchant.trim(), date, totalCents, receiptNumber: number.trim() }), 'Approved. The participant is asked for payout details.').then(() => setMode(null));
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
        {r.submitted_at ? ` · sent ${formatDateTime(r.submitted_at)}` : ''}
        {r.claimed_cents !== null ? ` · claimed ${formatEuros(r.claimed_cents)}` : ''}
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
          {checks.map(([k, v]) => {
            const meta = CHECKS[k] ?? { label: k };
            const ok = meta.bad ? v === false : v === true;
            return (
              <View key={k} style={styles.check}>
                <Icon name={ok ? 'check-circle' : 'alert-triangle'} size={14} color={ok ? colors.success : colors.warning} />
                <Text variant="small" style={styles.flex}>
                  {meta.label}
                  {meta.bad ? (v ? ': yes' : ': no') : ''}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
      {r.step === 'contribute' && reviewable ? (
        <Notice tone="info" body="Check: own visit, ≥3 work criteria covered, ≥2 own photos, receipt matches venue and date, coffee only. The rating does not matter. A location screenshot is not proof on its own." />
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
  evidence: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  tile: {
    width: 150,
    gap: 2,
  },
  thumb: {
    width: 150,
    height: 150,
    borderRadius: radius.md,
    backgroundColor: colors.bgMuted,
  },
  thumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  review: {
    gap: 2,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  submission: {
    gap: 2,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
