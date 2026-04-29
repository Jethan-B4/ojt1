/**
 * DocumentPreviewPanel.tsx — Generic document preview with print/download actions
 *
 * A reusable wrapper for WebView-based document previews with consistent
 * Print and Download PDF action buttons. Used for RFQ, Resolution, Abstract, etc.
 */

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React from "react";
import {
  Alert,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import WebView from "react-native-webview";

// ─── useDocumentPreviewActions ────────────────────────────────────────────────

export function useDocumentPreviewActions(html: string) {
  const handlePrint = async () => {
    try {
      await Print.printAsync({ html });
    } catch (e: any) {
      Alert.alert("Print failed", e?.message ?? "Could not open print dialog.");
    }
  };

  const handleDownload = async () => {
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert("Saved", `PDF saved to:\n${uri}`);
      }
    } catch (e: any) {
      Alert.alert("Download failed", e?.message ?? "Could not generate PDF.");
    }
  };

  return { handlePrint, handleDownload };
}

// ─── DocumentPreviewPanel (default export) ──────────────────────────────────────

interface DocumentPreviewPanelProps {
  html: string;
  templateHtml?: string;
  initialMode?: "filled" | "template";
  onPrint?: () => void;
  onDownload?: () => void;
  showActions?: boolean;
  style?: ViewStyle;
}

export default function DocumentPreviewPanel({
  html,
  templateHtml,
  initialMode = "filled",
  onPrint,
  onDownload,
  showActions = true,
  style,
}: DocumentPreviewPanelProps) {
  const [mode, setMode] = React.useState<"filled" | "template">(initialMode);

  const currentHtml = mode === "template" && templateHtml ? templateHtml : html;
  const { handlePrint, handleDownload } = useDocumentPreviewActions(currentHtml);

  return (
    <View style={[{ flex: 1 }, style]}>
      {showActions && (
        <View className="flex-row flex-wrap gap-2 px-4 py-2.5 bg-white border-b border-gray-100">
          {!!templateHtml && (
            <TouchableOpacity
              onPress={() =>
                setMode((prev) => (prev === "filled" ? "template" : "filled"))
              }
              activeOpacity={0.8}
              className={`px-3 flex-row items-center justify-center rounded-xl py-2.5 border ${mode === "template" ? "bg-[#064E3B] border-[#064E3B]" : "bg-white border-gray-200"}`}
            >
              <Text
                className={`text-[13px] font-bold ${mode === "template" ? "text-white" : "text-gray-700"}`}
              >
                {mode === "template" ? "Template" : "Filled"}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={onPrint ?? handlePrint}
            activeOpacity={0.8}
            className="flex-1 min-w-[140px] flex-row items-center justify-center gap-1.5 bg-gray-100 rounded-xl py-2.5"
          >
            <Text className="text-[13px] font-bold text-gray-700">
              Print
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onDownload ?? handleDownload}
            activeOpacity={0.8}
            className="flex-1 min-w-[140px] flex-row items-center justify-center gap-1.5 bg-[#064E3B] rounded-xl py-2.5"
          >
            <Text className="text-[13px] font-bold text-white">
              Download PDF
            </Text>
          </TouchableOpacity>
        </View>
      )}
      <WebView
        source={{ html: currentHtml }}
        originWhitelist={["*"]}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
