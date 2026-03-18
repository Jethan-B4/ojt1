/**
 * DeleteUserModal.tsx — Delete User Confirmation Modal
 */

import { deleteUser } from "@/lib/supabase";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Modal,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

interface DeleteUserModalProps {
  visible: boolean;
  user: any | null;
  onClose: () => void;
  onDeleted: (userId: string) => void;
}

export default function DeleteUserModal({
  visible,
  user,
  onClose,
  onDeleted,
}: DeleteUserModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!user) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteUser(user.user_id);
      onDeleted(user.user_id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    } finally {
      setDeleting(false);
    }
  };

  if (!visible || !user) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 24,
        }}>
        <View
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 16,
            paddingHorizontal: 24,
            paddingVertical: 24,
            width: "100%",
            maxWidth: 360,
            gap: 16,
          }}>
          {/* Icon */}
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: "#fee2e2",
              alignItems: "center",
              justifyContent: "center",
              alignSelf: "center",
            }}>
            <MaterialIcons name="warning" size={28} color="#dc2626" />
          </View>

          {/* Title */}
          <Text
            style={{
              fontSize: 16,
              fontWeight: "800",
              color: "#111827",
              textAlign: "center",
            }}>
            Delete User?
          </Text>

          {/* Message */}
          <Text
            style={{
              fontSize: 14,
              color: "#6b7280",
              textAlign: "center",
              lineHeight: 20,
            }}>
            Are you sure you want to delete{" "}
            <Text style={{ fontWeight: "700", color: "#111827" }}>
              {user.username}
            </Text>
            ? This action cannot be undone.
          </Text>

          {/* Error */}
          {error && (
            <View
              style={{
                backgroundColor: "#fef2f2",
                borderWidth: 1,
                borderColor: "#fecaca",
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}>
              <Text style={{ color: "#dc2626", fontSize: 12 }}>{error}</Text>
            </View>
          )}

          {/* Buttons */}
          <View
            style={{
              flexDirection: "row",
              gap: 10,
              marginTop: 8,
            }}>
            <TouchableOpacity
              onPress={onClose}
              disabled={deleting}
              style={{
                flex: 1,
                backgroundColor: "#f3f4f6",
                borderRadius: 10,
                paddingVertical: 12,
                alignItems: "center",
              }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: "#6b7280",
                }}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDelete}
              disabled={deleting}
              style={{
                flex: 1,
                backgroundColor: deleting ? "#9ca3af" : "#dc2626",
                borderRadius: 10,
                paddingVertical: 12,
                alignItems: "center",
              }}>
              {deleting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: "#ffffff",
                  }}>
                  Delete
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
