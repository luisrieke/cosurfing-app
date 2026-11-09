import { usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Glass, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { strings } from '@/lib/strings';
import { supabase } from '@/lib/supabase';
import { TERMS_VERSION } from '@/lib/terms';
import { colors, layout, radius, spacing } from '@/lib/theme';

/** Asks signed-in users to accept a new Terms version; until they do, the version they accepted keeps applying. */
export function TermsUpdateBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { ready, user } = useAuth();
  const [busy, setBusy] = useState(false);
  const accepted = (user?.user_metadata as { terms_version?: string } | undefined)?.terms_version;
  if (!ready || !user || !supabase || accepted === TERMS_VERSION || pathname.startsWith('/auth')) return null;

  const accept = async () => {
    setBusy(true);
    await supabase!.auth.updateUser({ data: { terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() } });
    setBusy(false);
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: insets.bottom + spacing.md }]}>
      <Glass variant="ink" style={styles.banner}>
        <View style={styles.text}>
          <Text variant="smallStrong" style={styles.light}>
            {strings.termsUpdate.title}
          </Text>
          <Text variant="caption" style={styles.lightMuted}>
            {strings.termsUpdate.body}
          </Text>
        </View>
        <View style={styles.actions}>
          <Button title={strings.termsUpdate.read} size="sm" variant="secondary" onPress={() => router.push('/terms')} />
          <Button title={strings.termsUpdate.accept} size="sm" loading={busy} onPress={accept} />
        </View>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    zIndex: 50,
  },
  banner: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
  },
  text: {
    flex: 1,
    minWidth: 200,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  light: {
    color: colors.onAccent,
  },
  lightMuted: {
    color: 'rgba(255,255,255,0.75)',
  },
});
