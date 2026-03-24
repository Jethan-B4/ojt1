import React from "react";
import { Modal, View, TouchableOpacity, Text, Alert } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Print from "expo-print";
import * as FileSystem from "expo-file-system/legacy";
import AAAPreview from "../(components)/AAAPreview";

interface Props {
  visible: boolean;
  html: string;
  onClose: () => void;
}

export default function AAAPreviewModal({ visible, html, onClose }: Props) {
  const handlePrint = async () => {
    try {
      await Print.printAsync({ html });
      Alert.alert("✅ Success", "Document sent to printer");
    } catch (error: any) {
      Alert.alert("❌ Print Failed", error?.message ?? "Could not print document");
    }
  };

  const handleDownload = async () => {
    try {
      const fileName = `AAA_${new Date().getTime()}.html`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(filePath, html);
      Alert.alert("✅ Success", `Document saved as ${fileName}`);
    } catch (error: any) {
      Alert.alert("❌ Download Failed", error?.message ?? "Could not save document");
    }
  };

  if (!visible) return null;
  return (
    <Modal visible={visible} animationType="slide">
      <View style={{ flex: 1, backgroundColor: "#fff" }}>
        <View
          style={{
            height: 54,
            paddingHorizontal: 12,
            borderBottomWidth: 1,
            borderBottomColor: "#e5e7eb",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: "#111827" }}>
            Abstract of Awards — Preview
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <TouchableOpacity onPress={handlePrint} activeOpacity={0.8}>
              <MaterialIcons name="print" size={20} color="#065f46" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDownload} activeOpacity={0.8}>
              <MaterialIcons name="download" size={20} color="#0369a1" />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} activeOpacity={0.8}>
              <MaterialIcons name="close" size={20} color="#111827" />
            </TouchableOpacity>
          </View>
        </View>
        <AAAPreview html={html} />
      </View>
    </Modal>
  );
}

