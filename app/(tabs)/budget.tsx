/**
 * budget.tsx — Budget Management Screen
 *
 * Role behaviour (from DB roles table):
 *   role_id 1 (Admin)   → full edit: set allocations + manage all ORS entries
 *   role_id 4 (Budget)  → full edit: same as Admin for this module
 *   role_id 6 (End User)→ read-only: sees own division only
 *   all others          → read-only: sees all divisions (no edit)
 *
 * Sections:
 *   • Summary strip     — Total Allocated / Total Utilized / Remaining
 *   • Budget by Division— progress bars per division (editable for 1 & 4)
 *   • Recent ORS        — table of ORS entries (editable for 1 & 4)
 */

import {
  deleteOrsEntry,
  fetchBudgets,
  fetchOrsEntries,
  generateOrsNumber,
  insertDivisionBudget,
  insertOrsEntry,
  supabase,
  updateDivisionBudget,
  updateOrsEntry,
  type DivisionBudgetRow,
  type OrsEntryRow
} from "@/lib/supabase";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal,
  Platform, RefreshControl, ScrollView, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { useAuth } from "../AuthContext";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const CURRENT_YEAR = new Date().getFullYear();
// 5 years back → 1 year ahead so Budget can plan forward
const YEAR_RANGE = Array.from({ length: 7 }, (_, i) => CURRENT_YEAR - 5 + i);

const fmt = (n: number) =>
  n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtDec = (n: number) =>
  n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Roles that may write to this module */
const EDIT_ROLES = new Set([1, 4]); // Admin, Budget
/** Role that sees only their own division */
const ENDUSER_ROLE = 6;

const ORS_STATUS_META: Record<OrsEntryRow["status"], { bg: string; text: string; dot: string }> = {
  Pending:    { bg: "bg-amber-50",   text: "text-amber-800",   dot: "#f59e0b" },
  Processing: { bg: "bg-blue-50",    text: "text-blue-800",    dot: "#3b82f6" },
  Approved:   { bg: "bg-emerald-50", text: "text-emerald-800", dot: "#10b981" },
  Rejected:   { bg: "bg-red-50",     text: "text-red-800",     dot: "#ef4444" },
};

// ─── Inlined atoms (NativeWind className) ─────────────────────────────────────

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <View
    className={`bg-white rounded-3xl border border-gray-200 mb-3 overflow-hidden ${className ?? ""}`}
    style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.07, shadowRadius: 6, elevation: 3 }}>
    {children}
  </View>
);

const Divider = ({ label }: { label: string }) => (
  <View className="flex-row items-center gap-2 mb-2.5 mt-1">
    <Text className="text-[9.5px] font-bold tracking-widest uppercase text-gray-400">{label}</Text>
    <View className="flex-1 h-px bg-gray-200" />
  </View>
);

const Btn = ({
  label, onPress, disabled, ghost, danger, icon,
}: {
  label: string; onPress: () => void;
  disabled?: boolean; ghost?: boolean; danger?: boolean;
  icon?: keyof typeof MaterialIcons.glyphMap;
}) => (
  <TouchableOpacity
    onPress={onPress} disabled={disabled} activeOpacity={0.8}
    className={`flex-row items-center gap-1.5 px-4 py-2.5 rounded-xl ${
      disabled ? "bg-gray-200" :
      danger   ? "bg-red-50 border border-red-200" :
      ghost    ? "bg-transparent border border-gray-200" :
      "bg-[#064E3B]"
    }`}>
    {icon && (
      <MaterialIcons name={icon} size={14}
        color={disabled ? "#9ca3af" : danger ? "#dc2626" : ghost ? "#6b7280" : "#fff"} />
    )}
    <Text className={`text-[12.5px] font-bold ${
      disabled ? "text-gray-400" :
      danger   ? "text-red-600" :
      ghost    ? "text-gray-500" : "text-white"
    }`}>{label}</Text>
  </TouchableOpacity>
);

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ allocated, utilized }: { allocated: number; utilized: number }) {
  const pct = allocated > 0 ? Math.min((utilized / allocated) * 100, 100) : 0;
  const color = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#10b981";
  return (
    <View className="h-2 bg-gray-100 rounded-full overflow-hidden mt-1.5">
      <View className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
    </View>
  );
}

// ─── ORS status pill ──────────────────────────────────────────────────────────

function OrsStatusPill({ status }: { status: OrsEntryRow["status"] }) {
  const m = ORS_STATUS_META[status];
  return (
    <View className={`flex-row items-center gap-1 px-2 py-0.5 rounded-full ${m.bg}`}>
      <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.dot }} />
      <Text className={`text-[10px] font-bold ${m.text}`}>{status}</Text>
    </View>
  );
}

// ─── Year picker modal ────────────────────────────────────────────────────────

