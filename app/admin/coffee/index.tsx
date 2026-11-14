import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdminList, AdminRow, AdminShell } from '@/components/admin/AdminShell';
import { STATUS_TONE } from '@/components/coffee/CoffeeSections';
import { Badge, Button, Card, Chip, Input, Notice, Skeleton, Text } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import {
  COFFEE_STEPS,
  type CoffeeAdminOverview,
  type CoffeeAdminRow,
  type CoffeeCampaignStatus,
  type CoffeeSpotStatus,
  coffeeAdmin,
  coffeeAdminError as adminCoffeeError,
  formatEuros,
} from '@/lib/coffee';
import { formatDateTime } from '@/lib/format';
import { strings } from '@/lib/strings';
import { spacing } from '@/lib/theme';

type Filter = 'action' | 'all' | CoffeeSpotStatus;
const FILTERS: Filter[] = ['action', 'all', 'reserved', 'held', 'confirmed', 'waitlisted', 'released'];
const STATUSES: CoffeeCampaignStatus[] = ['draft', 'live', 'paused', 'closed'];
const STEP_SHORT = { contribute: 'Base', new_place: 'Place', spread: 'Share' } as const;

/** YYYY-MM-DD in the admin's time zone, or an empty string. */
function toDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Start of the day (or end of the day) in the admin's time zone. */
function fromDateInput(value: string, endOfDay = false): string | null | 'invalid' {
  const v = value.trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'invalid';
  const d = new Date(`${v}T${endOfDay ? '23:59:59' : '00:00:00'}`);
  return Number.isNaN(d.getTime()) ? 'invalid' : d.toISOString();
}

