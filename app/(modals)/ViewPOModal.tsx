/**
 * ViewPOModal.tsx — Full-screen PO viewer
 *
 * Matches ViewPRModal's layout exactly:
 *   - Same green header with PR/PO No., sub-title, status pill, close button
 *   - Same Details / PDF tab toggle
 *   - DetailsView shows header fields, purpose, line items, signatories
 *   - Extra: Phase 2 step timeline so reviewers can see exactly where the PO is
 *   - PDF tab renders a WebView of the PO form (same HTML pattern as ViewPRModal)
 *   - Print + Download PDF actions on the PDF tab
 */

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import WebView from "react-native-webview";
import { fetchPOWithItemsById, type POItemRow, type PORow } from "../../lib/supabase/po";
import type { PORecord } from "../procurement/POModule";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const fmt = (n: number) =>
  n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Phase 2 steps in order — used to render the timeline. */
const PHASE2_STEPS: { id: number; step: number; label: string; actor: string }[] = [
  { id: 1,  step: 11, label: "AAA Signing",        actor: "BAC" },
  { id: 2,  step: 12, label: "Fwd. to Supply",     actor: "BAC" },
  { id: 3,  step: 13, label: "PO # Assignment",    actor: "Supply" },
  { id: 4,  step: 14, label: "PO Preparation",     actor: "Supply" },
  { id: 5,  step: 15, label: "Budget Allocation",  actor: "Budget" },
  { id: 6,  step: 16, label: "ORS Preparation",    actor: "Budget" },
  { id: 7,  step: 17, label: "ORS # Assignment",   actor: "Budget" },
  { id: 8,  step: 18, label: "Budget Approval",    actor: "Budget" },
  { id: 9,  step: 19, label: "Accounting Review",  actor: "Accounting" },
  { id: 10, step: 20, label: "PARPO Signature",    actor: "PARPO" },
  { id: 11, step: 21, label: "PO Approved",        actor: "Supply" },
  { id: 12, step: 22, label: "Served to Supplier", actor: "Supply" },
  { id: 13, step: 23, label: "COA Submission",     actor: "Supply" },
];

// Status colours (mirrors POModule's PO_STATUS_CFG)
const PO_STATUS_CFG: Record<number, { bg: string; text: string; dot: string; hex: string }> = {
  1:  { bg: "#fdf4ff", text: "#86198f", dot: "#c026d3", hex: "#c026d3" },
  2:  { bg: "#eff6ff", text: "#1e40af", dot: "#3b82f6", hex: "#3b82f6" },
  3:  { bg: "#fefce8", text: "#854d0e", dot: "#eab308", hex: "#eab308" },
  4:  { bg: "#f0fdf4", text: "#166534", dot: "#22c55e", hex: "#22c55e" },
  5:  { bg: "#fff7ed", text: "#9a3412", dot: "#f97316", hex: "#f97316" },
  6:  { bg: "#fefce8", text: "#713f12", dot: "#ca8a04", hex: "#ca8a04" },
  7:  { bg: "#fff7ed", text: "#7c2d12", dot: "#ea580c", hex: "#ea580c" },
  8:  { bg: "#ecfdf5", text: "#065f46", dot: "#10b981", hex: "#10b981" },
  9:  { bg: "#f0f9ff", text: "#0c4a6e", dot: "#0ea5e9", hex: "#0ea5e9" },
  10: { bg: "#ecfdf5", text: "#064e3b", dot: "#059669", hex: "#059669" },
  11: { bg: "#f0fdf4", text: "#14532d", dot: "#16a34a", hex: "#16a34a" },
  12: { bg: "#f0fdfa", text: "#0f766e", dot: "#0d9488", hex: "#0d9488" },
  13: { bg: "#faf5ff", text: "#6b21a8", dot: "#9333ea", hex: "#9333ea" },
};
const STATUS_FALLBACK = { bg: "#f3f4f6", text: "#6b7280", dot: "#9ca3af", hex: "#9ca3af" };

// ─── HTML builder (mirrors ViewPRModal's buildPRHtml) ─────────────────────────

