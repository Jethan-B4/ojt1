/**
 * ProcessPOModal.tsx — Role-gated PO processing modal
 *
 * Roles that can process POs:
 *   role_id 1  → Admin   — can advance any PO step; override capability
 *   role_id 4  → Budget  — processes ORS at status 14 (ORS Creation → ORS Processing)
 *   role_id 8  → Supply  — primary processor: creates and allocates PO (12 → 13 → 14)
 *
 * PO Status flow (matches public.status table):
 *   12 → PO (Creation)      [starting status on create — Supply logs & creates PO]
 *   13 → PO (Allocation)    [Supply assigns PO # and prepares the document]
 *   14 → ORS (Creation)     [Supply forwards to Budget; Budget prepares ORS]
 *   15 → ORS (Processing)   [Budget officer signs and finalises ORS]
 *
 * Pattern mirrors ProcessPRModal: each role gets its own inner modal
 * component; the root export selects the right one.
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
import { supabase } from "../../lib/supabase/client";
import {
    fetchPOWithItemsById,
    updatePO,
    updatePOStatus,
    type PORow,
} from "../../lib/supabase/po";
import { useAuth } from "../AuthContext";
import CalendarModal from "./CalendarModal";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProcessPORecord {
  id: string;
  poNo: string;
  statusId: number;
}

interface ProcessPOModalProps {
  visible: boolean;
  record: ProcessPORecord | null;
  roleId: number;
  onClose: () => void;
  /** Called after a successful status advance with the new statusId */
  onProcessed: (id: string, newStatusId: number) => void;
}

// ─── Status table mapping (mirrors public.status) ─────────────────────────────

/**
 * Maps status_id → human label from public.status.
 * Only PO-lifecycle statuses are listed here.
 */
export const PO_STATUS_LABELS: Record<number, string> = {
  12: "PO (Creation)",
  13: "PO (Allocation)",
  14: "ORS (Creation)",
  15: "ORS (Processing)",
};

/**
 * The natural next status for each PO status_id.
 */
const PO_NEXT_STATUS: Record<number, number> = {
  12: 13,
  13: 14,
  14: 15,
};

function formatDate(date: Date) {
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function normalizeDateString(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (!Number.isNaN(d.getTime())) return formatDate(d);
  return dateStr;
}

function DatePickerButton({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setOpen(true)}
        className="flex-row items-center justify-between bg-gray-50 border border-gray-200 rounded-[10px] px-3 py-2.5"
      >
        <Text
          className={`text-[13px] flex-1 ${value ? "text-gray-800" : "text-gray-400"}`}
        >
          {value || placeholder || "Select date…"}
        </Text>
        <MaterialIcons name="calendar-month" size={18} color="#9ca3af" />
      </TouchableOpacity>

      <CalendarModal
        visible={open}
        onClose={() => setOpen(false)}
        onSelectDate={(d) => {
          onChange(formatDate(d));
          setOpen(false);
        }}
      />
    </>
  );
}

/**
 * Status IDs that Admin (role_id 1) can process.
 */
const ADMIN_PROCESSABLE = [12, 13, 14, 15];

/**
 * Status IDs that Supply (role_id 8) can process.
 * Supply creates the PO (12→13) and allocates it (13→14), then forwards to Budget.
 */
const SUPPLY_PROCESSABLE = [12, 13];

/**
 * Status IDs that Budget (role_id 4) can process.
 * Budget prepares and processes the ORS (14→15).
 */
const BUDGET_PROCESSABLE = [14];

/** Returns true if the given role can process a PO at the given statusId. */
export function canRoleProcessPO(roleId: number, statusId: number): boolean {
  if (roleId === 1) return ADMIN_PROCESSABLE.includes(statusId);
  if (roleId === 8) return SUPPLY_PROCESSABLE.includes(statusId);
  if (roleId === 4) return BUDGET_PROCESSABLE.includes(statusId);
  return false;
}

