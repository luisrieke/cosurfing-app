import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SignupGate } from '@/components/SignupGate';
import { Button, Icon, Notice, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { stashSpeedTest, takeStashedSpeedTest } from '@/lib/funnel';
import { saveSpeedTest } from '@/lib/queries';
import { type SpeedPhase, type SpeedResult, type TestContext, captureTestContext, runSpeedTest } from '@/lib/speedtest';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';

type State =
  | { kind: 'idle' }
  | { kind: 'running'; phase: SpeedPhase; ping: number | null; down: number | null; up: number | null }
  | { kind: 'done'; result: SpeedResult; context: TestContext }
  | { kind: 'error' };

export function SpeedTestPanel({ placeId, onSaved }: { placeId: string; onSaved: () => void }) {
  const { user, refresh } = useAuth();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger' | 'warning'; text: string } | null>(null);

  // A result measured before signing up comes back here after the sign-in redirect.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void takeStashedSpeedTest(placeId).then((t) => {
      if (!cancelled && t) {
        setState({
          kind: 'done',
          result: { downloadMbps: t.downloadMbps, uploadMbps: t.uploadMbps, pingMs: t.pingMs },
          context: t.context,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, placeId]);

  const start = async () => {
    setMessage(null);
    setState({ kind: 'running', phase: 'ping', ping: null, down: null, up: null });
    const contextPromise = captureTestContext();
    try {
      const result = await runSpeedTest((phase, value) => {
        setState((s) => {
          if (s.kind !== 'running') return s;
          const next = { ...s, phase };
          if (value !== null) {
            if (phase === 'ping') next.ping = value;
            if (phase === 'download') next.down = value;
            if (phase === 'upload') next.up = value;
          }
          return next;
        });
      });
      const context = await contextPromise;
      setState({ kind: 'done', result, context });
      if (!user) void stashSpeedTest({ placeId, ...result, context });
    } catch {
      setState({ kind: 'error' });
    }
  };

  const save = async () => {
    if (!user || state.kind !== 'done') return;
    setSaving(true);
    setMessage(null);
    try {
      const { verification } = await saveSpeedTest({
        placeId,
        downloadMbps: state.result.downloadMbps,
        uploadMbps: state.result.uploadMbps,
        pingMs: state.result.pingMs,
        ...state.context,
      });
      setMessage({
        tone: verification === 'verified' ? 'success' : 'warning',
        text: strings.speedtest.verification[verification],
      });
      setState({ kind: 'idle' });
      onSaved();
      void refresh();
    } catch (e) {
      const limited = e instanceof Error && e.message === 'speed_test_rate_limited';
      setMessage({ tone: limited ? 'warning' : 'danger', text: limited ? strings.speedtest.rateLimited : strings.common.somethingWentWrong });
    } finally {
      setSaving(false);
    }
  };

  const live =
    state.kind === 'running'
      ? { down: state.down, up: state.up, ping: state.ping }
      : state.kind === 'done'
        ? { down: state.result.downloadMbps, up: state.result.uploadMbps, ping: state.result.pingMs }
        : null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.icon}>
          <Icon name="activity" size={18} color={colors.accent} />
        </View>
        <View style={styles.headerText}>
          <Text variant="bodyStrong">{strings.speedtest.title}</Text>
          <Text variant="small" tone="muted">
            {strings.speedtest.intro}
          </Text>
        </View>
      </View>

      {live ? (
        <View style={styles.meters}>
          <Meter label={strings.speedtest.download} value={live.down} unit={strings.speedtest.mbps} active={state.kind === 'running' && state.phase === 'download'} />
          <Meter label={strings.speedtest.upload} value={live.up} unit={strings.speedtest.mbps} active={state.kind === 'running' && state.phase === 'upload'} />
          <Meter label={strings.speedtest.ping} value={live.ping} unit={strings.speedtest.ms} active={state.kind === 'running' && state.phase === 'ping'} />
        </View>
      ) : null}

      {state.kind === 'error' ? <Notice tone="danger" body={strings.speedtest.failed} /> : null}
      {message ? <Notice tone={message.tone} body={message.text} /> : null}
      {state.kind === 'done' && state.context.networkType === 'cellular' ? (
        <Notice tone="warning" body={strings.speedtest.cellularHint} />
      ) : null}

      {state.kind === 'done' ? (
        user ? (
          <View style={styles.actions}>
            <Button title={strings.speedtest.save} icon="check" onPress={() => void save()} loading={saving} />
            <Button title={strings.speedtest.again} variant="ghost" onPress={() => void start()} disabled={saving} />
          </View>
        ) : (
          <SignupGate compact title={strings.speedtest.signUpToSave} />
        )
      ) : (
        <Button
          title={state.kind === 'running' ? strings.speedtest.running : strings.speedtest.start}
          icon="play"
          variant="secondary"
          loading={state.kind === 'running'}
          onPress={() => void start()}
          style={styles.start}
        />
      )}
      <Text variant="caption" tone="faint">
        {strings.speedtest.locationNote} {strings.speedtest.provider}
      </Text>
    </View>
  );
}

function Meter({ label, value, unit, active }: { label: string; value: number | null; unit: string; active: boolean }) {
  return (
    <View style={[styles.meter, active && styles.meterActive]}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="heading" tone={value === null ? 'faint' : 'default'}>
        {value === null ? '–' : value >= 100 ? Math.round(value) : value.toFixed(1)}
        <Text variant="caption" tone="muted">
          {' '}
          {unit}
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSubtle,
  },
  header: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meters: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  meter: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  meterActive: {
    borderColor: colors.accent,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  start: {
    alignSelf: 'flex-start',
  },
});
