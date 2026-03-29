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

import type { PRItemRow, PRRow } from "@/lib/supabase/index";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import WebView from "react-native-webview";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface LineItem {
  id: number; // local key only — not stored in DB
  desc: string;
  stock: string;
  unit: string;
  qty: string;
  price: string;
}

/** DB-ready payload emitted by onSubmit */
export interface PRSubmitPayload {
  pr: Omit<PRRow, "id" | "created_at">;
  items: Omit<PRItemRow, "id" | "pr_id">[];
  prNo: string;
  proposalNo: string;
  divisionId: number;
}

export interface PRModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: PRSubmitPayload) => void;
  /** Logged-in user — division_name is used to auto-fill the read-only Office/Section field */
  currentUser?: {
    division_name?: string | null;
    division_id?: number | null;
    [key: string]: any;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HIGH_VALUE_THRESHOLD = 10_000;

const UNITS = [
  "pc",
  "ream",
  "box",
  "set",
  "pair",
  "bottle",
  "kg",
  "liter",
  "gallon",
  "pack",
  "roll",
  "sheet",
  "meter",
  "unit",
];
const SECTIONS = [
  "STOD",
  "LTSP",
  "ARBDSP",
  "Legal",
  "PARPO",
  "PARAD",
  "TDG Unit",
  "Budget",
  "Accounting",
];
const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const TODAY_DISPLAY = new Date().toLocaleDateString("en-PH", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

const CLR = {
  brand900: "#064E3B",
  brand700: "#047857",
  brand500: "#10B981",
  brand100: "#A7F3D0",
  brand50: "#ECFDF5",
  hv900: "#022c22",
  hv700: "#065F46",
  hv50: "#D1FAE5",
} as const;

interface FormState {
  entityName: string;
  fundCluster: string;
  officeSection: string;
  responsibilityCode: string;
  purpose: string;
  reqName: string;
  reqDesig: string;
  appName: string;
  appDesig: string;
  items: LineItem[];
  budgetNumber: string;
  papCode: string;
  proposalNumber: string;
}
const emptyForm = (): FormState => ({
  entityName: "DAR — Camarines Sur 1",
  fundCluster: "",
  officeSection: "",
  responsibilityCode: "",
  purpose: "",
  reqName: "",
  reqDesig: "",
  appName: "",
  appDesig: "",
  items: [],
  budgetNumber: "",
  papCode: "",
  proposalNumber: "",
});
const makeItem = (id: number): LineItem => ({
  id,
  desc: "",
  stock: "",
  unit: "",
  qty: "",
  price: "",
});
const fmtPHP = (n: number) =>
  n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// ─── PDF HTML builder (mirrors ViewPRModal exactly) ───────────────────────────

function buildPRHtml(
  fields: {
    prNo: string;
    entityName: string;
    fundCluster: string;
    officeSection: string;
    purpose: string;
    respCode: string;
    date: string;
    reqName: string;
    reqDesig: string;
    appName: string;
    appDesig: string;
  },
  items: LineItem[],
): string {
  const f = (n: number) =>
    n.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const padded = [...items];
  while (padded.length < 30)
    padded.push({ id: 0, desc: "", stock: "", unit: "", qty: "", price: "" });

  const rows = padded
    .map((it) => {
      const qty = parseFloat(it.qty || "0");
      const price = parseFloat(it.price || "0");
      const total = qty * price || 0;
      return `<tr>
      <td style="border:1px solid black;font-size:8pt;padding:1px 3px;text-align:center;font-family:'Times New Roman',serif;height:16px">${it.stock || ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:1px 3px;text-align:center;font-family:'Times New Roman',serif">${it.unit || ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:1px 4px;text-align:left;font-family:'Times New Roman',serif">${it.desc || ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:1px 3px;text-align:center;font-family:'Times New Roman',serif">${qty || ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:1px 3px;text-align:right;font-family:'Times New Roman',serif">${price ? f(price) : ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:1px 3px;text-align:right;font-family:'Times New Roman',serif">${total > 0 ? f(total) : ""}</td>
    </tr>`;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Times New Roman',Times,serif;font-size:9pt;color:#000;background:#fff;padding:24px}table{width:100%;border-collapse:collapse;table-layout:fixed;color:#000}@media print{body{padding:10mm}@page{margin:8mm}}</style>
</head><body>
<table>
  <colgroup><col style="width:12%"/><col style="width:8%"/><col style="width:40%"/><col style="width:10%"/><col style="width:15%"/><col style="width:15%"/></colgroup>
  <tbody>
    <tr style="height:27px"><td colspan="6" style="text-align:right;font-size:10pt;padding-right:4px;font-family:'Times New Roman',serif">Appendix 60</td></tr>
    <tr style="height:34px"><td colspan="6" style="text-align:center;font-weight:bold;font-size:12pt;font-family:'Times New Roman',serif">PURCHASE REQUEST</td></tr>
    <tr style="height:21px">
      <td colspan="2" style="border-bottom:1px solid black;font-size:8pt;padding:2px 4px;font-family:'Times New Roman',serif;font-weight:bold">Entity Name: <span style="font-weight:normal">${fields.entityName}</span></td>
      <td style="border-bottom:1px solid black"></td>
      <td colspan="3" style="border-bottom:1px solid black;font-size:8pt;padding:2px 4px;font-family:'Times New Roman',serif;font-weight:bold">Fund Cluster: <span style="font-weight:normal">${fields.fundCluster}</span></td>
    </tr>
    <tr style="height:14px">
      <td rowspan="2" colspan="2" style="border:1px solid black;font-size:8pt;vertical-align:top;padding:2px 4px;font-family:'Times New Roman',serif">Office/Section :<br/>${fields.officeSection}</td>
      <td colspan="2" style="border-top:1px solid black;border-left:1px solid black;border-right:1px solid black;font-size:8pt;font-weight:bold;padding:2px 4px;font-family:'Times New Roman',serif">PR No.: <span style="font-weight:normal">${fields.prNo}</span></td>
      <td rowspan="2" colspan="2" style="border:1px solid black;font-size:8pt;font-weight:bold;vertical-align:top;padding:2px 4px;font-family:'Times New Roman',serif">Date:<br/><span style="font-weight:normal">${fields.date}</span></td>
    </tr>
    <tr style="height:15px">
      <td colspan="2" style="border-bottom:1px solid black;border-left:1px solid black;font-size:8pt;font-weight:bold;padding:2px 4px;font-family:'Times New Roman',serif">Responsibility Center Code: <span style="font-weight:normal">${fields.respCode}</span></td>
    </tr>
    <tr style="height:22.5px">
      <th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;text-align:center;font-weight:bold">Stock/<br/>Property No.</th>
      <th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;text-align:center;font-weight:bold">Unit</th>
      <th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;text-align:center;font-weight:bold">Item Description</th>
      <th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;text-align:center;font-weight:bold">Quantity</th>
      <th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;text-align:center;font-weight:bold">Unit Cost</th>
      <th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;text-align:center;font-weight:bold">Total Cost</th>
    </tr>
    ${rows}
    <tr style="height:17px"><td colspan="6" style="border-top:1px solid black;border-left:1px solid black;border-right:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif"><b>Purpose:</b> ${fields.purpose}</td></tr>
    <tr style="height:30px"><td colspan="6" style="border-bottom:1px solid black;border-left:1px solid black;border-right:1px solid black"></td></tr>
    <tr style="height:12px">
      <td style="border-top:1px solid black;border-left:1px solid black"></td>
      <td colspan="2" style="border-top:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif"><i>Requested by:</i></td>
      <td colspan="2" style="border-top:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif"><i>Approved by:</i></td>
      <td style="border-top:1px solid black;border-right:1px solid black"></td>
    </tr>
    <tr style="height:12px">
      <td colspan="2" style="border-left:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif">Signature :</td>
      <td></td><td></td><td></td><td style="border-right:1px solid black"></td>
    </tr>
    <tr style="height:12px">
      <td colspan="2" style="border-left:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif">Printed Name :</td>
      <td style="font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif">${fields.reqName}</td>
      <td colspan="2" style="font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif">${fields.appName}</td>
      <td style="border-right:1px solid black"></td>
    </tr>
    <tr style="height:14.75px">
      <td colspan="2" style="border-bottom:1px solid black;border-left:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif">Designation :</td>
      <td style="border-bottom:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif">${fields.reqDesig}</td>
      <td colspan="2" style="border-bottom:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif">${fields.appDesig}</td>
      <td style="border-bottom:1px solid black;border-right:1px solid black"></td>
    </tr>
  </tbody>
</table>
</body></html>`;
}

// ─── PickerSheet (bottom-sheet selector) ─────────────────────────────────────

function PickerSheet({
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  title: string;
  options: string[];
  selected: string;
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity
        className="flex-1 bg-black/50"
        activeOpacity={1}
        onPress={onClose}
      />
      <View className="bg-white rounded-t-3xl" style={{ maxHeight: "55%" }}>
        <View className="items-center pt-3 pb-1">
          <View className="w-10 h-1 rounded-full bg-gray-300" />
        </View>
        <View className="flex-row items-center justify-between px-5 py-3 border-b border-gray-100">
          <Text className="text-[15px] font-bold text-gray-800">{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Text className="text-[13px] font-semibold text-emerald-700">
              Done
            </Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {options.map((opt) => {
            const active = opt === selected;
            return (
              <TouchableOpacity
                key={opt}
                onPress={() => {
                  onSelect(opt);
                  onClose();
                }}
                activeOpacity={0.7}
                className={`flex-row items-center justify-between px-5 py-3.5 border-b border-gray-50 ${active ? "bg-emerald-50" : ""}`}
              >
                <Text
                  className={`text-[14px] ${active ? "font-bold text-emerald-800" : "text-gray-700"}`}
                >
                  {opt}
                </Text>
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
      <Text className="text-[10.5px] font-bold uppercase tracking-widest text-gray-400">
        {children}
      </Text>
      {tag && (
        <Text className="text-[9.5px] font-bold uppercase tracking-wide text-emerald-500">
          {tag}
        </Text>
      )}
      <View className="flex-1 h-px bg-gray-200" />
    </View>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-4">
      <View className="flex-row items-center gap-1 mb-1.5">
        <Text className="text-[12px] font-semibold text-gray-700">{label}</Text>
        {required && (
          <Text className="text-[12px] font-bold text-red-500">*</Text>
        )}
        {hint && <Text className="text-[11px] text-gray-400 ml-1">{hint}</Text>}
      </View>
      {children}
    </View>
  );
}

function ReadonlyInput({ value }: { value: string }) {
  return (
    <View className="bg-gray-100 border border-gray-200 rounded-xl px-3.5 py-2.5">
      <Text
        className="text-[12.5px] text-gray-500"
        style={{ fontFamily: MONO }}
      >
        {value}
      </Text>
    </View>
  );
}

function StyledInput({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  numberOfLines,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "decimal-pad";
  multiline?: boolean;
  numberOfLines?: number;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#9ca3af"
      keyboardType={keyboardType ?? "default"}
      multiline={multiline}
      numberOfLines={numberOfLines}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={`rounded-xl px-3.5 py-2.5 text-[13.5px] text-gray-800 border bg-white ${focused ? "border-emerald-500" : "border-gray-200"} ${multiline ? "min-h-[88px]" : ""}`}
      style={multiline ? { textAlignVertical: "top" } : undefined}
    />
  );
}

function SelectTrigger({
  value,
  options,
  placeholder,
  title,
  onSelect,
}: {
  value: string;
  options: string[];
  placeholder: string;
  title: string;
  onSelect: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
        className="flex-row items-center justify-between bg-white border border-gray-200 rounded-xl px-3.5 py-2.5"
      >
        <Text
          className={`text-[13.5px] flex-1 ${value ? "text-gray-800" : "text-gray-400"}`}
        >
          {value || placeholder}
        </Text>
        <Text className="text-gray-400 text-xs ml-2">▾</Text>
      </TouchableOpacity>
      {open && (
        <PickerSheet
          title={title}
          options={options}
          selected={value}
          onSelect={onSelect}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ─── ItemRow ──────────────────────────────────────────────────────────────────

function ItemRow({
  item,
  onUpdate,
  onRemove,
}: {
  item: LineItem;
  onUpdate: (id: number, field: keyof LineItem, value: string) => void;
  onRemove: (id: number) => void;
}) {
  const subtotal =
    parseFloat(item.qty || "0") * parseFloat(item.price || "0") || 0;

  return (
    <View className="bg-white border border-gray-200 rounded-2xl mb-3 overflow-hidden">
      <View className="flex-row items-center px-3.5 pt-3.5 pb-2.5 gap-2">
        <TextInput
          value={item.desc}
          onChangeText={(v) => onUpdate(item.id, "desc", v)}
          placeholder="Item description…"
          placeholderTextColor="#9ca3af"
          className="flex-1 text-[13px] text-gray-800 font-medium"
        />
        <TouchableOpacity
          onPress={() => onRemove(item.id)}
          hitSlop={8}
          className="w-7 h-7 rounded-full bg-red-50 items-center justify-center border border-red-100"
        >
          <Text className="text-red-400 text-[12px] font-bold leading-none">
            ✕
          </Text>
        </TouchableOpacity>
      </View>
      <View className="h-px bg-gray-100 mx-3.5" />
      <View className="flex-row items-center gap-2 px-3.5 py-2.5">
        <TextInput
          value={item.stock}
          onChangeText={(v) => onUpdate(item.id, "stock", v)}
          placeholder="Stock No."
          placeholderTextColor="#9ca3af"
          className="flex-1 text-[12px] text-gray-700 bg-gray-50 rounded-lg px-2.5 py-2 border border-gray-100"
        />
        <TextInput
          value={item.unit}
          onChangeText={(v) => onUpdate(item.id, "unit", v)}
          placeholder="Unit"
          placeholderTextColor="#9ca3af"
          className="w-16 text-[12px] text-gray-700 bg-gray-50 rounded-lg px-2.5 py-2 border border-gray-100 text-center"
        />
        <TextInput
          value={item.qty}
          onChangeText={(v) => onUpdate(item.id, "qty", v)}
          placeholder="Qty"
          placeholderTextColor="#9ca3af"
          keyboardType="numeric"
          className="w-14 text-[12px] text-gray-700 bg-gray-50 rounded-lg px-2 py-2 border border-gray-100 text-center"
        />
        <TextInput
          value={item.price}
          onChangeText={(v) => onUpdate(item.id, "price", v)}
          placeholder="₱ 0.00"
          placeholderTextColor="#9ca3af"
          keyboardType="decimal-pad"
          className="w-24 text-[12px] text-gray-700 bg-gray-50 rounded-lg px-2.5 py-2 border border-gray-100 text-right"
        />
      </View>
      {subtotal > 0 && (
        <View className="flex-row justify-end px-3.5 pb-2.5">
          <Text className="text-[11px] text-gray-400">
            Subtotal:{" "}
            <Text className="font-semibold text-gray-600">
              ₱{fmtPHP(subtotal)}
            </Text>
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── TotalBar ─────────────────────────────────────────────────────────────────

function TotalBar({
  total,
  isHighValue,
}: {
  total: number;
  isHighValue: boolean;
}) {
  return (
    <View
      className="rounded-2xl px-4 py-3.5 flex-row items-center justify-between"
      style={{ backgroundColor: isHighValue ? CLR.hv900 : CLR.brand900 }}
    >
      <Text className="text-[11px] font-bold uppercase tracking-widest text-white/60">
        Total Cost
      </Text>
      <View className="flex-row items-baseline gap-1">
        <Text className="text-[13px] font-medium text-white/50">₱</Text>
        <Text
          className="text-[22px] font-semibold text-white"
          style={{ fontFamily: MONO }}
        >
          {fmtPHP(total)}
        </Text>
      </View>
    </View>
  );
}

// ─── HighValueSection (animated reveal) ──────────────────────────────────────

function HighValueSection({
  visible,
  justUnlocked,
  form,
  setField,
}: {
  visible: boolean;
  justUnlocked: boolean;
  form: FormState;
  setField: (f: keyof FormState, v: string) => void;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: 500,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: false,
    }).start();
  }, [visible]);

  return (
    <Animated.View
      style={{
        maxHeight: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 1000],
        }),
        opacity: progress.interpolate({
          inputRange: [0, 0.4, 1],
          outputRange: [0, 0, 1],
        }),
        overflow: "hidden",
      }}
    >
      <View className="flex-row items-center gap-2 mb-4 mt-2">
        <View
          className="flex-1 h-px"
          style={{ backgroundColor: CLR.brand500 }}
        />
        <Text
          className="text-[9.5px] font-bold uppercase tracking-widest"
          style={{ color: CLR.brand500 }}
        >
          High-Value Fields
        </Text>
        <View
          className="flex-1 h-px"
          style={{ backgroundColor: CLR.brand500 }}
        />
      </View>

      {justUnlocked && (
        <View
          className="flex-row items-start gap-3 rounded-2xl p-3.5 mb-4 border-l-4"
          style={{ backgroundColor: "#ECFDF5", borderLeftColor: CLR.brand500 }}
        >
          <Text className="text-base mt-0.5">⚠️</Text>
          <View className="flex-1">
            <Text className="text-[12.5px] font-bold text-emerald-900">
              Total crossed ₱10,000
            </Text>
            <Text className="text-[11.5px] text-gray-600 mt-0.5 leading-[18px]">
              Complete the Budget & Proposal fields below before submitting.
            </Text>
          </View>
        </View>
      )}

      <View
        className="flex-row items-center gap-3 rounded-2xl p-4 mb-4 border"
        style={{ backgroundColor: CLR.hv50, borderColor: "#047857" }}
      >
        <Text className="text-2xl">🏛️</Text>
        <View className="flex-1">
          <Text className="text-[13px] font-bold" style={{ color: CLR.hv700 }}>
            High-Value Procurement Unlocked
          </Text>
          <Text className="text-[11.5px] text-gray-500 mt-0.5 leading-[17px]">
            A Project Proposal and Budget details are now required.
          </Text>
        </View>
      </View>

      <SectionLabel tag="REQUIRED FOR >10K">
        Budget & Project Information
      </SectionLabel>

      <Field label="Budget Number" required hint="from PPMP">
        <StyledInput
          value={form.budgetNumber}
          onChangeText={(v) => setField("budgetNumber", v)}
          placeholder="e.g. 2026-PPMP-00X"
        />
      </Field>
      <Field label="PAP / Activity Code" required>
        <StyledInput
          value={form.papCode}
          onChangeText={(v) => setField("papCode", v)}
          placeholder="e.g. ARBDSP-2026-001"
        />
      </Field>
    </Animated.View>
  );
}

// ─── NextFlow ─────────────────────────────────────────────────────────────────

function NextFlow({ isHighValue }: { isHighValue: boolean }) {
  const steps = isHighValue
    ? ["PR + Proposal", "Div. Head", "BAC (APP)", "Budget", "PARPO"]
    : ["You Submit PR", "Div. Head", "BAC", "Budget", "PARPO"];
  return (
    <View
      className="rounded-2xl px-4 py-4 mt-5 border"
      style={{
        backgroundColor: isHighValue ? "#ECFDF5" : "#ECFDF5",
        borderColor: isHighValue ? "#047857" : "#047857",
      }}
    >
      <Text
        className="text-[10px] font-bold uppercase tracking-widest mb-3"
        style={{ color: isHighValue ? CLR.hv700 : CLR.brand700 }}
      >
        What happens after you submit?
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row items-center gap-1.5">
          {steps.map((step, i) => (
            <React.Fragment key={step}>
              <View
                className="px-3 py-1.5 rounded-full border"
                style={
                  i === 0
                    ? {
                        backgroundColor: isHighValue ? CLR.hv900 : CLR.brand900,
                        borderColor: "transparent",
                      }
                    : {
                        backgroundColor: "rgba(255,255,255,0.7)",
                        borderColor: isHighValue
                          ? "rgba(16,185,129,0.35)"
                          : "rgba(16,185,129,0.35)",
                      }
                }
              >
                <Text
                  className="text-[11px] font-semibold"
                  style={{
                    color:
                      i === 0 ? "#fff" : isHighValue ? CLR.hv700 : CLR.brand900,
                  }}
                >
                  {step}
                </Text>
              </View>
              {i < steps.length - 1 && (
                <Text
                  className="text-[12px]"
                  style={{ color: isHighValue ? CLR.brand500 : CLR.brand500 }}
                >
                  →
                </Text>
              )}
            </React.Fragment>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── ModalHeader ──────────────────────────────────────────────────────────────

function ModalHeader({
  isHighValue,
  prNo,
  onClose,
  tab,
  onTabChange,
  onPrint,
  onDownload,
}: {
  isHighValue: boolean;
  prNo: string;
  onClose: () => void;
  tab: "form" | "pdf";
  onTabChange: (t: "form" | "pdf") => void;
  onPrint: () => void;
  onDownload: () => void;
}) {
  return (
    <View
      className="px-5 pt-5 pb-0"
      style={{ backgroundColor: isHighValue ? CLR.hv900 : CLR.brand900 }}
    >
      <View className="flex-row items-start justify-between mb-4">
        <View className="flex-1 pr-3">
          <Text className="text-[10px] font-bold uppercase tracking-widest text-white/50">
            DAR · Procurement
          </Text>
          <Text className="text-[16px] font-bold text-white">
            Purchase Request
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

      <View className="flex-row items-center justify-between mb-3">
        <View
          className="flex-row items-center gap-2 px-3 py-1.5 rounded-full"
          style={{
            backgroundColor: isHighValue
              ? "rgba(16,185,129,0.3)"
              : "rgba(16,185,129,0.25)",
          }}
        >
          <View
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: isHighValue ? "#A7F3D0" : "#a7f3c4" }}
          />
          <Text
            className="text-[10.5px] font-bold uppercase tracking-wide"
            style={{ color: isHighValue ? "#A7F3D0" : "#a7f3c4" }}
          >
            {isHighValue ? "High-Value · > ₱10,000" : "Standard · ≤ ₱10,000"}
          </Text>
        </View>
        <View className="px-2.5 py-1 rounded-md bg-white/10 border border-white/20">
          <Text
            className="text-[10.5px] text-white/50"
            style={{ fontFamily: MONO }}
          >
            {prNo}
          </Text>
        </View>
      </View>

      {/* Tab toggle */}
      <View className="flex-row bg-black/20 rounded-xl p-1">
        {(["form", "pdf"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => onTabChange(t)}
            activeOpacity={0.8}
            className={`flex-1 py-2 rounded-lg items-center ${tab === t ? "bg-white" : ""}`}
          >
            <Text
              className={`text-[12.5px] font-bold ${tab === t ? "text-[#064E3B]" : "text-white/50"}`}
            >
              {t === "form" ? "PR Form" : "PDF Preview"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* PDF action bar — only in PDF tab */}
      {tab === "pdf" && (
        <View className="flex-row justify-end gap-2.5 pt-2 pb-1">
          <TouchableOpacity
            onPress={onPrint}
            activeOpacity={0.8}
            className="flex-row items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 border border-white/20"
          >
            <Text className="text-[12px] font-bold text-white">Print</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onDownload}
            activeOpacity={0.8}
            className="flex-row items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white"
          >
            <Text className="text-[12px] font-bold text-[#064E3B]">
              Download PDF
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── PurchaseRequestModal ─────────────────────────────────────────────────────

export function PurchaseRequestModal({
  visible,
  onClose,
  onSubmit,
  currentUser,
}: PRModalProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [nextId, setNextId] = useState(2);
  const [justUnlocked, setJustUnlocked] = useState(false);
  const [tab, setTab] = useState<"form" | "pdf">("form");
  const prevHighValue = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const webRef = useRef<WebView>(null);

  // Seed Office/Section from the logged-in user's division — read-only, cannot be overridden
  useEffect(() => {
    if (visible && currentUser?.division_name) {
      setForm((f) => ({ ...f, officeSection: currentUser.division_name! }));
    }
  }, [visible, currentUser?.division_name]);

  const setField = useCallback(
    (field: keyof FormState, value: string) =>
      setForm((f) => ({ ...f, [field]: value })),
    [],
  );

  const addItem = useCallback(
    () =>
      setNextId((n) => {
        setForm((f) => ({ ...f, items: [...f.items, makeItem(n)] }));
        return n + 1;
      }),
    [],
  );

  const removeItem = useCallback(
    (id: number) =>
      setForm((f) => ({ ...f, items: f.items.filter((i) => i.id !== id) })),
    [],
  );

  const updateItem = useCallback(
    (id: number, field: keyof LineItem, value: string) =>
      setForm((f) => ({
        ...f,
        items: f.items.map((i) => (i.id === id ? { ...i, [field]: value } : i)),
      })),
    [],
  );

  const total = useMemo(
    () =>
      form.items.reduce(
        (s, i) =>
          s + (parseFloat(i.qty || "0") * parseFloat(i.price || "0") || 0),
        0,
      ),
    [form.items],
  );
  const isHighValue = total >= HIGH_VALUE_THRESHOLD;
  const hasItems = form.items.some((i) => i.desc && i.qty && i.price);
  const hvComplete = !isHighValue || (!!form.budgetNumber && !!form.papCode);
  const requiresProposal = total >= HIGH_VALUE_THRESHOLD;
  const isValid =
    hasItems &&
    hvComplete &&
    !!form.officeSection &&
    !!form.purpose &&
    (!requiresProposal || !!form.proposalNumber);

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
      setForm(emptyForm());
      setNextId(2);
      setJustUnlocked(false);
      prevHighValue.current = false;
      setTab("form");
    }
  }, [visible]);

  useEffect(() => {
    if (visible && form.items.length === 0) addItem();
  }, [visible]);
  useEffect(() => {
    if (visible && currentUser?.division_name && !form.officeSection) {
      setForm((f) => ({
        ...f,
        officeSection: currentUser.division_name || "",
      }));
    }
  }, [visible, currentUser?.division_name, form.officeSection]);

  // Build PDF HTML from live form state so preview always reflects current input
  const html = useMemo(
    () =>
      buildPRHtml(
        {
          prNo: "",
          entityName: form.entityName,
          fundCluster: form.fundCluster,
          officeSection: form.officeSection,
          purpose: form.purpose,
          respCode: form.responsibilityCode,
          date: TODAY_DISPLAY,
          reqName: form.reqName,
          reqDesig: form.reqDesig,
          appName: form.appName,
          appDesig: form.appDesig,
        },
        form.items,
      ),
    [
      form.entityName,
      form.fundCluster,
      form.officeSection,
      form.purpose,
      form.responsibilityCode,
      form.reqName,
      form.reqDesig,
      form.appName,
      form.appDesig,
      form.items,
    ],
  );

  const handlePrint = async () => {
    try {
      await Print.printAsync({ html });
    } catch {}
  };

  const handleDownload = async () => {
    try {
      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert("Saved", `PDF created at: ${uri}`);
      }
    } catch (e: any) {
      Alert.alert("Download failed", e?.message ?? String(e));
    }
  };

  // ── Build Supabase-ready payload on submit ────────────────────────────────

  const handleSubmit = useCallback(() => {
    const prNo = `DRAFT-${Date.now().toString(36).toUpperCase()}`;

    const pr: Omit<PRRow, "id" | "created_at"> = {
      pr_no: prNo,
      office_section: form.officeSection,
      division_id: currentUser?.division_id || 0,
      resp_code: form.responsibilityCode,
      entity_name: form.entityName,
      fund_cluster: form.fundCluster,
      req_name: form.reqName || null,
      req_desig: form.reqDesig || null,
      app_name: form.appName || null,
      app_desig: form.appDesig || null,
      app_no: null,
      purpose: form.purpose,
      total_cost: total,
      is_high_value: isHighValue,
      status_id: 1, // 1 = "Pending" in pr_status table
      budget_number: form.budgetNumber || null,
      pap_code: form.papCode || null,
      proposal_file: null,
      proposal_no: form.proposalNumber, // always required
    };

    const items: Omit<PRItemRow, "id" | "pr_id">[] = form.items
      .filter((i) => i.desc && i.qty && i.price)
      .map((i) => ({
        description: i.desc,
        stock_no: i.stock,
        unit: i.unit,
        quantity: parseFloat(i.qty),
        unit_price: parseFloat(i.price),
        subtotal: parseFloat(i.qty) * parseFloat(i.price),
      }));

    onSubmit({
      pr,
      items,
      prNo,
      proposalNo: form.proposalNumber,
      divisionId: currentUser?.division_id || 0,
    });
    onClose();
  }, [form, total, isHighValue, onSubmit, onClose]);

  const prNoDisplay = "Pending BAC assignment";

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
        <ModalHeader
          isHighValue={isHighValue}
          prNo={prNoDisplay}
          onClose={onClose}
          tab={tab}
          onTabChange={setTab}
          onPrint={handlePrint}
          onDownload={handleDownload}
        />

        {tab === "pdf" ? (
          <WebView
            ref={webRef}
            source={{ html }}
            style={{ flex: 1 }}
            originWhitelist={["*"]}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <ScrollView
            ref={scrollRef}
            className="flex-1 bg-gray-50"
            contentContainerStyle={{
              paddingHorizontal: 12,
              paddingTop: 10,
              paddingBottom: 20,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            // ── High-value fields warning ────────────────────────────────────
            {isHighValue && (
              <View className="flex-row items-start gap-3 bg-emerald-50 border-l-4 border-emerald-400 rounded-2xl p-3.5 mb-5">
                <Text className="font-bold text-emerald-800">
                  {" "}
                  High-value fields are now required.
                </Text>
              </View>
            )}
            <SectionLabel>Reference Information</SectionLabel>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field label="PR No." required hint="Assigned by BAC">
                  <ReadonlyInput value={prNoDisplay} />
                </Field>
              </View>
              <View className="flex-1">
                <Field label="Date" required>
                  <ReadonlyInput value={TODAY_DISPLAY} />
                </Field>
              </View>
            </View>
            <Field label="Entity Name" required>
              <StyledInput
                value={form.entityName}
                onChangeText={(v) => setField("entityName", v)}
                placeholder="e.g. DAR — CARAGA Region"
              />
            </Field>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field label="Fund Cluster">
                  <StyledInput
                    value={form.fundCluster}
                    onChangeText={(v) => setField("fundCluster", v)}
                    placeholder="e.g. 01"
                  />
                </Field>
              </View>
              <View className="flex-1">
                <Field label="Responsibility Center Code">
                  <StyledInput
                    value={form.responsibilityCode}
                    onChangeText={(v) => setField("responsibilityCode", v)}
                    placeholder="e.g. 10-001"
                  />
                </Field>
              </View>
            </View>
            <Field label="Office / Section" required hint="From your division">
              <ReadonlyInput
                value={form.officeSection || currentUser?.division_name || "—"}
              />
            </Field>
            {isHighValue && (
              <>
                <SectionLabel>Proposal</SectionLabel>
                <Field
                  label="Proposal Number"
                  required
                  hint="Required for high-value PRs"
                >
                  <StyledInput
                    value={form.proposalNumber}
                    onChangeText={(v) => setField("proposalNumber", v)}
                    placeholder="e.g. 2026-PROP-00123"
                  />
                </Field>
              </>
            )}
            <SectionLabel>Items Requested</SectionLabel>
            {form.items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onUpdate={updateItem}
                onRemove={removeItem}
              />
            ))}
            <TouchableOpacity
              onPress={addItem}
              activeOpacity={0.8}
              className="flex-row items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50 mb-3.5"
            >
              <Text className="text-emerald-700 text-xl leading-none">＋</Text>
              <Text className="text-[13px] font-bold text-emerald-700">
                Add Item
              </Text>
            </TouchableOpacity>
            <TotalBar total={total} isHighValue={isHighValue} />
            <View className="mt-4">
              <HighValueSection
                visible={isHighValue}
                justUnlocked={justUnlocked}
                form={form}
                setField={setField}
              />
            </View>
            <SectionLabel>Purpose</SectionLabel>
            <Field label="Purpose / Justification" required>
              <StyledInput
                value={form.purpose}
                onChangeText={(v) => setField("purpose", v)}
                placeholder={
                  isHighValue
                    ? "Describe the project or activity requiring this expenditure…"
                    : "Briefly describe why these items are needed and how they will be used…"
                }
                multiline
                numberOfLines={4}
              />
            </Field>
            <SectionLabel>Signatories</SectionLabel>
            <View className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-4">
              <View className="bg-gray-50 border-b border-gray-100 px-4 py-2.5">
                <Text className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                  Requested by
                </Text>
              </View>
              <View className="px-4 pt-3 pb-1">
                <Field label="Printed Name">
                  <StyledInput
                    value={form.reqName}
                    onChangeText={(v) => setField("reqName", v)}
                    placeholder="Full name of requesting officer"
                  />
                </Field>
                <Field label="Designation">
                  <StyledInput
                    value={form.reqDesig}
                    onChangeText={(v) => setField("reqDesig", v)}
                    placeholder="e.g. Division Chief"
                  />
                </Field>
              </View>
            </View>
            <View className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-4">
              <View className="bg-gray-50 border-b border-gray-100 px-4 py-2.5">
                <Text className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                  Approved by
                </Text>
              </View>
              <View className="px-4 pt-3 pb-1">
                <Field label="Printed Name">
                  <StyledInput
                    value={form.appName}
                    onChangeText={(v) => setField("appName", v)}
                    placeholder="Full name of approving officer"
                  />
                </Field>
                <Field label="Designation">
                  <StyledInput
                    value={form.appDesig}
                    onChangeText={(v) => setField("appDesig", v)}
                    placeholder="e.g. Regional Director"
                  />
                </Field>
              </View>
            </View>
            <NextFlow isHighValue={isHighValue} />
          </ScrollView>
        )}

        {/* Footer — only shown in form tab */}
        {tab === "form" && (
          <View className="flex-row items-center justify-between px-5 py-4 bg-white border-t border-gray-100">
            <Text className="text-[11.5px] text-gray-400">
              Requested by: {form.reqName || "—"}
            </Text>
            <View className="flex-row items-center gap-2.5">
              <TouchableOpacity
                onPress={onClose}
                activeOpacity={0.7}
                className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white"
              >
                <Text className="text-[13.5px] font-semibold text-gray-500">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={!isValid}
                activeOpacity={0.8}
                className={`px-5 py-2.5 rounded-xl ${!isValid ? "opacity-40" : ""}`}
                style={{
                  backgroundColor: isHighValue ? CLR.hv900 : CLR.brand900,
                }}
              >
                <Text className="text-[13.5px] font-bold text-white">
                  {isHighValue ? "Submit High-Value PR" : "Create PR"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default PurchaseRequestModal;
