/**
 * ProcessPOModal.tsx — Role-gated PO processing modal
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
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase/client";
import {
  fetchPOWithItemsById,
  updatePO,
  updatePOStatus,
} from "../../lib/supabase/po";
import { useAuth } from "../AuthContext";
import CalendarPickerModal from "./CalendarModal";
import {
  FlagButton,
  STATUS_FLAGS,
  StatusFlagPicker,
  type StatusFlag,
} from "./ProcessPRModal";

export interface ProcessPORecord {
  id: string;
  poNo: string;
  prNo: string;
  statusId: number;
}

export { STATUS_FLAGS, type StatusFlag };

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-PH", {
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
  placeholder = "Select date…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
        className="bg-gray-50 rounded-[10px] border border-gray-200 px-3 py-2.5 flex-row items-center justify-between"
        style={{ minHeight: 42 }}
      >
        <Text
          className="text-sm flex-1 mr-2"
          style={{ color: value ? "#111827" : "#9ca3af" }}
        >
          {value || placeholder}
        </Text>
        <MaterialIcons name="calendar-today" size={15} color="#064E3B" />
      </TouchableOpacity>
      <CalendarPickerModal
        visible={open}
        onClose={() => setOpen(false)}
        onSelectDate={(date) => {
          onChange(formatDate(date));
          setOpen(false);
        }}
      />
    </>
  );
}

function getStatusFlagId(flag: StatusFlag | null): number | null {
  if (!flag) return null;
  if (flag === "complete") return 2;
  if (flag === "incomplete_info") return 3;
  if (flag === "wrong_information") return 4;
  if (flag === "needs_revision") return 5;
  if (flag === "on_hold") return 6;
  if (flag === "urgent") return 7;
  return null;
}

/**
 * Whether a given role can process a PO at the given status.
 *
 * Full Phase 2 swimlane ownership:
 *   Supply (8)  — 12→13 (Creation→Allocation), 13→14 (Allocation→ORS),
 *                 17→18 (PARPO→Serving, serve PO to suppliers)
 *   Budget (4)  — 14→15 (ORS Creation→Processing), 15→16 (ORS Processing→Accounting)
 *   Accounting / PARPO — no dedicated role_id yet; handled via Admin override
 *   Admin (1)   — all statuses
 */
export function canRoleProcessPO(roleId: number, statusId: number) {
  if (roleId === 1) return true;
  if (roleId === 8)
    return statusId === 12 || statusId === 13 || statusId === 17;
  if (roleId === 4) return statusId === 14 || statusId === 15;
  return false;
}

async function insertPORemark(
  poId: string,
  prId: string | null,
  userId: string | number | null,
  remark: string,
  statusFlagId: number | null,
): Promise<void> {
  const trimmed = remark.trim();
  if (!trimmed) return;
  const { error } = await supabase.from("remarks").insert({
    po_id: poId,
    pr_id: prId,
    user_id: userId ? String(userId) : null,
    remark: trimmed,
    status_flag_id: statusFlagId,
    created_at: new Date().toISOString(),
  });
  if (error) throw error;
}

interface ProcessPOModalProps {
  visible: boolean;
  record: ProcessPORecord | null;
  roleId: number;
  onClose: () => void;
  onProcessed: (poId: string, newStatusId: number) => void;
}

