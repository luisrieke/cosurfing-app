import Head from 'expo-router/head';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { RequireAuth } from '@/components/RequireAuth';
import { Button, Chip, EmptyState, Input, Notice, Screen, Skeleton, Text, TopBar } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { createReport, getPlaceBySlug } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { spacing } from '@/lib/theme';
import type { PlaceReport } from '@/lib/types';

export default function ReportRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return (
    <RequireAuth title={strings.report.title} message={strings.place.signInToReport} redirect={`/place/${slug}/report`}>
      <ReportScreen slug={slug!} />
    </RequireAuth>
  );
}

function ReportScreen({ slug }: { slug: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const placeQuery = useQuery(`place:${slug}`, () => getPlaceBySlug(slug));
  const place = placeQuery.data ?? null;
  const [kind, setKind] = useState<PlaceReport['kind']>('other');
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

  return (
    <Screen>
      <Head>
        <title>{`Report · ${place.name} · Cosurfing`}</title>
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
          <View style={styles.kinds}>
            <Chip label={strings.report.kindOther} selected={kind === 'other'} onPress={() => setKind('other')} />
            <Chip
              label={strings.report.kindClosed}
              icon="x-circle"
              selected={kind === 'closed'}
              onPress={() => setKind('closed')}
            />
          </View>
          <Input
            value={body}
            onChangeText={setBody}
            placeholder={kind === 'closed' ? strings.report.closedPlaceholder : strings.report.placeholder}
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
  kinds: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