export default function AdminCoffee() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const overview = useQuery('admin-coffee-overview', coffeeAdmin.overview, isAdmin);
  const list = useQuery('admin-coffee-list', coffeeAdmin.list, isAdmin);
  const [filter, setFilter] = useState<Filter>('action');
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase().replace(/^@/, '');
  const rows = (list.data ?? []).filter((r) =>
    q
      ? [r.code, r.social_handle, r.email, r.display_name].some((v) => v?.toLowerCase().includes(q))
      : filter === 'all'
        ? true
        : filter === 'action'
          ? r.needs_action
          : r.spot_status === filter,
  );

  return (
    <AdminShell title="Coffee program">
      <Head>
        <title>Coffee program · Admin · Cosurfing</title>
      </Head>
      {overview.error ? <Notice tone="danger" body={adminCoffeeError(overview.error)} /> : null}
      {overview.data ? (
        <>
          <Stats o={overview.data} />
          <CampaignSettings
            key={overview.data.campaign.updated_at}
            o={overview.data}
            onSaved={() => {
              void overview.refetch(true);
              void list.refetch(true);
            }}
          />
        </>
      ) : overview.loading ? (
        <Skeleton height={160} />
      ) : null}

      <Input
        label="Find a participant"
        value={search}
        onChangeText={setSearch}
        placeholder="Code from the message (CS-…), username or email"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.chips}>
        {FILTERS.map((f) => (
          <Chip
            key={f}
            label={f === 'action' ? `Needs action (${(list.data ?? []).filter((r) => r.needs_action).length})` : f}
            selected={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </View>
      {list.error ? <Notice tone="danger" body={adminCoffeeError(list.error)} /> : null}
      {list.loading && !list.data ? (
        <Skeleton height={120} />
      ) : rows.length === 0 ? (
        <Text tone="muted">{strings.admin.noItems}</Text>
      ) : (
        <AdminList>
          {rows.map((r) => (
            <ParticipantRow key={r.participant_id} row={r} onPress={() => router.push(`/admin/coffee/${r.participant_id}`)} />
          ))}
        </AdminList>
      )}
    </AdminShell>
  );
}

function ParticipantRow({ row, onPress }: { row: CoffeeAdminRow; onPress: () => void }) {
  return (
    <AdminRow
      icon="coffee"
      title={`${row.code} · ${row.display_name ? `${row.display_name} · ${row.email}` : row.email}`}
      subtitle={`${row.social_handle ? `${row.social_channel} @${row.social_handle} · ` : ''}${row.spot_status}${row.released_reason ? ` (${row.released_reason})` : ''}${
        row.reserved_until && row.spot_status === 'reserved' ? ` until ${formatDateTime(row.reserved_until)}` : ''
      } · joined ${formatDateTime(row.joined_at)}${row.last_submitted_at ? ` · last proof ${formatDateTime(row.last_submitted_at)}` : ''}`}
      meta={
        <View style={styles.badges}>
          {row.needs_action ? <Badge label="Needs action" tone="accent" /> : null}
          {COFFEE_STEPS.map((step) => {
            const st = row.rewards[step] ?? 'not_started';
            return <Badge key={step} label={`${STEP_SHORT[step]}: ${strings.coffee.status[st]}`} tone={STATUS_TONE[st]} />;
          })}
        </View>
      }
      onPress={onPress}
    />
  );
}

function Stats({ o }: { o: CoffeeAdminOverview }) {
  const items: [string, string][] = [
    ['Spots taken', `${o.spots_taken} / ${o.campaign.max_participants}`],
    ['Confirmed', String(o.participants.confirmed ?? 0)],
    ['Reserved / held', `${o.participants.reserved ?? 0} / ${o.participants.held ?? 0}`],
    ['Waiting list', String(o.participants.waitlisted ?? 0)],
    ['To review', String((o.rewards.submitted ?? 0) + (o.rewards.under_review ?? 0))],
    ['Approved, unpaid', `${o.rewards.approved ?? 0} · ${formatEuros(o.approved_unpaid_cents)}`],
    ['Paid', `${o.rewards.paid ?? 0} · ${formatEuros(o.paid_cents)}`],
    ['Emails queued', String(o.unsent_notices)],
  ];
  return (
    <View style={styles.stats}>
      {items.map(([label, value]) => (
        <Card key={label} style={styles.stat}>
          <Text variant="caption" tone="muted">
            {label}
          </Text>
          <Text variant="heading">{value}</Text>
        </Card>
      ))}
    </View>
  );
}

function CampaignSettings({ o, onSaved }: { o: CoffeeAdminOverview; onSaved: () => void }) {
  const c = o.campaign;
  const [status, setStatus] = useState<CoffeeCampaignStatus>(c.status);
  const [max, setMax] = useState(String(c.max_participants));
  const [starts, setStarts] = useState(toDateInput(c.starts_at));
  const [ends, setEnds] = useState(toDateInput(c.ends_at));
  const [closes, setCloses] = useState(toDateInput(c.submissions_close_at));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const save = async () => {
    setMessage(null);
    const maxN = Number.parseInt(max, 10);
    const s = fromDateInput(starts);
    const e = fromDateInput(ends, true);
    const cl = fromDateInput(closes, true);
    if (!Number.isFinite(maxN) || maxN < 1 || maxN > 500) {
      setMessage({ tone: 'danger', text: 'Max participants must be between 1 and 500.' });
      return;
    }
    if (s === 'invalid' || e === 'invalid' || cl === 'invalid') {
      setMessage({ tone: 'danger', text: 'Dates must look like 2026-12-31.' });
      return;
    }
    setBusy(true);
    try {
      await coffeeAdmin.updateCampaign({ status, maxParticipants: maxN, startsAt: s, endsAt: e, submissionsCloseAt: cl });
      setMessage({ tone: 'success', text: 'Saved.' });
      onSaved();
    } catch (err) {
      setMessage({ tone: 'danger', text: adminCoffeeError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.card}>
      <Text variant="heading">Campaign</Text>
      <Text variant="small" tone="muted">
        Terms version {c.terms_version} · reservations last {c.reservation_days} days · {c.max_attempts} attempts per step, resubmit within{' '}
        {c.resubmit_days} days · max {formatEuros(c.max_coffee_cents)} per coffee
      </Text>
      <View style={styles.chips}>
        {STATUSES.map((st) => (
          <Chip key={st} label={st} selected={status === st} onPress={() => setStatus(st)} />
        ))}
      </View>
      {status === 'closed' && c.status !== 'closed' ? (
        <Notice tone="warning" body="Closing releases all reserved and waiting-list spots. Submitted steps can still be reviewed and approved ones paid." />
      ) : null}
      <View style={styles.fields}>
        <View style={styles.field}>
          <Input label="Max participants" value={max} onChangeText={setMax} keyboardType="number-pad" inputMode="numeric" />
        </View>
        <View style={styles.field}>
          <Input label="Starts (YYYY-MM-DD)" value={starts} onChangeText={setStarts} optional placeholder="right away" />
        </View>
        <View style={styles.field}>
          <Input label="Ends" value={ends} onChangeText={setEnds} optional placeholder="2026-12-31" />
        </View>
        <View style={styles.field}>
          <Input label="Submissions close" value={closes} onChangeText={setCloses} optional placeholder="same as end" />
        </View>
      </View>
      {message ? <Notice tone={message.tone} body={message.text} /> : null}
      <Button title={strings.common.save} onPress={save} loading={busy} />
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  stat: {
    flexGrow: 1,
    flexBasis: 180,
    gap: 2,
  },
  fields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  field: {
    flexGrow: 1,
    flexBasis: 180,
  },
});
