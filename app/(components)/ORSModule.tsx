/**
 * ORSModule.tsx — ORS (Obligation Request and Status) sub-module
 *
 * Extracted from budget.tsx. Contains everything related to ORS entries:
 * the list/table, OrsModal (add/edit), OrsStatusPill, and ORS_STATUS_META.
 *
 * Designed for two use-cases:
 *
 *   1. Budget screen (budget.tsx)
 *      Import ORSSection and drop it in as a replacement for the
 *      "Recent ORS Processing" Card.
 *
 *   2. PO Module (POModule.tsx)
 *      Import ORSInlinePanel and render it inside a RecordCard or below
 *      the list when statusId === 13 (ORS Processing step).
 *      ORSInlinePanel fetches its own data keyed to the PO's pr_no so
 *      the Budget officer sees exactly the ORS entries linked to that PO.
 *
 * Exports:
 *   ORS_STATUS_META    — status → colour config (used by budget.tsx summary)
 *   OrsStatusPill      — reusable status badge component
 *   ORSSection         — full card used by budget.tsx (replaces the old Card)
 *   ORSInlinePanel     — compact inline panel used by POModule at status_id 13
 */

import {
  deleteOrsEntry,
  fetchOrsEntries,
  generateOrsNumber,
  insertOrsEntry,
  updateOrsEntry,
  type DivisionBudgetRow,
  type OrsEntryRow,
} from "@/lib/supabase";
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

// ─── Constants / meta ─────────────────────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const CURRENT_YEAR = new Date().getFullYear();

export const ORS_STATUS_META: Record<
  OrsEntryRow["status"],
  { bg: string; text: string; dot: string }
> = {
  Pending:    { bg: "bg-amber-50",   text: "text-amber-800",   dot: "#f59e0b" },
  Processing: { bg: "bg-blue-50",    text: "text-blue-800",    dot: "#3b82f6" },
  Approved:   { bg: "bg-emerald-50", text: "text-emerald-800", dot: "#10b981" },
  Rejected:   { bg: "bg-red-50",     text: "text-red-800",     dot: "#ef4444" },
};

const fmt = (n: number) =>
  n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// ─── OrsStatusPill ────────────────────────────────────────────────────────────

export function OrsStatusPill({ status }: { status: OrsEntryRow["status"] }) {
  const m = ORS_STATUS_META[status];
  return (
    <View className={`flex-row items-center gap-1 px-2 py-0.5 rounded-full ${m.bg}`}>
      <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.dot }} />
      <Text className={`text-[10px] font-bold ${m.text}`}>{status}</Text>
    </View>
  );
}

// ─── Shared button atom ───────────────────────────────────────────────────────

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

// ─── OrsForm type ─────────────────────────────────────────────────────────────

export interface OrsForm {
  ors_no: string;
  pr_no: string;
  amount: string;
  status: OrsEntryRow["status"];
  notes: string;
  division_id: string;
}

// ─── OrsModal — add / edit ────────────────────────────────────────────────────

