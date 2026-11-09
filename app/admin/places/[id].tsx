import { Image } from 'expo-image';
import Head from 'expo-router/head';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AdminShell } from '@/components/admin/AdminShell';
import { Badge, Button, Chip, Icon, Input, Notice, Section, Skeleton, Text } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { formatDate, normalizeWebsite, slugify } from '@/lib/format';
import { deletePlacePhoto, pickImage, uploadPlacePhoto } from '@/lib/photoUpload';
import {
  adminDeletePlace,
  adminGetPhotoRows,
  adminGetPlace,
  adminSavePlace,
  adminSearchCities,
  adminUpdatePhotoOrder,
  getCityById,
  type PlaceInput,
  toPlaceInput,
} from '@/lib/queries';
import { previewUrl, signedPhotoUrls } from '@/lib/storage';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import type {
  CallsValue,
  FocusValue,
  InternetFeeValue,
  Place,
  PlaceCategory,
  PlaceStatus,
  PowerValue,
  SeasonValue,
  WifiValue,
  YesNoUnknown,
} from '@/lib/types';

/** Fields the OpenStreetMap crawler overwrites unless they are listed in locked_fields. */
const CRAWLED_FIELDS = [
  'name',
  'category',
  'status',
  'address',
  'lat',
  'lng',
  'website',
  'phone',
  'opening_hours',
  'wifi',
  'internet_fee',
  'outdoor_seating',
  'wheelchair',
] as const satisfies readonly (keyof PlaceInput)[];

const emptyInput = (cityId: string): PlaceInput => ({
  city_id: cityId,
  slug: '',
  name: '',
  name_local: null,
  category: 'coworking',
  status: 'draft',
  description: null,
  address: null,
  lat: 0,
  lng: 0,
  website: null,
  phone: null,
  opening_hours: null,
  price_level: null,
  day_pass_price_cents: null,
  wifi: 'unknown',
  internet_fee: 'unknown',
  power_outlets: 'unknown',
  focus: 'unknown',
  calls: 'unknown',
  outdoor_seating: 'unknown',
  wheelchair: 'unknown',
  laptop_rules: null,
  last_verified_at: null,
  is_example: false,
  locked_fields: [],
  season: 'unknown',
  season_note: null,
  non_guest_work: 'unknown',
  non_guest_note: null,
  min_stay: null,
});

/** Crawled fields whose value differs from what was loaded. */
function changedCrawledFields(before: PlaceInput, after: PlaceInput): string[] {
  return CRAWLED_FIELDS.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}

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

export default function AdminPlaceEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  return (
    <AdminShell title={isNew ? strings.admin.newPlace : strings.admin.places} backTo="/admin/places">
      <Head>
        <title>{`${isNew ? 'New place' : 'Edit place'} · Admin · Cosurfing`}</title>
      </Head>
      <Editor placeId={isNew ? null : id!} />
    </AdminShell>
  );
}

