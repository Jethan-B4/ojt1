/**
 * CreatePOModal.tsx — Create Purchase Order Modal
 *
 * Fields exactly match the Appendix 61 PO template from the PDF:
 *   Header   : Supplier, Address, TIN, Mode of Procurement,
 *              Place of Delivery, Delivery Term,
 *              Date of Delivery, Payment Term,
 *              PO No. (auto / override), Date
 *   Admin    : Fund Cluster, ORS No., Date of ORS,
 *              Funds Available, Amount
 *   Items    : Stock/Property No., Unit, Description, Quantity,
 *              Unit Cost  →  computed Amount per row
 *   Footer   : Total Amount in Words (derived),
 *              Authorized Official name + designation,
 *              Chief Accountant name + designation
 *
 * Only accessible to Supply role (role_id = 8) — enforced by POModule.
 *
 * Two-tab layout (Create | Preview) identical to EditPRModal.
 * Preview tab renders a live WebView of the Appendix 61 form.
 * Print + Download PDF buttons appear on the Preview tab.
 *
 * PR No. is REQUIRED. On open, the user is prompted to either:
 *   (A) Choose a PR from the database (fetches PR list, autofills fields), or
 *   (B) Type the PR No. manually (blank form).
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
import { insertPurchaseOrder, type POItemRow } from "../../lib/supabase/po";
import { fetchPurchaseRequests } from "../../lib/supabase/pr";

// ─── Exported types ───────────────────────────────────────────────────────────

export interface POCreatePayload {
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
  fundCluster: string;
  orsNo: string;
  orsDate: string;
  fundsAvailable: string;
  orsAmount: number;
  officeSection: string;
  totalAmount: number;
  authorizedOfficialName: string;
  authorizedOfficialDesig: string;
  accountantName: string;
  accountantDesig: string;
  items: POItemRow[];
}

interface CreatePOModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated: (payload: POCreatePayload) => void;
  divisionId?: number | null;
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

/** Converts a number to Philippine peso words (simplified, up to billions). */
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
  function toHundreds(n: number): string {
    if (n === 0) return "";
    if (n < 20) return ones[n] + " ";
    if (n < 100)
      return (
        tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "") + " "
      );
    return ones[Math.floor(n / 100)] + " HUNDRED " + toHundreds(n % 100);
  }
  const pesos = Math.floor(amount);
  const centavos = Math.round((amount - pesos) * 100);
  const billions = Math.floor(pesos / 1_000_000_000);
  const millions = Math.floor((pesos % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((pesos % 1_000_000) / 1_000);
  const remainder = pesos % 1_000;
  let result = "";
  if (billions) result += toHundreds(billions) + "BILLION ";
  if (millions) result += toHundreds(millions) + "MILLION ";
  if (thousands) result += toHundreds(thousands) + "THOUSAND ";
  if (remainder) result += toHundreds(remainder);
  result = result.trim() + " PESOS";
  if (centavos) result += " AND " + toHundreds(centavos).trim() + " CENTAVOS";
  return result + " ONLY";
}

// ─── HTML builder (Appendix 61 PO form) ─────────────────────────────────────

function buildPOHtml(f: POCreatePayload): string {
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
      const qty = Number(it.quantity) || 0;
      const price = Number(it.unit_price) || 0;
      const amt = qty * price;
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
  <colgroup>
    <col style="width:13%"/><col style="width:8%"/><col style="width:38%"/>
    <col style="width:10%"/><col style="width:14%"/><col style="width:17%"/>
  </colgroup>
  <tbody>
    <tr><td colspan="6" style="text-align:right;font-size:9pt;padding-right:4px;font-family:'Times New Roman',serif">Appendix 61</td></tr>
    <tr><td colspan="6" style="text-align:center;font-weight:bold;font-size:13pt;padding:4px;font-family:'Times New Roman',serif">PURCHASE ORDER</td></tr>

    <!-- Supplier / PO No. row -->
    <tr style="height:20px">
      <td colspan="3" style="${tdb}">Supplier: <span style="font-weight:normal">${f.supplier}</span></td>
      <td colspan="3" style="${tdb}">P.O. No.: <span style="font-weight:normal">${f.poNo}</span></td>
    </tr>
    <tr style="height:20px">
      <td colspan="3" style="${tdb}">Address: <span style="font-weight:normal">${f.address}</span></td>
      <td colspan="3" style="${tdb}">Date: <span style="font-weight:normal">${f.date}</span></td>
    </tr>
    <tr style="height:20px">
      <td colspan="3" style="${tdb}">TIN: <span style="font-weight:normal">${f.tin}</span></td>
      <td colspan="3" style="${tdb}">Mode of Procurement: <span style="font-weight:normal">${f.modeOfProcurement}</span></td>
    </tr>

    <!-- Gentlemen intro -->
    <tr><td colspan="6" style="font-size:8pt;padding:4px;font-family:'Times New Roman',serif;font-style:italic">Gentlemen:</td></tr>
    <tr><td colspan="6" style="font-size:8pt;padding:2px 4px;font-family:'Times New Roman',serif">Please furnish this Office the following articles subject to the terms and conditions contained herein:</td></tr>

    <!-- Delivery info -->
    <tr style="height:20px">
      <td colspan="3" style="${tdb}">Place of Delivery: <span style="font-weight:normal">${f.placeOfDelivery}</span></td>
      <td colspan="3" style="${tdb}">Delivery Term: <span style="font-weight:normal">${f.deliveryTerm}</span></td>
    </tr>
    <tr style="height:20px">
      <td colspan="3" style="${tdb}">Date of Delivery: <span style="font-weight:normal">${f.dateOfDelivery}</span></td>
      <td colspan="3" style="${tdb}">Payment Term: <span style="font-weight:normal">${f.paymentTerm}</span></td>
    </tr>

    <!-- Item table header -->
    <tr style="height:22px">
      <th style="${tdb};text-align:center">Stock/Property No.</th>
      <th style="${tdb};text-align:center">Unit</th>
      <th style="${tdb};text-align:center">Description</th>
      <th style="${tdb};text-align:center">Quantity</th>
      <th style="${tdb};text-align:center">Unit Cost</th>
      <th style="${tdb};text-align:center">Amount</th>
    </tr>
    ${rows}

    <!-- Fund cluster / ORS -->
    <tr style="height:20px">
      <td colspan="3" style="${tdb}">Fund Cluster: <span style="font-weight:normal">${f.fundCluster}</span></td>
      <td colspan="3" style="${tdb}">ORS No.: <span style="font-weight:normal">${f.orsNo}</span></td>
    </tr>
    <tr style="height:20px">
      <td colspan="3" style="${tdb}">Funds Available: <span style="font-weight:normal">${f.fundsAvailable}</span></td>
      <td colspan="3" style="${tdb}">Date of the ORS: <span style="font-weight:normal">${f.orsDate}</span></td>
    </tr>
    <tr style="height:20px">
      <td colspan="3" style="${td}"></td>
      <td colspan="3" style="${tdb}">Amount: <span style="font-weight:normal">₱${fmtN(f.orsAmount)}</span></td>
    </tr>

    <!-- Accountant signature block -->
    <tr style="height:14px">
      <td colspan="6" style="${td};font-size:8pt;font-style:italic">Signature over Printed Name of Chief Accountant/Head of Accounting Division/Unit</td>
    </tr>
    <tr style="height:20px">
      <td colspan="3" style="${td}">${f.accountantName}</td>
      <td colspan="3" style="${td}"></td>
    </tr>
    <tr style="height:14px">
      <td colspan="3" style="${td};font-size:7.5pt;color:#555">${f.accountantDesig}</td>
      <td colspan="3" style="${td}"></td>
    </tr>

    <!-- Penalty clause -->
    <tr><td colspan="6" style="font-size:7.5pt;padding:4px;font-family:'Times New Roman',serif;font-style:italic">
      In case of failure to make the full delivery within the time specified above, a penalty of one-tenth (1/10) of one percent for every day of delay shall be imposed on the undelivered item/s.
    </td></tr>

    <!-- Total in words -->
    <tr style="height:24px">
      <td colspan="4" style="${td};text-align:center;font-style:italic">(Total Amount in Words)</td>
      <td colspan="2" style="${td}"></td>
    </tr>
    <tr style="height:22px">
      <td colspan="4" style="${tdb};text-align:center;font-size:7.5pt">${toWords(f.totalAmount)}</td>
      <td colspan="2" style="${td}"></td>
    </tr>

    <!-- Conforme / Authorized Official -->
    <tr style="height:14px">
      <td colspan="3" style="${td};font-style:italic">Conforme:</td>
      <td colspan="3" style="${td};font-style:italic;text-align:right">Very truly yours,</td>
    </tr>
    <tr style="height:28px"><td colspan="3" style="${td}"></td><td colspan="3" style="${td}"></td></tr>
    <tr style="height:14px">
      <td colspan="3" style="${tdb};text-align:center">Signature over Printed Name of Supplier</td>
      <td colspan="3" style="${tdb};text-align:center">Signature over Printed Name of Authorized Official</td>
    </tr>
    <tr style="height:18px">
      <td colspan="3" style="${td}"></td>
      <td colspan="3" style="${td};text-align:center">${f.authorizedOfficialName}</td>
    </tr>
    <tr style="height:14px">
      <td colspan="3" style="${td};font-size:7.5pt">Date</td>
      <td colspan="3" style="${td};text-align:center;font-size:8pt">${f.authorizedOfficialDesig}</td>
    </tr>
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
      className={`bg-gray-50 rounded-[10px] border px-3 py-2.5 text-sm text-gray-900 ${
        focused ? "border-[#064E3B]" : "border-gray-200"
      }`}
      style={[mono ? { fontFamily: MONO } : {}, style ?? {}]}
    />
  );
}

