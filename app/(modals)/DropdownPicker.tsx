/**
 * DropdownPicker.tsx — Custom Dropdown Component
 *
 * Mobile-friendly dropdown for selecting from a list of options.
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useState } from "react";
import { FlatList, Modal, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface DropdownPickerProps {
  label: string;
  selectedId: number | null;
  selectedName: string;
  items: Array<{ id: number; name: string }>;
  onSelect: (id: number) => void;
  required?: boolean;
}

export default function DropdownPicker({
  label,
  selectedId,
  selectedName,
  items,
  onSelect,
  required = false,
}: DropdownPickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <View style={{ marginBottom: 16 }}>
        <Text
          style={{
            fontSize: 12,
            fontWeight: "700",
            color: "#374151",
            marginBottom: 6,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}>
          {label}
          {required && <Text style={{ color: "#dc2626" }}> *</Text>}
        </Text>
        <TouchableOpacity
          onPress={() => setIsOpen(true)}
          style={{
            backgroundColor: "#f9fafb",
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "#e5e7eb",
            paddingHorizontal: 12,
            paddingVertical: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
          <Text
            style={{
              fontSize: 14,
              color: selectedId ? "#111827" : "#9ca3af",
            }}>
            {selectedName || "Select an option"}
          </Text>
          <MaterialIcons
            name={isOpen ? "expand-less" : "expand-more"}
            size={20}
            color="#9ca3af"
          />
        </TouchableOpacity>
      </View>

      <Modal visible={isOpen} transparent animationType="fade">
        <SafeAreaView
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
          }}>
          <View
            style={{
              flex: 1,
              justifyContent: "flex-end",
            }}>
            <View
              style={{
                backgroundColor: "#ffffff",
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                maxHeight: "70%",
                paddingTop: 16,
              }}>
              {/* Header */}
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingBottom: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottomWidth: 1,
                  borderBottomColor: "#f3f4f6",
                }}>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "700",
                    color: "#111827",
                  }}>
                  Select {label}
                </Text>
                <TouchableOpacity onPress={() => setIsOpen(false)} hitSlop={8}>
                  <MaterialIcons name="close" size={24} color="#9ca3af" />
                </TouchableOpacity>
              </View>

              {/* Options */}
              <FlatList
                data={items}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => {
                      onSelect(item.id);
                      setIsOpen(false);
                    }}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      borderBottomWidth: 1,
                      borderBottomColor: "#f3f4f6",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      backgroundColor:
                        selectedId === item.id ? "#f0fdf4" : "#ffffff",
                    }}>
                    <Text
                      style={{
                        fontSize: 14,
                        color: "#111827",
                      }}>
                      {item.name}
                    </Text>
                    {selectedId === item.id && (
                      <MaterialIcons name="check" size={20} color="#10b981" />
                    )}
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}
