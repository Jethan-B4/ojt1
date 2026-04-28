/**
 * ORSModule.tsx — ORS (Obligation Request and Status) sub-module  [REFINED]
 *
 * What changed vs the original:
 *   • OrsModal rebuilt to match CreatePOModal's field/section style:
 *       – SectionLabel / FieldLabel / StyledInput atoms
 *       – Full-screen SafeAreaView modal with tab bar (Form ↔ Preview)
 *       – ORSPreviewPanel embedded on the Preview tab
 *       – Divider separators between logical groups
 *       – Two-column layout for paired fields (ORS No / Date, Amount / Status…)
 *       – Monospace inputs for serial numbers and amounts
 *       – Focused-border highlight on every input
 *   • New fields exposed in OrsForm:
 *       – fund_cluster, particulars, mfo_pap, uacs_code
 *       – prepared_by_name / approved_by_name (display; actual IDs stay in DB)
 *       – date_created (ISO string, defaults to today)
 *   • ORSSection table gains a "Preview" icon button per row (opens read-only preview)
 *   • ORSInlinePanel inherits the same modal
 *
 * Exports (unchanged surface):
 *   ORS_STATUS_META    — status → colour config
 *   OrsStatusPill      — reusable status badge
 *   OrsForm            — form state type (extended)
 *   OrsModal           — add / edit modal
 *   ORSSection         — used by budget.tsx
 *   ORSInlinePanel     — used by POModule at status_id 13 / 14
 */

import {
    deleteOrsEntry,
    fetchOrsEntries,
    generateOrsNumber,
    insertOrsEntry,
    updateOrsEntry,
    updatePO,
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
    useWindowDimensions,
    View,
    type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ORSPreviewPanel, {
    buildORSHtml,
    type ORSPreviewData,
} from "../(components)/ORSPreviewPanel";
import CalendarPickerModal from "../(modals)/CalendarModal";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const CURRENT_YEAR = new Date().getFullYear();

const fmt = (n: number) =>
  n.toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
const fmt2 = (n: number) =>
  n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function formatDate(date: Date) {
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
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

      <CalendarPickerModal
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

// ─── Status meta ──────────────────────────────────────────────────────────────

export const ORS_STATUS_META: Record<
  OrsEntryRow["status"],
  { bg: string; text: string; dot: string; pill: string }
> = {
  Pending: {
    bg: "bg-amber-50",
    text: "text-amber-800",
    dot: "#f59e0b",
    pill: "#fffbeb",
  },
  Processing: {
    bg: "bg-blue-50",
    text: "text-blue-800",
    dot: "#3b82f6",
    pill: "#eff6ff",
  },
  Approved: {
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    dot: "#10b981",
    pill: "#ecfdf5",
  },
  Rejected: {
    bg: "bg-red-50",
    text: "text-red-800",
    dot: "#ef4444",
    pill: "#fef2f2",
  },
};

// ─── OrsStatusPill ────────────────────────────────────────────────────────────

export function OrsStatusPill({ status }: { status: OrsEntryRow["status"] }) {
  const m = ORS_STATUS_META[status];
  return (
    <View
      className={`flex-row items-center gap-1 px-2 py-0.5 rounded-full ${m.bg}`}
    >
      <View
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: m.dot }}
      />
      <Text className={`text-[10px] font-bold ${m.text}`}>{status}</Text>
    </View>
  );
}

// ─── Shared UI atoms (mirrors CreatePOModal style) ────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">
      {children}
    </Text>
  );
}

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <Text className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
      {children}
      {required && <Text className="text-red-500"> *</Text>}
    </Text>
  );
}

function Divider() {
  return <View className="h-px bg-gray-100 my-1 mb-3.5" />;
}

function StyledInput(props: TextInputProps & { mono?: boolean }) {
  const { mono, style, ...rest } = props;
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...rest}
      autoCapitalize={rest.autoCapitalize ?? "none"}
      autoCorrect={rest.autoCorrect ?? false}
      spellCheck={rest.spellCheck ?? false}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      placeholderTextColor="#9ca3af"
      className={`bg-gray-50 rounded-[10px] border px-3 py-2.5 text-sm text-gray-900 ${
        focused ? "border-[#064E3B]" : "border-gray-200"
      }`}
      style={[mono ? { fontFamily: MONO } : {}, style ?? {}]}
    />
  );
}

// ─── OrsForm type (extended) ──────────────────────────────────────────────────

export interface OrsForm {
  // core / DB-backed
  ors_no: string;
  pr_no: string;
  amount: string;
  status: OrsEntryRow["status"];
  notes: string;
  division_id: string;
  // new display / document fields
  fund_cluster: string;
  particulars: string;
  mfo_pap: string;
  uacs_code: string;
  prepared_by_name: string;
  prepared_by_desig: string;
  approved_by_name: string;
  approved_by_desig: string;
  date_created: string;
  responsibility_center: string;
}

