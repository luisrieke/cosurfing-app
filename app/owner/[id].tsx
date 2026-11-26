import { Image } from 'expo-image';
import Head from 'expo-router/head';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { LaptopHoursEditor, type LaptopWeek, WeeklyHoursEditor } from '@/components/hours';
import { VenueOffersEditor } from '@/components/place/VenueOffersEditor';
import { RequireAuth } from '@/components/RequireAuth';
import { Badge, Button, CategoryBadge, Chip, Icon, Input, Notice, Screen, Section, Skeleton, Text, TopBar } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { normalizeWebsite } from '@/lib/format';
import {
  compactLaptopWeek,
  DAY_KEYS,
  dayError,
  defaultPreset,
  fullLaptopWeek,
  normalizeWeek,
  presetHours,
  sameWeek,
  sortIntervals,
  weekError,
  type WeeklyHours,
} from '@/lib/hours';
import { formatLaptopWeekSummary, formatWeekSummary } from '@/lib/hoursText';
import { MAX_USER_PHOTOS_PER_UPLOAD, pickImages, uploadPlacePhoto } from '@/lib/photoUpload';
import { type OwnerPatch, ownerGetPhotos, ownerGetPlace, ownerHidePhoto, ownerReorderPhotos, ownerUpdatePlace } from '@/lib/queries';
import { previewUrl, signedPhotoUrls } from '@/lib/storage';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import type { City, Place, PlaceAccess } from '@/lib/types';

type OwnerPlace = Place & { city: City | null };

const ACCESS_OPTIONS: PlaceAccess[] = ['open', 'registration', 'on_request', 'application', 'members', 'unknown'];

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

const clean = (v: string | null | undefined) => (v ?? '').trim() || null;

export default function OwnerPlaceRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireAuth title={strings.owner.editorTitle} message={strings.owner.signIn} redirect={`/owner/${id}`}>
      <OwnerPlaceScreen key={id} placeId={id!} />
    </RequireAuth>
  );
}

