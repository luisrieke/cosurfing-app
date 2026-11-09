import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Button, Card, Chip, Input, Notice, Screen, Text, TopBar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { submitCancellation } from '@/lib/cancel';
import { formatDateTime, isValidEmail } from '@/lib/format';
import { strings } from '@/lib/strings';
import { spacing } from '@/lib/theme';

const c = strings.cancelContract;

export default function CancelScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [kind, setKind] = useState<'ordinary' | 'extraordinary'>('ordinary');
  const [reason, setReason] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [onDate, setOnDate] = useState(false);
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receivedAt, setReceivedAt] = useState<string | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const submit = async () => {
    if (!name.trim()) return setError(c.needName);
    if (!isValidEmail(email)) return setError(c.needEmail);
    if (kind === 'extraordinary' && !reason.trim()) return setError(c.needReason);
    if (onDate && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date).getTime() <= Date.now())) return setError(c.needDate);
    setBusy(true);
    setError(null);
    try {
      const res = await submitCancellation({
        name: name.trim(),
        email: email.trim(),
        kind,
        reason: kind === 'extraordinary' ? reason.trim() : undefined,
        date: onDate ? date : null,
      });
      setReceivedAt(res.receivedAt);
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      setError(message === 'rate_limited' ? c.rateLimited : strings.common.somethingWentWrong);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Head>
        <title>{`${strings.legal.cancel} · Cosurfing`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <TopBar title={strings.legal.cancel} onBack={back} />
      <View style={styles.intro}>
        <Text variant="title">{c.title}</Text>
        <Text tone="muted">{c.intro}</Text>
      </View>

      {receivedAt ? (
        <>
          <Notice tone="success" title={c.doneTitle} body={c.doneBody(formatDateTime(receivedAt), email.trim())} />
          <Card style={styles.summary}>
            <Text variant="bodyStrong">{c.summary}</Text>
            <Text variant="small">{`${c.contract}: ${c.contractValue}`}</Text>
            <Text variant="small">{`${c.kind}: ${kind === 'ordinary' ? c.ordinary : c.extraordinary}`}</Text>
            {kind === 'extraordinary' ? <Text variant="small">{`${c.reason}: ${reason.trim()}`}</Text> : null}
            <Text variant="small">{`${c.name}: ${name.trim()}`}</Text>
            <Text variant="small">{`${c.email}: ${email.trim()}`}</Text>
            <Text variant="small">{`${c.when}: ${onDate ? date : c.earliest}`}</Text>
            <Text variant="small">{`Received: ${formatDateTime(receivedAt)}`}</Text>
          </Card>
          {Platform.OS === 'web' ? <Button title={c.print} variant="secondary" icon="printer" onPress={() => window.print()} /> : null}
        </>
      ) : (
        <>
          <View style={styles.block}>
            <Text variant="smallStrong">{c.kind}</Text>
            <View style={styles.chips}>
              <Chip label={c.ordinary} selected={kind === 'ordinary'} onPress={() => setKind('ordinary')} />
              <Chip label={c.extraordinary} selected={kind === 'extraordinary'} onPress={() => setKind('extraordinary')} />
            </View>
          </View>
          {kind === 'extraordinary' ? (
            <Input label={c.reason} value={reason} onChangeText={setReason} placeholder={c.reasonPlaceholder} multiline maxLength={2000} />
          ) : null}
          <Input label={c.name} value={name} onChangeText={setName} autoComplete="name" maxLength={120} />
          <Input
            label={c.email}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
          />
          <View style={styles.block}>
            <Text variant="smallStrong">{c.contract}</Text>
            <Text variant="small">{c.contractValue}</Text>
          </View>
          <View style={styles.block}>
            <Text variant="smallStrong">{c.when}</Text>
            <View style={styles.chips}>
              <Chip label={c.earliest} selected={!onDate} onPress={() => setOnDate(false)} />
              <Chip label={c.onDate} selected={onDate} onPress={() => setOnDate(true)} />
            </View>
            {onDate ? <Input label={c.date} value={date} onChangeText={setDate} placeholder={c.datePlaceholder} maxLength={10} /> : null}
          </View>
          {error ? <Notice tone="danger" body={error} /> : null}
          <Button title={c.submit} variant="danger" size="lg" fullWidth loading={busy} onPress={submit} />
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
  summary: {
    gap: spacing.xs,
  },
});