function Header({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
}) {
  return (
    <View className="px-5 pt-4 pb-3 bg-[#064E3B]">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-white/60 text-[11px] font-bold tracking-widest uppercase">
            {subtitle}
          </Text>
          <Text className="text-white text-[18px] font-extrabold">{title}</Text>
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
    <View className="mb-3.5">
      <Text className="text-[11px] font-bold text-gray-500 mb-1">
        {label}
        {required ? <Text className="text-red-500"> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}

function Input({
  value,
  onChangeText,
  placeholder,
  mono,
  keyboardType,
  multiline,
}: {
  value: string;
  onChangeText?: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  keyboardType?: any;
  multiline?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#9ca3af"
      keyboardType={keyboardType}
      multiline={multiline}
      className="bg-gray-50 rounded-[10px] border border-gray-200 px-3 py-2.5 text-sm text-gray-900"
      style={[
        mono
          ? { fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace" }
          : {},
      ]}
    />
  );
}

function BudgetModal({
  visible,
  record,
  onClose,
  onProcessed,
}: Omit<ProcessPOModalProps, "roleId">) {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [headerPrId, setHeaderPrId] = useState<string | null>(null);
  const [orsNo, setOrsNo] = useState("");
  const [orsDate, setOrsDate] = useState("");
  const [orsAmount, setOrsAmount] = useState("");
  const [fundsAvailable, setFundsAvailable] = useState("");
  const [remarks, setRemarks] = useState("");
  const [statusFlag, setStatusFlag] = useState<StatusFlag | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);

  useEffect(() => {
    if (!visible || !record) return;
    setLoading(true);
    setSaving(false);
    setRemarks("");
    setStatusFlag(null);
    (async () => {
      try {
        const { header } = await fetchPOWithItemsById(record.id);
        setHeaderPrId((header as any)?.pr_id ?? null);
        setOrsNo((header as any)?.ors_no ?? "");
        setOrsDate(normalizeDateString((header as any)?.ors_date ?? ""));
        setOrsAmount(
          (header as any)?.ors_amount
            ? String((header as any)?.ors_amount)
            : "",
        );
        setFundsAvailable((header as any)?.funds_available ?? "");
      } catch (e: any) {
        Alert.alert("Load failed", e?.message ?? "Could not load PO details.");
      } finally {
        setLoading(false);
      }
    })();
  }, [visible, record]);

  const submit = useCallback(async () => {
    if (!record) return;
    setSaving(true);
    try {
      await insertPORemark(
        record.id,
        headerPrId,
        currentUser?.id ?? null,
        remarks,
        getStatusFlagId(statusFlag),
      );

      // At ORS Creation (14): save ORS fields and advance to ORS Processing (15)
      // At ORS Processing (15): forward to Accounting (16) — no extra fields needed
      if (record.statusId === 14) {
        await updatePO(record.id, {
          ors_no: orsNo.trim() || null,
          ors_date: orsDate.trim() ? normalizeDateString(orsDate.trim()) : null,
          ors_amount: orsAmount.trim() ? Number(orsAmount) || 0 : null,
          funds_available: fundsAvailable.trim() || null,
        });
      }

      const targetStatusId = record.statusId === 14 ? 15 : 16;
      await updatePOStatus(record.id, targetStatusId);
      onProcessed(record.id, targetStatusId);
      onClose();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not update PO status.");
    } finally {
      setSaving(false);
    }
  }, [
    record,
    headerPrId,
    currentUser?.id,
    remarks,
    statusFlag,
    orsNo,
    orsDate,
    orsAmount,
    fundsAvailable,
    onProcessed,
    onClose,
  ]);

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
          <Header
            title={
              record?.statusId === 14 ? "Prepare ORS" : "Forward to Accounting"
            }
            subtitle={`Budget · ${record?.poNo ?? ""}`}
            onClose={onClose}
          />
          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
              <Text className="text-[12px] text-gray-400 mt-2">Loading…</Text>
            </View>
          ) : (
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            >
              {/* ORS fields — only at status 14 (ORS Creation) */}
              {record?.statusId === 14 && (
                <View
                  className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
                  style={{ elevation: 2 }}
                >
                  <View className="px-4 pt-3 pb-3">
                    <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                      ORS Details
                    </Text>

                    <Field label="ORS No." required>
                      <Input
                        value={orsNo}
                        onChangeText={setOrsNo}
                        placeholder="e.g. ORS-2026-001"
                        mono
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
                      <Input
                        value={orsAmount}
                        onChangeText={setOrsAmount}
                        placeholder="e.g. 150000.00"
                        keyboardType="numeric"
                        mono
                      />
                    </Field>

                    <Field label="Funds Available">
                      <Input
                        value={fundsAvailable}
                        onChangeText={setFundsAvailable}
                        placeholder="Optional"
                      />
                    </Field>
                  </View>
                </View>
              )}

              {/* Forwarding note — at status 15 (ORS Processing → Accounting) */}
              {record?.statusId === 15 && (
                <View className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 mb-3 flex-row items-center gap-2">
                  <MaterialIcons name="send" size={16} color="#1d4ed8" />
                  <Text className="text-[12px] text-blue-800 flex-1">
                    Budget officer has signed the ORS. This will forward the
                    purchase order to Accounting for incoming check processing.
                  </Text>
                </View>
              )}

              <View
                className="bg-white rounded-2xl border border-gray-200 overflow-hidden mt-3"
                style={{ elevation: 2 }}
              >
                <View className="px-4 pt-3 pb-3">
                  <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    Remark & Flag
                  </Text>

                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-[11px] font-bold text-gray-500">
                      Status flag
                    </Text>
                    <FlagButton
                      selected={statusFlag}
                      onPress={() => setFlagOpen(true)}
                    />
                  </View>

                  <Field label="Remark">
                    <Input
                      value={remarks}
                      onChangeText={setRemarks}
                      placeholder={
                        record?.statusId === 14
                          ? "Optional remark for this ORS step…"
                          : "Optional remark before forwarding to Accounting…"
                      }
                      multiline
                    />
                  </Field>
                </View>
              </View>

              <TouchableOpacity
                onPress={submit}
                disabled={
                  saving ||
                  (record?.statusId === 14 &&
                    (!orsNo.trim() || !orsDate.trim()))
                }
                activeOpacity={0.85}
                className={`mt-4 rounded-2xl py-3 items-center ${
                  saving ||
                  (record?.statusId === 14 &&
                    (!orsNo.trim() || !orsDate.trim()))
                    ? "bg-gray-300"
                    : "bg-[#064E3B]"
                }`}
              >
                <Text className="text-[13.5px] font-extrabold text-white">
                  {saving
                    ? "Saving…"
                    : record?.statusId === 14
                      ? "Finalize ORS"
                      : "Forward to Accounting"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          <StatusFlagPicker
            visible={flagOpen}
            selected={statusFlag}
            onSelect={setStatusFlag}
            onClose={() => setFlagOpen(false)}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function SupplyModal({
  visible,
  record,
  onClose,
  onProcessed,
}: Omit<ProcessPOModalProps, "roleId">) {
  const { currentUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [headerPrId, setHeaderPrId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");
  const [statusFlag, setStatusFlag] = useState<StatusFlag | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);

  useEffect(() => {
    if (!visible || !record) return;
    setSaving(false);
    setRemarks("");
    setStatusFlag(null);
    (async () => {
      try {
        const { header } = await fetchPOWithItemsById(record.id);
        setHeaderPrId((header as any)?.pr_id ?? null);
      } catch {}
    })();
  }, [visible, record]);

  const submit = useCallback(async () => {
    if (!record) return;
    setSaving(true);
    try {
      await insertPORemark(
        record.id,
        headerPrId,
        currentUser?.id ?? null,
        remarks,
        getStatusFlagId(statusFlag),
      );
      // Status progression:
      //   12 (PO Creation)    → 13 (PO Allocation)
      //   13 (PO Allocation)  → 14 (ORS Creation)
      //   17 (PO PARPO)       → 18 (PO Serving)
      const targetStatusId =
        record.statusId === 12 ? 13 : record.statusId === 13 ? 14 : 18;
      await updatePOStatus(record.id, targetStatusId);
      onProcessed(record.id, targetStatusId);
      onClose();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not update PO status.");
    } finally {
      setSaving(false);
    }
  }, [
    record,
    headerPrId,
    currentUser?.id,
    remarks,
    statusFlag,
    onProcessed,
    onClose,
  ]);

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
          <Header
            title="Process PO"
            subtitle={`Supply · ${record?.poNo ?? ""}`}
            onClose={onClose}
          />
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          >
            <View
              className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
              style={{ elevation: 2 }}
            >
              <View className="px-4 pt-3 pb-3">
                <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                  Remark & Flag
                </Text>
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-[11px] font-bold text-gray-500">
                    Status flag
                  </Text>
                  <FlagButton
                    selected={statusFlag}
                    onPress={() => setFlagOpen(true)}
                  />
                </View>
                <Field label="Remark">
                  <Input
                    value={remarks}
                    onChangeText={setRemarks}
                    placeholder="Optional remark for this step…"
                    multiline
                  />
                </Field>
              </View>
            </View>

            <TouchableOpacity
              onPress={submit}
              disabled={saving}
              activeOpacity={0.85}
              className={`mt-4 rounded-2xl py-3 items-center ${saving ? "bg-gray-300" : "bg-[#064E3B]"}`}
            >
              <Text className="text-[13.5px] font-extrabold text-white">
                {saving
                  ? "Saving…"
                  : record?.statusId === 12
                    ? "Advance to Allocation"
                    : record?.statusId === 13
                      ? "Forward to Budget"
                      : "Serve PO to Supplier"}
              </Text>
            </TouchableOpacity>
          </ScrollView>

          <StatusFlagPicker
            visible={flagOpen}
            selected={statusFlag}
            onSelect={setStatusFlag}
            onClose={() => setFlagOpen(false)}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Admin-override phase labels (mirrors Phase 2 swimlane) ──────────────────

/**
 * Full Phase 2 step metadata keyed by status_id (public.status table).
 *
 * Swimlane ownership:
 *   Supply (8)  — 12 (Creation), 13 (Allocation), 18 (Serving)
 *   Budget (4)  — 14 (ORS Creation), 15 (ORS Processing)
 *   Accounting  — 16 (Accounting)   [no dedicated role yet → admin override]
 *   PARPO       — 17 (PARPO)        [no dedicated role yet → admin override]
 */
const PHASE2_STEPS: Record<
  number,
  { label: string; role: string; action: string }
> = {
  12: {
    label: "PO (Creation)",
    role: "Supply",
    action: "Advance to Allocation",
  },
  13: {
    label: "PO (Allocation)",
    role: "Supply",
    action: "Forward to Budget",
  },
  14: {
    label: "ORS (Creation)",
    role: "Budget",
    action: "Finalize ORS",
  },
  15: {
    label: "ORS (Processing)",
    role: "Budget",
    action: "Forward to Accounting",
  },
  16: {
    label: "PO (Accounting)",
    role: "Accounting",
    action: "Forward to PARPO",
  },
  17: {
    label: "PO (PARPO)",
    role: "PARPO",
    action: "Forward to Supply (Serving)",
  },
  18: {
    label: "PO (Serving)",
    role: "Supply",
    action: "Mark as Served",
  },
};

/**
 * AdminModal — full Phase 2 override (statuses 12–18).
 *
 *   12 (PO Creation)    → 13  remark only             Supply owns normally
 *   13 (PO Allocation)  → 14  remark only             Supply owns normally
 *   14 (ORS Creation)   → 15  ORS fields required     Budget owns normally
 *   15 (ORS Processing) → 16  remark only             Budget owns normally
 *   16 (PO Accounting)  → 17  remark only             no role yet → admin
 *   17 (PO PARPO)       → 18  remark only             no role yet → admin
 *   18 (PO Serving)     → —   terminal; target picker shown for rollback
 *
 * Shows: step banner (N of 7), target picker, contextual ORS fields, remark & flag.
 */
function AdminModal({
  visible,
  record,
  onClose,
  onProcessed,
}: Omit<ProcessPOModalProps, "roleId">) {
  const { currentUser } = useAuth();

  // ── Shared state ──
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [headerPrId, setHeaderPrId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");
  const [statusFlag, setStatusFlag] = useState<StatusFlag | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);

  // ── ORS-specific fields (status 14) ──
  const [orsNo, setOrsNo] = useState("");
  const [orsDate, setOrsDate] = useState("");
  const [orsAmount, setOrsAmount] = useState("");
  const [fundsAvailable, setFundsAvailable] = useState("");

  // ── Target-status picker (admin can jump to any Phase 2 step) ──
  const currentStatus = record?.statusId ?? 12;
  const defaultTarget = Math.min(currentStatus + 1, 18);
  const [targetStatusId, setTargetStatusId] = useState<number>(defaultTarget);

  useEffect(() => {
    if (!visible || !record) return;
    const computed = Math.min(record.statusId + 1, 18);
    setTargetStatusId(computed);
    setLoading(true);
    setSaving(false);
    setRemarks("");
    setStatusFlag(null);
    setOrsNo("");
    setOrsDate("");
    setOrsAmount("");
    setFundsAvailable("");
    (async () => {
      try {
        const { header } = await fetchPOWithItemsById(record.id);
        setHeaderPrId((header as any)?.pr_id ?? null);
        // Pre-fill ORS fields if already present
        setOrsNo((header as any)?.ors_no ?? "");
        setOrsDate(normalizeDateString((header as any)?.ors_date ?? ""));
        setOrsAmount(
          (header as any)?.ors_amount
            ? String((header as any)?.ors_amount)
            : "",
        );
        setFundsAvailable((header as any)?.funds_available ?? "");
      } catch (e: any) {
        Alert.alert("Load failed", e?.message ?? "Could not load PO details.");
      } finally {
        setLoading(false);
      }
    })();
  }, [visible, record]);

  const isOrsStep = currentStatus === 14;
  // Steps where forwarding-to-next-department context note is shown
  const isForwardingStep =
    currentStatus === 15 || currentStatus === 16 || currentStatus === 17;

  // Whether the submit button should be disabled
  const submitDisabled =
    saving || loading || (isOrsStep && (!orsNo.trim() || !orsDate.trim()));

  const submit = useCallback(async () => {
    if (!record) return;
    setSaving(true);
    try {
      // 1. Optionally save ORS fields when at status 14
      if (isOrsStep) {
        await updatePO(record.id, {
          ors_no: orsNo.trim() || null,
          ors_date: orsDate.trim() ? normalizeDateString(orsDate.trim()) : null,
          ors_amount: orsAmount.trim() ? Number(orsAmount) || 0 : null,
          funds_available: fundsAvailable.trim() || null,
        });
      }

      // 2. Insert remark (fire-and-forget style; non-blocking failure is ok)
      await insertPORemark(
        record.id,
        headerPrId,
        currentUser?.id ?? null,
        remarks,
        getStatusFlagId(statusFlag),
      );

      // 3. Advance status
      await updatePOStatus(record.id, targetStatusId);
      onProcessed(record.id, targetStatusId);
      onClose();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not update PO status.");
    } finally {
      setSaving(false);
    }
  }, [
    record,
    isOrsStep,
    orsNo,
    orsDate,
    orsAmount,
    fundsAvailable,
    headerPrId,
    currentUser?.id,
    remarks,
    statusFlag,
    targetStatusId,
    onProcessed,
    onClose,
  ]);

  const stepMeta = PHASE2_STEPS[currentStatus];
  const actionLabel = stepMeta?.action ?? "Advance";

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
          {/* Header */}
          <View className="px-5 pt-4 pb-3 bg-[#064E3B]">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 mr-3">
                <Text className="text-white/60 text-[11px] font-bold tracking-widest uppercase">
                  Admin Override · {record?.poNo ?? ""}
                </Text>
                <Text className="text-white text-[18px] font-extrabold">
                  Process PO
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

          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
              <Text className="text-[12px] text-gray-400 mt-2">Loading…</Text>
            </View>
          ) : (
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            >
              {/* ── Current phase banner ── */}
              <View className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-3 flex-row items-center gap-3">
                <MaterialIcons
                  name="admin-panel-settings"
                  size={20}
                  color="#92400e"
                />
                <View className="flex-1">
                  <Text className="text-[10px] font-bold uppercase tracking-widest text-amber-700 mb-0.5">
                    Phase 2 — Step {currentStatus - 11} of 7
                  </Text>
                  <Text className="text-[13px] font-bold text-amber-900">
                    {stepMeta?.label ?? `Status ${currentStatus}`}
                    {"  "}
                    <Text className="font-normal text-amber-700">
                      ({stepMeta?.role ?? "—"})
                    </Text>
                  </Text>
                </View>
              </View>

              {/* ── Target status picker ── */}
              <View
                className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-3"
                style={{ elevation: 2 }}
              >
                <View className="px-4 pt-3 pb-3">
                  <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    Target Status
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {([12, 13, 14, 15, 16, 17, 18] as const).map((sid) => {
                      const meta = PHASE2_STEPS[sid];
                      if (!meta) return null;
                      const active = targetStatusId === sid;
                      const isPast = sid <= currentStatus;
                      return (
                        <TouchableOpacity
                          key={sid}
                          onPress={() => setTargetStatusId(sid)}
                          activeOpacity={0.75}
                          className={`flex-row items-center px-3 py-1.5 rounded-full border ${
                            active
                              ? "bg-[#064E3B] border-[#064E3B]"
                              : isPast
                                ? "bg-gray-100 border-gray-200"
                                : "bg-white border-gray-300"
                          }`}
                        >
                          {isPast && !active && (
                            <MaterialIcons
                              name="check-circle"
                              size={12}
                              color="#6b7280"
                              style={{ marginRight: 4 }}
                            />
                          )}
                          <Text
                            className={`text-[11px] font-bold ${
                              active
                                ? "text-white"
                                : isPast
                                  ? "text-gray-400"
                                  : "text-gray-700"
                            }`}
                          >
                            {meta.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text className="text-[10px] text-gray-400 mt-2">
                    Admin can set any Phase 2 target status. Grayed = already
                    passed.
                  </Text>
                </View>
              </View>

              {/* ── ORS fields — shown when current status is 14 OR target is 14/15 ── */}
              {(isOrsStep || targetStatusId >= 15) && (
                <View
                  className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-3"
                  style={{ elevation: 2 }}
                >
                  <View className="px-4 pt-3 pb-3">
                    <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                      ORS Details
                      {isOrsStep && (
                        <Text className="text-red-400"> (required)</Text>
                      )}
                    </Text>

                    <Field label="ORS No." required={isOrsStep}>
                      <Input
                        value={orsNo}
                        onChangeText={setOrsNo}
                        placeholder="e.g. ORS-2026-001"
                        mono
                      />
                    </Field>

                    <Field label="ORS Date" required={isOrsStep}>
                      <DatePickerButton
                        value={orsDate}
                        onChange={setOrsDate}
                        placeholder="Select ORS date…"
                      />
                    </Field>

                    <Field label="ORS Amount">
                      <Input
                        value={orsAmount}
                        onChangeText={setOrsAmount}
                        placeholder="e.g. 150000.00"
                        keyboardType="numeric"
                        mono
                      />
                    </Field>

                    <Field label="Funds Available">
                      <Input
                        value={fundsAvailable}
                        onChangeText={setFundsAvailable}
                        placeholder="Optional"
                      />
                    </Field>
                  </View>
                </View>
              )}

              {/* ── Forwarding note — shown when handing off to next department ── */}
              {isForwardingStep && (
                <View className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 mb-3 flex-row items-center gap-2">
                  <MaterialIcons name="send" size={16} color="#1d4ed8" />
                  <Text className="text-[12px] text-blue-800 flex-1">
                    {currentStatus === 15
                      ? "Budget officer has signed the ORS. This will forward the PO to Accounting for incoming check processing."
                      : currentStatus === 16
                        ? "Accounting has verified document completeness. This will forward the PO to PARPO II for review and signature."
                        : "PARPO II has signed the PO. This will hand off to Supply for serving to suppliers."}
                  </Text>
                </View>
              )}

              {/* ── Remark & flag ── */}
              <View
                className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-3"
                style={{ elevation: 2 }}
              >
                <View className="px-4 pt-3 pb-3">
                  <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    Remark & Flag
                  </Text>
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-[11px] font-bold text-gray-500">
                      Status flag
                    </Text>
                    <FlagButton
                      selected={statusFlag}
                      onPress={() => setFlagOpen(true)}
                    />
                  </View>
                  <Field label="Remark">
                    <Input
                      value={remarks}
                      onChangeText={setRemarks}
                      placeholder={`Admin override remark for ${stepMeta?.label ?? "this step"}…`}
                      multiline
                    />
                  </Field>
                </View>
              </View>

              {/* ── Submit ── */}
              <TouchableOpacity
                onPress={submit}
                disabled={submitDisabled}
                activeOpacity={0.85}
                className={`rounded-2xl py-3 items-center flex-row justify-center gap-2 ${
                  submitDisabled ? "bg-gray-300" : "bg-[#064E3B]"
                }`}
              >
                <MaterialIcons
                  name="admin-panel-settings"
                  size={16}
                  color={submitDisabled ? "#9ca3af" : "#ffffff"}
                />
                <Text className="text-[13.5px] font-extrabold text-white">
                  {saving ? "Saving…" : actionLabel}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          <StatusFlagPicker
            visible={flagOpen}
            selected={statusFlag}
            onSelect={setStatusFlag}
            onClose={() => setFlagOpen(false)}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

export default function ProcessPOModal({
  roleId,
  ...rest
}: ProcessPOModalProps) {
  if (!rest.visible) return null;
  if (!rest.record) return null;
  if (roleId === 1) return <AdminModal {...rest} />;
  if (roleId === 4) return <BudgetModal {...rest} />;
  if (roleId === 8) return <SupplyModal {...rest} />;
  return null;
}
