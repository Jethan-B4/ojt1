/**
 * ViewPOModal.tsx — Full-screen PO viewer
 *
 * - Green header with PO No., status pill, close button
 * - Details / PDF tab toggle
 * - DetailsView: header fields, Phase 2 step timeline, line items
 * - PDF tab: WebView of the Appendix 61 form via POPreviewPanel
 * - Print + Download PDF actions on the PDF tab
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useEffect, useState } from "react";
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
import POPreviewPanel, {
  buildPOHtml,
  type POPreviewData,
} from "../(components)/POPreviewPanel";
import {
  fetchPOStatuses,
  fetchPOWithItemsById,
  type POItemRow,
  type PORow,
} from "../../lib/supabase/po";
import type { PORecord } from "../procurement/POModule";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const fmt = (n: number) =>
  n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// Status colours (mirrors POModule's PO_STATUS_CFG)
const PO_STATUS_CFG: Record<
  number,
  { bg: string; text: string; dot: string; hex: string; label: string }
> = {
  12: {
    bg: "#f0fdfa",
    text: "#0f766e",
    dot: "#0d9488",
    hex: "#0d9488",
    label: "PO (Creation)",
  },
  13: {
    bg: "#faf5ff",
    text: "#6b21a8",
    dot: "#9333ea",
    hex: "#9333ea",
    label: "PO (Allocation)",
  },
  14: {
    bg: "#fff7ed",
    text: "#9a3412",
    dot: "#f97316",
    hex: "#f97316",
    label: "ORS (Creation)",
  },
  15: {
    bg: "#eff6ff",
    text: "#1e40af",
    dot: "#3b82f6",
    hex: "#3b82f6",
    label: "ORS (Processing)",
  },
};
const STATUS_FALLBACK = {
  bg: "#f3f4f6",
  text: "#6b7280",
  dot: "#9ca3af",
  hex: "#9ca3af",
};

function poCfgFor(id: number | null | undefined) {
  if (!id) return { ...STATUS_FALLBACK, label: "—" };
  return (
    PO_STATUS_CFG[id] ?? {
      ...STATUS_FALLBACK,
      label: `Status ${id}`,
    }
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ViewPOModalProps {
  visible: boolean;
  record: PORecord | null;
  initialTab?: "details" | "po";
  onClose: () => void;
}

// ─── ViewPOModal ──────────────────────────────────────────────────────────────

export default function ViewPOModal({
  visible,
  record,
  initialTab,
  onClose,
}: ViewPOModalProps) {
  const [tab, setTab] = useState<"details" | "po">("details");
  const [header, setHeader] = useState<PORow | null>(null);
  const [items, setItems] = useState<POItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusNameById, setStatusNameById] = useState<Record<number, string>>(
    {},
  );

  useEffect(() => {
    if (!visible || !record) return;
    setTab(initialTab ?? "details");
    setLoading(true);
    Promise.all([fetchPOWithItemsById(record.id), fetchPOStatuses()])
      .then(([po, statuses]) => {
        setHeader(po.header);
        setItems(po.items);
        setStatusNameById(
          Object.fromEntries(statuses.map((s) => [s.id, s.status_name])),
        );
      })
      .catch((e: any) => {
        Alert.alert("Load failed", e?.message ?? "Failed to load PO");
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [visible, record, initialTab]);

  // Build camelCase POPreviewData from the fetched PORow
  const previewData: POPreviewData | null = header
    ? {
        poNo: header.po_no ?? undefined,
        prNo: header.pr_no ?? undefined,
        supplier: header.supplier ?? undefined,
        address: header.address ?? undefined,
        tin: header.tin ?? undefined,
        procurementMode: header.procurement_mode ?? undefined,
        deliveryPlace: header.delivery_place ?? undefined,
        deliveryTerm: header.delivery_term ?? undefined,
        dateOfDelivery: header.delivery_date ?? undefined,
        paymentTerm: header.payment_term ?? undefined,
        date: header.date ?? undefined,
        fundCluster: header.fund_cluster ?? undefined,
        orsNo: header.ors_no ?? undefined,
        orsDate: header.ors_date ?? undefined,
        fundsAvailable: header.funds_available ?? undefined,
        orsAmount: Number(header.ors_amount) || 0,
        officeSection: header.office_section ?? undefined,
        totalAmount: Number(header.total_amount) || 0,
        officialName: header.official_name ?? undefined,
        officialDesig: header.official_desig ?? undefined,
        accountantName: header.accountant_name ?? undefined,
        accountantDesig: header.accountant_desig ?? undefined,
        items,
      }
    : null;

  const html = previewData ? buildPOHtml(previewData) : "";
  const templateHtml = previewData ? buildPOHtml(previewData, { template: true }) : "";

  if (!visible) return null;
  if (!record) return null;

  const statusId = header?.status_id ?? record.statusId;
  const statusCfg = poCfgFor(statusId);
  const statusLabel = statusNameById[statusId] ?? statusCfg.label;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-white">
        {/* ── Header ── */}
        <View className="bg-[#064E3B] px-5 pt-5 pb-0">
          <View className="flex-row items-start justify-between mb-4">
            <View className="flex-1 pr-3">
              <Text className="text-[10px] font-bold tracking-widest uppercase text-white/40">
                Purchase Order
              </Text>
              <Text
                className="text-[18px] font-black text-white mt-0.5"
                style={{ fontFamily: MONO }}
              >
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
                <MaterialIcons name="close" size={18} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Tab toggle */}
          <View className="flex-row bg-black/20 rounded-xl p-1">
            {(["details", "po"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setTab(t)}
                activeOpacity={0.8}
                className={`flex-1 py-2 rounded-lg items-center ${tab === t ? "bg-white" : ""}`}
              >
                <Text
                  className={`text-[12.5px] font-bold ${tab === t ? "text-[#064E3B]" : "text-white/50"}`}
                >
                  {t === "details" ? "Details" : t.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Loading */}
        {loading && (
          <View className="flex-1 items-center justify-center gap-3">
            <ActivityIndicator size="large" color="#064E3B" />
            <Text className="text-[13px] text-gray-400">Loading PO…</Text>
          </View>
        )}

        {/* PO Document tab */}
        {!loading && tab === "po" && (
            <POPreviewPanel
                html={html}
                templateHtml={templateHtml}
                showActions
            />
        )}

        {/* Details tab */}
        {!loading && tab === "details" && (
          <DetailsView
            record={record}
            header={header}
            items={items}
            statusCfg={statusCfg}
            statusLabel={statusLabel}
          />
        )}
      </View>
    </Modal>
  );
}

