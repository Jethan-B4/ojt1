/**
 * EditPOModal.tsx — Edit Purchase Order Modal
 *
 * Same field layout as CreatePOModal (Appendix 61) but:
 *   - Fetches the existing PO header + items on open (same pattern as EditPRModal)
 *   - Calls updatePO() instead of insertPurchaseOrder()
 *   - Header subtitle shows "Edit Purchase Order · {poNo}"
 *   - Tab labels: "Edit" | "Preview"
 *   - Footer button: "Save Changes"
 *
 * PR No. is now a REQUIRED editable field.
 * A "Browse" / "Change" button lets the user pick a PR from the database,
 * which auto-fills office_section, fund_cluster, and authorized official
 * fields from the selected PR record.
 *
 * Only accessible from POModule's RecordCard Edit button.
 * The Edit button is only shown to Supply (role_id = 8) when
 * statusId <= 4 (PO still being prepared in Supply).
 *
 * Styles: NativeWind. Inline style= only for fontFamily, minHeight,
 *         textAlignVertical, flex: 1.4, and elevation.
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import WebView from "react-native-webview";
import {
  fetchPOWithItemsById,
  updatePO,
  type POItemRow,
} from "../../lib/supabase/po";
import { fetchPurchaseRequests } from "../../lib/supabase/pr";

// ─── Exported types ───────────────────────────────────────────────────────────

export interface POEditRecord {
  id: string;
  poNo: string;
}

export interface POEditPayload {
  id: string;
  poNo: string;
  prNo: string;
  supplier: string;
  address: string;
  tin: string;
  modeOfProcurement: string;
  placeOfDelivery: string;
  deliveryTerm: string;
  dateOfDelivery: string;
  paymentTerm: string;
  date: string;
  officeSection: string;
  fundCluster: string;
  orsNo: string;
  orsDate: string;
  fundsAvailable: string;
  orsAmount: number;
  totalAmount: number;
  authorizedOfficialName: string;
  authorizedOfficialDesig: string;
  accountantName: string;
  accountantDesig: string;
  items: POItemRow[];
}

interface EditPOModalProps {
  visible: boolean;
  record: POEditRecord | null;
  onClose: () => void;
  onSave: (payload: POEditPayload) => void;
}

// ─── PR suggestion row (minimal fetch shape) ─────────────────────────────────

interface PRSuggestion {
  id: string;
  pr_no: string;
  office_section: string | null;
  purpose: string | null;
  total_cost: number | null;
  fund_cluster: string | null;
  req_name: string | null;
  req_desig: string | null;
  app_name: string | null;
  app_desig: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const fmt = (n: number) =>
  n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function toWords(amount: number): string {
  if (!amount || isNaN(amount)) return "ZERO PESOS";
  const ones = [
    "",
    "ONE",
    "TWO",
    "THREE",
    "FOUR",
    "FIVE",
    "SIX",
    "SEVEN",
    "EIGHT",
    "NINE",
    "TEN",
    "ELEVEN",
    "TWELVE",
    "THIRTEEN",
    "FOURTEEN",
    "FIFTEEN",
    "SIXTEEN",
    "SEVENTEEN",
    "EIGHTEEN",
    "NINETEEN",
  ];
  const tens = [
    "",
    "",
    "TWENTY",
    "THIRTY",
    "FORTY",
    "FIFTY",
    "SIXTY",
    "SEVENTY",
    "EIGHTY",
    "NINETY",
  ];
  function toH(n: number): string {
    if (n === 0) return "";
    if (n < 20) return ones[n] + " ";
    if (n < 100)
      return (
        tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "") + " "
      );
    return ones[Math.floor(n / 100)] + " HUNDRED " + toH(n % 100);
  }
  const pesos = Math.floor(amount);
  const cts = Math.round((amount - pesos) * 100);
  let r = "";
  const B = Math.floor(pesos / 1_000_000_000);
  const M = Math.floor((pesos % 1_000_000_000) / 1_000_000);
  const K = Math.floor((pesos % 1_000_000) / 1_000);
  const R = pesos % 1_000;
  if (B) r += toH(B) + "BILLION ";
  if (M) r += toH(M) + "MILLION ";
  if (K) r += toH(K) + "THOUSAND ";
  if (R) r += toH(R);
  r = r.trim() + " PESOS";
  if (cts) r += " AND " + toH(cts).trim() + " CENTAVOS";
  return r + " ONLY";
}

// ─── HTML builder (identical to CreatePOModal's) ─────────────────────────────

function buildPOHtml(f: POEditPayload): string {
  const fmtN = (n: number) =>
    n.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const padded = [...f.items];
  while (padded.length < 20)
    padded.push({
      stock_no: null,
      unit: "",
      description: "",
      quantity: 0,
      unit_price: 0,
      subtotal: 0,
    });

  const rows = padded
    .map((it) => {
      const qty = Number(it.quantity) || 0,
        price = Number(it.unit_price) || 0,
        amt = qty * price;
      return `<tr>
      <td style="border:1px solid #000;font-size:8pt;padding:1px 3px;text-align:center;font-family:'Times New Roman',serif;height:16px">${it.stock_no || ""}</td>
      <td style="border:1px solid #000;font-size:8pt;padding:1px 3px;text-align:center;font-family:'Times New Roman',serif">${it.unit || ""}</td>
      <td style="border:1px solid #000;font-size:8pt;padding:1px 4px;text-align:left;font-family:'Times New Roman',serif">${it.description || ""}</td>
      <td style="border:1px solid #000;font-size:8pt;padding:1px 3px;text-align:center;font-family:'Times New Roman',serif">${qty || ""}</td>
      <td style="border:1px solid #000;font-size:8pt;padding:1px 3px;text-align:right;font-family:'Times New Roman',serif">${price ? fmtN(price) : ""}</td>
      <td style="border:1px solid #000;font-size:8pt;padding:1px 3px;text-align:right;font-family:'Times New Roman',serif">${amt > 0 ? fmtN(amt) : ""}</td>
    </tr>`;
    })
    .join("");

  const td = `border:1px solid #000;font-size:8pt;padding:2px 4px;font-family:'Times New Roman',serif`;
  const tdb = `${td};font-weight:bold`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Times New Roman',Times,serif;font-size:9pt;color:#000;background:#fff;padding:20px}table{width:100%;border-collapse:collapse;table-layout:fixed;color:#000}@media print{body{padding:8mm}@page{margin:6mm}}</style>
</head><body>
<table>
  <colgroup><col style="width:13%"/><col style="width:8%"/><col style="width:38%"/><col style="width:10%"/><col style="width:14%"/><col style="width:17%"/></colgroup>
  <tbody>
    <tr><td colspan="6" style="text-align:right;font-size:9pt;padding-right:4px;font-family:'Times New Roman',serif">Appendix 61</td></tr>
    <tr><td colspan="6" style="text-align:center;font-weight:bold;font-size:13pt;padding:4px;font-family:'Times New Roman',serif">PURCHASE ORDER</td></tr>
    <tr style="height:20px"><td colspan="3" style="${tdb}">Supplier: <span style="font-weight:normal">${f.supplier}</span></td><td colspan="3" style="${tdb}">P.O. No.: <span style="font-weight:normal">${f.poNo}</span></td></tr>
    <tr style="height:20px"><td colspan="3" style="${tdb}">Address: <span style="font-weight:normal">${f.address}</span></td><td colspan="3" style="${tdb}">Date: <span style="font-weight:normal">${f.date}</span></td></tr>
    <tr style="height:20px"><td colspan="3" style="${tdb}">TIN: <span style="font-weight:normal">${f.tin}</span></td><td colspan="3" style="${tdb}">Mode of Procurement: <span style="font-weight:normal">${f.modeOfProcurement}</span></td></tr>
    <tr><td colspan="6" style="font-size:8pt;padding:4px;font-family:'Times New Roman',serif;font-style:italic">Gentlemen:</td></tr>
    <tr><td colspan="6" style="font-size:8pt;padding:2px 4px;font-family:'Times New Roman',serif">Please furnish this Office the following articles subject to the terms and conditions contained herein:</td></tr>
    <tr style="height:20px"><td colspan="3" style="${tdb}">Place of Delivery: <span style="font-weight:normal">${f.placeOfDelivery}</span></td><td colspan="3" style="${tdb}">Delivery Term: <span style="font-weight:normal">${f.deliveryTerm}</span></td></tr>
    <tr style="height:20px"><td colspan="3" style="${tdb}">Date of Delivery: <span style="font-weight:normal">${f.dateOfDelivery}</span></td><td colspan="3" style="${tdb}">Payment Term: <span style="font-weight:normal">${f.paymentTerm}</span></td></tr>
    <tr style="height:22px">
      <th style="${tdb};text-align:center">Stock/Property No.</th><th style="${tdb};text-align:center">Unit</th>
      <th style="${tdb};text-align:center">Description</th><th style="${tdb};text-align:center">Quantity</th>
      <th style="${tdb};text-align:center">Unit Cost</th><th style="${tdb};text-align:center">Amount</th>
    </tr>
    ${rows}
    <tr style="height:20px"><td colspan="3" style="${tdb}">Fund Cluster: <span style="font-weight:normal">${f.fundCluster}</span></td><td colspan="3" style="${tdb}">ORS No.: <span style="font-weight:normal">${f.orsNo}</span></td></tr>
    <tr style="height:20px"><td colspan="3" style="${tdb}">Funds Available: <span style="font-weight:normal">${f.fundsAvailable}</span></td><td colspan="3" style="${tdb}">Date of the ORS: <span style="font-weight:normal">${f.orsDate}</span></td></tr>
    <tr style="height:20px"><td colspan="3" style="${td}"></td><td colspan="3" style="${tdb}">Amount: <span style="font-weight:normal">₱${fmtN(f.orsAmount)}</span></td></tr>
    <tr style="height:14px"><td colspan="6" style="${td};font-style:italic">Signature over Printed Name of Chief Accountant/Head of Accounting Division/Unit</td></tr>
    <tr style="height:20px"><td colspan="3" style="${td}">${f.accountantName}</td><td colspan="3" style="${td}"></td></tr>
    <tr style="height:14px"><td colspan="3" style="${td};font-size:7.5pt;color:#555">${f.accountantDesig}</td><td colspan="3" style="${td}"></td></tr>
    <tr><td colspan="6" style="font-size:7.5pt;padding:4px;font-family:'Times New Roman',serif;font-style:italic">In case of failure to make the full delivery within the time specified above, a penalty of one-tenth (1/10) of one percent for every day of delay shall be imposed on the undelivered item/s.</td></tr>
    <tr style="height:24px"><td colspan="4" style="${td};text-align:center;font-style:italic">(Total Amount in Words)</td><td colspan="2" style="${td}"></td></tr>
    <tr style="height:22px"><td colspan="4" style="${tdb};text-align:center;font-size:7.5pt">${toWords(f.totalAmount)}</td><td colspan="2" style="${td}"></td></tr>
    <tr style="height:14px"><td colspan="3" style="${td};font-style:italic">Conforme:</td><td colspan="3" style="${td};font-style:italic;text-align:right">Very truly yours,</td></tr>
    <tr style="height:28px"><td colspan="3" style="${td}"></td><td colspan="3" style="${td}"></td></tr>
    <tr style="height:14px"><td colspan="3" style="${tdb};text-align:center">Signature over Printed Name of Supplier</td><td colspan="3" style="${tdb};text-align:center">Signature over Printed Name of Authorized Official</td></tr>
    <tr style="height:18px"><td colspan="3" style="${td}"></td><td colspan="3" style="${td};text-align:center">${f.authorizedOfficialName}</td></tr>
    <tr style="height:14px"><td colspan="3" style="${td};font-size:7.5pt">Date</td><td colspan="3" style="${td};text-align:center;font-size:8pt">${f.authorizedOfficialDesig}</td></tr>
  </tbody>
</table>
</body></html>`;
}

// ─── Shared sub-components ────────────────────────────────────────────────────

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
  children: string;
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
  return <View className="h-px bg-gray-100 my-1.5 mb-3.5" />;
}

function StyledInput(
  props: React.ComponentProps<typeof TextInput> & { mono?: boolean },
) {
  const { mono, style, ...rest } = props;
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...rest}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      className={`bg-gray-50 rounded-[10px] border px-3 py-2.5 text-sm text-gray-900 ${focused ? "border-[#064E3B]" : "border-gray-200"}`}
      style={[mono ? { fontFamily: MONO } : {}, style ?? {}]}
    />
  );
}

function ItemRow({
  item,
  index,
  onChange,
  onRemove,
}: {
  item: POItemRow;
  index: number;
  onChange: (i: number, f: keyof POItemRow, v: string) => void;
  onRemove: (i: number) => void;
}) {
  const amount = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
  return (
    <View className="bg-gray-50 border border-gray-200 rounded-[10px] p-3 mb-2.5 gap-2">
      <View className="flex-row items-center justify-between mb-0.5">
        <Text className="text-[11px] font-bold text-gray-500">
          ITEM {index + 1}
        </Text>
        <TouchableOpacity
          onPress={() => onRemove(index)}
          hitSlop={8}
          className="w-6 h-6 rounded-md bg-red-50 items-center justify-center"
        >
          <MaterialIcons name="close" size={14} color="#dc2626" />
        </TouchableOpacity>
      </View>
      <View>
        <FieldLabel>Stock / Property No.</FieldLabel>
        <StyledInput
          value={item.stock_no ?? ""}
          onChangeText={(v) => onChange(index, "stock_no", v)}
          placeholder="Optional"
          placeholderTextColor="#9ca3af"
          mono
        />
      </View>
      <View>
        <FieldLabel required>Description</FieldLabel>
        <StyledInput
          value={item.description}
          onChangeText={(v) => onChange(index, "description", v)}
          placeholder="Item description"
          placeholderTextColor="#9ca3af"
          multiline
          style={{ minHeight: 60, textAlignVertical: "top" }}
        />
      </View>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <FieldLabel required>Unit</FieldLabel>
          <StyledInput
            value={item.unit}
            onChangeText={(v) => onChange(index, "unit", v)}
            placeholder="pcs"
            placeholderTextColor="#9ca3af"
          />
        </View>
        <View className="flex-1">
          <FieldLabel required>Qty</FieldLabel>
          <StyledInput
            value={String(item.quantity || "")}
            onChangeText={(v) => onChange(index, "quantity", v)}
            placeholder="0"
            placeholderTextColor="#9ca3af"
            keyboardType="numeric"
            mono
          />
        </View>
        <View style={{ flex: 1.4 }}>
          <FieldLabel required>Unit Cost</FieldLabel>
          <StyledInput
            value={String(item.unit_price || "")}
            onChangeText={(v) => onChange(index, "unit_price", v)}
            placeholder="0.00"
            placeholderTextColor="#9ca3af"
            keyboardType="decimal-pad"
            mono
          />
        </View>
      </View>
      <View className="flex-row justify-end items-center gap-1.5">
        <Text className="text-[11px] text-gray-400">Amount</Text>
        <Text
          className="text-[13px] font-bold text-[#064E3B]"
          style={{ fontFamily: MONO }}
        >
          ₱{fmt(amount)}
        </Text>
      </View>
    </View>
  );
}

// ─── PR Picker Modal ──────────────────────────────────────────────────────────

function PRPickerModal({
  visible,
  suggestions,
  loading,
  onSelect,
  onDismiss,
}: {
  visible: boolean;
  suggestions: PRSuggestion[];
  loading: boolean;
  onSelect: (pr: PRSuggestion) => void;
  onDismiss: () => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suggestions;
    return suggestions.filter(
      (pr) =>
        pr.pr_no.toLowerCase().includes(q) ||
        (pr.office_section ?? "").toLowerCase().includes(q) ||
        (pr.purpose ?? "").toLowerCase().includes(q),
    );
  }, [query, suggestions]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      transparent={false}
    >
      <SafeAreaView className="flex-1 bg-white">
        {/* Header */}
        <View className="bg-[#064E3B] px-5 pt-5 pb-4">
          <View className="flex-row items-center justify-between mb-3">
            <View>
              <Text className="text-[10px] font-bold tracking-widest uppercase text-white/40">
                Select a Purchase Request
              </Text>
              <Text className="text-[16px] font-black text-white mt-0.5">
                Link PR to this PO
              </Text>
            </View>
            <TouchableOpacity
              onPress={onDismiss}
              hitSlop={10}
              className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center"
            >
              <Text className="text-white text-[20px] leading-none font-light">
                ×
              </Text>
            </TouchableOpacity>
          </View>
          {/* Search bar */}
          <View className="flex-row items-center bg-white/10 rounded-[10px] px-3 gap-2">
            <MaterialIcons
              name="search"
              size={16}
              color="rgba(255,255,255,0.5)"
            />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by PR No., section, purpose…"
              placeholderTextColor="rgba(255,255,255,0.35)"
              className="flex-1 py-2.5 text-sm text-white"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery("")} hitSlop={6}>
                <MaterialIcons
                  name="close"
                  size={14}
                  color="rgba(255,255,255,0.5)"
                />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* List */}
        {loading ? (
          <View className="flex-1 items-center justify-center gap-3">
            <ActivityIndicator size="large" color="#064E3B" />
            <Text className="text-[13px] text-gray-400">
              Loading purchase requests…
            </Text>
          </View>
        ) : filtered.length === 0 ? (
          <View className="flex-1 items-center justify-center gap-2 px-8">
            <MaterialIcons name="inbox" size={36} color="#d1d5db" />
            <Text className="text-[13px] text-gray-400 text-center">
              {query
                ? "No PRs match your search."
                : "No purchase requests found in the database."}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
            ItemSeparatorComponent={() => <View className="h-2" />}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => onSelect(item)}
                activeOpacity={0.75}
                className="bg-white border border-gray-200 rounded-xl p-3.5 gap-1"
                style={{ elevation: 1 }}
              >
                <View className="flex-row items-center justify-between gap-2">
                  <View className="bg-[#064E3B]/10 rounded-lg px-2.5 py-1">
                    <Text
                      className="text-[12px] font-black text-[#064E3B]"
                      style={{ fontFamily: MONO }}
                    >
                      {item.pr_no}
                    </Text>
                  </View>
                  {item.office_section ? (
                    <Text
                      className="text-[11px] text-gray-400 flex-1 text-right"
                      numberOfLines={1}
                    >
                      {item.office_section}
                    </Text>
                  ) : null}
                </View>
                {item.purpose ? (
                  <Text
                    className="text-[12.5px] text-gray-700 mt-0.5"
                    numberOfLines={2}
                  >
                    {item.purpose}
                  </Text>
                ) : null}
                <View className="flex-row items-center justify-between mt-1">
                  {item.total_cost != null ? (
                    <Text
                      className="text-[11.5px] font-bold text-[#064E3B]"
                      style={{ fontFamily: MONO }}
                    >
                      ₱{fmt(item.total_cost)}
                    </Text>
                  ) : (
                    <View />
                  )}
                  {item.fund_cluster ? (
                    <Text className="text-[10px] text-gray-400">
                      {item.fund_cluster}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ─── EditPOModal ──────────────────────────────────────────────────────────────

export default function EditPOModal({
  visible,
  record,
  onClose,
  onSave,
}: EditPOModalProps) {
  const [tab, setTab] = useState<"edit" | "preview">("edit");

  // ── PR picker state ─────────────────────────────────────────────────────
  const [showPicker, setShowPicker] = useState(false);
  const [prSuggestions, setPrSuggestions] = useState<PRSuggestion[]>([]);
  const [prLoadingDB, setPrLoadingDB] = useState(false);
  const [linkedPrNo, setLinkedPrNo] = useState<string | null>(null);

  // ── PO editable fields ──────────────────────────────────────────────────
  const [prNo, setPrNo] = useState("");
  const [supplier, setSupplier] = useState("");
  const [address, setAddress] = useState("");
  const [tin, setTin] = useState("");
  const [modeOfProcurement, setModeOfProcurement] = useState("");
  const [placeOfDelivery, setPlaceOfDelivery] = useState("");
  const [deliveryTerm, setDeliveryTerm] = useState("");
  const [dateOfDelivery, setDateOfDelivery] = useState("");
  const [paymentTerm, setPaymentTerm] = useState("");
  const [date, setDate] = useState("");
  const [officeSection, setOfficeSection] = useState("");
  const [fundCluster, setFundCluster] = useState("");
  const [orsNo, setOrsNo] = useState("");
  const [orsDate, setOrsDate] = useState("");
  const [fundsAvailable, setFundsAvailable] = useState("");
  const [orsAmount, setOrsAmount] = useState("");
  const [authorizedOfficialName, setAuthorizedOfficialName] = useState("");
  const [authorizedOfficialDesig, setAuthorizedOfficialDesig] = useState("");
  const [accountantName, setAccountantName] = useState("");
  const [accountantDesig, setAccountantDesig] = useState("");
  const [items, setItems] = useState<POItemRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch existing PO on open
  useEffect(() => {
    if (!visible || !record) return;
    setTab("edit");
    setLoading(true);
    setError(null);
    setLinkedPrNo(null);
    fetchPOWithItemsById(record.id)
      .then(({ header: h, items: rows }) => {
        setPrNo((h as any).pr_no ?? "");
        setSupplier((h as any).supplier ?? "");
        setAddress((h as any).address ?? "");
        setTin((h as any).tin ?? "");
        setModeOfProcurement((h as any).mode_of_procurement ?? "");
        setPlaceOfDelivery((h as any).place_of_delivery ?? "");
        setDeliveryTerm((h as any).delivery_term ?? "");
        setDateOfDelivery((h as any).date_of_delivery ?? "");
        setPaymentTerm((h as any).payment_term ?? "");
        setDate((h as any).date ?? "");
        setOfficeSection((h as any).office_section ?? "");
        setFundCluster((h as any).fund_cluster ?? "");
        setOrsNo((h as any).ors_no ?? "");
        setOrsDate((h as any).ors_date ?? "");
        setFundsAvailable((h as any).funds_available ?? "");
        setOrsAmount(String((h as any).ors_amount ?? ""));
        setAuthorizedOfficialName((h as any).authorized_official_name ?? "");
        setAuthorizedOfficialDesig((h as any).authorized_official_desig ?? "");
        setAccountantName((h as any).accountant_name ?? "");
        setAccountantDesig((h as any).accountant_desig ?? "");
        setItems(
          (rows ?? []).map((i: any) => ({
            id: i.id,
            po_id: i.po_id,
            stock_no: i.stock_no ?? null,
            unit: i.unit ?? "",
            description: i.description ?? "",
            quantity: Number(i.quantity) || 0,
            unit_price: Number(i.unit_price) || 0,
            subtotal: Number(i.subtotal) || 0,
          })),
        );
      })
      .catch((e: any) => setError(e.message ?? "Failed to load PO."))
      .finally(() => setLoading(false));
  }, [visible, record]);

  // ── PR picker handlers ──────────────────────────────────────────────────

  const openPRPicker = async () => {
    setPrLoadingDB(true);
    setShowPicker(true);
    try {
      const rows = await fetchPurchaseRequests();
      setPrSuggestions(
        (rows ?? []).map((r: any) => ({
          id: r.id,
          pr_no: r.pr_no ?? "",
          office_section: r.office_section ?? null,
          purpose: r.purpose ?? null,
          total_cost: r.total_cost ?? null,
          fund_cluster: r.fund_cluster ?? null,
          req_name: r.req_name ?? null,
          req_desig: r.req_desig ?? null,
          app_name: r.app_name ?? null,
          app_desig: r.app_desig ?? null,
        })),
      );
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not load purchase requests.");
      setShowPicker(false);
    } finally {
      setPrLoadingDB(false);
    }
  };

  const handleSelectPR = (pr: PRSuggestion) => {
    setPrNo(pr.pr_no);
    setLinkedPrNo(pr.pr_no);
    // Auto-fill fields derived from the selected PR
    if (pr.office_section) setOfficeSection(pr.office_section);
    if (pr.fund_cluster) setFundCluster(pr.fund_cluster);
    if (pr.app_name) setAuthorizedOfficialName(pr.app_name);
    if (pr.app_desig) setAuthorizedOfficialDesig(pr.app_desig);
    setShowPicker(false);
  };

  // ── Item handlers ───────────────────────────────────────────────────────

  const handleItemChange = (
    index: number,
    field: keyof POItemRow,
    value: string,
  ) =>
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const next = { ...item, [field]: value };
        if (field === "quantity" || field === "unit_price") {
          next.subtotal =
            (Number(field === "quantity" ? value : next.quantity) || 0) *
            (Number(field === "unit_price" ? value : next.unit_price) || 0);
        }
        return next;
      }),
    );

  const handleAddItem = () =>
    setItems((p) => [
      ...p,
      {
        stock_no: null,
        unit: "",
        description: "",
        quantity: 0,
        unit_price: 0,
        subtotal: 0,
      },
    ]);

  const handleRemoveItem = (index: number) =>
    setItems((p) => p.filter((_, i) => i !== index));

  const totalAmount = items.reduce(
    (s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0),
    0,
  );

  const buildPayload = (): POEditPayload => ({
    id: record!.id,
    poNo: record!.poNo,
    prNo,
    supplier,
    address,
    tin,
    modeOfProcurement,
    placeOfDelivery,
    deliveryTerm,
    dateOfDelivery,
    paymentTerm,
    date,
    officeSection,
    fundCluster,
    orsNo,
    orsDate,
    fundsAvailable,
    orsAmount: Number(orsAmount) || 0,
    totalAmount,
    authorizedOfficialName,
    authorizedOfficialDesig,
    accountantName,
    accountantDesig,
    items: items.map((it) => ({
      stock_no: it.stock_no ?? null,
      unit: it.unit,
      description: it.description,
      quantity: Number(it.quantity) || 0,
      unit_price: Number(it.unit_price) || 0,
      subtotal: (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
    })),
  });

  const previewHtml = useMemo(
    () => (record ? buildPOHtml(buildPayload()) : ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      prNo,
      supplier,
      address,
      tin,
      modeOfProcurement,
      placeOfDelivery,
      deliveryTerm,
      dateOfDelivery,
      paymentTerm,
      date,
      officeSection,
      fundCluster,
      orsNo,
      orsDate,
      fundsAvailable,
      orsAmount,
      authorizedOfficialName,
      authorizedOfficialDesig,
      accountantName,
      accountantDesig,
      items,
    ],
  );

  const handlePrint = async () => {
    try {
      await Print.printAsync({ html: previewHtml });
    } catch {}
  };
  const handleDownload = async () => {
    try {
      const { uri } = await Print.printToFileAsync({ html: previewHtml });
      const ok = await Sharing.isAvailableAsync();
      if (ok)
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
        });
      else Alert.alert("Saved", `PDF saved at: ${uri}`);
    } catch (e: any) {
      Alert.alert("Download failed", e?.message ?? String(e));
    }
  };

  const handleSave = async () => {
    if (!record) return;
    if (!prNo.trim()) return setError("PR Number is required.");
    if (!supplier.trim()) return setError("Supplier is required.");
    if (!items.length) return setError("At least one line item is required.");
    if (items.some((it) => !it.description.trim() || !it.unit.trim()))
      return setError("All items must have a description and unit.");

    setSaving(true);
    setError(null);
    const payload = buildPayload();

    try {
      await updatePO(
        record.id,
        {
          pr_no: prNo,
          supplier,
          address: address || null,
          tin: tin || null,
          mode_of_procurement: modeOfProcurement || null,
          place_of_delivery: placeOfDelivery || null,
          delivery_term: deliveryTerm || null,
          date_of_delivery: dateOfDelivery || null,
          payment_term: paymentTerm || null,
          date: date || null,
          office_section: officeSection || null,
          fund_cluster: fundCluster || null,
          ors_no: orsNo || null,
          ors_date: orsDate || null,
          funds_available: fundsAvailable || null,
          ors_amount: Number(orsAmount) || null,
          total_amount: totalAmount,
          authorized_official_name: authorizedOfficialName || null,
          authorized_official_desig: authorizedOfficialDesig || null,
          accountant_name: accountantName || null,
          accountant_desig: accountantDesig || null,
        },
        payload.items,
      );
      onSave(payload);
      onClose();
    } catch (e: any) {
      setError(e.message ?? "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  if (!visible || !record) return null;

  return (
    <>
      {/* ── PR Database Picker ───────────────────────────────────────────── */}
      <PRPickerModal
        visible={showPicker}
        suggestions={prSuggestions}
        loading={prLoadingDB}
        onSelect={handleSelectPR}
        onDismiss={() => setShowPicker(false)}
      />

      {/* ── Main Edit Modal ──────────────────────────────────────────────── */}
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView className="flex-1 bg-white">
          {/* ── Header ── */}
          <View className="bg-[#064E3B] px-5 pt-5 pb-0">
            <View className="flex-row items-start justify-between mb-4">
              <View className="flex-1 pr-3">
                <Text className="text-[10px] font-bold tracking-widest uppercase text-white/40">
                  Edit Purchase Order
                </Text>
                <Text
                  className="text-[18px] font-black text-white mt-0.5"
                  style={{ fontFamily: MONO }}
                >
                  {record.poNo}
                </Text>
                {linkedPrNo ? (
                  <View className="flex-row items-center gap-1.5 mt-0.5">
                    <MaterialIcons
                      name="link"
                      size={11}
                      color="rgba(255,255,255,0.5)"
                    />
                    <Text className="text-[10.5px] text-white/50">
                      Linked to PR {linkedPrNo}
                    </Text>
                  </View>
                ) : supplier ? (
                  <Text className="text-[11.5px] text-white/60 mt-0.5">
                    {supplier}
                  </Text>
                ) : null}
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
            <View className="flex-row bg-black/20 rounded-xl p-1">
              {(["edit", "preview"] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setTab(t)}
                  activeOpacity={0.8}
                  className={`flex-1 py-2 rounded-lg items-center ${tab === t ? "bg-white" : ""}`}
                >
                  <Text
                    className={`text-[12.5px] font-bold ${tab === t ? "text-[#064E3B]" : "text-white/50"}`}
                  >
                    {t === "edit" ? "Edit" : "Preview"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {tab === "preview" && (
              <View className="flex-row justify-end gap-2.5 pt-2 pb-1">
                <TouchableOpacity
                  onPress={handlePrint}
                  activeOpacity={0.8}
                  className="px-3.5 py-2 rounded-xl bg-white/10 border border-white/20"
                >
                  <Text className="text-[12px] font-bold text-white">
                    Print
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleDownload}
                  activeOpacity={0.8}
                  className="px-3.5 py-2 rounded-xl bg-white"
                >
                  <Text className="text-[12px] font-bold text-[#064E3B]">
                    Download PDF
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ── Body ── */}
          {loading ? (
            <View className="flex-1 items-center justify-center gap-3">
              <ActivityIndicator size="large" color="#064E3B" />
              <Text className="text-[13px] text-gray-400">
                Loading PO details…
              </Text>
            </View>
          ) : tab === "preview" ? (
            <WebView
              source={{ html: previewHtml }}
              style={{ flex: 1 }}
              originWhitelist={["*"]}
              showsVerticalScrollIndicator={false}
            />
          ) : (
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              className="flex-1"
            >
              <View className="flex-1">
                <ScrollView
                  className="flex-1"
                  contentContainerStyle={{
                    paddingHorizontal: 20,
                    paddingTop: 20,
                    paddingBottom: 16,
                  }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {error && (
                    <View className="bg-red-50 border border-red-200 rounded-[10px] px-3 py-2.5 mb-4 flex-row items-center gap-2">
                      <MaterialIcons
                        name="error-outline"
                        size={15}
                        color="#dc2626"
                      />
                      <Text className="text-red-600 text-[12.5px] flex-1">
                        {error}
                      </Text>
                    </View>
                  )}

                  {/* ── PR No. — required ── */}
                  <SectionLabel>Reference</SectionLabel>
                  <View className="mb-3.5">
                    <FieldLabel required>PR No.</FieldLabel>
                    <View className="flex-row items-center gap-2">
                      <View className="flex-1">
                        <StyledInput
                          value={prNo}
                          onChangeText={(v) => {
                            setPrNo(v);
                            setLinkedPrNo(null);
                          }}
                          placeholder="e.g. PR-2025-001"
                          placeholderTextColor="#9ca3af"
                          mono
                          editable={!linkedPrNo}
                        />
                      </View>
                      {/* Change / Browse button */}
                      {linkedPrNo ? (
                        <TouchableOpacity
                          onPress={openPRPicker}
                          className="flex-row items-center gap-1 bg-emerald-50 border border-emerald-200 rounded-[10px] px-2.5 py-2.5"
                        >
                          <MaterialIcons
                            name="swap-horiz"
                            size={14}
                            color="#064E3B"
                          />
                          <Text className="text-[11px] font-bold text-[#064E3B]">
                            Change
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          onPress={openPRPicker}
                          className="flex-row items-center gap-1 bg-gray-100 border border-gray-200 rounded-[10px] px-2.5 py-2.5"
                        >
                          <MaterialIcons
                            name="list-alt"
                            size={14}
                            color="#374151"
                          />
                          <Text className="text-[11px] font-bold text-gray-600">
                            Browse
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    {linkedPrNo && (
                      <View className="flex-row items-center gap-1 mt-1.5">
                        <MaterialIcons
                          name="check-circle"
                          size={12}
                          color="#10b981"
                        />
                        <Text className="text-[11px] text-emerald-600">
                          Auto-filled from database PR
                        </Text>
                      </View>
                    )}
                  </View>

                  <Divider />

                  {/* Supplier */}
                  <SectionLabel>Supplier</SectionLabel>
                  <View className="mb-3.5">
                    <FieldLabel required>Supplier Name</FieldLabel>
                    <StyledInput
                      value={supplier}
                      onChangeText={setSupplier}
                      placeholder="Supplier / company name"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                  <View className="mb-3.5">
                    <FieldLabel>Address</FieldLabel>
                    <StyledInput
                      value={address}
                      onChangeText={setAddress}
                      placeholder="Supplier address"
                      placeholderTextColor="#9ca3af"
                      multiline
                      style={{ minHeight: 54, textAlignVertical: "top" }}
                    />
                  </View>
                  <View className="flex-row gap-2.5 mb-3.5">
                    <View className="flex-1">
                      <FieldLabel>TIN</FieldLabel>
                      <StyledInput
                        value={tin}
                        onChangeText={setTin}
                        placeholder="000-000-000"
                        placeholderTextColor="#9ca3af"
                        keyboardType="numbers-and-punctuation"
                        mono
                      />
                    </View>
                    <View className="flex-1">
                      <FieldLabel>Mode of Procurement</FieldLabel>
                      <StyledInput
                        value={modeOfProcurement}
                        onChangeText={setModeOfProcurement}
                        placeholder="Shopping…"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                  </View>
                  <View className="mb-3.5">
                    <FieldLabel>Date</FieldLabel>
                    <StyledInput
                      value={date}
                      onChangeText={setDate}
                      placeholder="January 1, 2025"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>

                  <Divider />

                  {/* Delivery */}
                  <SectionLabel>Delivery Terms</SectionLabel>
                  <View className="flex-row gap-2.5 mb-3.5">
                    <View className="flex-1">
                      <FieldLabel>Place of Delivery</FieldLabel>
                      <StyledInput
                        value={placeOfDelivery}
                        onChangeText={setPlaceOfDelivery}
                        placeholder="DAR Office"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                    <View className="flex-1">
                      <FieldLabel>Delivery Term</FieldLabel>
                      <StyledInput
                        value={deliveryTerm}
                        onChangeText={setDeliveryTerm}
                        placeholder="30 days"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                  </View>
                  <View className="flex-row gap-2.5 mb-3.5">
                    <View className="flex-1">
                      <FieldLabel>Date of Delivery</FieldLabel>
                      <StyledInput
                        value={dateOfDelivery}
                        onChangeText={setDateOfDelivery}
                        placeholder="Feb 15, 2025"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                    <View className="flex-1">
                      <FieldLabel>Payment Term</FieldLabel>
                      <StyledInput
                        value={paymentTerm}
                        onChangeText={setPaymentTerm}
                        placeholder="30 days"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                  </View>
                  <View className="mb-3.5">
                    <FieldLabel>Office / Section</FieldLabel>
                    <StyledInput
                      value={officeSection}
                      onChangeText={setOfficeSection}
                      placeholder="Finance Division"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>

                  <Divider />

                  {/* ORS / Funds */}
                  <SectionLabel>ORS & Funds</SectionLabel>
                  <View className="flex-row gap-2.5 mb-3.5">
                    <View className="flex-1">
                      <FieldLabel>Fund Cluster</FieldLabel>
                      <StyledInput
                        value={fundCluster}
                        onChangeText={setFundCluster}
                        placeholder="—"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                    <View className="flex-1">
                      <FieldLabel>ORS No.</FieldLabel>
                      <StyledInput
                        value={orsNo}
                        onChangeText={setOrsNo}
                        placeholder="ORS-2025-001"
                        placeholderTextColor="#9ca3af"
                        mono
                      />
                    </View>
                  </View>
                  <View className="flex-row gap-2.5 mb-3.5">
                    <View className="flex-1">
                      <FieldLabel>Date of ORS</FieldLabel>
                      <StyledInput
                        value={orsDate}
                        onChangeText={setOrsDate}
                        placeholder="Jan 10, 2025"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                    <View className="flex-1">
                      <FieldLabel>ORS Amount</FieldLabel>
                      <StyledInput
                        value={orsAmount}
                        onChangeText={setOrsAmount}
                        placeholder="0.00"
                        placeholderTextColor="#9ca3af"
                        keyboardType="decimal-pad"
                        mono
                      />
                    </View>
                  </View>
                  <View className="mb-3.5">
                    <FieldLabel>Funds Available</FieldLabel>
                    <StyledInput
                      value={fundsAvailable}
                      onChangeText={setFundsAvailable}
                      placeholder="Yes / No / Partial"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>

                  <Divider />

                  {/* Signatories */}
                  <SectionLabel>Signatories</SectionLabel>
                  <View className="flex-row gap-2.5 mb-3.5">
                    <View className="flex-1">
                      <FieldLabel>Authorized Official</FieldLabel>
                      <StyledInput
                        value={authorizedOfficialName}
                        onChangeText={setAuthorizedOfficialName}
                        placeholder="Full name"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                    <View className="flex-1">
                      <FieldLabel>Designation</FieldLabel>
                      <StyledInput
                        value={authorizedOfficialDesig}
                        onChangeText={setAuthorizedOfficialDesig}
                        placeholder="Title"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                  </View>
                  <View className="flex-row gap-2.5 mb-3.5">
                    <View className="flex-1">
                      <FieldLabel>Chief Accountant</FieldLabel>
                      <StyledInput
                        value={accountantName}
                        onChangeText={setAccountantName}
                        placeholder="Full name"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                    <View className="flex-1">
                      <FieldLabel>Designation</FieldLabel>
                      <StyledInput
                        value={accountantDesig}
                        onChangeText={setAccountantDesig}
                        placeholder="Title"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                  </View>

                  <Divider />

                  {/* Line Items */}
                  <View className="flex-row items-center justify-between mb-2.5">
                    <SectionLabel>{`Line Items (${items.length})`}</SectionLabel>
                    <TouchableOpacity
                      onPress={handleAddItem}
                      className="flex-row items-center gap-1 bg-emerald-50 rounded-lg px-2.5 py-1.5"
                    >
                      <MaterialIcons name="add" size={14} color="#064E3B" />
                      <Text className="text-[11.5px] font-bold text-[#064E3B]">
                        Add Item
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {items.map((item, idx) => (
                    <ItemRow
                      key={idx}
                      item={item}
                      index={idx}
                      onChange={handleItemChange}
                      onRemove={handleRemoveItem}
                    />
                  ))}
                  {!items.length && (
                    <View
                      className="items-center py-6 bg-gray-50 rounded-[10px] border border-gray-200 mb-3.5"
                      style={{ borderStyle: "dashed" }}
                    >
                      <Text className="text-gray-400 text-[13px]">
                        No items yet — tap Add Item
                      </Text>
                    </View>
                  )}

                  {/* Total */}
                  <View className="bg-[#064E3B] rounded-2xl px-5 py-4 flex-row items-center justify-between mt-1 mb-1.5">
                    <View>
                      <Text className="text-[11px] font-bold uppercase tracking-widest text-white/50">
                        Total Amount
                      </Text>
                      <Text
                        className="text-[9px] text-white/30 mt-0.5"
                        numberOfLines={2}
                        style={{ maxWidth: 180 }}
                      >
                        {toWords(totalAmount)}
                      </Text>
                    </View>
                    <Text
                      className="text-[20px] font-black text-white"
                      style={{ fontFamily: MONO }}
                    >
                      ₱{fmt(totalAmount)}
                    </Text>
                  </View>
                </ScrollView>

                {/* Footer */}
                <View className="px-5 py-3.5 flex-row gap-2.5 border-t border-gray-100 bg-white">
                  <TouchableOpacity
                    onPress={onClose}
                    className="flex-1 bg-gray-100 rounded-[10px] py-3 items-center"
                  >
                    <Text className="text-sm font-bold text-gray-500">
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSave}
                    disabled={saving}
                    className={`flex-[2] rounded-[10px] py-3 flex-row items-center justify-center gap-2 ${saving ? "bg-gray-400" : "bg-[#064E3B]"}`}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <MaterialIcons name="check" size={16} color="#fff" />
                    )}
                    <Text className="text-sm font-bold text-white">
                      {saving ? "Saving…" : "Save Changes"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}
