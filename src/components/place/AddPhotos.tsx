import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Icon, Notice, Text } from '@/components/ui';
import { MAX_USER_PHOTOS_PER_UPLOAD, pickImages, uploadPlacePhoto } from '@/lib/photoUpload';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';

interface AddPhotosProps {
  placeId: string;
  userId: string | null;
  /** Called instead of the upload flow when nobody is signed in. */
  onSignIn: () => void;
}

/** "Add photos" for signed-in users: consent to the Terms, pick, upload as pending. */
export function AddPhotos({ placeId, userId, onSignIn }: AddPhotosProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(0);

  const start = () => {
    if (!userId) {
      onSignIn();
      return;
    }
    setOpen(true);
    setSent(0);
    setError(null);
  };

  const upload = async () => {
    if (!userId || !accepted) return;
    setError(null);
    try {
      const uris = await pickImages(MAX_USER_PHOTOS_PER_UPLOAD);
      if (uris.length === 0) return;
      setBusy(true);
      const rightsAcceptedAt = new Date().toISOString();
      let done = 0;
      for (const uri of uris) {
        setProgress(strings.photos.uploading(done + 1, uris.length));
        await uploadPlacePhoto(placeId, uri, 1000 + done, { userId, rightsAcceptedAt });
        done += 1;
      }
      setSent(done);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.common.somethingWentWrong);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  if (!open) {
    return (
      <View style={styles.wrap}>
        {sent > 0 ? <Notice tone="success" body={strings.photos.thanks(sent)} /> : null}
        <Button title={strings.photos.add} icon="camera" variant="secondary" size="sm" onPress={start} style={styles.selfStart} />
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <Text variant="bodyStrong">{strings.photos.title}</Text>
      <Text variant="small" tone="muted">
        {strings.photos.rules}
      </Text>
      <Pressable
        style={styles.checkbox}
        onPress={() => setAccepted((a) => !a)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted }}
      >
        <Icon name={accepted ? 'check-square' : 'square'} size={20} color={accepted ? colors.accent : colors.textMuted} />
        <Text variant="small" style={styles.flex}>
          {strings.photos.consent}{' '}
          <Text variant="smallStrong" tone="accent" onPress={() => router.push('/terms')}>
            {strings.photos.termsLink}
          </Text>
          .
        </Text>
      </Pressable>
      {error ? <Notice tone="danger" body={error} /> : null}
      <View style={styles.actions}>
        <Button
          title={progress ?? strings.photos.choose}
          icon="image"
          loading={busy}
          disabled={!accepted || busy}
          onPress={upload}
        />
        <Button title={strings.common.cancel} variant="ghost" onPress={() => setOpen(false)} disabled={busy} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  selfStart: {
    alignSelf: 'flex-start',
  },
  panel: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSubtle,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
