import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import { qrSvg, svgDataUri, venueReviewUrl } from '@/lib/venueLink';

const canUseDom = Platform.OS === 'web' && typeof document !== 'undefined';

/** Review link, QR code and poster for a venue to collect reviews on site. */
export function VenueReviewKit({ slug, compact = false }: { slug: string; compact?: boolean }) {
  const router = useRouter();
  const url = venueReviewUrl(slug);
  const [svg, setSvg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(!compact);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void qrSvg(url).then((s) => {
      if (!cancelled) setSvg(s);
    });
    return () => {
      cancelled = true;
    };
  }, [url, open]);

  const copy = async () => {
    if (canUseDom && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    await Share.share({ message: url });
  };

  const download = () => {
    if (!svg || !canUseDom) return;
    const a = document.createElement('a');
    a.href = svgDataUri(svg);
    a.download = `cosurfing-review-${slug}.svg`;
    a.click();
  };

  if (!open) {
    return <Button title={strings.admin.venueKitOpen} icon="maximize" size="sm" variant="ghost" onPress={() => setOpen(true)} />;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.qr}>{svg ? <Image source={{ uri: svgDataUri(svg) }} style={styles.qrImage} contentFit="contain" /> : null}</View>
      <View style={styles.side}>
        <Text variant="smallStrong">{strings.admin.venueKitTitle}</Text>
        <Text variant="small" tone="muted" selectable>
          {url}
        </Text>
        <View style={styles.actions}>
          <Button title={copied ? strings.admin.venueKitCopied : strings.admin.venueKitCopy} icon="copy" size="sm" variant="secondary" onPress={() => void copy()} />
          {canUseDom ? <Button title={strings.admin.venueKitDownload} icon="download" size="sm" variant="ghost" onPress={download} disabled={!svg} /> : null}
          <Button title={strings.admin.venueKitPoster} icon="printer" size="sm" variant="ghost" onPress={() => router.push(`/place/${slug}/poster`)} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    alignItems: 'center',
  },
  qr: {
    width: 112,
    height: 112,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    padding: spacing.xs,
  },
  qrImage: {
    width: '100%',
    height: '100%',
  },
  side: {
    flex: 1,
    minWidth: 200,
    gap: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
});
