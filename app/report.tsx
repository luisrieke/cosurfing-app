import Head from 'expo-router/head';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Chip, EmptyState, Icon, Input, Notice, Screen, Text, TopBar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isValidEmail } from '@/lib/format';
import { submitContentReport } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, spacing } from '@/lib/theme';
import type { ContentReportReason, ReportTargetType } from '@/lib/types';

const TARGETS = Object.keys(strings.contentReport.targets) as ReportTargetType[];
const REASONS = Object.keys(strings.contentReport.reasons) as ContentReportReason[];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ContentReportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string; id?: string }>();
  const { user } = useAuth();
  const type = TARGETS.includes(params.type as ReportTargetType) ? (params.type as ReportTargetType) : null;
  const id = params.id && UUID.test(params.id) ? params.id : null;
  const [reason, setReason] = useState<ContentReportReason | null>(null);
  const [body, setBody] = useState('');
  const [email, setEmail] = useState('');
  const [goodFaith, setGoodFaith] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const submit = async () => {
    if (!type || !id) return;
    if (!reason) {
      setError(strings.contentReport.reason);
      return;
    }
    if (body.trim().length < 10) {
      setError(strings.contentReport.minBody);
      return;
    }
    if (!user && !isValidEmail(email)) {
      setError(strings.contentReport.needEmail);
      return;
    }
    if (!goodFaith) {
      setError(strings.contentReport.needGoodFaith);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await submitContentReport({ targetType: type, targetId: id, reason, body, email: user ? null : email });
      setSent(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      setError(
        message.includes('rate_limited')
          ? strings.contentReport.rateLimited
          : message.includes('not_found')
            ? strings.contentReport.notFound
            : message || strings.common.somethingWentWrong,
      );
    } finally {
      setBusy(false);
    }
  };

  if (!type || !id) {
    return (
      <Screen>
        <TopBar title={strings.contentReport.title} onBack={back} />
        <EmptyState icon="flag" title={strings.contentReport.notFound} actionLabel={strings.notFound.home} onAction={() => router.replace('/')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Head>
        <title>{`${strings.contentReport.title} · Cosurfing`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <TopBar title={strings.contentReport.title} onBack={back} />
      <View style={styles.intro}>
        <Text variant="title">{strings.contentReport.title}</Text>
        <Text tone="muted">{strings.contentReport.intro}</Text>
        <Text variant="small">{strings.contentReport.reporting(strings.contentReport.targets[type])}</Text>
      </View>

      {sent ? (
        <>
          <Notice tone="success" body={strings.contentReport.sent} />
          <Button title={strings.contentReport.back} variant="secondary" onPress={back} />
        </>
      ) : (
        <>
          <View style={styles.block}>
            <Text variant="smallStrong">{strings.contentReport.reason}</Text>
            <View style={styles.chips}>
              {REASONS.map((r) => (
                <Chip key={r} label={strings.contentReport.reasons[r]} selected={reason === r} onPress={() => setReason(r)} />
              ))}
            </View>
          </View>
          <Input
            label={strings.contentReport.body}
            value={body}
            onChangeText={setBody}
            placeholder={strings.contentReport.bodyPlaceholder}
            multiline
            maxLength={2000}
          />
          {!user ? (
            <Input
              label={strings.contentReport.email}
              hint={strings.contentReport.emailHint}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
            />
          ) : null}
          <Pressable
            style={styles.check}
            onPress={() => setGoodFaith(!goodFaith)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: goodFaith }}
          >
            <Icon name={goodFaith ? 'check-square' : 'square'} size={20} color={goodFaith ? colors.accent : colors.textMuted} />
            <Text variant="small" style={styles.flex}>
              {strings.contentReport.goodFaith}
            </Text>
          </Pressable>
          {error ? <Notice tone="danger" body={error} /> : null}
          <Button title={strings.contentReport.submit} size="lg" fullWidth loading={busy} onPress={submit} />
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  check: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
});
