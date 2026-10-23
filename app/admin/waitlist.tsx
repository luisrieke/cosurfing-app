import Head from 'expo-router/head';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdminList, AdminRow, AdminShell } from '@/components/admin/AdminShell';
import { Badge, Button, Chip, Notice, Skeleton, Text } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { exportCsv, toCsv } from '@/lib/csv';
import { formatDate, formatDateTime } from '@/lib/format';
import { adminGetWaitlistEntries, adminGetWaitlistSummary } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, spacing } from '@/lib/theme';
import type { WaitlistEntry } from '@/lib/types';
import { retryAmbassadorEmail, WaitlistApiError } from '@/lib/waitlistApi';

type StatusFilter = 'all' | 'verified' | 'pending' | 'left';

export default function AdminWaitlist() {
  const { isAdmin } = useAuth();
  const summary = useQuery('admin-waitlist-summary', adminGetWaitlistSummary, isAdmin);
  const [cityId, setCityId] = useState<string | null>(null);
  const entries = useQuery(`admin-waitlist:${cityId}`, () => adminGetWaitlistEntries(cityId!), Boolean(cityId) && isAdmin);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger' | 'warning'; text: string } | null>(null);

  const selected = (summary.data ?? []).find((s) => s.city.id === cityId) ?? null;
  const rows = (entries.data ?? []).filter((e) => filter === 'all' || e.status === filter);

  const download = async () => {
    if (!selected) return;
    const csv = toCsv(
      ['email', 'first_name', 'status', 'verified_at', 'ambassador_email_status', 'ambassador_email_sent_at', 'created_at', 'city', 'country'],
      (entries.data ?? []).map((e) => [
        e.email,
        e.first_name,
        e.status,
        e.verified_at,
        e.ambassador_email_status,
        e.ambassador_email_sent_at,
        e.created_at,
        selected.city.name,
        selected.city.country_code,
      ]),
    );
    await exportCsv(`cosurfing-waitlist-${selected.city.slug}.csv`, csv);
  };

  const retry = async (entry: WaitlistEntry) => {
    setBusy(entry.id);
    setMessage(null);
    try {
      const res = await retryAmbassadorEmail(entry.id);
      if (res.status === 'sent') setMessage({ tone: 'success', text: strings.admin.emailSent });
      else if (res.status === 'failed') setMessage({ tone: 'danger', text: strings.admin.emailFailed });
      else setMessage({ tone: 'warning', text: `Skipped (${res.status}).` });
      await entries.refetch();
      await summary.refetch();
    } catch (e) {
      const code = e instanceof WaitlistApiError ? e.code : 'server_error';
      setMessage({ tone: 'danger', text: code === 'email_not_configured' ? strings.admin.emailServiceMissing : `${strings.common.somethingWentWrong} (${code})` });
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminShell title={strings.admin.waitlist}>
      <Head>
        <title>Waiting lists · Admin · Cosurfing</title>
      </Head>
      {summary.loading && !summary.data ? (
        <Skeleton height={80} />
      ) : summary.error ? (
        <Notice tone="danger" body={summary.error.message} />
      ) : (
        <View style={styles.chips}>
          {(summary.data ?? [])
            .filter((s) => s.verified + s.pending + s.left > 0 || s.city.status === 'waitlist')
            .map((s) => (
              <Chip
                key={s.city.id}
                label={`${s.city.name} (${s.verified})${s.failedEmails > 0 ? ' !' : ''}`}
                selected={cityId === s.city.id}
                onPress={() => {
                  setCityId(s.city.id);
                  setFilter('all');
                  setMessage(null);
                }}
              />
            ))}
          {(summary.data ?? []).every((s) => s.verified + s.pending + s.left === 0) ? <Text tone="muted">{strings.admin.noItems}</Text> : null}
        </View>
      )}

      {selected ? (
        <>
          <View style={styles.header}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="heading">
                {selected.city.name}, {selected.city.country_name}
              </Text>
              <Text variant="small" tone="muted">
                {selected.verified} {strings.admin.verified} · {selected.pending} {strings.admin.pending} · {selected.left} {strings.admin.left}
                {selected.failedEmails > 0 ? ` · ${selected.failedEmails} failed emails` : ''}
              </Text>
            </View>
            <Button title={strings.admin.exportCsv} size="sm" variant="secondary" icon="download" onPress={download} disabled={!entries.data?.length} />
          </View>
          <View style={styles.chips}>
            {(['all', 'verified', 'pending', 'left'] as StatusFilter[]).map((f) => (
              <Chip key={f} label={f} selected={filter === f} onPress={() => setFilter(f)} />
            ))}
          </View>
          {message ? <Notice tone={message.tone} body={message.text} /> : null}
          {entries.loading && !entries.data ? (
            <Skeleton height={80} />
          ) : entries.error ? (
            <Notice tone="danger" body={entries.error.message} />
          ) : rows.length === 0 ? (
            <Text tone="muted">{strings.admin.noItems}</Text>
          ) : (
            <AdminList>
              {rows.map((e) => (
                <AdminRow
                  key={e.id}
                  title={e.email}
                  subtitle={[e.first_name, `joined ${formatDate(e.created_at)}`, e.verified_at ? `verified ${formatDateTime(e.verified_at)}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                  meta={
                    <>
                      <Badge label={e.status} tone={e.status === 'verified' ? 'success' : e.status === 'pending' ? 'warning' : 'neutral'} />
                      {e.status === 'verified' ? (
                        <Badge
                          label={
                            e.ambassador_email_status === 'sent'
                              ? strings.admin.emailSent
                              : e.ambassador_email_status === 'failed'
                                ? strings.admin.emailFailed
                                : strings.admin.emailNotSent
                          }
                          tone={e.ambassador_email_status === 'sent' ? 'success' : e.ambassador_email_status === 'failed' ? 'danger' : 'neutral'}
                        />
                      ) : null}
                      {e.ambassador_email_error ? (
                        <Text variant="caption" tone="danger" numberOfLines={2} style={{ flexBasis: '100%' }}>
                          {e.ambassador_email_error}
                        </Text>
                      ) : null}
                    </>
                  }
                  right={
                    e.status === 'verified' && e.ambassador_email_status !== 'sent' ? (
                      <Button title={strings.admin.retryEmail} size="sm" variant="secondary" icon="send" loading={busy === e.id} onPress={() => retry(e)} />
                    ) : (
                      <View />
                    )
                  }
                />
              ))}
            </AdminList>
          )}
        </>
      ) : summary.data && summary.data.length > 0 ? (
        <Text tone="muted">Pick a city to see its entries.</Text>
      ) : null}
      <Text variant="caption" tone="faint" style={styles.footnote}>
        Entries are written only by the waitlist function (double opt-in). The ambassador email is sent once per verified entry; retries only
        run for entries that are not marked as sent.
      </Text>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footnote: {
    paddingTop: spacing.md,
  },
});
