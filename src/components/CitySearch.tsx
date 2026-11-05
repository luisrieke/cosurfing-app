import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { searchCities } from '@/lib/citySearch';
import { strings } from '@/lib/strings';
import { colors, fontFamily, radius, shadow, spacing } from '@/lib/theme';
import type { City, CitySearchResult } from '@/lib/types';

interface CitySearchProps {
  activeCities: City[];
  onSelectActive: (city: City) => void;
  onSelectOther: (result: CitySearchResult) => void;
  onManual: (query: string) => void;
  autoFocus?: boolean;
}

export function CitySearch({ activeCities, onSelectActive, onSelectOther, onManual, autoFocus }: CitySearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CitySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const q = query.trim();
  const searchable = q.length >= 2;

  // Debounced remote search. State is only set from async callbacks, never synchronously.
  useEffect(() => {
    if (!searchable) return;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchCities(q, controller.signal);
        if (!controller.signal.aborted) {
          setResults(res);
          setError(null);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setResults([]);
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q, searchable]);

  const changeQuery = (next: string) => {
    setQuery(next);
    setOpen(true);
    if (next.trim().length < 2) {
      abortRef.current?.abort();
      setResults([]);
      setLoading(false);
      setError(null);
    }
  };

  const matchActive = (r: CitySearchResult): City | undefined =>
    activeCities.find(
      (c) => c.name.toLowerCase() === r.name.toLowerCase() && c.country_code.toUpperCase() === r.countryCode,
    );

  const localMatches = activeCities.filter((c) => searchable && c.name.toLowerCase().startsWith(q.toLowerCase()));
  const remote = searchable ? results.filter((r) => !matchActive(r)) : [];
  const showDropdown = open && searchable;

  return (
    <View style={styles.wrap}>
      <View style={[styles.inputRow, focused && styles.inputRowFocused]}>
        <Icon name="search" size={20} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={changeQuery}
          onFocus={() => {
            setFocused(true);
            setOpen(true);
          }}
          onBlur={() => {
            setFocused(false);
            setTimeout(() => setOpen(false), 150);
          }}
          placeholder={strings.home.searchPlaceholder}
          placeholderTextColor={colors.textFaint}
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus={autoFocus}
          returnKeyType="search"
          onSubmitEditing={() => {
            const first = localMatches[0];
            if (first) onSelectActive(first);
            else if (remote[0]) onSelectOther(remote[0]);
            else if (query.trim()) onManual(query.trim());
          }}
          style={styles.input}
          accessibilityLabel={strings.home.searchPlaceholder}
        />
        {loading ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
        {query ? (
          <Pressable onPress={() => changeQuery('')} hitSlop={8} accessibilityLabel={strings.common.close}>
            <Icon name="x" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {showDropdown ? (
        <View style={styles.dropdown}>
          {localMatches.map((c) => (
            <Pressable key={c.id} style={styles.row} onPress={() => onSelectActive(c)} accessibilityRole="button">
              <View style={[styles.rowIcon, { backgroundColor: colors.accentSoft }]}>
                <Icon name="map-pin" size={16} color={colors.accent} />
              </View>
              <View style={styles.rowText}>
                <Text variant="bodyStrong">{c.name}</Text>
                <Text variant="small" tone="muted">
                  {c.country_name} · {strings.home.activeCities}
                </Text>
              </View>
              <Icon name="arrow-right" size={16} color={colors.textFaint} />
            </Pressable>
          ))}
          {remote.map((r) => (
            <Pressable
              key={`${r.name}-${r.countryCode}-${r.region ?? ''}`}
              style={styles.row}
              onPress={() => onSelectOther(r)}
              accessibilityRole="button"
            >
              <View style={styles.rowIcon}>
                <Icon name="clock" size={16} color={colors.textMuted} />
              </View>
              <View style={styles.rowText}>
                <Text variant="bodyStrong">{r.name}</Text>
                <Text variant="small" tone="muted">
                  {[r.region, r.countryName].filter(Boolean).join(', ')} · {strings.home.comingSoon}
                </Text>
              </View>
              <Icon name="arrow-right" size={16} color={colors.textFaint} />
            </Pressable>
          ))}
          {!loading && localMatches.length === 0 && remote.length === 0 ? (
            <View style={styles.empty}>
              <Text variant="small" tone="muted">
                {error ? strings.common.somethingWentWrong : strings.home.noResults}
              </Text>
            </View>
          ) : null}
          <Pressable style={[styles.row, styles.manualRow]} onPress={() => onManual(query.trim())} accessibilityRole="button">
            <View style={styles.rowIcon}>
              <Icon name="edit-3" size={16} color={colors.textMuted} />
            </View>
            <Text variant="smallStrong">{strings.home.addManually}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    zIndex: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 56,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  inputRowFocused: {
    borderColor: colors.textMuted,
  },
  input: {
    flex: 1,
    fontSize: 17,
    color: colors.text,
    fontFamily,
    height: '100%',
    outlineWidth: 0,
    outlineStyle: 'solid',
  },
  dropdown: {
    position: 'absolute',
    top: 62,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xs,
    ...(shadow.card as object),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  empty: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  manualRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
