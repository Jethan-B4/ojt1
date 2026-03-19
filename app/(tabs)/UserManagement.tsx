/**
 * UserManagement.tsx — User Admin Panel
 *
 * Admin-only screen for viewing and managing system users.
 * Shows all users with their roles, divisions, designations, and last login times.
 * Supports CRUD operations: Create, Read, Update, Delete.
 */

import {
  fetchAllRoles,
  fetchAllUsers,
  type RoleRow,
  type UserRow,
} from "@/lib/supabase";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import CreateUserModal from "../(modals)/CreateUserModal";
import DeleteUserModal from "../(modals)/DeleteUserModal";
import EditUserModal from "../(modals)/EditUserModal";

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

interface ProcessedUser extends UserRow {
  initials: string;
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTime(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(username: string): string {
  return username
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getRoleColor(roleId: number): string {
  const colors: Record<number, string> = {
    1: "#064E3B", // Admin - teal
    2: "#2563eb", // Division Head - blue
    3: "#8b5cf6", // BAC - purple
    4: "#f59e0b", // Budget - amber
    5: "#ef4444", // PARPO - red
    6: "#6b7280", // End User - gray
    7: "#9333ea", // Canvasser - violet
    8: "#0891b2", // Supply - cyan
  };
  return colors[roleId] ?? "#9ca3af";
}

function getRoleLabelFromArray(roleId: number, roles: RoleRow[]): string {
  const role = roles.find((r) => r.role_id === roleId);
  return role?.role_name ?? `Role ${roleId}`;
}

// ─── User Avatar ──────────────────────────────────────────────────────────────

function UserAvatar({
  initials,
  roleId,
}: {
  initials: string;
  roleId: number;
}) {
  const bg = getRoleColor(roleId);
  return (
    <View
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: "700",
          color: "#ffffff",
          fontFamily: MONO,
        }}
      >
        {initials}
      </Text>
    </View>
  );
}

// ─── User Row ─────────────────────────────────────────────────────────────────

function UserTableRow({
  user,
  isEven,
  roles,
  onPress,
  onEdit,
  onDelete,
}: {
  user: ProcessedUser;
  isEven: boolean;
  roles: RoleRow[];
  onPress?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const roleColor = getRoleColor(user.role_id);
  const roleLabel = getRoleLabelFromArray(user.role_id, roles);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        backgroundColor: isEven ? "#f9fafb" : "#ffffff",
        borderBottomWidth: 1,
        borderBottomColor: "#f3f4f6",
        paddingHorizontal: 14,
        paddingVertical: 11,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        {/* Avatar */}
        <UserAvatar initials={user.initials} roleId={user.role_id} />

        {/* Main info */}
        <View style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginBottom: 2,
            }}
          >
            <Text
              style={{
                fontSize: 12.5,
                fontWeight: "700",
                color: "#111827",
              }}
            >
              {user.fullname}
            </Text>
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginBottom: 3,
              flexWrap: "wrap",
            }}
          >
            <View
              style={{
                backgroundColor: roleColor,
                paddingHorizontal: 7,
                paddingVertical: 3,
                borderRadius: 999,
              }}
            >
              <Text
                style={{
                  fontSize: 9.5,
                  fontWeight: "700",
                  color: "#ffffff",
                }}
              >
                {roleLabel}
              </Text>
            </View>
            {user.division_name && (
              <View
                style={{
                  backgroundColor: "#f3f4f6",
                  paddingHorizontal: 7,
                  paddingVertical: 3,
                  borderRadius: 999,
                }}
              >
                <Text
                  style={{
                    fontSize: 9.5,
                    fontWeight: "600",
                    color: "#6b7280",
                  }}
                >
                  {user.division_name}
                </Text>
              </View>
            )}
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                color: "#9ca3af",
                fontFamily: MONO,
              }}
            >
              ID: {user.username}
            </Text>
            {user.last_login && (
              <Text
                style={{
                  fontSize: 10,
                  color: "#9ca3af",
                }}
              >
                Last: {fmtDate(user.last_login)} {fmtTime(user.last_login)}
              </Text>
            )}
          </View>
        </View>

        {/* Action Buttons */}
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            alignItems: "center",
          }}
        >
          <TouchableOpacity
            onPress={() => onEdit?.()}
            style={{
              padding: 8,
              borderRadius: 6,
              backgroundColor: "#dbeafe",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialIcons name="edit" size={16} color="#2563eb" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onDelete?.()}
            style={{
              padding: 8,
              borderRadius: 6,
              backgroundColor: "#fee2e2",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialIcons name="delete" size={16} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function UserManagementScreen({ navigation }: any) {
  const [users, setUsers] = useState<ProcessedUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<ProcessedUser[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<ProcessedUser | null>(null);
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);

  // ── Load roles ──────────────────────────────────────────────────────────────
  const loadRoles = useCallback(async () => {
    try {
      const roleRows = await fetchAllRoles();
      setRoles(roleRows);
    } catch (err) {
      console.error("Failed to load roles:", err);
    }
  }, []);

  // ── Load users ──────────────────────────────────────────────────────────────
  const loadUsers = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const rows = await fetchAllUsers();
      const processed = rows.map((u) => ({
        ...u,
        initials: getInitials(u.fullname),
      }));
      setUsers(processed);
      setFilteredUsers(processed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadRoles();
    loadUsers();
  }, [loadRoles, loadUsers]);

  // ── Filter users ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredUsers(users);
      return;
    }

    const q = searchQuery.toLowerCase();
    const filtered = users.filter(
      (u) =>
        u.fullname.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.division_name?.toLowerCase().includes(q) ||
        u.role_name?.toLowerCase().includes(q)
    );
    setFilteredUsers(filtered);
  }, [searchQuery, users]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f9fafb",
        }}
      >
        <ActivityIndicator size="large" color="#064E3B" />
        <Text style={{ fontSize: 13, color: "#9ca3af", marginTop: 10 }}>
          Loading users…
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#f9fafb" }}>
      {/* ── Header ── */}
      <View
        style={{
          backgroundColor: "#064E3B",
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 16,
        }}
      >
        <Text
          style={{
            fontSize: 9.5,
            fontWeight: "600",
            color: "rgba(255,255,255,0.4)",
            textTransform: "uppercase",
            letterSpacing: 1.2,
          }}
        >
          Admin · System
        </Text>
        <Text
          style={{
            fontSize: 22,
            fontWeight: "800",
            color: "#ffffff",
            marginTop: 2,
          }}
        >
          User Management
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.5)",
            marginTop: 2,
          }}
        >
          View and manage system users
        </Text>

        {/* Stats */}
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            marginTop: 14,
          }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(255,255,255,0.08)",
              borderRadius: 12,
              padding: 10,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "800",
                color: "#ffffff",
              }}
            >
              {users.length}
            </Text>
            <Text
              style={{
                fontSize: 9.5,
                color: "rgba(255,255,255,0.5)",
                marginTop: 1,
                textAlign: "center",
              }}
            >
              Total Users
            </Text>
          </View>
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(255,255,255,0.08)",
              borderRadius: 12,
              padding: 10,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "800",
                color: "#ffffff",
              }}
            >
              {users.filter((u) => u.role_id === 1).length}
            </Text>
            <Text
              style={{
                fontSize: 9.5,
                color: "rgba(255,255,255,0.5)",
                marginTop: 1,
                textAlign: "center",
              }}
            >
              Admins
            </Text>
          </View>
        </View>
      </View>

      {/* ── Search bar ── */}
      <View
        style={{
          paddingHorizontal: 12,
          paddingVertical: 12,
          backgroundColor: "#ffffff",
          borderBottomWidth: 1,
          borderBottomColor: "#f3f4f6",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: "#f9fafb",
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "#e5e7eb",
              paddingHorizontal: 12,
              paddingVertical: 9,
            }}
          >
            <MaterialIcons name="search" size={16} color="#9ca3af" />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by name, ID, division…"
              placeholderTextColor="#9ca3af"
              style={{
                flex: 1,
                fontSize: 13,
                color: "#111827",
              }}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={8}>
                <MaterialIcons name="close" size={14} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            onPress={() => setIsCreateModalVisible(true)}
            style={{
              backgroundColor: "#064E3B",
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <MaterialIcons name="add" size={18} color="#ffffff" />
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: "#ffffff",
              }}
            >
              Create
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Error banner ── */}
      {error && (
        <View
          style={{
            marginHorizontal: 12,
            marginTop: 10,
            backgroundColor: "#fef2f2",
            borderWidth: 1,
            borderColor: "#fecaca",
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
        >
          <Text
            style={{
              color: "#dc2626",
              fontSize: 12,
              fontWeight: "600",
            }}
          >
            Error: {error}
          </Text>
        </View>
      )}

      {/* ── Users list ── */}
      <FlatList
        data={filteredUsers}
        keyExtractor={(item) => item.username}
        renderItem={({ item, index }) => (
          <UserTableRow
            user={item}
            isEven={index % 2 === 0}
            roles={roles}
            onEdit={() => {
              setSelectedUser(item);
              setIsEditModalVisible(true);
            }}
            onDelete={() => {
              setSelectedUser(item);
              setIsDeleteModalVisible(true);
            }}
          />
        )}
        contentContainerStyle={{
          borderTopWidth: 1,
          borderTopColor: "#f3f4f6",
          marginTop: 2,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadUsers(true);
            }}
            tintColor="#064E3B"
          />
        }
        ListEmptyComponent={
          <View
            style={{
              alignItems: "center",
              paddingTop: 48,
              gap: 10,
            }}
          >
            <MaterialIcons name="people-outline" size={44} color="#d1d5db" />
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: "#374151",
              }}
            >
              No users found
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: "#9ca3af",
                textAlign: "center",
              }}
            >
              {searchQuery
                ? `No users match "${searchQuery}"`
                : "Failed to load users. Try refreshing."}
            </Text>
          </View>
        }
      />

      {/* ── Modals ── */}
      <CreateUserModal
        visible={isCreateModalVisible}
        onClose={() => setIsCreateModalVisible(false)}
        onCreated={(user) => {
          setUsers([
            ...users,
            { ...user, initials: getInitials(user.fullname) },
          ]);
          setIsCreateModalVisible(false);
          loadUsers(true);
        }}
      />

      <EditUserModal
        visible={isEditModalVisible}
        user={selectedUser}
        onClose={() => {
          setIsEditModalVisible(false);
          setSelectedUser(null);
        }}
        onUpdated={(user) => {
          setUsers(users.map((u) => (u.username === user.username ? user : u)));
          setIsEditModalVisible(false);
          setSelectedUser(null);
          loadUsers(true);
        }}
      />

      <DeleteUserModal
        visible={isDeleteModalVisible}
        user={selectedUser}
        onClose={() => {
          setIsDeleteModalVisible(false);
          setSelectedUser(null);
        }}
        onDeleted={(userId) => {
          setUsers(users.filter((u) => u.username !== userId));
          setIsDeleteModalVisible(false);
          setSelectedUser(null);
          loadUsers(true);
        }}
      />
    </View>
  );
}
