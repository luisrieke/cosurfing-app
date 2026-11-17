import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { AdminShell } from '@/components/admin/AdminShell';
import { UserAvatar } from '@/components/UserBadge';
import { Badge, Button, Card, Chip, Input, Notice, Skeleton, Text } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/lib/auth';
import { formatDateTime, normalizeWebsite } from '@/lib/format';
import { adminGetPlaceChangeTasks, adminUpdatePlaceChangeTask, type PlaceChangeTask } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { spacing } from '@/lib/theme';

type Patch = Partial<Pick<PlaceChangeTask, 'status' | 'thanked_at' | 'reached_out_at'>>;

function summarize(task: PlaceChangeTask): string {
  const parts = Object.entries(task.kind_counts)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([kind, n]) => `${strings.admin.changesKinds[kind] ?? kind}${(n ?? 0) > 1 ? ` ×${n}` : ''}`);
  if (task.fact_keys.length > 0) parts.push(`(${task.fact_keys.join(', ')})`);
  return parts.join(' · ');
}

export default function AdminChanges() {
  const { isAdmin } = useAuth();
  const tasks = useQuery('admin-change-tasks', adminGetPlaceChangeTasks, isAdmin);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [newestFirst, setNewestFirst] = useState(true);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (tasks.data ?? []).filter(
      (t) =>
        !q ||
        t.place_name.toLowerCase().includes(q) ||
        (t.city_name ?? '').toLowerCase().includes(q) ||
        t.author_name.toLowerCase().includes(q),
    );
  }, [tasks.data, search]);

  const openTasks = visible.filter((t) => t.status === 'open');
  const doneTasks = visible
    .filter((t) => t.status === 'done')
    .sort((x, y) => {
      const diff = (x.completed_at ?? '').localeCompare(y.completed_at ?? '');
      return newestFirst ? -diff : diff;
    });

  // Optimistic: show the change right away, roll back when saving fails.
  const update = async (task: PlaceChangeTask, patch: Patch) => {
    setError(null);
    const apply = (id: string, next: Patch & { completed_at?: string | null }) =>
      tasks.setData((prev) => prev?.map((t) => (t.id === id ? { ...t, ...next } : t)));
    const previous = {
      status: task.status,
      thanked_at: task.thanked_at,
      reached_out_at: task.reached_out_at,
      completed_at: task.completed_at,
    };
    // completed_at is set by a database trigger; mirror it locally for the sort order.
    apply(task.id, { ...patch, ...(patch.status ? { completed_at: patch.status === 'done' ? new Date().toISOString() : null } : {}) });
    try {
      await adminUpdatePlaceChangeTask(task.id, patch);
    } catch (e) {
      apply(task.id, previous);
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    }
  };

  const renderTask = (t: PlaceChangeTask) => <ChangeTaskItem key={t.id} task={t} onUpdate={(patch) => update(t, patch)} />;

  return (
    <AdminShell title={strings.admin.changes}>
      <Head>
        <title>Change follow-ups · Admin · Cosurfing</title>
      </Head>
      <Text tone="muted">{strings.admin.changesHint}</Text>
      {tasks.loading && !tasks.data ? (
        <Skeleton height={120} />
      ) : tasks.error ? (
        <Notice tone="danger" body={tasks.error.message} />
      ) : (
        <>
          <Input value={search} onChangeText={setSearch} placeholder={strings.admin.changesSearch} autoCapitalize="none" />
          {error ? <Notice tone="danger" body={error} /> : null}
          <Text variant="bodyStrong">{`${strings.admin.changesOpenHeading} · ${openTasks.length}`}</Text>
          {openTasks.length === 0 ? <Text tone="muted">{strings.admin.noItems}</Text> : openTasks.map(renderTask)}
          <Text variant="bodyStrong" style={styles.doneHeading}>{`${strings.admin.changesDoneHeading} · ${doneTasks.length}`}</Text>
          {doneTasks.length > 1 ? (
            <View style={styles.row}>
              <Chip label={strings.admin.tasksSortNewest} selected={newestFirst} onPress={() => setNewestFirst(true)} />
              <Chip label={strings.admin.tasksSortOldest} selected={!newestFirst} onPress={() => setNewestFirst(false)} />
            </View>
          ) : null}
          {doneTasks.length === 0 ? <Text tone="muted">{strings.admin.changesNoDone}</Text> : doneTasks.map(renderTask)}
        </>
      )}
    </AdminShell>
  );
}

