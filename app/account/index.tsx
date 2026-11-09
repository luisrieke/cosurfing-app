import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AdminList, AdminRow } from '@/components/admin/AdminShell';
import { RequireAuth } from '@/components/RequireAuth';
import { Stars } from '@/components/Reviews';
import { LegalLinks } from '@/components/SiteFooter';
import { Badge, Button, Card, CategoryBadge, Icon, Input, Notice, Screen, Section, Skeleton, Text, TopBar } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { deleteAccount } from '@/lib/account';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { confirmedPoints, GUIDE_POINTS, levelFor } from '@/lib/levels';
import { adminGetCounts, getCityById, getFavoritePlaces, getMyReviews, updateDisplayName } from '@/lib/queries';
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
  const counts = useQuery(`account-admin-counts:${user?.id}`, adminGetCounts, isAdmin);
  const favorites = useQuery(`favorites:${user?.id}:${favoriteIds.size}`, () => getFavoritePlaces(user!.id), Boolean(user));
  const reviews = useQuery(`my-reviews:${user?.id}`, () => getMyReviews(user!.id), Boolean(user));
  const homeCity = useQuery(`home-city:${profile?.home_city_id}`, () => getCityById(profile!.home_city_id!), Boolean(profile?.home_city_id));
  const points = profile?.points ?? 0;
  const pending = profile?.points_pending ?? 0;
  const confirmed = confirmedPoints(points, pending);
  const level = levelFor(confirmed);
  const guide = Boolean(profile?.is_guide);

  // Re-sync the input when the profile (re)loads, without an effect.
  const profileName = profile?.display_name ?? null;
  if (profileName !== syncedName) {
    setSyncedName(profileName);
    setName(profileName ?? '');
  }

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const removeAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const { storeSubscription } = await deleteAccount();
      await signOut();
      router.replace({ pathname: '/', params: { deleted: storeSubscription ? 'store' : '1' } });
    } catch {
      setDeleteError(strings.account.deleteAccountFailed);
      setDeleting(false);
    }
  };

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
          <View style={[styles.plusIcon, { backgroundColor: colors.accent }]}>
            <Text variant="smallStrong" tone="inverse">
              {level.index + 1}
            </Text>
          </View>
          <View style={styles.plusText}>
            <Text variant="caption" tone="muted">
              {strings.account.level}
            </Text>
            <View style={[styles.row, styles.wrap]}>
              <Text variant="bodyStrong">
                {level.name} · {strings.levels.points(points)}
              </Text>
              {guide ? <Badge label={strings.levels.localGuide} icon="award" tone="accent" /> : null}
              {isAdmin ? <Badge label={strings.nav.admin} icon="shield" tone="accent" /> : null}
            </View>
          </View>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${level.progress * 100}%` }]} />
        </View>
        <Text variant="caption" tone="muted">
          {pending > 0 ? `${strings.levels.underReview(pending)}. ` : ''}
          {level.nextAt !== null && level.nextName ? `${strings.levels.nextLevel(level.nextAt - confirmed, level.nextName)}. ` : ''}
          {guide ? strings.levels.guideLive : confirmed >= GUIDE_POINTS ? strings.levels.guideHeld : strings.levels.toGuide(GUIDE_POINTS - confirmed)}
        </Text>
        <Text variant="caption" tone="faint">
          {strings.levels.howToEarn}
        </Text>
        {homeCity.data ? (
          <Button
            title={`${strings.account.homeCity}: ${homeCity.data.name}`}
            icon="map-pin"
            variant="secondary"
            size="sm"
            onPress={() => router.push(`/${homeCity.data!.slug}`)}
            style={styles.selfStart}
          />
        ) : null}
        {user ? (
          <Button
            title={strings.account.viewProfile}
            icon="user"
            variant="ghost"
            size="sm"
            onPress={() => router.push(`/u/${user.id}`)}
            style={styles.selfStart}
          />
        ) : null}
      </Card>

      {isAdmin ? (
        <Section title={strings.account.admin}>
          <Text tone="muted">{strings.account.adminHint}</Text>
          <AdminList>
            <AdminRow
              icon="inbox"
              title={strings.admin.contributions}
              subtitle={strings.admin.contributionsHint}
              meta={counts.data && counts.data.contributions > 0 ? <Badge label={`${counts.data.contributions} ${strings.admin.pending}`} tone="accent" /> : null}
              onPress={() => router.push('/admin/contributions')}
            />
            <AdminRow
              icon="inbox"
              title={strings.admin.suggestions}
              subtitle="Places suggested by other people"
              meta={counts.data && counts.data.suggestions > 0 ? <Badge label={`${counts.data.suggestions} ${strings.admin.pending}`} tone="accent" /> : null}
              onPress={() => router.push('/admin/suggestions')}
            />
            <AdminRow
              icon="check-circle"
              title={strings.admin.verify}
              subtitle="Places hidden until you confirm they still exist"
              meta={counts.data && counts.data.toVerify > 0 ? <Badge label={`${counts.data.toVerify} to check`} tone="danger" /> : null}
              onPress={() => router.push('/admin/verify')}
            />
            <AdminRow
              icon="image"
              title={strings.admin.photos}
              subtitle="Photos waiting for approval"
              meta={counts.data && counts.data.pendingPhotos > 0 ? <Badge label={`${counts.data.pendingPhotos} ${strings.admin.pending}`} tone="accent" /> : null}
              onPress={() => router.push('/admin/photos')}
            />
            <AdminRow
              icon="flag"
              title={strings.admin.reports}
              subtitle="Reported content and wrong place information"
              meta={counts.data && counts.data.reports > 0 ? <Badge label={`${counts.data.reports} open`} tone="danger" /> : null}
              onPress={() => router.push('/admin/reports')}
            />
            <AdminRow icon="shield" title={strings.account.admin} subtitle={user?.email} onPress={() => router.push('/admin')} />
          </AdminList>
        </Section>
      ) : null}

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
                    {r.status === 'pending' ? <Badge label={strings.account.underReview} tone="warning" /> : null}
                    {r.status === 'rejected' ? <Badge label={strings.account.notAccepted} tone="danger" /> : null}
                    {r.edit_status === 'pending' ? <Badge label={strings.account.underReview} tone="warning" /> : null}
                  </View>
                </View>
                <Icon name="edit-3" size={16} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        )}
      </Section>

      <View style={styles.footer}>
        <Button title={strings.common.signOut} variant="ghost" icon="log-out" onPress={() => signOut().then(() => router.replace('/'))} />
        {confirmDelete ? (
          <Notice tone="danger" title={strings.account.deleteAccountTitle} body={strings.account.deleteAccountBody}>
            <Text variant="small">{strings.account.deleteAccountStoreNote}</Text>
            {deleteError ? (
              <Text variant="small" tone="danger">
                {deleteError}
              </Text>
            ) : null}
            <View style={[styles.row, styles.wrap]}>
              <Button title={strings.account.deleteAccountConfirm} variant="danger" size="sm" loading={deleting} onPress={removeAccount} />
              <Button title={strings.common.cancel} variant="ghost" size="sm" disabled={deleting} onPress={() => setConfirmDelete(false)} />
            </View>
          </Notice>
        ) : (
          <Button title={strings.account.deleteAccount} variant="ghost" icon="trash-2" size="sm" onPress={() => setConfirmDelete(true)} style={styles.selfStart} />
        )}
        <LegalLinks onNavigate={(href) => router.push(href)} />
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
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.bgMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  selfStart: {
    alignSelf: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  wrap: {
    flexWrap: 'wrap',
    gap: spacing.sm,
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
