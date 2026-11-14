import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Button, Glass, Icon, Notice, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { signUpHref } from '@/lib/funnel';
import { CityCoverLimitError, CityCoverShapeError, pickImage, uploadCityCover } from '@/lib/photoUpload';
import { approveCityCover } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import type { City } from '@/lib/types';

/**
 * "Suggest a cover photo" at the bottom of a city page. The guidelines are shown before the file
 * picker opens; submissions wait for an admin, admin uploads replace the cover right away.
 */
export function CityCoverUpload({
  city,
  onCoverChanged,
  style,
}: {
  city: Pick<City, 'id' | 'name' | 'slug'>;
  onCoverChanged: () => Promise<void>;
  style?: ViewStyle;
}) {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'pending' | 'live' | null>(null);

  const start = () => {
    if (!user) {
      router.push(signUpHref(`/${city.slug}`));
      return;
    }
    setOpen(true);
    setDone(null);
    setError(null);
  };

  const upload = async () => {
    if (!user) return;
    setError(null);
    try {
      const uri = await pickImage(() => setBusy(true));
      if (!uri) return;
      setBusy(true);
      const submission = await uploadCityCover(city.id, user.id, uri);
      if (isAdmin) {
        await approveCityCover(submission);
        await onCoverChanged();
      }
      setDone(isAdmin ? 'live' : 'pending');
      setOpen(false);
    } catch (e) {
      if (e instanceof CityCoverShapeError) setError(e.reason === 'portrait' ? strings.cityCover.portrait : strings.cityCover.tooSmall);
      else if (e instanceof CityCoverLimitError) setError(strings.cityCover.limitReached);
      else setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Glass variant="strong" style={[styles.card, style]}>
      <View style={styles.head}>
        <View style={styles.icon}>
          <Icon name="camera" size={18} color={colors.accent} />
        </View>
        <Text variant="heading" style={styles.title}>
          {strings.cityCover.title(city.name)}
        </Text>
      </View>
      <Text variant="small" tone="muted">
        {strings.cityCover.body(city.name)}
      </Text>
      {done ? (
        <Notice tone="success" body={done === 'live' ? strings.cityCover.thanksLive : strings.cityCover.thanks(city.name)} />
      ) : null}

      {open ? (
        <View style={styles.panel}>
          <Text variant="bodyStrong">{strings.cityCover.guideTitle}</Text>
          <Text variant="small">{strings.cityCover.guideIntro(city.name)}</Text>
          <View style={styles.guide}>
            {strings.cityCover.guide(city.name).map((line) => (
              <View key={line} style={styles.guideRow}>
                <View style={styles.guideIcon}>
                  <Icon name="check" size={14} color={colors.accent} />
                </View>
                <Text variant="small" style={styles.guideText}>
                  {line}
                </Text>
              </View>
            ))}
          </View>
          <Text variant="caption" tone="muted">
            {isAdmin ? strings.cityCover.liveNote : strings.cityCover.reviewNote(city.name)}
          </Text>
          {error ? <Notice tone="danger" body={error} /> : null}
          <View style={styles.actions}>
            <Button
              title={busy ? strings.cityCover.uploading : strings.cityCover.choose}
              icon="image"
              loading={busy}
              disabled={busy}
              onPress={() => void upload()}
            />
            <Button title={strings.common.cancel} variant="ghost" onPress={() => setOpen(false)} disabled={busy} />
          </View>
        </View>
      ) : (
        <Button
          title={strings.cityCover.button}
          icon="camera"
          variant="secondary"
          onPress={start}
          style={styles.selfStart}
        />
      )}
    </Glass>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
  },
  selfStart: {
    alignSelf: 'flex-start',
  },
  panel: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSubtle,
  },
  guide: {
    gap: spacing.sm,
  },
  guideRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  guideIcon: {
    marginTop: 3,
  },
  guideText: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
