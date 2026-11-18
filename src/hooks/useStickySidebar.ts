import { useCallback, useState } from 'react';
import { Platform, useWindowDimensions, type LayoutChangeEvent, type ViewStyle } from 'react-native';

import { SITE_HEADER_HEIGHT } from '@/components/SiteHeader';
import { spacing } from '@/lib/theme';

/**
 * Sticky desktop sidebar that never hides content: a sidebar shorter than the viewport sticks
 * below the floating header; a taller one scrolls with the page until its bottom is visible and
 * then sticks there (negative `top`).
 */
export function useStickySidebar(gap: number = spacing.lg) {
  const { height: viewport } = useWindowDimensions();
  const [height, setHeight] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => setHeight(Math.round(e.nativeEvent.layout.height)), []);

  if (Platform.OS !== 'web') return { style: undefined, onLayout: undefined };

  const top = Math.min(SITE_HEADER_HEIGHT + gap, viewport - height - gap);
  return { style: { position: 'sticky' as ViewStyle['position'], top } as ViewStyle, onLayout };
}