// ─── DetailsView ──────────────────────────────────────────────────────────────

function DetailsView({
  record,
  header,
  items,
  statusCfg,
  statusLabel,
}: {
  record: PORecord;
  header: PORow | null;
  items: POItemRow[];
  statusCfg: { bg: string; text: string; dot: string; hex: string };
  statusLabel: string;
}) {
  return (
    <ScrollView
      className="flex-1"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      {/* Summary card */}
      <View
        className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm"
        style={{ elevation: 2 }}
      >
        <View className="bg-[#064E3B] px-4 py-3">
          <Text className="text-[10px] font-bold uppercase tracking-widest text-white/70">
            PO Details
          </Text>
        </View>
        <View className="px-4 py-2">
          <InfoRow label="PO No." value={record.poNo} mono />
          <InfoRow label="PR No." value={record.prNo} mono />
          <InfoRow label="Supplier" value={header?.supplier ?? "—"} />
          <InfoRow label="Address" value={header?.address ?? "—"} />
          <InfoRow label="TIN" value={header?.tin ?? "—"} mono />
          <InfoRow label="Office" value={record.officeSection} />
          <InfoRow label="Date" value={record.date} />
          <InfoRow label="Delivery Date" value={header?.delivery_date ?? "—"} />
          <InfoRow label="Payment Term" value={header?.payment_term ?? "—"} />
          <InfoRow label="ORS No." value={header?.ors_no ?? "—"} mono />
          <InfoRow label="Fund Cluster" value={header?.fund_cluster ?? "—"} />
          <InfoRow label="Status">
            <View
              className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full"
              style={{ backgroundColor: statusCfg.bg }}
            >
              <View
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: statusCfg.dot }}
              />
              <Text
                className="text-[10.5px] font-bold"
                style={{ color: statusCfg.text }}
              >
                {statusLabel}
              </Text>
            </View>
          </InfoRow>
          <InfoRow label="Total Amount" mono last>
            <Text
              className="text-[12.5px] font-semibold text-gray-800 text-right max-w-[60%]"
              style={{ fontFamily: MONO }}
            >
              <Text>₱</Text>
              {fmt(record.totalAmount)}
            </Text>
          </InfoRow>
        </View>
      </View>

      {/* Line items */}
      <View
        className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm"
        style={{ elevation: 2 }}
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

      {/* Total */}
      <View className="bg-[#064E3B] rounded-2xl px-5 py-4 flex-row items-center justify-between">
        <Text className="text-[11px] font-bold uppercase tracking-widest text-white/50">
          Total Amount
        </Text>
        <Text
          className="text-[20px] font-black text-white"
          style={{ fontFamily: MONO }}
        >
          <Text>₱</Text>
          {fmt(record.totalAmount)}
        </Text>
      </View>

      {/* Remarks placeholder */}
      <View
        className="bg-blue-50 rounded-2xl border border-blue-200 overflow-hidden shadow-sm"
        style={{ elevation: 2 }}
      >
        <View className="bg-blue-600 px-4 py-3">
          <Text className="text-[10px] font-bold uppercase tracking-widest text-white/90">
            Remarks & Comments
          </Text>
        </View>
        <View className="px-4 py-4">
          <Text className="text-[12.5px] text-blue-800 mb-2">
            💬 Users can add remarks and comments to this PO for
            cross-departmental communication.
          </Text>
          <Text className="text-[11px] text-blue-600">
            Remarks feature coming soon.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

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