function YearPickerModal({
  visible, selected, onSelect, onClose,
}: {
  visible: boolean; selected: number;
  onSelect: (y: number) => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        className="flex-1 justify-center items-center bg-black/50"
        activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1}>
          <View className="bg-white rounded-3xl overflow-hidden"
            style={{ width: 220, shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.18, shadowRadius: 16, elevation: 12 }}>

            {/* Header */}
            <View className="bg-[#064E3B] px-4 py-3">
              <Text className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-0.5">
                Fiscal Year
              </Text>
              <Text className="text-[16px] font-extrabold text-white">
                Select Year
              </Text>
            </View>

            {/* Year list */}
            {YEAR_RANGE.map((y) => {
              const isSelected = y === selected;
              const isFuture   = y > CURRENT_YEAR;
              return (
                <TouchableOpacity
                  key={y}
                  onPress={() => { onSelect(y); onClose(); }}
                  activeOpacity={0.7}
                  className={`flex-row items-center justify-between px-4 py-3 ${
                    isSelected ? "bg-emerald-50" : ""
                  }`}
                  style={{ borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}>
                  <View className="flex-row items-center gap-2">
                    {isSelected
                      ? <View className="w-1.5 h-5 rounded-full bg-[#10b981]" />
                      : <View className="w-1.5 h-5" />
                    }
                    <Text className={`text-[14px] font-bold ${
                      isSelected ? "text-[#064E3B]" : isFuture ? "text-gray-400" : "text-gray-800"
                    }`} style={{ fontFamily: MONO }}>
                      FY {y}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    {isFuture && (
                      <View className="bg-amber-100 px-1.5 py-0.5 rounded-md">
                        <Text className="text-[9px] font-bold text-amber-700">Planning</Text>
                      </View>
                    )}
                    {y === CURRENT_YEAR && (
                      <View className="bg-emerald-100 px-1.5 py-0.5 rounded-md">
                        <Text className="text-[9px] font-bold text-emerald-700">Current</Text>
                      </View>
                    )}
                    {isSelected && (
                      <MaterialIcons name="check" size={14} color="#10b981" />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}

          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Allocation edit modal ────────────────────────────────────────────────────

function AllocModal({
  row, onClose, onSave,
}: {
  row: DivisionBudgetRow;
  onClose: () => void;
  onSave: (id: string, year: number, amount: number, notes: string) => Promise<void>;
}) {
  const [amount,       setAmount]       = useState(String(row.allocated));
  const [notes,        setNotes]        = useState(row.notes ?? "");
  const [selectedYear, setSelectedYear] = useState(row.fiscal_year);
  const [yearOpen,     setYearOpen]     = useState(false);
  const [saving,       setSaving]       = useState(false);

  const handleSave = async () => {
    const parsed = parseFloat(amount.replace(/,/g, ""));
    if (isNaN(parsed) || parsed < 0) {
      Alert.alert("Invalid amount", "Enter a valid positive number.");
      return;
    }
    setSaving(true);
    try {
      await onSave(row.id, selectedYear, parsed, notes);
      onClose();
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? "Could not update allocation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal visible transparent animationType="slide" onRequestClose={onClose}>
        <TouchableOpacity className="flex-1 bg-black/50" activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View className="bg-white rounded-t-3xl px-5 pt-4 pb-8">
            {/* Handle */}
            <View className="w-10 h-1 rounded-full bg-gray-300 self-center mb-4" />
            <Text className="text-[17px] font-extrabold text-[#1a4d2e] mb-0.5">
              Edit Allocation
            </Text>
            <Text className="text-[12px] text-gray-400 mb-4">
              {row.division_name}
            </Text>

            {/* Fiscal Year picker */}
            <Text className="text-[12px] font-semibold text-gray-700 mb-1">
              Fiscal Year <Text className="text-red-500">*</Text>
            </Text>
            <TouchableOpacity
              onPress={() => setYearOpen(true)}
              activeOpacity={0.8}
              className="flex-row items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5 mb-3"
              style={{ borderWidth: 1.5, borderColor: "#e5e7eb" }}>
              <View className="flex-row items-center gap-2">
                <MaterialIcons name="calendar-today" size={15} color="#6b7280" />
                <Text className="text-[14px] font-bold text-gray-900" style={{ fontFamily: MONO }}>
                  FY {selectedYear}
                </Text>
                {selectedYear === CURRENT_YEAR && (
                  <View className="bg-emerald-100 px-1.5 py-0.5 rounded-md">
                    <Text className="text-[9px] font-bold text-emerald-700">Current</Text>
                  </View>
                )}
                {selectedYear > CURRENT_YEAR && (
                  <View className="bg-amber-100 px-1.5 py-0.5 rounded-md">
                    <Text className="text-[9px] font-bold text-amber-700">Planning</Text>
                  </View>
                )}
              </View>
              <MaterialIcons name="keyboard-arrow-down" size={18} color="#6b7280" />
            </TouchableOpacity>

            {/* Allocated amount */}
            <Text className="text-[12px] font-semibold text-gray-700 mb-1">
              Allocated Budget (₱) <Text className="text-red-500">*</Text>
            </Text>
            <TextInput
              value={amount} onChangeText={setAmount}
              keyboardType="decimal-pad" placeholder="e.g. 2500000"
              placeholderTextColor="#9ca3af"
              className="bg-gray-50 rounded-xl px-3 py-2.5 text-[14px] text-gray-900 mb-3"
              style={{ borderWidth: 1.5, borderColor: "#e5e7eb", fontFamily: MONO }}
            />

            {/* Notes */}
            <Text className="text-[12px] font-semibold text-gray-700 mb-1">Notes</Text>
            <TextInput
              value={notes} onChangeText={setNotes}
              placeholder="e.g. Annual Procurement Plan 2026"
              placeholderTextColor="#9ca3af" multiline numberOfLines={2}
              className="bg-gray-50 rounded-xl px-3 py-2.5 text-[13px] text-gray-900 mb-5"
              style={{ borderWidth: 1.5, borderColor: "#e5e7eb", minHeight: 60, textAlignVertical: "top" }}
            />

            <View className="flex-row gap-2.5 justify-end">
              <Btn ghost label="Cancel" onPress={onClose} />
              <Btn label={saving ? "Saving…" : "Save Allocation"}
                disabled={saving} onPress={handleSave} icon="save" />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Nested year picker — renders above the sheet */}
      <YearPickerModal
        visible={yearOpen}
        selected={selectedYear}
        onSelect={setSelectedYear}
        onClose={() => setYearOpen(false)}
      />
    </>
  );
}

// ─── Create allocation modal (new division+year record) ───────────────────────

interface DivisionOption { division_id: number; division_name: string | null; }

function CreateAllocModal({
  defaultYear, onClose, onSave,
}: {
  defaultYear: number;
  onClose: () => void;
  onSave: (divId: number, year: number, amount: number, notes: string) => Promise<void>;
}) {
  const [divisions,    setDivisions]    = useState<DivisionOption[]>([]);
  const [divLoading,   setDivLoading]   = useState(true);
  const [selectedDiv,  setSelectedDiv]  = useState<DivisionOption | null>(null);
  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [yearOpen,     setYearOpen]     = useState(false);
  const [amount,       setAmount]       = useState("");
  const [notes,        setNotes]        = useState("");
  const [saving,       setSaving]       = useState(false);

  // Fetch all divisions once on mount
  useEffect(() => {
    supabase
      .from("divisions")
      .select("division_id, division_name")
      .order("division_name")
      .then(({ data, error }) => {
        if (!error && data) setDivisions(data as DivisionOption[]);
      })
      .then(() => setDivLoading(false));
  }, []);

  const handleSave = async () => {
    if (!selectedDiv) { Alert.alert("Required", "Select a division."); return; }
    const parsed = parseFloat(amount.replace(/,/g, ""));
    if (isNaN(parsed) || parsed < 0) {
      Alert.alert("Invalid amount", "Enter a valid positive number.");
      return;
    }
    setSaving(true);
    try {
      await onSave(selectedDiv.division_id, selectedYear, parsed, notes);
      onClose();
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? "Could not create allocation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal visible transparent animationType="slide" onRequestClose={onClose}>
        <TouchableOpacity className="flex-1 bg-black/50" activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView
            className="bg-white rounded-t-3xl"
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled">

            {/* Handle + title */}
            <View className="w-10 h-1 rounded-full bg-gray-300 self-center mb-4" />
            <View className="flex-row items-center gap-2 mb-1">
              <View className="w-7 h-7 rounded-full bg-emerald-100 items-center justify-center">
                <MaterialIcons name="account-balance-wallet" size={14} color="#064E3B" />
              </View>
              <Text className="text-[17px] font-extrabold text-[#1a4d2e]">
                New Budget Allocation
              </Text>
            </View>
            <Text className="text-[12px] text-gray-400 mb-5">
              Set a budget allocation for a division and fiscal year.
            </Text>

            {/* ── Division picker ── */}
            <Text className="text-[12px] font-semibold text-gray-700 mb-1.5">
              Division <Text className="text-red-500">*</Text>
            </Text>
            {divLoading ? (
              <View className="items-center py-4">
                <ActivityIndicator size="small" color="#064E3B" />
              </View>
            ) : (
              <View className="flex-row flex-wrap gap-2 mb-4">
                {divisions.map(d => {
                  const active = selectedDiv?.division_id === d.division_id;
                  return (
                    <TouchableOpacity
                      key={d.division_id}
                      onPress={() => setSelectedDiv(d)}
                      activeOpacity={0.8}
                      className={`px-3 py-1.5 rounded-xl border ${
                        active
                          ? "bg-[#064E3B] border-[#064E3B]"
                          : "bg-white border-gray-200"
                      }`}>
                      <Text className={`text-[12px] font-bold ${
                        active ? "text-white" : "text-gray-600"
                      }`}>
                        {d.division_name ?? `Div ${d.division_id}`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* ── Fiscal Year picker ── */}
            <Text className="text-[12px] font-semibold text-gray-700 mb-1">
              Fiscal Year <Text className="text-red-500">*</Text>
            </Text>
            <TouchableOpacity
              onPress={() => setYearOpen(true)}
              activeOpacity={0.8}
              className="flex-row items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5 mb-4"
              style={{ borderWidth: 1.5, borderColor: "#e5e7eb" }}>
              <View className="flex-row items-center gap-2">
                <MaterialIcons name="calendar-today" size={15} color="#6b7280" />
                <Text className="text-[14px] font-bold text-gray-900" style={{ fontFamily: MONO }}>
                  FY {selectedYear}
                </Text>
                {selectedYear === CURRENT_YEAR && (
                  <View className="bg-emerald-100 px-1.5 py-0.5 rounded-md">
                    <Text className="text-[9px] font-bold text-emerald-700">Current</Text>
                  </View>
                )}
                {selectedYear > CURRENT_YEAR && (
                  <View className="bg-amber-100 px-1.5 py-0.5 rounded-md">
                    <Text className="text-[9px] font-bold text-amber-700">Planning</Text>
                  </View>
                )}
              </View>
              <MaterialIcons name="keyboard-arrow-down" size={18} color="#6b7280" />
            </TouchableOpacity>

            {/* ── Allocated amount ── */}
            <Text className="text-[12px] font-semibold text-gray-700 mb-1">
              Allocated Budget (₱) <Text className="text-red-500">*</Text>
            </Text>
            <TextInput
              value={amount} onChangeText={setAmount}
              keyboardType="decimal-pad" placeholder="e.g. 2500000"
              placeholderTextColor="#9ca3af"
              className="bg-gray-50 rounded-xl px-3 py-2.5 text-[14px] text-gray-900 mb-4"
              style={{ borderWidth: 1.5, borderColor: "#e5e7eb", fontFamily: MONO }}
            />

            {/* ── Notes ── */}
            <Text className="text-[12px] font-semibold text-gray-700 mb-1">Notes</Text>
            <TextInput
              value={notes} onChangeText={setNotes}
              placeholder="e.g. Annual Procurement Plan 2026"
              placeholderTextColor="#9ca3af" multiline numberOfLines={2}
              className="bg-gray-50 rounded-xl px-3 py-2.5 text-[13px] text-gray-900 mb-6"
              style={{ borderWidth: 1.5, borderColor: "#e5e7eb",
                minHeight: 60, textAlignVertical: "top" }}
            />

            <View className="flex-row gap-2.5 justify-end">
              <Btn ghost label="Cancel" onPress={onClose} />
              <Btn
                label={saving ? "Saving…" : "Create Allocation"}
                disabled={saving || !selectedDiv || !amount.trim()}
                onPress={handleSave}
                icon="add"
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Year picker rendered as sibling to avoid Android nested Modal issue */}
      <YearPickerModal
        visible={yearOpen}
        selected={selectedYear}
        onSelect={setSelectedYear}
        onClose={() => setYearOpen(false)}
      />
    </>
  );
}

// ─── ORS entry modal (add / edit) ─────────────────────────────────────────────

interface OrsForm {
  ors_no: string; pr_no: string; amount: string;
  status: OrsEntryRow["status"]; notes: string; division_id: string;
}

function OrsModal({
  initial, divisions, onClose, onSave,
}: {
  initial?: OrsEntryRow | null;
  divisions: DivisionBudgetRow[];
  onClose: () => void;
  onSave: (form: OrsForm, existing?: OrsEntryRow) => Promise<void>;
}) {
  const [form, setForm] = useState<OrsForm>({
    ors_no:      initial?.ors_no    ?? "",
    pr_no:       initial?.pr_no     ?? "",
    amount:      initial?.amount    != null ? String(initial.amount) : "",
    status:      initial?.status    ?? "Pending",
    notes:       initial?.notes     ?? "",
    division_id: initial?.division_id != null ? String(initial.division_id) : "",
  });
  const [saving, setSaving] = useState(false);
  const isEdit = !!initial;

  const set = (k: keyof OrsForm) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.ors_no.trim()) { Alert.alert("Required", "ORS No. is required."); return; }
    const parsed = parseFloat(form.amount.replace(/,/g, ""));
    if (isNaN(parsed) || parsed < 0) {
      Alert.alert("Invalid amount", "Enter a valid amount.");
      return;
    }
    setSaving(true);
    try {
      await onSave(form, initial ?? undefined);
      onClose();
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? "Could not save ORS entry");
    } finally {
      setSaving(false);
    }
  };

  const statusOptions: OrsEntryRow["status"][] = ["Pending","Processing","Approved","Rejected"];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity className="flex-1 bg-black/50" activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView className="bg-white rounded-t-3xl"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled">

          <View className="w-10 h-1 rounded-full bg-gray-300 self-center mb-4" />
          <Text className="text-[17px] font-extrabold text-[#1a4d2e] mb-4">
            {isEdit ? "Edit ORS Entry" : "New ORS Entry"}
          </Text>

          {/* ORS No. */}
          <Text className="text-[12px] font-semibold text-gray-700 mb-1">
            ORS No. <Text className="text-red-500">*</Text>
          </Text>
          <TextInput value={form.ors_no} onChangeText={set("ors_no")}
            placeholder="ORS-2026-0001" placeholderTextColor="#9ca3af"
            className="bg-gray-50 rounded-xl px-3 py-2.5 text-[13px] text-gray-900 mb-3"
            style={{ borderWidth: 1.5, borderColor: "#e5e7eb", fontFamily: MONO }} />

          {/* PR No. */}
          <Text className="text-[12px] font-semibold text-gray-700 mb-1">PR No.</Text>
          <TextInput value={form.pr_no} onChangeText={set("pr_no")}
            placeholder="2026-PR-0001" placeholderTextColor="#9ca3af"
            className="bg-gray-50 rounded-xl px-3 py-2.5 text-[13px] text-gray-900 mb-3"
            style={{ borderWidth: 1.5, borderColor: "#e5e7eb", fontFamily: MONO }} />

          {/* Amount */}
          <Text className="text-[12px] font-semibold text-gray-700 mb-1">
            Amount (₱) <Text className="text-red-500">*</Text>
          </Text>
          <TextInput value={form.amount} onChangeText={set("amount")}
            keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#9ca3af"
            className="bg-gray-50 rounded-xl px-3 py-2.5 text-[13px] text-gray-900 mb-3"
            style={{ borderWidth: 1.5, borderColor: "#e5e7eb", fontFamily: MONO }} />

          {/* Division picker */}
          <Text className="text-[12px] font-semibold text-gray-700 mb-1.5">Division</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            className="mb-3" contentContainerStyle={{ gap: 6 }}>
            {divisions.map(d => (
              <TouchableOpacity key={d.division_id}
                onPress={() => set("division_id")(String(d.division_id))}
                activeOpacity={0.8}
                className={`px-3 py-1.5 rounded-xl border ${
                  form.division_id === String(d.division_id)
                    ? "bg-[#064E3B] border-[#064E3B]"
                    : "bg-white border-gray-200"
                }`}>
                <Text className={`text-[12px] font-bold ${
                  form.division_id === String(d.division_id) ? "text-white" : "text-gray-600"
                }`}>{d.division_name ?? `Div ${d.division_id}`}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Status picker */}
          <Text className="text-[12px] font-semibold text-gray-700 mb-1.5">Status</Text>
          <View className="flex-row flex-wrap gap-2 mb-3">
            {statusOptions.map(s => {
              const m = ORS_STATUS_META[s];
              const active = form.status === s;
              return (
                <TouchableOpacity key={s} onPress={() => set("status")(s)} activeOpacity={0.8}
                  className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-xl border ${
                    active ? `${m.bg} border-transparent` : "bg-white border-gray-200"
                  }`}>
                  <View className="w-2 h-2 rounded-full" style={{ backgroundColor: m.dot }} />
                  <Text className={`text-[12px] font-bold ${active ? m.text : "text-gray-500"}`}>
                    {s}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Notes */}
          <Text className="text-[12px] font-semibold text-gray-700 mb-1">Notes</Text>
          <TextInput value={form.notes} onChangeText={set("notes")}
            placeholder="Optional remarks…" placeholderTextColor="#9ca3af"
            multiline numberOfLines={2}
            className="bg-gray-50 rounded-xl px-3 py-2.5 text-[13px] text-gray-900 mb-5"
            style={{ borderWidth: 1.5, borderColor: "#e5e7eb",
              minHeight: 56, textAlignVertical: "top" }} />

          <View className="flex-row gap-2.5 justify-end">
            <Btn ghost label="Cancel" onPress={onClose} />
            <Btn label={saving ? "Saving…" : isEdit ? "Save Changes" : "Add ORS Entry"}
              disabled={saving} onPress={handleSave} icon={isEdit ? "save" : "add"} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function BudgetScreen() {
  const { currentUser } = useAuth();
  const roleId     = currentUser?.role_id     ?? 0;
  const divisionId = currentUser?.division_id ?? null;
  const canEdit    = EDIT_ROLES.has(roleId);
  const isEndUser  = roleId === ENDUSER_ROLE;

  const [year,         setYear]         = useState(CURRENT_YEAR);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [budgets,      setBudgets]      = useState<DivisionBudgetRow[]>([]);
  const [orsEntries,   setOrsEntries]   = useState<OrsEntryRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [editBudget,   setEditBudget]   = useState<DivisionBudgetRow | null>(null);
  const [createAllocOpen, setCreateAllocOpen] = useState(false);
  const [editOrs,      setEditOrs]      = useState<OrsEntryRow | null | undefined>(undefined);
  // undefined = modal closed, null = new entry, OrsEntryRow = editing existing

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [b, o] = await Promise.all([
        fetchBudgets(year),
        // End users only see their own division's ORS
        fetchOrsEntries(year, isEndUser && divisionId ? divisionId : undefined),
      ]);
      // End users only see their own division's budget row
      setBudgets(isEndUser && divisionId
        ? b.filter(r => r.division_id === divisionId)
        : b);
      setOrsEntries(o);
    } catch (e: any) {
      Alert.alert("Load error", e?.message ?? "Could not fetch budget data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [year, isEndUser, divisionId]);

  useEffect(() => { load(); }, [load]);

  // ── Derived totals ────────────────────────────────────────────────────────

  const totalAllocated = budgets.reduce((s, r) => s + r.allocated, 0);
  const totalUtilized  = budgets.reduce((s, r) => s + r.utilized,  0);
  const totalRemaining = totalAllocated - totalUtilized;
  const utilizationPct = totalAllocated > 0
    ? Math.round((totalUtilized / totalAllocated) * 100) : 0;

  // ── Handlers ──────────────────────────────────────────────────────────────

  /** Called by AllocModal (edit) — routes to UPDATE by primary key. */
  const handleUpdateAllocation = async (
    id: string, yr: number, amount: number, notes: string
  ) => {
    await updateDivisionBudget(id, yr, amount, notes);
    await load(true);
  };

  /** Called by CreateAllocModal (new) — routes to INSERT. */
  const handleInsertAllocation = async (
    divId: number, yr: number, amount: number, notes: string
  ) => {
    await insertDivisionBudget(divId, yr, amount, notes);
    await load(true);
  };

  const handleSaveOrs = async (form: OrsForm, existing?: OrsEntryRow) => {
    const amount = parseFloat(form.amount.replace(/,/g, ""));
    const divId  = form.division_id ? parseInt(form.division_id) : null;
    if (existing) {
      await updateOrsEntry(existing.id, {
        ors_no: form.ors_no.trim(),
        pr_no:  form.pr_no.trim() || null,
        amount,
        status: form.status,
        notes:  form.notes.trim() || null,
      } as any);
    } else {
      const autoNo = form.ors_no.trim() || await generateOrsNumber();
      await insertOrsEntry({
        ors_no:      autoNo,
        pr_id:       null,
        pr_no:       form.pr_no.trim() || null,
        division_id: divId,
        fiscal_year: year,
        amount,
        status:      form.status,
        prepared_by: currentUser?.id ?? null,
        approved_by: null,
        notes:       form.notes.trim() || null,
      });
    }
    await load(true);
  };

  const handleDeleteOrs = (entry: OrsEntryRow) => {
    Alert.alert(
      "Delete ORS Entry",
      `Remove ${entry.ors_no}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            try {
              await deleteOrsEntry(entry.id);
              await load(true);
            } catch (e: any) {
              Alert.alert("Delete failed", e?.message);
            }
          },
        },
      ]
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#064E3B" />
        <Text className="text-[13px] text-gray-400 mt-3">Loading budget data…</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">

      {/* ── Page header ── */}
      <View className="bg-[#064E3B] px-4 pt-3.5 pb-4">
        <View className="flex-row items-start justify-between">
          <View>
            <Text className="text-[9.5px] font-semibold tracking-widest uppercase text-white/40">
              DAR · Procurement
            </Text>
            <Text className="text-[20px] font-extrabold text-white">Budget Management</Text>
            <Text className="text-[12px] text-white/50 mt-0.5">
              Monitor allocation and utilization across divisions
            </Text>
          </View>
          {/* Year selector — dropdown */}
          <TouchableOpacity
            onPress={() => setYearPickerOpen(true)}
            activeOpacity={0.8}
            className="flex-row items-center gap-1.5 bg-white/10 rounded-xl px-3 py-2 mt-1"
            style={{ borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" }}>
            <Text className="text-[13px] font-bold text-white" style={{ fontFamily: MONO }}>
              FY {year}
            </Text>
            <MaterialIcons name="keyboard-arrow-down" size={16} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>

        {/* Role badge */}
        <View className={`self-start mt-2.5 px-2.5 py-1 rounded-lg ${
          canEdit ? "bg-emerald-700" : "bg-white/10"
        }`}>
          <Text className="text-[10px] font-bold text-white/80 uppercase tracking-wide">
            {canEdit ? "✏️ Edit Access" : "👁 Read-Only"}
          </Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true); }}
            tintColor="#064E3B" />
        }>

        {/* ── Summary strip ── */}
        <View className="flex-row gap-2.5 mb-3">
          {/* Allocated */}
          <View className="flex-1 bg-white rounded-2xl p-3.5 border border-gray-200"
            style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }}>
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
              Total Allocated
            </Text>
            <Text className="text-[17px] font-extrabold text-[#064E3B]" style={{ fontFamily: MONO }}>
              ₱{fmt(totalAllocated)}
            </Text>
            <Text className="text-[10px] text-gray-400 mt-1">
              Annual Procurement Plan {year}
            </Text>
          </View>

          {/* Utilized */}
          <View className="flex-1 bg-white rounded-2xl p-3.5 border border-gray-200"
            style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }}>
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
              Total Utilized
            </Text>
            <Text className="text-[17px] font-extrabold text-[#10b981]" style={{ fontFamily: MONO }}>
              ₱{fmt(totalUtilized)}
            </Text>
            <View className="h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
              <View className="h-full rounded-full bg-[#10b981]"
                style={{ width: `${utilizationPct}%` }} />
            </View>
            <Text className="text-[10px] text-gray-400 mt-1">
              {utilizationPct}% of total budget
            </Text>
          </View>

          {/* Remaining */}
          <View className="flex-1 bg-white rounded-2xl p-3.5 border border-gray-200"
            style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }}>
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
              Remaining
            </Text>
            <Text className={`text-[17px] font-extrabold ${
              totalRemaining < 0 ? "text-red-500" : "text-amber-500"
            }`} style={{ fontFamily: MONO }}>
              ₱{fmt(Math.abs(totalRemaining))}
            </Text>
            <Text className="text-[10px] text-gray-400 mt-1">Available for procurement</Text>
          </View>
        </View>

        {/* ── Budget by Division ── */}
        <Card>
          <View className="px-4 pt-3.5 pb-3">
            <View className="flex-row items-center justify-between mb-1">
              <View>
                <Text className="text-[15px] font-extrabold text-[#1a4d2e]">Budget by Division</Text>
                <Text className="text-[11px] text-gray-400">Allocation and utilization breakdown</Text>
              </View>
              {canEdit && (
                <View className="flex-row items-center gap-2">
                  <View className="bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                    <Text className="text-[10px] font-bold text-emerald-700">Tap row to edit</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setCreateAllocOpen(true)}
                    activeOpacity={0.8}
                    className="flex-row items-center gap-1 bg-[#064E3B] px-3 py-1.5 rounded-xl">
                    <MaterialIcons name="add" size={14} color="#fff" />
                    <Text className="text-[11.5px] font-bold text-white">Add</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View className="h-px bg-gray-100 my-2.5" />

            {budgets.length === 0 ? (
              <View className="items-center py-6 gap-2">
                <Text className="text-[13px] text-gray-400 text-center">
                  No budget data for FY {year}.
                </Text>
                {canEdit && (
                  <TouchableOpacity
                    onPress={() => setCreateAllocOpen(true)}
                    activeOpacity={0.8}
                    className="flex-row items-center gap-1.5 bg-[#064E3B] px-4 py-2 rounded-xl mt-1">
                    <MaterialIcons name="add" size={14} color="#fff" />
                    <Text className="text-[12px] font-bold text-white">Create First Allocation</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              budgets.map((row, i) => {
                const pct = row.allocated > 0
                  ? Math.min(Math.round((row.utilized / row.allocated) * 100), 100) : 0;
                const barColor = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#10b981";
                const remaining = row.allocated - row.utilized;
                return (
                  <TouchableOpacity
                    key={row.id}
                    onPress={() => canEdit ? setEditBudget(row) : null}
                    activeOpacity={canEdit ? 0.7 : 1}
                    className={`mb-3 pb-3 ${i < budgets.length - 1 ? "border-b border-gray-100" : ""}`}>
                    <View className="flex-row items-center justify-between mb-0.5">
                      <View className="flex-row items-center gap-2">
                        <View className="bg-emerald-100 px-2 py-0.5 rounded-md">
                          <Text className="text-[10.5px] font-bold text-emerald-800">
                            {row.division_name ?? `Div ${row.division_id}`}
                          </Text>
                        </View>
                        {canEdit && (
                          <MaterialIcons name="edit" size={12} color="#9ca3af" />
                        )}
                      </View>
                      <Text className="text-[11.5px] font-semibold text-gray-600"
                        style={{ fontFamily: MONO }}>
                        ₱{fmt(row.utilized)} / {fmt(row.allocated)}
                      </Text>
                    </View>

                    <ProgressBar allocated={row.allocated} utilized={row.utilized} />

                    <View className="flex-row justify-between mt-1">
                      <Text className="text-[10px] text-gray-400">
                        {pct}% utilized
                      </Text>
                      <Text className={`text-[10px] font-semibold ${
                        remaining < 0 ? "text-red-500" : "text-gray-400"
                      }`}>
                        {remaining < 0 ? "Over by " : "Remaining: "}
                        ₱{fmt(Math.abs(remaining))}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </Card>

        {/* ── Recent ORS Processing ── */}
        <Card>
          <View className="px-4 pt-3.5 pb-3">
            <View className="flex-row items-center justify-between mb-2">
              <View>
                <Text className="text-[15px] font-extrabold text-[#1a4d2e]">
                  {isEndUser ? "My Division's ORS" : "Recent ORS Processing"}
                </Text>
                <Text className="text-[11px] text-gray-400">Obligation Request and Status</Text>
              </View>
              {canEdit && (
                <TouchableOpacity
                  onPress={() => setEditOrs(null)}
                  activeOpacity={0.8}
                  className="flex-row items-center gap-1 bg-[#064E3B] px-3 py-1.5 rounded-xl">
                  <MaterialIcons name="add" size={14} color="#fff" />
                  <Text className="text-[11.5px] font-bold text-white">Add ORS</Text>
                </TouchableOpacity>
              )}
            </View>

            {orsEntries.length === 0 ? (
              <Text className="text-[13px] text-gray-400 text-center py-4">
                No ORS entries for FY {year}.
              </Text>
            ) : (
              <>
                {/* Table header */}
                <View className="flex-row bg-[#064E3B] rounded-xl px-3 py-1.5 mb-1">
                  <Text className="w-28 text-[9.5px] font-bold uppercase text-white/70">ORS No.</Text>
                  <Text className="w-28 text-[9.5px] font-bold uppercase text-white/70">PR No.</Text>
                  <Text className="flex-1 text-[9.5px] font-bold uppercase text-white/70 text-right">Amount</Text>
                  <Text className="w-24 text-[9.5px] font-bold uppercase text-white/70 text-right">Status</Text>
                  {canEdit && <Text className="w-10" />}
                </View>

                {orsEntries.map((entry, i) => (
                  <TouchableOpacity
                    key={entry.id}
                    onPress={() => canEdit ? setEditOrs(entry) : null}
                    activeOpacity={canEdit ? 0.7 : 1}
                    className={`flex-row items-center px-3 py-2.5 rounded-xl ${
                      i % 2 === 0 ? "bg-white" : "bg-gray-50"
                    }`}
                    style={{ borderWidth: 1, borderColor: "#f3f4f6" }}>
                    <Text className="w-28 text-[11.5px] font-semibold text-[#1a4d2e]"
                      style={{ fontFamily: MONO }} numberOfLines={1}>
                      {entry.ors_no}
                    </Text>
                    <Text className="w-28 text-[11.5px] text-gray-500"
                      style={{ fontFamily: MONO }} numberOfLines={1}>
                      {entry.pr_no ?? "—"}
                    </Text>
                    <Text className="flex-1 text-[11.5px] font-semibold text-gray-800 text-right"
                      style={{ fontFamily: MONO }}>
                      ₱{fmt(entry.amount)}
                    </Text>
                    <View className="w-24 items-end">
                      <OrsStatusPill status={entry.status} />
                    </View>
                    {canEdit && (
                      <TouchableOpacity
                        onPress={() => handleDeleteOrs(entry)}
                        hitSlop={8} className="w-10 items-center">
                        <MaterialIcons name="delete-outline" size={16} color="#ef4444" />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
        </Card>

        {/* ── Read-only notice for non-edit roles ── */}
        {!canEdit && (
          <View className="flex-row items-center gap-2.5 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
            <MaterialIcons name="info" size={16} color="#1d4ed8" />
            <Text className="flex-1 text-[12px] text-blue-800 leading-5">
              {isEndUser
                ? "You are viewing your division's budget summary. Contact the Budget office to request changes."
                : "You have read-only access to the budget module."}
            </Text>
          </View>
        )}

      </ScrollView>

      {/* ── Year picker modal ── */}
      <YearPickerModal
        visible={yearPickerOpen}
        selected={year}
        onSelect={setYear}
        onClose={() => setYearPickerOpen(false)}
      />

      {/* ── Allocation edit modal ── */}
      {canEdit && editBudget && (
        <AllocModal
          row={editBudget}
          onClose={() => setEditBudget(null)}
          onSave={handleUpdateAllocation}
        />
      )}

      {/* ── Create new allocation modal ── */}
      {canEdit && createAllocOpen && (
        <CreateAllocModal
          defaultYear={year}
          onClose={() => setCreateAllocOpen(false)}
          onSave={handleInsertAllocation}
        />
      )}

      {/* ── ORS add / edit modal ── */}
      {canEdit && editOrs !== undefined && (
        <OrsModal
          initial={editOrs}
          divisions={budgets}
          onClose={() => setEditOrs(undefined)}
          onSave={handleSaveOrs}
        />
      )}
    </View>
  );
}