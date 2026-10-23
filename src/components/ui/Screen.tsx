import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout, spacing } from '@/lib/theme';
import { strings } from '@/lib/strings';

import { IconButton } from './Button';
import { Text } from './Text';

interface ScreenProps {
  children: ReactNode;
  /** Scrollable content with max width (default). Set false for full-bleed layouts like the map. */
  scroll?: boolean;
  padded?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  maxWidth?: number;
  keyboardDismiss?: boolean;
}

export function Screen({
  children,
  scroll = true,
  padded = true,
  style,
  contentStyle,
  maxWidth = layout.maxContentWidth,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  if (!scroll) {
    return <View style={[styles.root, style]}>{children}</View>;
  }
  return (
    <ScrollView
      style={[styles.root, style]}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: insets.bottom + spacing.xxl },
      ]}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
    >
      <View
        style={[
          styles.content,
          { maxWidth },
          padded && styles.padded,
          contentStyle,
        ]}
      >
        {children}
      </View>
    </ScrollView>
  );
}

interface TopBarProps {
  title?: string;
  back?: boolean;
  onBack?: () => void;
  right?: ReactNode;
  transparent?: boolean;
  maxWidth?: number;
}

export function TopBar({ title, back = true, onBack, right, transparent, maxWidth }: TopBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const handleBack = () => {
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  return (
    <View
      style={[
        styles.topBar,
        { paddingTop: insets.top + (Platform.OS === 'web' ? spacing.sm : spacing.xs) },
        transparent ? styles.topBarTransparent : null,
      ]}
    >
      <View style={[styles.topBarInner, maxWidth ? { maxWidth } : null]}>
        <View style={styles.topBarSide}>
          {back ? (
            <IconButton
              icon="arrow-left"
              accessibilityLabel={strings.common.back}
              onPress={handleBack}
              background={transparent ? colors.bg : 'transparent'}
              style={transparent ? undefined : styles.noBorder}
            />
          ) : null}
        </View>
        {title ? (
          <Text variant="heading" numberOfLines={1} style={styles.topBarTitle}>
            {title}
          </Text>
        ) : (
          <View style={styles.topBarTitle} />
        )}
        <View style={[styles.topBarSide, styles.topBarRight]}>{right}</View>
      </View>
    </View>
  );
}

export function Section({
  title,
  children,
  right,
  style,
}: {
  title?: string;
  children: ReactNode;
  right?: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.section, style]}>
      {title ? (
        <View style={styles.sectionHeader}>
          <Text variant="heading">{title}</Text>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
  content: {
    width: '100%',
    gap: spacing.lg,
  },
  padded: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  topBar: {
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    alignItems: 'center',
    zIndex: 10,
  },
  topBarTransparent: {
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  topBarInner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    height: 56,
  },
  topBarSide: {
    minWidth: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  topBarRight: {
    justifyContent: 'flex-end',
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
  },
  noBorder: {
    borderWidth: 0,
  },
  section: {
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
