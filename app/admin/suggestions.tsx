import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdminList, AdminRow, AdminShell } from '@/components/admin/AdminShell';
import { Badge, Button, CategoryBadge, Chip, Input, Notice, Skeleton, Text } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { formatDate, slugify } from '@/lib/format';
import { adminApproveSuggestion, adminGetSuggestions, adminSetSuggestionStatus } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';

type Filter = 'pending' | 'approved' | 'rejected' | 'all';

export default function AdminSuggestions() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const suggestions = useQuery('admin-suggestions', adminGetSuggestions, isAdmin);
  const [filter, setFilter] = useState<Filter>('pending');
  const [openId, setOpenId] = useState<string | null>(null);
  const [slug, setSlug] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = (suggestions.data ?? []).filter((s) => filter === 'all' || s.status === filter);

  const startApprove = (s: (typeof rows)[number]) => {
    setOpenId(s.id);
    setSlug(slugify(s.name));
    setLat(s.city ? String(s.city.lat) : '');
    setLng(s.city ? String(s.city.lng) : '');
    setError(null);
  };

  const approve = async (id: string) => {
    const la = Number(lat.replace(',', '.'));
    const ln = Number(lng.replace(',', '.'));
    if (!slugify(slug)) return setError('Slug is required.');
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return setError('Latitude and longitude are required.');
    setBusy(id);
    try {
      const placeId = await adminApproveSuggestion(id, slugify(slug), la, ln);
      setOpenId(null);
      await suggestions.refetch();
      router.push(`/admin/places/${placeId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(null);
    }
  };

  const setStatus = async (id: string, status: 'rejected' | 'pending') => {
    setBusy(id);
    try {
      await adminSetSuggestionStatus(id, status);
      await suggestions.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminShell title={strings.admin.suggestions}>
      <Head>
        <title>Suggestions · Admin · Cosurfing</title>
      </Head>
      <View style={styles.chips}>
        {(['pending', 'approved', 'rejected', 'all'] as Filter[]).map((f) => (
          <Chip key={f} label={f} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>
      {error ? <Notice tone="danger" body={error} /> : null}
      {suggestions.loading && !suggestions.data ? (
        <Skeleton height={80} />
      ) : suggestions.error ? (
        <Notice tone="danger" body={suggestions.error.message} />
      ) : rows.length === 0 ? (
        <Text tone="muted">{strings.admin.noItems}</Text>
      ) : (
        <AdminList>
          {rows.map((s) => (
            <View key={s.id}>
              <AdminRow
                title={s.name}
                subtitle={[s.city?.name ?? s.city_text ?? '—', s.address, s.website].filter(Boolean).join(' · ')}
                meta={
                  <>
                    <CategoryBadge category={s.category} />
                    <Badge label={s.status} tone={s.status === 'pending' ? 'accent' : s.status === 'approved' ? 'success' : 'neutral'} />
                    <Text variant="caption" tone="faint">
                      {formatDate(s.created_at)}
                    </Text>
                  </>
                }
                right={
                  <View style={styles.rowActions}>
                    {s.place ? (
                      <Button title={strings.suggest.viewPlace} size="sm" variant="secondary" onPress={() => router.push(`/place/${s.place!.slug}`)} />
                    ) : null}
                    {s.status === 'pending' ? (
                      <>
                        <Button title={strings.admin.approve} size="sm" variant="secondary" onPress={() => startApprove(s)} disabled={!s.city} />
                        <Button title={strings.admin.reject} size="sm" variant="ghost" loading={busy === s.id} onPress={() => setStatus(s.id, 'rejected')} />
                      </>
                    ) : s.status === 'rejected' ? (
                      <Button title={strings.admin.reopen} size="sm" variant="ghost" loading={busy === s.id} onPress={() => setStatus(s.id, 'pending')} />
                    ) : null}
                  </View>
                }
              />
              {s.notes ? (
                <View style={styles.notes}>
                  <Text variant="small" tone="muted">
                    “{s.notes}”
                  </Text>
                </View>
              ) : null}
              {!s.city && s.status === 'pending' ? (
                <View style={styles.notes}>
                  <Text variant="caption" tone="danger">
                    Suggested for a city that is not set up yet ({s.city_text ?? 'unknown'}). Create the city first, or reject.
                  </Text>
                </View>
              ) : null}
              {openId === s.id ? (
                <View style={styles.approveBox}>
                  <Text variant="smallStrong">{strings.admin.approve}</Text>
                  <Input label={strings.admin.fields.slug} value={slug} onChangeText={setSlug} autoCapitalize="none" />
                  <View style={styles.twoCol}>
                    <View style={styles.col}>
                      <Input label={strings.admin.fields.lat} value={lat} onChangeText={setLat} keyboardType="decimal-pad" />
                    </View>
                    <View style={styles.col}>
                      <Input label={strings.admin.fields.lng} value={lng} onChangeText={setLng} keyboardType="decimal-pad" />
                    </View>
                  </View>
                  <Text variant="caption" tone="muted">
                    Coordinates default to the city centre. Adjust them in the place editor after approving.
                  </Text>
                  <View style={styles.rowActions}>
                    <Button title={strings.admin.approve} size="sm" loading={busy === s.id} onPress={() => approve(s.id)} />
                    <Button title={strings.common.cancel} size="sm" variant="ghost" onPress={() => setOpenId(null)} />
                  </View>
                </View>
              ) : null}
            </View>
          ))}
        </AdminList>
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    alignItems: 'center',
  },
  notes: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    marginTop: -spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  approveBox: {
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.bgSubtle,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderRadius: radius.sm,
  },
  twoCol: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  col: {
    flex: 1,
  },
});
