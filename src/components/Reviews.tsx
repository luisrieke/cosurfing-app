import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ReportButton } from '@/components/ReportButton';
import { LevelMark, ProfileLink, UserAvatar } from '@/components/UserBadge';
import { Button, Icon, Text } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import type { PlaceReview } from '@/lib/types';

export function Stars({
  value,
  size = 16,
  onChange,
}: {
  value: number;
  size?: number;
  onChange?: (v: number) => void;
}) {
  return (
    <View style={styles.stars} accessibilityRole={onChange ? 'adjustable' : undefined} accessibilityLabel={`${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) =>
        onChange ? (
          <Pressable key={i} onPress={() => onChange(i)} hitSlop={6} accessibilityLabel={`${i} stars`}>
            <StarIcon filled={i <= value} size={size} />
          </Pressable>
        ) : (
          <StarIcon key={i} filled={i <= value} size={size} />
        ),
      )}
    </View>
  );
}

function StarIcon({ filled, size }: { filled: boolean; size: number }) {
  return (
    <Ionicons
      name={filled ? 'star' : 'star-outline'}
      size={size}
      color={filled ? colors.star : colors.border}
    />
  );
}

/** Stand-in text drawn as a blur; the real review text never reaches the client while locked. */
function BlurredBody({ onUnlock, unlocking }: { onUnlock?: () => void; unlocking?: boolean }) {
  return (
    <View style={styles.blurWrap} accessible accessibilityLabel={strings.place.lockedReview}>
      <Text style={styles.blurred} selectable={false} importantForAccessibility="no-hide-descendants" aria-hidden>
        {strings.place.lockedReviewFiller}
      </Text>
      <View style={styles.blurOverlay}>
        {onUnlock ? (
          <Button title={strings.place.unlockReview} icon="unlock" size="sm" variant="secondary" loading={unlocking} onPress={onUnlock} />
        ) : (
          <View style={styles.blurLock}>
            <Icon name="lock" size={14} color={colors.textMuted} />
          </View>
        )}
      </View>
    </View>
  );
}

interface ReviewItemProps {
  review: PlaceReview;
  /** Shown on reviews with locked text while the user still has unlocks left. */
  onUnlock?: () => void;
  unlocking?: boolean;
}

export function ReviewItem({ review, onUnlock, unlocking }: ReviewItemProps) {
  if (review.is_locked) {
    return (
      <View style={styles.item}>
        <View style={styles.itemHeader}>
          <View style={[styles.avatar, styles.avatarLocked]}>
            <Icon name="lock" size={14} color={colors.textFaint} />
          </View>
          <View style={styles.itemHeaderText}>
            <View style={[styles.bar, { width: 96 }]} />
            <Stars value={review.rating} size={14} />
          </View>
          <Text variant="caption" tone="faint">
            {formatDate(review.created_at)}
          </Text>
        </View>
        {review.has_body ? <BlurredBody /> : null}
      </View>
    );
  }
  const parts = strings.place.detailParts;
  const details: { label: string; value: number | null }[] = [
    { label: parts.wifi, value: review.wifi_rating },
    { label: parts.power, value: review.power_rating },
    { label: parts.quiet, value: review.quiet_rating },
    { label: parts.comfort, value: review.comfort_rating },
    { label: parts.value, value: review.value_rating },
  ];
  const shown = details.filter((d) => d.value !== null);
  const name = review.author_name ?? 'Cosurfer';
  return (
    <View style={styles.item}>
      <View style={styles.itemHeader}>
        <ProfileLink userId={review.author_id}>
          <UserAvatar name={name} path={review.author_avatar_path} />
          <View style={styles.itemHeaderText}>
            <Text variant="smallStrong">
              {name}
              {review.is_own ? (
                <Text variant="small" tone="muted">
                  {'  '}(you)
                </Text>
              ) : null}
            </Text>
            {review.author_points !== null ? (
              <LevelMark
                points={review.author_points}
                pending={review.author_points_pending ?? 0}
                guide={review.author_is_guide}
              />
            ) : null}
            <Stars value={review.rating} size={14} />
          </View>
        </ProfileLink>
        <Text variant="caption" tone="faint">
          {formatDate(review.created_at)}
        </Text>
        {!review.is_own ? <ReportButton type="review" id={review.id} /> : null}
      </View>
      {review.coffee_program ? (
        <View style={styles.programLabel}>
          <Icon name="coffee" size={12} color={colors.textMuted} />
          <Text variant="caption" tone="muted" style={styles.programText}>
            {strings.coffee.reviewLabel}
          </Text>
        </View>
      ) : null}
      {shown.length > 0 || review.calls_ok !== null ? (
        <View style={styles.details}>
          {shown.map((d) => (
            <View key={d.label} style={styles.detail}>
              <Text variant="caption" tone="muted">
                {d.label}
              </Text>
              <Text variant="caption" style={styles.detailValue}>
                {d.value}/5
              </Text>
            </View>
          ))}
          {review.calls_ok !== null ? (
            <View style={styles.detail}>
              <Icon name="video" size={12} color={review.calls_ok ? colors.success : colors.danger} />
              <Text variant="caption" style={{ color: review.calls_ok ? colors.success : colors.danger }}>
                {review.calls_ok ? strings.review.callsOkYes : strings.review.callsOkNo}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {review.body_locked ? <BlurredBody onUnlock={onUnlock} unlocking={unlocking} /> : review.body ? <Text>{review.body}</Text> : null}
      {review.status === 'hidden' ? (
        <Text variant="caption" tone="danger">
          {strings.review.hiddenNote}
        </Text>
      ) : null}
      {review.status === 'pending' ? (
        <Text variant="caption" tone="muted">
          {strings.review.pendingNote}
        </Text>
      ) : null}
      {review.status === 'rejected' ? (
        <Text variant="caption" tone="danger">
          {strings.review.rejectedNote}
        </Text>
      ) : null}
      {review.edit_status === 'pending' ? (
        <Text variant="caption" tone="muted">
          {strings.review.editPendingNote}
        </Text>
      ) : null}
      {review.edit_status === 'rejected' ? (
        <Text variant="caption" tone="danger">
          {strings.review.editRejectedNote}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  programLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  programText: {
    flex: 1,
  },
  stars: {
    flexDirection: 'row',
    gap: 2,
  },
  item: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  itemHeaderText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  details: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  detail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.bgMuted,
  },
  detailValue: {
    fontWeight: '600',
    color: colors.text,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLocked: {
    backgroundColor: colors.bgMuted,
  },
  bar: {
    height: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.bgMuted,
  },
  blurWrap: {
    position: 'relative',
  },
  blurred: {
    color: 'transparent',
    textShadowColor: 'rgba(23,21,15,0.55)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 9,
    userSelect: 'none',
  },
  blurOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blurLock: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
