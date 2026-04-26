import { Text, type TextProps } from "react-native";
import { FONT_SANS } from "./ui/typography";

import { useThemeColor } from "@/hooks/use-theme-color";

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: "default" | "title" | "defaultSemiBold" | "subtitle" | "link";
  className?: string;
};

export function ThemedText({
  style,
  className,
  lightColor,
  darkColor,
  type = "default",
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, "text");
  const resolvedColor = type === "link" ? "#0a7ea4" : color;
  const typeClassName =
    type === "title"
      ? "text-[36px] font-bold leading-9"
      : type === "defaultSemiBold"
        ? "text-lg font-semibold leading-7"
        : type === "subtitle"
          ? "text-2xl font-bold"
          : type === "link"
            ? "text-lg leading-7"
            : "text-lg leading-7";

  return (
    <Text
      className={className ? `${typeClassName} ${className}` : typeClassName}
      style={[{ color: resolvedColor, fontFamily: FONT_SANS }, style]}
      {...rest}
    />
  );
}
