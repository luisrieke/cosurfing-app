import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Chip, Input, Notice, Skeleton, Text } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { formatDateTime } from '@/lib/format';
import { adminDecideContentReport, adminGetContentReports } from '@/lib/queries';
import { menuUrl, previewUrl } from '@/lib/storage';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import type { ContentReport, ModerationReason } from '@/lib/types';

const MODERATION_REASONS = Object.keys(strings.moderationReasons) as ModerationReason[];

function imageFor(r: ContentReport): string | null {
  if (!r.content_image) return null;
  if (r.target_type === 'photo') return previewUrl(r.content_image);
  if (r.target_type === 'menu') return menuUrl(r.content_image);
  return null;
}

export function ContentReports({ filter }: { filter: 'open' | 'resolved' | 'all' }) {
  const reports = useQuery('admin-content-reports', adminGetContentReports);
  const rows = (reports.data ?? []).filter((r) => filter === 'all' || (filter === 'open' ? r.status === 'open' : r.status !== 'open'));

  return (
    <View style={styles.list}>
      <Text variant="bodyStrong">{strings.admin.contentReports}</Text>
      <Text variant="small" tone="muted">
        {strings.admin.contentReportsHint}
      </Text>
      {reports.loading && !reports.data ? (
        <Skeleton height={80} />
      ) : reports.error ? (
        <Notice tone="danger" body={reports.error.message} />
      ) : rows.length === 0 ? (
        <Text tone="muted">{strings.admin.noItems}</Text>
      ) : (
        rows.map((r) => <ContentReportCard key={r.id} report={r} onDone={() => void reports.refetch()} />)
      )}
    </View>
  );
}

function ContentReportCard({ report: r, onDone }: { report: ContentReport; onDone: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState<ModerationReason>(r.reason === 'other' ? 'rules' : (r.reason as ModerationReason));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'remove' | 'keep' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const image = imageFor(r);

  const decide = async (decision: 'remove' | 'keep') => {
    setBusy(decision);
    setError(null);
    try {
      await adminDecideContentReport(r.id, decision, reason, note);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.meta}>
        <Badge label={strings.contentReport.targets[r.target_type]} tone="accent" />
        <Badge label={strings.contentReport.reasons[r.reason]} tone="danger" />
        <Badge label={r.status} tone={r.status === 'open' ? 'warning' : 'success'} />
        <Text variant="caption" tone="faint">
          {formatDateTime(r.created_at)} · {r.reporter_is_user ? strings.admin.reporterMember : strings.admin.reporterGuest}
        </Text>
      </View>
      <Text>{r.body}</Text>
      <View style={styles.content}>
        {image ? <Image source={{ uri: image }} style={styles.image} contentFit="cover" /> : null}
        <View style={styles.flex}>
          <Text variant="caption" tone="muted">
            {r.content_exists ? `${strings.admin.reportedContent}${r.author_name ? ` · ${r.author_name}` : ''}` : strings.admin.contentGone}
          </Text>
          {r.content_text ? <Text variant="small">{r.content_text}</Text> : null}
          <View style={styles.row}>
            {r.place_slug ? <Button title="Open place" size="sm" variant="ghost" onPress={() => router.push(`/place/${r.place_slug}`)} /> : null}
            {r.author_id ? <Button title={strings.account.viewProfile} size="sm" variant="ghost" onPress={() => router.push(`/u/${r.author_id}`)} /> : null}
          </View>
        </View>
      </View>
      {r.status === 'open' ? (
        <>
          <Text variant="smallStrong">{strings.admin.decisionReason}</Text>
          <View style={styles.row}>
            {MODERATION_REASONS.map((m) => (
              <Chip key={m} label={strings.moderationReasons[m]} selected={reason === m} onPress={() => setReason(m)} />
            ))}
          </View>
          <Input value={note} onChangeText={setNote} placeholder={strings.admin.decisionNotePlaceholder} multiline maxLength={1000} />
          {error ? <Notice tone="danger" body={error} /> : null}
          <View style={styles.row}>
            <Button title={strings.admin.removeContent} size="sm" variant="danger" loading={busy === 'remove'} disabled={!r.content_exists} onPress={() => void decide('remove')} />
            <Button title={strings.admin.keepContent} size="sm" variant="secondary" loading={busy === 'keep'} onPress={() => void decide('keep')} />
          </View>
        </>
      ) : (
        <Text variant="caption" tone="muted">
          {`${r.status === 'removed' ? strings.admin.removeContent : strings.admin.keepContent}${r.decision_reason ? ` · ${strings.moderationReasons[r.decision_reason]}` : ''}${r.decision_note ? ` · ${r.decision_note}` : ''}${r.decided_at ? ` · ${formatDateTime(r.decided_at)}` : ''}`}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
  card: {
    gap: spacing.sm,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  content: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.bgMuted,
  },
  image: {
    width: 96,
    height: 72,
    borderRadius: radius.md,
  },
  flex: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
