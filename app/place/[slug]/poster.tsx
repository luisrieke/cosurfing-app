import { Image } from 'expo-image';
import Head from 'expo-router/head';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Button, Notice, Screen, Skeleton, Text } from '@/components/ui';
import { useQuery } from '@/hooks/useQuery';
import { getPlaceBySlug } from '@/lib/queries';
import { strings } from '@/lib/strings';
import { colors, radius, spacing } from '@/lib/theme';
import { qrSvg, svgDataUri, venueReviewUrl } from '@/lib/venueLink';

/** Printable A4 poster for the venue: scan to rate this place. */
export default function PosterScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const placeQuery = useQuery(`place:${slug}`, () => getPlaceBySlug(slug!), Boolean(slug));
  const place = placeQuery.data ?? null;
  const url = slug ? venueReviewUrl(slug) : null;
  const [svg, setSvg] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    void qrSvg(url).then((s) => {
      if (!cancelled) setSvg(s);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const print = () => {
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 50);
  };

  return (
    <Screen maxWidth={640}>
      <Head>
        <title>{place ? `${place.name} · Poster · Cosurfing` : 'Poster · Cosurfing'}</title>
        <meta name="robots" content="noindex" />
      </Head>
      {placeQuery.loading && !place ? (
        <Skeleton height={480} />
      ) : !place ? (
        <Notice tone="warning" body={strings.place.notFound} />
      ) : (
        <View style={styles.poster}>
          <Text variant="display" align="center">
            {strings.poster.title(place.name)}
          </Text>
          <Text align="center" tone="muted">
            {strings.poster.body}
          </Text>
          <View style={styles.qr}>{svg ? <Image source={{ uri: svgDataUri(svg) }} style={styles.qrImage} contentFit="contain" /> : null}</View>
          <Text variant="small" align="center" tone="muted" selectable>
            {url?.replace(/^https?:\/\//, '')}
          </Text>
          <Text variant="smallStrong" align="center">
            {strings.poster.brand}
          </Text>
          {Platform.OS === 'web' && !printing ? <Button title={strings.poster.print} icon="printer" variant="secondary" onPress={print} /> : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  poster: {
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.xl,
  },
  qr: {
    width: 320,
    height: 320,
    maxWidth: '100%',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  qrImage: {
    width: '100%',
    height: '100%',
  },
});
