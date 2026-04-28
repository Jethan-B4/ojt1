/**
 * PRPreviewPanel.tsx — Shared PR PDF preview module
 *
 * Mirrors the pattern of POPreviewPanel.tsx but renders the
 * Purchase Request form — Appendix 60.
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

export interface PRPreviewData {
  prNo?: string;
  date?: string;
  officeSection?: string;
  entityName?: string;
  fundCluster?: string;
  respCode?: string;
  purpose?: string;
  reqName?: string;
  reqDesig?: string;
  appName?: string;
  appDesig?: string;
}

export interface PRLineItem {
  stock_no?: string;
  unit?: string;
  description?: string;
  quantity?: number;
  unit_price?: number;
}

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

// ─── buildPRHtml ───────────────────────────────────────────────────────────────

export function buildPRHtml(record: PRPreviewData, items: PRLineItem[]): string {
  const fmtNum = (n: number) =>
    n.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const padded = [...items];
  while (padded.length < 30)
    padded.push({
      description: "",
      stock_no: "",
      unit: "",
      quantity: 0,
      unit_price: 0,
    } as any);
  const rows = padded
    .map((it) => {
      const total =
        it.quantity && it.unit_price ? it.quantity * it.unit_price : 0;
      return `<tr>
      <td style="border:1px solid black;font-size:8pt;padding:1px 3px;text-align:center;font-family:'Times New Roman',serif;height:16px">${it.stock_no || ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:1px 3px;text-align:center;font-family:'Times New Roman',serif">${it.unit || ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:1px 4px;text-align:left;font-family:'Times New Roman',serif">${it.description || ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:1px 3px;text-align:center;font-family:'Times New Roman',serif">${it.quantity || ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:1px 3px;text-align:right;font-family:'Times New Roman',serif">${it.unit_price ? fmtNum(it.unit_price) : ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:1px 3px;text-align:right;font-family:'Times New Roman',serif">${total > 0 ? fmtNum(total) : ""}</td>
    </tr>`;
    })
    .join("");
  const today =
    record.date ||
    new Date().toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Times New Roman',Times,serif;font-size:9pt;color:#000;background:#fff;padding:24px}table{width:100%;border-collapse:collapse;table-layout:fixed;color:#000}@media print{body{padding:10mm}@page{margin:8mm}}</style>
</head><body><table><colgroup><col style="width:12%"/><col style="width:8%"/><col style="width:40%"/><col style="width:10%"/><col style="width:15%"/><col style="width:15%"/></colgroup><tbody>
<tr style="height:27px"><td colspan="6" style="text-align:right;font-size:10pt;padding-right:4px;font-family:'Times New Roman',serif">Appendix 60</td></tr>
<tr style="height:34px"><td colspan="6" style="text-align:center;font-weight:bold;font-size:12pt;font-family:'Times New Roman',serif">PURCHASE REQUEST</td></tr>
<tr style="height:21px"><td colspan="2" style="border-bottom:1px solid black;font-size:8pt;padding:2px 4px;font-family:'Times New Roman',serif;font-weight:bold">Entity Name: <span style="font-weight:normal">${record.entityName || "DAR — CARAGA Region"}</span></td><td style="border-bottom:1px solid black"></td><td colspan="3" style="border-bottom:1px solid black;font-size:8pt;padding:2px 4px;font-family:'Times New Roman',serif;font-weight:bold">Fund Cluster: <span style="font-weight:normal">${record.fundCluster || ""}</span></td></tr>
<tr style="height:14px"><td rowspan="2" colspan="2" style="border:1px solid black;font-size:8pt;vertical-align:top;padding:2px 4px;font-family:'Times New Roman',serif">Office/Section:<br/>${record.officeSection || ""}</td><td colspan="2" style="border-top:1px solid black;border-left:1px solid black;border-right:1px solid black;font-size:8pt;font-weight:bold;padding:2px 4px;font-family:'Times New Roman',serif">PR No.: <span style="font-weight:normal">${record.prNo || ""}</span></td><td rowspan="2" colspan="2" style="border:1px solid black;font-size:8pt;font-weight:bold;vertical-align:top;padding:2px 4px;font-family:'Times New Roman',serif">Date:<br/><span style="font-weight:normal">${today}</span></td></tr>
<tr style="height:15px"><td colspan="2" style="border-bottom:1px solid black;border-left:1px solid black;font-size:8pt;font-weight:bold;padding:2px 4px;font-family:'Times New Roman',serif">Responsibility Center Code: <span style="font-weight:normal">${record.respCode || ""}</span></td></tr>
<tr style="height:22.5px"><th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;text-align:center;font-weight:bold">Stock/Property No.</th><th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;text-align:center;font-weight:bold">Unit</th><th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;text-align:center;font-weight:bold">Item Description</th><th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;text-align:center;font-weight:bold">Quantity</th><th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;text-align:center;font-weight:bold">Unit Cost</th><th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;text-align:center;font-weight:bold">Total Cost</th></tr>
${rows}
<tr style="height:17px"><td colspan="6" style="border-top:1px solid black;border-left:1px solid black;border-right:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif"><b>Purpose:</b> ${record.purpose || ""}</td></tr>
<tr style="height:30px"><td colspan="6" style="border-bottom:1px solid black;border-left:1px solid black;border-right:1px solid black"></td></tr>
<tr style="height:12px"><td style="border-top:1px solid black;border-left:1px solid black"></td><td colspan="2" style="border-top:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif"><i>Requested by:</i></td><td colspan="2" style="border-top:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif"><i>Approved by:</i></td><td style="border-top:1px solid black;border-right:1px solid black"></td></tr>
<tr style="height:12px"><td colspan="2" style="border-left:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif">Signature:</td><td></td><td></td><td></td><td style="border-right:1px solid black"></td></tr>
<tr style="height:12px"><td colspan="2" style="border-left:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif">Printed Name:</td><td style="font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif">${record.reqName || ""}</td><td colspan="2" style="font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif">${record.appName || ""}</td><td style="border-right:1px solid black"></td></tr>
<tr style="height:14.75px"><td colspan="2" style="border-bottom:1px solid black;border-left:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif">Designation:</td><td style="border-bottom:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif">${record.reqDesig || ""}</td><td colspan="2" style="border-bottom:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif">${record.appDesig || ""}</td><td style="border-bottom:1px solid black;border-right:1px solid black"></td></tr>
</tbody></table></body></html>`;
}

// ─── usePRPreviewActions ────────────────────────────────────────────────────────

export function usePRPreviewActions(html: string) {
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

// ─── PRPreviewPanel (default export) ────────────────────────────────────────────

interface PRPreviewPanelProps {
  html: string;
  onPrint?: () => void;
  onDownload?: () => void;
  showActions: boolean;
  style?: ViewStyle;
}

export default function PRPreviewPanel({
  html,
  onPrint,
  onDownload,
  showActions,
  style,
}: PRPreviewPanelProps) {
  const webRef = useRef<WebView>(null);
  const { handlePrint, handleDownload } = usePRPreviewActions(html);

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
