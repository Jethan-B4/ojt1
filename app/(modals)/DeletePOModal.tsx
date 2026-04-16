import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  deletePurchaseOrderDeep,
  fetchPODeletePreview,
  type DeletePOPreview,
} from "../../lib/supabase/deletePO";
import { useAuth } from "../AuthContext";

interface Props {
  visible: boolean;
  poId: string | null;
  poNo: string | null;
  onClose: () => void;
  onDeleted: (poId: string) => void;
}

function ImpactBadge({
  icon,
  label,
  value,
  color,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <View
      className="flex-1 items-center rounded-xl py-2.5 px-2 border"
      style={{ borderColor: color + "30", backgroundColor: color + "10" }}
    >
      <MaterialIcons name={icon} size={16} color={color} />
      <Text className="text-[15px] font-extrabold mt-1" style={{ color }}>
        {value}
      </Text>
      <Text
        className="text-[9.5px] font-bold text-center mt-0.5"
        style={{ color: color + "aa" }}
      >
        {label}
      </Text>
    </View>
  );
}

export default function DeletePOModal({
  visible,
  poId,
  poNo,
  onClose,
  onDeleted,
}: Props) {
  const { currentUser } = useAuth();
  const [preview, setPreview] = useState<DeletePOPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirmPoNo, setConfirmPoNo] = useState("");
  const [confirmWord, setConfirmWord] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !poId) return;
    setConfirmPoNo("");
    setConfirmWord("");
    setSaving(false);
    setPreview(null);
    setLoadingPreview(true);
    fetchPODeletePreview(poId)
      .then(setPreview)
      .catch((e) =>
        Alert.alert("Load failed", e?.message ?? "Could not load PO details."),
      )
      .finally(() => setLoadingPreview(false));
  }, [visible, poId]);

  if (!visible || !poId) return null;
  if ((currentUser as any)?.role_id !== 1) return null;

  const targetPoNo = preview?.poNo || poNo || `PO#${poId}`;
  const canConfirm =
    confirmPoNo.trim() === targetPoNo &&
    confirmWord.trim().toUpperCase() === "DELETE";

  const handleDelete = async () => {
    if (!canConfirm || saving) return;
    setSaving(true);
    try {
      await deletePurchaseOrderDeep(poId);
      onDeleted(poId);
      onClose();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not delete PO.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-gray-50">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <View className="px-5 pt-4 pb-3 bg-red-700">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 mr-3">
                <Text className="text-red-200 text-[11px] font-bold tracking-widest uppercase">
                  Admin · Delete Purchase Order
                </Text>
                <Text className="text-white text-[18px] font-extrabold">
                  {targetPoNo || "—"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={10}
                className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center"
              >
                <MaterialIcons name="close" size={18} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <View className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 mb-3 flex-row items-start gap-3">
              <MaterialIcons
                name="delete-forever"
                size={18}
                color="#b91c1c"
                style={{ marginTop: 1 }}
              />
              <View className="flex-1">
                <Text className="text-[12.5px] font-bold text-red-800">
                  Permanent deletion
                </Text>
                <Text className="text-[11.5px] text-red-700 mt-1 leading-5">
                  This will delete the PO and its connected records from the
                  database. This action cannot be undone.
                </Text>
              </View>
            </View>

            {loadingPreview ? (
              <View className="bg-white border border-gray-200 rounded-2xl p-4">
                <View className="flex-row items-center gap-2">
                  <ActivityIndicator color="#b91c1c" />
                  <Text className="text-[12px] text-gray-600 font-semibold">
                    Loading deletion impact…
                  </Text>
                </View>
              </View>
            ) : (
              <View className="flex-row gap-2 mb-3">
                <ImpactBadge
                  icon="receipt-long"
                  label="PO Items"
                  value={preview?.poItemCount ?? 0}
                  color="#16a34a"
                />
                <ImpactBadge
                  icon="chat-bubble-outline"
                  label="Remarks"
                  value={preview?.remarkCount ?? 0}
                  color="#0ea5e9"
                />
                <ImpactBadge
                  icon="label"
                  label="Status"
                  value={preview?.currentStatusId ?? 0}
                  color="#7c3aed"
                />
              </View>
            )}

            <View className="bg-white border border-gray-200 rounded-2xl p-4">
              <Text className="text-[12px] font-extrabold text-gray-900">
                Confirm deletion
              </Text>
              <Text className="text-[11px] text-gray-500 mt-1">
                Type the exact PO No. and then type DELETE to unlock the button.
              </Text>

              <Text className="text-[11px] font-bold text-gray-600 mt-4 mb-1">
                PO No.
              </Text>
              <TextInput
                value={confirmPoNo}
                onChangeText={setConfirmPoNo}
                placeholder={targetPoNo || "PO-XXXX-XXXX"}
                placeholderTextColor="#9ca3af"
                autoCapitalize="characters"
                className="border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-800 bg-white"
              />

              <Text className="text-[11px] font-bold text-gray-600 mt-3 mb-1">
                Type DELETE
              </Text>
              <TextInput
                value={confirmWord}
                onChangeText={setConfirmWord}
                placeholder="DELETE"
                placeholderTextColor="#9ca3af"
                autoCapitalize="characters"
                className="border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-800 bg-white"
              />
            </View>
          </ScrollView>

          <View className="px-4 pb-4 pt-3 bg-white border-t border-gray-100">
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={onClose}
                activeOpacity={0.85}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-white"
                disabled={saving}
              >
                <Text className="text-[12px] font-bold text-gray-700 text-center">
                  Close
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  Alert.alert(
                    "Delete PO permanently?",
                    "This cannot be undone. Continue?",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => void handleDelete(),
                      },
                    ],
                  )
                }
                activeOpacity={0.85}
                className={`flex-1 px-4 py-2.5 rounded-xl ${
                  canConfirm && !saving ? "bg-red-700" : "bg-gray-300"
                }`}
                disabled={!canConfirm || saving}
              >
                <Text className="text-[12px] font-bold text-white text-center">
                  {saving ? "Deleting…" : "Delete PO"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

