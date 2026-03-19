import "react-native";

declare module "react-native" {
  interface TextProps {
    maxFontSizeMultiplier?: number;
    allowFontScaling?: boolean;
  }
  interface TextInputProps {
    maxFontSizeMultiplier?: number;
    allowFontScaling?: boolean;
  }
}

