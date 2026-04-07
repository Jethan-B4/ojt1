/**
 * BACResolutionPreviewModal.tsx
 *
 * React Native modal that renders the BAC Resolution document inside a WebView.
 * Mirrors the pattern of CanvassPreviewModal — same header chrome, info strip,
 * print + download footer actions.
 *
 * Usage (from Step 9 in BACView):
 *   <BACResolutionPreviewModal
 *     visible={resolutionPreviewOpen}
 *     data={buildResolutionData()}
 *     onClose={() => setResolutionPreviewOpen(false)}
 *   />
 *
 * Requires: react-native-webview, expo-print, expo-sharing
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import {
  buildBACResolutionHTML,
  type BACResolutionData,
} from "../(components)/BACResolutionPreview";

// ─── Component ────────────────────────────────────────────────────────────────

export default function BACResolutionPreviewModal({
  visible,
  data,
  onClose,
}: {
  visible: boolean;
  data: BACResolutionData;
  onClose: () => void;
}) {
  const html = React.useMemo(() => buildBACResolutionHTML(data), [data]);

  const handlePrint = async () => {
    try {
      await Print.printAsync({ html });
    } catch {
      Alert.alert("Print Error", "Unable to print the document.");
    }
  };

  const handleDownload = async () => {
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: `BAC Resolution ${data.resolutionNo}`,
        });
      } else {
        Alert.alert("Download", "Sharing is not available on this device.");
      }
    } catch {
      Alert.alert("Download Error", "Unable to generate PDF.");
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: "#f9fafb" }}>
        {/* ── Header ── */}
        <View
          style={{
            backgroundColor: "#064E3B",
            paddingHorizontal: 16,
            paddingTop: Platform.OS === "ios" ? 14 : 12,
            paddingBottom: 14,
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text
              style={{
                fontSize: 9.5,
                fontWeight: "600",
                color: "rgba(255,255,255,0.4)",
                textTransform: "uppercase",
                letterSpacing: 1.2,
                marginBottom: 2,
              }}
            >
              DAR · Procurement · Canvassing
            </Text>
            <Text style={{ fontSize: 17, fontWeight: "800", color: "#ffffff" }}>
              BAC Resolution
            </Text>
            <Text
              style={{
                fontSize: 11.5,
                color: "rgba(255,255,255,0.55)",
                marginTop: 2,
                fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
              }}
            >
              Resolution No. {data.resolutionNo}
            </Text>
          </View>

          <TouchableOpacity
            onPress={onClose}
            hitSlop={10}
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: "rgba(255,255,255,0.12)",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 2,
            }}
          >
            <MaterialIcons name="close" size={18} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* ── Info strip ── */}
        <View
          style={{
            flexDirection: "row",
            backgroundColor: "#f0fdf4",
            borderBottomWidth: 1,
            borderBottomColor: "#d1fae5",
            paddingHorizontal: 16,
            paddingVertical: 8,
            gap: 16,
          }}
        >
          {[
            { icon: "event" as const, label: "Date", value: data.resolvedDate },
            {
              icon: "gavel" as const,
              label: "Res. No",
              value: data.resolutionNo,
            },
            {
              icon: "location-city" as const,
              label: "Office",
              value: data.provincialOffice,
            },
          ].map((item) => (
            <View
              key={item.label}
              style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
            >
              <MaterialIcons name={item.icon} size={12} color="#047857" />
              <View>
                <Text
                  style={{
                    fontSize: 9,
                    color: "#6b7280",
                    fontWeight: "600",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  {item.label}
                </Text>
                <Text
                  style={{ fontSize: 11, fontWeight: "700", color: "#1a4d2e" }}
                >
                  {item.value}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── Print hint ── */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: "#f0fdf4",
            borderBottomWidth: 1,
            borderBottomColor: "#d1fae5",
            paddingHorizontal: 14,
            paddingVertical: 6,
          }}
        >
          <MaterialIcons name="info-outline" size={13} color="#047857" />
          <Text style={{ fontSize: 11, color: "#047857" }}>
            This is a preview of the official DAR BAC Resolution document.
          </Text>
        </View>

        {/* ── WebView document ── */}
        <WebView
          source={{ html }}
          style={{ flex: 1, backgroundColor: "#ffffff" }}
          originWhitelist={["*"]}
          scrollEnabled
          showsVerticalScrollIndicator
          startInLoadingState
          renderLoading={() => (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#ffffff",
              }}
            >
              <ActivityIndicator size="large" color="#064E3B" />
              <Text style={{ fontSize: 12, color: "#9ca3af", marginTop: 10 }}>
                Rendering resolution…
              </Text>
            </View>
          )}
        />

        {/* ── Footer ── */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            paddingHorizontal: 16,
            paddingVertical: 12,
            paddingBottom: Platform.OS === "ios" ? 28 : 12,
            backgroundColor: "#ffffff",
            borderTopWidth: 1,
            borderTopColor: "#e5e7eb",
            gap: 10,
          }}
        >
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={handlePrint}
              activeOpacity={0.8}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: "#e5e7eb",
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <MaterialIcons name="print" size={16} color="#6b7280" />
              <Text
                style={{ fontSize: 13, fontWeight: "700", color: "#6b7280" }}
              >
                Print
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDownload}
              activeOpacity={0.8}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: "#e5e7eb",
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <MaterialIcons name="download" size={16} color="#6b7280" />
              <Text
                style={{ fontSize: 13, fontWeight: "700", color: "#6b7280" }}
              >
                Download
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.8}
            style={{
              paddingHorizontal: 20,
              paddingVertical: 10,
              borderRadius: 12,
              borderWidth: 1.5,
              borderColor: "#e5e7eb",
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#6b7280" }}>
              Close
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
