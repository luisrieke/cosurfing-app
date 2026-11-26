import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { venueOfferPrice } from '@/components/place/VenueOffers';
import { Button, Chip, Icon, Input, Notice, Section, Skeleton, Text } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { normalizeWebsite } from '@/lib/format';
import { deleteVenueOffer, getVenueOffers, reorderVenueOffers, saveVenueOffer } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import type { VenueOffer, VenueOfferUnit } from '@/lib/types';

const UNITS: (VenueOfferUnit | null)[] = [null, 'hour', 'day', 'week', 'month', 'night'];
const URL_RE = /^https?:\/\/[^\s/]+\.[^\s]+$/i;

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

interface Draft {
  id: string | null;
  title: string;
  description: string;
  price: string;
  unit: VenueOfferUnit | null;
  url: string;
}

const emptyDraft: Draft = { id: null, title: '', description: '', price: '', unit: null, url: '' };

const toDraft = (o: VenueOffer): Draft => ({
  id: o.id,
  title: o.title,
  description: o.description ?? '',
  price: o.price_cents === null ? '' : (o.price_cents / 100).toFixed(2).replace(/\.00$/, ''),
  unit: o.price_unit,
  url: o.booking_url ?? '',
});

/** Venue offers with price and booking link, for owners (/owner) and admins (place editor). */
export function VenueOffersEditor({ placeId }: { placeId: string }) {
  const v = strings.venueOffers;
  const offers = useQuery(`venue-offers-edit:${placeId}`, () => getVenueOffers(placeId));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = offers.data ?? [];

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await offers.refetch(true);
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      setError(message.includes('venue_offer_limit_reached') ? v.limit : message || strings.common.somethingWentWrong);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!draft) return;
    const title = draft.title.trim();
    if (title.length < 2) return setError(v.titleRequired);
    const priceText = draft.price.trim().replace(',', '.');
    const cents = priceText ? Math.round(Number(priceText) * 100) : null;
    if (cents !== null && (!Number.isFinite(cents) || cents < 0)) return setError(v.invalidPrice);
    const url = normalizeWebsite(draft.url);
    if (url && !URL_RE.test(url)) return setError(v.invalidUrl);
    const ok = await run('save', () =>
      saveVenueOffer(
        placeId,
        draft.id,
        {
          title,
          description: draft.description.trim() || null,
          price_cents: cents,
          currency: 'EUR',
          price_unit: cents === null ? null : draft.unit,
          booking_url: url,
        },
        rows.length,
      ),
    );
    if (ok) setDraft(null);
  };

  const move = (index: number, dir: -1 | 1) => {
    const next = [...rows];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    void run('order', () => reorderVenueOffers(next.map((o) => o.id)));
  };

  return (
    <Section
      title={v.editorTitle}
      right={!draft ? <Button title={v.add} size="sm" variant="secondary" icon="plus" onPress={() => setDraft(emptyDraft)} /> : null}
    >
      <Text variant="small" tone="muted">
        {v.editorHint}
      </Text>
      {error ? <Notice tone="danger" body={error} /> : null}
      {offers.error ? <Notice tone="danger" body={offers.error.message} /> : null}
      {offers.loading && !offers.data ? (
        <Skeleton height={64} />
      ) : rows.length === 0 && !draft ? (
        <Text tone="muted">{v.none}</Text>
      ) : (
        rows.map((o, i) =>
          draft?.id === o.id ? null : (
            <View key={o.id} style={styles.row}>
              <View style={styles.order}>
                <Pressable onPress={() => move(i, -1)} disabled={i === 0 || busy !== null} hitSlop={6} accessibilityLabel="Move up">
                  <Icon name="chevron-up" size={16} color={i === 0 ? colors.textFaint : colors.text} />
                </Pressable>
                <Pressable onPress={() => move(i, 1)} disabled={i === rows.length - 1 || busy !== null} hitSlop={6} accessibilityLabel="Move down">
                  <Icon name="chevron-down" size={16} color={i === rows.length - 1 ? colors.textFaint : colors.text} />
                </Pressable>
              </View>
              <View style={styles.flex}>
                <Text variant="bodyStrong">{o.title}</Text>
                <Text variant="small" tone="muted" numberOfLines={2}>
                  {[venueOfferPrice(o), o.description, o.booking_url].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Button title={v.edit} size="sm" variant="ghost" icon="edit-2" disabled={busy !== null} onPress={() => setDraft(toDraft(o))} />
              <Button
                title={v.remove}
                size="sm"
                variant="ghost"
                icon="trash-2"
                loading={busy === o.id}
                disabled={busy !== null}
                onPress={() => confirm(v.removeConfirm, () => void run(o.id, () => deleteVenueOffer(o.id)))}
              />
            </View>
          ),
        )
      )}

      {draft ? (
        <View style={styles.form}>
          <Input label={v.titleLabel} value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} placeholder={v.titlePlaceholder} maxLength={80} />
          <Input
            label={v.descriptionLabel}
            optional
            value={draft.description}
            onChangeText={(description) => setDraft({ ...draft, description })}
            placeholder={v.descriptionPlaceholder}
            maxLength={300}
            multiline
          />
          <View style={styles.priceRow}>
            <View style={styles.price}>
              <Input
                label={`${v.priceLabel} (€)`}
                optional
                value={draft.price}
                onChangeText={(price) => setDraft({ ...draft, price })}
                placeholder={v.pricePlaceholder}
                keyboardType="decimal-pad"
              />
            </View>
            {draft.price.trim() ? (
              <View style={styles.flex}>
                <Text variant="smallStrong">{v.unitLabel}</Text>
                <View style={styles.chips}>
                  {UNITS.map((u) => (
                    <Chip key={u ?? 'once'} label={u ? v.per[u]! : v.unitOnce} selected={draft.unit === u} onPress={() => setDraft({ ...draft, unit: u })} />
                  ))}
                </View>
              </View>
            ) : null}
          </View>
          <Input
            label={v.urlLabel}
            optional
            value={draft.url}
            onChangeText={(url) => setDraft({ ...draft, url })}
            placeholder={v.urlPlaceholder}
            hint={v.urlHint}
            autoCapitalize="none"
            keyboardType="url"
          />
          <View style={styles.actions}>
            <Button title={v.save} icon="check" loading={busy === 'save'} disabled={busy !== null} onPress={() => void save()} />
            <Button
              title={v.cancel}
              variant="ghost"
              onPress={() => {
                setDraft(null);
                setError(null);
              }}
            />
          </View>
        </View>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  order: {
    gap: 2,
  },
  flex: {
    flex: 1,
    minWidth: 160,
  },
  form: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  priceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  price: {
    width: 140,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
