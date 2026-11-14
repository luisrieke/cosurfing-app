import Head from 'expo-router/head';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { RequireAuth } from '@/components/RequireAuth';
import { Button, Chip, EmptyState, Input, Notice, Screen, Skeleton, Text, TopBar } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { isReportKind, REPORT_KIND_ORDER, REPORT_KINDS } from '@/lib/placeReports';
import { createReport, getPlaceBySlug } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { spacing } from '@/lib/theme';
import type { PlaceReportKind } from '@/lib/types';

export default function ReportRoute() {
  const { slug, kind } = useLocalSearchParams<{ slug: string; kind?: string }>();
  const redirect = isReportKind(kind) ? `/place/${slug}/report?kind=${kind}` : `/place/${slug}/report`;
  return (
    <RequireAuth title={strings.report.title} message={strings.place.signInToReport} redirect={redirect}>
      <ReportScreen slug={slug!} initialKind={isReportKind(kind) ? kind : 'other'} />
    </RequireAuth>
  );
}

function ReportScreen({ slug, initialKind }: { slug: string; initialKind: PlaceReportKind }) {
  const router = useRouter();
  const { user } = useAuth();
  const placeQuery = useQuery(`place:${slug}`, () => getPlaceBySlug(slug));
  const place = placeQuery.data ?? null;
  const [kind, setKind] = useState<PlaceReportKind>(initialKind);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace(`/place/${slug}`));

  const submit = async () => {
    if (!user || !place) return;
    const text = kind === 'closed' && body.trim().length < 5 ? strings.report.closedBody : body;
    if (text.trim().length < 5) {
      setError(strings.report.minBody);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createReport(user.id, place.id, text, kind);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(false);
    }
  };

  if (placeQuery.loading) {
    return (
      <Screen>
        <TopBar title={strings.report.title} onBack={back} />
        <Skeleton height={28} width="60%" />
        <Skeleton height={120} />
      </Screen>
    );
  }
  if (!place) {
    return (
      <Screen>
        <TopBar title={strings.report.title} onBack={back} />
        <EmptyState icon="map-pin" title={strings.place.notFound} actionLabel={strings.notFound.home} onAction={() => router.replace('/')} />
      </Screen>
    );
  }

  const info = REPORT_KINDS[kind];
  const current = info.current?.(place) ?? null;

  return (
    <Screen>
      <Head>
        <title>{`${strings.report.title} · ${place.name} · Cosurfing`}</title>
      </Head>
      <TopBar title={strings.report.title} onBack={back} />
      <View style={styles.intro}>
        <Text variant="title">{place.name}</Text>
        <Text tone="muted">{strings.report.intro}</Text>
      </View>

      {sent ? (
        <>
          <Notice tone="success" body={strings.report.sent} />
          <Button title={strings.common.back} variant="secondary" onPress={back} />
        </>
      ) : (
        <>
          <View style={styles.block}>
            <Text variant="smallStrong">{strings.report.whatWrong}</Text>
            <View style={styles.kinds}>
              {REPORT_KIND_ORDER.map((k) => (
                <Chip
                  key={k}
                  label={REPORT_KINDS[k].label}
                  icon={REPORT_KINDS[k].icon}
                  selected={kind === k}
                  onPress={() => {
                    setKind(k);
                    setError(null);
                  }}
                />
              ))}
            </View>
          </View>
          {current ? (
            <Text variant="small" tone="muted">
              {strings.report.currentValue(current)}
            </Text>
          ) : null}
          <Input
            value={body}
            onChangeText={setBody}
            placeholder={info.placeholder}
            multiline
            maxLength={1000}
            error={error}
            autoFocus
          />
          <Button title={strings.report.submit} size="lg" fullWidth loading={busy} onPress={submit} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    gap: spacing.xs,
  },
  block: {
    gap: spacing.sm,
  },
  kinds: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
