/**
 * EditUserModal.tsx — Edit User Modal
 *
 * Form to edit an existing user's details (username, password, designation, division, role).
 */

import {
    fetchAllDivisions,
    fetchAllRoles,
    updateUser,
    type DivisionRow,
    type RoleRow,
} from "@/lib/supabase";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
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
import DropdownPicker from "./DropdownPicker";

interface EditUserModalProps {
  visible: boolean;
  user: any | null;
  onClose: () => void;
  onUpdated: (user: any) => void;
}

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

export default function EditUserModal({
  visible,
  user,
  onClose,
  onUpdated,
}: EditUserModalProps) {
  const [userId, setUserId] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [designation, setDesignation] = useState("");
  const [divisionId, setDivisionId] = useState<number | null>(null);
  const [roleId, setRoleId] = useState<number | null>(null);

  const [divisions, setDivisions] = useState<DivisionRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingLoading, setSavingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Initialize form ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible || !user) return;
    setLoading(true);
    setError(null);
    setUserId(user.user_id);
    setUsername(user.username);
    setPassword("");
    setDesignation(user.designation ?? "");
    setDivisionId(user.division_id ?? null);
    setRoleId(user.role_id);

    Promise.all([fetchAllDivisions(), fetchAllRoles()])
      .then(([divs, rls]) => {
        setDivisions(divs);
        setRoles(rls);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [visible, user]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!userId.trim() || !username.trim() || !roleId) {
      setError("User ID, Username, and Role are required");
      return;
    }

    setSavingLoading(true);
    try {
      const updates: any = {
        username,
        designation: designation.trim() || null,
        division_id: divisionId,
        role_id: roleId,
      };

      // Include user_id if it has changed
      if (userId !== user.user_id) {
        updates.user_id = userId;
      }

      if (password.trim()) {
        updates.password = password;
      }

      const updated = await updateUser(user.user_id, updates);
      onUpdated(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setSavingLoading(false);
    }
  };

  if (!visible || !user) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: "#ffffff" }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: "#ffffff" }}>
            {/* Header */}
            <View
              style={{
                backgroundColor: "#064E3B",
                paddingHorizontal: 20,
                paddingTop: 20,
                paddingBottom: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}>
              <View>
                <Text
                  style={{
                    fontSize: 9.5,
                    fontWeight: "600",
                    color: "rgba(255,255,255,0.6)",
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}>
                  Edit User
                </Text>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "800",
                    color: "#ffffff",
                    marginTop: 4,
                    flex: 1,
                  }}
                  numberOfLines={1}>
                  {username}
                </Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: "rgba(255,255,255,0.2)",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                <MaterialIcons name="close" size={20} color="#ffffff" />
              </TouchableOpacity>
            </View>

            {/* Content */}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingTop: 20,
                paddingBottom: 20,
              }}
              showsVerticalScrollIndicator={false}>
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
                    marginBottom: 16,
                  }}>
                  <Text style={{ color: "#dc2626", fontSize: 12 }}>
                    {error}
                  </Text>
                </View>
              )}

              {/* Loading */}
              {loading ? (
                <View style={{ alignItems: "center", paddingVertical: 40 }}>
                  <ActivityIndicator size="large" color="#064E3B" />
                </View>
              ) : (
                <>
                  {/* User ID */}
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
                      User ID <Text style={{ color: "#dc2626" }}>*</Text>
                    </Text>
                    <TextInput
                      value={userId}
                      onChangeText={setUserId}
                      placeholder="Unique login ID"
                      placeholderTextColor="#9ca3af"
                      editable
                      style={{
                        backgroundColor: "#f9fafb",
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: "#e5e7eb",
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        fontSize: 14,
                        color: "#111827",
                        fontFamily: MONO,
                      }}
                    />
                  </View>

                  {/* Username */}
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
                      Username <Text style={{ color: "#dc2626" }}>*</Text>
                    </Text>
                    <TextInput
                      value={username}
                      onChangeText={setUsername}
                      placeholder="Full Name"
                      placeholderTextColor="#9ca3af"
                      style={{
                        backgroundColor: "#f9fafb",
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: "#e5e7eb",
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        fontSize: 14,
                        color: "#111827",
                      }}
                    />
                  </View>

                  {/* Password (leave blank to keep unchanged) */}
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
                      Password (Leave blank to keep unchanged)
                    </Text>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder="New password (optional)"
                      placeholderTextColor="#9ca3af"
                      secureTextEntry
                      style={{
                        backgroundColor: "#f9fafb",
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: "#e5e7eb",
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        fontSize: 14,
                        color: "#111827",
                      }}
                    />
                  </View>

                  {/* Designation */}
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
                      Designation
                    </Text>
                    <TextInput
                      value={designation}
                      onChangeText={setDesignation}
                      placeholder="Job Title"
                      placeholderTextColor="#9ca3af"
                      style={{
                        backgroundColor: "#f9fafb",
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: "#e5e7eb",
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        fontSize: 14,
                        color: "#111827",
                      }}
                    />
                  </View>

                  {/* Division */}
                  <DropdownPicker
                    label="Division"
                    selectedId={divisionId}
                    selectedName={
                      divisions.find((d) => d.division_id === divisionId)
                        ?.division_name || ""
                    }
                    items={divisions
                      .filter((d) => d.division_name)
                      .map((d) => ({
                        id: d.division_id,
                        name: d.division_name || "",
                      }))}
                    onSelect={setDivisionId}
                  />

                  {/* Role */}
                  <DropdownPicker
                    label="Role"
                    selectedId={roleId}
                    selectedName={
                      roles.find((r) => r.role_id === roleId)?.role_name || ""
                    }
                    items={roles.map((r) => ({
                      id: r.role_id,
                      name: r.role_name,
                    }))}
                    onSelect={setRoleId}
                    required
                  />
                </>
              )}
            </ScrollView>

            {/* Footer actions */}
            {!loading && (
              <View
                style={{
                  paddingHorizontal: 20,
                  paddingVertical: 16,
                  flexDirection: "row",
                  gap: 10,
                  borderTopWidth: 1,
                  borderTopColor: "#f3f4f6",
                }}>
                <TouchableOpacity
                  onPress={onClose}
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
                  onPress={handleSave}
                  disabled={savingLoading}
                  style={{
                    flex: 1,
                    backgroundColor: savingLoading ? "#9ca3af" : "#064E3B",
                    borderRadius: 10,
                    paddingVertical: 12,
                    alignItems: "center",
                  }}>
                  {savingLoading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "700",
                        color: "#ffffff",
                      }}>
                      Save
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
