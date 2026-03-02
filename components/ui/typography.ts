import { Platform } from "react-native";

export const FONT_SANS = Platform.OS === "ios" ? "System" : "sans-serif";
export const FONT_MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

