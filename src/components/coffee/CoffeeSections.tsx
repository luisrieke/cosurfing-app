import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Glass, Icon, type IconName, Text } from '@/components/ui';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { COFFEE_STEPS, type CoffeeRewardStatus, type CoffeeStep } from '@/lib/coffee';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';

const s = strings.coffee;

export const STEP_META: Record<CoffeeStep, { icon: IconName; color: string; soft: string }> = {
  contribute: { icon: 'edit-3', color: colors.cafe, soft: colors.cafeSoft },
  new_place: { icon: 'map-pin', color: colors.coworking, soft: colors.coworkingSoft },
  spread: { icon: 'share-2', color: colors.plus, soft: colors.plusSoft },
};

export const STATUS_TONE: Record<CoffeeRewardStatus, 'neutral' | 'accent' | 'warning' | 'success' | 'danger'> = {
  not_started: 'neutral',
  submitted: 'accent',
  under_review: 'warning',
  approved: 'success',
  rejected: 'danger',
  paid: 'success',
};

/** Three cups; `filled` of them are full. */
export function CoffeeCups({ filled = 0, size = 40 }: { filled?: number; size?: number }) {
  return (
    <View style={styles.cups} accessibilityLabel={`${filled} of 3 coffees earned`}>
      {COFFEE_STEPS.map((step, i) => {
        const full = i < filled;
        return (
          <View
            key={step}
            style={[
              styles.cup,
              { width: size + 16, height: size + 16, borderRadius: (size + 16) / 2 },
              full ? { backgroundColor: STEP_META[step].color } : { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Icon name="coffee" size={size * 0.55} color={full ? colors.onAccent : STEP_META[step].color} />
          </View>
        );
      })}
    </View>
  );
}

export function SpotsBar({ taken, total }: { taken: number; total: number }) {
  const left = Math.max(0, total - taken);
  const pct = total > 0 ? Math.min(100, Math.round((taken / total) * 100)) : 0;
  return (
    <View style={styles.spots}>
      <View style={styles.spotsTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: taken }}>
        <View style={[styles.spotsFill, { width: `${pct}%` }]} />
      </View>
      <Text variant="smallStrong" tone="muted">
        {s.spotsLeft(left, total)}
      </Text>
    </View>
  );
}

export function StepCards({
  statuses,
  footer,
}: {
  statuses?: Partial<Record<CoffeeStep, CoffeeRewardStatus>>;
  footer?: (step: CoffeeStep) => React.ReactNode;
}) {
  const { isDesktop } = useBreakpoint();
  return (
    <View style={[styles.steps, isDesktop && styles.stepsRow]}>
      {COFFEE_STEPS.map((step) => {
        const meta = STEP_META[step];
        const copy = s.steps[step];
        const status = statuses?.[step];
        return (
          <Glass key={step} variant="strong" style={[styles.step, isDesktop && styles.stepDesktop]}>
            <View style={styles.stepHead}>
              <View style={[styles.stepIcon, { backgroundColor: meta.soft }]}>
                <Icon name={meta.icon} size={20} color={meta.color} />
              </View>
              <View style={[styles.reward, { backgroundColor: meta.soft }]}>
                <Icon name="coffee" size={12} color={meta.color} />
                <Text variant="caption" style={{ color: meta.color }}>
                  {s.rewardChip(step === 'contribute' ? 1 : 2)}
                </Text>
              </View>
            </View>
            <View style={styles.stepTitle}>
              <Text variant="caption" style={{ color: meta.color }}>
                {copy.label.toUpperCase()}
              </Text>
              <Text variant="heading">{copy.title}</Text>
            </View>
            {status ? <Badge label={s.status[status]} tone={STATUS_TONE[status]} /> : null}
            <View style={styles.reqs}>
              {copy.requirements.map((r) => (
                <View key={r} style={styles.req}>
                  <Icon name="check" size={14} color={meta.color} />
                  <Text variant="small" style={styles.flex}>
                    {r}
                  </Text>
                </View>
              ))}
            </View>
            {footer?.(step)}
          </Glass>
        );
      })}
    </View>
  );
}

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <View style={styles.faq}>
      {s.faq.map((item, i) => {
        const expanded = open === i;
        return (
          <Glass key={item.q} variant="strong" style={styles.faqItem}>
            <Pressable
              onPress={() => setOpen(expanded ? null : i)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              style={styles.faqHead}
            >
              <Text variant="bodyStrong" style={styles.flex} role="heading">
                {item.q}
              </Text>
              <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
            </Pressable>
            {/* Collapsed answers stay in the DOM so crawlers and in-page search still find them. */}
            <View style={expanded ? styles.faqBody : styles.hidden}>
              <Text tone="muted">{item.a}</Text>
            </View>
          </Glass>
        );
      })}
    </View>
  );
}

export function Checklist({ items, color = colors.text }: { items: readonly string[]; color?: string }) {
  return (
    <View style={styles.reqs}>
      {items.map((r) => (
        <View key={r} style={styles.req}>
          <Icon name="check-circle" size={16} color={color} />
          <Text variant="small" style={styles.flex}>
            {r}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  hidden: {
    display: 'none',
  },
  cups: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cup: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  spots: {
    gap: spacing.xs,
    width: '100%',
    maxWidth: 360,
  },
  spotsTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.bgMuted,
    overflow: 'hidden',
  },
  spotsFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.cafe,
  },
  steps: {
    gap: spacing.md,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  step: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  stepDesktop: {
    flex: 1,
  },
  stepHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reward: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  stepTitle: {
    gap: 2,
  },
  reqs: {
    gap: spacing.sm,
  },
  req: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  faq: {
    gap: spacing.sm,
  },
  faqItem: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  faqHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    minHeight: 44,
  },
  faqBody: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
});
