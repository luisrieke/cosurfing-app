import { useRouter } from 'expo-router';
import { type TextStyle } from 'react-native';

import { Text } from '@/components/ui';
import { strings } from '@/lib/strings';

/** Shown right above every button that publishes user content; the grant itself is in the Terms (section 4). */
export function RightsNote({ kind, style }: { kind: keyof typeof strings.photos.rightsNote; style?: TextStyle }) {
  const router = useRouter();
  return (
    <Text variant="caption" tone="muted" style={style}>
      {strings.photos.rightsNote[kind]}{' '}
      <Text variant="caption" tone="accent" onPress={() => router.push('/terms')} accessibilityRole="link">
        {strings.photos.termsLink}
      </Text>
      .
    </Text>
  );
}