function Editor({ placeId }: { placeId: string | null }) {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [cityQuery, setCityQuery] = useState('');
  const cities = useQuery(`admin-city-search:${cityQuery}`, () => adminSearchCities(cityQuery, 12), isAdmin);
  const placeQuery = useQuery(`admin-place:${placeId}`, () => adminGetPlace(placeId!), Boolean(placeId) && isAdmin);
  const [form, setForm] = useState<PlaceInput | null>(null);
  const [original, setOriginal] = useState<PlaceInput | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [slugTouched, setSlugTouched] = useState(Boolean(placeId));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Numeric fields are edited as strings.
  const [latText, setLatText] = useState('');
  const [lngText, setLngText] = useState('');
  const [priceLevelText, setPriceLevelText] = useState('');
  const [dayPassText, setDayPassText] = useState('');

  // Hydrate the form exactly once (from the loaded place, or with defaults for a new one).
  // Done as a state adjustment during render rather than in an effect.
  if (!hydrated) {
    if (placeId && placeQuery.data) {
      const rest = toPlaceInput(placeQuery.data);
      setForm(rest);
      setOriginal(rest);
      setLatText(String(rest.lat));
      setLngText(String(rest.lng));
      setPriceLevelText(rest.price_level ? String(rest.price_level) : '');
      setDayPassText(rest.day_pass_price_cents !== null ? (rest.day_pass_price_cents / 100).toFixed(2) : '');
      setHydrated(true);
    } else if (!placeId && cities.data && cities.data.length > 0) {
      const first = cities.data[0]!;
      setForm(emptyInput(first.id));
      setLatText(String(first.lat));
      setLngText(String(first.lng));
      setHydrated(true);
    }
  }

  const update = <K extends keyof PlaceInput>(key: K, value: PlaceInput[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setSaved(false);
  };

  const save = async (statusOverride?: PlaceStatus) => {
    if (!form) return;
    const lat = Number(latText.replace(',', '.'));
    const lng = Number(lngText.replace(',', '.'));
    if (form.name.trim().length < 2) return setError(`${strings.admin.fields.name} is required.`);
    if (!form.slug.trim()) return setError(`${strings.admin.fields.slug} is required.`);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return setError('Latitude and longitude are required.');
    const priceLevel = priceLevelText ? Number(priceLevelText) : null;
    if (priceLevel !== null && (![1, 2, 3].includes(priceLevel))) return setError('Price level must be 1, 2 or 3.');
    const dayPass = dayPassText ? Math.round(Number(dayPassText.replace(',', '.')) * 100) : null;
    if (dayPass !== null && !Number.isFinite(dayPass)) return setError('Day pass price must be a number.');
    if (form.last_verified_at && !/^\d{4}-\d{2}-\d{2}$/.test(form.last_verified_at)) return setError('Last checked must be YYYY-MM-DD.');

    setBusy('save');
    setError(null);
    try {
      const input: PlaceInput = {
        ...form,
        name: form.name.trim(),
        slug: slugify(form.slug),
        status: statusOverride ?? form.status,
        description: form.description?.trim() || null,
        address: form.address?.trim() || null,
        website: normalizeWebsite(form.website),
        opening_hours: form.opening_hours?.trim() || null,
        laptop_rules: form.laptop_rules?.trim() || null,
        last_verified_at: form.last_verified_at || null,
        name_local: form.name_local?.trim() || null,
        phone: form.phone?.trim() || null,
        season_note: form.season_note?.trim() || null,
        non_guest_note: form.non_guest_note?.trim() || null,
        min_stay: form.min_stay?.trim() || null,
        lat,
        lng,
        price_level: priceLevel,
        day_pass_price_cents: dayPass,
      };
      if (original) {
        const changed = changedCrawledFields(original, input);
        input.locked_fields = [...new Set([...(form.locked_fields ?? []), ...changed])];
      }
      const savedId = await adminSavePlace(placeId, input);
      setForm(input);
      setOriginal(input);
      setSaved(true);
      if (!placeId) router.replace(`/admin/places/${savedId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(null);
    }
  };

  const remove = () =>
    confirm(strings.admin.confirmDelete, async () => {
      if (!placeId) return;
      setBusy('delete');
      try {
        await adminDeletePlace(placeId);
        router.replace('/admin/places');
      } catch (e) {
        setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
        setBusy(null);
      }
    });

  if (!form || (placeId && placeQuery.loading)) {
    return (
      <View style={{ gap: spacing.md }}>
        <Skeleton height={48} />
        <Skeleton height={48} />
        <Skeleton height={120} />
      </View>
    );
  }
  if (placeId && placeQuery.error) return <Notice tone="danger" body={placeQuery.error.message} />;
  if (placeId && !placeQuery.data) return <Notice tone="warning" body={strings.place.notFound} />;

  const f = strings.admin.fields;
  const statusTone =
    form.status === 'published' ? 'success' : form.status === 'draft' ? 'warning' : form.status === 'needs_review' ? 'danger' : 'neutral';

  return (
    <View style={styles.form}>
      <View style={styles.statusRow}>
        <Badge label={strings.admin[form.status]} tone={statusTone} />
        {form.is_example ? <Badge label={strings.common.example} tone="warning" /> : null}
        {saved ? (
          <Text variant="small" tone="success">
            {strings.admin.saved}
          </Text>
        ) : null}
      </View>
      {error ? <Notice tone="danger" body={error} /> : null}
      {form.is_example ? <Notice tone="warning" body={strings.common.exampleHint} /> : null}

      <Section title="Basics">
        <Input
          label={f.name}
          value={form.name}
          onChangeText={(v) => {
            update('name', v);
            if (!slugTouched) update('slug', slugify(v));
          }}
        />
        <Input
          label={f.slug}
          value={form.slug}
          onChangeText={(v) => {
            setSlugTouched(true);
            update('slug', v);
          }}
          autoCapitalize="none"
          hint={`cosurfing.app/place/${slugify(form.slug) || '…'}`}
        />
        <View style={styles.field}>
          <Text variant="smallStrong">{f.category}</Text>
          <View style={styles.chips}>
            {(['coworking', 'cafe', 'library', 'coliving'] as PlaceCategory[]).map((c) => (
              <Chip key={c} label={strings.explore[c]} color={colors[c]} selected={form.category === c} onPress={() => update('category', c)} />
            ))}
          </View>
        </View>
        <View style={styles.field}>
          <Text variant="smallStrong">{f.city}</Text>
          <SelectedCity cityId={form.city_id} />
          <Input value={cityQuery} onChangeText={setCityQuery} placeholder={f.citySearch} autoCapitalize="none" />
          <View style={styles.chips}>
            {(cities.data ?? []).map((c) => (
              <Chip
                key={c.id}
                label={`${c.name}, ${c.country_code}`}
                selected={form.city_id === c.id}
                onPress={() => update('city_id', c.id)}
              />
            ))}
          </View>
        </View>
        <Input label={f.nameLocal} optional value={form.name_local ?? ''} onChangeText={(v) => update('name_local', v)} />
        <Input label={f.description} optional value={form.description ?? ''} onChangeText={(v) => update('description', v)} multiline />
      </Section>

      <Section title="Location">
        <Input label={f.address} optional value={form.address ?? ''} onChangeText={(v) => update('address', v)} />
        <View style={styles.twoCol}>
          <View style={styles.col}>
            <Input label={f.lat} value={latText} onChangeText={setLatText} keyboardType="decimal-pad" autoCapitalize="none" />
          </View>
          <View style={styles.col}>
            <Input label={f.lng} value={lngText} onChangeText={setLngText} keyboardType="decimal-pad" autoCapitalize="none" />
          </View>
        </View>
        <Input label={f.website} optional value={form.website ?? ''} onChangeText={(v) => update('website', v)} autoCapitalize="none" keyboardType="url" />
        <Input label={f.phone} optional value={form.phone ?? ''} onChangeText={(v) => update('phone', v)} keyboardType="phone-pad" />
        <Input label={f.openingHours} optional value={form.opening_hours ?? ''} onChangeText={(v) => update('opening_hours', v)} placeholder="Mon–Fri 8:00–18:00" />
      </Section>

      {form.category === 'coliving' ? (
        <Section title={strings.explore.coliving}>
          <EnumField label={f.nonGuestWork} value={form.non_guest_work} options={['yes', 'no', 'unknown'] as YesNoUnknown[]} onChange={(v) => update('non_guest_work', v)} />
          <Input label={f.nonGuestNote} optional value={form.non_guest_note ?? ''} onChangeText={(v) => update('non_guest_note', v)} />
          <EnumField label={f.season} value={form.season} options={['year_round', 'seasonal', 'unknown'] as SeasonValue[]} onChange={(v) => update('season', v)} />
          <Input label={f.seasonNote} optional value={form.season_note ?? ''} onChangeText={(v) => update('season_note', v)} />
          <Input label={f.minStay} optional value={form.min_stay ?? ''} onChangeText={(v) => update('min_stay', v)} />
        </Section>
      ) : null}

      <Section title={strings.place.facts}>
        <EnumField label={f.wifi} value={form.wifi} options={['yes', 'no', 'unknown'] as WifiValue[]} onChange={(v) => update('wifi', v)} />
        <EnumField label={f.internetFee} value={form.internet_fee} options={['no', 'customers', 'yes', 'unknown'] as InternetFeeValue[]} onChange={(v) => update('internet_fee', v)} />
        <EnumField label={f.power} value={form.power_outlets} options={['plenty', 'some', 'none', 'unknown'] as PowerValue[]} onChange={(v) => update('power_outlets', v)} />
        <EnumField label={f.focus} value={form.focus} options={['great', 'okay', 'poor', 'unknown'] as FocusValue[]} onChange={(v) => update('focus', v)} />
        <EnumField label={f.calls} value={form.calls} options={['yes', 'limited', 'no', 'unknown'] as CallsValue[]} onChange={(v) => update('calls', v)} />
        <EnumField label={f.outdoorSeating} value={form.outdoor_seating} options={['yes', 'no', 'unknown'] as YesNoUnknown[]} onChange={(v) => update('outdoor_seating', v)} />
        <EnumField label={f.wheelchair} value={form.wheelchair} options={['yes', 'limited', 'no', 'unknown'] as Place['wheelchair'][]} onChange={(v) => update('wheelchair', v)} />
        <View style={styles.twoCol}>
          <View style={styles.col}>
            <Input label={f.priceLevel} optional value={priceLevelText} onChangeText={setPriceLevelText} keyboardType="number-pad" />
          </View>
          <View style={styles.col}>
            <Input label={f.dayPass} optional value={dayPassText} onChangeText={setDayPassText} keyboardType="decimal-pad" placeholder="25.00" />
          </View>
        </View>
        <Input label={f.laptopRules} optional value={form.laptop_rules ?? ''} onChangeText={(v) => update('laptop_rules', v)} multiline />
        <Input
          label={f.lastVerified}
          optional
          value={form.last_verified_at ? form.last_verified_at.slice(0, 10) : ''}
          onChangeText={(v) => update('last_verified_at', v || null)}
          placeholder="2026-10-19"
          autoCapitalize="none"
        />
        <Pressable style={styles.checkbox} onPress={() => update('is_example', !form.is_example)} accessibilityRole="checkbox" accessibilityState={{ checked: form.is_example }}>
          <Icon name={form.is_example ? 'check-square' : 'square'} size={20} color={form.is_example ? colors.warning : colors.textMuted} />
          <Text variant="small">{f.isExample}</Text>
        </Pressable>
      </Section>

      {placeId ? (
        <Section title={strings.admin.lockedTitle}>
          <Text variant="small" tone="muted">
            {strings.admin.lockedHint}
          </Text>
          {(form.locked_fields ?? []).length === 0 ? (
            <Text variant="small" tone="faint">
              {strings.admin.lockedNone}
            </Text>
          ) : (
            <View style={styles.chips}>
              {form.locked_fields.map((k) => (
                <Chip
                  key={k}
                  label={k}
                  icon="lock"
                  selected
                  onPress={() => update('locked_fields', form.locked_fields.filter((x) => x !== k))}
                />
              ))}
            </View>
          )}
        </Section>
      ) : null}

      {placeId && placeQuery.data ? <CrawlerInfo place={placeQuery.data} /> : null}

      {placeId ? <Photos placeId={placeId} /> : <Notice tone="info" body="Save the place first to add photos." />}

      <View style={styles.actions}>
        <Button title={strings.common.save} loading={busy === 'save'} onPress={() => save()} />
        {form.status !== 'published' ? (
          <Button title={strings.admin.publish} variant="secondary" icon="eye" loading={busy === 'save'} onPress={() => save('published')} />
        ) : (
          <Button title={strings.admin.unpublish} variant="secondary" icon="eye-off" loading={busy === 'save'} onPress={() => save('draft')} />
        )}
        {form.status !== 'archived' ? (
          <Button title={strings.admin.archive} variant="ghost" icon="archive" onPress={() => save('archived')} />
        ) : null}
        {placeId ? <Button title={strings.common.delete} variant="danger" icon="trash-2" loading={busy === 'delete'} onPress={remove} /> : null}
      </View>
      {placeId && form.status === 'published' ? (
        <Button title="Open public page" variant="ghost" icon="external-link" onPress={() => router.push(`/place/${form.slug}`)} />
      ) : null}
    </View>
  );
}

function SelectedCity({ cityId }: { cityId: string }) {
  const city = useQuery(`admin-city:${cityId}`, () => getCityById(cityId), Boolean(cityId));
  if (!city.data) return null;
  return (
    <Text variant="body">
      {city.data.name}, {city.data.country_name}
    </Text>
  );
}

function CrawlerInfo({ place }: { place: Place }) {
  return (
    <Section title={strings.admin.crawlerInfo}>
      <Text variant="small" tone="muted">
        {strings.admin.source(place.source)} · {strings.admin.workScore(Number(place.work_score))}
      </Text>
      <Text variant="small" tone="muted">
        {strings.admin.webCrawl(place.web_crawl_status, place.web_crawled_at ? formatDate(place.web_crawled_at) : null)}
      </Text>
      {place.review_reason ? (
        <Text variant="small" tone="danger">
          {strings.admin.reviewReasons[place.review_reason] ?? place.review_reason}
        </Text>
      ) : null}
      {place.flagged_website ? (
        <Text variant="small" tone="muted">
          {strings.admin.oldWebsite(place.flagged_website)}
        </Text>
      ) : null}
      {place.osm_type && place.osm_id ? (
        <Button
          title={strings.admin.openOsm}
          variant="ghost"
          size="sm"
          icon="external-link"
          onPress={() => Linking.openURL(`https://www.openstreetmap.org/${place.osm_type}/${place.osm_id}`)}
          style={{ alignSelf: 'flex-start' }}
        />
      ) : null}
    </Section>
  );
}

function EnumField<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: T[]; onChange: (v: T) => void }) {
  return (
    <View style={styles.field}>
      <Text variant="smallStrong">{label}</Text>
      <View style={styles.chips}>
        {options.map((o) => (
          <Chip key={o} label={o} selected={value === o} onPress={() => onChange(o)} />
        ))}
      </View>
    </View>
  );
}

