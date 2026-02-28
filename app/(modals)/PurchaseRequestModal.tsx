/**
 * PurchaseRequestModal.tsx
 *
 * On submit, assembles a Supabase-ready payload and passes it to the parent.
 * The parent (ProcurementContent) owns the DB insert and local list update.
 *
 * Changes from previous version:
 *  - PRFormState replaced by PRSubmitPayload (typed for Supabase)
 *  - PR number received as `generatedPRNo` prop (parent generates it async)
 *  - onSubmit is now required and receives { pr, items, prNo }
 */

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import {
  Animated, Easing, KeyboardAvoidingView, Modal,
  Platform, ScrollView, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import type { PRItemRow, PRRow } from "../../lib/supabase";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface LineItem {
  id: number; // local key only — not stored in DB
  desc: string; stock: string; unit: string; qty: string; price: string;
}

/** DB-ready payload emitted by onSubmit */
export interface PRSubmitPayload {
  pr: Omit<PRRow, "id" | "created_at">;
  items: Omit<PRItemRow, "id" | "pr_id">[];
  prNo: string;
}

export interface PRModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: PRSubmitPayload) => void;
  /** Pre-generated PR number from the parent (fetched async before opening) */
  generatedPRNo?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HIGH_VALUE_THRESHOLD = 10_000;

const UNITS = [
  "pc", "ream", "box", "set", "pair", "bottle",
  "kg", "liter", "gallon", "pack", "roll", "sheet", "meter", "unit",
];
const SECTIONS = [
  "STOD", "LTSP", "ARBDSP", "Legal", "PARPO", "PARAD", "TDG Unit", "Budget", "Accounting",
];
// Replace with expo-document-picker for real file selection
const MOCK_PROPOSAL_FILES = [
  "ProjectProposal_2026.pdf", "ActivityProposal_Q1.pdf",
  "BudgetProposal_ARBDSP.docx", "PPMPAttachment.pdf",
];

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const TODAY_DISPLAY = new Date().toLocaleDateString("en-PH", {
  year: "numeric", month: "long", day: "numeric",
});

const CLR = {
  green900: "#1a4d2e", green700: "#2d6a4f", green400: "#52b788",
  amber900: "#7a5000", amber800: "#4a3200",
  gold: "#c9a84c", gold50: "#fdf5e0",
} as const;

interface FormState {
  officeSection: string; responsibilityCode: string; purpose: string;
  items: LineItem[]; budgetNumber: string; papCode: string; proposalFileName: string;
}
const emptyForm = (): FormState => ({
  officeSection: "", responsibilityCode: "", purpose: "",
  items: [], budgetNumber: "", papCode: "", proposalFileName: "",
});
const makeItem  = (id: number): LineItem => ({ id, desc: "", stock: "", unit: "", qty: "", price: "" });
const fmtPHP    = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── PickerSheet (bottom-sheet selector) ─────────────────────────────────────

