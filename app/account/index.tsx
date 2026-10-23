import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { RequireAuth } from '@/components/RequireAuth';
import { Stars } from '@/components/Reviews';
import { Badge, Button, Card, CategoryBadge, Icon, Input, Notice, Screen, Section, Skeleton, Text, TopBar } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { getFavoritePlaces, getMyReviews, updateDisplayName } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';

export default function AccountRoute() {
  return (
    <RequireAuth title={strings.account.title} message={strings.auth.title} redirect="/account">
      <AccountScreen />
    </RequireAuth>
  );
}

function AccountScreen() {
  const router = useRouter();
  const { user, profile, isPlus, isAdmin, entitlement, favoriteIds, refresh, signOut } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [syncedName, setSyncedName] = useState(profile?.display_name ?? null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const favorites = useQuery(`favorites:${user?.id}:${favoriteIds.size}`, () => getFavoritePlaces(user!.id), Boolean(user));
  const reviews = useQuery(`my-reviews:${user?.id}`, () => getMyReviews(user!.id), Boolean(user));

  // Re-sync the input when the profile (re)loads, without an effect.
  const profileName = profile?.display_name ?? null;
  if (profileName !== syncedName) {
    setSyncedName(profileName);
    setName(profileName ?? '');
  }

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateDisplayName(user.id, name);
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Head>
        <title>Account · Cosurfing</title>
      </Head>
      <TopBar title={strings.account.title} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />

      <Card style={styles.plusCard}>
        <View style={styles.plusRow}>
          <View style={[styles.plusIcon, { backgroundColor: isPlus ? colors.plus : colors.bgMuted }]}>
            <Icon name="star" size={18} color={isPlus ? colors.onAccent : colors.textMuted} />
          </View>
          <View style={styles.plusText}>
            <Text variant="bodyStrong">{isPlus ? strings.account.plusActive : strings.account.plusInactive}</Text>
            <Text variant="small" tone="muted">
              {isPlus && entitlement?.current_period_end
                ? entitlement.cancel_at_period_end
                  ? strings.plus.endsOn(formatDate(entitlement.current_period_end))
                  : strings.plus.renews(formatDate(entitlement.current_period_end))
                : user?.email}
            </Text>
          </View>
        </View>
        <Button
          title={isPlus ? strings.account.managePlus : strings.account.getPlus}
          variant={isPlus ? 'secondary' : 'plus'}
          onPress={() => router.push('/plus')}
        />
      </Card>

      <Section title={strings.account.displayName}>
        <Input
          value={name}
          onChangeText={setName}
          placeholder="e.g. Luis"
          hint={strings.account.displayNameHint}
          maxLength={40}
          autoCapitalize="words"
        />
        <View style={styles.row}>
          <Button title={strings.common.save} variant="secondary" size="sm" loading={saving} onPress={save} />
          {saved ? (
            <Text variant="small" tone="success">
              {strings.account.saved}
            </Text>
          ) : null}
        </View>
      </Section>

      <Section title={strings.account.favorites}>
        {favorites.loading && !favorites.data ? (
          <Skeleton height={56} />
        ) : favorites.error ? (
          <Notice tone="danger" body={favorites.error.message} />
        ) : (favorites.data ?? []).length === 0 ? (
          <Text tone="muted">{strings.account.noFavorites}</Text>
        ) : (
          <View style={styles.list}>
            {favorites.data!.map((p) => (
              <Pressable key={p.id} style={styles.listRow} onPress={() => router.push(`/place/${p.slug}`)} accessibilityRole="link">
                <View style={styles.listText}>
                  <Text variant="bodyStrong">{p.name}</Text>
                  <Text variant="small" tone="muted" numberOfLines={1}>
                    {p.address ?? ''}
                  </Text>
                </View>
                <CategoryBadge category={p.category} />
              </Pressable>
            ))}
          </View>
        )}
      </Section>

      <Section title={strings.account.myReviews}>
        {reviews.loading && !reviews.data ? (
          <Skeleton height={56} />
        ) : reviews.error ? (
          <Notice tone="danger" body={reviews.error.message} />
        ) : (reviews.data ?? []).length === 0 ? (
          <Text tone="muted">{strings.account.noReviews}</Text>
        ) : (
          <View style={styles.list}>
            {reviews.data!.map((r) => (
              <Pressable key={r.id} style={styles.listRow} onPress={() => router.push(`/place/${r.place.slug}/review`)} accessibilityRole="link">
                <View style={styles.listText}>
                  <Text variant="bodyStrong">{r.place.name}</Text>
                  <View style={styles.row}>
                    <Stars value={r.rating} size={12} />
                    <Text variant="caption" tone="muted">
                      {formatDate(r.updated_at)}
                    </Text>
                    {r.status === 'hidden' ? <Badge label="Hidden" tone="danger" /> : null}
                  </View>
                </View>
                <Icon name="edit-3" size={16} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        )}
      </Section>

      {isAdmin ? (
        <Button title={strings.account.admin} variant="secondary" icon="shield" onPress={() => router.push('/admin')} />
      ) : null}

      <View style={styles.footer}>
        <Button title={strings.common.signOut} variant="ghost" icon="log-out" onPress={() => signOut().then(() => router.replace('/'))} />
        <Text variant="caption" tone="faint">
          {strings.account.deleteAccountHint}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  plusCard: {
    gap: spacing.lg,
  },
  plusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  plusIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusText: {
    flex: 1,
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  list: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listText: {
    flex: 1,
    gap: 2,
  },
  footer: {
    gap: spacing.sm,
    paddingTop: spacing.lg,
  },
});