function OwnerPlaceScreen({ placeId }: { placeId: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const o = strings.owner;
  const placeQuery = useQuery(`owner-place:${placeId}:${user?.id}`, () => ownerGetPlace(placeId), Boolean(user));
  const [saved, setSaved] = useState(false);
  const place = placeQuery.data;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/owner'));

  return (
    <Screen>
      <Head>
        <title>{`${o.editorTitle}${place ? ` · ${place.name}` : ''} · Cosurfing`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <TopBar title={o.editorTitle} onBack={back} />
      {placeQuery.loading && !place ? (
        <View style={styles.form}>
          <Skeleton height={48} />
          <Skeleton height={160} />
          <Skeleton height={160} />
        </View>
      ) : placeQuery.error ? (
        <Notice tone="danger" body={placeQuery.error.message} />
      ) : !place ? (
        <Notice tone="warning" body={o.notOwner} />
      ) : (
        <Editor
          // Remount with the saved values so the form starts from what the database stored.
          key={place.updated_at}
          place={place}
          saved={saved}
          onSaved={async () => {
            await placeQuery.refetch(true);
            setSaved(true);
          }}
          onEdit={() => setSaved(false)}
        />
      )}
    </Screen>
  );
}

function Editor({ place, saved, onSaved, onEdit }: { place: OwnerPlace; saved: boolean; onSaved: () => Promise<void>; onEdit: () => void }) {
  const router = useRouter();
  const o = strings.owner;
  const h = strings.hours;
  const he = h.editor;
  const coliving = place.category === 'coliving';
  const showLaptop = place.category === 'cafe' || place.category === 'library';

  const [description, setDescription] = useState(place.description ?? '');
  const [website, setWebsite] = useState(place.website ?? '');
  const [phone, setPhone] = useState(place.phone ?? '');
  const [access, setAccess] = useState<PlaceAccess>(place.access);
  const [accessNote, setAccessNote] = useState(place.access_note ?? '');
  const [dayPass, setDayPass] = useState(place.day_pass_price_cents !== null ? (place.day_pass_price_cents / 100).toFixed(2).replace(/\.00$/, '') : '');
  const [wifi, setWifi] = useState(place.wifi);
  const [power, setPower] = useState(place.power_outlets);
  const [calls, setCalls] = useState(place.calls);
  const [laptopRules, setLaptopRules] = useState(place.laptop_rules ?? '');
  const [nonGuestWork, setNonGuestWork] = useState(place.non_guest_work);
  const [nonGuestNote, setNonGuestNote] = useState(place.non_guest_note ?? '');
  const [season, setSeason] = useState(place.season);
  const [seasonNote, setSeasonNote] = useState(place.season_note ?? '');
  const [minStay, setMinStay] = useState(place.min_stay ?? '');

  const venueHours = place.hours_source === 'venue' && place.hours ? normalizeWeek(place.hours) : null;
  const [hours, setHours] = useState<WeeklyHours | null>(venueHours);
  const venueLaptop = place.laptop_source === 'venue' ? fullLaptopWeek(place.laptop_hours) : null;
  const [laptop, setLaptop] = useState<LaptopWeek | null>(venueLaptop);
  const [laptopTouched, setLaptopTouched] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const edit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setError(null);
      setInfo(null);
      onEdit();
    };

  const save = async () => {
    const patch: OwnerPatch = {};
    const text = (key: 'description' | 'phone' | 'access_note' | 'laptop_rules' | 'non_guest_note' | 'season_note' | 'min_stay', value: string) => {
      if (clean(value) !== clean(place[key])) patch[key] = clean(value);
    };
    text('description', description);
    text('phone', phone);
    text('access_note', accessNote);
    text('laptop_rules', laptopRules);
    if (normalizeWebsite(website) !== clean(place.website)) patch.website = normalizeWebsite(website);
    if (access !== place.access) patch.access = access;
    if (wifi !== place.wifi) patch.wifi = wifi;
    if (power !== place.power_outlets) patch.power_outlets = power;
    if (calls !== place.calls) patch.calls = calls;

    const dayPassText = dayPass.trim().replace(',', '.');
    const cents = dayPassText ? Math.round(Number(dayPassText) * 100) : null;
    if (cents !== null && (!Number.isFinite(cents) || cents < 0)) return setError(o.errors.invalidPrice);
    if (cents !== place.day_pass_price_cents) patch.day_pass_price_cents = cents;

    if (coliving) {
      if (nonGuestWork !== place.non_guest_work) patch.non_guest_work = nonGuestWork;
      if (season !== place.season) patch.season = season;
      text('non_guest_note', nonGuestNote);
      text('season_note', seasonNote);
      text('min_stay', minStay);
    }

    if (hours) {
      const bad = weekError(hours);
      if (bad) return setError(he.invalidDay(h.dayLong[bad.day], he.errors[bad.error] ?? ''));
      if (!venueHours || !sameWeek(hours, venueHours)) patch.hours = normalizeWeek(hours);
    } else if (venueHours) {
      patch.hours = null;
    }

    if (laptopTouched) {
      if (laptop) {
        const badDay = DAY_KEYS.find((d) => {
          const day = laptop[d];
          return day.mode === 'specific' && dayError(sortIntervals(day.ranges)) !== null;
        });
        if (badDay) {
          const day = laptop[badDay];
          const err = day.mode === 'specific' ? dayError(sortIntervals(day.ranges)) : null;
          return setError(he.invalidDay(h.dayLong[badDay], err ? (he.errors[err] ?? '') : ''));
        }
        const compact = compactLaptopWeek(laptop);
        if (!compact) return setError(he.laptopEmpty);
        patch.laptop_hours = compact;
      } else if (venueLaptop) {
        patch.laptop_hours = null;
      }
    }

    if (Object.keys(patch).length === 0) {
      setInfo(o.nothingChanged);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ownerUpdatePlace(place.id, patch);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.form}>
      <View style={styles.intro}>
        <CategoryBadge category={place.category} />
        <Text variant="title">{place.name}</Text>
        {place.city ? <Text tone="muted">{place.city.name}</Text> : null}
        <Text tone="muted">{o.editorIntro}</Text>
        {place.status === 'published' ? (
          <Button title={o.viewPage} icon="external-link" variant="ghost" size="sm" onPress={() => router.push(`/place/${place.slug}`)} style={styles.selfStart} />
        ) : (
          <Badge label={o.statusHidden} tone="warning" />
        )}
      </View>
      {saved ? <Notice tone="success" body={o.saved} /> : null}

      <Section title={o.sectionAccess}>
        <Text variant="small" tone="muted">
          {o.accessHint}
        </Text>
        <View style={styles.options}>
          {ACCESS_OPTIONS.map((a) => (
            <Pressable
              key={a}
              onPress={() => edit(setAccess)(a)}
              accessibilityRole="radio"
              accessibilityState={{ checked: access === a }}
              style={[styles.option, access === a && styles.optionSelected]}
            >
              <Icon name={access === a ? 'check-circle' : 'circle'} size={18} color={access === a ? colors.accent : colors.textFaint} />
              <View style={styles.flex}>
                <Text variant="smallStrong">{o.accessOptions[a]}</Text>
                <Text variant="caption" tone="muted">
                  {o.accessOptionHints[a]}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
        <Input label={o.accessNote} optional value={accessNote} onChangeText={edit(setAccessNote)} placeholder={o.accessNotePlaceholder} maxLength={200} multiline />
      </Section>

      <Section title={o.sectionHours}>
        {hours ? (
          <View style={styles.block}>
            <WeeklyHoursEditor value={hours} onChange={edit(setHours)} category={place.category} />
            {venueHours ? (
              <>
                <Button title={o.hoursReset} icon="rotate-ccw" variant="ghost" size="sm" onPress={() => edit(setHours)(null)} style={styles.selfStart} />
                <Text variant="caption" tone="muted">
                  {o.hoursResetHint}
                </Text>
              </>
            ) : (
              <Button title={strings.common.cancel} icon="x" variant="ghost" size="sm" onPress={() => edit(setHours)(null)} style={styles.selfStart} />
            )}
          </View>
        ) : (
          <View style={styles.block}>
            <Text variant="smallStrong">{o.hoursCurrent}</Text>
            <Text variant="small" tone={place.hours ? undefined : 'muted'}>
              {place.hours ? formatWeekSummary(place.hours) : place.opening_hours || o.hoursNone}
            </Text>
            {place.hours_source ? (
              <Text variant="caption" tone="muted">
                {h.source[place.hours_source]}
              </Text>
            ) : null}
            <Button
              title={o.hoursSet}
              icon="clock"
              variant="secondary"
              size="sm"
              onPress={() => edit(setHours)(place.hours ? normalizeWeek(place.hours) : presetHours(defaultPreset(place.category)))}
              style={styles.selfStart}
            />
          </View>
        )}
      </Section>

      {showLaptop ? (
        <Section title={o.sectionLaptop}>
          <Text variant="small" tone="muted">
            {o.laptopHint}
          </Text>
          {laptop ? (
            <View style={styles.block}>
              <LaptopHoursEditor
                value={laptop}
                onChange={(v) => {
                  setLaptopTouched(true);
                  edit(setLaptop)(v);
                }}
                hours={hours ?? place.hours}
              />
              <Button
                title={o.laptopReset}
                icon="rotate-ccw"
                variant="ghost"
                size="sm"
                onPress={() => {
                  setLaptopTouched(true);
                  edit(setLaptop)(null);
                }}
                style={styles.selfStart}
              />
            </View>
          ) : (
            <View style={styles.block}>
              {place.laptop_hours ? <Text variant="small">{formatLaptopWeekSummary(place.laptop_hours)}</Text> : null}
              <Button
                title={o.laptopSet}
                icon="monitor"
                variant="secondary"
                size="sm"
                onPress={() => {
                  setLaptopTouched(true);
                  edit(setLaptop)(fullLaptopWeek(place.laptop_hours));
                }}
                style={styles.selfStart}
              />
            </View>
          )}
        </Section>
      ) : null}

      <Section title={o.sectionWork}>
        <ChoiceField label={o.wifi} value={wifi} options={['yes', 'no', 'unknown'] as const} onChange={edit(setWifi)} />
        <ChoiceField label={o.power} value={power} options={['plenty', 'some', 'none', 'unknown'] as const} onChange={edit(setPower)} />
        <ChoiceField label={o.calls} value={calls} options={['yes', 'limited', 'no', 'unknown'] as const} onChange={edit(setCalls)} />
        <Input label={o.dayPass} optional value={dayPass} onChangeText={edit(setDayPass)} keyboardType="decimal-pad" placeholder="15" hint={o.dayPassHint} />
        <Input label={o.laptopRules} optional value={laptopRules} onChangeText={edit(setLaptopRules)} placeholder={o.laptopRulesPlaceholder} maxLength={500} multiline />
      </Section>

      {coliving ? (
        <Section title={o.sectionColiving}>
          <ChoiceField label={o.nonGuestWork} value={nonGuestWork} options={['yes', 'no', 'unknown'] as const} onChange={edit(setNonGuestWork)} />
          <Input label={o.nonGuestNote} optional value={nonGuestNote} onChangeText={edit(setNonGuestNote)} maxLength={200} />
          <ChoiceField label={o.season} value={season} options={['year_round', 'seasonal', 'unknown'] as const} onChange={edit(setSeason)} />
          <Input label={o.seasonNote} optional value={seasonNote} onChangeText={edit(setSeasonNote)} maxLength={200} />
          <Input label={o.minStay} optional value={minStay} onChangeText={edit(setMinStay)} maxLength={60} />
        </Section>
      ) : null}

      <Section title={o.sectionAbout}>
        <Input label={o.description} optional value={description} onChangeText={edit(setDescription)} hint={o.descriptionHint} maxLength={1500} multiline />
        <Input label={o.website} optional value={website} onChangeText={edit(setWebsite)} autoCapitalize="none" keyboardType="url" placeholder="https://" />
        <Input label={o.phone} optional value={phone} onChangeText={edit(setPhone)} keyboardType="phone-pad" maxLength={40} />
      </Section>

      {error ? <Notice tone="danger" body={error} /> : null}
      {info ? <Notice tone="info" body={info} /> : null}
      {saved ? <Notice tone="success" body={o.saved} /> : null}
      <Button title={busy ? o.saving : o.save} icon="check" fullWidth loading={busy} disabled={busy} onPress={() => void save()} />

      <VenueOffersEditor placeId={place.id} />

      <OwnerPhotos place={place} />
    </View>
  );
}

function ChoiceField<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <View style={styles.block}>
      <Text variant="smallStrong">{label}</Text>
      <View style={styles.chips}>
        {options.map((opt) => (
          <Chip key={opt} label={strings.owner.options[opt] ?? opt} selected={value === opt} onPress={() => onChange(opt)} />
        ))}
      </View>
    </View>
  );
}

function OwnerPhotos({ place }: { place: OwnerPlace }) {
  const o = strings.owner;
  const { user } = useAuth();
  const photos = useQuery(`owner-photos:${place.id}`, () => ownerGetPhotos(place.id));
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = photos.data ?? [];

  useEffect(() => {
    const data = photos.data ?? [];
    if (data.length === 0) return;
    void signedPhotoUrls(data.map((r) => r.full_path)).then(setUrls);
  }, [photos.data]);

  const upload = async () => {
    if (!user) return;
    setError(null);
    try {
      const uris = await pickImages(MAX_USER_PHOTOS_PER_UPLOAD, () => setBusy('upload'));
      const rightsAcceptedAt = new Date().toISOString();
      for (const uri of uris) {
        await uploadPlacePhoto(place.id, uri, 0, { userId: user.id, rightsAcceptedAt });
      }
      await photos.refetch(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(null);
    }
  };

  const hide = (id: string) =>
    confirm(o.photosRemoveConfirm, async () => {
      setBusy(id);
      setError(null);
      try {
        await ownerHidePhoto(id);
        await photos.refetch(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
      } finally {
        setBusy(null);
      }
    });

  const move = async (index: number, dir: -1 | 1) => {
    const next = [...rows];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setBusy('order');
    setError(null);
    try {
      await ownerReorderPhotos(place.id, next.map((r) => r.id));
      await photos.refetch(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(null);
    }
  };

  const canUpload = place.status === 'published';
  return (
    <Section
      title={o.sectionPhotos}
      right={
        canUpload ? (
          <Button
            title={busy === 'upload' ? o.photosUploading : o.photosUpload}
            size="sm"
            variant="secondary"
            icon="upload"
            loading={busy === 'upload'}
            disabled={busy !== null}
            onPress={() => void upload()}
          />
        ) : null
      }
    >
      <Text variant="small" tone="muted">
        {o.photosHint}
      </Text>
      {error ? <Notice tone="danger" body={error} /> : null}
      {photos.error ? <Notice tone="danger" body={photos.error.message} /> : null}
      {photos.loading && !photos.data ? (
        <Skeleton height={110} />
      ) : rows.length === 0 ? (
        <Text tone="muted">{o.photosNone}</Text>
      ) : (
        <View style={styles.photoGrid}>
          {rows.map((p, i) => (
            <View key={p.id} style={styles.photoCard}>
              <Image source={{ uri: urls.get(p.full_path) ?? previewUrl(p.preview_path) }} style={styles.photo} contentFit="cover" />
              <View style={styles.photoActions}>
                <Pressable onPress={() => void move(i, -1)} disabled={i === 0 || busy !== null} hitSlop={6} accessibilityLabel="Move left">
                  <Icon name="chevron-left" size={18} color={i === 0 ? colors.textFaint : colors.text} />
                </Pressable>
                <Text variant="caption" tone="muted">
                  {i === 0 ? o.photosCover : `#${i + 1}`}
                </Text>
                <Pressable onPress={() => void move(i, 1)} disabled={i === rows.length - 1 || busy !== null} hitSlop={6} accessibilityLabel="Move right">
                  <Icon name="chevron-right" size={18} color={i === rows.length - 1 ? colors.textFaint : colors.text} />
                </Pressable>
                <Pressable onPress={() => hide(p.id)} disabled={busy !== null} hitSlop={6} accessibilityLabel={o.photosRemove} style={styles.trash}>
                  <Icon name="trash-2" size={16} color={colors.danger} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
      {canUpload ? (
        <Text variant="caption" tone="faint">
          {o.photosRights}
        </Text>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.xl,
  },
  intro: {
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  block: {
    gap: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  options: {
    gap: spacing.xs,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  flex: {
    flex: 1,
  },
  selfStart: {
    alignSelf: 'flex-start',
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
  trash: {
    marginLeft: 'auto',
  },
});
