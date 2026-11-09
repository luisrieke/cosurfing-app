import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Text } from '@/components/ui';
import { confirmedPoints, levelFor } from '@/lib/levels';
import { avatarUrl } from '@/lib/storage';
import { strings } from '@/lib/strings';
import { colors, spacing } from '@/lib/theme';

export function UserAvatar({ name, path, size = 36 }: { name: string; path?: string | null; size?: number }) {
  const letter = (name || 'C').charAt(0).toUpperCase();
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {path ? (
        <Image source={{ uri: avatarUrl(path) }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <Text variant="smallStrong" tone="accent">
          {letter}
        </Text>
      )}
    </View>
  );
}

/** Level number, like a Google Maps badge, plus the Local Guide label when it applies. */
export function LevelMark({
  points,
  pending = 0,
  guide = false,
}: {
  points: number;
  pending?: number;
  guide?: boolean;
}) {
  const level = levelFor(confirmedPoints(points, pending));
  return (
    <View style={styles.levelRow}>
      <View style={styles.levelCircle}>
        <Text variant="caption" style={styles.levelNum}>
          {level.index + 1}
        </Text>
      </View>
      <Text variant="caption" tone="muted">
        {level.name}
      </Text>
      {guide ? <Badge label={strings.levels.localGuide} tone="accent" icon="award" /> : null}
    </View>
  );
}

/** Opens a public profile when the viewer is allowed to know who this is. */
export function ProfileLink({ userId, children }: { userId: string | null | undefined; children: ReactNode }) {
  const router = useRouter();
  if (!userId) return <>{children}</>;
  return (
    <Pressable
      onPress={() => router.push(`/u/${userId}`)}
      accessibilityRole="link"
      style={({ pressed }) => [styles.link, pressed && { opacity: 0.75 }]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  levelCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelNum: {
    color: colors.onAccent,
    fontWeight: '700',
    fontSize: 10,
    lineHeight: 12,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
    minWidth: 0,
  },
});