// ─── Item row ─────────────────────────────────────────────────────────────────

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
// Shows a searchable list of PRs from the database for the user to pick from.

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
                {/* PR No. badge + office section */}
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

                {/* Purpose */}
                {item.purpose ? (
                  <Text
                    className="text-[12.5px] text-gray-700 mt-0.5"
                    numberOfLines={2}
                  >
                    {item.purpose}
                  </Text>
                ) : null}

                {/* Footer: total cost + fund cluster */}
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

// ─── PR Input Method Prompt ───────────────────────────────────────────────────
// Shown when the Create PO modal first opens, asking how the user wants
// to supply the PR No.

function PRInputMethodSheet({
  visible,
  onChooseFromDB,
  onEnterManually,
  onCancel,
}: {
  visible: boolean;
  onChooseFromDB: () => void;
  onEnterManually: () => void;
  onCancel: () => void;
}) {
  if (!visible) return null;
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View className="flex-1 bg-black/40 items-center justify-end">
        <View className="bg-white rounded-t-3xl w-full px-5 pt-6 pb-8">
          {/* Handle */}
          <View className="w-10 h-1 bg-gray-200 rounded-full self-center mb-5" />

          <Text className="text-[15px] font-black text-gray-800 mb-1">
            Link a Purchase Request
          </Text>
          <Text className="text-[12.5px] text-gray-400 mb-5 leading-5">
            A PR No. is required for every Purchase Order.{"\n"}
            How would you like to provide it?
          </Text>

          {/* Option A — choose from DB */}
          <TouchableOpacity
            onPress={onChooseFromDB}
            activeOpacity={0.8}
            className="flex-row items-center gap-3.5 bg-[#064E3B] rounded-2xl px-4 py-4 mb-3"
          >
            <View className="w-9 h-9 rounded-xl bg-white/10 items-center justify-center">
              <MaterialIcons name="list-alt" size={19} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="text-[13px] font-bold text-white">
                Choose from Database
              </Text>
              <Text className="text-[11px] text-white/60 mt-0.5">
                Browse approved PRs and auto-fill details
              </Text>
            </View>
            <MaterialIcons
              name="chevron-right"
              size={18}
              color="rgba(255,255,255,0.5)"
            />
          </TouchableOpacity>

          {/* Option B — manual */}
          <TouchableOpacity
            onPress={onEnterManually}
            activeOpacity={0.8}
            className="flex-row items-center gap-3.5 bg-gray-100 rounded-2xl px-4 py-4 mb-3"
          >
            <View className="w-9 h-9 rounded-xl bg-gray-200 items-center justify-center">
              <MaterialIcons name="edit" size={19} color="#374151" />
            </View>
            <View className="flex-1">
              <Text className="text-[13px] font-bold text-gray-800">
                Enter PR No. Manually
              </Text>
              <Text className="text-[11px] text-gray-400 mt-0.5">
                Type the PR number and fill in all details
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={18} color="#9ca3af" />
          </TouchableOpacity>

          {/* Cancel */}
          <TouchableOpacity
            onPress={onCancel}
            activeOpacity={0.7}
            className="items-center py-3"
          >
            <Text className="text-[13px] font-bold text-gray-400">Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── CreatePOModal ────────────────────────────────────────────────────────────

export default function CreatePOModal({
  visible,
  onClose,
  onCreated,
  divisionId,
}: CreatePOModalProps) {
  const [tab, setTab] = useState<"create" | "preview">("create");

  // ── PR picker state ─────────────────────────────────────────────────────
  // "prompt"   → show the input-method sheet on open
  // "picker"   → show the PR list picker modal
  // "form"     → show the main PO form (input method decided)
  type Stage = "prompt" | "picker" | "form";
  const [stage, setStage] = useState<Stage>("prompt");
  const [prSuggestions, setPrSuggestions] = useState<PRSuggestion[]>([]);
  const [prLoadingDB, setPrLoadingDB] = useState(false);
  const [linkedPrNo, setLinkedPrNo] = useState<string | null>(null); // set when chosen from DB

  // ── PO header fields (Appendix 61) ─────────────────────────────────────
  const [poNo, setPoNo] = useState("");
  const [prNo, setPrNo] = useState("");
  const [supplier, setSupplier] = useState("");
  const [address, setAddress] = useState("");
  const [tin, setTin] = useState("");
  const [modeOfProcurement, setModeOfProcurement] = useState("");
  const [placeOfDelivery, setPlaceOfDelivery] = useState("");
  const [deliveryTerm, setDeliveryTerm] = useState("");
  const [dateOfDelivery, setDateOfDelivery] = useState("");
  const [paymentTerm, setPaymentTerm] = useState("");
  const [date, setDate] = useState(
    new Date().toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
  );
  const [officeSection, setOfficeSection] = useState("");

  // ── Admin / ORS fields ──────────────────────────────────────────────────
  const [fundCluster, setFundCluster] = useState("");
  const [orsNo, setOrsNo] = useState("");
  const [orsDate, setOrsDate] = useState("");
  const [fundsAvailable, setFundsAvailable] = useState("");
  const [orsAmount, setOrsAmount] = useState("");

  // ── Signatories ─────────────────────────────────────────────────────────
  const [authorizedOfficialName, setAuthorizedOfficialName] = useState("");
  const [authorizedOfficialDesig, setAuthorizedOfficialDesig] = useState("");
  const [accountantName, setAccountantName] = useState("");
  const [accountantDesig, setAccountantDesig] = useState("");

  // ── Line items ──────────────────────────────────────────────────────────
  const [items, setItems] = useState<POItemRow[]>([]);

  // ── UI ──────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalAmount = items.reduce(
    (s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0),
    0,
  );

  // Reset back to prompt stage whenever the modal becomes visible
  useEffect(() => {
    if (visible) {
      setStage("prompt");
      setLinkedPrNo(null);
    }
  }, [visible]);

  // ── PR Picker handlers ──────────────────────────────────────────────────

  const handleChooseFromDB = async () => {
    setPrLoadingDB(true);
    setStage("picker");
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
      setStage("prompt");
    } finally {
      setPrLoadingDB(false);
    }
  };

  /** Called when user picks a PR from the picker list. */
  const handleSelectPR = (pr: PRSuggestion) => {
    setPrNo(pr.pr_no);
    setLinkedPrNo(pr.pr_no);
    // Auto-fill fields that can be derived from the PR
    if (pr.office_section) setOfficeSection(pr.office_section);
    if (pr.fund_cluster) setFundCluster(pr.fund_cluster);
    // Pre-fill authorized official from PR's app_name/app_desig (approver)
    if (pr.app_name) setAuthorizedOfficialName(pr.app_name);
    if (pr.app_desig) setAuthorizedOfficialDesig(pr.app_desig);
    setStage("form");
  };

  const handleEnterManually = () => {
    setLinkedPrNo(null);
    setStage("form");
  };

  // Item helpers
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

  // Build payload from current state
  const buildPayload = (): POCreatePayload => ({
    poNo,
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

  // Live HTML for preview tab
  const previewHtml = useMemo(
    () => buildPOHtml(buildPayload()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      poNo,
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
      const canShare = await Sharing.isAvailableAsync();
      if (canShare)
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
        });
      else Alert.alert("Saved", `PDF saved at: ${uri}`);
    } catch (e: any) {
      Alert.alert("Download failed", e?.message ?? String(e));
    }
  };

  // Validate & save
  const handleSave = async () => {
    if (!prNo.trim()) return setError("PR Number is required.");
    if (!supplier.trim()) return setError("Supplier is required.");
    if (!poNo.trim()) return setError("PO Number is required.");
    if (!items.length) return setError("At least one line item is required.");
    if (items.some((it) => !it.description.trim() || !it.unit.trim()))
      return setError("All items must have a description and unit.");

    setSaving(true);
    setError(null);
    const payload = buildPayload();

    try {
      await insertPurchaseOrder(
        {
          po_no: payload.poNo,
          pr_no: payload.prNo,
          pr_id: null,
          supplier: payload.supplier,
          office_section: payload.officeSection || null,
          total_amount: payload.totalAmount,
          status_id: 1, // AAA Signing — first PO status
          division_id: divisionId ?? null,
          // Extended fields stored as JSON or separate columns depending on schema
          ...(payload as any),
        },
        payload.items,
      );
      onCreated(payload);
      onClose();
      resetForm();
    } catch (e: any) {
      setError(e.message ?? "Failed to create PO.");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setTab("create");
    setStage("prompt");
    setLinkedPrNo(null);
    setPoNo("");
    setPrNo("");
    setSupplier("");
    setAddress("");
    setTin("");
    setModeOfProcurement("");
    setPlaceOfDelivery("");
    setDeliveryTerm("");
    setDateOfDelivery("");
    setPaymentTerm("");
    setOfficeSection("");
    setFundCluster("");
    setOrsNo("");
    setOrsDate("");
    setFundsAvailable("");
    setOrsAmount("");
    setAuthorizedOfficialName("");
    setAuthorizedOfficialDesig("");
    setAccountantName("");
    setAccountantDesig("");
    setItems([]);
    setError(null);
  };

  if (!visible) return null;

  return (
    <>
      {/* ── Step 1: Input-method prompt ─────────────────────────────────── */}
      <PRInputMethodSheet
        visible={stage === "prompt"}
        onChooseFromDB={handleChooseFromDB}
        onEnterManually={handleEnterManually}
        onCancel={() => {
          resetForm();
          onClose();
        }}
      />

      {/* ── Step 2: PR database picker ──────────────────────────────────── */}
      <PRPickerModal
        visible={stage === "picker"}
        suggestions={prSuggestions}
        loading={prLoadingDB}
        onSelect={handleSelectPR}
        onDismiss={() => setStage("prompt")}
      />

      {/* ── Step 3: Main PO form ─────────────────────────────────────────── */}
      <Modal
        visible={stage === "form"}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView className="flex-1 bg-white">
          {/* ── Header ── */}
          <View className="bg-[#064E3B] px-5 pt-5 pb-0">
            <View className="flex-row items-start justify-between mb-4">
              <View className="flex-1 pr-3">
                <Text className="text-[10px] font-bold tracking-widest uppercase text-white/40">
                  New Purchase Order
                </Text>
                <Text
                  className="text-[18px] font-black text-white mt-0.5"
                  style={{ fontFamily: MONO }}
                >
                  {poNo || "PO-XXXX"}
                </Text>
                {/* Show linked PR badge when chosen from DB */}
                {linkedPrNo ? (
                  <View className="flex-row items-center gap-1.5 mt-1">
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

            {/* Tab toggle */}
            <View className="flex-row bg-black/20 rounded-xl p-1">
              {(["create", "preview"] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setTab(t)}
                  activeOpacity={0.8}
                  className={`flex-1 py-2 rounded-lg items-center ${tab === t ? "bg-white" : ""}`}
                >
                  <Text
                    className={`text-[12.5px] font-bold ${tab === t ? "text-[#064E3B]" : "text-white/50"}`}
                  >
                    {t === "create" ? "Create" : "Preview"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* PDF actions on Preview tab */}
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
          {tab === "preview" ? (
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
                  {/* Error banner */}
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

                  {/* ── PR / PO Numbers ── */}
                  <SectionLabel>Reference Numbers</SectionLabel>

                  {/* PR No. row — required; shows a "Change PR" chip when linked from DB */}
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
                          editable={!linkedPrNo} // lock field when linked from DB
                        />
                      </View>
                      {/* "Change" button: reopen picker */}
                      {linkedPrNo ? (
                        <TouchableOpacity
                          onPress={handleChooseFromDB}
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
                        /* "Pick from DB" shortcut when in manual mode */
                        <TouchableOpacity
                          onPress={handleChooseFromDB}
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

                  <View className="mb-3.5">
                    <FieldLabel required>PO No.</FieldLabel>
                    <StyledInput
                      value={poNo}
                      onChangeText={setPoNo}
                      placeholder="2024-001"
                      placeholderTextColor="#9ca3af"
                      mono
                    />
                  </View>

                  <Divider />

                  {/* ── Supplier Info ── */}
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
                        placeholder="Shopping, Negotiated…"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                  </View>
                  <View className="mb-3.5">
                    <FieldLabel>Date</FieldLabel>
                    <StyledInput
                      value={date}
                      onChangeText={setDate}
                      placeholder="e.g. January 1, 2025"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>

                  <Divider />

                  {/* ── Delivery ── */}
                  <SectionLabel>Delivery Terms</SectionLabel>
                  <View className="flex-row gap-2.5 mb-3.5">
                    <View className="flex-1">
                      <FieldLabel>Place of Delivery</FieldLabel>
                      <StyledInput
                        value={placeOfDelivery}
                        onChangeText={setPlaceOfDelivery}
                        placeholder="DAR Office, etc."
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                    <View className="flex-1">
                      <FieldLabel>Delivery Term</FieldLabel>
                      <StyledInput
                        value={deliveryTerm}
                        onChangeText={setDeliveryTerm}
                        placeholder="30 days, upon PO…"
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
                        placeholder="February 15, 2025"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                    <View className="flex-1">
                      <FieldLabel>Payment Term</FieldLabel>
                      <StyledInput
                        value={paymentTerm}
                        onChangeText={setPaymentTerm}
                        placeholder="30 days, COD…"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                  </View>
                  <View className="mb-3.5">
                    <FieldLabel>Office / Section</FieldLabel>
                    <StyledInput
                      value={officeSection}
                      onChangeText={setOfficeSection}
                      placeholder="e.g. Finance Division"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>

                  <Divider />

                  {/* ── ORS / Funds ── */}
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
                        placeholder="January 10, 2025"
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

                  {/* ── Signatories ── */}
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

                  {/* ── Line Items ── */}
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

                {/* ── Footer ── */}
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
                      <MaterialIcons name="add" size={16} color="#fff" />
                    )}
                    <Text className="text-sm font-bold text-white">
                      {saving ? "Creating…" : "Create PO"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          )}
        </SafeAreaView>
      </Modal>

      {/* Re-render the PR picker when "Change" / "Browse" is tapped from within the form */}
      <PRPickerModal
        visible={stage === "picker" && prSuggestions.length > 0}
        suggestions={prSuggestions}
        loading={prLoadingDB}
        onSelect={handleSelectPR}
        onDismiss={() => setStage("form")}
      />
    </>
  );
}
