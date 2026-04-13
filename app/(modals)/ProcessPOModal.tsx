/**
 * ProcessPOModal.tsx — Role-gated PO processing modal (Phase 2)
 *
 * Architecture mirrors ProcessPRModal exactly:
 *   usePOFetch      — shared data hook (PO header + DB status labels)
 *   ROLE_META       — per-step accent colour, step label, title, next status
 *   ModalHeader     — coloured header with step / title / PO No.
 *   POSummaryCard   — PO details card with status_name from public.status
 *   ModalFooter     — sticky Cancel | Confirm footer
 *   Field / StyledInput / SectionLabel — shared form micro-components
 *
 * Phase 2 swimlane ownership (public.status table):
 *   Supply  (8)  — 12 PO Creation → 13, 13 PO Allocation → 14, 17 PO PARPO → 18
 *   Budget  (4)  — 14 ORS Creation → 15, 15 ORS Processing → 16
 *   Accounting / PARPO — no dedicated role yet; handled via AdminModal
 *   Admin   (1)  — full override across all 7 steps (12–18)
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
import { supabase } from "../../lib/supabase/client";
import {
  fetchPOStatuses,
  fetchPOWithItemsById,
  updatePO,
  updatePOStatus,
  type PORow,
} from "../../lib/supabase/po";
import { useAuth } from "../AuthContext";
import CalendarPickerModal from "./CalendarModal";
import {
  FlagButton,
  STATUS_FLAGS,
  StatusFlagPicker,
  type StatusFlag,
} from "./ProcessPRModal";

// ─── Re-exports (consumed by POModule) ───────────────────────────────────────

export { STATUS_FLAGS, type StatusFlag };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProcessPORecord {
  id: string;
  poNo: string;
  prNo: string;
  statusId: number;
}

interface ProcessPOModalProps {
  visible: boolean;
  record: ProcessPORecord | null;
  roleId: number;
  onClose: () => void;
  onProcessed: (poId: string, newStatusId: number) => void;
}

interface POStatusRow {
  id: number;
  status_name: string;
}

// ─── Role metadata ────────────────────────────────────────────────────────────

/**
 * Keyed by the *current* status_id being processed.
 * Drives ModalHeader colour, step label, title, and the sticky footer button.
 */
const ROLE_META: Record<
  number,
  { step: string; title: string; accentColor: string; nextStatusId: number }
> = {
  12: {
    step: "Step 12",
    title: "PO Creation",
    accentColor: "#0f766e",
    nextStatusId: 13,
  },
  13: {
    step: "Step 13",
    title: "PO Allocation",
    accentColor: "#7c3aed",
    nextStatusId: 14,
  },
  14: {
    step: "Step 14",
    title: "ORS Creation",
    accentColor: "#b45309",
    nextStatusId: 15,
  },
  15: {
    step: "Step 15",
    title: "ORS Processing",
    accentColor: "#1d4ed8",
    nextStatusId: 16,
  },
  16: {
    step: "Step 16",
    title: "PO Accounting",
    accentColor: "#854d0e",
    nextStatusId: 17,
  },
  17: {
    step: "Step 17",
    title: "PO (PARPO)",
    accentColor: "#86198f",
    nextStatusId: 18,
  },
  18: {
    step: "Step 18",
    title: "PO (Serving)",
    accentColor: "#166534",
    nextStatusId: 18,
  },
};

// ─── Phase 2 swimlane step labels (AdminModal target picker) ──────────────────

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
    action: "Assign PO & Forward to Budget",
  },
  14: { label: "ORS (Creation)", role: "Budget", action: "Finalize ORS" },
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
  18: { label: "PO (Serving)", role: "Supply", action: "Mark as Served" },
};

// ─── canRoleProcessPO ─────────────────────────────────────────────────────────

/**
 * Whether a given role can process a PO at the given status_id.
 *   Supply (8)  — 12→13, 13→14, 17→18
 *   Budget (4)  — 14→15, 15→16
 *   Admin  (1)  — all statuses
 */
