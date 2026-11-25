import { useState } from 'react';
import { Alert, Platform, Share, StyleSheet, View } from 'react-native';

import { Badge, Button, Input, Notice, Section, Text } from '@/components/ui';
import { useNow } from '@/hooks/useNow';
import { useQuery } from '@/hooks/useQuery';
import { formatDate } from '@/lib/format';
import {
  adminCreateOwnerInvite,
  adminDeleteOwnerInvite,
  adminGetOwnerInvites,
  adminGetPlaceOwners,
  adminRemovePlaceOwner,
  type AdminOwnerInvite,
} from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import { ownerInviteUrl } from '@/lib/venueLink';

function confirm(message: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(message)) onYes();
    return;
  }
  Alert.alert(message, undefined, [
    { text: strings.common.cancel, style: 'cancel' },
    { text: strings.common.delete, style: 'destructive', onPress: onYes },
  ]);
}

/** Invite links and current owners of a place, in the admin place editor. */
export function AdminPlaceOwners({ placeId, published }: { placeId: string; published: boolean }) {
  const a = strings.owner.admin;
  const owners = useQuery(`admin-place-owners:${placeId}`, () => adminGetPlaceOwners(placeId));
  const invites = useQuery(`admin-owner-invites:${placeId}`, () => adminGetOwnerInvites(placeId));
  const [sentTo, setSentTo] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const nowDate = useNow();

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(null);
    }
  };

  const copy = async (invite: AdminOwnerInvite) => {
    const url = ownerInviteUrl(invite.token);
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      setCopied(invite.id);
      setTimeout(() => setCopied(null), 2000);
      return;
    }
    await Share.share({ message: url });
  };

  const create = () =>
    run('create', async () => {
      const invite = await adminCreateOwnerInvite(placeId, sentTo);
      setSentTo('');
      await invites.refetch(true);
      await copy(invite).catch(() => undefined);
    });

  const now = nowDate.getTime();
  return (
    <Section title={a.section}>
      <Text variant="small" tone="muted">
        {a.sectionHint}
      </Text>
      {!published ? <Notice tone="warning" body={a.unpublishedNote} /> : null}
      {error ? <Notice tone="danger" body={error} /> : null}

      <Text variant="smallStrong">{a.owners}</Text>
      {(owners.data ?? []).length === 0 ? (
        <Text variant="small" tone="faint">
          {a.noOwners}
        </Text>
      ) : (
        (owners.data ?? []).map((ow) => (
          <View key={ow.user_id} style={styles.row}>
            <View style={styles.flex}>
              <Text variant="small">{ow.email ?? ow.user_id}</Text>
              <Text variant="caption" tone="muted">
                {[ow.display_name, formatDate(ow.created_at)].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Button
              title={a.remove}
              size="sm"
              variant="ghost"
              icon="user-x"
              loading={busy === ow.user_id}
              onPress={() => confirm(a.removeConfirm, () => void run(ow.user_id, async () => {
                await adminRemovePlaceOwner(placeId, ow.user_id);
                await owners.refetch(true);
              }))}
            />
          </View>
        ))
      )}

      <Text variant="smallStrong">{a.invites}</Text>
      {(invites.data ?? []).map((inv) => {
        const expired = !inv.accepted_at && new Date(inv.expires_at).getTime() < now;
        return (
          <View key={inv.id} style={styles.row}>
            <View style={styles.flex}>
              <Text variant="small" selectable numberOfLines={1}>
                {ownerInviteUrl(inv.token)}
              </Text>
              <View style={styles.meta}>
                {inv.accepted_at ? (
                  <Badge label={a.inviteAccepted(formatDate(inv.accepted_at))} tone="success" />
                ) : expired ? (
                  <Badge label={a.inviteExpired} tone="neutral" />
                ) : (
                  <Badge label={a.inviteOpen(formatDate(inv.expires_at))} tone="accent" />
                )}
                {inv.sent_to ? (
                  <Text variant="caption" tone="muted">
                    {inv.sent_to}
                  </Text>
                ) : null}
              </View>
            </View>
            {!inv.accepted_at && !expired ? (
              <Button title={copied === inv.id ? a.copied : a.copy} size="sm" variant="secondary" icon="copy" onPress={() => void copy(inv)} />
            ) : null}
            <Button
              title={a.revoke}
              size="sm"
              variant="ghost"
              icon="trash-2"
              loading={busy === inv.id}
              onPress={() => void run(inv.id, async () => {
                await adminDeleteOwnerInvite(inv.id);
                await invites.refetch(true);
              })}
            />
          </View>
        );
      })}

      <View style={styles.create}>
        <View style={styles.flex}>
          <Input label={a.sentTo} value={sentTo} onChangeText={setSentTo} placeholder={a.sentToPlaceholder} autoCapitalize="none" keyboardType="email-address" />
        </View>
        <Button title={a.create} icon="link" loading={busy === 'create'} onPress={() => void create()} style={styles.selfEnd} />
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: 2,
  },
  create: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
    minWidth: 200,
  },
  selfEnd: {
    alignSelf: 'flex-end',
  },
});