function buildPOHtml(header: PORow, items: POItemRow[]): string {
  const fmtN = (n: number) =>
    n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const padded = [...items];
  while (padded.length < 20)
    padded.push({ stock_no: null, unit: "", description: "", quantity: 0, unit_price: 0, subtotal: 0 });

  const rows = padded.map((it) => {
    const qty   = Number(it.quantity)   || 0;
    const price = Number(it.unit_price) || 0;
    const total = qty * price;
    return `<tr>
      <td style="border:1px solid black;font-size:8pt;padding:1px 3px;text-align:center;font-family:'Times New Roman',serif;height:16px">${it.stock_no || ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:1px 3px;text-align:center;font-family:'Times New Roman',serif">${it.unit || ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:1px 4px;text-align:left;font-family:'Times New Roman',serif">${it.description || ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:1px 3px;text-align:center;font-family:'Times New Roman',serif">${qty || ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:1px 3px;text-align:right;font-family:'Times New Roman',serif">${price ? fmtN(price) : ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:1px 3px;text-align:right;font-family:'Times New Roman',serif">${total > 0 ? fmtN(total) : ""}</td>
    </tr>`;
  }).join("");

  const date = header.created_at
    ? new Date(header.created_at).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })
    : new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Times New Roman',Times,serif;font-size:9pt;color:#000;background:#fff;padding:24px}table{width:100%;border-collapse:collapse;table-layout:fixed;color:#000}@media print{body{padding:10mm}@page{margin:8mm}}</style>
</head><body>
<table>
  <colgroup>
    <col style="width:12%"/><col style="width:8%"/><col style="width:40%"/>
    <col style="width:10%"/><col style="width:15%"/><col style="width:15%"/>
  </colgroup>
  <tbody>
    <tr style="height:34px"><td colspan="6" style="text-align:center;font-weight:bold;font-size:12pt;font-family:'Times New Roman',serif">PURCHASE ORDER</td></tr>
    <tr style="height:21px">
      <td colspan="2" style="border-bottom:1px solid black;font-size:8pt;padding:2px 4px;font-family:'Times New Roman',serif;font-weight:bold">Entity Name: <span style="font-weight:normal">${(header as any).entity_name || "DAR — CARAGA Region"}</span></td>
      <td style="border-bottom:1px solid black"></td>
      <td colspan="3" style="border-bottom:1px solid black;font-size:8pt;padding:2px 4px;font-family:'Times New Roman',serif;font-weight:bold">Fund Cluster: <span style="font-weight:normal">${(header as any).fund_cluster || ""}</span></td>
    </tr>
    <tr style="height:14px">
      <td rowspan="2" colspan="2" style="border:1px solid black;font-size:8pt;vertical-align:top;padding:2px 4px;font-family:'Times New Roman',serif">Supplier:<br/>${header.supplier || ""}</td>
      <td colspan="2" style="border-top:1px solid black;border-left:1px solid black;border-right:1px solid black;font-size:8pt;font-weight:bold;padding:2px 4px;font-family:'Times New Roman',serif">PO No.: <span style="font-weight:normal">${header.po_no || ""}</span></td>
      <td rowspan="2" colspan="2" style="border:1px solid black;font-size:8pt;font-weight:bold;vertical-align:top;padding:2px 4px;font-family:'Times New Roman',serif">Date:<br/><span style="font-weight:normal">${date}</span></td>
    </tr>
    <tr style="height:15px">
      <td colspan="2" style="border-bottom:1px solid black;border-left:1px solid black;font-size:8pt;font-weight:bold;padding:2px 4px;font-family:'Times New Roman',serif">PR No.: <span style="font-weight:normal">${header.pr_no || ""}</span></td>
    </tr>
    <tr style="height:22.5px">
      <th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;text-align:center;font-weight:bold">Stock/Property No.</th>
      <th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;text-align:center;font-weight:bold">Unit</th>
      <th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;text-align:center;font-weight:bold">Item Description</th>
      <th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;text-align:center;font-weight:bold">Quantity</th>
      <th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;text-align:center;font-weight:bold">Unit Cost</th>
      <th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;text-align:center;font-weight:bold">Total Cost</th>
    </tr>
    ${rows}
    <tr style="height:17px"><td colspan="6" style="border-top:1px solid black;border-left:1px solid black;border-right:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif"><b>Office/Section:</b> ${header.office_section || ""}</td></tr>
    <tr style="height:30px"><td colspan="6" style="border-bottom:1px solid black;border-left:1px solid black;border-right:1px solid black"></td></tr>
    <tr style="height:12px">
      <td style="border-top:1px solid black;border-left:1px solid black"></td>
      <td colspan="2" style="border-top:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif"><i>Prepared by (Supply):</i></td>
      <td colspan="2" style="border-top:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif"><i>Approved by (PARPO):</i></td>
      <td style="border-top:1px solid black;border-right:1px solid black"></td>
    </tr>
    <tr style="height:12px">
      <td colspan="2" style="border-left:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif">Signature:</td>
      <td></td><td></td><td></td>
      <td style="border-right:1px solid black"></td>
    </tr>
    <tr style="height:14.75px">
      <td colspan="2" style="border-bottom:1px solid black;border-left:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif">Printed Name:</td>
      <td style="border-bottom:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif">${(header as any).prepared_by_name || ""}</td>
      <td colspan="2" style="border-bottom:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif">${(header as any).approved_by_name || ""}</td>
      <td style="border-bottom:1px solid black;border-right:1px solid black"></td>
    </tr>
  </tbody>
