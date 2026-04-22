import { Text, TextInput } from "react-native";

const apply = (C: any) => {
  C.defaultProps = C.defaultProps || {};
  if (C.defaultProps.allowFontScaling !== true) {
    C.defaultProps.allowFontScaling = true;
  }
  if (
    typeof C.defaultProps.maxFontSizeMultiplier !== "number" ||
    C.defaultProps.maxFontSizeMultiplier < 1.15
  ) {
    C.defaultProps.maxFontSizeMultiplier = 1.15;
  }
};

apply(Text);
apply(TextInput);