function Photos({ placeId }: { placeId: string }) {
  const photos = useQuery(`admin-photos:${placeId}`, () => adminGetPhotoRows(placeId));
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const rows = photos.data ?? [];
    if (rows.length === 0) return;
    signedPhotoUrls(rows.map((r) => r.full_path)).then(setUrls);
  }, [photos.data]);

  const add = async () => {
    setError(null);
    try {
      const uri = await pickImage(() => setBusy('upload'));
      if (!uri) return;
      await uploadPlacePhoto(placeId, uri, photos.data?.length ?? 0);
      await photos.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(null);
    }
  };

  const remove = (photo: { id: string; full_path: string; preview_path: string }) =>
    confirm(strings.admin.confirmDelete, async () => {
      setBusy(photo.id);
      try {
        await deletePlacePhoto(photo);
        await photos.refetch();
      } catch (e) {
        setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
      } finally {
        setBusy(null);
      }
    });

  const move = async (index: number, dir: -1 | 1) => {
    const rows = [...(photos.data ?? [])];
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    [rows[index], rows[target]] = [rows[target]!, rows[index]!];
    setBusy('order');
    try {
      await adminUpdatePhotoOrder(rows.map((r) => r.id));
      await photos.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(null);
    }
  };

  const rows = photos.data ?? [];
  return (
    <Section
      title={strings.admin.photos}
      right={<Button title={busy === 'upload' ? strings.admin.uploading : strings.admin.uploadPhoto} size="sm" variant="secondary" icon="upload" loading={busy === 'upload'} onPress={add} />}
    >
      <Text variant="small" tone="muted">
        Photos are resized to {1600}px for the private bucket and {24}px for the public blurred preview. Only upload photos you have the rights to.
      </Text>
      {error ? <Notice tone="danger" body={error} /> : null}
      {photos.loading && !photos.data ? (
        <Skeleton height={96} />
      ) : rows.length === 0 ? (
        <Text tone="muted">{strings.place.noPhotos}</Text>
      ) : (
        <View style={styles.photoGrid}>
          {rows.map((p, i) => (
            <View key={p.id} style={styles.photoCard}>
              <Image source={{ uri: urls.get(p.full_path) ?? previewUrl(p.preview_path) }} style={styles.photo} contentFit="cover" />
              <View style={styles.photoActions}>
                <Pressable onPress={() => move(i, -1)} disabled={i === 0 || busy !== null} hitSlop={6} accessibilityLabel="Move left">
                  <Icon name="chevron-left" size={18} color={i === 0 ? colors.textFaint : colors.text} />
                </Pressable>
                <Text variant="caption" tone="muted">
                  {i === 0 ? 'Cover' : `#${i + 1}`}
                </Text>
                <Pressable onPress={() => move(i, 1)} disabled={i === rows.length - 1 || busy !== null} hitSlop={6} accessibilityLabel="Move right">
                  <Icon name="chevron-right" size={18} color={i === rows.length - 1 ? colors.textFaint : colors.text} />
                </Pressable>
                <Pressable onPress={() => remove(p)} disabled={busy !== null} hitSlop={6} accessibilityLabel={strings.admin.removePhoto} style={{ marginLeft: 'auto' }}>
                  <Icon name="trash-2" size={16} color={colors.danger} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.xl,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  field: {
    gap: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  twoCol: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  col: {
    flex: 1,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  photoCard: {
    width: 160,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: colors.bgSubtle,
  },
  photo: {
    width: '100%',
    height: 110,
    backgroundColor: colors.bgMuted,
  },
  photoActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
});
