/**
 * ProcessPRModal.tsx
 *
 * Role-gated processing modals for the DAR procurement workflow (Phase 1).
 * Swimlane reference:
 *   role_id 2 → Division Head  — Step 2: Sign & forward to BAC
 *   role_id 3 → BAC            — Step 3: Number, certify inclusion in APP
 *   role_id 4 → Budget         — Step 4: Earmark & record against PPMP
 *
 * Usage:
 *   <ProcessPRModal
 *     visible={processVisible}
 *     record={processRecord}          // { id, prNo }
 *     roleId={currentUser.role_id}
 *     onClose={close}
 *     onProcessed={(id, newStatus) => updateList(id, newStatus)}
 *   />
 */

import type { PRStatusRow } from "@/lib/supabase";
import {
    fetchPRStatuses,
    fetchPRWithItemsById,
    insertRemark,
    supabase,
} from "@/lib/supabase";
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
import { useAuth } from "../AuthContext";
import * as DocumentPicker from "expo-document-picker";
import { uploadPRFile } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProcessRecord {
  id: string;
  prNo: string;
}

interface ProcessPRModalProps {
  visible: boolean;
  record: ProcessRecord | null;
  roleId: number;
  onClose: () => void;
  onProcessed: (id: string, newStatus: string) => void;
}

interface PRHeader {
  pr_no: string;
  office_section: string;
  purpose: string;
  total_cost: number;
  status_id: number; // FK → pr_status.id
  budget_number: string | null;
  pap_code: string | null;
  proposal_no: string | null;
}

// ─── Role metadata ────────────────────────────────────────────────────────────

const ROLE_META: Record<
  number,
  {
    step: string;
    title: string;
    accentColor: string;
    bannerBg: string;
    bannerBorder: string;
    /** FK value written to purchase_requests.status_id on process */
    nextStatusId: number;
  }
> = {
  2: {
    step: "Step 2",
    title: "Division Head Review",
    accentColor: "#1d4ed8",
    bannerBg: "bg-blue-50",
    bannerBorder: "border-blue-400",
    nextStatusId: 3, // → Processing (BAC)
  },
  3: {
    step: "Step 3",
    title: "BAC Certification",
    accentColor: "#7c3aed",
    bannerBg: "bg-violet-50",
    bannerBorder: "border-violet-400",
    nextStatusId: 4, // → Processing (Budget)
  },
  4: {
    step: "Step 4",
    title: "Budget Earmarking",
    accentColor: "#b45309",
    bannerBg: "bg-amber-50",
    bannerBorder: "border-amber-400",
    nextStatusId: 5, // → Processing (PARPO)
  },
  5: {
    step: "Step 5",
    title: "PARPO Approval",
    accentColor: "#065f46",
    bannerBg: "bg-emerald-50",
    bannerBorder: "border-emerald-400",
    nextStatusId: 6, // → Approved (add id 6 if needed, or reuse 5 for final)
  },
};

// ─── Status flags ─────────────────────────────────────────────────────────────

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
  bg: string; // NativeWind bg class
  text: string; // NativeWind text class
  border: string; // NativeWind border class
  dot: string; // hex for the indicator dot
}

