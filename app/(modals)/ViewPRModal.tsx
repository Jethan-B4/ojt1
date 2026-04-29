/**
 * ViewPRModal.tsx — Full-screen PR viewer with Details + PDF tabs.
 */

import {
    buildAAAPreviewHTML,
    type AAAPreviewData,
} from "@/app/(components)/AAAPreview";
import {
    buildBACResolutionHTML,
    type BACResolutionData,
} from "@/app/(components)/BACResolutionPreview";
import {
    buildCanvassHTML,
    type CanvassPreviewData,
} from "@/app/(components)/CanvassPreview";
import DocumentPreviewPanel from "@/app/(components)/DocumentPreviewPanel";
import PRPreviewPanel, { buildPRHtml } from "@/app/(components)/PRPreviewPanel";
import React, { useEffect, useState } from "react";
import { preloadLogos } from "../lib/documentAssets";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    ScrollView,
    Text,
    TouchableOpacity,
    View
} from "react-native";
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

interface ViewPRModalProps {
  visible: boolean;
  record: PRRecord | null;
  initialTab?: "details" | "pr" | "rfqs" | "resolution" | "abstract";
  onClose: () => void;
}

export default function ViewPRModal({
  visible,
  record,
  initialTab,
  onClose,
}: ViewPRModalProps) {
  const [tab, setTab] = useState<"details" | "pr" | "rfqs" | "resolution" | "abstract">("details");
  const [hdr, setHdr] = useState<PRRecord | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [statuses, setStatuses] = useState<PRStatusRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [logosLoaded, setLogosLoaded] = useState(false);

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
        setHdr({
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
        setHdr(record);
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [visible, record, initialTab]);

  useEffect(() => {
    if (!visible) return;
    preloadLogos()
      .catch(() => {})
      .finally(() => setLogosLoaded(true));
  }, [visible]);

  if (!record) return null;
  const header = hdr ?? record;

  // Build HTML for different document types
  const prHtml = buildPRHtml(header, items);
  const prTemplateHtml = buildPRHtml({}, [], { template: true });

  // RFQ (Canvass) HTML
  const canvassData: CanvassPreviewData = {
    prNo: header.prNo,
    quotationNo: "",
    date: header.date,
    deadline: "",
    bacChairperson: "",
    officeSection: header.officeSection,
    purpose: header.purpose,
    items: items.map((it, idx) => ({
      itemNo: idx + 1,
      description: it.description,
      qty: it.quantity,
      unit: it.unit,
    })),
    canvasserNames: [],
  };
  const rfqHtml = logosLoaded ? buildCanvassHTML(canvassData) : "";
  const rfqTemplateHtml = logosLoaded
    ? buildCanvassHTML({
        prNo: "",
        quotationNo: "",
        date: "",
        deadline: "",
        bacChairperson: "",
        officeSection: "",
        purpose: "",
        items: [],
        canvasserNames: [],
        supplierName: "",
        supplierAddress: "",
        assignedTo: "",
        assignedDivision: "",
      })
    : "";

  // Resolution HTML
  const resolutionData: BACResolutionData = {
    resolutionNo: "",
    resolvedDate: header.date,
    location: "",
    prEntries: [
      {
        prNo: header.prNo,
        date: header.date,
        estimatedCost: items
          .reduce((sum, it) => sum + it.quantity * (it.unit_price || 0), 0)
          .toLocaleString("en-PH", { minimumFractionDigits: 2 }),
        endUser: header.officeSection,
        procMode: "SVP/Canvass",
      },
    ],
    whereas1: `WHEREAS, the Purchase Request No. ${header.prNo} was submitted by ${header.officeSection} for the procurement of ${header.purpose};`,
    whereas2: "WHEREAS, the Bids and Awards Committee has evaluated the request and found it to be valid and within the approved budget;",
    whereas3: "WHEREAS, the BAC has determined that Small Value Procurement is the appropriate mode of procurement for this request;",
    nowThereforeText: `NOW THEREFORE, the BAC RESOLVES to recommend the approval of Purchase Request No. ${header.prNo} for the procurement of ${header.purpose}.`,
    provincialOffice: "DARPO-CARAGA",
    bacChairperson: "",
    bacViceChairperson: "",
    bacMembers: ["", ""],
    approvedBy: "",
    approvedByDesig: "",
  };
  const resolutionHtml = logosLoaded ? buildBACResolutionHTML(resolutionData) : "";
  const resolutionTemplateHtml = logosLoaded
    ? buildBACResolutionHTML({
        resolutionNo: "",
        resolvedDate: "",
        location: "",
        prEntries: [
          { prNo: "", date: "", estimatedCost: "", endUser: "", procMode: "" },
        ],
        whereas1: "",
        whereas2: "",
        whereas3: "",
        nowThereforeText: "",
        provincialOffice: "",
        bacChairperson: "",
        bacViceChairperson: "",
        bacMembers: ["", ""],
        approvedBy: "",
        approvedByDesig: "",
      })
    : "";

  // Abstract (AAA) HTML
  const aaaData: AAAPreviewData = {
    rfqNo: "",
    prNo: header.prNo,
    resolutionNo: "",
    date: header.date,
    office: header.officeSection,
    particulars: header.purpose,
    suppliers: ["Supplier 1", "Supplier 2", "Supplier 3"],
    rows: items.map((it, idx) => ({
      itemNo: idx + 1,
      qty: it.quantity,
      unit: it.unit,
      desc: it.description,
      prices: { "Supplier 1": 0, "Supplier 2": 0, "Supplier 3": 0 },
      winner: null,
    })),
  };
  const abstractHtml = buildAAAPreviewHTML(aaaData);
  const abstractTemplateHtml = buildAAAPreviewHTML({
    rfqNo: "",
    prNo: "",
    resolutionNo: "",
    date: "",
    office: "",
    particulars: "",
    suppliers: ["Supplier 1", "Supplier 2", "Supplier 3"],
    rows: [],
  });

  const statusCfg = STATUS_CONFIG[header.statusId] ?? STATUS_FALLBACK;
  const statusLabel =
    statuses.find((s) => s.id === header.statusId)?.status_name ??
    `Status ${header.statusId}`;

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
                {header.prNo}
              </Text>
              <Text className="text-[11.5px] text-white/60 mt-0.5">
                {header.officeSection} · {header.date}
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
          <View className="flex-row bg-black/20 rounded-xl p-1 flex-wrap gap-1">
            {(["details", "pr", "rfqs", "resolution", "abstract"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setTab(t)}
                activeOpacity={0.8}
                className={`px-3 py-2 rounded-lg items-center ${tab === t ? "bg-white" : ""}`}
              >
                <Text
                  className={`text-[12px] font-bold ${tab === t ? "text-[#064E3B]" : "text-white/50"}`}
                >
                  {t === "details" ? "Details" : t.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
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
          <DetailsView record={header} items={items} statuses={statuses} />
        ) : tab === "pr" ? (
          <PRPreviewPanel
            html={prHtml}
            templateHtml={prTemplateHtml}
            showActions
          />
        ) : tab === "rfqs" ? (
          logosLoaded ? (
            <DocumentPreviewPanel
              html={rfqHtml}
              templateHtml={rfqTemplateHtml}
              showActions
            />
          ) : (
            <View className="flex-1 items-center justify-center gap-3">
              <ActivityIndicator size="large" color="#064E3B" />
              <Text className="text-[13px] text-gray-400">
                Loading document assets…
              </Text>
            </View>
          )
        ) : tab === "resolution" ? (
          logosLoaded ? (
            <DocumentPreviewPanel
              html={resolutionHtml}
              templateHtml={resolutionTemplateHtml}
              showActions
            />
          ) : (
            <View className="flex-1 items-center justify-center gap-3">
              <ActivityIndicator size="large" color="#064E3B" />
              <Text className="text-[13px] text-gray-400">
                Loading document assets…
              </Text>
            </View>
          )
        ) : tab === "abstract" ? (
          <DocumentPreviewPanel
            html={abstractHtml}
            templateHtml={abstractTemplateHtml}
            showActions
          />
        ) : null}
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
        <InfoRow label="Total Cost" mono>
          <Text
            className="text-[12.5px] font-semibold text-gray-800 text-right max-w-[60%]"
            style={{ fontFamily: MONO }}
          >
            <Text style={{ fontFamily: undefined }}>{"\u20B1"}</Text>
            {fmt(record.totalCost)}
          </Text>
        </InfoRow>
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
                <Chip label="Price" value={`${"\u20B1"}${fmt(item.unit_price)}`} />
                <Chip
                  label="Total"
                  value={`${"\u20B1"}${fmt(item.subtotal)}`}
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
          <Text style={{ fontFamily: undefined }}>{"\u20B1"}</Text>
          {fmt(record.totalCost)}
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