function PickerSheet({ title, options, selected, onSelect, onClose }: {
  title: string; options: string[]; selected: string;
  onSelect: (v: string) => void; onClose: () => void;
}) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity className="flex-1 bg-black/50" activeOpacity={1} onPress={onClose} />
      <View className="bg-white rounded-t-3xl" style={{ maxHeight: "55%" }}>
        <View className="items-center pt-3 pb-1">
          <View className="w-10 h-1 rounded-full bg-gray-300" />
        </View>
        <View className="flex-row items-center justify-between px-5 py-3 border-b border-gray-100">
          <Text className="text-[15px] font-bold text-gray-800">{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Text className="text-[13px] font-semibold text-emerald-700">Done</Text>
          </TouchableOpacity>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {options.map((opt) => {
            const active = opt === selected;
            return (
              <TouchableOpacity key={opt} onPress={() => { onSelect(opt); onClose(); }} activeOpacity={0.7}
                className={`flex-row items-center justify-between px-5 py-3.5 border-b border-gray-50 ${active ? "bg-emerald-50" : ""}`}>
                <Text className={`text-[14px] ${active ? "font-bold text-emerald-800" : "text-gray-700"}`}>{opt}</Text>
                {active && <Text className="text-emerald-600">✓</Text>}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Small field atoms ────────────────────────────────────────────────────────

function SectionLabel({ children, tag }: { children: string; tag?: string }) {
  return (
    <View className="flex-row items-center gap-2 mb-3 mt-1">
      <Text className="text-[10.5px] font-bold uppercase tracking-widest text-gray-400">{children}</Text>
      {tag && <Text className="text-[9.5px] font-bold uppercase tracking-wide text-amber-600">{tag}</Text>}
      <View className="flex-1 h-px bg-gray-200" />
    </View>
  );
}

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <View className="mb-4">
      <View className="flex-row items-center gap-1 mb-1.5">
        <Text className="text-[12px] font-semibold text-gray-700">{label}</Text>
        {required && <Text className="text-[12px] font-bold text-red-500">*</Text>}
        {hint && <Text className="text-[11px] text-gray-400 ml-1">{hint}</Text>}
      </View>
      {children}
    </View>
  );
}

function ReadonlyInput({ value }: { value: string }) {
  return (
    <View className="bg-gray-100 border border-gray-200 rounded-xl px-3.5 py-2.5">
      <Text className="text-[12.5px] text-gray-500" style={{ fontFamily: MONO }}>{value}</Text>
    </View>
  );
}

function StyledInput({ value, onChangeText, placeholder, keyboardType, multiline, numberOfLines }: {
  value: string; onChangeText: (t: string) => void; placeholder?: string;
  keyboardType?: "default" | "numeric" | "decimal-pad";
  multiline?: boolean; numberOfLines?: number;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value} onChangeText={onChangeText} placeholder={placeholder}
      placeholderTextColor="#9ca3af" keyboardType={keyboardType ?? "default"}
      multiline={multiline} numberOfLines={numberOfLines}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      className={`rounded-xl px-3.5 py-2.5 text-[13.5px] text-gray-800 border bg-white ${focused ? "border-emerald-500" : "border-gray-200"} ${multiline ? "min-h-[88px]" : ""}`}
      style={multiline ? { textAlignVertical: "top" } : undefined}
    />
  );
}

function SelectTrigger({ value, options, placeholder, title, onSelect }: {
  value: string; options: string[]; placeholder: string; title: string; onSelect: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} activeOpacity={0.8}
        className="flex-row items-center justify-between bg-white border border-gray-200 rounded-xl px-3.5 py-2.5">
        <Text className={`text-[13.5px] flex-1 ${value ? "text-gray-800" : "text-gray-400"}`}>{value || placeholder}</Text>
        <Text className="text-gray-400 text-xs ml-2">▾</Text>
      </TouchableOpacity>
      {open && <PickerSheet title={title} options={options} selected={value} onSelect={onSelect} onClose={() => setOpen(false)} />}
    </>
  );
}

// ─── ItemRow ──────────────────────────────────────────────────────────────────

function ItemRow({ item, onUpdate, onRemove }: {
  item: LineItem;
  onUpdate: (id: number, field: keyof LineItem, value: string) => void;
  onRemove: (id: number) => void;
}) {
  const [unitOpen, setUnitOpen] = useState(false);
  const subtotal = parseFloat(item.qty || "0") * parseFloat(item.price || "0") || 0;

  return (
    <View className="bg-white border border-gray-200 rounded-2xl mb-3 overflow-hidden">
      <View className="flex-row items-center px-3.5 pt-3.5 pb-2.5 gap-2">
        <TextInput value={item.desc} onChangeText={(v) => onUpdate(item.id, "desc", v)}
          placeholder="Item description…" placeholderTextColor="#9ca3af"
          className="flex-1 text-[13px] text-gray-800 font-medium" />
        <TouchableOpacity onPress={() => onRemove(item.id)} hitSlop={8}
          className="w-7 h-7 rounded-full bg-red-50 items-center justify-center border border-red-100">
          <Text className="text-red-400 text-[12px] font-bold leading-none">✕</Text>
        </TouchableOpacity>
      </View>
      <View className="h-px bg-gray-100 mx-3.5" />
      <View className="flex-row items-center gap-2 px-3.5 py-2.5">
        <TextInput value={item.stock} onChangeText={(v) => onUpdate(item.id, "stock", v)}
          placeholder="Stock No." placeholderTextColor="#9ca3af"
          className="flex-1 text-[12px] text-gray-700 bg-gray-50 rounded-lg px-2.5 py-2 border border-gray-100" />
        <TouchableOpacity onPress={() => setUnitOpen(true)}
          className="flex-row items-center gap-1 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-2 min-w-[56px]">
          <Text className="text-[12px] text-gray-700 flex-1" numberOfLines={1}>{item.unit || "Unit"}</Text>
          <Text className="text-gray-400 text-[10px]">▾</Text>
        </TouchableOpacity>
        <TextInput value={item.qty} onChangeText={(v) => onUpdate(item.id, "qty", v)}
          placeholder="Qty" placeholderTextColor="#9ca3af" keyboardType="numeric"
          className="w-14 text-[12px] text-gray-700 bg-gray-50 rounded-lg px-2 py-2 border border-gray-100 text-center" />
        <TextInput value={item.price} onChangeText={(v) => onUpdate(item.id, "price", v)}
          placeholder="₱ 0.00" placeholderTextColor="#9ca3af" keyboardType="decimal-pad"
          className="w-24 text-[12px] text-gray-700 bg-gray-50 rounded-lg px-2.5 py-2 border border-gray-100 text-right" />
      </View>
      {subtotal > 0 && (
        <View className="flex-row justify-end px-3.5 pb-2.5">
          <Text className="text-[11px] text-gray-400">
            Subtotal: <Text className="font-semibold text-gray-600">₱{fmtPHP(subtotal)}</Text>
          </Text>
        </View>
      )}
      {unitOpen && (
        <PickerSheet title="Select Unit" options={UNITS} selected={item.unit}
          onSelect={(v) => onUpdate(item.id, "unit", v)} onClose={() => setUnitOpen(false)} />
      )}
    </View>
  );
}

// ─── TotalBar ─────────────────────────────────────────────────────────────────

function TotalBar({ total, isHighValue }: { total: number; isHighValue: boolean }) {
  return (
    <View className="rounded-2xl px-4 py-3.5 flex-row items-center justify-between"
      style={{ backgroundColor: isHighValue ? CLR.amber800 : CLR.green900 }}>
      <Text className="text-[11px] font-bold uppercase tracking-widest text-white/60">Total Cost</Text>
      <View className="flex-row items-baseline gap-1">
        <Text className="text-[13px] font-medium text-white/50">₱</Text>
        <Text className="text-[22px] font-semibold text-white" style={{ fontFamily: MONO }}>{fmtPHP(total)}</Text>
      </View>
    </View>
  );
}

// ─── HighValueSection (animated reveal) ──────────────────────────────────────

function HighValueSection({ visible, justUnlocked, form, setField }: {
  visible: boolean; justUnlocked: boolean;
  form: FormState; setField: (f: keyof FormState, v: string) => void;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const [fileOpen, setFileOpen] = useState(false);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: 500, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: false,
    }).start();
  }, [visible]);

  return (
    <Animated.View style={{
      maxHeight: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1000] }),
      opacity:   progress.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0, 1] }),
      overflow:  "hidden",
    }}>
      <View className="flex-row items-center gap-2 mb-4 mt-2">
        <View className="flex-1 h-px" style={{ backgroundColor: CLR.gold }} />
        <Text className="text-[9.5px] font-bold uppercase tracking-widest" style={{ color: CLR.gold }}>
          High-Value Fields
        </Text>
        <View className="flex-1 h-px" style={{ backgroundColor: CLR.gold }} />
      </View>

      {justUnlocked && (
        <View className="flex-row items-start gap-3 rounded-2xl p-3.5 mb-4 border-l-4"
          style={{ backgroundColor: "#fff8e6", borderLeftColor: CLR.gold }}>
          <Text className="text-base mt-0.5">⚠️</Text>
          <View className="flex-1">
            <Text className="text-[12.5px] font-bold text-amber-800">Total crossed ₱10,000</Text>
            <Text className="text-[11.5px] text-gray-600 mt-0.5 leading-[18px]">
              Complete the Budget & Proposal fields below before submitting.
            </Text>
          </View>
        </View>
      )}

      <View className="flex-row items-center gap-3 rounded-2xl p-4 mb-4 border"
        style={{ backgroundColor: CLR.gold50, borderColor: "#e8d08a" }}>
        <Text className="text-2xl">🏛️</Text>
        <View className="flex-1">
          <Text className="text-[13px] font-bold" style={{ color: CLR.amber900 }}>
            High-Value Procurement Unlocked
          </Text>
          <Text className="text-[11.5px] text-gray-500 mt-0.5 leading-[17px]">
            A Project Proposal and Budget details are now required.
          </Text>
        </View>
      </View>

      <SectionLabel tag="REQUIRED FOR >10K">Budget & Project Information</SectionLabel>

      <Field label="Budget Number" required hint="from PPMP">
        <StyledInput value={form.budgetNumber} onChangeText={(v) => setField("budgetNumber", v)}
          placeholder="e.g. 2026-PPMP-00X" />
      </Field>
      <Field label="PAP / Activity Code" required>
        <StyledInput value={form.papCode} onChangeText={(v) => setField("papCode", v)}
          placeholder="e.g. ARBDSP-2026-001" />
      </Field>

      <Field label="Project / Activity Proposal" required>
        <TouchableOpacity onPress={() => setFileOpen(true)} activeOpacity={0.8}
          className={`rounded-2xl border-2 border-dashed px-4 py-5 items-center gap-1.5 ${form.proposalFileName ? "border-emerald-400 bg-emerald-50" : "border-gray-300 bg-gray-50"}`}>
          <Text className="text-3xl">{form.proposalFileName ? "✅" : "📄"}</Text>
          {form.proposalFileName
            ? <Text className="text-[12.5px] font-semibold text-emerald-700 text-center">{form.proposalFileName}</Text>
            : <>
                <Text className="text-[13px] font-semibold text-gray-600">Tap to attach proposal</Text>
                <Text className="text-[11.5px] text-gray-400">PDF or DOCX · Max 10 MB</Text>
              </>
          }
        </TouchableOpacity>
      </Field>

      {fileOpen && (
        <PickerSheet title="Select Proposal File" options={MOCK_PROPOSAL_FILES}
          selected={form.proposalFileName} onSelect={(v) => setField("proposalFileName", v)}
          onClose={() => setFileOpen(false)} />
      )}
    </Animated.View>
  );
}