export const STATUS_FLAGS: Record<StatusFlag, FlagMeta> = {
  complete: {
    label: "Complete",
    desc: "All information is correct and complete.",
    icon: "check-circle",
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    border: "border-emerald-300",
    dot: "#10b981",
  },
  incomplete_info: {
    label: "Incomplete Info",
    desc: "Required fields or attachments are missing.",
    icon: "info",
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-300",
    dot: "#f59e0b",
  },
  wrong_information: {
    label: "Wrong Information",
    desc: "Submitted data contains errors that must be corrected.",
    icon: "cancel",
    bg: "bg-red-50",
    text: "text-red-800",
    border: "border-red-300",
    dot: "#ef4444",
  },
  needs_revision: {
    label: "Needs Revision",
    desc: "Minor corrections needed before forwarding.",
    icon: "edit",
    bg: "bg-blue-50",
    text: "text-blue-800",
    border: "border-blue-300",
    dot: "#3b82f6",
  },
  on_hold: {
    label: "On Hold",
    desc: "Processing paused pending clarification.",
    icon: "pause-circle-filled",
    bg: "bg-gray-100",
    text: "text-gray-700",
    border: "border-gray-300",
    dot: "#6b7280",
  },
  urgent: {
    label: "Urgent",
    desc: "Requires immediate attention.",
    icon: "priority-high",
    bg: "bg-orange-50",
    text: "text-orange-800",
    border: "border-orange-300",
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

// ─── Flag ID mapping ──────────────────────────────────────────────────────────
/**
 * Maps StatusFlag strings to their corresponding status_flag table IDs.
 * IDs should match the status_flag table in Supabase (1-indexed).
 */
const FLAG_TO_ID: Record<StatusFlag, number> = {
  complete: 2, // ID 2 in status_flag table
  incomplete_info: 3,
  wrong_information: 4,
  needs_revision: 5,
  on_hold: 6,
  urgent: 7,
};

function getStatusFlagId(flag: StatusFlag | null): number | null {
  return flag ? FLAG_TO_ID[flag] : null;
}

// ─── StatusFlagPicker ─────────────────────────────────────────────────────────

export function StatusFlagPicker({
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
      onRequestClose={onClose}>
      <TouchableOpacity
        className="flex-1 justify-center items-center bg-black/50"
        activeOpacity={1}
        onPress={onClose}>
        {/* Stop tap-through to backdrop */}
        <TouchableOpacity activeOpacity={1}>
          <View
            className="bg-white rounded-3xl overflow-hidden"
            style={{
              width: 300,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.18,
              shadowRadius: 16,
              elevation: 12,
            }}>
            {/* Header */}
            <View className="bg-gray-900 px-4 py-3">
              <Text className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-0.5">
                Processing Flag
              </Text>
              <Text className="text-[16px] font-extrabold text-white">
                Select Status Flag
              </Text>
            </View>

            {/* None option */}
            <TouchableOpacity
              onPress={() => {
                onSelect(null);
                onClose();
              }}
              activeOpacity={0.7}
              className={`flex-row items-center gap-3 px-4 py-3 ${selected === null ? "bg-gray-50" : ""}`}
              style={{ borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}>
              <View className="w-7 h-7 rounded-full bg-gray-100 items-center justify-center">
                <MaterialIcons name="remove" size={14} color="#6b7280" />
              </View>
              <View className="flex-1">
                <Text className="text-[13px] font-semibold text-gray-500">
                  No flag
                </Text>
                <Text className="text-[10.5px] text-gray-400">
                  Leave flag unset
                </Text>
              </View>
              {selected === null && (
                <MaterialIcons name="check" size={15} color="#10b981" />
              )}
            </TouchableOpacity>

            {/* Flag options */}
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
                  className={`flex-row items-center gap-3 px-4 py-3 ${isSelected ? m.bg : ""}`}
                  style={{
                    borderBottomWidth: 1,
                    borderBottomColor: "#f3f4f6",
                  }}>
                  {/* Colored icon */}
                  <View
                    className={`w-7 h-7 rounded-full items-center justify-center ${isSelected ? "" : "bg-gray-100"}`}
                    style={
                      isSelected ? { backgroundColor: m.dot + "22" } : undefined
                    }>
                    <MaterialIcons
                      name={m.icon}
                      size={15}
                      color={isSelected ? m.dot : "#9ca3af"}
                    />
                  </View>
                  <View className="flex-1">
                    <Text
                      className={`text-[13px] font-bold ${isSelected ? m.text : "text-gray-700"}`}>
                      {m.label}
                    </Text>
                    <Text
                      className="text-[10.5px] text-gray-400 leading-4"
                      numberOfLines={1}>
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

// ─── FlagButton — the trigger shown inside each modal form ────────────────────

export function FlagButton({
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
      className={`flex-row items-center justify-between rounded-xl px-3.5 py-2.5 border ${
        m ? `${m.bg} ${m.border}` : "bg-white border-gray-200"
      }`}>
      <View className="flex-row items-center gap-2.5">
        {m ? (
          <View
            className="w-6 h-6 rounded-full items-center justify-center"
            style={{ backgroundColor: m.dot + "22" }}>
            <MaterialIcons name={m.icon} size={13} color={m.dot} />
          </View>
        ) : (
          <View className="w-6 h-6 rounded-full bg-gray-100 items-center justify-center">
            <MaterialIcons name="flag" size={13} color="#9ca3af" />
          </View>
        )}
        <Text
          className={`text-[13px] font-semibold ${m ? m.text : "text-gray-400"}`}>
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

// ─── Shared utilities ─────────────────────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const fmt = (n: number) =>
  n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Fetch PR header + status lookup table whenever the modal opens */
function usePRFetch(
  visible: boolean,
  record: ProcessRecord | null,
  onClose: () => void,
) {
  const [header, setHeader] = useState<PRHeader | null>(null);
  const [statuses, setStatuses] = useState<PRStatusRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !record) return;
    setHeader(null);
    setLoading(true);
    Promise.all([fetchPRWithItemsById(record.id), fetchPRStatuses()])
      .then(([{ header }, statusRows]) => {
        setHeader(header as unknown as PRHeader);
        setStatuses(statusRows);
      })
      .catch((e: any) => {
        Alert.alert("Error", e?.message ?? "Could not load PR.");
        onClose();
      })
      .finally(() => setLoading(false));
  }, [visible, record]);

  return { header, statuses, loading };
}

// ─── Micro-components ─────────────────────────────────────────────────────────

function ModalHeader({
  meta,
  prNo,
  onClose,
}: {
  meta: (typeof ROLE_META)[number];
  prNo: string;
  onClose: () => void;
}) {
  return (
    <View
      style={{
        backgroundColor: meta.accentColor,
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 16,
      }}>
      <View className="flex-row items-start justify-between mb-3">
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-xl items-center justify-center bg-white/10">
            <Text className="text-xl">📋</Text>
          </View>
          <View>
            <Text className="text-[10px] font-bold uppercase tracking-widest text-white/50">
              DAR · Procurement · {meta.step}
            </Text>
            <Text className="text-[16px] font-bold text-white">
              {meta.title}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={10}
          className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center">
          <Text className="text-white text-[20px] leading-none font-light">
            ×
          </Text>
        </TouchableOpacity>
      </View>
      <View className="self-start px-2.5 py-1 rounded-md bg-white/10 border border-white/20">
        <Text
          className="text-[10.5px] text-white/60"
          style={{ fontFamily: MONO }}>
          {prNo}
        </Text>
      </View>
    </View>
  );
}

function InfoBanner({
  bg,
  border,
  children,
}: {
  bg: string;
  border: string;
  children: React.ReactNode;
}) {
  return (
    <View
      className={`flex-row items-start gap-3 ${bg} border-l-4 ${border} rounded-2xl p-3.5 mb-4`}>
      <Text className="text-base mt-0.5">ℹ️</Text>
      <Text className="flex-1 text-[12.5px] text-gray-700 leading-[19px]">
        {children}
      </Text>
    </View>
  );
}

function PRSummaryCard({
  header,
  statuses,
}: {
  header: PRHeader;
  statuses: PRStatusRow[];
}) {
  const statusLabel =
    statuses.find((s) => s.id === header.status_id)?.status_name ??
    `Status #${header.status_id}`;
  const rows = [
    { label: "PR No.", value: header.pr_no, mono: true },
    { label: "Section", value: header.office_section, mono: false },
    { label: "Purpose", value: header.purpose, mono: false },
    { label: "Amount", value: `₱${fmt(header.total_cost)}`, mono: true },
    { label: "Status", value: statusLabel, mono: false },
    ...(header.proposal_no
      ? [{ label: "Proposal", value: header.proposal_no, mono: true }]
      : []),
  ];
  return (
    <View
      className="bg-white rounded-2xl border border-gray-200 p-4 mb-4"
      style={{
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 2,
      }}>
      <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
        PR Summary
      </Text>
      {rows.map(({ label, value, mono }, i) => (
        <View
          key={label}
          className={`flex-row items-start justify-between py-2 ${i < rows.length - 1 ? "border-b border-gray-100" : ""}`}>
          <Text className="text-[11.5px] font-semibold text-gray-400 w-20">
            {label}
          </Text>
          <Text
            className="text-[12px] font-semibold text-gray-800 flex-1 text-right"
            style={mono ? { fontFamily: MONO } : undefined}
            numberOfLines={2}>
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
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#9ca3af"
      multiline={multiline}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={`rounded-xl px-3.5 py-2.5 text-[13.5px] text-gray-800 border bg-white
        ${focused ? "border-emerald-500" : "border-gray-200"}
        ${multiline ? "min-h-[80px]" : ""}`}
      style={multiline ? { textAlignVertical: "top" } : undefined}
    />
  );
}

function LoadingBody({ color }: { color: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-gray-50">
      <ActivityIndicator size="large" color={color} />
      <Text className="text-[13px] text-gray-400">Loading PR…</Text>
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
        className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white">
        <Text className="text-[13.5px] font-semibold text-gray-500">
          Cancel
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onConfirm}
        disabled={disabled || saving}
        activeOpacity={0.8}
        className={`flex-row items-center gap-2 px-5 py-2.5 rounded-xl ${disabled || saving ? "opacity-40" : ""}`}
        style={{ backgroundColor: color }}>
        {saving && <ActivityIndicator size="small" color="#fff" />}
        <Text className="text-[13.5px] font-bold text-white">
          {saving ? confirmingLabel : confirmLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Division Head Modal (role_id = 2 · Step 2) ───────────────────────────────

function DivisionHeadModal({
  visible,
  record,
  onClose,
  onProcessed,
}: Omit<ProcessPRModalProps, "roleId">) {
  const meta = ROLE_META[2];
  const { currentUser } = useAuth();
  const { header, statuses, loading } = usePRFetch(visible, record, onClose);
  const [remarks, setRemarks] = useState("");
  const [statusFlag, setStatusFlag] = useState<StatusFlag | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (visible) {
      setRemarks("");
      setStatusFlag(null);
      setFileName(null);
      setFileUri(null);
      setFileType(undefined);
    }
  }, [visible]);

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const f = res.assets[0];
      setFileName(f.name ?? "attachment");
      setFileUri(f.uri);
      setFileType(f.mimeType);
    } catch (e: any) {
      Alert.alert("File error", e?.message ?? "Could not pick file.");
    }
  };

  const handleSign = async () => {
    if (!record || !remarks.trim()) return;
    setSaving(true);
    try {
      let finalRemark = remarks.trim();
      if (fileUri && fileName) {
        const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const remote = `${record.prNo}/${Date.now()}-${safe}`;
        const uploaded = await uploadPRFile(fileUri, remote, fileType);
        finalRemark += `\nAttachment: ${uploaded.publicUrl}`;
      }
      await insertRemark(
        record.id,
        currentUser!.id,
        finalRemark,
        getStatusFlagId(statusFlag),
      );
      const { error } = await supabase
        .from("purchase_requests")
        .update({ status_id: meta.nextStatusId })
        .eq("id", record.id);
      if (error) throw error;
      onProcessed(record.id, String(meta.nextStatusId));
      onClose();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not process the PR.");
    } finally {
      setSaving(false);
    }
  };

  if (!record) return null;
  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}>
        <KeyboardAvoidingView
          className="flex-1 bg-white"
          behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ModalHeader meta={meta} prNo={record.prNo} onClose={onClose} />
          {loading ? (
            <LoadingBody color={meta.accentColor} />
          ) : (
            <ScrollView
              className="flex-1 bg-gray-50"
              contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              <InfoBanner bg={meta.bannerBg} border={meta.bannerBorder}>
                As <Text className="font-bold">Division Head</Text>, review and
                sign this PR to forward it to BAC for numbering and APP
                certification (Step 3).
              </InfoBanner>
              {header && <PRSummaryCard header={header} statuses={statuses} />}
              <SectionLabel>Your Action</SectionLabel>
              <Field label="Status Flag">
                <FlagButton
                  selected={statusFlag}
                  onPress={() => setFlagOpen(true)}
                />
              </Field>
              <Field label="Remarks / Notes" required>
                <StyledInput
                  value={remarks}
                  onChangeText={setRemarks}
                  placeholder="e.g. Approved for procurement. Forward to BAC."
                  multiline
                />
              </Field>
              <Field label="Attachment (optional)">
                <TouchableOpacity
                  onPress={pickFile}
                  activeOpacity={0.8}
                  className={`rounded-2xl border-2 border-dashed px-4 py-4 items-center ${
                    fileName ? "border-emerald-400 bg-emerald-50" : "border-gray-300 bg-gray-50"
                  }`}>
                  <Text className="text-[13px] font-semibold text-gray-700">
                    {fileName ?? "Tap to attach a file"}
                  </Text>
                  {fileName && (
                    <TouchableOpacity
                      onPress={() => {
                        setFileName(null);
                        setFileUri(null);
                        setFileType(undefined);
                      }}
                      hitSlop={8}
                      className="mt-1">
                      <Text className="text-[11px] text-red-500">Remove</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              </Field>
            </ScrollView>
          )}
          <ModalFooter
            onCancel={onClose}
            onConfirm={handleSign}
            confirmLabel="Sign & Forward to BAC"
            confirmingLabel="Signing…"
            disabled={!remarks.trim() || loading}
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

// ─── BAC Modal (role_id = 3 · Step 3) ────────────────────────────────────────

function BACModal({
  visible,
  record,
  onClose,
  onProcessed,
}: Omit<ProcessPRModalProps, "roleId">) {
  const meta = ROLE_META[3];
  const { currentUser } = useAuth();
  const { header, statuses, loading } = usePRFetch(visible, record, onClose);
  const [assignedPR, setAssignedPR] = useState("");
  const [appNo, setAppNo] = useState("");
  const [certNotes, setCertNotes] = useState("");
  const [statusFlag, setStatusFlag] = useState<StatusFlag | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (visible) {
      setAssignedPR("");
      setAppNo("");
      setCertNotes("");
      setStatusFlag(null);
      setFileName(null);
      setFileUri(null);
      setFileType(undefined);
    }
  }, [visible]);

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const f = res.assets[0];
      setFileName(f.name ?? "attachment");
      setFileUri(f.uri);
      setFileType(f.mimeType);
    } catch (e: any) {
      Alert.alert("File error", e?.message ?? "Could not pick file.");
    }
  };

  const handleCertify = async () => {
    if (!record || !assignedPR.trim()) return;
    setSaving(true);
    try {
      let finalNotes = certNotes.trim();
      if (fileUri && fileName) {
        const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const remote = `${record.prNo}/${Date.now()}-${safe}`;
        const uploaded = await uploadPRFile(fileUri, remote, fileType);
        finalNotes = `${finalNotes ? finalNotes + "\n" : ""}Attachment: ${uploaded.publicUrl}`;
      }
      if (finalNotes) {
        await insertRemark(
          record.id,
          currentUser!.id,
          finalNotes,
          getStatusFlagId(statusFlag),
        );
      }
      const { error } = await supabase
        .from("purchase_requests")
        .update({
          status_id: meta.nextStatusId,
          pr_no: assignedPR.trim(),
          app_no: appNo.trim() || null,
        })
        .eq("id", record.id);
      if (error) throw error;
      onProcessed(record.id, String(meta.nextStatusId));
      onClose();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not certify the PR.");
    } finally {
      setSaving(false);
    }
  };

  if (!record) return null;
  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}>
        <KeyboardAvoidingView
          className="flex-1 bg-white"
          behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ModalHeader meta={meta} prNo={record.prNo} onClose={onClose} />
          {loading ? (
            <LoadingBody color={meta.accentColor} />
          ) : (
            <ScrollView
              className="flex-1 bg-gray-50"
              contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              <InfoBanner bg={meta.bannerBg} border={meta.bannerBorder}>
                As <Text className="font-bold">BAC</Text>, assign the PR number
                and certify inclusion in the Annual Procurement Plan before
                forwarding to Budget (Step 4).
              </InfoBanner>
              {header && <PRSummaryCard header={header} statuses={statuses} />}
              <SectionLabel>BAC Action</SectionLabel>
              <Field label="PR Number" required>
                <StyledInput
                  value={assignedPR}
                  onChangeText={setAssignedPR}
                  placeholder="e.g. 2026-PR-0042"
                />
              </Field>
              <Field label="APP Number">
                <StyledInput
                  value={appNo}
                  onChangeText={setAppNo}
                  placeholder="e.g. 2026-APP-0042"
                />
              </Field>
              <Field label="Status Flag">
                <FlagButton
                  selected={statusFlag}
                  onPress={() => setFlagOpen(true)}
                />
              </Field>
              <Field label="Certification Notes">
                <StyledInput
                  value={certNotes}
                  onChangeText={setCertNotes}
                  placeholder="e.g. Included in APP Q1 2026. Forwarding to Budget."
                  multiline
                />
              </Field>
              <Field label="Attachment (optional)">
                <TouchableOpacity
                  onPress={pickFile}
                  activeOpacity={0.8}
                  className={`rounded-2xl border-2 border-dashed px-4 py-4 items-center ${
                    fileName ? "border-emerald-400 bg-emerald-50" : "border-gray-300 bg-gray-50"
                  }`}>
                  <Text className="text-[13px] font-semibold text-gray-700">
                    {fileName ?? "Tap to attach a file"}
                  </Text>
                  {fileName && (
                    <TouchableOpacity
                      onPress={() => {
                        setFileName(null);
                        setFileUri(null);
                        setFileType(undefined);
                      }}
                      hitSlop={8}
                      className="mt-1">
                      <Text className="text-[11px] text-red-500">Remove</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              </Field>
            </ScrollView>
          )}
          <ModalFooter
            onCancel={onClose}
            onConfirm={handleCertify}
            confirmLabel="Assign PR & Forward to Budget"
            confirmingLabel="Certifying…"
            disabled={!assignedPR.trim() || loading}
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

// ─── Budget Modal (role_id = 4 · Step 4) ─────────────────────────────────────

function BudgetModal({
  visible,
  record,
  onClose,
  onProcessed,
}: Omit<ProcessPRModalProps, "roleId">) {
  const meta = ROLE_META[4];
  const { currentUser } = useAuth();
  const { header, statuses, loading } = usePRFetch(visible, record, onClose);
  const [budgetNo, setBudgetNo] = useState("");
  const [papCode, setPapCode] = useState("");
  const [earmarkNote, setEarmarkNote] = useState("");
  const [statusFlag, setStatusFlag] = useState<StatusFlag | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (visible) {
      setBudgetNo("");
      setPapCode("");
      setEarmarkNote("");
      setStatusFlag(null);
      setFileName(null);
      setFileUri(null);
      setFileType(undefined);
    }
  }, [visible]);

  useEffect(() => {
    if (!header) return;
    if (header.budget_number) setBudgetNo(header.budget_number);
    if (header.pap_code) setPapCode(header.pap_code);
  }, [header]);

  const handleEarmark = async () => {
    if (!record || !budgetNo.trim() || !papCode.trim()) return;
    setSaving(true);
    try {
      let finalNote = earmarkNote.trim();
      if (fileUri && fileName) {
        const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const remote = `${record.prNo}/${Date.now()}-${safe}`;
        const uploaded = await uploadPRFile(fileUri, remote, fileType);
        finalNote = `${finalNote ? finalNote + "\n" : ""}Attachment: ${uploaded.publicUrl}`;
      }
      if (finalNote) {
        await insertRemark(
          record.id,
          currentUser!.id,
          finalNote,
          getStatusFlagId(statusFlag),
        );
      }
      const { error } = await supabase
        .from("purchase_requests")
        .update({
          status_id: meta.nextStatusId,
          budget_number: budgetNo.trim(),
          pap_code: papCode.trim(),
        })
        .eq("id", record.id);
      if (error) throw error;
      onProcessed(record.id, String(meta.nextStatusId));
      onClose();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not earmark the PR.");
    } finally {
      setSaving(false);
    }
  };

  if (!record) return null;
  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}>
        <KeyboardAvoidingView
          className="flex-1 bg-white"
          behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ModalHeader meta={meta} prNo={record.prNo} onClose={onClose} />
          {loading ? (
            <LoadingBody color={meta.accentColor} />
          ) : (
            <ScrollView
              className="flex-1 bg-gray-50"
              contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              <InfoBanner bg={meta.bannerBg} border={meta.bannerBorder}>
                As <Text className="font-bold">Budget Office</Text>, record the
                PPMP budget number and PAP/Activity code to earmark funds, then
                forward to PARPO for approval (Step 5).
              </InfoBanner>
              {header && <PRSummaryCard header={header} statuses={statuses} />}
              <SectionLabel>Earmarking Details</SectionLabel>
              <Field label="Budget Number (from PPMP)" required>
                <StyledInput
                  value={budgetNo}
                  onChangeText={setBudgetNo}
                  placeholder="e.g. 2026-PPMP-0042"
                />
              </Field>
              <Field label="PAP / Activity Code" required>
                <StyledInput
                  value={papCode}
                  onChangeText={setPapCode}
                  placeholder="e.g. ARBDSP-2026-001"
                />
              </Field>
              <Field label="Status Flag">
                <FlagButton
                  selected={statusFlag}
                  onPress={() => setFlagOpen(true)}
                />
              </Field>
              <Field label="Earmarking Notes">
                <StyledInput
                  value={earmarkNote}
                  onChangeText={setEarmarkNote}
                  placeholder="e.g. Funds available under MFO 2. Forwarding to PARPO."
                  multiline
                />
              </Field>
              <Field label="Attachment (optional)">
                <TouchableOpacity
                  onPress={async () => {
                    try {
                      const res = await DocumentPicker.getDocumentAsync({
                        type: "*/*",
                        multiple: false,
                        copyToCacheDirectory: true,
                      });
                      if (res.canceled || !res.assets?.length) return;
                      const f = res.assets[0];
                      setFileName(f.name ?? "attachment");
                      setFileUri(f.uri);
                      setFileType(f.mimeType);
                    } catch (e: any) {
                      Alert.alert("File error", e?.message ?? "Could not pick file.");
                    }
                  }}
                  activeOpacity={0.8}
                  className={`rounded-2xl border-2 border-dashed px-4 py-4 items-center ${
                    fileName ? "border-emerald-400 bg-emerald-50" : "border-gray-300 bg-gray-50"
                  }`}>
                  <Text className="text-[13px] font-semibold text-gray-700">
                    {fileName ?? "Tap to attach a file"}
                  </Text>
                  {fileName && (
                    <TouchableOpacity
                      onPress={() => {
                        setFileName(null);
                        setFileUri(null);
                        setFileType(undefined);
                      }}
                      hitSlop={8}
                      className="mt-1">
                      <Text className="text-[11px] text-red-500">Remove</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              </Field>
            </ScrollView>
          )}
          <ModalFooter
            onCancel={onClose}
            onConfirm={handleEarmark}
            confirmLabel="Earmark & Forward to PARPO"
            confirmingLabel="Recording…"
            disabled={!budgetNo.trim() || !papCode.trim() || loading}
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

// ─── PARPO Modal (role_id = 5 · Step 5) ───────────────────────────────────────

function PARPOModal({
  visible,
  record,
  onClose,
  onProcessed,
}: Omit<ProcessPRModalProps, "roleId">) {
  const meta = ROLE_META[5];
  const { currentUser } = useAuth();
  const { header, statuses, loading } = usePRFetch(visible, record, onClose);
  const [notes, setNotes] = useState("");
  const [statusFlag, setStatusFlag] = useState<StatusFlag | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (visible) {
      setNotes("");
      setStatusFlag(null);
      setFileName(null);
      setFileUri(null);
      setFileType(undefined);
    }
  }, [visible]);

  const handleApprove = async () => {
    if (!record) return;
    setSaving(true);
    try {
      let final = notes.trim();
      if (fileUri && fileName) {
        const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const remote = `${record.prNo}/${Date.now()}-${safe}`;
        const uploaded = await uploadPRFile(fileUri, remote, fileType);
        final = `${final ? final + "\n" : ""}Attachment: ${uploaded.publicUrl}`;
      }
      if (final) {
        await insertRemark(
          record.id,
          currentUser!.id,
          final,
          getStatusFlagId(statusFlag),
        );
      }
      const { error } = await supabase
        .from("purchase_requests")
        .update({ status_id: meta.nextStatusId })
        .eq("id", record.id);
      if (error) throw error;
      onProcessed(record.id, String(meta.nextStatusId));
      onClose();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not approve the PR.");
    } finally {
      setSaving(false);
    }
  };

  if (!record) return null;
  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}>
        <KeyboardAvoidingView
          className="flex-1 bg-white"
          behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ModalHeader meta={meta} prNo={record.prNo} onClose={onClose} />
          {loading ? (
            <LoadingBody color={meta.accentColor} />
          ) : (
            <ScrollView
              className="flex-1 bg-gray-50"
              contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              <InfoBanner bg={meta.bannerBg} border={meta.bannerBorder}>
                As <Text className="font-bold">PARPO</Text>, review and approve
                this PR to complete Phase 1 and advance to Canvassing (Steps
                6–10).
              </InfoBanner>
              {header && <PRSummaryCard header={header} statuses={statuses} />}
              <SectionLabel>Approval</SectionLabel>
              <Field label="Status Flag">
                <FlagButton
                  selected={statusFlag}
                  onPress={() => setFlagOpen(true)}
                />
              </Field>
              <Field label="Approval Notes">
                <StyledInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="e.g. Approved. Proceed to canvassing."
                  multiline
                />
              </Field>
              <Field label="Attachment (optional)">
                <TouchableOpacity
                  onPress={async () => {
                    try {
                      const res = await DocumentPicker.getDocumentAsync({
                        type: "*/*",
                        multiple: false,
                        copyToCacheDirectory: true,
                      });
                      if (res.canceled || !res.assets?.length) return;
                      const f = res.assets[0];
                      setFileName(f.name ?? "attachment");
                      setFileUri(f.uri);
                      setFileType(f.mimeType);
                    } catch (e: any) {
                      Alert.alert("File error", e?.message ?? "Could not pick file.");
                    }
                  }}
                  activeOpacity={0.8}
                  className={`rounded-2xl border-2 border-dashed px-4 py-4 items-center ${
                    fileName ? "border-emerald-400 bg-emerald-50" : "border-gray-50 border-gray-300"
                  }`}>
                  <Text className="text-[13px] font-semibold text-gray-700">
                    {fileName ?? "Tap to attach a file"}
                  </Text>
                  {fileName && (
                    <TouchableOpacity
                      onPress={() => {
                        setFileName(null);
                        setFileUri(null);
                        setFileType(undefined);
                      }}
                      hitSlop={8}
                      className="mt-1">
                      <Text className="text-[11px] text-red-500">Remove</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              </Field>
            </ScrollView>
          )}
          <ModalFooter
            onCancel={onClose}
            onConfirm={handleApprove}
            confirmLabel="Approve PR"
            confirmingLabel="Approving…"
            disabled={loading}
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

// ─── Root export — routes to the correct modal by role_id ─────────────────────

export default function ProcessPRModal({
  roleId,
  ...rest
}: ProcessPRModalProps) {
  if (roleId === 2) return <DivisionHeadModal {...rest} />;
  if (roleId === 3) return <BACModal {...rest} />;
  if (roleId === 4) return <BudgetModal {...rest} />;
  if (roleId === 5) return <PARPOModal {...rest} />;
  return null;
}
