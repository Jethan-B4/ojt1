/**
 * AbstractPreviewPanel.tsx — Shared Abstract of Bids PDF preview module
 *
 * Renders the Abstract of Bids / Abstract of Quotations form.
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

export interface AbstractPreviewData {
  prNo?: string;
  date?: string;
  items?: AbstractLineItem[];
  bidders?: Bidder[];
}

export interface AbstractLineItem {
  description?: string;
  quantity?: number;
  unit?: string;
}

export interface Bidder {
  name?: string;
  items?: { price: number; remarks?: string }[];
}

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

// ─── buildAbstractHtml ─────────────────────────────────────────────────────────

export function buildAbstractHtml(data: AbstractPreviewData): string {
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

  const bidders = data.bidders || [];
  const bidderHeaders = bidders
    .map(
      (b) => `<th style="border:1px solid black;font-size:8pt;padding:4px;text-align:center;font-weight:bold" colspan="2">${b.name || "Bidder"}</th>`
    )
    .join("");

  const items = data.items || [];
  const rows = items
    .map((it, idx) => {
      const bidderCells = bidders
        .map((bidder) => {
          const price = bidder.items?.[idx]?.price;
          const remarks = bidder.items?.[idx]?.remarks;
          return `<td style="border:1px solid black;font-size:8pt;padding:4px;text-align:right">${price ? fmtNum(price) : ""}</td><td style="border:1px solid black;font-size:8pt;padding:4px;text-align:center">${remarks || ""}</td>`;
        })
        .join("");
      return `<tr>
      <td style="border:1px solid black;font-size:8pt;padding:4px;text-align:center">${idx + 1}</td>
      <td style="border:1px solid black;font-size:8pt;padding:4px">${it.description || ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:4px;text-align:center">${it.quantity || ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:4px;text-align:center">${it.unit || ""}</td>
      ${bidderCells}
    </tr>`;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Times New Roman',Times,serif;font-size:10pt;color:#000;background:#fff;padding:24px}table{width:100%;border-collapse:collapse;color:#000}@media print{body{padding:10mm}@page{margin:8mm}}</style>
</head><body>
<table><tbody>
<tr><td colspan="${4 + bidders.length * 2}" style="text-align:center;font-weight:bold;font-size:14pt;padding-bottom:16px">ABSTRACT OF BIDS / QUOTATIONS</td></tr>
<tr><td colspan="${4 + bidders.length * 2}" style="padding:4px 0"><b>PR No.:</b> ${data.prNo || ""} &nbsp;&nbsp;&nbsp;&nbsp; <b>Date:</b> ${today}</td></tr>
</tbody></table>

<table style="margin-top:12px">
<colgroup><col style="width:5%"/><col style="width:35%"/><col style="width:10%"/><col style="width:10%"/>${bidders.map(() => `<col style="width:15%"/><col style="width:10%"/>`).join("")}</colgroup>
<tbody>
<tr>
  <th style="border:1px solid black;font-size:8pt;padding:4px;text-align:center;font-weight:bold" rowspan="2">No.</th>
  <th style="border:1px solid black;font-size:8pt;padding:4px;text-align:center;font-weight:bold" rowspan="2">Description</th>
  <th style="border:1px solid black;font-size:8pt;padding:4px;text-align:center;font-weight:bold" rowspan="2">Qty</th>
  <th style="border:1px solid black;font-size:8pt;padding:4px;text-align:center;font-weight:bold" rowspan="2">Unit</th>
  ${bidderHeaders}
</tr>
<tr>
  ${bidders.map(() => `<th style="border:1px solid black;font-size:8pt;padding:4px;text-align:center;font-weight:bold">Price</th><th style="border:1px solid black;font-size:8pt;padding:4px;text-align:center;font-weight:bold">Remarks</th>`).join("")}
</tr>
${rows}
</tbody></table>

<table style="margin-top:24px"><tbody>
<tr><td colspan="${4 + bidders.length * 2}" style="padding:8px 0"><i>Remarks: _________________________________________________________</i></td></tr>
<tr><td colspan="${4 + bidders.length * 2}" style="padding-top:24px">Prepared by: _________________________________</td></tr>
<tr><td colspan="${4 + bidders.length * 2}" style="font-size:9pt">BAC Chairman / Authorized Representative</td></tr>
</tbody></table>
</body></html>`;
}

// ─── useAbstractPreviewActions ─────────────────────────────────────────────────

export function useAbstractPreviewActions(html: string) {
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

// ─── AbstractPreviewPanel (default export) ─────────────────────────────────────

interface AbstractPreviewPanelProps {
  html: string;
  onPrint?: () => void;
  onDownload?: () => void;
  showActions: boolean;
  style?: ViewStyle;
}

export default function AbstractPreviewPanel({
  html,
  onPrint,
  onDownload,
  showActions,
  style,
}: AbstractPreviewPanelProps) {
  const webRef = useRef<WebView>(null);
  const { handlePrint, handleDownload } = useAbstractPreviewActions(html);

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
