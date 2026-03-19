/**
 * EditPRModal.tsx
 *
 * Edit an existing PR record. UI shell mirrors ViewPRModal (dark green header,
 * pageSheet presentation). Input fields reuse the same atoms as PurchaseRequestModal.
 *
 * Usage (in PRModule):
 *   <EditPRModal visible={editVisible} record={editRecord}
 *     onClose={() => setEditVisible(false)} onSave={handlePRSave} />
 */

import { fetchPRStatuses, fetchPRWithItemsById, updatePurchaseRequest, type PRStatusRow } from "@/lib/supabase";
import { toLineItemDisplay, toPRDisplay } from "@/types/model";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import WebView from "react-native-webview";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EditLineItem {
  id: number;
  desc: string; stock: string; unit: string; qty: string; price: string;
}

// Only id + prNo are needed to open the modal — full data is fetched inside
export interface PREditRecord {
  id: string;
  prNo: string;
}

export interface PREditPayload {
  id: string;
  entityName: string; fundCluster: string;
  officeSection: string; responsibilityCode: string; purpose: string;
  reqName: string; reqDesig: string;
  appName: string; appDesig: string;
  budgetNumber: string; papCode: string; proposalFileName: string;
  proposalNo: string;   // always required
  items: EditLineItem[];
  totalCost: number;
}

