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
import React, { useEffect, useRef, useState } from "react";
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
  body { font-family: "Times New Roman", serif; font-size: 9.5pt; color: #000; padding: 18px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  td, th { border: 1px solid #000; padding: 3px 4px; vertical-align: middle; }
  .nob { border: none !important; }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: bold; }
  .num { text-align: right; font-family: "Courier New", monospace; }
  .hdr th { font-size: 8.5pt; font-weight: bold; text-transform: uppercase; text-align: center; }
  .small { font-size: 8pt; }
  .mono { font-family: "Courier New", monospace; }
</style>
</head>
<body>
  <table class="nob" style="margin-bottom:6px">
    <tr><td class="nob right small">Appendix 61</td></tr>
    <tr><td class="nob center bold" style="font-size:12pt">PURCHASE ORDER</td></tr>
  </table>

  <table style="margin-bottom:6px">
    <tr>
      <td class="bold" style="width:12%">Supplier :</td>
      <td style="width:38%">${supplier}</td>
      <td class="bold" style="width:12%">P.O. No. :</td>
      <td class="mono" style="width:38%">${poNo}</td>
    </tr>
    <tr>
      <td class="bold">Address :</td>
      <td>${address}</td>
      <td class="bold">Date :</td>
      <td>${date}</td>
    </tr>
    <tr>
      <td class="bold">TIN :</td>
      <td>${tin}</td>
      <td class="bold">Mode of Procurement :</td>
      <td>${procurementMode}</td>
    </tr>
    <tr><td colspan="4" class="small">Gentlemen:</td></tr>
    <tr>
      <td class="bold">Place of Delivery :</td>
      <td>${deliveryPlace}</td>
      <td class="bold">Delivery Term :</td>
      <td>${deliveryTerm}</td>
    </tr>
    <tr>
      <td class="bold">Date of Delivery :</td>
      <td>${dateOfDelivery}</td>
      <td class="bold">Payment Term :</td>
      <td>${paymentTerm}</td>
    </tr>
  </table>

  <table style="margin-bottom:6px">
    <tr>
      <td class="center small bold" style="width:18%">Stock/ Property No.</td>
      <td class="center small bold" style="width:10%">Unit</td>
      <td class="center small bold" style="width:38%">Description</td>
      <td class="center small bold" style="width:10%">Quantity</td>
      <td class="center small bold" style="width:12%">Unit Cost</td>
      <td class="center small bold" style="width:12%">Amount</td>
    </tr>
    ${itemRows || '<tr><td colspan="6" class="center small">No items</td></tr>'}
    <tr>
      <td colspan="5" class="right bold">Total</td>
      <td class="num bold">${fmtHtml(totalAmount)}</td>
    </tr>
  </table>

  <table style="margin-bottom:6px">
    <tr>
      <td class="bold" style="width:18%">Fund Cluster :</td>
      <td style="width:32%">${fundCluster}</td>
      <td class="bold" style="width:18%">ORS No. :</td>
      <td style="width:32%">${orsNo}</td>
    </tr>
    <tr>
      <td class="bold">Funds Available :</td>
      <td>${fundsAvailable}</td>
      <td class="bold">Date of the ORS:</td>
      <td>${orsDate}</td>
    </tr>
    <tr>
      <td class="bold">Amount :</td>
      <td class="num">${fmtHtml(orsAmount)}</td>
      <td colspan="2"></td>
    </tr>
  </table>

  <table style="margin-bottom:6px">
    <tr>
      <td class="small" style="height:36px">Please furnish this Office the following articles subject to the terms and conditions contained herein:</td>
    </tr>
  </table>

  <table style="margin-bottom:6px">
    <tr>
      <td style="width:50%" class="center">
        <div style="height:22px;"></div>
        <div class="bold">${officialName || "___________________________"}</div>
        <div class="small">Signature over Printed Name of Authorized Official</div>
        <div class="small">${officialDesig || "Designation"}</div>
      </td>
      <td style="width:50%" class="center">
        <div style="height:22px;"></div>
        <div class="bold">${accountantName || "___________________________"}</div>
        <div class="small">Signature over Printed Name of Chief Accountant/Head of Accounting Division/Unit</div>
        <div class="small">${accountantDesig || ""}</div>
      </td>
    </tr>
    <tr>
      <td class="small">Conforme: Signature over Printed Name of Supplier</td>
      <td class="small">Very truly yours,</td>
    </tr>
    <tr>
      <td class="small">Date: ___________________</td>
      <td class="small">(${toWords(totalAmount)})</td>
    </tr>
  </table>

  <p class="small">In case of failure to make the full delivery within the time specified above, a penalty of one-tenth (1/10) of one percent for every day of delay shall be imposed on the undelivered item/s.</p>
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
  const [zoomLevel] = useState(0.5);
  const webRef = useRef<WebView>(null);
  const { handlePrint, handleDownload } = usePOPreviewActions(html);

  useEffect(() => {
    if (webRef.current) {
      setTimeout(() => {
        webRef.current?.injectJavaScript(`document.body.style.zoom = '${zoomLevel}'`);
      }, 100);
    }
  }, [html, zoomLevel]);

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
        onLoad={() => {
          setTimeout(() => {
            webRef.current?.injectJavaScript(`document.body.style.zoom = '${zoomLevel}'`);
          }, 100);
        }}
      />
    </View>
  );
}