// ─── Role metadata ────────────────────────────────────────────────────────────

const ROLE_META: Record<
  number,
  { title: string; accentColor: string; stepLabel: string }
> = {
  1: {
    title: "Admin — PO Override",
    accentColor: "#1d4ed8",
    stepLabel: "Admin",
  },
  4: {
    title: "Budget — ORS Processing",
    accentColor: "#b45309",
    stepLabel: "Budget",
  },
  8: {
    title: "Supply — PO Processing",
    accentColor: "#064E3B",
    stepLabel: "Supply",
  },
};

// ─── Status flags (reused from ProcessPRModal pattern) ────────────────────────

export type StatusFlag =
  | "complete"
  | "incomplete_info"
  | "wrong_information"
  | "needs_revision"
  | "on_hold"
  | "urgent";

interface FlagMeta {
  label: string;
  desc: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  bg: string;
  text: string;
  border: string;
  dot: string;
}

export const STATUS_FLAGS: Record<StatusFlag, FlagMeta> = {
  complete: {
    label: "Complete",
    desc: "All information is correct and complete.",
    icon: "check-circle",
    bg: "#ecfdf5",
    text: "#065f46",
    border: "#6ee7b7",
    dot: "#10b981",
  },
  incomplete_info: {
    label: "Incomplete Info",
    desc: "Required fields or attachments are missing.",
    icon: "info",
    bg: "#fffbeb",
    text: "#92400e",
    border: "#fcd34d",
    dot: "#f59e0b",
  },
  wrong_information: {
    label: "Wrong Information",
    desc: "Submitted data contains errors that must be corrected.",
    icon: "cancel",
    bg: "#fef2f2",
    text: "#991b1b",
    border: "#fca5a5",
    dot: "#ef4444",
  },
  needs_revision: {
    label: "Needs Revision",
    desc: "Minor corrections needed before forwarding.",
    icon: "edit",
    bg: "#eff6ff",
    text: "#1e40af",
    border: "#93c5fd",
    dot: "#3b82f6",
  },
  on_hold: {
    label: "On Hold",
    desc: "Processing paused pending clarification.",
    icon: "pause-circle-filled",
    bg: "#f3f4f6",
    text: "#374151",
    border: "#d1d5db",
    dot: "#6b7280",
  },
  urgent: {
    label: "Urgent",
    desc: "Requires immediate attention.",
    icon: "priority-high",
    bg: "#fff7ed",
    text: "#9a3412",
    border: "#fdba74",
    dot: "#f97316",
  },
};

const FLAG_ORDER: StatusFlag[] = [
  "complete",
  "incomplete_info",
  "wrong_information",
  "needs_revision",
  "on_hold",
  "urgent",
];

// ─── Shared utilities ─────────────────────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const fmt = (n: number) =>
  n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function usePOFetch(
  visible: boolean,
  record: ProcessPORecord | null,
  onClose: () => void,
) {
  const [header, setHeader] = useState<PORow | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !record) return;
    setHeader(null);
    setLoading(true);
    fetchPOWithItemsById(record.id)
      .then(({ header }) => setHeader(header))
      .catch((e: any) => {
        Alert.alert("Error", e?.message ?? "Could not load PO.");
        onClose();
      })
      .finally(() => setLoading(false));
  }, [visible, record?.id]);

  return { header, loading };
}

// ─── Micro-components ─────────────────────────────────────────────────────────