// ─── NextFlow ─────────────────────────────────────────────────────────────────

function NextFlow({ isHighValue }: { isHighValue: boolean }) {
  const steps = isHighValue
    ? ["PR + Proposal", "Div. Head", "BAC (APP)", "Budget", "PARPO"]
    : ["You Submit PR",  "Div. Head", "BAC",       "Budget", "PARPO"];
  return (
    <View className="rounded-2xl px-4 py-4 mt-5 border"
      style={{ backgroundColor: isHighValue ? "#fff8e6" : "#edfbf2", borderColor: isHighValue ? "#e8d08a" : "#b7e4c7" }}>
      <Text className="text-[10px] font-bold uppercase tracking-widest mb-3"
        style={{ color: isHighValue ? CLR.amber900 : CLR.green700 }}>
        What happens after you submit?
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row items-center gap-1.5">
          {steps.map((step, i) => (
            <React.Fragment key={step}>
              <View className="px-3 py-1.5 rounded-full border"
                style={i === 0
                  ? { backgroundColor: isHighValue ? CLR.amber800 : CLR.green900, borderColor: "transparent" }
                  : { backgroundColor: "rgba(255,255,255,0.7)", borderColor: isHighValue ? "rgba(201,168,76,0.35)" : "rgba(82,183,136,0.35)" }}>
                <Text className="text-[11px] font-semibold"
                  style={{ color: i === 0 ? "#fff" : isHighValue ? CLR.amber900 : CLR.green900 }}>
                  {step}
                </Text>
              </View>
              {i < steps.length - 1 && (
                <Text className="text-[12px]" style={{ color: isHighValue ? CLR.gold : CLR.green400 }}>→</Text>
              )}
            </React.Fragment>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── ModalHeader ──────────────────────────────────────────────────────────────

function ModalHeader({ isHighValue, prNo, onClose }: {
  isHighValue: boolean; prNo: string; onClose: () => void;
}) {
  const steps = isHighValue
    ? ["PR+Proposal", "Div.Head", "BAC(APP)", "Budget", "PARPO"]
    : ["PR Details",  "Div.Head", "BAC",      "Budget", "PARPO"];

  return (
    <View className="px-5 pt-5 pb-4" style={{ backgroundColor: isHighValue ? CLR.amber800 : CLR.green900 }}>
      <View className="flex-row items-start justify-between mb-4">
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-xl items-center justify-center bg-white/10">
            <Text className="text-xl">🌾</Text>
          </View>
          <View>
            <Text className="text-[10px] font-bold uppercase tracking-widest text-white/50">DAR · Procurement</Text>
            <Text className="text-[16px] font-bold text-white">Purchase Request</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={10}
          className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center">
          <Text className="text-white text-[20px] leading-none font-light">×</Text>
        </TouchableOpacity>
      </View>

      <View className="flex-row items-center justify-between mb-4">
        <View className="flex-row items-center gap-2 px-3 py-1.5 rounded-full"
          style={{ backgroundColor: isHighValue ? "rgba(201,168,76,0.3)" : "rgba(82,183,136,0.25)" }}>
          <View className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: isHighValue ? "#fde68a" : "#a7f3c4" }} />
          <Text className="text-[10.5px] font-bold uppercase tracking-wide"
            style={{ color: isHighValue ? "#fde68a" : "#a7f3c4" }}>
            {isHighValue ? "High-Value · > ₱10,000" : "Standard · ≤ ₱10,000"}
          </Text>
        </View>
        <View className="px-2.5 py-1 rounded-md bg-white/10 border border-white/20">
          <Text className="text-[10.5px] text-white/50" style={{ fontFamily: MONO }}>{prNo}</Text>
        </View>
      </View>

      <View className="flex-row rounded-xl overflow-hidden" style={{ backgroundColor: "rgba(0,0,0,0.2)" }}>
        {steps.map((label, i) => (
          <React.Fragment key={label}>
            {i > 0 && <View className="w-px self-stretch bg-white/10" />}
            <View className="flex-1 py-2.5 px-1 items-center"
              style={i === 0 ? { backgroundColor: "rgba(255,255,255,0.15)" } : undefined}>
              <Text numberOfLines={1} style={{ fontSize: 9, fontWeight: "700", letterSpacing: 0.3, textTransform: "uppercase", textAlign: "center", color: i === 0 ? "#fff" : "rgba(255,255,255,0.35)" }}>
                {`${["①","②","③","④","⑤"][i]} ${label}`}
              </Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

// ─── PurchaseRequestModal ─────────────────────────────────────────────────────

export function PurchaseRequestModal({ visible, onClose, onSubmit, generatedPRNo }: PRModalProps) {
  const [form, setForm]                 = useState<FormState>(emptyForm);
  const [nextId, setNextId]             = useState(2);
  const [justUnlocked, setJustUnlocked] = useState(false);
  const prevHighValue = useRef(false);
  const scrollRef     = useRef<ScrollView>(null);

  const setField   = useCallback((field: keyof FormState, value: string) =>
    setForm((f) => ({ ...f, [field]: value })), []);

  const addItem    = useCallback(() =>
    setNextId((n) => { setForm((f) => ({ ...f, items: [...f.items, makeItem(n)] })); return n + 1; }), []);

  const removeItem = useCallback((id: number) =>
    setForm((f) => ({ ...f, items: f.items.filter((i) => i.id !== id) })), []);

  const updateItem = useCallback((id: number, field: keyof LineItem, value: string) =>
    setForm((f) => ({ ...f, items: f.items.map((i) => i.id === id ? { ...i, [field]: value } : i) })), []);

  const total = useMemo(
    () => form.items.reduce((s, i) => s + (parseFloat(i.qty || "0") * parseFloat(i.price || "0") || 0), 0),
    [form.items]
  );
  const isHighValue = total >= HIGH_VALUE_THRESHOLD;
  const hasItems    = form.items.some((i) => i.desc && i.qty && i.price);
  const hvComplete  = !isHighValue || (!!form.budgetNumber && !!form.papCode && !!form.proposalFileName);
  const isValid     = hasItems && hvComplete && !!form.officeSection && !!form.purpose;

  useEffect(() => {
    if (isHighValue && !prevHighValue.current) {
      setJustUnlocked(true);
      const t = setTimeout(() => setJustUnlocked(false), 4500);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 350);
      return () => clearTimeout(t);
    }
    prevHighValue.current = isHighValue;
  }, [isHighValue]);

  useEffect(() => {
    if (!visible) {
      setForm(emptyForm()); setNextId(2);
      setJustUnlocked(false); prevHighValue.current = false;
    }
  }, [visible]);

  useEffect(() => { if (visible && form.items.length === 0) addItem(); }, [visible]);

  // ── Build Supabase-ready payload on submit ────────────────────────────────

  const handleSubmit = useCallback(() => {
    const prNo = generatedPRNo ?? `${new Date().getFullYear()}-PR-DRAFT`;

    const pr: Omit<PRRow, "id" | "created_at"> = {
      pr_no:          prNo,
      office_section: form.officeSection,
      resp_code:      form.responsibilityCode,
      purpose:        form.purpose,
      total_cost:     total,
      is_high_value:  isHighValue,
      status:         "pending",
      budget_number:  form.budgetNumber   || null,
      pap_code:       form.papCode        || null,
      proposal_file:  form.proposalFileName || null,
    };

    const items: Omit<PRItemRow, "id" | "pr_id">[] = form.items
      .filter((i) => i.desc && i.qty && i.price)
      .map((i) => ({
        description: i.desc,
        stock_no:    i.stock,
        unit:        i.unit,
        quantity:    parseFloat(i.qty),
        unit_price:  parseFloat(i.price),
        subtotal:    parseFloat(i.qty) * parseFloat(i.price),
      }));

    onSubmit({ pr, items, prNo });
    onClose();
  }, [form, total, isHighValue, generatedPRNo, onSubmit, onClose]);

  const prNoDisplay = generatedPRNo ?? "Generating…";

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView className="flex-1 bg-white" behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ModalHeader isHighValue={isHighValue} prNo={prNoDisplay} onClose={onClose} />

        <ScrollView ref={scrollRef} className="flex-1 bg-gray-50"
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 20 }}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <View className="flex-row items-start gap-3 bg-emerald-50 border-l-4 border-emerald-400 rounded-2xl p-3.5 mb-5">
            <Text className="text-[15px] mt-0.5">ℹ️</Text>
            <Text className="flex-1 text-[12.5px] text-gray-700 leading-[19px]">
              Initiates <Text className="font-bold text-gray-800">Stage 1</Text> of procurement.
              Routes to Division Head → BAC → Budget → PARPO.
              {isHighValue && <Text className="font-bold text-amber-700"> High-value fields are now required.</Text>}
            </Text>
          </View>

          <SectionLabel>Reference Information</SectionLabel>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="PR No." required hint="Auto-generated">
                <ReadonlyInput value={prNoDisplay} />
              </Field>
            </View>
            <View className="flex-1">
              <Field label="Date" required>
                <ReadonlyInput value={TODAY_DISPLAY} />
              </Field>
            </View>
          </View>

          <Field label="Office / Section" required>
            <SelectTrigger value={form.officeSection} options={SECTIONS}
              placeholder="Select section…" title="Office / Section"
              onSelect={(v) => setField("officeSection", v)} />
          </Field>
          <Field label="Responsibility Center Code">
            <StyledInput value={form.responsibilityCode}
              onChangeText={(v) => setField("responsibilityCode", v)} placeholder="e.g. 10-001" />
          </Field>

          <SectionLabel>Items Requested</SectionLabel>
          {form.items.map((item) => (
            <ItemRow key={item.id} item={item} onUpdate={updateItem} onRemove={removeItem} />
          ))}
          <TouchableOpacity onPress={addItem} activeOpacity={0.8}
            className="flex-row items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50 mb-3.5">
            <Text className="text-emerald-700 text-xl leading-none">＋</Text>
            <Text className="text-[13px] font-bold text-emerald-700">Add Item</Text>
          </TouchableOpacity>

          <TotalBar total={total} isHighValue={isHighValue} />

          <View className="mt-4">
            <HighValueSection visible={isHighValue} justUnlocked={justUnlocked}
              form={form} setField={setField} />
          </View>

          <SectionLabel>Purpose</SectionLabel>
          <Field label="Purpose / Justification" required>
            <StyledInput value={form.purpose} onChangeText={(v) => setField("purpose", v)}
              placeholder={isHighValue
                ? "Describe the project or activity requiring this expenditure…"
                : "Briefly describe why these items are needed and how they will be used…"}
              multiline numberOfLines={4} />
          </Field>

          <NextFlow isHighValue={isHighValue} />
        </ScrollView>

        <View className="flex-row items-center justify-between px-5 py-4 bg-white border-t border-gray-100">
          <Text className="text-[11.5px] text-gray-400">Requested by: —</Text>
          <View className="flex-row items-center gap-2.5">
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}
              className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white">
              <Text className="text-[13.5px] font-semibold text-gray-500">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSubmit} disabled={!isValid} activeOpacity={0.8}
              className={`px-5 py-2.5 rounded-xl ${!isValid ? "opacity-40" : ""}`}
              style={{ backgroundColor: isHighValue ? CLR.amber800 : CLR.green900 }}>
              <Text className="text-[13.5px] font-bold text-white">
                {isHighValue ? "Submit High-Value PR" : "Create PR"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default PurchaseRequestModal;