export function OrsModal({
  initial,
  divisions,
  onClose,
  onSave,
  /** Pre-fill PR No. when opened from POModule (read-only) */
  lockedPrNo,
}: {
  initial?: OrsEntryRow | null;
  divisions: DivisionBudgetRow[];
  onClose: () => void;
  onSave: (form: OrsForm, existing?: OrsEntryRow) => Promise<void>;
  lockedPrNo?: string;
}) {
  const [form, setForm] = useState<OrsForm>({
    ors_no:      initial?.ors_no     ?? "",
    pr_no:       lockedPrNo          ?? initial?.pr_no ?? "",
    amount:      initial?.amount     != null ? String(initial.amount) : "",
    status:      initial?.status     ?? "Pending",
    notes:       initial?.notes      ?? "",
    division_id: initial?.division_id != null ? String(initial.division_id) : "",
  });
  const [saving, setSaving] = useState(false);
  const isEdit = !!initial;

  const set = (k: keyof OrsForm) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.ors_no.trim()) { Alert.alert("Required", "ORS No. is required."); return; }
    const parsed = parseFloat(form.amount.replace(/,/g, ""));
    if (isNaN(parsed) || parsed < 0) {
      Alert.alert("Invalid amount", "Enter a valid amount."); return;
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

  const statusOptions: OrsEntryRow["status"][] = ["Pending", "Processing", "Approved", "Rejected"];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity className="flex-1 bg-black/50" activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          className="bg-white rounded-t-3xl"
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

          {/* PR No. — read-only when lockedPrNo is set (from POModule context) */}
          <Text className="text-[12px] font-semibold text-gray-700 mb-1">PR No.</Text>
          {lockedPrNo ? (
            <View className="flex-row items-center gap-2 bg-gray-100 rounded-xl px-3 py-2.5 mb-3"
              style={{ borderWidth: 1.5, borderColor: "#e5e7eb" }}>
              <MaterialIcons name="link" size={13} color="#6b7280" />
              <Text className="text-[13px] text-gray-600 flex-1" style={{ fontFamily: MONO }}>
                {lockedPrNo}
              </Text>
              <Text className="text-[9.5px] text-gray-400 font-bold uppercase">Linked</Text>
            </View>
          ) : (
            <TextInput value={form.pr_no} onChangeText={set("pr_no")}
              placeholder="2026-PR-0001" placeholderTextColor="#9ca3af"
              className="bg-gray-50 rounded-xl px-3 py-2.5 text-[13px] text-gray-900 mb-3"
              style={{ borderWidth: 1.5, borderColor: "#e5e7eb", fontFamily: MONO }} />
          )}

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

          {/* Status */}
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
                  <Text className={`text-[12px] font-bold ${active ? m.text : "text-gray-500"}`}>{s}</Text>
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
            style={{ borderWidth: 1.5, borderColor: "#e5e7eb", minHeight: 56, textAlignVertical: "top" }} />

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

// ─── ORSSection — used by budget.tsx ─────────────────────────────────────────

export interface ORSSectionProps {
  orsEntries: OrsEntryRow[];
  year: number;
  canEdit: boolean;
  isEndUser: boolean;
  budgets: DivisionBudgetRow[];
  currentUserId?: string | number | null;
  onSave: (form: OrsForm, existing?: OrsEntryRow) => Promise<void>;
  onDelete: (entry: OrsEntryRow) => void;
}

/**
 * Drop-in replacement for the "Recent ORS Processing" Card in budget.tsx.
 * Manages its own OrsModal open/close state internally.
 */
export function ORSSection({
  orsEntries,
  year,
  canEdit,
  isEndUser,
  budgets,
  onSave,
  onDelete,
}: ORSSectionProps) {
  const [editOrs, setEditOrs] = useState<OrsEntryRow | null | undefined>(undefined);
  // undefined = closed, null = new, OrsEntryRow = editing

  return (
    <View
      className="bg-white rounded-3xl border border-gray-200 mb-3 overflow-hidden"
      style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07, shadowRadius: 6, elevation: 3 }}>
      <View className="px-4 pt-3.5 pb-3">

        {/* Header */}
        <View className="flex-row items-center justify-between mb-2">
          <View>
            <Text className="text-[15px] font-extrabold text-[#1a4d2e]">
              {isEndUser ? "My Division's ORS" : "Recent ORS Processing"}
            </Text>
            <Text className="text-[11px] text-gray-400">Obligation Request and Status</Text>
          </View>
          {canEdit && (
            <TouchableOpacity
              onPress={() => setEditOrs(null)} activeOpacity={0.8}
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
                className={`flex-row items-center px-3 py-2.5 rounded-xl ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
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
                    onPress={() => onDelete(entry)} hitSlop={8} className="w-10 items-center">
                    <MaterialIcons name="delete-outline" size={16} color="#ef4444" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}
          </>
        )}
      </View>

      {/* ORS add / edit modal */}
      {canEdit && editOrs !== undefined && (
        <OrsModal
          initial={editOrs}
          divisions={budgets}
          onClose={() => setEditOrs(undefined)}
          onSave={onSave}
        />
      )}
    </View>
  );
}

// ─── ORSInlinePanel — used by POModule at status_id 13 ───────────────────────

export interface ORSInlinePanelProps {
  /**
   * The PR No. of the selected PO. Used to filter ORS entries to only
   * those linked to this specific PO, and to pre-fill PR No. in OrsModal.
   */
  prNo: string;
  /**
   * The PO's total amount — pre-filled in the OrsModal Amount field
   * as a convenience starting value.
   */
  totalAmount?: number;
  /** Budget officer / admin can edit. */
  canEdit: boolean;
  /**
   * Divisions list for the OrsModal division picker.
   * If not provided, the panel fetches from Supabase directly.
   */
  divisions?: DivisionBudgetRow[];
  /** ID of the currently logged-in user — passed to insertOrsEntry.prepared_by. */
  currentUserId?: string | number | null;
}

/**
 * Compact inline ORS panel for POModule.
 * Shown when a PO's status_id === 13 (ORS Processing step).
 *
 * Fetches ORS entries filtered by pr_no from Supabase so the Budget
 * officer sees only entries relevant to the selected PO.
 */
export function ORSInlinePanel({
  prNo,
  totalAmount,
  canEdit,
  divisions: divisionsProp,
  currentUserId,
}: ORSInlinePanelProps) {
  const [entries,   setEntries]   = useState<OrsEntryRow[]>([]);
  const [divisions, setDivisions] = useState<DivisionBudgetRow[]>(divisionsProp ?? []);
  const [loading,   setLoading]   = useState(true);
  const [editOrs,   setEditOrs]   = useState<OrsEntryRow | null | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // fetchOrsEntries supports an optional prNo filter — if your API
      // doesn't support it yet, filter client-side after fetching all.
      const all = await fetchOrsEntries(CURRENT_YEAR);
      setEntries(all.filter(e => e.pr_no === prNo));
    } catch {}
    finally { setLoading(false); }
  }, [prNo]);

  useEffect(() => { load(); }, [load]);

  // Fetch divisions if not passed as a prop
  useEffect(() => {
    if (divisionsProp) { setDivisions(divisionsProp); return; }
    // minimal fetch — we only need division_id + division_name
    import("@/lib/supabase").then(({ supabase }) =>
      supabase
        .from("divisions")
        .select("division_id, division_name")
        .order("division_name")
        .then(({ data }) => {
          if (data)
            setDivisions(
              data.map((d: any) => ({
                id: String(d.division_id),
                division_id: d.division_id,
                division_name: d.division_name,
                fiscal_year: CURRENT_YEAR,
                allocated: 0, utilized: 0, notes: null,
              }))
            );
        })
    );
  }, [divisionsProp]);

  const handleSave = async (form: OrsForm, existing?: OrsEntryRow) => {
    const amount  = parseFloat(form.amount.replace(/,/g, ""));
    const divId   = form.division_id ? parseInt(form.division_id) : null;
    if (existing) {
      await updateOrsEntry(existing.id, {
        ors_no: form.ors_no.trim(),
        pr_no:  prNo,
        amount,
        status: form.status,
        notes:  form.notes.trim() || null,
      } as any);
    } else {
      const autoNo = form.ors_no.trim() || await generateOrsNumber();
      await insertOrsEntry({
        ors_no:      autoNo,
        pr_id:       null,
        pr_no:       prNo,
        division_id: divId,
        fiscal_year: CURRENT_YEAR,
        amount,
        status:      form.status,
        prepared_by: currentUserId ?? null,
        approved_by: null,
        notes:       form.notes.trim() || null,
      });
    }
    await load();
  };

  const handleDelete = (entry: OrsEntryRow) => {
    Alert.alert(
      "Delete ORS Entry",
      `Remove ${entry.ors_no}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            try { await deleteOrsEntry(entry.id); await load(); }
            catch (e: any) { Alert.alert("Delete failed", e?.message); }
          },
        },
      ]
    );
  };

  return (
    <View
      className="mx-4 mb-3 bg-white rounded-2xl border-2 border-violet-200 overflow-hidden"
      style={{ elevation: 2 }}>

      {/* Header strip */}
      <View className="flex-row items-center justify-between bg-violet-600 px-4 py-2.5">
        <View className="flex-row items-center gap-2">
          <MaterialIcons name="receipt-long" size={15} color="#fff" />
          <View>
            <Text className="text-[12px] font-extrabold text-white">ORS Processing</Text>
            <Text className="text-[9.5px] text-white/60">Linked to PR {prNo}</Text>
          </View>
        </View>
        {canEdit && (
          <TouchableOpacity
            onPress={() => setEditOrs(null)} activeOpacity={0.8}
            className="flex-row items-center gap-1 bg-white/15 rounded-lg px-2.5 py-1.5">
            <MaterialIcons name="add" size={13} color="#fff" />
            <Text className="text-[11px] font-bold text-white">Add ORS</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      {loading ? (
        <View className="items-center py-5">
          <ActivityIndicator size="small" color="#7c3aed" />
          <Text className="text-[11px] text-gray-400 mt-2">Loading ORS entries…</Text>
        </View>
      ) : entries.length === 0 ? (
        <View className="items-center py-5 gap-1.5">
          <MaterialIcons name="receipt-long" size={26} color="#ddd6fe" />
          <Text className="text-[12px] text-gray-400">No ORS entries linked to this PR.</Text>
          {canEdit && (
            <TouchableOpacity
              onPress={() => setEditOrs(null)} activeOpacity={0.8}
              className="mt-1.5 flex-row items-center gap-1.5 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2">
              <MaterialIcons name="add" size={13} color="#7c3aed" />
              <Text className="text-[12px] font-bold text-violet-700">Create ORS Entry</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View className="px-3 pt-2 pb-3 gap-1.5">
          {entries.map((entry, i) => (
            <TouchableOpacity
              key={entry.id}
              onPress={() => canEdit ? setEditOrs(entry) : null}
              activeOpacity={canEdit ? 0.7 : 1}
              className={`flex-row items-center px-3 py-2.5 rounded-xl ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
              style={{ borderWidth: 1, borderColor: "#ede9fe" }}>
              <View className="flex-1 gap-0.5">
                <Text className="text-[12px] font-bold text-violet-800" style={{ fontFamily: MONO }}>
                  {entry.ors_no}
                </Text>
                {entry.notes ? (
                  <Text className="text-[10.5px] text-gray-400" numberOfLines={1}>{entry.notes}</Text>
                ) : null}
              </View>
              <Text className="text-[12px] font-semibold text-gray-700 mr-2" style={{ fontFamily: MONO }}>
                ₱{fmt(entry.amount)}
              </Text>
              <OrsStatusPill status={entry.status} />
              {canEdit && (
                <TouchableOpacity
                  onPress={() => handleDelete(entry)} hitSlop={8} className="ml-2">
                  <MaterialIcons name="delete-outline" size={15} color="#ef4444" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ORS add / edit modal */}
      {canEdit && editOrs !== undefined && (
        <OrsModal
          initial={editOrs}
          divisions={divisions}
          onClose={() => setEditOrs(undefined)}
          onSave={handleSave}
          lockedPrNo={prNo}
        />
      )}
    </View>
  );
}