function ChangeTaskItem({ task, onUpdate }: { task: PlaceChangeTask; onUpdate: (patch: Patch) => void }) {
  const router = useRouter();
  const isOpen = task.status === 'open';
  const bothSteps = Boolean(task.thanked_at && task.reached_out_at);

  const toggle = (field: 'thanked_at' | 'reached_out_at') =>
    onUpdate({ [field]: task[field] ? null : new Date().toISOString() });

  const thankByEmail = () => {
    if (!task.author_email) return;
    const subject = encodeURIComponent(strings.admin.changesThanksSubject(task.place_name));
    const body = encodeURIComponent(strings.admin.changesThanksBody(task.author_name, task.place_name));
    void Linking.openURL(`mailto:${task.author_email}?subject=${subject}&body=${body}`);
  };

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Badge label={summarize(task) || '—'} tone="accent" />
        {task.previous_count > 0 ? (
          <Badge
            label={`${strings.admin.changesListedBefore(task.previous_count)} · ${
              task.previous_reached_out_at
                ? strings.admin.changesReachedOutBefore(formatDateTime(task.previous_reached_out_at))
                : strings.admin.changesNeverReachedOut
            }`}
            tone="warning"
          />
        ) : null}
      </View>

      <View style={styles.head}>
        <Text variant="bodyStrong">{task.place_name}</Text>
        <Text variant="small" tone="muted">
          {[task.city_name, strings.admin.changesLastChange(formatDateTime(task.last_change_at))].filter(Boolean).join(' · ')}
        </Text>
      </View>

      <View style={styles.person}>
        <UserAvatar name={task.author_name} path={task.author_avatar_path} size={28} />
        <View style={styles.personText}>
          <Text variant="smallStrong">{strings.admin.changesChangedBy(task.author_name)}</Text>
          {task.author_email ? (
            <Text variant="caption" tone="muted" selectable>
              {task.author_email}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.row}>
        <Button title={strings.account.viewProfile} size="sm" variant="ghost" onPress={() => router.push(`/u/${task.user_id}`)} />
        <Button title={strings.admin.changesOpenPlace} size="sm" variant="ghost" onPress={() => router.push(`/place/${task.place_slug}`)} />
        <Button title={strings.admin.editPlace} size="sm" variant="ghost" onPress={() => router.push(`/admin/places/${task.place_id}`)} />
        {task.place_website ? (
          <Button
            title={strings.admin.openWebsite}
            size="sm"
            variant="ghost"
            onPress={() => {
              const url = normalizeWebsite(task.place_website);
              if (url) void Linking.openURL(url);
            }}
          />
        ) : null}
      </View>

      <View style={styles.row}>
        <Chip
          label={`${strings.admin.changesStepThank}${task.thanked_at ? ` · ${strings.admin.changesStepDone(formatDateTime(task.thanked_at))}` : ''}`}
          icon={task.thanked_at ? 'check-square' : 'square'}
          selected={Boolean(task.thanked_at)}
          onPress={() => toggle('thanked_at')}
        />
        <Chip
          label={`${strings.admin.changesStepReach}${task.reached_out_at ? ` · ${strings.admin.changesStepDone(formatDateTime(task.reached_out_at))}` : ''}`}
          icon={task.reached_out_at ? 'check-square' : 'square'}
          selected={Boolean(task.reached_out_at)}
          onPress={() => toggle('reached_out_at')}
        />
      </View>

      <View style={styles.row}>
        <Button
          title={task.author_email ? strings.admin.changesThankByEmail : strings.admin.changesNoEmail}
          size="sm"
          variant="secondary"
          icon="mail"
          disabled={!task.author_email}
          onPress={thankByEmail}
        />
        {isOpen ? (
          <Button
            title={strings.admin.changesMarkDone}
            size="sm"
            variant={bothSteps ? 'primary' : 'secondary'}
            onPress={() => onUpdate({ status: 'done' })}
          />
        ) : (
          <Button title={strings.admin.changesReopen} size="sm" variant="ghost" onPress={() => onUpdate({ status: 'open' })} />
        )}
        {!isOpen && task.completed_at ? (
          <Text variant="small" tone="muted">
            {strings.admin.tasksClosedAt(formatDateTime(task.completed_at))}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  doneHeading: {
    marginTop: spacing.lg,
  },
  card: {
    gap: spacing.sm,
  },
  head: {
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  personText: {
    flex: 1,
    minWidth: 0,
  },
});
