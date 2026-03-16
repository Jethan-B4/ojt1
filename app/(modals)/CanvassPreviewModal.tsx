/**
 * CanvassPreviewModal.tsx
 *
 * React Native modal that renders the DAR canvass / RFQ form as an HTML
 * document inside a WebView.  Follows the same emerald design system used
 * throughout BACView / PRModule.
 *
 * Usage:
 *   <CanvassPreviewModal
 *     visible={previewOpen}
 *     data={buildCanvassData(pr, bacNo, canvassUsers, supps)}
 *     onClose={() => setPreviewOpen(false)}
 *   />
 *
 * The modal chrome (header, close button) is React Native.
 * The document body is rendered inside a WebView so the HTML table layout
 * is pixel-accurate to the paper form, matching PRPreview's approach.
 *
 * Note: requires react-native-webview
 *   npx expo install react-native-webview
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { buildCanvassHTML, type CanvassPreviewData } from "./CanvassPreview";

// ─── Component ────────────────────────────────────────────────────────────────

export default function CanvassPreviewModal({
  visible,
  data,
  onClose,
}: {
  visible: boolean;
  data:    CanvassPreviewData;
  onClose: () => void;
}) {
  const html = React.useMemo(() => buildCanvassHTML(data), [data]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>

      {/* ── Modal chrome ── */}
      <View style={{ flex: 1, backgroundColor: "#f9fafb" }}>

        {/* Header */}
        <View style={{
          backgroundColor: "#064E3B",
          paddingHorizontal: 16,
          paddingTop: Platform.OS === "ios" ? 14 : 12,
          paddingBottom: 14,
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{
              fontSize: 9.5, fontWeight: "600", color: "rgba(255,255,255,0.4)",
              textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 2,
            }}>
              DAR · Procurement › Canvassing
            </Text>
            <Text style={{ fontSize: 17, fontWeight: "800", color: "#ffffff" }}>
              Request for Quotation
            </Text>
            <Text style={{
              fontSize: 11.5,
              color: "rgba(255,255,255,0.55)",
              marginTop: 2,
              fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
            }}>
              {data.quotationNo}  ·  {data.prNo}
            </Text>
          </View>

          {/* Close button */}
          <TouchableOpacity
            onPress={onClose}
            hitSlop={10}
            style={{
              width: 34, height: 34, borderRadius: 17,
              backgroundColor: "rgba(255,255,255,0.12)",
              alignItems: "center", justifyContent: "center",
              marginTop: 2,
            }}>
            <MaterialIcons name="close" size={18} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Sub-header info strip */}
        <View style={{
          flexDirection: "row",
          backgroundColor: "#f0fdf4",
          borderBottomWidth: 1,
          borderBottomColor: "#d1fae5",
          paddingHorizontal: 16,
          paddingVertical: 8,
          gap: 16,
        }}>
          {[
            { icon: "calendar-today" as const, label: "Date", value: data.date },
            { icon: "event"          as const, label: "Deadline", value: data.deadline },
            { icon: "location-city"  as const, label: "Section", value: data.officeSection },
          ].map(item => (
            <View key={item.label} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <MaterialIcons name={item.icon} size={12} color="#047857" />
              <View>
                <Text style={{ fontSize: 9, color: "#6b7280", fontWeight: "600",
                  textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {item.label}
                </Text>
                <Text style={{ fontSize: 11, fontWeight: "700", color: "#1a4d2e" }}>
                  {item.value}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Print hint */}
        <View style={{
          flexDirection: "row", alignItems: "center", gap: 6,
          backgroundColor: "#fffbeb",
          borderBottomWidth: 1, borderBottomColor: "#fde68a",
          paddingHorizontal: 14, paddingVertical: 6,
        }}>
          <MaterialIcons name="info-outline" size={13} color="#92400e" />
          <Text style={{ fontSize: 11, color: "#92400e" }}>
            This is a preview of the official DAR RFQ form (DARCS1-QF-STO-009 Rev 01).
            Print or share using your device's browser options.
          </Text>
        </View>

        {/* WebView document */}
        <WebView
          source={{ html }}
          style={{ flex: 1, backgroundColor: "#ffffff" }}
          originWhitelist={["*"]}
          scrollEnabled
          showsVerticalScrollIndicator
          startInLoadingState
          renderLoading={() => (
            <View style={{
              position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
              alignItems: "center", justifyContent: "center",
              backgroundColor: "#ffffff",
            }}>
              <ActivityIndicator size="large" color="#064E3B" />
              <Text style={{ fontSize: 12, color: "#9ca3af", marginTop: 10 }}>
                Rendering form…
              </Text>
            </View>
          )}
        />

        {/* Footer action bar */}
        <View style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          paddingHorizontal: 16,
          paddingVertical: 12,
          paddingBottom: Platform.OS === "ios" ? 28 : 12,
          backgroundColor: "#ffffff",
          borderTopWidth: 1,
          borderTopColor: "#e5e7eb",
          gap: 10,
        }}>
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.8}
            style={{
              paddingHorizontal: 20, paddingVertical: 10,
              borderRadius: 12, borderWidth: 1.5, borderColor: "#e5e7eb",
            }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#6b7280" }}>Close</Text>
          </TouchableOpacity>
        </View>

      </View>
    </Modal>
  );
}