interface EditPRModalProps {
  visible: boolean;
  record: PREditRecord | null;
  onClose: () => void;
  onSave: (payload: PREditPayload) => void;
  /** Logged-in user — division_name is used to auto-fill the read-only Office/Section field */
  currentUser?: { division_name?: string | null; [key: string]: any };
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
const MOCK_PROPOSAL_FILES = [
  "ProjectProposal_2026.pdf", "ActivityProposal_Q1.pdf",
  "BudgetProposal_ARBDSP.docx", "PPMPAttachment.pdf",
];

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const CLR  = {
  brand900: "#064E3B", brand700: "#047857", brand500: "#10B981",
  brand100: "#A7F3D0", brand50: "#ECFDF5",
  hv900: "#022c22", hv50: "#D1FAE5",
} as const;

const makeItem = (id: number): EditLineItem => ({ id, desc: "", stock: "", unit: "", qty: "", price: "" });
const fmtPHP   = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Visual config keyed by status_id — mirrors PRModule exactly.
 * Labels are resolved at render time from the live pr_status fetch.
 *
 *   1 = Pending
 *   2 = Processing (Division Head)
 *   3 = Processing (BAC)
 *   4 = Processing (Budget)
 *   5 = Processing (PARPO)
 */
const STATUS_CONFIG: Record<number, { dot: string; bg: string; text: string; hex: string }> = {
  1: { dot: "#fbbf24", bg: "#fffbeb", text: "#92400e", hex: "#fbbf24" }, // yellow  — Pending
  2: { dot: "#3b82f6", bg: "#eff6ff", text: "#1e40af", hex: "#3b82f6" }, // blue    — Div. Head
  3: { dot: "#8b5cf6", bg: "#f5f3ff", text: "#5b21b6", hex: "#8b5cf6" }, // violet  — BAC
  4: { dot: "#f97316", bg: "#fff7ed", text: "#9a3412", hex: "#f97316" }, // orange  — Budget
  5: { dot: "#22c55e", bg: "#f0fdf4", text: "#166534", hex: "#22c55e" }, // green   — PARPO
};
const STATUS_FALLBACK = { dot: "#9ca3af", bg: "#f3f4f6", text: "#6b7280", hex: "#9ca3af" };

// ─── PDF HTML builder (mirrors ViewPRModal exactly) ───────────────────────────

function buildPRHtml(fields: {
  prNo: string; entityName: string; fundCluster: string;
  officeSection: string; purpose: string; respCode: string; date: string;
  reqName: string; reqDesig: string; appName: string; appDesig: string;
}, items: EditLineItem[]): string {
  const f = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const padded = [...items];
  while (padded.length < 30) padded.push({ id: 0, desc: "", stock: "", unit: "", qty: "", price: "" });

  const rows = padded.map((it) => {
    const qty   = parseFloat(it.qty   || "0");
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
  }).join("");

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

// ─── Shared atoms (mirrors PurchaseRequestModal) ──────────────────────────────

function SectionLabel({ children, tag }: { children: string; tag?: string }) {
  return (
    <View className="flex-row items-center gap-2 mb-3 mt-1">
      <Text className="text-[10.5px] font-bold uppercase tracking-widest text-gray-400">{children}</Text>
      {tag && <Text className="text-[9.5px] font-bold uppercase tracking-wide text-emerald-500">{tag}</Text>}
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
      className={`rounded-xl px-3.5 py-2.5 text-[13.5px] text-gray-800 border bg-white
        ${focused ? "border-emerald-500" : "border-gray-200"}
        ${multiline ? "min-h-[88px]" : ""}`}
      style={multiline ? { textAlignVertical: "top" } : undefined}
    />
  );
}

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
                className={`flex-row items-center justify-between px-5 py-3.5 border-b border-gray-50
                  ${active ? "bg-emerald-50" : ""}`}>
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

function SelectTrigger({ value, options, placeholder, title, onSelect }: {
  value: string; options: string[]; placeholder: string; title: string; onSelect: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} activeOpacity={0.8}
        className="flex-row items-center justify-between bg-white border border-gray-200 rounded-xl px-3.5 py-2.5">
        <Text className={`text-[13.5px] flex-1 ${value ? "text-gray-800" : "text-gray-400"}`}>
          {value || placeholder}
        </Text>
        <Text className="text-gray-400 text-xs ml-2">▾</Text>
      </TouchableOpacity>
      {open && (
        <PickerSheet title={title} options={options} selected={value}
          onSelect={onSelect} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

// ─── ItemRow ──────────────────────────────────────────────────────────────────

function ItemRow({ item, onUpdate, onRemove }: {
  item: EditLineItem;
  onUpdate: (id: number, field: keyof EditLineItem, value: string) => void;
  onRemove: (id: number) => void;
}) {
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
        <TextInput value={item.unit} onChangeText={(v) => onUpdate(item.id, "unit", v)}
          placeholder="Unit" placeholderTextColor="#9ca3af"
          className="w-16 text-[12px] text-gray-700 bg-gray-50 rounded-lg px-2.5 py-2 border border-gray-100 text-center" />
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
    </View>
  );
}

// ─── TotalBar ─────────────────────────────────────────────────────────────────

function TotalBar({ total, isHighValue }: { total: number; isHighValue: boolean }) {
  return (
    <View className="rounded-2xl px-4 py-3.5 flex-row items-center justify-between"
      style={{ backgroundColor: isHighValue ? CLR.hv900 : CLR.brand900 }}>
      <Text className="text-[11px] font-bold uppercase tracking-widest text-white/60">Total Cost</Text>
      <View className="flex-row items-baseline gap-1">
        <Text className="text-[13px] font-medium text-white/50">₱</Text>
        <Text className="text-[22px] font-semibold text-white" style={{ fontFamily: MONO }}>
          {fmtPHP(total)}
        </Text>
      </View>
    </View>
  );
}

// ─── EditPRModal ──────────────────────────────────────────────────────────────

export default function EditPRModal({ visible, record, onClose, onSave, currentUser }: EditPRModalProps) {
  const scrollRef = useRef<ScrollView>(null);
  const webRef    = useRef<WebView>(null);

  const [tab,                setTab]                = useState<"form" | "pdf">("form");
  const [entityName,         setEntityName]         = useState("DAR — CARAGA Region");
  const [fundCluster,        setFundCluster]        = useState("");
  const [officeSection,      setOfficeSection]      = useState("");
  const [responsibilityCode, setResponsibilityCode] = useState("");
  const [purpose,            setPurpose]            = useState("");
  const [reqName,            setReqName]            = useState("");
  const [reqDesig,           setReqDesig]           = useState("");
  const [appName,            setAppName]            = useState("");
  const [appDesig,           setAppDesig]           = useState("");
  const [budgetNumber,       setBudgetNumber]        = useState("");
  const [papCode,            setPapCode]            = useState("");
  const [proposalFileName,   setProposalFileName]   = useState("");
  const [proposalNo,         setProposalNo]         = useState("");
  const [items,              setItems]              = useState<EditLineItem[]>([]);
  const [nextId,             setNextId]             = useState(1);
  const [fileOpen,           setFileOpen]           = useState(false);
  const [saving,             setSaving]             = useState(false);
  const [loading,            setLoading]            = useState(false);
  // Status — fetched from pr_status table; statusId comes from the PR row itself
  const [statusId,           setStatusId]           = useState<number>(1);
  const [statuses,           setStatuses]           = useState<PRStatusRow[]>([]);

  // Fetch status lookup once — labels are never hardcoded
  useEffect(() => {
    fetchPRStatuses().then(setStatuses).catch(() => {});
  }, []);

  useEffect(() => {
    if (!visible || !record) return;
    setTab("form");
    setLoading(true);
    fetchPRWithItemsById(record.id)
      .then(({ header: raw, items: rawItems }) => {
        const pr = toPRDisplay(raw);
        // Seed status from the fetched PR row
        setStatusId(raw.status_id ?? 1);
        // Office/Section: always use the logged-in user's division (read-only)
        setOfficeSection(currentUser?.division_name ?? pr.officeSection);
        setPurpose(pr.purpose);

        setEntityName(raw.entity_name   ?? "DAR — CARAGA Region");
        setFundCluster(raw.fund_cluster ?? "");
        setResponsibilityCode(raw.resp_code     ?? "");
        setBudgetNumber(raw.budget_number       ?? "");
        setPapCode(raw.pap_code                 ?? "");
        setProposalFileName(raw.proposal_file   ?? "");
        // proposal_no is now a top-level column on PRRow
        setProposalNo((raw as any).proposal_no  ?? "");
        setReqName(raw.req_name   ?? "");
        setReqDesig(raw.req_desig ?? "");
        setAppName(raw.app_name   ?? "");
        setAppDesig(raw.app_desig ?? "");

        const seeded: EditLineItem[] = rawItems.length
          ? rawItems.map((it, idx) => {
              const li = toLineItemDisplay(it);
              return {
                id:    idx + 1,
                desc:  li.description,
                stock: li.stock_no  ?? "",
                unit:  li.unit      ?? "",
                qty:   String(li.quantity),
                price: String(li.unit_price),
              };
            })
          : [makeItem(1)];

        setItems(seeded);
        setNextId((seeded.at(-1)?.id ?? 0) + 1);
      })
      .catch((e: any) => {
        Alert.alert("Load failed", e?.message ?? "Could not load PR details.");
        onClose();
      })
      .finally(() => setLoading(false));
  }, [visible, record]);

  const addItem    = useCallback(() => {
    setItems((prev) => [...prev, makeItem(nextId)]);
    setNextId((n) => n + 1);
  }, [nextId]);

  const removeItem = useCallback((id: number) =>
    setItems((prev) => prev.filter((i) => i.id !== id)), []);

  const updateItem = useCallback((id: number, field: keyof EditLineItem, value: string) =>
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, [field]: value } : i)), []);

  const total      = useMemo(
    () => items.reduce((s, i) => s + (parseFloat(i.qty || "0") * parseFloat(i.price || "0") || 0), 0),
    [items],
  );
  const isHighValue = total >= HIGH_VALUE_THRESHOLD;
  const hvComplete  = !isHighValue || (!!budgetNumber && !!papCode);
  const requiresProposal = total >= HIGH_VALUE_THRESHOLD;
  const isValid     = !!officeSection && !!purpose && (!requiresProposal || !!proposalNo) && items.some((i) => i.desc && i.qty && i.price) && hvComplete;

  const handleSave = useCallback(async () => {
    if (!record) return;
    setSaving(true);
    try {
      await updatePurchaseRequest(
        record.id,
        {
          entity_name:    entityName,
          fund_cluster:   fundCluster,
          office_section: officeSection,
          resp_code:      responsibilityCode,
          purpose,
          total_cost:     total,
          is_high_value:  total >= HIGH_VALUE_THRESHOLD,
          budget_number:  budgetNumber   || null,
          pap_code:       papCode        || null,
          proposal_file:  proposalFileName || null,
          proposal_no:    proposalNo,
          req_name:       reqName        || null,
          req_desig:      reqDesig       || null,
          app_name:       appName        || null,
          app_desig:      appDesig       || null,
        },
        items
          .filter((i) => i.desc && i.qty && i.price)
          .map((i) => ({
            description: i.desc,
            stock_no:    i.stock,
            unit:        i.unit,
            quantity:    parseFloat(i.qty),
            unit_price:  parseFloat(i.price),
            subtotal:    parseFloat(i.qty) * parseFloat(i.price),
          }))
      );
      onSave({
        id: record.id,
        entityName, fundCluster,
        officeSection, responsibilityCode, purpose,
        reqName, reqDesig, appName, appDesig,
        budgetNumber, papCode, proposalFileName, proposalNo,
        items, totalCost: total,
      });
      onClose();
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? "Could not update the record. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [record, entityName, fundCluster, officeSection, responsibilityCode, purpose, reqName, reqDesig, appName, appDesig, budgetNumber, papCode, proposalFileName, proposalNo, items, total, onSave, onClose]);

  // Build PDF HTML from live form state so the preview always reflects current edits
  const html = useMemo(() => buildPRHtml(
    {
      prNo:          record?.prNo ?? "",
      entityName,
      fundCluster,
      officeSection,
      purpose,
      respCode:      responsibilityCode,
      date:          new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }),
      reqName,
      reqDesig,
      appName,
      appDesig,
    },
    items,
  ), [record?.prNo, entityName, fundCluster, officeSection, purpose, responsibilityCode, reqName, reqDesig, appName, appDesig, items]);

  const handlePrint = async () => {
    try { await Print.printAsync({ html }); } catch {}
  };

  const handleDownload = async () => {
    try {
      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      } else {
        Alert.alert("Saved", `PDF created at: ${uri}`);
      }
    } catch (e: any) {
      Alert.alert("Download failed", e?.message ?? String(e));
    }
  };

  const showSpinner = loading;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView className="flex-1 bg-white" behavior={Platform.OS === "ios" ? "padding" : "height"}>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <View style={{ backgroundColor: isHighValue ? CLR.hv900 : CLR.brand900 }}
          className="px-5 pt-5 pb-0">
          <View className="flex-row items-start justify-between mb-3">
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-xl items-center justify-center bg-white/10">
                <Text className="text-xl">✏️</Text>
              </View>
              <View>
                <Text className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                  DAR · Procurement
                </Text>
                <Text className="text-[16px] font-bold text-white">Edit Purchase Request</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10}
              className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center">
              <Text className="text-white text-[20px] leading-none font-light">×</Text>
            </TouchableOpacity>
          </View>

