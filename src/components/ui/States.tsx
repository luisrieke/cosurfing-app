import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/lib/theme';
import { strings } from '@/lib/strings';

import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

interface StateProps {
  title: string;
  body?: string;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export function EmptyState({ title, body, icon = 'map', actionLabel, onAction, style }: StateProps) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.iconWrap}>
        <Icon name={icon} size={24} color={colors.textMuted} />
      </View>
      <Text variant="heading" align="center">
        {title}
      </Text>
      {body ? (
        <Text tone="muted" align="center">
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} variant="secondary" onPress={onAction} style={styles.action} />
      ) : null}
    </View>
  );
}

export function ErrorState({
  title = strings.common.somethingWentWrong,
  body,
  onAction,
  actionLabel = strings.common.retry,
  style,
}: Partial<StateProps>) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={[styles.iconWrap, { backgroundColor: colors.dangerSoft }]}>
        <Icon name="alert-triangle" size={24} color={colors.danger} />
      </View>
      <Text variant="heading" align="center">
        {title}
      </Text>
      {body ? (
        <Text tone="muted" align="center">
          {body}
        </Text>
      ) : null}
      {onAction ? (
        <Button title={actionLabel} variant="secondary" onPress={onAction} style={styles.action} />
      ) : null}
    </View>
  );
}

type NoticeTone = 'info' | 'warning' | 'danger' | 'success' | 'plus';

const noticeTones: Record<NoticeTone, { bg: string; fg: string; icon: IconName }> = {
  info: { bg: colors.accentSoft, fg: colors.accent, icon: 'info' },
  warning: { bg: colors.warningSoft, fg: colors.warning, icon: 'alert-circle' },
  danger: { bg: colors.dangerSoft, fg: colors.danger, icon: 'alert-triangle' },
  success: { bg: colors.successSoft, fg: colors.success, icon: 'check-circle' },
  plus: { bg: colors.plusSoft, fg: colors.plus, icon: 'star' },
};

export function Notice({
  tone = 'info',
  title,
  body,
  style,
  children,
}: {
  tone?: NoticeTone;
  title?: string;
  body?: string;
  style?: ViewStyle;
  children?: React.ReactNode;
}) {
  const t = noticeTones[tone];
  return (
    <View style={[styles.notice, { backgroundColor: t.bg }, style]}>
      <Icon name={t.icon} size={18} color={t.fg} />
      <View style={styles.noticeBody}>
        {title ? (
          <Text variant="smallStrong" style={{ color: t.fg }}>
            {title}
          </Text>
        ) : null}
        {body ? (
          <Text variant="small" style={{ color: colors.text }}>
            {body}
          </Text>
        ) : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.bgMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  action: {
    marginTop: spacing.md,
  },
  notice: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'flex-start',
  },
  noticeBody: {
    flex: 1,
    gap: 2,
  },
});