function ModalHeader({
  meta,
  poNo,
  statusId,
  onClose,
}: {
  meta: (typeof ROLE_META)[number];
  poNo: string;
  statusId: number;
  onClose: () => void;
}) {
  return (
    <View
      style={{
        backgroundColor: meta.accentColor,
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 14,
      }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-0.5">
            {meta.stepLabel}
          </Text>
          <Text className="text-[16px] font-bold text-white">{meta.title}</Text>
          <Text
            className="text-[11px] text-white/60 mt-0.5"
            style={{ fontFamily: MONO }}
          >
            {poNo || "—"}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={10}
          className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center"
        >
          <Text className="text-white text-[20px] leading-none font-light">
            ×
          </Text>
        </TouchableOpacity>
      </View>

      {/* Current status badge */}
      <View className="flex-row items-center gap-2 mt-3">
        <View className="bg-white/10 rounded-lg px-2.5 py-1 flex-row items-center gap-1.5">
          <View className="w-1.5 h-1.5 rounded-full bg-white/60" />
          <Text className="text-[10.5px] font-bold text-white/80">
            {PO_STATUS_LABELS[statusId] ?? `Status ${statusId}`}
          </Text>
        </View>
        {PO_NEXT_STATUS[statusId] && (
          <>
            <MaterialIcons
              name="arrow-forward"
              size={12}
              color="rgba(255,255,255,0.4)"
            />
            <View className="bg-white/20 rounded-lg px-2.5 py-1 flex-row items-center gap-1.5">
              <View className="w-1.5 h-1.5 rounded-full bg-white" />
              <Text className="text-[10.5px] font-bold text-white">
                {PO_STATUS_LABELS[PO_NEXT_STATUS[statusId]] ??
                  `Status ${PO_NEXT_STATUS[statusId]}`}
              </Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

function POSummaryCard({ header }: { header: PORow }) {
  const currentLabel =
    PO_STATUS_LABELS[header.status_id ?? 12] ?? `Status #${header.status_id}`;
  const rows = [
    { label: "PO No.", value: header.po_no ?? "—", mono: true },
    { label: "PR No.", value: header.pr_no ?? "—", mono: true },
    { label: "Supplier", value: header.supplier ?? "—", mono: false },
    { label: "Section", value: header.office_section ?? "—", mono: false },
    { label: "Amount", value: `₱${fmt(header.total_amount ?? 0)}`, mono: true },
    { label: "Status", value: currentLabel, mono: false },
  ];
  return (
    <View
      className="bg-white rounded-2xl border border-gray-200 p-4 mb-4"
      style={{
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 2,
      }}
    >
      <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
        PO Summary
      </Text>
      {rows.map(({ label, value, mono }, i) => (
        <View
          key={label}
          className={`flex-row items-start justify-between py-2 ${i < rows.length - 1 ? "border-b border-gray-100" : ""}`}
        >
          <Text className="text-[11.5px] font-semibold text-gray-400 w-20">
            {label}
          </Text>
          <Text
            className="text-[12px] font-semibold text-gray-800 flex-1 text-right"
            style={mono ? { fontFamily: MONO } : undefined}
            numberOfLines={2}
          >
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-[10.5px] font-bold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </Text>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-4">
      <View className="flex-row items-center gap-1 mb-1.5">
        <Text className="text-[12px] font-semibold text-gray-700">{label}</Text>
        {required && (
          <Text className="text-[12px] font-bold text-red-500">*</Text>
        )}
      </View>
      {children}
    </View>
  );
}

function StyledInput({
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "numeric" | "decimal-pad";
}) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#9ca3af"
      multiline={multiline}
      keyboardType={keyboardType}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={`rounded-xl px-3.5 py-2.5 text-[13.5px] text-gray-800 border bg-white ${focused ? "border-emerald-500" : "border-gray-200"} ${multiline ? "min-h-[80px]" : ""}`}
      style={multiline ? { textAlignVertical: "top" } : undefined}
    />
  );
}

function LoadingBody({ color }: { color: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-gray-50">
      <ActivityIndicator size="large" color={color} />
      <Text className="text-[13px] text-gray-400">Loading PO…</Text>
    </View>
  );
}

function ModalFooter({
  onCancel,
  onConfirm,
  confirmLabel,
  confirmingLabel,
  disabled,
  saving,
  color,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmingLabel: string;
  disabled: boolean;
  saving: boolean;
  color: string;
}) {
  return (
    <View className="flex-row items-center justify-between px-5 py-4 bg-white border-t border-gray-100">
      <TouchableOpacity
        onPress={onCancel}
        activeOpacity={0.7}
        className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white"
      >
        <Text className="text-[13.5px] font-semibold text-gray-500">
          Cancel
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onConfirm}
        disabled={disabled || saving}
        activeOpacity={0.8}
        className={`flex-row items-center gap-2 px-5 py-2.5 rounded-xl ${disabled || saving ? "opacity-40" : ""}`}
        style={{ backgroundColor: color }}
      >
        {saving && <ActivityIndicator size="small" color="#fff" />}
        <Text className="text-[13.5px] font-bold text-white">
          {saving ? confirmingLabel : confirmLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── StatusFlagPicker ─────────────────────────────────────────────────────────

function StatusFlagPicker({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: StatusFlag | null;
  onSelect: (f: StatusFlag | null) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        className="flex-1 justify-center items-center bg-black/50"
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1}>
          <View
            className="bg-white rounded-2xl overflow-hidden"
            style={{
              width: 300,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.15,
              shadowRadius: 16,
              elevation: 12,
            }}
          >
            <View className="bg-gray-900 px-4 py-3">
              <Text className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-0.5">
                Processing Flag
              </Text>
              <Text className="text-[15px] font-extrabold text-white">
                Select Status Flag
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => {
                onSelect(null);
                onClose();
              }}
              activeOpacity={0.7}
              className={`flex-row items-center gap-3 px-4 py-3 ${selected === null ? "bg-gray-50" : ""}`}
              style={{ borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}
            >
              <View className="w-7 h-7 rounded-full bg-gray-100 items-center justify-center">
                <MaterialIcons name="remove" size={14} color="#6b7280" />
              </View>
              <Text className="flex-1 text-[13px] font-semibold text-gray-500">
                No flag
              </Text>
              {selected === null && (
                <MaterialIcons name="check" size={15} color="#10b981" />
              )}
            </TouchableOpacity>

            {FLAG_ORDER.map((key) => {
              const m = STATUS_FLAGS[key];
              const isSelected = selected === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => {
                    onSelect(key);
                    onClose();
                  }}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: "#f3f4f6",
                    backgroundColor: isSelected ? m.bg : "transparent",
                  }}
                >
                  <View
                    className="w-7 h-7 rounded-full items-center justify-center"
                    style={{
                      backgroundColor: isSelected ? m.dot + "22" : "#f3f4f6",
                    }}
                  >
                    <MaterialIcons
                      name={m.icon}
                      size={15}
                      color={isSelected ? m.dot : "#9ca3af"}
                    />
                  </View>
                  <View className="flex-1">
                    <Text
                      className="text-[13px] font-bold"
                      style={{ color: isSelected ? m.text : "#374151" }}
                    >
                      {m.label}
                    </Text>
                    <Text
                      className="text-[10.5px] text-gray-400 leading-4"
                      numberOfLines={1}
                    >
                      {m.desc}
                    </Text>
                  </View>
                  {isSelected && (
                    <MaterialIcons name="check" size={15} color={m.dot} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function FlagButton({
  selected,
  onPress,
}: {
  selected: StatusFlag | null;
  onPress: () => void;
}) {
  const m = selected ? STATUS_FLAGS[selected] : null;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className="flex-row items-center justify-between rounded-xl px-3.5 py-2.5 border"
      style={{
        backgroundColor: m ? m.bg : "#ffffff",
        borderColor: m ? m.border : "#e5e7eb",
      }}
    >
      <View className="flex-row items-center gap-2.5">
        {m ? (
          <View
            className="w-6 h-6 rounded-full items-center justify-center"
            style={{ backgroundColor: m.dot + "22" }}
          >
            <MaterialIcons name={m.icon} size={13} color={m.dot} />
          </View>
        ) : (
          <View className="w-6 h-6 rounded-full bg-gray-100 items-center justify-center">
            <MaterialIcons name="flag" size={13} color="#9ca3af" />
          </View>
        )}
        <Text
          className="text-[13px] font-semibold"
          style={{ color: m ? m.text : "#9ca3af" }}
        >
          {m ? m.label : "No flag set"}
        </Text>
      </View>
      <MaterialIcons
        name="keyboard-arrow-down"
        size={16}
        color={m ? m.dot : "#9ca3af"}
      />
    </TouchableOpacity>
  );
}

// ─── insertPORemark helper ─────────────────────────────────────────────────────

async function insertPORemark(
  poId: string,
  prId: string | null,
  userId: string | number,
  remark: string,
): Promise<void> {
  const { error } = await supabase.from("remarks").insert({
    po_id: poId,
    pr_id: prId,
    user_id: String(userId),
    remark,
    created_at: new Date().toISOString(),
  });
  // Non-fatal: log but don't throw
  if (error) console.warn("insertPORemark:", error.message);
}

// ─── Supply Modal (role_id 8) ─────────────────────────────────────────────────

/**
 * Supply processes POs through two steps:
 *   status 12 (PO Creation)   → 13 (PO Allocation): Log receipt & begin PO document
 *   status 13 (PO Allocation) → 14 (ORS Creation):  Assign PO # and forward to Budget
 */
function SupplyModal({
  visible,
  record,
  onClose,
  onProcessed,
}: Omit<ProcessPOModalProps, "roleId">) {
  const meta = ROLE_META[8];
  const { currentUser } = useAuth();
  const { header, loading } = usePOFetch(visible, record, onClose);

  const [remarks, setRemarks] = useState("");
  const [statusFlag, setStatusFlag] = useState<StatusFlag | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setRemarks("");
      setStatusFlag(null);
    }
  }, [visible]);

  if (!record) return null;

  const currentStatusId = record.statusId;
  const nextStatusId = PO_NEXT_STATUS[currentStatusId];
  const currentLabel =
    PO_STATUS_LABELS[currentStatusId] ?? `Status ${currentStatusId}`;
  const nextLabel = nextStatusId
    ? (PO_STATUS_LABELS[nextStatusId] ?? `Status ${nextStatusId}`)
    : null;

  const getConfirmLabel = () => {
    if (currentStatusId === 12) return "Log Receipt & Start PO Creation";
    if (currentStatusId === 13) return "Allocate PO # & Forward to Budget";
    return "Advance PO";
  };

  const getStepDescription = () => {
    if (currentStatusId === 12)
      return "Confirm receipt of the Abstract of Awards from BAC. Log the PO and begin document creation.";
    if (currentStatusId === 13)
      return "Assign a Purchase Order number, finalise the PO document, then forward to Budget for ORS preparation.";
    return "";
  };

  const handleAdvance = async () => {
    if (!record || !nextStatusId) return;
    setSaving(true);
    try {
      if (remarks.trim() && currentUser?.id) {
        await insertPORemark(
          record.id,
          header?.pr_id ?? null,
          currentUser.id,
          remarks.trim(),
        );
      }
      await updatePOStatus(record.id, nextStatusId);
      onProcessed(record.id, nextStatusId);
      onClose();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not advance PO.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
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
          <ModalHeader
            meta={meta}
            poNo={record.poNo}
            statusId={currentStatusId}
            onClose={onClose}
          />
          {loading ? (
            <LoadingBody color={meta.accentColor} />
          ) : (
            <ScrollView
              className="flex-1 bg-gray-50"
              contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {header && <POSummaryCard header={header} />}

              {/* Step description */}
              {getStepDescription() ? (
                <View className="flex-row items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 mb-4">
                  <MaterialIcons
                    name="info-outline"
                    size={16}
                    color="#065f46"
                    style={{ marginTop: 1 }}
                  />
                  <Text className="flex-1 text-[12px] text-emerald-800 leading-5">
                    {getStepDescription()}
                  </Text>
                </View>
              ) : null}

              <SectionLabel>Processing Details</SectionLabel>
              <Field label="Status Flag">
                <FlagButton
                  selected={statusFlag}
                  onPress={() => setFlagOpen(true)}
                />
              </Field>
              <Field label="Remarks / Notes">
                <StyledInput
                  value={remarks}
                  onChangeText={setRemarks}
                  placeholder={
                    currentStatusId === 12
                      ? "e.g. PO received from BAC. Proceeding with creation."
                      : "e.g. PO-2026-001 assigned. Forwarding to Budget for ORS."
                  }
                  multiline
                />
              </Field>
            </ScrollView>
          )}
          <ModalFooter
            onCancel={onClose}
            onConfirm={handleAdvance}
            confirmLabel={getConfirmLabel()}
            confirmingLabel="Processing…"
            disabled={!nextStatusId || loading}
            saving={saving}
            color={meta.accentColor}
          />
        </KeyboardAvoidingView>
      </Modal>
      <StatusFlagPicker
        visible={flagOpen}
        selected={statusFlag}
        onSelect={setStatusFlag}
        onClose={() => setFlagOpen(false)}
      />
    </>
  );
}

// ─── Budget Modal (role_id 4) ─────────────────────────────────────────────────

/**
 * Budget processes POs at status 14 (ORS Creation) → 15 (ORS Processing).
 *
 * Steps performed by Budget (from swimlane Phase 2):
 *   Step 15: Receive PO from Supply and confirm budget allocation
 *   Step 16: Prepare ORS — fill in ORS number, date, and amount
 *   Step 17: Assign ORS number and return for recording
 *   Step 18: Budget officer signature and final ORS approval
 *
 * The modal writes ors_no, ors_date, ors_amount, and funds_available
 * directly to the purchase_orders row, then advances status to 15.
 */
function BudgetModal({
  visible,
  record,
  onClose,
  onProcessed,
}: Omit<ProcessPOModalProps, "roleId">) {
  const meta = ROLE_META[4];
  const { currentUser } = useAuth();
  const { header, loading } = usePOFetch(visible, record, onClose);

  const [orsNo, setOrsNo] = useState("");
  const [orsDate, setOrsDate] = useState("");
  const [orsAmount, setOrsAmount] = useState("");
  const [fundsAvailable, setFundsAvailable] = useState("");
  const [remarks, setRemarks] = useState("");
  const [statusFlag, setStatusFlag] = useState<StatusFlag | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setOrsNo("");
      setOrsDate(formatDate(new Date()));
      setOrsAmount("");
      setFundsAvailable("");
      setRemarks("");
      setStatusFlag(null);
    }
  }, [visible]);

  // Pre-fill from existing PO data when loaded
  useEffect(() => {
    if (!header) return;
    if (header.ors_no) setOrsNo(header.ors_no);
    if (header.ors_date) setOrsDate(normalizeDateString(header.ors_date));
    if (header.ors_amount) setOrsAmount(String(header.ors_amount));
    if (header.funds_available) setFundsAvailable(header.funds_available);
  }, [header]);

  if (!record) return null;

  const nextStatusId = PO_NEXT_STATUS[14]; // → 15
  const isValid = orsNo.trim().length > 0 && orsDate.trim().length > 0;

  const handleProcess = async () => {
    if (!record || !isValid) return;
    setSaving(true);
    try {
      const parsedAmount = parseFloat(orsAmount.replace(/,/g, "")) || null;

      // Write ORS details to the PO header row
      await updatePO(record.id, {
        ors_no: orsNo.trim(),
        ors_date: orsDate.trim(),
        ors_amount: parsedAmount,
        funds_available: fundsAvailable.trim() || null,
        status_id: nextStatusId,
      });

      // Record the remark / Budget officer signature note
      const remarkText = [
        `ORS ${orsNo.trim()} prepared and signed.`,
        fundsAvailable.trim()
          ? `Funds available: ${fundsAvailable.trim()}.`
          : "",
        remarks.trim(),
      ]
        .filter(Boolean)
        .join(" ");

      if (remarkText && currentUser?.id) {
        await insertPORemark(
          record.id,
          header?.pr_id ?? null,
          currentUser.id,
          remarkText,
        );
      }

      onProcessed(record.id, nextStatusId);
      onClose();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not process ORS.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
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
          <ModalHeader
            meta={meta}
            poNo={record.poNo}
            statusId={14}
            onClose={onClose}
          />
          {loading ? (
            <LoadingBody color={meta.accentColor} />
          ) : (
            <ScrollView
              className="flex-1 bg-gray-50"
              contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {header && <POSummaryCard header={header} />}

              {/* Workflow hint */}
              <View className="flex-row items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4">
                <MaterialIcons
                  name="account-balance"
                  size={16}
                  color="#92400e"
                  style={{ marginTop: 1 }}
                />
                <Text className="flex-1 text-[12px] text-amber-800 leading-5">
                  Prepare the Obligation Request and Status (ORS). Assign an ORS
                  number, confirm funds availability, and sign off to forward to
                  Accounting.
                </Text>
              </View>

              <SectionLabel>ORS Details</SectionLabel>

              <Field label="ORS Number" required>
                <StyledInput
                  value={orsNo}
                  onChangeText={setOrsNo}
                  placeholder="e.g. ORS-2026-0042"
                />
              </Field>

              <Field label="ORS Date" required>
                <DatePickerButton
                  value={orsDate}
                  onChange={setOrsDate}
                  placeholder="Select ORS date…"
                />
              </Field>

              <Field label="ORS Amount">
                <StyledInput
                  value={orsAmount}
                  onChangeText={setOrsAmount}
                  placeholder="e.g. 150000.00"
                  keyboardType="decimal-pad"
                />
              </Field>

              <Field label="Funds Available / Allotment Reference">
                <StyledInput
                  value={fundsAvailable}
                  onChangeText={setFundsAvailable}
                  placeholder="e.g. Available under MFO 2 — ARBDSP"
                />
              </Field>

              <SectionLabel>Budget Officer Sign-off</SectionLabel>

              <Field label="Status Flag">
                <FlagButton
                  selected={statusFlag}
                  onPress={() => setFlagOpen(true)}
                />
              </Field>

              <Field label="Sign-off Notes">
                <StyledInput
                  value={remarks}
                  onChangeText={setRemarks}
                  placeholder="e.g. ORS signed and approved. Forwarding to Accounting."
                  multiline
                />
              </Field>
            </ScrollView>
          )}
          <ModalFooter
            onCancel={onClose}
            onConfirm={handleProcess}
            confirmLabel="Sign ORS & Forward to Accounting"
            confirmingLabel="Processing…"
            disabled={!isValid || loading}
            saving={saving}
            color={meta.accentColor}
          />
        </KeyboardAvoidingView>
      </Modal>
      <StatusFlagPicker
        visible={flagOpen}
        selected={statusFlag}
        onSelect={setStatusFlag}
        onClose={() => setFlagOpen(false)}
      />
    </>
  );
}

// ─── Admin Modal (role_id 1) ──────────────────────────────────────────────────

/**
 * Admin can force-advance a PO to any target status, or return it.
 * A free-form target status selector is provided for full flexibility.
 */
function AdminModal({
  visible,
  record,
  onClose,
  onProcessed,
}: Omit<ProcessPOModalProps, "roleId">) {
  const meta = ROLE_META[1];
  const { currentUser } = useAuth();
  const { header, loading } = usePOFetch(visible, record, onClose);

  const [remarks, setRemarks] = useState("");
  const [statusFlag, setStatusFlag] = useState<StatusFlag | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [targetStatusId, setTargetStatusId] = useState<number | null>(null);

  useEffect(() => {
    if (visible && record) {
      setRemarks("");
      setStatusFlag(null);
      // Default: advance one step
      setTargetStatusId(PO_NEXT_STATUS[record.statusId] ?? null);
    }
  }, [visible, record?.statusId]);

  if (!record) return null;

  const currentLabel =
    PO_STATUS_LABELS[record.statusId] ?? `Status ${record.statusId}`;
  const targetLabel = targetStatusId
    ? (PO_STATUS_LABELS[targetStatusId] ?? `Status ${targetStatusId}`)
    : "—";

  const handleAdvance = async () => {
    if (!record || !targetStatusId) return;
    setSaving(true);
    try {
      if (remarks.trim() && currentUser?.id) {
        await insertPORemark(
          record.id,
          header?.pr_id ?? null,
          currentUser.id,
          remarks.trim(),
        );
      }
      await updatePOStatus(record.id, targetStatusId);
      onProcessed(record.id, targetStatusId);
      onClose();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not update PO status.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
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
          <ModalHeader
            meta={meta}
            poNo={record.poNo}
            statusId={record.statusId}
            onClose={onClose}
          />
          {loading ? (
            <LoadingBody color={meta.accentColor} />
          ) : (
            <ScrollView
              className="flex-1 bg-gray-50"
              contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {header && <POSummaryCard header={header} />}

              {/* Admin: quick status buttons */}
              <View className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
                <Text className="text-[10.5px] font-bold text-gray-400 uppercase tracking-wide mb-3">
                  Target Status
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {Object.entries(PO_STATUS_LABELS).map(([sid, label]) => {
                    const id = Number(sid);
                    const active = targetStatusId === id;
                    return (
                      <TouchableOpacity
                        key={sid}
                        onPress={() => setTargetStatusId(id)}
                        activeOpacity={0.8}
                        className={`px-3 py-1.5 rounded-full border ${active ? "bg-blue-600 border-blue-600" : "bg-white border-gray-200"}`}
                      >
                        <Text
                          className={`text-[11.5px] font-bold ${active ? "text-white" : "text-gray-600"}`}
                        >
                          {id} · {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {targetStatusId && (
                  <Text className="text-[11px] text-blue-600 font-semibold mt-2">
                    {currentLabel} → {targetLabel}
                  </Text>
                )}
              </View>

              <SectionLabel>Admin Override Details</SectionLabel>
              <Field label="Status Flag">
                <FlagButton
                  selected={statusFlag}
                  onPress={() => setFlagOpen(true)}
                />
              </Field>
              <Field label="Override Reason" required>
                <StyledInput
                  value={remarks}
                  onChangeText={setRemarks}
                  placeholder="e.g. Correcting status due to processing error."
                  multiline
                />
              </Field>
            </ScrollView>
          )}
          <ModalFooter
            onCancel={onClose}
            onConfirm={handleAdvance}
            confirmLabel={`Set to ${targetLabel}`}
            confirmingLabel="Updating…"
            disabled={!targetStatusId || !remarks.trim() || loading}
            saving={saving}
            color={meta.accentColor}
          />
        </KeyboardAvoidingView>
      </Modal>
      <StatusFlagPicker
        visible={flagOpen}
        selected={statusFlag}
        onSelect={setStatusFlag}
        onClose={() => setFlagOpen(false)}
      />
    </>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────

export default function ProcessPOModal({
  roleId,
  ...rest
}: ProcessPOModalProps) {
  if (roleId === 1) return <AdminModal {...rest} />;
  if (roleId === 4) return <BudgetModal {...rest} />;
  if (roleId === 8) return <SupplyModal {...rest} />;
  return null;
}
