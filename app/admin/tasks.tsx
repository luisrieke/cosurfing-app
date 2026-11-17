import Head from 'expo-router/head';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';

import { AdminShell } from '@/components/admin/AdminShell';
import { Badge, Button, Card, Chip, Notice, Skeleton, Text } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { adminGetTasks, adminMarkTaskCopied, adminSetTaskStatus, type AdminTask } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';

async function copyText(text: string): Promise<boolean> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  await Share.share({ message: text });
  return false;
}

export default function AdminTasks() {
  const { isAdmin } = useAuth();
  const tasks = useQuery('admin-tasks', adminGetTasks, isAdmin);
  const [error, setError] = useState<string | null>(null);

  const all = useMemo(() => tasks.data ?? [], [tasks.data]);
  const openTasks = all.filter((t) => t.status === 'open');
  const [newestFirst, setNewestFirst] = useState(true);
  const solvedTasks = all
    .filter((t) => t.status === 'done')
    .sort((x, y) => {
      const diff = (x.completed_at ?? '').localeCompare(y.completed_at ?? '');
      return newestFirst ? -diff : diff;
    });

  const setStatus = async (task: AdminTask, status: AdminTask['status']) => {
    setError(null);
    const update = (id: string, next: AdminTask['status'], completedAt: string | null) =>
      tasks.setData((prev) => prev?.map((t) => (t.id === id ? { ...t, status: next, completed_at: completedAt } : t)));
    update(task.id, status, status === 'done' ? new Date().toISOString() : null);
    try {
      await adminSetTaskStatus(task.id, status);
    } catch (e) {
      update(task.id, task.status, task.completed_at);
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    }
  };

  const markCopied = async (task: AdminTask) => {
    const copiedAt = new Date().toISOString();
    tasks.setData((prev) => prev?.map((t) => (t.id === task.id ? { ...t, copied_at: copiedAt } : t)));
    try {
      await adminMarkTaskCopied(task.id, copiedAt);
    } catch (e) {
      tasks.setData((prev) => prev?.map((t) => (t.id === task.id ? { ...t, copied_at: task.copied_at } : t)));
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    }
  };

  const renderTask = (t: AdminTask) => (
    <TaskItem key={t.id} task={t} onStatus={(status) => setStatus(t, status)} onCopied={() => markCopied(t)} />
  );

  return (
    <AdminShell title={strings.admin.tasks}>
      <Head>
        <title>Open tasks · Admin · Cosurfing</title>
      </Head>
      <Text tone="muted">{strings.admin.tasksHint}</Text>
      {tasks.loading && !tasks.data ? (
        <Skeleton height={120} />
      ) : tasks.error ? (
        <Notice tone="danger" body={tasks.error.message} />
      ) : (
        <>
          {error ? <Notice tone="danger" body={error} /> : null}
          <Text variant="bodyStrong">{`${strings.admin.tasksOpenFilter} · ${openTasks.length}`}</Text>
          {openTasks.length === 0 ? (
            <Text tone="muted">{strings.admin.noItems}</Text>
          ) : (
            openTasks.map(renderTask)
          )}
          <Text variant="bodyStrong" style={styles.solvedHeading}>{`${strings.admin.tasksSolved} · ${solvedTasks.length}`}</Text>
          {solvedTasks.length > 1 ? (
            <View style={styles.sortRow}>
              <Chip label={strings.admin.tasksSortNewest} selected={newestFirst} onPress={() => setNewestFirst(true)} />
              <Chip label={strings.admin.tasksSortOldest} selected={!newestFirst} onPress={() => setNewestFirst(false)} />
            </View>
          ) : null}
          {solvedTasks.length === 0 ? <Text tone="muted">{strings.admin.tasksNoSolved}</Text> : solvedTasks.map(renderTask)}
        </>
      )}
    </AdminShell>
  );
}

function formatAgo(iso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return strings.admin.tasksJustNow;
  if (minutes < 60) return strings.admin.tasksMinutesAgo(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return strings.admin.tasksHoursAgo(hours);
  return strings.admin.tasksDaysAgo(Math.floor(hours / 24));
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function TaskItem({
  task,
  onStatus,
  onCopied,
}: {
  task: AdminTask;
  onStatus: (status: AdminTask['status']) => void;
  onCopied: () => void;
}) {
  const now = useNow(!!task.copied_at);
  const closedAt = task.status === 'done' && task.completed_at ? new Date(task.completed_at) : null;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const didCopy = await copyText(task.prompt);
    setCopied(didCopy);
    if (didCopy) setTimeout(() => setCopied(false), 2000);
    onCopied();
  };

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Badge label={strings.admin.tasksCategories[task.category] ?? task.category} tone="warning" />
        <Text variant="bodyStrong">{task.title}</Text>
        {task.description ? (
          <Text variant="small" tone="muted">
            {task.description}
          </Text>
        ) : null}
      </View>
      <Text variant="caption" tone="faint">
        {strings.admin.tasksPrompt}
      </Text>
      <View style={styles.prompt}>
        <Text variant="small" selectable>
          {task.prompt}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button title={copied ? strings.admin.tasksCopied : strings.admin.tasksCopy} size="sm" variant="secondary" icon="copy" onPress={copy} />
        {task.status === 'open' ? (
          <Button title={strings.admin.tasksMarkDone} size="sm" onPress={() => onStatus('done')} />
        ) : (
          <Button title={strings.admin.tasksReopen} size="sm" variant="ghost" onPress={() => onStatus('open')} />
        )}
        {closedAt ? (
          <Text variant="small" tone="muted">
            {strings.admin.tasksClosedAt(closedAt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))}
          </Text>
        ) : null}
        {task.copied_at ? (
          <Text variant="small" tone="success">
            {strings.admin.tasksClickedCopy(formatAgo(task.copied_at, now))}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  solvedHeading: {
    marginTop: spacing.lg,
  },
  sortRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  card: {
    gap: spacing.sm,
  },
  head: {
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  prompt: {
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.glass,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
});
