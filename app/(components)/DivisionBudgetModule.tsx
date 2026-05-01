/**
 * DivisionBudgetModule.tsx — Division Budget Allocation sub-module
 *
 * Extracted from budget.tsx. Owns everything related to per-division
 * budget allocation: the progress-bar list, AllocModal (edit),
 * CreateAllocModal (new), and the shared YearPickerModal.
 *
 * Exports:
 *   YearPickerModal      — reused by both this module and ORSModule
 *   DivisionBudgetSection — full "Budget by Division" card + modals,
 *                           drop-in replacement for that card in budget.tsx
 *
 * Props for DivisionBudgetSection:
 *   budgets       DivisionBudgetRow[]
 *   year          number
 *   canEdit       boolean
 *   onUpdate      (id, year, amount, notes) => Promise<void>
 *   onInsert      (divId, year, amount, notes) => Promise<void>
 */

import {
  supabase,
  type DivisionBudgetRow,
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

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_RANGE = Array.from({ length: 7 }, (_, i) => CURRENT_YEAR - 5 + i);

// ─── Shared atoms ─────────────────────────────────────────────────────────────

const Btn = ({
  label, onPress, disabled, ghost, icon,
}: {
  label: string; onPress: () => void;
  disabled?: boolean; ghost?: boolean;
  icon?: keyof typeof MaterialIcons.glyphMap;
}) => (
  <TouchableOpacity
    onPress={onPress} disabled={disabled} activeOpacity={0.8}
    className={`flex-row items-center gap-1.5 px-4 py-2.5 rounded-xl ${
      disabled ? "bg-gray-200" :
      ghost    ? "bg-transparent border border-gray-200" :
      "bg-[#064E3B]"
    }`}>
    {icon && (
      <MaterialIcons name={icon} size={14}
        color={disabled ? "#9ca3af" : ghost ? "#6b7280" : "#fff"} />
    )}
    <Text className={`text-[12.5px] font-bold ${
      disabled ? "text-gray-400" : ghost ? "text-gray-500" : "text-white"
    }`}>{label}</Text>
  </TouchableOpacity>
);

function ProgressBar({ allocated, utilized }: { allocated: number; utilized: number }) {
  const pct = allocated > 0 ? Math.min((utilized / allocated) * 100, 100) : 0;
  const color = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#10b981";
  return (
    <View className="h-2 bg-gray-100 rounded-full overflow-hidden mt-1.5">
      <View className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
    </View>
  );
}

const fmt = (n: number) =>
  n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// ─── YearPickerModal ──────────────────────────────────────────────────────────
// Exported so ORSModule can use it too without duplication.

export function YearPickerModal({
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
            <View className="bg-[#064E3B] px-4 py-3">
              <Text className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-0.5">
                Fiscal Year
              </Text>
              <Text className="text-[16px] font-extrabold text-white">Select Year</Text>
            </View>
            {YEAR_RANGE.map((y) => {
              const isSelected = y === selected;
              const isFuture   = y > CURRENT_YEAR;
              return (
                <TouchableOpacity
                  key={y}
                  onPress={() => { onSelect(y); onClose(); }}
                  activeOpacity={0.7}
                  className={`flex-row items-center justify-between px-4 py-3 ${isSelected ? "bg-emerald-50" : ""}`}
                  style={{ borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}>
                  <View className="flex-row items-center gap-2">
                    {isSelected
                      ? <View className="w-1.5 h-5 rounded-full bg-[#10b981]" />
                      : <View className="w-1.5 h-5" />}
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
                    {isSelected && <MaterialIcons name="check" size={14} color="#10b981" />}
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

// ─── AllocModal — edit existing allocation ────────────────────────────────────

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
            <View className="w-10 h-1 rounded-full bg-gray-300 self-center mb-4" />
            <Text className="text-[17px] font-extrabold text-[#1a4d2e] mb-0.5">Edit Allocation</Text>
            <Text className="text-[12px] text-gray-400 mb-4">{row.division_name}</Text>

            {/* Fiscal Year picker */}
            <Text className="text-[12px] font-semibold text-gray-700 mb-1">
              Fiscal Year <Text className="text-red-500">*</Text>
            </Text>
            <TouchableOpacity
              onPress={() => setYearOpen(true)} activeOpacity={0.8}
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

            {/* Amount */}
            <Text className="text-[12px] font-semibold text-gray-700 mb-1">
              Allocated Budget (
              <Text>₱</Text>){" "}
              <Text className="text-red-500">*</Text>
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

      <YearPickerModal
        visible={yearOpen} selected={selectedYear}
        onSelect={setSelectedYear} onClose={() => setYearOpen(false)}
      />
    </>
  );
}

// ─── Division option type ─────────────────────────────────────────────────────

interface DivisionOption { division_id: number; division_name: string | null; }

// ─── CreateAllocModal — new allocation ────────────────────────────────────────

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

  useEffect(() => {
    supabase
      .from("divisions")
      .select("division_id, division_name")
      .order("division_name")
      .then(({ data, error }) => {
        if (!error && data) setDivisions(data as DivisionOption[]);
        setDivLoading(false);
      });
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

            <View className="w-10 h-1 rounded-full bg-gray-300 self-center mb-4" />
            <View className="flex-row items-center gap-2 mb-1">
              <View className="w-7 h-7 rounded-full bg-emerald-100 items-center justify-center">
                <MaterialIcons name="account-balance-wallet" size={14} color="#064E3B" />
              </View>
              <Text className="text-[17px] font-extrabold text-[#1a4d2e]">New Budget Allocation</Text>
            </View>
            <Text className="text-[12px] text-gray-400 mb-5">
              Set a budget allocation for a division and fiscal year.
            </Text>

            {/* Division picker */}
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
                        active ? "bg-[#064E3B] border-[#064E3B]" : "bg-white border-gray-200"
                      }`}>
                      <Text className={`text-[12px] font-bold ${active ? "text-white" : "text-gray-600"}`}>
                        {d.division_name ?? `Div ${d.division_id}`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Fiscal Year */}
            <Text className="text-[12px] font-semibold text-gray-700 mb-1">
              Fiscal Year <Text className="text-red-500">*</Text>
            </Text>
            <TouchableOpacity
              onPress={() => setYearOpen(true)} activeOpacity={0.8}
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

            {/* Amount */}
            <Text className="text-[12px] font-semibold text-gray-700 mb-1">
              Allocated Budget (
              <Text>₱</Text>){" "}
              <Text className="text-red-500">*</Text>
            </Text>
            <TextInput
              value={amount} onChangeText={setAmount}
              keyboardType="decimal-pad" placeholder="e.g. 2500000"
              placeholderTextColor="#9ca3af"
              className="bg-gray-50 rounded-xl px-3 py-2.5 text-[14px] text-gray-900 mb-4"
              style={{ borderWidth: 1.5, borderColor: "#e5e7eb", fontFamily: MONO }}
            />

            {/* Notes */}
            <Text className="text-[12px] font-semibold text-gray-700 mb-1">Notes</Text>
            <TextInput
              value={notes} onChangeText={setNotes}
              placeholder="e.g. Annual Procurement Plan 2026"
              placeholderTextColor="#9ca3af" multiline numberOfLines={2}
              className="bg-gray-50 rounded-xl px-3 py-2.5 text-[13px] text-gray-900 mb-6"
              style={{ borderWidth: 1.5, borderColor: "#e5e7eb", minHeight: 60, textAlignVertical: "top" }}
            />

            <View className="flex-row gap-2.5 justify-end">
              <Btn ghost label="Cancel" onPress={onClose} />
              <Btn
                label={saving ? "Saving…" : "Create Allocation"}
                disabled={saving || !selectedDiv || !amount.trim()}
                onPress={handleSave} icon="add"
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <YearPickerModal
        visible={yearOpen} selected={selectedYear}
        onSelect={setSelectedYear} onClose={() => setYearOpen(false)}
      />
    </>
  );
}

// ─── DivisionBudgetSection ────────────────────────────────────────────────────

export interface DivisionBudgetSectionProps {
  budgets: DivisionBudgetRow[];
  year: number;
  canEdit: boolean;
  onUpdate: (id: string, year: number, amount: number, notes: string) => Promise<void>;
  onInsert: (divId: number, year: number, amount: number, notes: string) => Promise<void>;
  orsEntries?: any[]; // ORS entries for calculating utilization
  poEntries?: any[]; // PO entries for PO-based utilization calculation
  calcMode?: "ors" | "po"; // Calculation mode: ORS or PO based
}

/**
 * Self-contained "Budget by Division" card.
 * Manages its own AllocModal / CreateAllocModal state internally.
 * The parent (BudgetScreen) only needs to pass data + async callbacks.
 */
export default function DivisionBudgetSection({
  budgets,
  year,
  canEdit,
  onUpdate,
  onInsert,
  orsEntries = [],
  poEntries = [],
  calcMode = "ors",
}: DivisionBudgetSectionProps) {
  const [editBudget,      setEditBudget]      = useState<DivisionBudgetRow | null>(null);
  const [createAllocOpen, setCreateAllocOpen] = useState(false);

  return (
    <View
      className="bg-white rounded-3xl border border-gray-200 mb-3 overflow-hidden"
      style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07, shadowRadius: 6, elevation: 3 }}>
      <View className="px-4 pt-3.5 pb-3">

        {/* Header */}
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
                onPress={() => setCreateAllocOpen(true)} activeOpacity={0.8}
                className="flex-row items-center gap-1 bg-[#064E3B] px-3 py-1.5 rounded-xl">
                <MaterialIcons name="add" size={14} color="#fff" />
                <Text className="text-[11.5px] font-bold text-white">Add</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View className="h-px bg-gray-100 my-2.5" />

        {/* Budget rows */}
        {budgets.length === 0 ? (
          <View className="items-center py-6 gap-2">
            <Text className="text-[13px] text-gray-400 text-center">
              No budget data for FY {year}.
            </Text>
            {canEdit && (
              <TouchableOpacity
                onPress={() => setCreateAllocOpen(true)} activeOpacity={0.8}
                className="flex-row items-center gap-1.5 bg-[#064E3B] px-4 py-2 rounded-xl mt-1">
                <MaterialIcons name="add" size={14} color="#fff" />
                <Text className="text-[12px] font-bold text-white">Create First Allocation</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          budgets.map((row, i) => {
            // Calculate utilized amount based on calcMode
            let utilized = 0;
            if (calcMode === "ors") {
              // Calculate from ORS entries for this division
              const divisionOrsEntries = orsEntries.filter(entry => entry.division_id === row.division_id);
              utilized = divisionOrsEntries.reduce((sum, entry) => sum + entry.amount, 0);
            } else {
              // Calculate from PO entries for this division
              const divisionPOEntries = poEntries.filter(po => po.division_id === row.division_id);
              utilized = divisionPOEntries.reduce((sum, po) => sum + (po.total_amount || 0), 0);
            }
            
            const pct = row.allocated > 0
              ? Math.min(Math.round((utilized / row.allocated) * 100), 100) : 0;
            const barColor  = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#10b981";
            const remaining = row.allocated - utilized;
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
                    {canEdit && <MaterialIcons name="edit" size={12} color="#9ca3af" />}
                  </View>
                  <Text className="text-[11.5px] font-semibold text-gray-600">
                    <Text>₱</Text>
                    <Text style={{ fontFamily: MONO }}>{fmt(utilized)}</Text>{" "}
                    / <Text style={{ fontFamily: MONO }}>{fmt(row.allocated)}</Text>
                  </Text>
                </View>

                <ProgressBar allocated={row.allocated} utilized={utilized} />

                <View className="flex-row justify-between mt-1">
                  <Text className="text-[10px] text-gray-400">{pct}% utilized</Text>
                  <Text className={`text-[10px] font-semibold ${remaining < 0 ? "text-red-500" : "text-gray-400"}`}>
                    {remaining < 0 ? "Over by " : "Remaining: "}
                    <Text>₱</Text>
                    {fmt(Math.abs(remaining))}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* Edit allocation modal */}
      {canEdit && editBudget && (
        <AllocModal
          row={editBudget}
          onClose={() => setEditBudget(null)}
          onSave={onUpdate}
        />
      )}

      {/* Create new allocation modal */}
      {canEdit && createAllocOpen && (
        <CreateAllocModal
          defaultYear={year}
          onClose={() => setCreateAllocOpen(false)}
          onSave={onInsert}
        />
      )}
    </View>
  );
}
