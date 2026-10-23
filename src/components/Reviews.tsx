import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
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
        <View style={styles.lockedBody} accessibilityLabel={strings.place.lockedReviews}>
          <View style={[styles.bar, { width: '92%' }]} />
          <View style={[styles.bar, { width: '78%' }]} />
          <View style={[styles.bar, { width: '55%' }]} />
        </View>
      </View>
    );
  }
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
        <Text variant="caption" tone="faint">
          {formatDate(review.created_at)}
        </Text>
      </View>
      <Text>{review.body}</Text>
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