</table>
</body></html>`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ViewPOModalProps {
  visible: boolean;
  record: PORecord | null;
  onClose: () => void;
}

// ─── ViewPOModal ──────────────────────────────────────────────────────────────

export default function ViewPOModal({ visible, record, onClose }: ViewPOModalProps) {
  const [tab,     setTab]     = useState<"details" | "pdf">("details");
  const [header,  setHeader]  = useState<PORow | null>(null);
  const [items,   setItems]   = useState<POItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const webRef = useRef<WebView>(null);

  useEffect(() => {
    if (!visible || !record) return;
    setTab("details");
    setLoading(true);
    fetchPOWithItemsById(record.id)
      .then(({ header: h, items: its }) => {
        setHeader(h);
        setItems(its);
      })
      .catch((e: any) => {
        Alert.alert("Load failed", e?.message ?? "Failed to load PO");
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [visible, record]);

  if (!record) return null;

  const statusCfg   = PO_STATUS_CFG[record.statusId] ?? STATUS_FALLBACK;
  const currentStep = PHASE2_STEPS.find((s) => s.id === record.statusId);
  const html        = header ? buildPOHtml(header, items) : "";

  const handlePrint = async () => {
    try { await Print.printAsync({ html }); } catch {}
  };
  const handleDownload = async () => {
    try {
      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare)
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      else Alert.alert("Saved", `PDF saved at: ${uri}`);
    } catch (e: any) {
      Alert.alert("Download failed", e?.message ?? String(e));
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-white">
        {/* ── Header (identical structure to ViewPRModal) ── */}
        <View className="bg-[#064E3B] px-5 pt-5 pb-0">
          <View className="flex-row items-start justify-between mb-4">
            <View className="flex-1 pr-3">
              <Text className="text-[10px] font-bold tracking-widest uppercase text-white/40">
                Purchase Order
              </Text>
              <Text className="text-[18px] font-black text-white mt-0.5" style={{ fontFamily: MONO }}>
                {record.poNo}
              </Text>
              <Text className="text-[11.5px] text-white/60 mt-0.5">
                {record.officeSection} · {record.date}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <View
                className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full"
                style={{ backgroundColor: statusCfg.hex + "33" }}
              >
                <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusCfg.dot }} />
                <Text className="text-[11px] font-bold text-white">
                  {currentStep?.label ?? `Status ${record.statusId}`}
                </Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={10}
                className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center"
              >
                <Text className="text-white text-[20px] leading-none font-light">×</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Tab toggle */}
          <View className="flex-row bg-black/20 rounded-xl p-1">
            {(["details", "pdf"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setTab(t)}
                activeOpacity={0.8}
                className={`flex-1 py-2 rounded-lg items-center ${tab === t ? "bg-white" : ""}`}
              >
                <Text className={`text-[12.5px] font-bold ${tab === t ? "text-[#064E3B]" : "text-white/50"}`}>
                  {t === "details" ? "Details" : "PDF Preview"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* PDF actions */}
          {tab === "pdf" && (
            <View className="flex-row justify-end gap-2.5 pt-2 pb-1">
              <TouchableOpacity onPress={handlePrint} activeOpacity={0.8} className="px-3.5 py-2 rounded-xl bg-white/10 border border-white/20">
                <Text className="text-[12px] font-bold text-white">Print</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDownload} activeOpacity={0.8} className="px-3.5 py-2 rounded-xl bg-white">
                <Text className="text-[12px] font-bold text-[#064E3B]">Download PDF</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── Body ── */}
        {loading ? (
          <View className="flex-1 items-center justify-center gap-3">
            <ActivityIndicator size="large" color="#064E3B" />
            <Text className="text-[13px] text-gray-400">Loading PO details…</Text>
          </View>
        ) : tab === "details" ? (
          <DetailsView record={record} header={header} items={items} />
        ) : (
          <WebView
            ref={webRef}
            source={{ html }}
            style={{ flex: 1 }}
            originWhitelist={["*"]}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </Modal>
  );
}

// ─── DetailsView ──────────────────────────────────────────────────────────────

function DetailsView({
  record, header, items,
}: {
  record: PORecord;
  header: PORow | null;
  items: POItemRow[];
}) {
  const statusCfg = PO_STATUS_CFG[record.statusId] ?? STATUS_FALLBACK;
  const currentStepIdx = PHASE2_STEPS.findIndex((s) => s.id === record.statusId);

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header info card */}
      <View className="bg-white rounded-2xl border border-gray-200 p-4 mb-3 shadow-sm" style={{ elevation: 2 }}>
        <InfoRow label="PO Number"      value={record.poNo}         mono />
        <InfoRow label="PR Number"      value={record.prNo}         mono />
        <InfoRow label="Supplier"       value={record.supplier} />
        <InfoRow label="Office/Section" value={record.officeSection} />
        <InfoRow label="Date"           value={record.date} />
        <InfoRow label="Status">
          <View
            className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full self-start"
            style={{ backgroundColor: statusCfg.bg }}
          >
            <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusCfg.dot }} />
            <Text className="text-[11.5px] font-bold" style={{ color: statusCfg.text }}>
              {PHASE2_STEPS.find((s) => s.id === record.statusId)?.label ?? `Status ${record.statusId}`}
            </Text>
          </View>
        </InfoRow>
        <InfoRow label="Total Amount" value={`₱${fmt(record.totalAmount)}`} mono last />
      </View>

      {/* Phase 2 step timeline */}
      <View className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-3 shadow-sm" style={{ elevation: 2 }}>
        <View className="bg-[#064E3B] px-4 py-3">
          <Text className="text-[10px] font-bold uppercase tracking-widest text-white/70">
            Phase 2 Progress
          </Text>
        </View>
        <View className="px-4 py-3 gap-0">
          {PHASE2_STEPS.map((step, idx) => {
            const done    = idx < currentStepIdx;
            const current = idx === currentStepIdx;
            const future  = idx > currentStepIdx;
            return (
              <View key={step.id} className="flex-row items-start gap-3">
                {/* Connector line + dot */}
                <View className="items-center" style={{ width: 20 }}>
                  <View
                    className="w-4 h-4 rounded-full items-center justify-center mt-0.5"
                    style={{
                      backgroundColor: done ? "#064E3B" : current ? statusCfg.dot : "#e5e7eb",
                    }}
                  >
                    {done && (
                      <Text className="text-white" style={{ fontSize: 9, fontWeight: "900" }}>✓</Text>
                    )}
                    {current && (
                      <View className="w-2 h-2 rounded-full bg-white" />
                    )}
                  </View>
                  {idx < PHASE2_STEPS.length - 1 && (
                    <View className="w-px flex-1 my-0.5" style={{ backgroundColor: done ? "#064E3B" : "#e5e7eb", minHeight: 14 }} />
                  )}
                </View>
                {/* Step label */}
                <View className="flex-1 pb-2">
                  <Text
                    className="text-[12px] font-semibold"
                    style={{ color: future ? "#9ca3af" : current ? statusCfg.text : "#374151" }}
                  >
                    Step {step.step} · {step.label}
                  </Text>
                  <Text className="text-[10.5px]" style={{ color: future ? "#d1d5db" : "#9ca3af" }}>
                    {step.actor}
                  </Text>
                </View>
                {current && (
                  <View
                    className="rounded-full px-2 py-0.5 self-start mt-0.5"
                    style={{ backgroundColor: statusCfg.bg }}
                  >
                    <Text className="text-[9.5px] font-bold" style={{ color: statusCfg.text }}>Current</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>

      {/* Line items */}
      <View className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-3 shadow-sm" style={{ elevation: 2 }}>
        <View className="bg-[#064E3B] px-4 py-3">
          <Text className="text-[10px] font-bold uppercase tracking-widest text-white/70">
            Line Items · {items.length || "—"} item{items.length !== 1 ? "s" : ""}
          </Text>
        </View>
        {items.length === 0 ? (
          <View className="px-4 py-5 items-center">
            <Text className="text-[12.5px] text-gray-400 text-center">No items on record</Text>
          </View>
        ) : (
          items.map((item, i) => (
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
          ))
        )}
      </View>

      {/* Total */}
      <View className="bg-[#064E3B] rounded-2xl px-5 py-4 flex-row items-center justify-between mb-3">
        <Text className="text-[11px] font-bold uppercase tracking-widest text-white/50">Total Amount</Text>
        <Text className="text-[20px] font-black text-white" style={{ fontFamily: MONO }}>
          ₱{fmt(record.totalAmount)}
        </Text>
      </View>
    </ScrollView>
  );
}

// ─── Shared helpers (mirrors ViewPRModal) ─────────────────────────────────────

function InfoRow({
  label, value, mono, last, children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  last?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <View className={`flex-row items-center justify-between py-2.5 ${last ? "" : "border-b border-gray-100"}`}>
      <Text className="text-[11.5px] font-semibold text-gray-400">{label}</Text>
      {children ?? (
        <Text
          className="text-[12.5px] font-semibold text-gray-800 text-right max-w-[60%]"
          style={mono ? { fontFamily: MONO } : undefined}
        >
          {value}
        </Text>
      )}
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
