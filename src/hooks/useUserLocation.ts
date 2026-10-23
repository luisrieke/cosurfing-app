import * as Location from 'expo-location';
import { useCallback, useState } from 'react';

import { strings } from '@/lib/strings';
import type { LatLng } from '@/lib/types';

type Status = 'idle' | 'loading' | 'ready' | 'denied' | 'error';

export function useUserLocation() {
  const [location, setLocation] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const request = useCallback(async (): Promise<LatLng | null> => {
    setStatus('loading');
    setMessage(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setStatus('denied');
        setMessage(strings.explore.locationDenied);
        return null;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setLocation(next);
      setStatus('ready');
      return next;
    } catch {
      setStatus('error');
      setMessage(strings.explore.locationUnavailable);
      return null;
    }
  }, []);

  return { location, status, message, request, clearMessage: () => setMessage(null) };
}
