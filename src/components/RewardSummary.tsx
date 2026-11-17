import { StyleSheet, View } from 'react-native';

import { Button, Icon, type IconName, Text } from '@/components/ui';
import { UserAvatar } from '@/components/UserBadge';
import { levelFor } from '@/lib/levels';
import type { RewardKey, RewardLine } from '@/lib/points';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';

const ICONS: Record<RewardKey, IconName> = {
  rating: 'star',
  text: 'edit-3',
  longText: 'file-text',
  first: 'flag',
  photos: 'camera',
  facts: 'check-square',
};

function lineLabel(line: RewardLine): string {
  const l = strings.review.rewardLines;
  if (line.key === 'photos') return l.photos(line.count ?? 0);
  if (line.key === 'facts') return l.facts(line.count ?? 0);
  return l[line.key];
}

/** The thank-you card after a contribution, modelled on the Google Maps points dialog. */
export function RewardSummary({
  lines,
  total,
  name,
  avatarPath,
  points,
  pending,
  note,
  onContributeMore,
  onProfile,
}: {
  lines: RewardLine[];
  total: number;
  name: string;
  avatarPath: string | null;
  /** All points, including the ones still under review. */
  points: number;
  pending: number;
  note?: string | null;
  onContributeMore?: () => void;
  onProfile?: () => void;
}) {
  const level = levelFor(points);
  return (
    <View style={styles.card}>
      <View style={styles.avatarWrap}>
        <UserAvatar name={name} path={avatarPath} size={72} />
        <View style={styles.levelDot}>
          <Text variant="caption" style={styles.levelNum}>
            {level.index + 1}
          </Text>
        </View>
      </View>
      <Text variant="display" align="center">
        {strings.review.rewardTitle(total)}
      </Text>
      <Text tone="muted" align="center">
        {strings.review.rewardBody}
      </Text>
      {onProfile ? <Button title={strings.review.rewardMyProfile} variant="ghost" size="sm" onPress={onProfile} /> : null}

      <View style={styles.lines}>
        {lines.map((line, i) => (
          <View key={line.key} style={[styles.line, i > 0 && styles.lineBorder]}>
            <Icon name={ICONS[line.key]} size={18} color={colors.textMuted} />
            <Text style={styles.flex}>{lineLabel(line)}</Text>
            <Text variant="bodyStrong">{`+${line.points}`}</Text>
          </View>
        ))}
      </View>

      <View style={styles.progress}>
        <View style={styles.progressHead}>
          <Text variant="smallStrong">{level.name}</Text>
          {level.nextName ? (
            <Text variant="caption" tone="muted">
              {strings.levels.nextLevel((level.nextAt ?? 0) - points, level.nextName)}
            </Text>
          ) : null}
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.max(4, level.progress * 100)}%` }]} />
        </View>
        {level.nextAt !== null ? (
          <Text variant="caption" tone="muted">
            {strings.review.rewardProgress(points, level.nextAt)}
          </Text>
        ) : null}
        {pending > 0 ? (
          <Text variant="caption" tone="muted">
            {strings.levels.underReview(pending)}
          </Text>
        ) : null}
      </View>

      {note ? (
        <Text variant="caption" tone="muted" align="center">
          {note}
        </Text>
      ) : null}
      {onContributeMore ? (
        <Button title={strings.review.rewardContributeMore} icon="plus-circle" size="lg" fullWidth onPress={onContributeMore} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarWrap: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.star,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelNum: {
    color: colors.onAccent,
    fontWeight: '700',
  },
  lines: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  lineBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  progress: {
    alignSelf: 'stretch',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  progressHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.bgMuted,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
});
