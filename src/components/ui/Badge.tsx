import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/lib/theme';
import type { PlaceCategory } from '@/lib/types';
import { strings } from '@/lib/strings';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

type Tone = 'neutral' | 'coworking' | 'cafe' | 'library' | 'coliving' | 'plus' | 'success' | 'warning' | 'danger' | 'accent';

const tones: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: colors.bgMuted, fg: colors.textMuted },
  coworking: { bg: colors.coworkingSoft, fg: colors.coworking },
  cafe: { bg: colors.cafeSoft, fg: colors.cafe },
  library: { bg: colors.librarySoft, fg: colors.library },
  coliving: { bg: colors.colivingSoft, fg: colors.coliving },
  plus: { bg: colors.plusSoft, fg: colors.plus },
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  accent: { bg: colors.accentSoft, fg: colors.accent },
};

interface BadgeProps {
  label: string;
  tone?: Tone;
  icon?: IconName;
  style?: ViewStyle;
}

export function Badge({ label, tone = 'neutral', icon, style }: BadgeProps) {
  const t = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }, style]}>
      {icon ? <Icon name={icon} size={12} color={t.fg} /> : null}
      <Text variant="caption" style={{ color: t.fg }}>
        {label}
      </Text>
    </View>
  );
}

const CATEGORY_ICONS: Record<PlaceCategory, IconName> = {
  coworking: 'briefcase',
  cafe: 'coffee',
  library: 'book-open',
  coliving: 'home',
};

export function categoryIcon(category: PlaceCategory): IconName {
  return CATEGORY_ICONS[category];
}

export function categoryLabel(category: PlaceCategory): string {
  return strings.explore[category];
}

export function CategoryBadge({ category, style }: { category: PlaceCategory; style?: ViewStyle }) {
  return <Badge label={categoryLabel(category)} tone={category} icon={categoryIcon(category)} style={style} />;
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
});
