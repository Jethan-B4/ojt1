import { cancelPurchaseRequest } from "@/lib/supabase";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../AuthContext";

interface Props {
  visible: boolean;
  prId: string | null;
  prNo: string | null;
  onClose: () => void;
  onCancelled: (id: string) => void;
}

export default function CancelPRModal({
  visible,
  prId,
  prNo,
  onClose,
  onCancelled,
}: Props) {
  const { currentUser } = useAuth();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  if (!visible || !prId) return null;
  const canConfirm = confirmText.trim() === (prNo ?? "");
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
    >
      <View style={{ flex: 1, backgroundColor: "#fff" }}>
        <View
          style={{
            backgroundColor: "#064E3B",
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 12,
          }}
        >
          <Text style={{ fontSize: 10, color: "#9ca3af", fontWeight: "700" }}>
            Cancel Purchase Request
          </Text>
          <Text style={{ fontSize: 15, color: "#fff", fontWeight: "800" }}>
            {prNo ?? ""}
          </Text>
        </View>
        <View style={{ padding: 16, gap: 8 }}>
          <Text style={{ fontSize: 12, color: "#374151", fontWeight: "700" }}>
            Reason
          </Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Enter cancellation reason"
            placeholderTextColor="#9ca3af"
            multiline
            style={{
              borderWidth: 1,
              borderColor: "#e5e7eb",
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              minHeight: 100,
              fontSize: 13,
              color: "#111827",
              textAlignVertical: "top",
            }}
          />
          <View style={{ height: 6 }} />
          <Text style={{ fontSize: 12, color: "#374151", fontWeight: "700" }}>
            Type the PR No. to confirm
          </Text>
          <TextInput
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder={prNo ?? "PR-XXXX"}
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            style={{
              borderWidth: 1,
              borderColor: canConfirm ? "#10b981" : "#e5e7eb",
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 13,
              color: "#111827",
            }}
          />
          {!canConfirm && (
            <Text style={{ fontSize: 10.5, color: "#EF4444" }}>
              Enter the exact PR No. to enable cancellation.
            </Text>
          )}
          <View style={{ height: 8 }} />
          <View style={{ flexDirection: "row", gap: 12 }}>
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.8}
              style={{
                flex: 1,
                backgroundColor: "#f3f4f6",
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: "center",
              }}
            >
              <Text
                style={{ fontSize: 13, fontWeight: "800", color: "#374151" }}
              >
                Close
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                try {
                  setSaving(true);
                  await cancelPurchaseRequest(prId, reason);
                  onCancelled(prId);
                  onClose();
                } catch (e: any) {
                  Alert.alert("Failed", e?.message ?? "Could not cancel PR.");
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving || !canConfirm}
              activeOpacity={0.8}
              style={{
                flex: 1,
                backgroundColor: canConfirm ? "#EF4444" : "#fecaca",
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: "center",
              }}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "800",
                    color: canConfirm ? "#fff" : "#7f1d1d",
                  }}
                >
                  Confirm Cancel
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
