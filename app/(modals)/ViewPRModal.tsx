/**
 * ViewPRModal.tsx
 *
 * Full-screen modal with two tabs:
 *   • "Details"  — native summary of the PR record
 *   • "PDF"      — WebView rendering the official Appendix 60 template
 *
 * PDF actions (shown in PDF tab):
 *   • Print    — expo-print
 *   • Download — expo-print + expo-file-system + expo-sharing
 *
 * Usage (in PRModule):
 *   <ViewPRModal visible={viewVisible} record={selectedRecord} onClose={close} />
 *
 * Install (if not already present):
 *   npx expo install expo-print expo-sharing expo-file-system react-native-webview
 */

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Modal, Platform, ScrollView,
  Text, TouchableOpacity, View,
} from "react-native";
import WebView from "react-native-webview";
import { fetchPRWithItemsById } from "../../lib/supabase";
import { PRDisplay, PRLineItem, toLineItemDisplay, toPRDisplay } from "../../types/model";

// ─── Types ────────────────────────────────────────────────────────────────────

// PRDisplay extended with optional Appendix 60 fields used by PRPreview
type PRRecord = PRDisplay & {
  entityName?: string;
  fundCluster?: string;
  respCode?: string;
  reqName?: string;
  appName?: string;
  reqDesig?: string;
  appDesig?: string;
};
type LineItem = PRLineItem;

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const fmt  = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_COLOR: Record<string, string> = {
  approved: "#15803d", pending: "#b45309", overdue: "#dc2626",
  processing: "#2563eb", draft: "#6b7280",
};

// ─── Appendix 60 HTML builder (matches PRPreview.tsx / official template) ───────

