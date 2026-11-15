import Head from 'expo-router/head';
import { useMemo, useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';

import { AdminShell } from '@/components/admin/AdminShell';
import { Badge, Button, Card, Chip, Notice, Skeleton, Text } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { adminGetTasks, adminSetTaskStatus, type AdminTask } from '@/lib/queries';
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
  const [filter, setFilter] = useState<AdminTask['status']>('open');
  const [error, setError] = useState<string | null>(null);

  const all = useMemo(() => tasks.data ?? [], [tasks.data]);
  const open = all.filter((t) => t.status === 'open').length;
  const visible = all.filter((t) => t.status === filter);

  const setStatus = async (task: AdminTask, status: AdminTask['status']) => {
    setError(null);
    const update = (id: string, next: AdminTask['status']) =>
      tasks.setData((prev) => prev?.map((t) => (t.id === id ? { ...t, status: next } : t)));
    update(task.id, status);
    try {
      await adminSetTaskStatus(task.id, status);
    } catch (e) {
      update(task.id, task.status);
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    }
  };

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
          <View style={styles.chips}>
            <Chip label={`${strings.admin.tasksOpenFilter} · ${open}`} selected={filter === 'open'} onPress={() => setFilter('open')} />
            <Chip label={`${strings.admin.tasksDoneFilter} · ${all.length - open}`} selected={filter === 'done'} onPress={() => setFilter('done')} />
          </View>
          {error ? <Notice tone="danger" body={error} /> : null}
          {visible.length === 0 ? (
            <Text tone="muted">{strings.admin.noItems}</Text>
          ) : (
            visible.map((t) => <TaskItem key={t.id} task={t} onStatus={(status) => setStatus(t, status)} />)
          )}
        </>
      )}
    </AdminShell>
  );
}

function TaskItem({ task, onStatus }: { task: AdminTask; onStatus: (status: AdminTask['status']) => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const didCopy = await copyText(task.prompt);
    setCopied(didCopy);
    if (didCopy) setTimeout(() => setCopied(false), 2000);
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
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: {
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
    gap: spacing.xs,
  },
});
