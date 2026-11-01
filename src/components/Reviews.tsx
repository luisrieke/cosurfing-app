import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { levelFor } from '@/lib/levels';
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

export function ReviewItem({ review }: { review: PlaceReview }) {
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
        {review.has_body ? (
          <View style={styles.lockedBody} accessibilityLabel={strings.funnel.lockedReviewsBody}>
            <View style={[styles.bar, { width: '92%' }]} />
            <View style={[styles.bar, { width: '78%' }]} />
            <View style={[styles.bar, { width: '55%' }]} />
          </View>
        ) : null}
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
  return (
    <View style={styles.item}>
      <View style={styles.itemHeader}>
        <View style={styles.avatar}>
          <Text variant="smallStrong" tone="accent">
            {(review.author_name ?? 'C').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.itemHeaderText}>
          <Text variant="smallStrong">
            {review.author_name ?? 'Cosurfer'}
            {review.is_own ? (
              <Text variant="small" tone="muted">
                {'  '}(you)
              </Text>
            ) : null}
          </Text>
          <Stars value={review.rating} size={14} />
        </View>
        <View style={styles.itemMeta}>
          <Text variant="caption" tone="faint">
            {formatDate(review.created_at)}
          </Text>
          {review.author_points !== null ? (
            <Text variant="caption" tone="muted">
              {levelFor(review.author_points).name}
            </Text>
          ) : null}
        </View>
      </View>
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
      {review.body ? <Text>{review.body}</Text> : null}
      {review.status === 'hidden' ? (
        <Text variant="caption" tone="danger">
          {strings.review.hiddenNote}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
  },
  itemMeta: {
    alignItems: 'flex-end',
    gap: 2,
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
  lockedBody: {
    gap: 6,
    paddingTop: 2,
  },
});
