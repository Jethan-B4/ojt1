/**
 * CancelPOModal.tsx
 *
 * Admin-only (role_id = 1) modal for cancelling a Purchase Order.
 *
 * UX pattern mirrors CancelPRModal:
 *   - Preview card: shows PO/supplier details + what will be affected
 *   - Reason textarea (required)
 *   - Confirmation field: must type the exact PO No. to unlock the button
 *   - Destructive red confirm button, gray dismiss button
 *
 * Data layer: cancelPurchaseOrder + fetchPOCancelPreview from cancelPO.ts
 */

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
  cancelPurchaseOrder,
  fetchPOCancelPreview,
  type CancelPOPreview,
} from "../../lib/supabase/cancelPO";
import { useAuth } from "../contexts/AuthContext";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  poId: string | null;
  poNo: string | null;
  onClose: () => void;
  /** Called with the cancelled PO id after a successful cancellation. */
  onCancelled: (poId: string) => void;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string | number | null | undefined;
}) {
  if (!value && value !== 0) return null;
  return (
    <View className="flex-row items-start gap-2 py-1.5">
      <MaterialIcons
        name={icon}
        size={14}
        color="#6b7280"
        style={{ marginTop: 1 }}
      />
      <View className="flex-1 flex-row justify-between">
        <Text className="text-[11.5px] text-gray-500">{label}</Text>
        <Text
          className="text-[11.5px] font-semibold text-gray-800 text-right flex-1 ml-3"
          numberOfLines={2}
        >
          {value}
        </Text>
      </View>
    </View>
  );
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

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function CancelPOModal({
  visible,
  poId,
  poNo,
  onClose,
  onCancelled,
}: Props) {
  const { currentUser } = useAuth();

  const [preview, setPreview] = useState<CancelPOPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [saving, setSaving] = useState(false);

  // Re-load preview each time the modal opens
  useEffect(() => {
    if (!visible || !poId) return;
    setReason("");
    setConfirmText("");
    setSaving(false);
    setPreview(null);
    setLoadingPreview(true);
    fetchPOCancelPreview(poId)
      .then(setPreview)
      .catch((e) =>
        Alert.alert("Load failed", e?.message ?? "Could not load PO details."),
      )
      .finally(() => setLoadingPreview(false));
  }, [visible, poId]);

  if (!visible || !poId) return null;

  const targetPoNo = preview?.poNo ?? poNo ?? "";
  const canConfirm =
    confirmText.trim().toUpperCase() === targetPoNo.toUpperCase() &&
    reason.trim().length > 0;

  const fmt = (n: number) =>
    n.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const handleCancel = async () => {
    if (!canConfirm) return;
    setSaving(true);
    try {
      await cancelPurchaseOrder(poId, currentUser?.id ?? null, reason.trim());
      onCancelled(poId);
      onClose();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not cancel PO.");
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
          {/* ── Header ── */}
          <View className="px-5 pt-4 pb-3 bg-red-700">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 mr-3">
                <Text className="text-red-200 text-[11px] font-bold tracking-widest uppercase">
                  Admin · Cancel Purchase Order
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
            {/* ── Warning banner ── */}
            <View className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 mb-3 flex-row items-start gap-3">
              <MaterialIcons
                name="warning"
                size={18}
                color="#b91c1c"
                style={{ marginTop: 1 }}
              />
              <View className="flex-1">
                <Text className="text-[12.5px] font-bold text-red-800 mb-0.5">
                  This action cannot be undone
                </Text>
                <Text className="text-[11.5px] text-red-700 leading-5">
                  Cancelling this PO will void the record and reject any linked
                  ORS entry. All existing remarks and line items are preserved
                  for the audit trail.
                </Text>
              </View>
            </View>

            {/* ── Preview card ── */}
            <View
              className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-3"
              style={{ elevation: 2 }}
            >
              <View className="px-4 pt-3 pb-1">
                <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                  PO Details
                </Text>
              </View>

              {loadingPreview ? (
                <View className="items-center py-6">
                  <ActivityIndicator color="#064E3B" />
                  <Text className="text-[11px] text-gray-400 mt-2">
                    Loading preview…
                  </Text>
                </View>
              ) : preview ? (
                <View className="px-4 pb-3">
                  <InfoRow
                    icon="receipt-long"
                    label="PO No."
                    value={preview.poNo ?? "—"}
                  />
                  <InfoRow
                    icon="link"
                    label="PR No."
                    value={preview.prNo ?? "None"}
                  />
                  <InfoRow
                    icon="storefront"
                    label="Supplier"
                    value={preview.supplier ?? "—"}
                  />
                  <InfoRow
                    icon="business"
                    label="Office Section"
                    value={preview.officeSection ?? "—"}
                  />
                  <InfoRow
                    icon="attach-money"
                    label="Total Amount"
                    value={`₱${fmt(preview.totalAmount)}`}
                  />
                  <InfoRow
                    icon="flag"
                    label="Current Status"
                    value={preview.currentStatusLabel}
                  />
                  {preview.orsNo && (
                    <InfoRow
                      icon="description"
                      label="Linked ORS"
                      value={preview.orsNo}
                    />
                  )}
                </View>
              ) : null}
            </View>

            {/* ── Impact summary ── */}
            {preview && (
              <View className="mb-3">
                <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 px-1">
                  What will be affected
                </Text>
                <View className="flex-row gap-2">
                  <ImpactBadge
                    icon="inventory-2"
                    label="Line Items"
                    value={preview.itemCount}
                    color="#6b7280"
                  />
                  <ImpactBadge
                    icon="chat-bubble-outline"
                    label="Remarks"
                    value={preview.remarkCount}
                    color="#6b7280"
                  />
                  <ImpactBadge
                    icon="description"
                    label="ORS Voided"
                    value={preview.orsEntryId ? "Yes" : "None"}
                    color={preview.orsEntryId ? "#b91c1c" : "#6b7280"}
                  />
                </View>
                <Text className="text-[10px] text-gray-400 mt-1.5 px-1">
                  Line items and remarks are preserved for audit. ORS entry (if
                  any) will be set to Rejected.
                </Text>
              </View>
            )}

            {/* ── Reason ── */}
            <View
              className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-3"
              style={{ elevation: 2 }}
            >
              <View className="px-4 pt-3 pb-3">
                <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                  Cancellation Reason{" "}
                  <Text className="text-red-400 normal-case tracking-normal text-[11px]">
                    (required)
                  </Text>
                </Text>
                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Enter the reason for cancellation…"
                  placeholderTextColor="#9ca3af"
                  multiline
                  textAlignVertical="top"
                  className="bg-gray-50 rounded-[10px] border border-gray-200 px-3 py-2.5 text-sm text-gray-900"
                  style={{ minHeight: 90 }}
                />
              </View>
            </View>

            {/* ── Confirmation field ── */}
            <View
              className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-4"
              style={{ elevation: 2 }}
            >
              <View className="px-4 pt-3 pb-3">
                <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                  Confirm Cancellation
                </Text>
                <Text className="text-[11.5px] text-gray-500 mb-2">
                  Type{" "}
                  <Text
                    className="font-bold text-gray-800"
                    style={{
                      fontFamily:
                        Platform.OS === "ios" ? "Courier New" : "monospace",
                    }}
                  >
                    {targetPoNo}
                  </Text>{" "}
                  to enable the cancel button.
                </Text>
                <TextInput
                  value={confirmText}
                  onChangeText={setConfirmText}
                  placeholder={targetPoNo}
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  className="bg-gray-50 rounded-[10px] px-3 py-2.5 text-sm text-gray-900 border"
                  style={{
                    borderColor: canConfirm ? "#10b981" : "#e5e7eb",
                    fontFamily:
                      Platform.OS === "ios" ? "Courier New" : "monospace",
                  }}
                />
                {confirmText.length > 0 && !canConfirm && (
                  <View className="flex-row items-center gap-1 mt-1.5">
                    <MaterialIcons
                      name="error-outline"
                      size={12}
                      color="#ef4444"
                    />
                    <Text className="text-[10.5px] text-red-500">
                      {reason.trim().length === 0
                        ? "A cancellation reason is also required."
                        : `Must match exactly: ${targetPoNo}`}
                    </Text>
                  </View>
                )}
                {canConfirm && (
                  <View className="flex-row items-center gap-1 mt-1.5">
                    <MaterialIcons
                      name="check-circle"
                      size={12}
                      color="#10b981"
                    />
                    <Text className="text-[10.5px] text-emerald-600 font-semibold">
                      Confirmation matched — ready to cancel.
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* ── Action buttons ── */}
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={onClose}
                activeOpacity={0.8}
                className="flex-1 bg-gray-100 border border-gray-200 rounded-2xl py-3.5 items-center"
              >
                <Text className="text-[13px] font-bold text-gray-600">
                  Dismiss
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleCancel}
                disabled={saving || !canConfirm}
                activeOpacity={0.85}
                className="flex-1 rounded-2xl py-3.5 items-center flex-row justify-center gap-2"
                style={{
                  backgroundColor: canConfirm ? "#b91c1c" : "#fecaca",
                }}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <MaterialIcons
                      name="cancel"
                      size={15}
                      color={canConfirm ? "#ffffff" : "#7f1d1d"}
                    />
                    <Text
                      className="text-[13px] font-extrabold"
                      style={{ color: canConfirm ? "#ffffff" : "#7f1d1d" }}
                    >
                      Cancel PO
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
