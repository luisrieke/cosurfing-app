import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

interface NetworkInformation extends EventTarget {
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g';
  saveData?: boolean;
}

function connection(): NetworkInformation | undefined {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { connection?: NetworkInformation }).connection;
}

function isSlow(c: NetworkInformation | undefined): boolean {
  if (!c) return false;
  return c.saveData === true || c.effectiveType === 'slow-2g' || c.effectiveType === '2g' || c.effectiveType === '3g';
}

/**
 * True when the browser reports a slow link or Data Saver. Native platforms and browsers
 * without the Network Information API (Safari, Firefox) always report false.
 */
export function useSlowConnection(): boolean {
  const [slow, setSlow] = useState(() => isSlow(connection()));

  useEffect(() => {
    const c = connection();
    if (!c) return;
    const update = () => setSlow(isSlow(c));
    update();
    c.addEventListener('change', update);
    return () => c.removeEventListener('change', update);
  }, []);

  return slow;
}
