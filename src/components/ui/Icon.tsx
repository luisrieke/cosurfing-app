import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { colors } from '@/lib/theme';

export type IconName = ComponentProps<typeof Feather>['name'];

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
}

export function Icon({ name, size = 20, color = colors.text }: IconProps) {
  return <Feather name={name} size={size} color={color} />;
}
