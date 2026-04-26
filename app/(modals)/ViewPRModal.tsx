/**
 * ViewPRModal.tsx — Full-screen PR viewer with Details + PDF tabs.
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
import {
  fetchPRStatuses,
  fetchPRWithItemsById,
  type PRStatusRow,
} from "../../lib/supabase";
import {
  PRDisplay,
  PRLineItem,
  toLineItemDisplay,
  toPRDisplay,
} from "../../types/model";

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

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const fmt = (n: number) =>
  n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const STATUS_CONFIG: Record<
  number,
  { dot: string; bg: string; text: string; hex: string }
> = {
  1: { dot: "#fbbf24", bg: "#fffbeb", text: "#92400e", hex: "#fbbf24" },
  2: { dot: "#3b82f6", bg: "#eff6ff", text: "#1e40af", hex: "#3b82f6" },
  3: { dot: "#8b5cf6", bg: "#f5f3ff", text: "#5b21b6", hex: "#8b5cf6" },
  4: { dot: "#f97316", bg: "#fff7ed", text: "#9a3412", hex: "#f97316" },
  5: { dot: "#22c55e", bg: "#f0fdf4", text: "#166534", hex: "#22c55e" },
};
const STATUS_FALLBACK = {
  dot: "#9ca3af",
  bg: "#f3f4f6",
  text: "#6b7280",
  hex: "#9ca3af",
};

function buildPRHtml(record: PRRecord, items: LineItem[]): string {
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
      subtotal: 0,
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

interface ViewPRModalProps {
  visible: boolean;
  record: PRRecord | null;
  initialTab?: "details" | "pdf";
  onClose: () => void;
}

export default function ViewPRModal({
  visible,
  record,
  initialTab,
  onClose,
}: ViewPRModalProps) {
  const [tab, setTab] = useState<"details" | "pdf">("details");
  const [header, setHeader] = useState<PRRecord | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [statuses, setStatuses] = useState<PRStatusRow[]>([]);
  const webRef = useRef<WebView>(null);

  useEffect(() => {
    fetchPRStatuses()
      .then(setStatuses)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!visible || !record) return;
    setTab(initialTab ?? "details");
    setLoading(true);
    fetchPRWithItemsById(record.id)
      .then(({ header, items }) => {
        const display = toPRDisplay(header);
        setHeader({
          ...display,
          entityName: header.entity_name ?? undefined,
          fundCluster: header.fund_cluster ?? undefined,
          respCode: header.resp_code ?? undefined,
          reqName: header.req_name ?? undefined,
          reqDesig: header.req_desig ?? undefined,
          appName: header.app_name ?? undefined,
          appDesig: header.app_desig ?? undefined,
        });
        setItems(items.map(toLineItemDisplay));
      })
      .catch((e: any) => {
        Alert.alert("Load failed", e?.message ?? "Failed to load PR");
        setHeader(record);
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [visible, record, initialTab]);

  if (!record) return null;
  const hdr = header ?? record;
  const html = buildPRHtml(hdr, items);
  const statusCfg = STATUS_CONFIG[hdr.statusId] ?? STATUS_FALLBACK;
  const statusLabel =
    statuses.find((s) => s.id === hdr.statusId)?.status_name ??
    `Status ${hdr.statusId}`;

  const handlePrint = async () => {
    try {
      await Print.printAsync({ html });
    } catch {}
  };
  const handleDownload = async () => {
    try {
      const { uri } = await Print.printToFileAsync({ html });
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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-white">
        {/* Header */}
        <View className="bg-[#064E3B] px-5 pt-5 pb-0">
          <View className="flex-row items-start justify-between mb-4">
            <View className="flex-1 pr-3">
              <Text className="text-[10px] font-bold tracking-widest uppercase text-white/40">
                Purchase Request
              </Text>
              <Text
                className="text-[18px] font-black text-white mt-0.5"
                style={{ fontFamily: MONO }}
              >
                {hdr.prNo}
              </Text>
              <Text className="text-[11.5px] text-white/60 mt-0.5">
                {hdr.officeSection} · {hdr.date}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <View
                className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full"
                style={{ backgroundColor: statusCfg.hex + "33" }}
              >
                <View
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: statusCfg.dot }}
                />
                <Text className="text-[11px] font-bold text-white">
                  {statusLabel}
                </Text>
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
                <Text
                  className={`text-[12.5px] font-bold ${tab === t ? "text-[#064E3B]" : "text-white/50"}`}
                >
                  {t === "details" ? "Details" : "PDF Preview"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* PDF actions */}
          {tab === "pdf" && (
            <View className="flex-row justify-end gap-2.5 pt-2 pb-1">
              <TouchableOpacity
                onPress={handlePrint}
                activeOpacity={0.8}
                className="px-3.5 py-2 rounded-xl bg-white/10 border border-white/20"
              >
                <Text className="text-[12px] font-bold text-white">Print</Text>
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
        {/* Body */}
        {loading ? (
          <View className="flex-1 items-center justify-center gap-3">
            <ActivityIndicator size="large" color="#064E3B" />
            <Text className="text-[13px] text-gray-400">
              Loading PR details…
            </Text>
          </View>
        ) : tab === "details" ? (
          <DetailsView record={hdr} items={items} statuses={statuses} />
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

function DetailsView({
  record,
  items,
  statuses,
}: {
  record: PRRecord;
  items: LineItem[];
  statuses: PRStatusRow[];
}) {
  const statusCfg = STATUS_CONFIG[record.statusId] ?? STATUS_FALLBACK;
  const statusLabel =
    statuses.find((s) => s.id === record.statusId)?.status_name ??
    `Status ${record.statusId}`;
  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      <View
        className="bg-white rounded-2xl border border-gray-200 p-4 mb-3"
        style={{
          shadowColor: "#000",
          shadowOpacity: 0.06,
          shadowRadius: 6,
          elevation: 2,
        }}
      >
        <InfoRow label="PR Number" value={record.prNo} mono />
        <InfoRow label="Date" value={record.date} />
        <InfoRow
          label="Entity Name"
          value={record.entityName || "DAR — CARAGA Region"}
        />
        <InfoRow label="Fund Cluster" value={record.fundCluster || "—"} />
        <InfoRow label="Section" value={record.officeSection} />
        <InfoRow label="Resp. Code" value={record.respCode || "—"} />
        <InfoRow label="Status" last={false}>
          <View
            className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full self-start"
            style={{ backgroundColor: statusCfg.bg }}
          >
            <View
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: statusCfg.dot }}
            />
            <Text
              className="text-[11.5px] font-bold"
              style={{ color: statusCfg.text }}
            >
              {statusLabel}
            </Text>
          </View>
        </InfoRow>
        <InfoRow label="Total Cost" value={`₱${fmt(record.totalCost)}`} mono />
      </View>
      {!!record.purpose && (
        <View
          className="bg-white rounded-2xl border border-gray-200 p-4 mb-3"
          style={{
            shadowColor: "#000",
            shadowOpacity: 0.06,
            shadowRadius: 6,
            elevation: 2,
          }}
        >
          <Text className="text-[10.5px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">
            Purpose
          </Text>
          <Text className="text-[13px] text-gray-700 leading-[20px]">
            {record.purpose}
          </Text>
        </View>
      )}
      <View
        className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-3"
        style={{
          shadowColor: "#000",
          shadowOpacity: 0.06,
          shadowRadius: 6,
          elevation: 2,
        }}
      >
        <View className="bg-[#064E3B] px-4 py-3">
          <Text className="text-[10px] font-bold uppercase tracking-widest text-white/70">
            Line Items · {items.length || "—"} item
            {items.length !== 1 ? "s" : ""}
          </Text>
        </View>
        {items.length === 0 ? (
          <View className="px-4 py-5 items-center">
            <Text className="text-[12.5px] text-gray-400 text-center">
              No items on record
            </Text>
          </View>
        ) : (
          items.map((item, i) => (
            <View
              key={i}
              className={`px-4 py-3 border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
            >
              <Text
                className="text-[13px] font-semibold text-gray-800 mb-1.5"
                numberOfLines={2}
              >
                {item.description}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {item.stock_no ? (
                  <Chip label="Stock" value={item.stock_no} />
                ) : null}
                <Chip label="Unit" value={item.unit} />
                <Chip label="Qty" value={String(item.quantity)} />
                <Chip label="Price" value={`₱${fmt(item.unit_price)}`} />
                <Chip
                  label="Total"
                  value={`₱${fmt(item.subtotal)}`}
                  highlight
                />
              </View>
            </View>
          ))
        )}
      </View>
      <View className="bg-[#064E3B] rounded-2xl px-5 py-4 flex-row items-center justify-between mb-3">
        <Text className="text-[11px] font-bold uppercase tracking-widest text-white/50">
          Total Amount
        </Text>
        <Text
          className="text-[20px] font-black text-white"
          style={{ fontFamily: MONO }}
        >
          ₱{fmt(record.totalCost)}
        </Text>
      </View>
      {(record.reqName ||
        record.reqDesig ||
        record.appName ||
        record.appDesig) && (
        <View
          className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-3"
          style={{
            shadowColor: "#000",
            shadowOpacity: 0.06,
            shadowRadius: 6,
            elevation: 2,
          }}
        >
          <View className="bg-[#064E3B] px-4 py-3">
            <Text className="text-[10px] font-bold uppercase tracking-widest text-white/70">
              Signatories
            </Text>
          </View>
          <View className="flex-row">
            <View className="flex-1 px-4 py-3 border-r border-gray-100">
              <Text className="text-[9.5px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                Requested by
              </Text>
              {record.reqName ? (
                <Text className="text-[12.5px] font-semibold text-gray-800">
                  {record.reqName}
                </Text>
              ) : null}
              {record.reqDesig ? (
                <Text className="text-[11.5px] text-gray-500 mt-0.5">
                  {record.reqDesig}
                </Text>
              ) : null}
              {!record.reqName && !record.reqDesig && (
                <Text className="text-[12px] text-gray-300 italic">
                  Not specified
                </Text>
              )}
            </View>
            <View className="flex-1 px-4 py-3">
              <Text className="text-[9.5px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                Approved by
              </Text>
              {record.appName ? (
                <Text className="text-[12.5px] font-semibold text-gray-800">
                  {record.appName}
                </Text>
              ) : null}
              {record.appDesig ? (
                <Text className="text-[11.5px] text-gray-500 mt-0.5">
                  {record.appDesig}
                </Text>
              ) : null}
              {!record.appName && !record.appDesig && (
                <Text className="text-[12px] text-gray-300 italic">
                  Not specified
                </Text>
              )}
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function InfoRow({
  label,
  value,
  mono,
  last,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  last?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <View
      className={`flex-row items-center justify-between py-2.5 ${last ? "" : "border-b border-gray-100"}`}
    >
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

function Chip({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center gap-1 px-2 py-0.5 rounded-md ${highlight ? "bg-emerald-100" : "bg-gray-100"}`}
    >
      <Text
        className={`text-[9.5px] font-bold uppercase tracking-wide ${highlight ? "text-emerald-600" : "text-gray-400"}`}
      >
        {label}
      </Text>
      <Text
        className={`text-[11.5px] font-semibold ${highlight ? "text-emerald-800" : "text-gray-700"}`}
      >
        {value}
      </Text>
    </View>
  );
}