          {/* PR number · value badge · status pill */}
          <View className="flex-row items-center justify-between mb-3">
            {/* Value badge */}
            <View className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ backgroundColor: isHighValue ? "rgba(16,185,129,0.2)" : "rgba(82,183,136,0.25)" }}>
              <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CLR.brand100 }} />
              <Text className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: CLR.brand100 }}>
                {isHighValue ? "High-Value · > ₱10,000" : "Standard · ≤ ₱10,000"}
              </Text>
            </View>

            <View className="flex-row items-center gap-2">
              {/* Live status pill — colour + label from pr_status table */}
              {(() => {
                const cfg   = STATUS_CONFIG[statusId] ?? STATUS_FALLBACK;
                const label = statuses.find((s) => s.id === statusId)?.status_name ?? `Status ${statusId}`;
                return (
                  <View className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: cfg.hex + "33" }}>
                    <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.dot }} />
                    <Text className="text-[10.5px] font-bold text-white">{label}</Text>
                  </View>
                );
              })()}
              {/* PR number */}
              <View className="px-2.5 py-1 rounded-md bg-white/10 border border-white/20">
                <Text className="text-[10.5px] text-white/50" style={{ fontFamily: MONO }}>{record?.prNo || "N/A"}</Text>
              </View>
            </View>
          </View>

          {/* Tab toggle — same pattern as ViewPRModal */}
          <View className="flex-row bg-black/20 rounded-xl p-1">
            {(["form", "pdf"] as const).map((t) => (
              <TouchableOpacity key={t} onPress={() => setTab(t)} activeOpacity={0.8}
                className={`flex-1 py-2 rounded-lg items-center ${tab === t ? "bg-white" : ""}`}>
                <Text className={`text-[12.5px] font-bold ${tab === t ? "text-[#064E3B]" : "text-white/50"}`}>
                  {t === "form" ? "✏️  Edit Form" : "📄  PDF Preview"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* PDF action bar — only in PDF tab */}
          {tab === "pdf" && (
            <View className="flex-row justify-end gap-2.5 pt-2 pb-1">
              <TouchableOpacity onPress={handlePrint} activeOpacity={0.8}
                className="flex-row items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 border border-white/20">
                <Text className="text-base">🖨️</Text>
                <Text className="text-[12px] font-bold text-white">Print</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDownload} activeOpacity={0.8}
                className="flex-row items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white">
                <Text className="text-base">⬇️</Text>
                <Text className="text-[12px] font-bold text-[#064E3B]">Download PDF</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── Body ─────────────────────────────────────────────────────── */}
        {showSpinner ? (
          <View className="flex-1 items-center justify-center gap-3 bg-gray-50">
            <ActivityIndicator size="large" color="#064E3B" />
            <Text className="text-[13px] text-gray-400">Loading PR details…</Text>
          </View>
        ) : tab === "pdf" ? (
          <WebView ref={webRef} source={{ html }} style={{ flex: 1 }}
            originWhitelist={["*"]} showsVerticalScrollIndicator={false} />
        ) : (
        <ScrollView ref={scrollRef} className="flex-1 bg-gray-50"
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 20 }}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <SectionLabel>Reference</SectionLabel>
          <View className="flex-row gap-3 mb-1">
            <View className="flex-1">
              <Field label="PR No." hint="Read-only">
                <View className="bg-gray-100 border border-gray-200 rounded-xl px-3.5 py-2.5">
                  <Text className="text-[12.5px] text-gray-500" style={{ fontFamily: MONO }}>{record?.prNo || "N/A"}</Text>
                </View>
              </Field>
            </View>
            <View className="flex-1">
              <Field label="Office / Section" hint="From your division">
                <View className="bg-gray-100 border border-gray-200 rounded-xl px-3.5 py-2.5">
                  <Text className="text-[12.5px] text-gray-500" numberOfLines={1}>
                    {officeSection || currentUser?.division_name || "—"}
                  </Text>
                </View>
              </Field>
            </View>
          </View>

          {isHighValue && (
            <Field label="Proposal Number" required hint="Required for high-value PRs">
              <StyledInput value={proposalNo} onChangeText={setProposalNo}
                placeholder="e.g. 2026-PROP-00123" />
            </Field>
          )}

          <Field label="Entity Name" required>
            <StyledInput value={entityName} onChangeText={setEntityName}
              placeholder="e.g. DAR — CARAGA Region" />
          </Field>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="Fund Cluster">
                <StyledInput value={fundCluster} onChangeText={setFundCluster} placeholder="e.g. 01" />
              </Field>
            </View>
            <View className="flex-1">
              <Field label="Responsibility Center Code">
                <StyledInput value={responsibilityCode} onChangeText={setResponsibilityCode}
                  placeholder="e.g. 10-001" />
              </Field>
            </View>
          </View>

          <SectionLabel>Items</SectionLabel>
          {items.map((item) => (
            <ItemRow key={item.id} item={item} onUpdate={updateItem} onRemove={removeItem} />
          ))}
          <TouchableOpacity onPress={addItem} activeOpacity={0.8}
            className="flex-row items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50 mb-3.5">
            <Text className="text-emerald-700 text-xl leading-none">＋</Text>
            <Text className="text-[13px] font-bold text-emerald-700">Add Item</Text>
          </TouchableOpacity>

          <TotalBar total={total} isHighValue={isHighValue} />

          {/* High-value fields */}
          {isHighValue && (
            <View className="mt-4">
              <View className="flex-row items-center gap-2 mb-4">
                <View className="flex-1 h-px" style={{ backgroundColor: CLR.brand500 }} />
                <Text className="text-[9.5px] font-bold uppercase tracking-widest" style={{ color: CLR.brand500 }}>
                  High-Value Fields
                </Text>
                <View className="flex-1 h-px" style={{ backgroundColor: CLR.brand500 }} />
              </View>
              <SectionLabel tag="REQUIRED FOR >10K">Budget & Project</SectionLabel>
              <Field label="Budget Number" required hint="from PPMP">
                <StyledInput value={budgetNumber} onChangeText={setBudgetNumber}
                  placeholder="e.g. 2026-PPMP-00X" />
              </Field>
              <Field label="PAP / Activity Code" required>
                <StyledInput value={papCode} onChangeText={setPapCode}
                  placeholder="e.g. ARBDSP-2026-001" />
              </Field>
              <Field label="Project / Activity Proposal" required>
                <TouchableOpacity onPress={() => setFileOpen(true)} activeOpacity={0.8}
                  className={`rounded-2xl border-2 border-dashed px-4 py-5 items-center gap-1.5
                    ${proposalFileName ? "border-emerald-400 bg-emerald-50" : "border-gray-300 bg-gray-50"}`}>
                  <Text className="text-3xl">{proposalFileName ? "✅" : "📄"}</Text>
                  {proposalFileName
                    ? <Text className="text-[12.5px] font-semibold text-emerald-700 text-center">{proposalFileName}</Text>
                    : <>
                        <Text className="text-[13px] font-semibold text-gray-600">Tap to attach proposal</Text>
                        <Text className="text-[11.5px] text-gray-400">PDF or DOCX · Max 10 MB</Text>
                      </>
                  }
                </TouchableOpacity>
              </Field>
              {fileOpen && (
                <PickerSheet title="Select Proposal File" options={MOCK_PROPOSAL_FILES}
                  selected={proposalFileName} onSelect={setProposalFileName}
                  onClose={() => setFileOpen(false)} />
              )}
            </View>
          )}

          <SectionLabel>Purpose</SectionLabel>
          <Field label="Purpose / Justification" required>
            <StyledInput value={purpose} onChangeText={setPurpose}
              placeholder="Describe why these items are needed…"
              multiline numberOfLines={4} />
          </Field>

          <SectionLabel>Signatories</SectionLabel>
          <View className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-4">
            <View className="bg-gray-50 border-b border-gray-100 px-4 py-2.5">
              <Text className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Requested by</Text>
            </View>
            <View className="px-4 pt-3 pb-1">
              <Field label="Printed Name">
                <StyledInput value={reqName} onChangeText={setReqName}
                  placeholder="Full name of requesting officer" />
              </Field>
              <Field label="Designation">
                <StyledInput value={reqDesig} onChangeText={setReqDesig}
                  placeholder="e.g. Division Chief" />
              </Field>
            </View>
          </View>

          <View className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-4">
            <View className="bg-gray-50 border-b border-gray-100 px-4 py-2.5">
              <Text className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Approved by</Text>
            </View>
            <View className="px-4 pt-3 pb-1">
              <Field label="Printed Name">
                <StyledInput value={appName} onChangeText={setAppName}
                  placeholder="Full name of approving officer" />
              </Field>
              <Field label="Designation">
                <StyledInput value={appDesig} onChangeText={setAppDesig}
                  placeholder="e.g. Regional Director" />
              </Field>
            </View>
          </View>
        </ScrollView>
        )}

        {/* ── Footer — only shown in form tab ──────────────────────────── */}
        {tab === "form" && !showSpinner && (
          <View className="flex-row items-center justify-between px-5 py-4 bg-white border-t border-gray-100">
            <Text className="text-[11.5px] text-gray-400" style={{ fontFamily: MONO }}>{record?.prNo || "N/A"}</Text>
            <View className="flex-row items-center gap-2.5">
              <TouchableOpacity onPress={onClose} activeOpacity={0.7}
                className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white">
                <Text className="text-[13.5px] font-semibold text-gray-500">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} disabled={!isValid || saving} activeOpacity={0.8}
                className={`flex-row items-center gap-2 px-5 py-2.5 rounded-xl ${(!isValid || saving) ? "opacity-50" : ""}`}
                style={{ backgroundColor: isHighValue ? CLR.hv900 : CLR.brand900 }}>
                {saving && <ActivityIndicator size="small" color="#ffffff" />}
                <Text className="text-[13.5px] font-bold text-white">
                  {saving ? "Saving…" : "Save Changes"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

      </KeyboardAvoidingView>
    </Modal>
  );
}
