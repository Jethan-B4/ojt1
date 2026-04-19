/**
 * ProcessPaymentModal.tsx — Phase 4 payment / disbursement on `deliveries`
 *
 * Status flow (public.status): 35 ready → 25–32 steps → 36 completed (payment).
 * Roles: Accounting (9), PARPO (5), Supply/EMDS (8), Division Head (2), Cash (10), Admin (1) override.
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useEffect, useState } from "react";
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
import {
  fetchDeliveryById,
  insertDeliveryProcessRemark,
  updateDelivery,
  type DeliveryRow,
} from "../../lib/supabase/delivery";
import {
  FlagButton,
  StatusFlagPicker,
  type StatusFlag,
} from "./ProcessPRModal";
import { useAuth } from "../AuthContext";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProcessPaymentRecord {
  id: number;
  deliveryNo: string;
  poNo: string;
  statusId: number;
  supplier?: string | null;
}

interface ProcessPaymentModalProps {
  visible: boolean;
  record: ProcessPaymentRecord | null;
  roleId: number;
  onClose: () => void;
  onProcessed: (deliveryId: number, newStatusId: number) => void;
}

const PAYMENT_NEXT: Record<number, number> = {
  35: 25,
  25: 26,
  26: 27,
  27: 28,
  28: 29,
  29: 30,
  30: 31,
  31: 32,
  32: 36,
};

const ROLE_META: Record<
  number,
  { step: string; title: string; accentColor: string; nextStatusId: number }
> = {
  35: {
    step: "Intake",
    title: "Ready for Payment (Accounting)",
    accentColor: "#0f766e",
    nextStatusId: 25,
  },
  25: {
    step: "25",
    title: "Payment (Accounting)",
    accentColor: "#854d0e",
    nextStatusId: 26,
  },
  26: {
    step: "26",
    title: "Payment (PARPO)",
    accentColor: "#86198f",
    nextStatusId: 27,
  },
  27: {
    step: "27",
    title: "Payment (EMDS)",
    accentColor: "#0f766e",
    nextStatusId: 28,
  },
  28: {
    step: "28",
    title: "Payment (PARPO)",
    accentColor: "#86198f",
    nextStatusId: 29,
  },
  29: {
    step: "29",
    title: "Payment (Approval)",
    accentColor: "#1e40af",
    nextStatusId: 30,
  },
  30: {
    step: "30",
    title: "Payment (Report Encoding)",
    accentColor: "#854d0e",
    nextStatusId: 31,
  },
  31: {
    step: "31",
    title: "Payment (Tax Processing)",
    accentColor: "#854d0e",
    nextStatusId: 32,
  },
  32: {
    step: "32",
    title: "Payment (Releasing)",
    accentColor: "#166534",
    nextStatusId: 36,
  },
  36: {
    step: "Done",
    title: "Completed (Payment Phase)",
    accentColor: "#15803d",
    nextStatusId: 36,
  },
};

const PHASE4_STEPS: Record<number, { label: string; role: string }> = {
  35: { label: "Queue (post-delivery)", role: "Accounting" },
  25: { label: "Payment (Accounting)", role: "Accounting" },
  26: { label: "Payment (PARPO)", role: "PARPO" },
  27: { label: "Payment (EMDS)", role: "Supply" },
  28: { label: "Payment (PARPO) II", role: "PARPO" },
  29: { label: "Payment (Approval)", role: "Division Head" },
  30: { label: "Payment (Report Encoding)", role: "Accounting" },
  31: { label: "Payment (Tax Processing)", role: "Accounting" },
  32: { label: "Payment (Releasing)", role: "Cash" },
  36: { label: "Completed (Payment Phase)", role: "—" },
};

const ADMIN_TARGET_IDS = [
  35, 25, 26, 27, 28, 29, 30, 31, 32, 36,
] as const;

export function canRoleProcessPayment(
  roleId: number,
  statusId: number,
): boolean {
  if (roleId === 1) return true;
  if (roleId === 9 && (statusId === 35 || [25, 30, 31].includes(statusId)))
    return true;
  if (roleId === 5 && (statusId === 26 || statusId === 28)) return true;
  if (roleId === 8 && statusId === 27) return true;
  if (roleId === 2 && statusId === 29) return true;
  if (roleId === 10 && statusId === 32) return true;
  return false;
}

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

const FLAG_TO_ID: Record<StatusFlag, number> = {
  complete: 2,
  incomplete_info: 3,
  wrong_information: 4,
  needs_revision: 5,
  on_hold: 6,
  urgent: 7,
};

function mergeNotes(prev: string | null | undefined, line: string) {
  const p = (prev ?? "").trim();
  const l = line.trim();
  if (!p) return l;
  if (!l) return p;
  return `${p}\n${l}`;
}

// ─── Shared UI bits ──────────────────────────────────────────────────────────

function ModalHeader({
  meta,
  deliveryNo,
  onClose,
}: {
  meta: (typeof ROLE_META)[number];
  deliveryNo: string;
  onClose: () => void;
}) {
  return (
    <View
      className="px-5 pt-4 pb-3 flex-row items-center justify-between"
      style={{ backgroundColor: meta.accentColor }}
    >
      <View className="flex-1 pr-3">
        <Text className="text-[10px] font-bold uppercase tracking-widest text-white/70">
          Phase 4 · {meta.step}
        </Text>
        <Text className="text-[16px] font-extrabold text-white">{meta.title}</Text>
        <Text
          className="text-[12px] font-semibold text-white/80 mt-0.5"
          style={{ fontFamily: MONO }}
        >
          {deliveryNo}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onClose}
        hitSlop={10}
        className="w-8 h-8 rounded-xl bg-white/15 items-center justify-center"
      >
        <MaterialIcons name="close" size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

function SummaryCard({
  row,
  statusName,
}: {
  row: DeliveryRow | null;
  statusName: string;
}) {
  if (!row) return null;
  return (
    <View className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
      <Text className="text-[11px] font-bold text-gray-400 uppercase mb-2">
        Delivery summary
      </Text>
      <Text className="text-[12px] text-gray-700">
        <Text className="font-bold">PO: </Text>
        <Text style={{ fontFamily: MONO }}>{row.po_no ?? "—"}</Text>
      </Text>
      <Text className="text-[12px] text-gray-700 mt-1">
        <Text className="font-bold">Supplier: </Text>
        {row.supplier ?? "—"}
      </Text>
      <View className="mt-2 self-start rounded-full px-2.5 py-1 bg-gray-100">
        <Text className="text-[10px] font-bold text-gray-600">{statusName}</Text>
      </View>
    </View>
  );
}

function StepPaymentModal({
  visible,
  record,
  onClose,
  onProcessed,
}: Omit<ProcessPaymentModalProps, "roleId">) {
  const { currentUser } = useAuth();
  const [row, setRow] = useState<DeliveryRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [refNo, setRefNo] = useState("");
  const [statusFlag, setStatusFlag] = useState<StatusFlag | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const statusId = record?.statusId ?? 35;
  const meta = ROLE_META[statusId] ?? ROLE_META[35];
  const nextId = PAYMENT_NEXT[statusId];
  const statusName =
    PHASE4_STEPS[statusId]?.label ?? `Payment status ${statusId}`;

  useEffect(() => {
    if (!visible || !record) return;
    setRemarks("");
    setRefNo("");
    setStatusFlag(null);
    setLoading(true);
    fetchDeliveryById(record.id)
      .then(setRow)
      .catch(() => setRow(null))
      .finally(() => setLoading(false));
  }, [visible, record]);

  const handleSubmit = useCallback(async () => {
    if (!record || nextId == null) return;
    setSaving(true);
    try {
      const uid = (currentUser as any)?.id ?? null;
      const stamp = `[Payment ${statusId}→${nextId}] user=${uid ?? "—"}${refNo.trim() ? ` ref=${refNo.trim()}` : ""}${remarks.trim() ? ` ${remarks.trim()}` : ""}`;
      await updateDelivery(record.id, {
        status_id: nextId,
        notes: mergeNotes(row?.notes, stamp),
      });
      await insertDeliveryProcessRemark(
        record.id,
        uid,
        remarks.trim() || stamp,
        statusFlag ? FLAG_TO_ID[statusFlag] : null,
        "payment",
      );
      onProcessed(record.id, nextId);
      onClose();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not update payment status.");
    } finally {
      setSaving(false);
    }
  }, [record, nextId, statusId, row?.notes, remarks, refNo, statusFlag, currentUser, onProcessed, onClose]);

  if (!record) return null;

  const confirmLabel =
    statusId === 35
      ? "Begin payment (Accounting)"
      : statusId === 32
        ? "Complete payment phase"
        : "Forward";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        className="flex-1 bg-white"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ModalHeader meta={meta} deliveryNo={record.deliveryNo} onClose={onClose} />
        {loading ? (
          <View className="flex-1 items-center justify-center bg-gray-50">
            <ActivityIndicator size="large" color={meta.accentColor} />
          </View>
        ) : (
          <ScrollView
            className="flex-1 bg-gray-50"
            contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            <SummaryCard row={row} statusName={statusName} />
            <Text className="text-[10.5px] font-bold uppercase tracking-widest text-gray-400 mb-2">
              Action
            </Text>
            <Text className="text-[12px] text-gray-600 mb-3 leading-5">
              {statusId === 35
                ? "Delivery phase is complete. Open the accounting payment lane for this delivery."
                : "Record references and remarks, then forward to the next payment desk."}
            </Text>
            <Text className="text-[11px] font-bold text-gray-500 mb-1">
              Reference / tracking (optional)
            </Text>
            <TextInput
              value={refNo}
              onChangeText={setRefNo}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              placeholder="e.g. LDDAP / check no. / transmittal no."
              placeholderTextColor="#9ca3af"
              className="rounded-xl px-3.5 py-2.5 text-[13.5px] text-gray-800 border bg-white border-gray-200 mb-3"
              style={{ fontFamily: MONO }}
            />
            <Text className="text-[11px] font-bold text-gray-500 mb-1">
              Status Flag
            </Text>
            <View className="mb-3">
              <FlagButton selected={statusFlag} onPress={() => setFlagOpen(true)} />
            </View>
            <Text className="text-[11px] font-bold text-gray-500 mb-1">Remarks</Text>
            <TextInput
              value={remarks}
              onChangeText={setRemarks}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              placeholder="Notes visible on the delivery record…"
              placeholderTextColor="#9ca3af"
              multiline
              className="rounded-xl px-3.5 py-2.5 text-[13.5px] text-gray-800 border bg-white border-gray-200 min-h-[100px]"
              style={{ textAlignVertical: "top" }}
            />
          </ScrollView>
        )}
        <View className="flex-row items-center justify-between px-5 py-4 bg-white border-t border-gray-100">
          <TouchableOpacity
            onPress={onClose}
            className="px-4 py-3 rounded-xl border border-gray-200 bg-white"
          >
            <Text className="text-[13.5px] font-semibold text-gray-500">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={loading || saving}
            className={`flex-row items-center gap-2 px-5 py-3 rounded-xl ${
              loading || saving ? "opacity-40" : ""
            }`}
            style={{ backgroundColor: meta.accentColor }}
          >
            {saving && <ActivityIndicator size="small" color="#fff" />}
            <Text className="text-[13.5px] font-bold text-white">
              {saving ? "Saving…" : confirmLabel}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      <StatusFlagPicker
        visible={flagOpen}
        selected={statusFlag}
        onSelect={setStatusFlag}
        onClose={() => setFlagOpen(false)}
      />
    </Modal>
  );
}

function AdminPaymentModal({
  visible,
  record,
  onClose,
  onProcessed,
}: Omit<ProcessPaymentModalProps, "roleId">) {
  const { currentUser } = useAuth();
  const [row, setRow] = useState<DeliveryRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [statusFlag, setStatusFlag] = useState<StatusFlag | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [targetStatusId, setTargetStatusId] = useState<number>(25);
  const [saving, setSaving] = useState(false);

  const currentStatus = record?.statusId ?? 35;
  const meta = ROLE_META[currentStatus] ?? ROLE_META[35];

  useEffect(() => {
    if (!visible || !record) return;
    setTargetStatusId(PAYMENT_NEXT[currentStatus] ?? 36);
    setRemarks("");
    setStatusFlag(null);
    setLoading(true);
    fetchDeliveryById(record.id)
      .then(setRow)
      .catch(() => setRow(null))
      .finally(() => setLoading(false));
  }, [visible, record, currentStatus]);

  const submit = useCallback(async () => {
    if (!record) return;
    setSaving(true);
    try {
      const uid = (currentUser as any)?.id ?? null;
      const stamp = `[Payment ADMIN → ${targetStatusId}] user=${uid ?? "—"}${remarks.trim() ? ` ${remarks.trim()}` : ""}`;
      await updateDelivery(record.id, {
        status_id: targetStatusId,
        notes: mergeNotes(row?.notes, stamp),
      });
      await insertDeliveryProcessRemark(
        record.id,
        uid,
        remarks.trim() || stamp,
        statusFlag ? FLAG_TO_ID[statusFlag] : null,
        "payment",
      );
      onProcessed(record.id, targetStatusId);
      onClose();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not override payment status.");
    } finally {
      setSaving(false);
    }
  }, [record, targetStatusId, row?.notes, remarks, statusFlag, currentUser, onProcessed, onClose]);

  if (!record) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        className="flex-1 bg-white"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ModalHeader meta={meta} deliveryNo={record.deliveryNo} onClose={onClose} />
        {loading ? (
          <View className="flex-1 items-center justify-center bg-gray-50">
            <ActivityIndicator size="large" color={meta.accentColor} />
          </View>
        ) : (
          <ScrollView
            className="flex-1 bg-gray-50"
            contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            <View className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-4 flex-row gap-2">
              <MaterialIcons name="admin-panel-settings" size={18} color="#92400e" />
              <Text className="text-[12px] text-amber-900 flex-1 leading-5">
                Admin override — Phase 4. Set the delivery payment status directly.
              </Text>
            </View>
            <SummaryCard
              row={row}
              statusName={
                PHASE4_STEPS[currentStatus]?.label ?? `Status ${currentStatus}`
              }
            />
            <Text className="text-[10.5px] font-bold uppercase tracking-widest text-gray-400 mb-2">
              Target status
            </Text>
            <View className="flex-row flex-wrap gap-2 mb-4">
              {ADMIN_TARGET_IDS.map((sid) => {
                const m = PHASE4_STEPS[sid];
                if (!m) return null;
                const active = targetStatusId === sid;
                return (
                  <TouchableOpacity
                    key={sid}
                    onPress={() => setTargetStatusId(sid)}
                    className={`px-3 py-1.5 rounded-full border ${
                      active ? "bg-[#064E3B] border-[#064E3B]" : "bg-white border-gray-300"
                    }`}
                  >
                    <Text
                      className={`text-[10.5px] font-bold ${active ? "text-white" : "text-gray-700"}`}
                    >
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text className="text-[11px] font-bold text-gray-500 mb-1">Admin remark</Text>
            <TextInput
              value={remarks}
              onChangeText={setRemarks}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              placeholder="Reason for override…"
              placeholderTextColor="#9ca3af"
              multiline
              className="rounded-xl px-3.5 py-2.5 text-[13.5px] text-gray-800 border bg-white border-gray-200 min-h-[88px]"
              style={{ textAlignVertical: "top" }}
            />
            <Text className="text-[11px] font-bold text-gray-500 mt-3 mb-1">
              Status Flag
            </Text>
            <FlagButton selected={statusFlag} onPress={() => setFlagOpen(true)} />
          </ScrollView>
        )}
        <View className="flex-row items-center justify-between px-5 py-4 bg-white border-t border-gray-100">
          <TouchableOpacity
            onPress={onClose}
            className="px-4 py-3 rounded-xl border border-gray-200 bg-white"
          >
            <Text className="text-[13.5px] font-semibold text-gray-500">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={submit}
            disabled={loading || saving}
            className={`flex-row items-center gap-2 px-5 py-3 rounded-xl bg-[#064E3B] ${
              loading || saving ? "opacity-40" : ""
            }`}
          >
            {saving && <ActivityIndicator size="small" color="#fff" />}
            <Text className="text-[13.5px] font-bold text-white">
              {saving ? "Saving…" : "Apply status"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      <StatusFlagPicker
        visible={flagOpen}
        selected={statusFlag}
        onSelect={setStatusFlag}
        onClose={() => setFlagOpen(false)}
      />
    </Modal>
  );
}

export default function ProcessPaymentModal({
  roleId,
  ...rest
}: ProcessPaymentModalProps) {
  if (!rest.visible || !rest.record) return null;
  if (roleId === 1) return <AdminPaymentModal {...rest} />;
  return <StepPaymentModal {...rest} />;
}
