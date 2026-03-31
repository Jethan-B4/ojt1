/**
 * POPreviewPanel.tsx — Shared PO PDF preview module
 *
 * Exports:
 *   buildPOHtml(data: POPreviewData): string
 *     — Pure function; returns the full HTML string for the Appendix 61 form.
 *
 *   toWords(amount: number): string
 *     — Converts a peso amount to Philippine-style words.
 *
 *   usePOPreviewActions(html: string)
 *     — Returns { handlePrint, handleDownload } bound to expo-print.
 *
 *   POPreviewPanel (default export)
 *     — Drop-in WebView panel with Print + Download PDF action buttons.
 */

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useRef } from "react";
import {
  Alert,
  Platform,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import WebView from "react-native-webview";
import type { POItemRow } from "../../lib/supabase/po";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Unified camelCase data shape for buildPOHtml.
 * All fields are optional so the function works from CreatePOModal,
 * EditPOModal, and ViewPOModal without extra adapter layers.
 */
export interface POPreviewData {
  poNo?: string;
  prNo?: string;
  supplier?: string;
  address?: string;
  tin?: string;
  procurementMode?: string;
  deliveryPlace?: string;
  deliveryTerm?: string;
  dateOfDelivery?: string;
  paymentTerm?: string;
  date?: string;
  fundCluster?: string;
  orsNo?: string;
  orsDate?: string;
  fundsAvailable?: string;
  orsAmount?: number;
  officeSection?: string;
  totalAmount?: number;
  officialName?: string;
  officialDesig?: string;
  accountantName?: string;
  accountantDesig?: string;
  items: Pick<
    POItemRow,
    "stock_no" | "unit" | "description" | "quantity" | "unit_price" | "subtotal"
  >[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

// ─── toWords ─────────────────────────────────────────────────────────────────

/** Converts a number to Philippine peso words (up to billions). */
export function toWords(amount: number): string {
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

  function threeDigits(n: number): string {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100)
      return `${tens[Math.floor(n / 10)]}${n % 10 ? " " + ones[n % 10] : ""}`;
    return `${ones[Math.floor(n / 100)]} HUNDRED${n % 100 ? " " + threeDigits(n % 100) : ""}`;
  }

  const pesos = Math.floor(amount);
  const centavos = Math.round((amount - pesos) * 100);

  const parts: string[] = [];
  if (pesos >= 1_000_000_000) {
    parts.push(`${threeDigits(Math.floor(pesos / 1_000_000_000))} BILLION`);
  }
  if (pesos % 1_000_000_000 >= 1_000_000) {
    parts.push(
      `${threeDigits(Math.floor((pesos % 1_000_000_000) / 1_000_000))} MILLION`,
    );
  }
  if (pesos % 1_000_000 >= 1_000) {
    parts.push(
      `${threeDigits(Math.floor((pesos % 1_000_000) / 1_000))} THOUSAND`,
    );
  }
  if (pesos % 1_000 > 0) {
    parts.push(threeDigits(pesos % 1_000));
  }

  const pesoWords = pesos === 0 ? "ZERO" : parts.join(" ");
  const centWords = centavos > 0 ? ` AND ${threeDigits(centavos)}/100` : "";
  return `${pesoWords} PESOS${centWords}`;
}

// ─── buildPOHtml ──────────────────────────────────────────────────────────────

const fmtHtml = (n: number) =>
  n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Returns the full Appendix 61 HTML string for the PO form. */
export function buildPOHtml(data: POPreviewData): string {
  const {
    poNo = "",
    prNo = "",
    supplier = "",
    address = "",
    tin = "",
    procurementMode = "",
    deliveryPlace = "",
    deliveryTerm = "",
    dateOfDelivery = "",
    paymentTerm = "",
    date = "",
    fundCluster = "",
    orsNo = "",
    orsDate = "",
    fundsAvailable = "",
    orsAmount = 0,
    officeSection = "",
    totalAmount = 0,
    officialName = "",
    officialDesig = "",
    accountantName = "",
    accountantDesig = "",
    items = [],
  } = data;

  const itemRows = items
    .map(
      (it) => `
      <tr>
        <td>${it.stock_no ?? ""}</td>
        <td>${it.unit}</td>
        <td>${it.description}</td>
        <td class="num">${it.quantity}</td>
        <td class="num">${fmtHtml(it.unit_price)}</td>
        <td class="num">${fmtHtml(it.subtotal)}</td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Purchase Order ${poNo}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 10px; color: #111; padding: 20px; }
  h1 { font-size: 16px; text-align: center; margin-bottom: 2px; }
  .subtitle { font-size: 10px; text-align: center; color: #555; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 1px solid #999; padding: 4px 6px; vertical-align: top; }
  .label { background: #f0f0f0; font-weight: bold; width: 130px; }
  .num { text-align: right; }
  .items-head th { background: #064E3B; color: #fff; font-size: 9px; text-align: center; }
  .total-row td { font-weight: bold; background: #f0fdf4; }
  .sig-table td { border: none; border-top: 1px solid #999; text-align: center; padding-top: 6px; font-size: 9px; }
  .words { font-size: 9px; font-style: italic; color: #444; padding: 4px 6px; border: 1px solid #ccc; margin-top: 6px; }
</style>
</head>
<body>
  <h1>PURCHASE ORDER</h1>
  <p class="subtitle">Appendix 61 · ${officeSection}</p>

  <table style="margin-bottom:10px">
    <tr><td class="label">PO No.</td><td>${poNo}</td><td class="label">Date</td><td>${date}</td></tr>
    <tr><td class="label">PR No.</td><td>${prNo}</td><td class="label">Fund Cluster</td><td>${fundCluster}</td></tr>
    <tr><td class="label">Supplier</td><td colspan="3">${supplier}</td></tr>
    <tr><td class="label">Address</td><td colspan="3">${address}</td></tr>
    <tr><td class="label">TIN</td><td>${tin}</td><td class="label">Mode of Procurement</td><td>${procurementMode}</td></tr>
    <tr><td class="label">Delivery Place</td><td>${deliveryPlace}</td><td class="label">Delivery Term</td><td>${deliveryTerm}</td></tr>
    <tr><td class="label">Date of Delivery</td><td>${dateOfDelivery}</td><td class="label">Payment Term</td><td>${paymentTerm}</td></tr>
  </table>

  <table style="margin-bottom:6px">
    <tr><td class="label">ORS No.</td><td>${orsNo}</td><td class="label">ORS Date</td><td>${orsDate}</td></tr>
    <tr><td class="label">Funds Available</td><td>${fundsAvailable}</td><td class="label">ORS Amount</td><td class="num">₱${fmtHtml(orsAmount)}</td></tr>
  </table>

  <table style="margin-bottom:10px">
    <thead class="items-head">
      <tr>
        <th style="width:80px">Stock/Property No.</th>
        <th style="width:55px">Unit</th>
        <th>Description</th>
        <th style="width:45px">Qty</th>
        <th style="width:75px">Unit Cost</th>
        <th style="width:80px">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows || '<tr><td colspan="6" style="text-align:center;color:#999">No items</td></tr>'}
      <tr class="total-row">
        <td colspan="5" style="text-align:right">TOTAL</td>
        <td class="num">₱${fmtHtml(totalAmount)}</td>
      </tr>
    </tbody>
  </table>

  <div class="words">${toWords(totalAmount)}</div>

  <table style="margin-top:16px">
    <tr>
      <td style="width:50%;text-align:center;border:none">
        <div style="margin-top:24px;border-top:1px solid #333;padding-top:4px">
          <strong>${officialName || "______________________"}</strong><br/>
          ${officialDesig || "Authorized Official"}<br/>
          <span style="font-size:9px;color:#666">Signature over Printed Name / Designation</span>
        </div>
      </td>
      <td style="width:50%;text-align:center;border:none">
        <div style="margin-top:24px;border-top:1px solid #333;padding-top:4px">
          <strong>${accountantName || "______________________"}</strong><br/>
          ${accountantDesig || "Chief Accountant"}<br/>
          <span style="font-size:9px;color:#666">Funds Available</span>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── usePOPreviewActions ──────────────────────────────────────────────────────

/** Returns print and download handlers bound to the provided HTML. */
export function usePOPreviewActions(html: string) {
  const handlePrint = async () => {
    try {
      await Print.printAsync({ html });
    } catch (e: any) {
      Alert.alert("Print failed", e?.message ?? "Could not open print dialog.");
    }
  };

  const handleDownload = async () => {
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert("Saved", `PDF saved to:\n${uri}`);
      }
    } catch (e: any) {
      Alert.alert("Download failed", e?.message ?? "Could not generate PDF.");
    }
  };

  return { handlePrint, handleDownload };
}

// ─── POPreviewPanel (default export) ─────────────────────────────────────────

interface POPreviewPanelProps {
  html: string;
  onPrint?: () => void;
  onDownload?: () => void;
  showActions: boolean;
  style?: ViewStyle;
}

export default function POPreviewPanel({
  html,
  onPrint,
  onDownload,
  showActions,
  style,
}: POPreviewPanelProps) {
  const webRef = useRef<WebView>(null);
  const { handlePrint, handleDownload } = usePOPreviewActions(html);

  return (
    <View style={[{ flex: 1 }, style]}>
      {showActions && (
        <View className="flex-row gap-2 px-4 py-2.5 bg-white border-b border-gray-100">
          <TouchableOpacity
            onPress={onPrint ?? handlePrint}
            activeOpacity={0.8}
            className="flex-1 flex-row items-center justify-center gap-1.5 bg-gray-100 rounded-xl py-2.5"
          >
            <Text className="text-[13px] font-bold text-gray-700">
              🖨 Print
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onDownload ?? handleDownload}
            activeOpacity={0.8}
            className="flex-1 flex-row items-center justify-center gap-1.5 bg-[#064E3B] rounded-xl py-2.5"
          >
            <Text className="text-[13px] font-bold text-white">
              ⬇ Download PDF
            </Text>
          </TouchableOpacity>
        </View>
      )}
      <WebView
        ref={webRef}
        source={{ html }}
        originWhitelist={["*"]}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
