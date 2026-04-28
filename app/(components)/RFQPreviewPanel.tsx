/**
 * RFQPreviewPanel.tsx — Shared RFQ PDF preview module
 *
 * Renders the Request for Quotation form.
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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RFQPreviewData {
  prNo?: string;
  date?: string;
  supplier?: string;
  items?: RFQLineItem[];
}

export interface RFQLineItem {
  description?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
}

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

// ─── buildRFQHtml ────────────────────────────────────────────────────────────

export function buildRFQHtml(data: RFQPreviewData): string {
  const fmtNum = (n: number) =>
    n.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const today =
    data.date ||
    new Date().toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const items = data.items || [];
  const rows = items
    .map(
      (it, idx) => `
    <tr>
      <td style="border:1px solid black;font-size:9pt;padding:4px;text-align:center">${idx + 1}</td>
      <td style="border:1px solid black;font-size:9pt;padding:4px">${it.description || ""}</td>
      <td style="border:1px solid black;font-size:9pt;padding:4px;text-align:center">${it.quantity || ""}</td>
      <td style="border:1px solid black;font-size:9pt;padding:4px;text-align:center">${it.unit || ""}</td>
      <td style="border:1px solid black;font-size:9pt;padding:4px;text-align:right">${it.unitPrice ? fmtNum(it.unitPrice) : ""}</td>
      <td style="border:1px solid black;font-size:9pt;padding:4px;text-align:right">${(it.quantity && it.unitPrice) ? fmtNum(it.quantity * it.unitPrice) : ""}</td>
    </tr>
  `
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Times New Roman',Times,serif;font-size:10pt;color:#000;background:#fff;padding:24px}table{width:100%;border-collapse:collapse;color:#000}@media print{body{padding:10mm}@page{margin:8mm}}</style>
</head><body>
<table><tbody>
<tr><td colspan="6" style="text-align:center;font-weight:bold;font-size:14pt;padding-bottom:16px">REQUEST FOR QUOTATION</td></tr>
<tr><td colspan="3" style="padding:4px 0"><b>PR No.:</b> ${data.prNo || ""}</td><td colspan="3" style="padding:4px 0;text-align:right"><b>Date:</b> ${today}</td></tr>
<tr><td colspan="6" style="padding:4px 0"><b>Supplier:</b> ${data.supplier || "_______________________________"}</td></tr>
<tr><td colspan="6" style="padding:8px 0">We would like to request for the submission of your quotation for the following:</td></tr>
</tbody></table>

<table style="margin-top:12px"><colgroup><col style="width:5%"/><col style="width:45%"/><col style="width:10%"/><col style="width:10%"/><col style="width:15%"/><col style="width:15%"/></colgroup>
<tbody>
<tr style="background:#f5f5f5">
  <th style="border:1px solid black;font-size:9pt;padding:4px;text-align:center;font-weight:bold">No.</th>
  <th style="border:1px solid black;font-size:9pt;padding:4px;text-align:center;font-weight:bold">Description</th>
  <th style="border:1px solid black;font-size:9pt;padding:4px;text-align:center;font-weight:bold">Qty</th>
  <th style="border:1px solid black;font-size:9pt;padding:4px;text-align:center;font-weight:bold">Unit</th>
  <th style="border:1px solid black;font-size:9pt;padding:4px;text-align:center;font-weight:bold">Unit Price</th>
  <th style="border:1px solid black;font-size:9pt;padding:4px;text-align:center;font-weight:bold">Total</th>
</tr>
${rows}
</tbody></table>

<table style="margin-top:24px"><tbody>
<tr><td colspan="6" style="padding:8px 0">Please submit your quotation in a sealed envelope addressed to the undersigned on or before _______________.</td></tr>
<tr><td colspan="6" style="padding:8px 0">Very truly yours,</td></tr>
<tr><td colspan="6" style="padding-top:24px">_______________________________</td></tr>
<tr><td colspan="6" style="font-size:9pt">BAC Chairman / Authorized Representative</td></tr>
</tbody></table>
</body></html>`;
}

// ─── useRFQPreviewActions ─────────────────────────────────────────────────────

export function useRFQPreviewActions(html: string) {
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

// ─── RFQPreviewPanel (default export) ────────────────────────────────────────

interface RFQPreviewPanelProps {
  html: string;
  onPrint?: () => void;
  onDownload?: () => void;
  showActions: boolean;
  style?: ViewStyle;
}

export default function RFQPreviewPanel({
  html,
  onPrint,
  onDownload,
  showActions,
  style,
}: RFQPreviewPanelProps) {
  const webRef = useRef<WebView>(null);
  const { handlePrint, handleDownload } = useRFQPreviewActions(html);

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
              Print
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onDownload ?? handleDownload}
            activeOpacity={0.8}
            className="flex-1 flex-row items-center justify-center gap-1.5 bg-[#064E3B] rounded-xl py-2.5"
          >
            <Text className="text-[13px] font-bold text-white">
              Download PDF
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