export function canRoleProcessPO(roleId: number, statusId: number): boolean {
  if (roleId === 1) return true;
  if (roleId === 8)
    return statusId === 12 || statusId === 13 || statusId === 17;
  if (roleId === 4) return statusId === 14 || statusId === 15;
  return false;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

const fmt = (n: number) =>
  n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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

function getStatusFlagId(flag: StatusFlag | null): number | null {
  if (!flag) return null;
  const map: Record<StatusFlag, number> = {
    complete: 2,
    incomplete_info: 3,
    wrong_information: 4,
    needs_revision: 5,
    on_hold: 6,
    urgent: 7,
  };
  return map[flag] ?? null;
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

// ─── usePOFetch ───────────────────────────────────────────────────────────────

/**
 * Shared data hook — mirrors usePRFetch from ProcessPRModal.
 * Fetches PO header + all Phase 2 status labels in one Promise.all.
 */
function usePOFetch(
  visible: boolean,
  record: ProcessPORecord | null,
  onClose: () => void,
) {
  const [header, setHeader] = useState<PORow | null>(null);
  const [statuses, setStatuses] = useState<POStatusRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !record) return;
    setHeader(null);
    setLoading(true);
    Promise.all([fetchPOWithItemsById(record.id), fetchPOStatuses()])
      .then(([{ header: h }, statusRows]) => {
        setHeader(h);
        setStatuses(statusRows);
      })
      .catch((e: any) => {
        Alert.alert("Error", e?.message ?? "Could not load PO.");
        onClose();
      })
      .finally(() => setLoading(false));
  }, [visible, record]);

  return { header, statuses, loading };
}

// ─── Micro-components ─────────────────────────────────────────────────────────

function ModalHeader({
  meta,
  poNo,
  onClose,
}: {
  meta: { step: string; title: string; accentColor: string };
  poNo: string;
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
            {meta.step} · Phase 2
          </Text>
          <Text className="text-[16px] font-bold text-white">{meta.title}</Text>
          <Text
            className="text-[11px] text-white/50 mt-0.5"
            style={{ fontFamily: MONO }}
          >
            {poNo}
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
    </View>
  );
}

