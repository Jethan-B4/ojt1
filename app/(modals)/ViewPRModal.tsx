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
// import { supabase } from "../../lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PRRecord {
  id: string; prNo: string; itemDescription: string;
  officeSection: string; quantity: number; totalCost: number;
  date: string; status: string; elapsedTime: string;
}

interface LineItem {
  stock_no: string; unit: string; description: string;
  quantity: number; unit_price: number; subtotal: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const fmt  = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_COLOR: Record<string, string> = {
  approved: "#15803d", pending: "#b45309", overdue: "#dc2626",
  processing: "#2563eb", draft: "#6b7280",
};

// ─── Appendix 60 HTML builder ─────────────────────────────────────────────────

function buildPRHtml(record: PRRecord, items: LineItem[]): string {
  const rows = items.length > 0
    ? items.map((it) => `
        <tr>
          <td>${it.stock_no || "—"}</td>
          <td>${it.unit || "—"}</td>
          <td>${it.description}</td>
          <td class="r">${it.quantity}</td>
          <td class="r">&#8369;${fmt(it.unit_price)}</td>
          <td class="r">&#8369;${fmt(it.subtotal)}</td>
        </tr>`)
      .join("")
    : `<tr><td colspan="6" style="text-align:center;color:#999;padding:16px 8px;">
         ${record.itemDescription}
       </td></tr>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:28px 32px;background:#fff}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;
       border-bottom:2px solid #064E3B;padding-bottom:10px;margin-bottom:14px}
  .hdr-c{text-align:center}
  .hdr-c .app{font-size:9px;color:#888}
  .hdr-c .title{font-size:17px;font-weight:900;letter-spacing:1px;color:#064E3B;margin:2px 0}
  .hdr-r{text-align:right;font-size:10px}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-bottom:12px}
  .mrow{display:flex;gap:6px;border-bottom:1px solid #e5e7eb;padding-bottom:3px}
  .ml{font-weight:700;font-size:9.5px;color:#555;white-space:nowrap}
  .mv{font-size:10px}
  .full{grid-column:1/-1}
  table{width:100%;border-collapse:collapse;margin-bottom:14px}
  th{background:#064E3B;color:#fff;font-size:9px;font-weight:700;
     text-transform:uppercase;letter-spacing:.4px;padding:7px 8px;text-align:left}
  .r{text-align:right}
  td{padding:6px 8px;font-size:10.5px;border-bottom:1px solid #e5e7eb}
  tr:nth-child(even) td{background:#f9fafe}
  .tot{display:flex;justify-content:flex-end;margin-bottom:18px}
  .tot-box{background:#064E3B;color:#fff;padding:8px 18px;border-radius:6px;text-align:right}
  .tot-lbl{font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;opacity:.6}
  .tot-amt{font-size:18px;font-weight:900;font-family:"Courier New",monospace}
  .sigs{display:grid;grid-template-columns:1fr 1fr;gap:20px 48px;margin-top:12px}
  .sig{border-top:1.5px solid #111;padding-top:5px}
  .sig-lbl{font-size:9px;font-weight:700;color:#555;text-transform:uppercase}
  .sig-nm{font-size:11px;font-weight:700;min-height:20px}
  .sig-ds{font-size:9.5px;color:#555}
  @media print{body{padding:16px 20px}@page{margin:12mm}}
</style></head><body>

<div class="hdr">
  <div>
    <div style="font-size:10px">Entity Name: <strong>DAR — CARAGA Region</strong></div>
    <div style="font-size:10px;margin-top:4px">Fund Cluster: ___________</div>
  </div>
  <div class="hdr-c">
    <div class="app">Appendix 60</div>
    <div class="title">PURCHASE REQUEST</div>
  </div>
  <div class="hdr-r">
    <div>PR No.: <strong>${record.prNo}</strong></div>
    <div style="margin-top:4px">Date: <strong>${record.date}</strong></div>
  </div>
</div>

<div class="meta">
  <div class="mrow"><span class="ml">Office / Section:</span><span class="mv">${record.officeSection}</span></div>
  <div class="mrow"><span class="ml">Status:</span>
    <span class="mv" style="font-weight:700;text-transform:capitalize">${record.status}</span></div>
  <div class="mrow full"><span class="ml">Responsibility Center Code:</span>
    <span class="mv">___________________________</span></div>
</div>

<table>
  <thead><tr>
    <th style="width:14%">Stock / Property No.</th>
    <th style="width:8%">Unit</th>
    <th>Item Description</th>
    <th class="r" style="width:8%">Qty</th>
    <th class="r" style="width:13%">Unit Cost</th>
    <th class="r" style="width:13%">Total Cost</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>

<div class="tot">
  <div class="tot-box">
    <div class="tot-lbl">Total Amount</div>
    <div class="tot-amt">&#8369;${fmt(record.totalCost)}</div>
  </div>
</div>

<div class="mrow" style="margin-bottom:16px">
  <span class="ml">Purpose:</span>
  <span class="mv" style="flex:1;padding-left:4px">${record.itemDescription}</span>
</div>

<div class="sigs">
  <div class="sig">
    <div class="sig-lbl">Requested by</div>
    <div class="sig-nm">&nbsp;</div>
    <div class="sig-ds">Signature / Printed Name / Designation</div>
  </div>
  <div class="sig">
    <div class="sig-lbl">Approved by</div>
    <div class="sig-nm">&nbsp;</div>
    <div class="sig-ds">Signature / Printed Name / Designation</div>
  </div>
</div>

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
  const [items,   setItems]   = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const webRef = useRef<WebView>(null);

  // Fetch line items whenever a new record is opened
  useEffect(() => {
    if (!visible || !record) return;
    setTab("details");
    setLoading(true);
    try {
      // Local fallback data while backend wiring is disabled
      const qty = Math.max(1, Number(record.quantity || 1));
      const unitPrice = qty > 0 ? Number(record.totalCost || 0) / qty : Number(record.totalCost || 0);
      const localItems: LineItem[] = [
        {
          stock_no: "",
          unit: "",
          description: record.itemDescription,
          quantity: qty,
          unit_price: unitPrice,
          subtotal: Number(record.totalCost || 0),
        },
      ];
      setItems(localItems);
    } catch (e: any) {
      const message = e?.message ?? "Unknown error while preparing PR items";
      Alert.alert("Items load failed", message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [visible, record]);

  if (!record) return null;

  const html        = buildPRHtml(record, items);
  const statusColor = STATUS_COLOR[record.status] ?? "#6b7280";

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
                {record.prNo}
              </Text>
              <Text className="text-[11.5px] text-white/60 mt-0.5">
                {record.officeSection} · {record.date}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <View className="px-3 py-1.5 rounded-full" style={{ backgroundColor: statusColor + "40" }}>
                <Text className="text-[11px] font-bold text-white capitalize">{record.status}</Text>
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
          <DetailsView record={record} items={items} />
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
        <InfoRow label="Elapsed"    value={record.elapsedTime} last />
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
            <Text className="text-[12.5px] text-gray-400 text-center">{record.itemDescription}</Text>
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