const BLANK_FORM: OrsForm = {
  ors_no: "",
  pr_no: "",
  amount: "",
  status: "Pending",
  notes: "",
  division_id: "",
  fund_cluster: "",
  particulars: "",
  mfo_pap: "",
  uacs_code: "",
  prepared_by_name: "",
  prepared_by_desig: "Budget Officer",
  approved_by_name: "",
  approved_by_desig: "Head, Budget Division",
  date_created: new Date().toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }),
  responsibility_center: "",
};

// ─── OrsModal — add / edit ────────────────────────────────────────────────────

export function OrsModal({
  initial,
  divisions,
  onClose,
  onSave,
  lockedPrNo,
  fiscalYear = CURRENT_YEAR,
  entityName = "Department of Agrarian Reform",
}: {
  initial?: OrsEntryRow | null;
  divisions: DivisionBudgetRow[];
  onClose: () => void;
  onSave: (form: OrsForm, existing?: OrsEntryRow) => Promise<void>;
  /** Pre-fill PR No. when opened from POModule (read-only) */
  lockedPrNo?: string;
  fiscalYear?: number;
  entityName?: string;
}) {
  const [form, setForm] = useState<OrsForm>({
    ...BLANK_FORM,
    ors_no: initial?.ors_no ?? "",
    pr_no: lockedPrNo ?? initial?.pr_no ?? "",
    amount: initial?.amount != null ? String(initial.amount) : "",
    status: initial?.status ?? "Pending",
    notes: initial?.notes ?? "",
    division_id:
      initial?.division_id != null ? String(initial.division_id) : "",
  });

  const [tab, setTab] = useState<"form" | "preview">("form");
  const [saving, setSaving] = useState(false);
  const isEdit = !!initial;

  const set = (k: keyof OrsForm) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  // ── Preview data derived from form ───────────────────────────────────────

  const previewData: ORSPreviewData = {
    orsNo: form.ors_no,
    prNo: form.pr_no,
    divisionName:
      divisions.find((d) => String(d.division_id) === form.division_id)
        ?.division_name ?? form.division_id,
    entityName,
    fundCluster: form.fund_cluster,
    responsibilityCenter: form.responsibility_center,
    uacsCode: form.uacs_code,
    fiscalYear,
    amount: parseFloat(form.amount.replace(/,/g, "")) || 0,
    status: form.status,
    particulars: form.particulars,
    mfoPap: form.mfo_pap,
    preparedByName: form.prepared_by_name,
    preparedByDesig: form.prepared_by_desig,
    approvedByName: form.approved_by_name,
    approvedByDesig: form.approved_by_desig,
    dateCreated: form.date_created,
    notes: form.notes,
  };

  const html = buildORSHtml(previewData);

  // ── Validation + save ─────────────────────────────────────────────────────

  const handleSave = async () => {
    const missing: string[] = [];
    if (!form.ors_no.trim()) missing.push("ORS No.");
    if (!form.pr_no.trim()) missing.push("PR No.");
    if (!form.division_id.trim()) missing.push("Division");
    if (!form.particulars.trim()) missing.push("Particulars");
    if (!form.responsibility_center.trim()) missing.push("Responsibility Center");
    if (missing.length > 0) {
      Alert.alert("Required Fields", `Please complete: ${missing.join(", ")}`);
      return;
    }
    const parsed = parseFloat(form.amount.replace(/,/g, ""));
    if (isNaN(parsed) || parsed < 0) {
      Alert.alert("Invalid amount", "Enter a valid obligation amount.");
      return;
    }
    setSaving(true);
    try {
      await onSave(form, initial ?? undefined);
      onClose();
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? "Could not save ORS entry.");
    } finally {
      setSaving(false);
    }
  };

  const statusOptions: OrsEntryRow["status"][] = [
    "Pending",
    "Processing",
    "Approved",
    "Rejected",
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Modal
      visible
      transparent={false}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <SafeAreaView className="flex-1 bg-white">
        {/* ── Header ── */}
        <View className="bg-[#064E3B] px-5 pt-4 pb-4">
          <View className="flex-row items-start justify-between">
            <View className="flex-1 mr-3">
              <Text className="text-[10px] font-bold tracking-widest uppercase text-white/40">
                DAR · Budget
              </Text>
              <Text className="text-[17px] font-black text-white mt-0.5">
                {isEdit ? "Edit ORS Entry" : "New ORS Entry"}
              </Text>
              <Text className="text-[11px] text-white/50 mt-0.5">
                Obligation Request and Status · Appendix 11
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={10}
              className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center mt-1"
            >
              <MaterialIcons name="close" size={17} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Tab bar */}
          <View className="flex-row mt-3.5 gap-1.5">
            {(["form", "preview"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setTab(t)}
                activeOpacity={0.8}
                className={`flex-1 items-center py-2 rounded-xl ${
                  tab === t ? "bg-white" : "bg-white/10"
                }`}
              >
                <View className="flex-row items-center gap-1.5">
                  <MaterialIcons
                    name={t === "form" ? "edit" : "visibility"}
                    size={15}
                    color={tab === t ? "#064E3B" : "rgba(255,255,255,0.7)"}
                  />
                  <Text
                    className={`text-[12px] font-bold ${
                      tab === t ? "text-[#064E3B]" : "text-white/70"
                    }`}
                  >
                    {t === "form" ? "Form" : "Preview"}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Preview tab ── */}
        {tab === "preview" ? (
          <ORSPreviewPanel html={html} showActions style={{ flex: 1 }} />
        ) : (
          /* ── Form tab ── */
          <KeyboardAvoidingView
            className="flex-1"
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <ScrollView
              className="flex-1"
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingTop: 20,
                paddingBottom: 40,
              }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* ── Section: ORS Identity ── */}
              <SectionLabel>ORS Identity</SectionLabel>
              <View className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 mb-3">
                <Text className="text-[11px] text-blue-800">
                  Start with identity fields, then complete obligation details and signatories.
                </Text>
              </View>

              <View className="flex-row gap-2.5 mb-3.5">
                <View className="flex-1">
                  <FieldLabel required>ORS No.</FieldLabel>
                  <StyledInput
                    value={form.ors_no}
                    onChangeText={set("ors_no")}
                    placeholder="ORS-2026-0001"
                    mono
                  />
                </View>
                <View className="flex-1">
                  <FieldLabel>Date</FieldLabel>
                  <DatePickerButton
                    value={form.date_created}
                    onChange={set("date_created")}
                    placeholder="Select date…"
                  />
                </View>
              </View>

              {/* PR No. */}
              <View className="mb-3.5">
                <FieldLabel required>PR No.</FieldLabel>
                {lockedPrNo ? (
                  <View className="flex-row items-center gap-2 bg-gray-100 rounded-[10px] px-3 py-2.5 border border-gray-200">
                    <MaterialIcons name="link" size={13} color="#6b7280" />
                    <Text
                      className="text-[13px] text-gray-600 flex-1"
                      style={{ fontFamily: MONO }}
                    >
                      {lockedPrNo}
                    </Text>
                    <Text className="text-[9.5px] text-gray-400 font-bold uppercase">
                      Linked
                    </Text>
                  </View>
                ) : (
                  <StyledInput
                    value={form.pr_no}
                    onChangeText={set("pr_no")}
                    placeholder="2026-PR-0001"
                    mono
                  />
                )}
              </View>

              <View className="flex-row gap-2.5 mb-3.5">
                <View className="flex-1">
                  <FieldLabel>Fund Cluster</FieldLabel>
                  <StyledInput
                    value={form.fund_cluster}
                    onChangeText={set("fund_cluster")}
                    placeholder="—"
                  />
                </View>
                <View className="flex-1">
                  <FieldLabel>Resp. Center</FieldLabel>
                  <StyledInput
                    value={form.responsibility_center}
                    onChangeText={set("responsibility_center")}
                    placeholder="—"
                    mono
                  />
                </View>
              </View>

              <Divider />

              {/* ── Section: Obligation Details ── */}
              <SectionLabel>Obligation Details</SectionLabel>

              <View className="mb-3.5">
                <FieldLabel required>Particulars / Purpose</FieldLabel>
                <StyledInput
                  value={form.particulars}
                  onChangeText={set("particulars")}
                  placeholder="Brief description of the obligation…"
                  multiline
                  style={{ minHeight: 60, textAlignVertical: "top" }}
                />
              </View>

              <View className="flex-row gap-2.5 mb-3.5">
                <View className="flex-1">
                  <FieldLabel>MFO / PAP</FieldLabel>
                  <StyledInput
                    value={form.mfo_pap}
                    onChangeText={set("mfo_pap")}
                    placeholder="—"
                    mono
                  />
                </View>
                <View className="flex-1">
                  <FieldLabel>UACS Object Code</FieldLabel>
                  <StyledInput
                    value={form.uacs_code}
                    onChangeText={set("uacs_code")}
                    placeholder="5-10-030-010"
                    mono
                  />
                </View>
              </View>

              <View className="flex-row gap-2.5 mb-3.5">
                <View className="flex-1">
                  <FieldLabel required>
                    Amount (<Text style={{ fontFamily: undefined }}>{"\u20B1"}</Text>)
                  </FieldLabel>
                  <StyledInput
                    value={form.amount}
                    onChangeText={set("amount")}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    mono
                  />
                </View>
                <View className="flex-1">
                  <FieldLabel required>Division</FieldLabel>
                  {/* Inline mini-picker scrollable */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 6, paddingRight: 4 }}
                  >
                    {divisions.map((d) => {
                      const active = form.division_id === String(d.division_id);
                      return (
                        <TouchableOpacity
                          key={d.division_id}
                          onPress={() =>
                            set("division_id")(String(d.division_id))
                          }
                          activeOpacity={0.8}
                          className={`px-3 py-2.5 rounded-[10px] border items-center justify-center ${
                            active
                              ? "bg-[#064E3B] border-[#064E3B]"
                              : "bg-white border-gray-200"
                          }`}
                        >
                          <Text
                            className={`text-[11.5px] font-bold ${
                              active ? "text-white" : "text-gray-600"
                            }`}
                          >
                            {d.division_name ?? `Div ${d.division_id}`}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>

              {/* Amount display bar */}
              {parseFloat(form.amount.replace(/,/g, "")) > 0 && (
                <View className="bg-[#064E3B] rounded-2xl px-5 py-3.5 flex-row items-center justify-between mb-4">
                  <Text className="text-[11px] font-bold uppercase tracking-widest text-white/50">
                    Obligation Amount
                  </Text>
                  <Text
                    className="text-[18px] font-black text-white"
                  >
                    <Text style={{ fontFamily: undefined }}>{"\u20B1"}</Text>
                    <Text style={{ fontFamily: MONO }}>
                      {fmt2(parseFloat(form.amount.replace(/,/g, "")) || 0)}
                    </Text>
                  </Text>
                </View>
              )}

              <Divider />
              <View className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
                <Text className="text-[10.5px] text-amber-800">
                  Use official MFO/PAP, UACS, and Responsibility Center values from budget records.
                </Text>
              </View>

              {/* ── Section: Status ── */}
              <SectionLabel>Status</SectionLabel>
              <View className="flex-row flex-wrap gap-2 mb-4">
                {statusOptions.map((s) => {
                  const m = ORS_STATUS_META[s];
                  const active = form.status === s;
                  return (
                    <TouchableOpacity
                      key={s}
                      onPress={() => set("status")(s)}
                      activeOpacity={0.8}
                      className={`flex-row items-center gap-1.5 px-3.5 py-2 rounded-xl border ${
                        active
                          ? `${m.bg} border-transparent`
                          : "bg-white border-gray-200"
                      }`}
                    >
                      <View
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: m.dot }}
                      />
                      <Text
                        className={`text-[12px] font-bold ${
                          active ? m.text : "text-gray-500"
                        }`}
                      >
                        {s}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Divider />

              {/* ── Section: Signatories ── */}
              <SectionLabel>Signatories</SectionLabel>

              <View className="flex-row gap-2.5 mb-3.5">
                <View className="flex-1">
                  <FieldLabel>Prepared By</FieldLabel>
                  <StyledInput
                    value={form.prepared_by_name}
                    onChangeText={set("prepared_by_name")}
                    placeholder="Full name"
                  />
                </View>
                <View className="flex-1">
                  <FieldLabel>Designation</FieldLabel>
                  <StyledInput
                    value={form.prepared_by_desig}
                    onChangeText={set("prepared_by_desig")}
                    placeholder="Budget Officer"
                  />
                </View>
              </View>

              <View className="flex-row gap-2.5 mb-3.5">
                <View className="flex-1">
                  <FieldLabel>Approved By</FieldLabel>
                  <StyledInput
                    value={form.approved_by_name}
                    onChangeText={set("approved_by_name")}
                    placeholder="Full name"
                  />
                </View>
                <View className="flex-1">
                  <FieldLabel>Designation</FieldLabel>
                  <StyledInput
                    value={form.approved_by_desig}
                    onChangeText={set("approved_by_desig")}
                    placeholder="Head, Budget Division"
                  />
                </View>
              </View>

              <Divider />

              {/* ── Section: Notes ── */}
              <SectionLabel>Notes / Remarks</SectionLabel>
              <View className="mb-5">
                <StyledInput
                  value={form.notes}
                  onChangeText={set("notes")}
                  placeholder="Optional remarks or clarifications…"
                  multiline
                  numberOfLines={3}
                  style={{ minHeight: 70, textAlignVertical: "top" }}
                />
              </View>
            </ScrollView>

            {/* ── Footer ── */}
            <View className="px-5 py-3.5 flex-row gap-2.5 border-t border-gray-100 bg-white">
              <TouchableOpacity
                onPress={onClose}
                className="flex-1 bg-gray-100 rounded-[10px] py-3 items-center"
              >
                <Text className="text-sm font-bold text-gray-500">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                className={`flex-[2] rounded-[10px] py-3 flex-row items-center justify-center gap-2 ${
                  saving ? "bg-gray-400" : "bg-[#064E3B]"
                }`}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <MaterialIcons
                    name={isEdit ? "save" : "add"}
                    size={16}
                    color="#fff"
                  />
                )}
                <Text className="text-sm font-bold text-white">
                  {saving
                    ? "Saving…"
                    : isEdit
                      ? "Save Changes"
                      : "Add ORS Entry"}
                </Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
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
  prStatusByNo?: Record<string, number>;
  currentUserId?: string | number | null;
  onSave: (form: OrsForm, existing?: OrsEntryRow) => Promise<void>;
  onDelete: (entry: OrsEntryRow) => void;
}

export function ORSSection({
  orsEntries,
  year,
  canEdit,
  isEndUser,
  budgets,
  prStatusByNo,
  onSave,
  onDelete,
}: ORSSectionProps) {
  const { width } = useWindowDimensions();
  const compact = width < 640;
  // undefined = closed, null = new entry, OrsEntryRow = editing
  const [editOrs, setEditOrs] = useState<OrsEntryRow | null | undefined>(
    undefined,
  );
  // For read-only preview from the list
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const openReadOnlyPreview = (entry: OrsEntryRow) => {
    const divisionName =
      budgets.find((d) => d.division_id === entry.division_id)?.division_name ??
      "";
    const html = buildORSHtml({
      orsNo: entry.ors_no ?? "",
      prNo: entry.pr_no ?? "",
      divisionName,
      fiscalYear: year,
      amount: entry.amount,
      status: entry.status,
      notes: entry.notes ?? "",
    });
    setPreviewHtml(html);
  };

  const phaseMeta = (prNo: string | null | undefined) => {
    const key = String(prNo ?? "");
    const sid = key && prStatusByNo ? Number(prStatusByNo[key] ?? 0) : 0;
    if (!sid) return null;
    const phase =
      sid >= 25
        ? "Payment"
        : sid >= 18
          ? "Delivery"
          : sid >= 12
            ? "PO"
            : "PR";
    const done =
      sid === 33
        ? "PR"
        : sid === 34
          ? "PO"
          : sid === 35
            ? "Delivery"
            : sid === 36
              ? "Payment"
              : null;
    const label = done ? `${done} Done` : phase;
    const bg = done ? "#ecfdf5" : "#f9fafb";
    const text = done ? "#065f46" : "#374151";
    const dot = done ? "#10b981" : "#9ca3af";
    return { label, bg, text, dot };
  };

  return (
    <View
      className="bg-white rounded-3xl border border-gray-200 mb-3 overflow-hidden"
      style={{
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 6,
        elevation: 3,
      }}
    >
      <View className="px-4 pt-3.5 pb-3">
        {/* ── Header ── */}
        <View className="flex-row items-start justify-between mb-3 flex-wrap gap-2">
          <View style={{ flexShrink: 1, minWidth: 220 }}>
            <Text className="text-[15px] font-extrabold text-[#1a4d2e]">
              {isEndUser ? "My Division's ORS" : "ORS Processing"}
            </Text>
            <Text className="text-[11px] text-gray-400">
              Obligation Request and Status · FY {year}
            </Text>
          </View>
          {canEdit && (
            <TouchableOpacity
              onPress={() => setEditOrs(null)}
              activeOpacity={0.8}
              className="flex-row items-center gap-1 bg-[#064E3B] px-3 py-1.5 rounded-xl"
            >
              <MaterialIcons name="add" size={14} color="#fff" />
              <Text className="text-[11.5px] font-bold text-white">
                Add ORS
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {orsEntries.length === 0 ? (
          <View className="items-center py-8 gap-2">
            <MaterialIcons name="receipt-long" size={32} color="#e5e7eb" />
            <Text className="text-[13px] text-gray-400">
              No ORS entries for FY {year}.
            </Text>
            {canEdit && (
              <TouchableOpacity
                onPress={() => setEditOrs(null)}
                activeOpacity={0.8}
                className="mt-1 flex-row items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2"
              >
                <MaterialIcons name="add" size={13} color="#064E3B" />
                <Text className="text-[12px] font-bold text-[#064E3B]">
                  Create First ORS Entry
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            {/* Table header */}
            {!compact && (
              <View className="flex-row bg-[#064E3B] rounded-xl px-3 py-2 mb-1 items-center">
                <Text
                  className="w-24 text-[10px] font-bold text-white/80"
                  numberOfLines={1}
                >
                  ORS No.
                </Text>
                <Text
                  className="w-20 text-[10px] font-bold text-white/80"
                  numberOfLines={1}
                >
                  PR No.
                </Text>
                <Text
                  className="flex-1 text-[10px] font-bold text-white/80 text-right"
                  numberOfLines={1}
                >
                  Amount
                </Text>
                <Text
                  className="w-20 text-[10px] font-bold text-white/80 text-right px-2"
                  numberOfLines={1}
                >
                  Status
                </Text>
                <View className="w-16" />
              </View>
            )}

            {orsEntries.map((entry, i) => (
              compact ? (
                <View
                  key={entry.id}
                  className="bg-white rounded-2xl border border-gray-200 px-3 py-3 mb-2"
                >
                  {/* ── Row 1: Details ── */}
                  <View className="flex-row items-center gap-2">
                    {/* ORS No */}
                    <View className="w-24">
                      <Text className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide">
                        ORS No.
                      </Text>
                      <Text
                        className="text-[12px] font-extrabold text-[#1a4d2e]"
                        style={{ fontFamily: MONO }}
                        numberOfLines={1}
                      >
                        {entry.ors_no ?? "—"}
                      </Text>
                    </View>

                    {/* PR No */}
                    <View className="w-20">
                      <Text className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide">
                        PR No.
                      </Text>
                      <Text
                        className="text-[11px] text-gray-600"
                        style={{ fontFamily: MONO }}
                        numberOfLines={1}
                      >
                        {entry.pr_no ?? "—"}
                      </Text>
                    </View>

                    {/* Amount */}
                    <View className="flex-1 items-end">
                      <Text className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide">
                        Amount
                      </Text>
                      <Text className="text-[12px] font-extrabold text-gray-800">
                        <Text style={{ fontFamily: undefined }}>{"\u20B1"}</Text>
                        <Text style={{ fontFamily: MONO }}>
                          {fmt(entry.amount)}
                        </Text>
                      </Text>
                    </View>

                    {/* Status */}
                    <View className="w-20 items-end">
                      <Text className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide pr-1">
                        Status
                      </Text>
                      <OrsStatusPill status={entry.status} />
                    </View>
                  </View>

                  {/* Phase indicator (if linked) */}
                  {entry.pr_no && (() => {
                    const m = phaseMeta(entry.pr_no);
                    if (!m) return null;
                    return (
                      <View className="mt-2 flex-row items-center">
                        <View
                          className="px-2 py-0.5 rounded-full border"
                          style={{
                            backgroundColor: m.bg,
                            borderColor: m.dot + "40",
                          }}
                        >
                          <Text
                            className="text-[9px] font-bold"
                            style={{ color: m.text }}
                          >
                            {m.label}
                          </Text>
                        </View>
                      </View>
                    );
                  })()}

                  {/* ── Row 2: Action Buttons ── */}
                  <View className="flex-row items-center justify-end gap-2 mt-3 pt-3 border-t border-gray-100">
                    <TouchableOpacity
                      onPress={() => openReadOnlyPreview(entry)}
                      activeOpacity={0.85}
                      className="px-3 py-2 rounded-xl border border-gray-200 bg-white flex-row items-center gap-1.5"
                    >
                      <MaterialIcons name="visibility" size={14} color="#6b7280" />
                      <Text className="text-[11px] font-bold text-gray-700">
                        Preview
                      </Text>
                    </TouchableOpacity>
                    {canEdit && (
                      <>
                        <TouchableOpacity
                          onPress={() => setEditOrs(entry)}
                          activeOpacity={0.85}
                          className="px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 flex-row items-center gap-1.5"
                        >
                          <MaterialIcons name="edit" size={14} color="#064E3B" />
                          <Text className="text-[11px] font-bold text-[#064E3B]">
                            Edit
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => onDelete(entry)}
                          activeOpacity={0.85}
                          className="px-3 py-2 rounded-xl border border-red-200 bg-red-50 flex-row items-center gap-1.5"
                        >
                          <MaterialIcons
                            name="delete-outline"
                            size={14}
                            color="#ef4444"
                          />
                          <Text className="text-[11px] font-bold text-red-600">
                            Delete
                          </Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              ) : (
                <View
                  key={entry.id}
                  className={`flex-row items-center px-3 py-2.5 rounded-xl ${
                    i % 2 === 0 ? "bg-white" : "bg-gray-50"
                  }`}
                  style={{ borderWidth: 1, borderColor: "#f3f4f6" }}
                >
                  <Text
                    className="w-24 text-[11px] font-semibold text-[#1a4d2e]"
                    style={{ fontFamily: MONO }}
                    numberOfLines={1}
                  >
                    {entry.ors_no ?? "—"}
                  </Text>
                  <View className="w-20">
                    <Text
                      className="text-[11px] text-gray-500"
                      style={{ fontFamily: MONO }}
                      numberOfLines={1}
                    >
                      {entry.pr_no ?? "—"}
                    </Text>
                    {(() => {
                      const m = phaseMeta(entry.pr_no);
                      if (!m) return null;
                      return (
                        <View
                          className="self-start mt-1 px-2 py-0.5 rounded-full border"
                          style={{
                            backgroundColor: m.bg,
                            borderColor: m.dot + "40",
                          }}
                        >
                          <Text
                            className="text-[9.5px] font-bold"
                            style={{ color: m.text }}
                          >
                            {m.label}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>
                  <Text className="flex-1 text-[11px] font-semibold text-gray-800 text-right">
                    <Text style={{ fontFamily: undefined }}>{"\u20B1"}</Text>
                    <Text style={{ fontFamily: MONO }}>
                      {fmt(entry.amount)}
                    </Text>
                  </Text>
                  <View className="w-20 items-end px-2">
                    <OrsStatusPill status={entry.status} />
                  </View>

                  <View className="w-16 flex-row items-center justify-end gap-1">
                    <TouchableOpacity
                      onPress={() => openReadOnlyPreview(entry)}
                      hitSlop={8}
                    >
                      <MaterialIcons
                        name="visibility"
                        size={16}
                        color="#6b7280"
                      />
                    </TouchableOpacity>
                    {canEdit && (
                      <>
                        <TouchableOpacity
                          onPress={() => setEditOrs(entry)}
                          hitSlop={8}
                        >
                          <MaterialIcons name="edit" size={15} color="#064E3B" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => onDelete(entry)}
                          hitSlop={8}
                        >
                          <MaterialIcons
                            name="delete-outline"
                            size={15}
                            color="#ef4444"
                          />
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              )
            ))}

            {/* Totals row */}
            <View className="flex-row items-center px-3 py-2.5 mt-1 bg-emerald-50 rounded-xl border border-emerald-100">
              <Text className="flex-1 text-[11px] font-bold text-emerald-800 uppercase tracking-wide">
                Total Obligated
              </Text>
              <Text
                className="text-[13px] font-extrabold text-emerald-800"
              >
                <Text style={{ fontFamily: undefined }}>{"\u20B1"}</Text>
                <Text style={{ fontFamily: MONO }}>
                  {fmt(orsEntries.reduce((s, e) => s + e.amount, 0))}
                </Text>
              </Text>
              {!compact && <View className="w-16" />}
            </View>
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
          fiscalYear={year}
        />
      )}

      {/* Read-only preview modal */}
      {previewHtml !== null && (
        <Modal
          visible
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setPreviewHtml(null)}
        >
          <SafeAreaView className="flex-1 bg-white">
            <View className="bg-[#064E3B] px-5 pt-4 pb-4 flex-row items-center justify-between">
              <View>
                <Text className="text-[10px] font-bold tracking-widest uppercase text-white/40">
                  ORS Preview
                </Text>
                <Text className="text-[16px] font-black text-white">
                  Obligation Request and Status
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setPreviewHtml(null)}
                hitSlop={10}
                className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center"
              >
                <MaterialIcons name="close" size={17} color="#fff" />
              </TouchableOpacity>
            </View>
            <ORSPreviewPanel
              html={previewHtml}
              showActions
              style={{ flex: 1 }}
            />
          </SafeAreaView>
        </Modal>
      )}
    </View>
  );
}

// ─── ORSInlinePanel — used by POModule at status_id 13 / 14 ──────────────────

export interface ORSInlinePanelProps {
  prNo: string;
  prId?: string | number | null;
  poId?: string | number | null;
  totalAmount?: number;
  canEdit: boolean;
  divisions?: DivisionBudgetRow[];
  currentUserId?: string | number | null;
  fiscalYear?: number;
}

export function ORSInlinePanel({
  prNo,
  prId,
  poId,
  totalAmount,
  canEdit,
  divisions: divisionsProp,
  currentUserId,
  fiscalYear = CURRENT_YEAR,
}: ORSInlinePanelProps) {
  const [entries, setEntries] = useState<OrsEntryRow[]>([]);
  const [divisions, setDivisions] = useState<DivisionBudgetRow[]>(
    divisionsProp ?? [],
  );
  const [loading, setLoading] = useState(true);
  const [editOrs, setEditOrs] = useState<OrsEntryRow | null | undefined>(
    undefined,
  );
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await fetchOrsEntries(fiscalYear);
      setEntries(all.filter((e) => e.pr_no === prNo));
    } catch {
    } finally {
      setLoading(false);
    }
  }, [prNo, fiscalYear]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (divisionsProp) {
      setDivisions(divisionsProp);
      return;
    }
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
                fiscal_year: fiscalYear,
                allocated: 0,
                utilized: 0,
                notes: null,
              })),
            );
        }),
    );
  }, [divisionsProp, fiscalYear]);

  const handleSave = async (form: OrsForm, existing?: OrsEntryRow) => {
    const amount = parseFloat(form.amount.replace(/,/g, ""));
    const divId = form.division_id ? parseInt(form.division_id) : null;
    const prIdValue =
      prId == null
        ? null
        : typeof prId === "number"
          ? prId
          : Number.parseInt(String(prId), 10) || null;
    if (existing) {
      await updateOrsEntry(existing.id, {
        ors_no: form.ors_no.trim(),
        pr_id: prIdValue as any,
        pr_no: prNo,
        amount,
        status: form.status,
        notes: form.notes.trim() || null,
      } as any);
      if (poId != null) {
        await updatePO(String(poId), {
          ors_no: form.ors_no.trim(),
          ors_amount: amount,
        });
      }
    } else {
      const autoNo = form.ors_no.trim() || (await generateOrsNumber());
      await insertOrsEntry({
        ors_no: autoNo,
        pr_id: prIdValue as any,
        pr_no: prNo,
        division_id: divId,
        fiscal_year: fiscalYear,
        amount,
        status: form.status,
        prepared_by: parseInt(currentUserId as string) ?? null,
        approved_by: null,
        notes: form.notes.trim() || null,
      });
      if (poId != null) {
        await updatePO(String(poId), { ors_no: autoNo, ors_amount: amount });
      }
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
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteOrsEntry(entry.id);
              await load();
            } catch (e: any) {
              Alert.alert("Delete failed", e?.message);
            }
          },
        },
      ],
    );
  };

  const openReadOnlyPreview = (entry: OrsEntryRow) => {
    const divName =
      divisions.find((d) => d.division_id === entry.division_id)
        ?.division_name ?? "";
    setPreviewHtml(
      buildORSHtml({
        orsNo: entry.ors_no ?? undefined,
        prNo: entry.pr_no ?? prNo ?? undefined,
        divisionName: divName,
        fiscalYear,
        amount: entry.amount,
        status: entry.status,
        notes: entry.notes ?? "",
      }),
    );
  };

  return (
    <View
      className="mx-4 mb-3 bg-white rounded-2xl border-2 border-violet-200 overflow-hidden"
      style={{ elevation: 2 }}
    >
      {/* Header strip */}
      <View className="flex-row items-center justify-between bg-violet-600 px-4 py-2.5">
        <View className="flex-row items-center gap-2">
          <MaterialIcons name="receipt-long" size={15} color="#fff" />
          <View>
            <Text className="text-[12px] font-extrabold text-white">
              ORS Processing
            </Text>
            <Text className="text-[9.5px] text-white/60">
              Linked to PR {prNo}
            </Text>
          </View>
        </View>
        {canEdit && (
          <TouchableOpacity
            onPress={() => setEditOrs(null)}
            activeOpacity={0.8}
            className="flex-row items-center gap-1 bg-white/15 rounded-lg px-2.5 py-1.5"
          >
            <MaterialIcons name="add" size={13} color="#fff" />
            <Text className="text-[11px] font-bold text-white">Add ORS</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      {loading ? (
        <View className="items-center py-5">
          <ActivityIndicator size="small" color="#7c3aed" />
          <Text className="text-[11px] text-gray-400 mt-2">
            Loading ORS entries…
          </Text>
        </View>
      ) : entries.length === 0 ? (
        <View className="items-center py-5 gap-1.5">
          <MaterialIcons name="receipt-long" size={26} color="#ddd6fe" />
          <Text className="text-[12px] text-gray-400">
            No ORS entries linked to this PR.
          </Text>
          {canEdit && (
            <TouchableOpacity
              onPress={() => setEditOrs(null)}
              activeOpacity={0.8}
              className="mt-1.5 flex-row items-center gap-1.5 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2"
            >
              <MaterialIcons name="add" size={13} color="#7c3aed" />
              <Text className="text-[12px] font-bold text-violet-700">
                Create ORS Entry
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View className="px-3 pt-2 pb-3 gap-1.5">
          {entries.map((entry, i) => (
            <View
              key={entry.id}
              className={`flex-row items-center px-3 py-2.5 rounded-xl ${
                i % 2 === 0 ? "bg-white" : "bg-gray-50"
              }`}
              style={{ borderWidth: 1, borderColor: "#ede9fe" }}
            >
              <View className="flex-1 gap-0.5">
                <Text
                  className="text-[12px] font-bold text-violet-800"
                  style={{ fontFamily: MONO }}
                >
                  {entry.ors_no}
                </Text>
                {entry.notes ? (
                  <Text
                    className="text-[10.5px] text-gray-400"
                    numberOfLines={1}
                  >
                    {entry.notes}
                  </Text>
                ) : null}
              </View>
              <Text
                className="text-[12px] font-semibold text-gray-700 mr-2"
              >
                <Text style={{ fontFamily: undefined }}>{"\u20B1"}</Text>
                <Text style={{ fontFamily: MONO }}>{fmt(entry.amount)}</Text>
              </Text>
              <OrsStatusPill status={entry.status} />

              {/* Preview + edit + delete */}
              <View className="flex-row items-center gap-1.5 ml-2">
                <TouchableOpacity
                  onPress={() => openReadOnlyPreview(entry)}
                  hitSlop={8}
                >
                  <MaterialIcons name="visibility" size={15} color="#6b7280" />
                </TouchableOpacity>
                {canEdit && (
                  <>
                    <TouchableOpacity
                      onPress={() => setEditOrs(entry)}
                      hitSlop={8}
                    >
                      <MaterialIcons name="edit" size={15} color="#7c3aed" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(entry)}
                      hitSlop={8}
                    >
                      <MaterialIcons
                        name="delete-outline"
                        size={15}
                        color="#ef4444"
                      />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          ))}

          {/* Inline total */}
          <View className="flex-row items-center justify-between px-3 py-2 bg-violet-50 rounded-xl border border-violet-100 mt-1">
            <Text className="text-[10.5px] font-bold text-violet-700 uppercase tracking-wide">
              Total Obligated
            </Text>
            <Text
              className="text-[12px] font-extrabold text-violet-800"
            >
              <Text style={{ fontFamily: undefined }}>{"\u20B1"}</Text>
              <Text style={{ fontFamily: MONO }}>
                {fmt(entries.reduce((s, e) => s + e.amount, 0))}
              </Text>
            </Text>
          </View>
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
          fiscalYear={fiscalYear}
        />
      )}

      {/* Read-only ORS preview */}
      {previewHtml !== null && (
        <Modal
          visible
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setPreviewHtml(null)}
        >
          <SafeAreaView className="flex-1 bg-white">
            <View className="bg-violet-700 px-5 pt-4 pb-4 flex-row items-center justify-between">
              <View>
                <Text className="text-[10px] font-bold tracking-widest uppercase text-white/40">
                  ORS Preview
                </Text>
                <Text className="text-[16px] font-black text-white">
                  Obligation Request and Status
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setPreviewHtml(null)}
                hitSlop={10}
                className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center"
              >
                <MaterialIcons name="close" size={17} color="#fff" />
              </TouchableOpacity>
            </View>
            <ORSPreviewPanel
              html={previewHtml}
              showActions
              style={{ flex: 1 }}
            />
          </SafeAreaView>
        </Modal>
      )}
    </View>
  );
}
