import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { SignupGate } from '@/components/SignupGate';
import { Button, Icon, type IconName, Section, Skeleton, Text } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { env } from '@/lib/env';
import { hostFromUrl, liveWebsite } from '@/lib/format';
import { getPlaceContacts } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { placeFormParams, tallyUrl } from '@/lib/tally';
import { colors, radius, spacing } from '@/lib/theme';
import type { City, Place, PlaceContacts } from '@/lib/types';

interface ContactRow {
  key: string;
  icon: IconName;
  label: string;
  value: string;
  url: string;
}

function contactRows(place: Place, c: PlaceContacts | null): ContactRow[] {
  const s = strings.contact;
  const rows: ContactRow[] = [];
  if (c?.phone) rows.push({ key: 'phone', icon: 'phone', label: s.phone, value: c.phone, url: `tel:${c.phone.replace(/[^\d+]/g, '')}` });
  if (c?.email) rows.push({ key: 'email', icon: 'mail', label: s.email, value: c.email, url: `mailto:${c.email}` });
  const website = liveWebsite(place);
  if (website) rows.push({ key: 'website', icon: 'globe', label: s.website, value: hostFromUrl(website), url: website });
  if (c?.instagram) {
    rows.push({ key: 'instagram', icon: 'instagram', label: s.instagram, value: `@${c.instagram}`, url: `https://www.instagram.com/${c.instagram}/` });
  }
  if (c?.facebook) {
    const path = c.facebook.replace(/^https?:\/\/([a-z-]+\.)?(facebook|fb)\.com\//i, '');
    rows.push({ key: 'facebook', icon: 'facebook', label: s.facebook, value: path || c.facebook, url: c.facebook });
  }
  if (c?.whatsapp) {
    rows.push({ key: 'whatsapp', icon: 'message-circle', label: s.whatsapp, value: `+${c.whatsapp}`, url: `https://wa.me/${c.whatsapp}` });
  }
  if (c?.tiktok) {
    rows.push({ key: 'tiktok', icon: 'music', label: s.tiktok, value: `@${c.tiktok}`, url: `https://www.tiktok.com/@${c.tiktok}` });
  }
  return rows;
}

/** Last block of the place page: contact details and a reach-out form, for signed-in users only. */
export function PlaceContact({ place, onSuggest }: { place: Place & { city: City }; onSuggest: () => void }) {
  const { user, ready } = useAuth();
  const s = strings.contact;
  const query = useQuery(`contacts:${place.id}:${user?.id ?? ''}`, () => getPlaceContacts(place.id), Boolean(user));

  if (!ready) return null;
  if (!user) {
    return (
      <Section title={s.title}>
        <SignupGate compact title={s.lockedTitle} body={s.lockedBody} />
      </Section>
    );
  }

  const rows = contactRows(place, query.data ?? null);
  const reachOut = () => void Linking.openURL(tallyUrl(env.reachOutFormUrl, placeFormParams(place, user)));

  return (
    <Section title={s.title}>
      <View style={styles.card}>
        {query.loading ? (
          <View style={styles.rows}>
            <Skeleton height={20} width="60%" />
            <Skeleton height={20} width="45%" />
          </View>
        ) : rows.length > 0 ? (
          <View style={styles.rows}>
            {rows.map((r) => (
              <Pressable
                key={r.key}
                onPress={() => void Linking.openURL(r.url)}
                accessibilityRole="link"
                accessibilityLabel={`${r.label}: ${r.value}`}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <Icon name={r.icon} size={16} color={colors.accent} />
                <Text variant="small" tone="muted" style={styles.label}>
                  {r.label}
                </Text>
                <Text variant="smallStrong" style={styles.value} numberOfLines={1}>
                  {r.value}
                </Text>
              </Pressable>
            ))}
            <Text variant="caption" tone="faint">
              {s.body}
            </Text>
          </View>
        ) : (
          <Text variant="small" tone="muted">
            {s.empty}
          </Text>
        )}
        <View style={styles.divider} />
        <Text variant="small" tone="muted">
          {s.reachOutHint}
        </Text>
        <View style={styles.actions}>
          <Button title={s.reachOut(place.name)} icon="send" onPress={reachOut} />
          <Button title={s.suggest} icon="edit-3" variant="ghost" size="sm" onPress={onSuggest} />
        </View>
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSubtle,
  },
  rows: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  pressed: {
    opacity: 0.6,
  },
  label: {
    width: 84,
  },
  value: {
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