function POSummaryCard({
  header,
  statuses,
}: {
  header: PORow;
  statuses: POStatusRow[];
}) {
  const statusLabel =
    statuses.find((s) => s.id === header.status_id)?.status_name ??
    `Status #${header.status_id}`;

  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: "PO No.", value: header.po_no ?? "—", mono: true },
    { label: "PR No.", value: header.pr_no ?? "—", mono: true },
    { label: "Supplier", value: header.supplier ?? "—" },
    { label: "Section", value: header.office_section ?? "—" },
    {
      label: "Amount",
      value:
        header.total_amount != null
          ? `₱${fmt(Number(header.total_amount))}`
          : "—",
      mono: true,
    },
    { label: "Status", value: statusLabel },
    ...(header.ors_no
      ? [{ label: "ORS No.", value: header.ors_no, mono: true }]
      : []),
    ...(header.fund_cluster
      ? [{ label: "Fund Cluster", value: header.fund_cluster }]
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
      }}
    >
      <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
        PO Summary
      </Text>
      {rows.map(({ label, value, mono }, i) => (
        <View
          key={label}
          className={`flex-row items-start justify-between py-2 ${
            i < rows.length - 1 ? "border-b border-gray-100" : ""
          }`}
        >
          <Text className="text-[11.5px] font-semibold text-gray-400 w-24">
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
  mono,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: any;
  mono?: boolean;
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
      className={`rounded-xl px-3.5 py-2.5 text-[13.5px] text-gray-800 border bg-white ${
        focused ? "border-emerald-500" : "border-gray-200"
      } ${multiline ? "min-h-[80px]" : ""}`}
      style={[
        multiline ? { textAlignVertical: "top" } : undefined,
        mono ? { fontFamily: MONO } : undefined,
      ]}
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
        className={`flex-row items-center gap-2 px-5 py-2.5 rounded-xl ${
          disabled || saving ? "opacity-40" : ""
        }`}
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
        className="bg-white rounded-xl border border-gray-200 px-3.5 py-2.5 flex-row items-center justify-between"
        style={{ minHeight: 44 }}
      >
        <Text
          className="text-[13.5px] flex-1 mr-2"
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

// ─── Supply Modal (role_id = 8 · Steps 12, 13, 17) ───────────────────────────

function SupplyModal({
  visible,
  record,
  onClose,
  onProcessed,
}: Omit<ProcessPOModalProps, "roleId">) {
  const { currentUser } = useAuth();
  const { header, statuses, loading } = usePOFetch(visible, record, onClose);
  const [poNo, setPoNo] = useState("");
  const [remarks, setRemarks] = useState("");
  const [statusFlag, setStatusFlag] = useState<StatusFlag | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const statusId = record?.statusId ?? 12;
  const meta = ROLE_META[statusId] ?? ROLE_META[12];

  useEffect(() => {
    if (!visible) return;
    setRemarks("");
    setStatusFlag(null);
    setPoNo("");
  }, [visible]);

  // Pre-fill PO No. from DB
  useEffect(() => {
    if (header?.po_no) setPoNo(header.po_no);
  }, [header]);

  const handleSubmit = async () => {
    if (!record) return;
    setSaving(true);
    try {
      // At Allocation (13): write the assigned PO number back to the DB
      if (statusId === 13 && poNo.trim()) {
        await updatePO(record.id, { po_no: poNo.trim() });
      }

      await insertPORemark(
        record.id,
        header?.pr_id ?? null,
        currentUser?.id ?? null,
        remarks,
        getStatusFlagId(statusFlag),
      );

      // 12 → 13 · 13 → 14 · 17 → 18
      const targetStatusId = statusId === 12 ? 13 : statusId === 13 ? 14 : 18;

      await updatePOStatus(record.id, targetStatusId);
      onProcessed(record.id, targetStatusId);
      onClose();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not update PO status.");
    } finally {
      setSaving(false);
    }
  };

  const confirmLabel =
    statusId === 12
      ? "Advance to Allocation"
      : statusId === 13
        ? "Assign PO & Forward to Budget"
        : "Serve PO to Suppliers";

  if (!record) return null;
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
          <ModalHeader meta={meta} poNo={record.poNo} onClose={onClose} />
          {loading ? (
            <LoadingBody color={meta.accentColor} />
          ) : (
            <ScrollView
              className="flex-1 bg-gray-50"
              contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {header && <POSummaryCard header={header} statuses={statuses} />}

              <SectionLabel>Supply Action</SectionLabel>

              {/* PO number assignment — only at Allocation step */}
              {statusId === 13 && (
                <Field label="Assign PO Number" required>
                  <StyledInput
                    value={poNo}
                    onChangeText={setPoNo}
                    placeholder="e.g. PO-2026-0042"
                    mono
                  />
                </Field>
              )}

              {/* Serving step context note */}
              {statusId === 17 && (
                <View className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4 flex-row items-center gap-2">
                  <MaterialIcons
                    name="local-shipping"
                    size={16}
                    color="#065f46"
                  />
                  <Text className="text-[12px] text-emerald-800 flex-1">
                    PARPO II has signed the PO. Serve the purchase order to
                    suppliers and photocopy signed PO + attachments for COA
                    submission.
                  </Text>
                </View>
              )}

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
                    statusId === 12
                      ? "e.g. Abstract received and reviewed. Assigning PO number."
                      : statusId === 13
                        ? "e.g. PO prepared and numbered. Forwarding to Budget for ORS."
                        : "e.g. PO served to supplier. Attachments photocopied for COA."
                  }
                  multiline
                />
              </Field>
            </ScrollView>
          )}
          <ModalFooter
            onCancel={onClose}
            onConfirm={handleSubmit}
            confirmLabel={confirmLabel}
            confirmingLabel="Processing…"
            disabled={loading || (statusId === 13 && !poNo.trim())}
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

// ─── Budget Modal (role_id = 4 · Steps 14, 15) ───────────────────────────────

function BudgetModal({
  visible,
  record,
  onClose,
  onProcessed,
}: Omit<ProcessPOModalProps, "roleId">) {
  const { currentUser } = useAuth();
  const { header, statuses, loading } = usePOFetch(visible, record, onClose);
  const [orsNo, setOrsNo] = useState("");
  const [orsDate, setOrsDate] = useState("");
  const [orsAmount, setOrsAmount] = useState("");
  const [fundsAvailable, setFundsAvailable] = useState("");
  const [remarks, setRemarks] = useState("");
  const [statusFlag, setStatusFlag] = useState<StatusFlag | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const statusId = record?.statusId ?? 14;
  const meta = ROLE_META[statusId] ?? ROLE_META[14];

  useEffect(() => {
    if (!visible) return;
    setRemarks("");
    setStatusFlag(null);
    setOrsNo("");
    setOrsDate("");
    setOrsAmount("");
    setFundsAvailable("");
  }, [visible]);

  // Pre-fill ORS fields from DB
  useEffect(() => {
    if (!header) return;
    if (header.ors_no) setOrsNo(header.ors_no);
    if (header.ors_date) setOrsDate(normalizeDateString(header.ors_date));
    if (header.ors_amount) setOrsAmount(String(header.ors_amount));
    if (header.funds_available)
      setFundsAvailable(String(header.funds_available));
  }, [header]);

  const handleSubmit = async () => {
    if (!record) return;
    setSaving(true);
    try {
      if (statusId === 14) {
        await updatePO(record.id, {
          ors_no: orsNo.trim() || null,
          ors_date: orsDate.trim() ? normalizeDateString(orsDate.trim()) : null,
          ors_amount: orsAmount.trim() ? Number(orsAmount) || 0 : null,
          funds_available: fundsAvailable.trim() || null,
        });
      }

      await insertPORemark(
        record.id,
        header?.pr_id ?? null,
        currentUser?.id ?? null,
        remarks,
        getStatusFlagId(statusFlag),
      );

      // 14 → 15 · 15 → 16
      const targetStatusId = statusId === 14 ? 15 : 16;
      await updatePOStatus(record.id, targetStatusId);
      onProcessed(record.id, targetStatusId);
      onClose();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not update PO status.");
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
        onRequestClose={onClose}
      >
        <KeyboardAvoidingView
          className="flex-1 bg-white"
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ModalHeader meta={meta} poNo={record.poNo} onClose={onClose} />
          {loading ? (
            <LoadingBody color={meta.accentColor} />
          ) : (
            <ScrollView
              className="flex-1 bg-gray-50"
              contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {header && <POSummaryCard header={header} statuses={statuses} />}

              {/* ORS Creation (14) — full ORS form */}
              {statusId === 14 && (
                <>
                  <SectionLabel>ORS Details</SectionLabel>
                  <Field label="ORS Number" required>
                    <StyledInput
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
                    <StyledInput
                      value={orsAmount}
                      onChangeText={setOrsAmount}
                      placeholder="e.g. 150000.00"
                      keyboardType="numeric"
                      mono
                    />
                  </Field>
                  <Field label="Funds Available">
                    <StyledInput
                      value={fundsAvailable}
                      onChangeText={setFundsAvailable}
                      placeholder="e.g. 150000.00"
                      mono
                    />
                  </Field>
                </>
              )}

              {/* ORS Processing (15) — forwarding note */}
              {statusId === 15 && (
                <View className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4 flex-row items-center gap-2">
                  <MaterialIcons name="send" size={16} color="#1d4ed8" />
                  <Text className="text-[12px] text-blue-800 flex-1">
                    Budget officer has signed the ORS. This will forward the
                    purchase order to Accounting for incoming check processing.
                  </Text>
                </View>
              )}

              <SectionLabel>Budget Action</SectionLabel>
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
                    statusId === 14
                      ? "e.g. ORS prepared and assigned ORS number. Forwarding for signature."
                      : "e.g. Budget officer signature obtained. Forwarding to Accounting."
                  }
                  multiline
                />
              </Field>
            </ScrollView>
          )}
          <ModalFooter
            onCancel={onClose}
            onConfirm={handleSubmit}
            confirmLabel={
              statusId === 14 ? "Finalize ORS" : "Forward to Accounting"
            }
            confirmingLabel="Saving…"
            disabled={
              loading || (statusId === 14 && (!orsNo.trim() || !orsDate.trim()))
            }
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

// ─── Admin Modal (role_id = 1 · full Phase 2 override, Steps 12–18) ──────────

function AdminModal({
  visible,
  record,
  onClose,
  onProcessed,
}: Omit<ProcessPOModalProps, "roleId">) {
  const { currentUser } = useAuth();
  const { header, statuses, loading } = usePOFetch(visible, record, onClose);

  const [poNo, setPoNo] = useState("");
  const [orsNo, setOrsNo] = useState("");
  const [orsDate, setOrsDate] = useState("");
  const [orsAmount, setOrsAmount] = useState("");
  const [fundsAvailable, setFundsAvailable] = useState("");
  const [remarks, setRemarks] = useState("");
  const [statusFlag, setStatusFlag] = useState<StatusFlag | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const currentStatus = record?.statusId ?? 12;
  const [targetStatusId, setTargetStatusId] = useState<number>(
    Math.min(currentStatus + 1, 18),
  );

  useEffect(() => {
    if (!visible || !record) return;
    setTargetStatusId(Math.min(record.statusId + 1, 18));
    setRemarks("");
    setStatusFlag(null);
    setPoNo("");
    setOrsNo("");
    setOrsDate("");
    setOrsAmount("");
    setFundsAvailable("");
  }, [visible, record]);

  useEffect(() => {
    if (!header) return;
    if (header.po_no) setPoNo(header.po_no);
    if (header.ors_no) setOrsNo(header.ors_no);
    if (header.ors_date) setOrsDate(normalizeDateString(header.ors_date));
    if (header.ors_amount) setOrsAmount(String(header.ors_amount));
    if (header.funds_available)
      setFundsAvailable(String(header.funds_available));
  }, [header]);

  const isOrsStep = currentStatus === 14;
  const isForwardingStep =
    currentStatus === 15 || currentStatus === 16 || currentStatus === 17;

  const submitDisabled =
    saving || loading || (isOrsStep && (!orsNo.trim() || !orsDate.trim()));

  const stepMeta = PHASE2_STEPS[currentStatus];
  const roleMeta = ROLE_META[currentStatus] ?? {
    step: `Step ${currentStatus - 11}`,
    title: stepMeta?.label ?? `Status ${currentStatus}`,
    accentColor: "#064E3B",
    nextStatusId: currentStatus,
  };

  const handleSubmit = useCallback(async () => {
    if (!record) return;
    setSaving(true);
    try {
      if (currentStatus === 13 && poNo.trim()) {
        await updatePO(record.id, { po_no: poNo.trim() });
      }
      if (isOrsStep) {
        await updatePO(record.id, {
          ors_no: orsNo.trim() || null,
          ors_date: orsDate.trim() ? normalizeDateString(orsDate.trim()) : null,
          ors_amount: orsAmount.trim() ? Number(orsAmount) || 0 : null,
          funds_available: fundsAvailable.trim() || null,
        });
      }
      await insertPORemark(
        record.id,
        header?.pr_id ?? null,
        currentUser?.id ?? null,
        remarks,
        getStatusFlagId(statusFlag),
      );
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
    currentStatus,
    poNo,
    isOrsStep,
    orsNo,
    orsDate,
    orsAmount,
    fundsAvailable,
    header?.pr_id,
    currentUser?.id,
    remarks,
    statusFlag,
    targetStatusId,
    onProcessed,
    onClose,
  ]);

  if (!record) return null;
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
          <ModalHeader meta={roleMeta} poNo={record.poNo} onClose={onClose} />
          {loading ? (
            <LoadingBody color={roleMeta.accentColor} />
          ) : (
            <ScrollView
              className="flex-1 bg-gray-50"
              contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {header && <POSummaryCard header={header} statuses={statuses} />}

              {/* Admin override banner */}
              <View className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex-row items-center gap-3">
                <MaterialIcons
                  name="admin-panel-settings"
                  size={20}
                  color="#92400e"
                />
                <View className="flex-1">
                  <Text className="text-[10px] font-bold uppercase tracking-widest text-amber-700 mb-0.5">
                    Admin Override · Phase 2 — Step {currentStatus - 11} of 7
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

              {/* Target status picker */}
              <SectionLabel>Target Status</SectionLabel>
              <View className="flex-row flex-wrap gap-2 mb-1">
                {([12, 13, 14, 15, 16, 17, 18] as const).map((sid) => {
                  const m = PHASE2_STEPS[sid];
                  if (!m) return null;
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
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text className="text-[10px] text-gray-400 mb-4">
                Admin can set any Phase 2 target. Grayed = already passed.
              </Text>

              {/* PO No. field — Allocation step */}
              {currentStatus === 13 && (
                <>
                  <SectionLabel>PO Details</SectionLabel>
                  <Field label="PO Number">
                    <StyledInput
                      value={poNo}
                      onChangeText={setPoNo}
                      placeholder="e.g. PO-2026-0042"
                      mono
                    />
                  </Field>
                </>
              )}

              {/* ORS fields — ORS Creation step or when target ≥ 15 */}
              {(isOrsStep || targetStatusId >= 15) && (
                <>
                  <SectionLabel>
                    ORS Details{isOrsStep ? " (required)" : " (optional)"}
                  </SectionLabel>
                  <Field label="ORS Number" required={isOrsStep}>
                    <StyledInput
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
                    <StyledInput
                      value={orsAmount}
                      onChangeText={setOrsAmount}
                      placeholder="e.g. 150000.00"
                      keyboardType="numeric"
                      mono
                    />
                  </Field>
                  <Field label="Funds Available">
                    <StyledInput
                      value={fundsAvailable}
                      onChangeText={setFundsAvailable}
                      placeholder="e.g. 150000.00"
                      mono
                    />
                  </Field>
                </>
              )}

              {/* Forwarding context note */}
              {isForwardingStep && (
                <View className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4 flex-row items-center gap-2">
                  <MaterialIcons name="send" size={16} color="#1d4ed8" />
                  <Text className="text-[12px] text-blue-800 flex-1">
                    {currentStatus === 15
                      ? "Budget officer has signed the ORS. Forwarding to Accounting for incoming check processing."
                      : currentStatus === 16
                        ? "Accounting has verified document completeness. Forwarding to PARPO II for review and signature."
                        : "PARPO II has signed the PO. Handing off to Supply for serving to suppliers."}
                  </Text>
                </View>
              )}

              <SectionLabel>Admin Remark</SectionLabel>
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
                  placeholder={`Admin override remark for ${stepMeta?.label ?? "this step"}…`}
                  multiline
                />
              </Field>
            </ScrollView>
          )}
          <ModalFooter
            onCancel={onClose}
            onConfirm={handleSubmit}
            confirmLabel={stepMeta?.action ?? "Advance"}
            confirmingLabel="Saving…"
            disabled={submitDisabled}
            saving={saving}
            color={roleMeta.accentColor}
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
  if (!rest.visible) return null;
  if (!rest.record) return null;
  if (roleId === 1) return <AdminModal {...rest} />;
  if (roleId === 4) return <BudgetModal {...rest} />;
  if (roleId === 8) return <SupplyModal {...rest} />;
  return null;
}
