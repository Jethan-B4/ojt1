import { Text, type TextProps } from 'react-native';
import { FONT_SANS } from './ui/typography';

import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
  className?: string;
};

export function ThemedText({
  style,
  className,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');
  const resolvedColor = type === 'link' ? '#0a7ea4' : color;
  const typeClassName =
    type === 'title'
      ? 'text-[32px] font-bold leading-8'
      : type === 'defaultSemiBold'
        ? 'text-base font-semibold leading-6'
        : type === 'subtitle'
          ? 'text-xl font-bold'
          : type === 'link'
            ? 'text-base leading-[30px]'
            : 'text-base leading-6';

  return (
    <Text
      className={className ? `${typeClassName} ${className}` : typeClassName}
      style={[
        { color: resolvedColor, fontFamily: FONT_SANS },
        style,
      ]}
      {...rest}
    />
  );
}
