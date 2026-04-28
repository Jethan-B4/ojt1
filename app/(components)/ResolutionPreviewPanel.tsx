/**
 * ResolutionPreviewPanel.tsx — Shared Resolution PDF preview module
 *
 * Renders the Resolution of Award / BAC Resolution form.
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

export interface ResolutionPreviewData {
  prNo?: string;
  date?: string;
  supplier?: string;
  amount?: number;
  description?: string;
  bacMembers?: string[];
}

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

// ─── buildResolutionHtml ─────────────────────────────────────────────────────

export function buildResolutionHtml(data: ResolutionPreviewData): string {
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

  const bacMembers = data.bacMembers || ["____________________", "____________________", "____________________"];
  const bacRows = bacMembers
    .map(
      (member) => `
    <tr>
      <td style="padding:12px 0;width:50%">
        <div style="border-bottom:1px solid black;width:80%;margin:0 auto 4px 0"></div>
        <div style="font-size:9pt;text-align:center;width:80%">${member}</div>
        <div style="font-size:8pt;text-align:center;width:80%;color:#666">BAC Member</div>
      </td>
    </tr>
  `
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Times New Roman',Times,serif;font-size:10pt;color:#000;background:#fff;padding:24px}table{width:100%;border-collapse:collapse;color:#000}@media print{body{padding:10mm}@page{margin:8mm}}</style>
</head><body>
<table><tbody>
<tr><td style="text-align:center;font-weight:bold;font-size:14pt;padding-bottom:8px">RESOLUTION OF AWARD</td></tr>
<tr><td style="text-align:center;font-size:9pt;padding-bottom:16px">Bids and Awards Committee</td></tr>
</tbody></table>

<table style="margin-top:12px"><tbody>
<tr><td style="padding:4px 0"><b>PR No.:</b> ${data.prNo || ""}</td></tr>
<tr><td style="padding:4px 0"><b>Date:</b> ${today}</td></tr>
<tr><td style="padding:4px 0"><b>Description:</b> ${data.description || ""}</td></tr>
</tbody></table>

<table style="margin-top:16px"><tbody>
<tr><td style="padding:8px 0">WHEREAS, the Bids and Awards Committee (BAC) has conducted a competitive bidding for the above-mentioned procurement;</td></tr>
<tr><td style="padding:8px 0">WHEREAS, the evaluation of bids has been completed in accordance with the Government Procurement Reform Act;</td></tr>
<tr><td style="padding:8px 0">WHEREAS, <b>${data.supplier || "_______________________"}</b> has been found to be the lowest calculated and responsive bidder;</td></tr>
<tr><td style="padding:8px 0">NOW THEREFORE, the BAC RESOLVES to recommend the award of contract to the said bidder in the amount of <b>₱${data.amount ? fmtNum(data.amount) : "___________"}</b>;</td></tr>
</tbody></table>

<table style="margin-top:24px"><tbody>
<tr><td colspan="2" style="font-weight:bold;padding-bottom:8px">Signed by the BAC Members:</td></tr>
${bacRows}
</tbody></table>
</body></html>`;
}

// ─── useResolutionPreviewActions ───────────────────────────────────────────────

export function useResolutionPreviewActions(html: string) {
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

// ─── ResolutionPreviewPanel (default export) ───────────────────────────────────

interface ResolutionPreviewPanelProps {
  html: string;
  onPrint?: () => void;
  onDownload?: () => void;
  showActions: boolean;
  style?: ViewStyle;
}

export default function ResolutionPreviewPanel({
  html,
  onPrint,
  onDownload,
  showActions,
  style,
}: ResolutionPreviewPanelProps) {
  const webRef = useRef<WebView>(null);
  const { handlePrint, handleDownload } = useResolutionPreviewActions(html);

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
