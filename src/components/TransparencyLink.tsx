import { useRouter } from 'expo-router';

import { Text } from '@/components/ui';
import { strings } from '@/lib/strings';

/** Link to the page that explains rankings and review checks (§ 5b UWG). */
export function TransparencyLink({ label = strings.legal.ranking }: { label?: string }) {
  const router = useRouter();
  return (
    <Text variant="caption" tone="accent" onPress={() => router.push('/how-rankings-work')} accessibilityRole="link">
      {label}
    </Text>
  );
}
