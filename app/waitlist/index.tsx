import { useLocalSearchParams } from 'expo-router';

import { WaitlistScreen } from '@/components/waitlist/WaitlistScreen';

export default function WaitlistRoute() {
  const params = useLocalSearchParams<{
    city?: string;
    country?: string;
    countryCode?: string;
    lat?: string;
    lng?: string;
  }>();
  const lat = params.lat ? Number(params.lat) : undefined;
  const lng = params.lng ? Number(params.lng) : undefined;
  return (
    <WaitlistScreen
      cityName={params.city ?? ''}
      countryName={params.country}
      countryCode={params.countryCode}
      lat={Number.isFinite(lat) ? lat : undefined}
      lng={Number.isFinite(lng) ? lng : undefined}
    />
  );
}
