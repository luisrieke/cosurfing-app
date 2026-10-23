import { useWindowDimensions } from 'react-native';

import { layout } from '@/lib/theme';

export function useBreakpoint() {
  const { width, height } = useWindowDimensions();
  return {
    width,
    height,
    isDesktop: width >= layout.desktopBreakpoint,
  };
}
