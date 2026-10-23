import { useRouter } from 'expo-router';

import { EmptyState, Screen, TopBar } from '@/components/ui';
import { strings } from '@/lib/strings';

export default function NotFound() {
  const router = useRouter();
  return (
    <Screen scroll={false}>
      <TopBar title={strings.notFound.title} />
      <EmptyState
        icon="compass"
        title={strings.notFound.title}
        body={strings.notFound.body}
        actionLabel={strings.notFound.home}
        onAction={() => router.replace('/')}
      />
    </Screen>
  );
}