function buildPRHtml(record: PRRecord, items: LineItem[]): string {
  const fmtNum = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Pad to at least 30 rows like PRPreview does
  const padded = [...items];
  while (padded.length < 30) padded.push({ description: "", stock_no: "", unit: "", quantity: 0, unit_price: 0, subtotal: 0 } as any);

  const rows = padded.map((it) => {
    const total = it.quantity && it.unit_price ? it.quantity * it.unit_price : 0;
    return `<tr>
      <td style="border:1px solid black;font-size:8pt;padding:1px 3px;text-align:center;font-family:'Times New Roman',serif;overflow:hidden;word-wrap:break-word;white-space:normal;height:16px">${it.stock_no || ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:1px 3px;text-align:center;font-family:'Times New Roman',serif;overflow:hidden;word-wrap:break-word;white-space:normal">${it.unit || ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:1px 4px;text-align:left;font-family:'Times New Roman',serif;overflow:hidden;word-wrap:break-word;white-space:normal">${it.description || ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:1px 3px;text-align:center;font-family:'Times New Roman',serif">${it.quantity || ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:1px 3px;text-align:right;font-family:'Times New Roman',serif">${it.unit_price ? fmtNum(it.unit_price) : ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:1px 3px;text-align:right;font-family:'Times New Roman',serif">${total > 0 ? fmtNum(total) : ""}</td>
    </tr>`;
  }).join("");

  const totalCost = items.reduce((s, i) => s + (i.subtotal || 0), 0);
  const today = record.date || new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 9pt; color: #000; background: #fff; padding: 24px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; color: #000; }
  @media print { body { padding: 10mm; } @page { margin: 8mm; } }
</style>
</head><body>

<table>
  <colgroup>
    <col style="width:12%"/>
    <col style="width:8%"/>
    <col style="width:40%"/>
    <col style="width:10%"/>
    <col style="width:15%"/>
    <col style="width:15%"/>
  </colgroup>
  <tbody>
    <!-- Appendix label -->
    <tr style="height:27px">
      <td colspan="6" style="text-align:right;font-size:10pt;padding-right:4px;font-family:'Times New Roman',serif;color:#000">
        Appendix 60
      </td>
    </tr>
    <!-- Title -->
    <tr style="height:34px">
      <td colspan="6" style="text-align:center;font-weight:bold;font-size:12pt;font-family:'Times New Roman',serif;color:#000">
        PURCHASE REQUEST
      </td>
    </tr>
    <!-- Entity Name / Fund Cluster -->
    <tr style="height:21px">
      <td colspan="2" style="border-bottom:1px solid black;font-size:8pt;padding:2px 4px;font-family:'Times New Roman',serif;font-weight:bold;color:#000;overflow:hidden;word-wrap:break-word;white-space:normal">
        Entity Name: <span style="font-weight:normal">${record.entityName || "DAR — CARAGA Region"}</span>
      </td>
      <td style="border-bottom:1px solid black"></td>
      <td colspan="3" style="border-bottom:1px solid black;font-size:8pt;padding:2px 4px;font-family:'Times New Roman',serif;font-weight:bold;color:#000;overflow:hidden;word-wrap:break-word;white-space:normal">
        Fund Cluster: <span style="font-weight:normal">${record.fundCluster || ""}</span>
      </td>
    </tr>
    <!-- Office / PR No. / Date -->
    <tr style="height:14px">
      <td rowspan="2" colspan="2" style="border:1px solid black;font-size:8pt;vertical-align:top;padding:2px 4px;font-family:'Times New Roman',serif;color:#000;overflow:hidden;word-wrap:break-word;white-space:normal">
        Office/Section :<br/>${record.officeSection || ""}
      </td>
      <td colspan="2" style="border-top:1px solid black;border-left:1px solid black;border-right:1px solid black;font-size:8pt;font-weight:bold;padding:2px 4px;font-family:'Times New Roman',serif;color:#000;overflow:hidden;word-wrap:break-word;white-space:normal">
        PR No.: <span style="font-weight:normal">${record.prNo || ""}</span>
      </td>
      <td rowspan="2" colspan="2" style="border:1px solid black;font-size:8pt;font-weight:bold;vertical-align:top;padding:2px 4px;font-family:'Times New Roman',serif;color:#000;overflow:hidden;word-wrap:break-word;white-space:normal">
        Date:<br/><span style="font-weight:normal">${today}</span>
      </td>
    </tr>
    <tr style="height:15px">
      <td colspan="2" style="border-bottom:1px solid black;border-left:1px solid black;font-size:8pt;font-weight:bold;padding:2px 4px;font-family:'Times New Roman',serif;color:#000;overflow:hidden;word-wrap:break-word;white-space:normal">
        Responsibility Center Code : <span style="font-weight:normal">${record.respCode || ""}</span>
      </td>
    </tr>
    <!-- Column headers -->
    <tr style="height:22.5px">
      <th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;color:#000;text-align:center;font-weight:bold">Stock/<br/>Property No.</th>
      <th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;color:#000;text-align:center;font-weight:bold">Unit</th>
      <th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;color:#000;text-align:center;font-weight:bold">Item Description</th>
      <th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;color:#000;text-align:center;font-weight:bold">Quantity</th>
      <th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;color:#000;text-align:center;font-weight:bold">Unit Cost</th>
      <th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;color:#000;text-align:center;font-weight:bold">Total Cost</th>
    </tr>
    <!-- Item rows (padded to 30) -->
    ${rows}
    <!-- Purpose -->
    <tr style="height:17px">
      <td colspan="6" style="border-top:1px solid black;border-left:1px solid black;border-right:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif;color:#000;overflow:hidden;word-wrap:break-word;white-space:normal">
        <b>Purpose:</b> ${record.purpose || ""}
      </td>
    </tr>
    <tr style="height:30px">
      <td colspan="6" style="border-bottom:1px solid black;border-left:1px solid black;border-right:1px solid black"></td>
    </tr>
    <!-- Signature rows -->
    <tr style="height:12px">
      <td style="border-top:1px solid black;border-left:1px solid black;font-family:'Times New Roman',serif;color:#000"></td>
      <td colspan="2" style="border-top:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif;color:#000"><i>Requested by:</i></td>
      <td colspan="2" style="border-top:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif;color:#000"><i>Approved by:</i></td>
      <td style="border-top:1px solid black;border-right:1px solid black"></td>
    </tr>
    <tr style="height:12px">
      <td colspan="2" style="border-left:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif;color:#000">Signature :</td>
      <td></td><td></td><td></td>
      <td style="border-right:1px solid black"></td>
    </tr>
    <tr style="height:12px">
      <td colspan="2" style="border-left:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif;color:#000">Printed Name :</td>
      <td style="font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif;color:#000">${record.reqName || ""}</td>
      <td colspan="2" style="font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif;color:#000">${record.appName || ""}</td>
      <td style="border-right:1px solid black"></td>
    </tr>
    <tr style="height:14.75px">
      <td colspan="2" style="border-bottom:1px solid black;border-left:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif;color:#000">Designation :</td>
      <td style="border-bottom:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif;color:#000">${record.reqDesig || ""}</td>
      <td colspan="2" style="border-bottom:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif;color:#000">${record.appDesig || ""}</td>
      <td style="border-bottom:1px solid black;border-right:1px solid black"></td>
    </tr>
  </tbody>
</table>

</body></html>`;
}
// ─── Main component ───────────────────────────────────────────────────────────

interface ViewPRModalProps {
  visible: boolean;
  record: PRRecord | null;
  onClose: () => void;
}

export default function ViewPRModal({ visible, record, onClose }: ViewPRModalProps) {
  const [tab,     setTab]     = useState<"details" | "pdf">("details");
  const [header,  setHeader]  = useState<PRRecord | null>(null);
  const [items,   setItems]   = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const webRef = useRef<WebView>(null);

  // Fetch line items whenever a new record is opened
  useEffect(() => {
    if (!visible || !record) return;
    setTab("details");
    setLoading(true);
    fetchPRWithItemsById(record.id)
      .then(({ header, items }) => {
        setHeader(toPRDisplay(header));
        setItems(items.map(toLineItemDisplay));
      })
      .catch((e: any) => {
        const message = e?.message ?? "Failed to load PR from database";
        Alert.alert("Load failed", message);
        // Fallback to passed-in record so the user still sees something
        setHeader(record);
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [visible, record]);

  if (!record) return null;

  const hdr         = header ?? record;
  const html        = buildPRHtml(hdr, items);
  const statusColor = STATUS_COLOR[hdr.status] ?? "#6b7280";

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
      const message = e?.message ?? String(e);
      console.warn("PDF download error:", message);
      Alert.alert("Download failed", message);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-white">

        {/* Header */}
        <View className="bg-[#064E3B] px-5 pt-5 pb-0">
          <View className="flex-row items-start justify-between mb-4">
            <View>
              <Text className="text-[10px] font-bold tracking-widest uppercase text-white/40">
                Purchase Request
              </Text>
              <Text className="text-[18px] font-black text-white" style={{ fontFamily: MONO }}>
                {hdr.prNo}
              </Text>
              <Text className="text-[11.5px] text-white/60 mt-0.5">
                {hdr.officeSection} · {hdr.date}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <View className="px-3 py-1.5 rounded-full" style={{ backgroundColor: statusColor + "40" }}>
                <Text className="text-[11px] font-bold text-white capitalize">{hdr.status}</Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={10}
                className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center">
                <Text className="text-white text-[20px] leading-none font-light">×</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Tab toggle */}
          <View className="flex-row bg-black/20 rounded-xl p-1">
            {(["details", "pdf"] as const).map((t) => (
              <TouchableOpacity key={t} onPress={() => setTab(t)} activeOpacity={0.8}
                className={`flex-1 py-2 rounded-lg items-center ${tab === t ? "bg-white" : ""}`}>
                <Text className={`text-[12.5px] font-bold ${tab === t ? "text-[#064E3B]" : "text-white/50"}`}>
                  {t === "details" ? "📋  Details" : "📄  PDF Preview"}
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

        {/* Body */}
        {loading ? (
          <View className="flex-1 items-center justify-center gap-3">
            <ActivityIndicator size="large" color="#064E3B" />
            <Text className="text-[13px] text-gray-400">Loading PR details…</Text>
          </View>
        ) : tab === "details" ? (
          <DetailsView record={hdr} items={items} />
        ) : (
          <WebView ref={webRef} source={{ html }} style={{ flex: 1 }}
            originWhitelist={["*"]} showsVerticalScrollIndicator={false} />
        )}

      </View>
    </Modal>
  );
}

// ─── Details tab ──────────────────────────────────────────────────────────────

function DetailsView({ record, items }: { record: PRRecord; items: LineItem[] }) {
  const statusColor = STATUS_COLOR[record.status] ?? "#6b7280";
  return (
    <ScrollView className="flex-1 bg-gray-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}>

      {/* Summary */}
      <View className="bg-white rounded-2xl border border-gray-200 p-4 mb-3"
        style={{ shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 }}>
        <InfoRow label="PR Number"  value={record.prNo}          mono />
        <InfoRow label="Date"       value={record.date} />
        <InfoRow label="Section"    value={record.officeSection} />
        <InfoRow label="Status"     value={record.status}
          valueStyle={{ color: statusColor, fontWeight: "700", textTransform: "capitalize" }} />
        <InfoRow label="Total Cost" value={`₱${fmt(record.totalCost)}`} mono />
      </View>

      {/* Items */}
      <View className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-3"
        style={{ shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 }}>
        <View className="bg-[#064E3B] px-4 py-3">
          <Text className="text-[10px] font-bold uppercase tracking-widest text-white/70">
            Line Items · {items.length || "—"} item{items.length !== 1 ? "s" : ""}
          </Text>
        </View>
        {items.length === 0 ? (
          <View className="px-4 py-5 items-center">
            <Text className="text-[12.5px] text-gray-400 text-center">{record.purpose}</Text>
          </View>
        ) : items.map((item, i) => (
          <View key={i} className={`px-4 py-3 border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
            <Text className="text-[13px] font-semibold text-gray-800 mb-1.5" numberOfLines={2}>
              {item.description}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {item.stock_no ? <Chip label="Stock" value={item.stock_no} /> : null}
              <Chip label="Unit"  value={item.unit} />
              <Chip label="Qty"   value={String(item.quantity)} />
              <Chip label="Price" value={`₱${fmt(item.unit_price)}`} />
              <Chip label="Total" value={`₱${fmt(item.subtotal)}`} highlight />
            </View>
          </View>
        ))}
      </View>

      {/* Total footer */}
      <View className="bg-[#064E3B] rounded-2xl px-5 py-4 flex-row items-center justify-between">
        <Text className="text-[11px] font-bold uppercase tracking-widest text-white/50">Total Amount</Text>
        <Text className="text-[20px] font-black text-white" style={{ fontFamily: MONO }}>
          ₱{fmt(record.totalCost)}
        </Text>
      </View>
    </ScrollView>
  );
}

// ─── Atoms ────────────────────────────────────────────────────────────────────

function InfoRow({ label, value, mono, last, valueStyle }: {
  label: string; value: string; mono?: boolean; last?: boolean; valueStyle?: object;
}) {
  return (
    <View className={`flex-row items-center justify-between py-2.5 ${last ? "" : "border-b border-gray-100"}`}>
      <Text className="text-[11.5px] font-semibold text-gray-400">{label}</Text>
      <Text className="text-[12.5px] font-semibold text-gray-800 text-right max-w-[60%]"
        style={[mono ? { fontFamily: MONO } as object : {}, valueStyle ?? {}]}>
        {value}
      </Text>
    </View>
  );
}

function Chip({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View className={`flex-row items-center gap-1 px-2 py-0.5 rounded-md ${highlight ? "bg-emerald-100" : "bg-gray-100"}`}>
      <Text className={`text-[9.5px] font-bold uppercase tracking-wide ${highlight ? "text-emerald-600" : "text-gray-400"}`}>
        {label}
      </Text>
      <Text className={`text-[11.5px] font-semibold ${highlight ? "text-emerald-800" : "text-gray-700"}`}>
        {value}
      </Text>
    </View>
  );
}
