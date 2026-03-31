/**
 * ViewPOModal.tsx — Full-screen PO viewer
 *
 * - Green header with PO No., status pill, close button
 * - Details / PDF tab toggle
 * - DetailsView: header fields, Phase 2 step timeline, line items
 * - PDF tab: WebView of the Appendix 61 form via POPreviewPanel
 * - Print + Download PDF actions on the PDF tab
 */

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
  usePOPreviewActions,
  type POPreviewData,
} from "../(components)/POPreviewPanel";
import {
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

/** Phase 2 steps in order — used to render the progress timeline. */
const PHASE2_STEPS: {
  id: number;
  step: number;
  label: string;
  actor: string;
}[] = [
  { id: 1, step: 11, label: "AAA Signing", actor: "BAC" },
  { id: 2, step: 12, label: "Fwd. to Supply", actor: "BAC" },
  { id: 3, step: 13, label: "PO # Assignment", actor: "Supply" },
  { id: 4, step: 14, label: "PO Preparation", actor: "Supply" },
  { id: 5, step: 15, label: "Budget Allocation", actor: "Budget" },
  { id: 6, step: 16, label: "ORS Preparation", actor: "Budget" },
  { id: 7, step: 17, label: "ORS # Assignment", actor: "Budget" },
  { id: 8, step: 18, label: "Budget Approval", actor: "Budget" },
  { id: 9, step: 19, label: "Accounting Review", actor: "Accounting" },
  { id: 10, step: 20, label: "PARPO Signature", actor: "PARPO" },
  { id: 11, step: 21, label: "PO Approved", actor: "Supply" },
  { id: 12, step: 22, label: "Served to Supplier", actor: "Supply" },
  { id: 13, step: 23, label: "COA Submission", actor: "Supply" },
];

// Status colours (mirrors POModule's PO_STATUS_CFG)
const PO_STATUS_CFG: Record<
  number,
  { bg: string; text: string; dot: string; hex: string }
> = {
  1: { bg: "#fdf4ff", text: "#86198f", dot: "#c026d3", hex: "#c026d3" },
  2: { bg: "#eff6ff", text: "#1e40af", dot: "#3b82f6", hex: "#3b82f6" },
  3: { bg: "#fefce8", text: "#854d0e", dot: "#eab308", hex: "#eab308" },
  4: { bg: "#f0fdf4", text: "#166534", dot: "#22c55e", hex: "#22c55e" },
  5: { bg: "#fff7ed", text: "#9a3412", dot: "#f97316", hex: "#f97316" },
  6: { bg: "#fefce8", text: "#713f12", dot: "#ca8a04", hex: "#ca8a04" },
  7: { bg: "#fff7ed", text: "#7c2d12", dot: "#ea580c", hex: "#ea580c" },
  8: { bg: "#ecfdf5", text: "#065f46", dot: "#10b981", hex: "#10b981" },
  9: { bg: "#f0f9ff", text: "#0c4a6e", dot: "#0ea5e9", hex: "#0ea5e9" },
  10: { bg: "#ecfdf5", text: "#064e3b", dot: "#059669", hex: "#059669" },
  11: { bg: "#f0fdf4", text: "#14532d", dot: "#16a34a", hex: "#16a34a" },
  12: { bg: "#f0fdfa", text: "#0f766e", dot: "#0d9488", hex: "#0d9488" },
  13: { bg: "#faf5ff", text: "#6b21a8", dot: "#9333ea", hex: "#9333ea" },
};
const STATUS_FALLBACK = {
  bg: "#f3f4f6",
  text: "#6b7280",
  dot: "#9ca3af",
  hex: "#9ca3af",
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface ViewPOModalProps {
  visible: boolean;
  record: PORecord | null;
  onClose: () => void;
}

// ─── ViewPOModal ──────────────────────────────────────────────────────────────

export default function ViewPOModal({
  visible,
  record,
  onClose,
}: ViewPOModalProps) {
  const [tab, setTab] = useState<"details" | "pdf">("details");
  const [header, setHeader] = useState<PORow | null>(null);
  const [items, setItems] = useState<POItemRow[]>([]);
  const [loading, setLoading] = useState(false);

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

  const statusCfg = PO_STATUS_CFG[record.statusId] ?? STATUS_FALLBACK;
  const currentStep = PHASE2_STEPS.find((s) => s.id === record.statusId);
  const currentStepIdx = PHASE2_STEPS.findIndex(
    (s) => s.id === record.statusId,
  );

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
  const { handlePrint, handleDownload } = usePOPreviewActions(html);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
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
                style={{ fontFamily: MONO }}>
                {record.poNo}
              </Text>
              <Text className="text-[11.5px] text-white/60 mt-0.5">
                {record.officeSection} · {record.date}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <View
                className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full"
                style={{ backgroundColor: statusCfg.hex + "33" }}>
                <View
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: statusCfg.dot }}
                />
                <Text className="text-[11px] font-bold text-white">
                  {currentStep?.label ?? `Status ${record.statusId}`}
                </Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={10}
                className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center">
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
                className={`flex-1 py-2 rounded-lg items-center ${tab === t ? "bg-white" : ""}`}>
                <Text
                  className={`text-[12.5px] font-bold ${tab === t ? "text-[#064E3B]" : "text-white/50"}`}>
                  {t === "details" ? "Details" : "PDF Preview"}
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

        {/* PDF tab */}
        {!loading && tab === "pdf" && (
          <POPreviewPanel
            html={html}
            showActions
            onPrint={handlePrint}
            onDownload={handleDownload}
          />
        )}

        {/* Details tab */}
        {!loading && tab === "details" && (
          <DetailsView
            record={record}
            header={header}
            items={items}
            statusCfg={statusCfg}
            currentStepIdx={currentStepIdx}
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
  currentStepIdx,
}: {
  record: PORecord;
  header: PORow | null;
  items: POItemRow[];
  statusCfg: { bg: string; text: string; dot: string; hex: string };
  currentStepIdx: number;
}) {
  return (
    <ScrollView
      className="flex-1"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: 16, gap: 12 }}>
      {/* Summary card */}
      <View
        className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm"
        style={{ elevation: 2 }}>
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
              style={{ backgroundColor: statusCfg.bg }}>
              <View
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: statusCfg.dot }}
              />
              <Text
                className="text-[10.5px] font-bold"
                style={{ color: statusCfg.text }}>
                {PHASE2_STEPS.find((s) => s.id === record.statusId)?.label ??
                  `Status ${record.statusId}`}
              </Text>
            </View>
          </InfoRow>
          <InfoRow
            label="Total Amount"
            value={`₱${fmt(record.totalAmount)}`}
            mono
            last
          />
        </View>
      </View>

      {/* Phase 2 step timeline */}
      <View
        className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm"
        style={{ elevation: 2 }}>
        <View className="bg-[#064E3B] px-4 py-3">
          <Text className="text-[10px] font-bold uppercase tracking-widest text-white/70">
            Phase 2 Progress
          </Text>
        </View>
        <View className="px-4 py-3 gap-0">
          {PHASE2_STEPS.map((step, idx) => {
            const done = idx < currentStepIdx;
            const current = idx === currentStepIdx;
            const future = idx > currentStepIdx;
            return (
              <View key={step.id} className="flex-row items-start gap-3">
                <View className="items-center" style={{ width: 20 }}>
                  <View
                    className="w-4 h-4 rounded-full items-center justify-center mt-0.5"
                    style={{
                      backgroundColor: done
                        ? "#064E3B"
                        : current
                          ? statusCfg.dot
                          : "#e5e7eb",
                    }}>
                    {done && (
                      <Text
                        className="text-white"
                        style={{ fontSize: 9, fontWeight: "900" }}>
                        ✓
                      </Text>
                    )}
                    {current && (
                      <View className="w-2 h-2 rounded-full bg-white" />
                    )}
                  </View>
                  {idx < PHASE2_STEPS.length - 1 && (
                    <View
                      className="w-px flex-1 my-0.5"
                      style={{
                        backgroundColor: done ? "#064E3B" : "#e5e7eb",
                        minHeight: 14,
                      }}
                    />
                  )}
                </View>
                <View className="flex-1 pb-2">
                  <Text
                    className="text-[12px] font-semibold"
                    style={{
                      color: future
                        ? "#9ca3af"
                        : current
                          ? statusCfg.text
                          : "#374151",
                    }}>
                    Step {step.step} · {step.label}
                  </Text>
                  <Text
                    className="text-[10.5px]"
                    style={{ color: future ? "#d1d5db" : "#9ca3af" }}>
                    {step.actor}
                  </Text>
                </View>
                {current && (
                  <View
                    className="rounded-full px-2 py-0.5 self-start mt-0.5"
                    style={{ backgroundColor: statusCfg.bg }}>
                    <Text
                      className="text-[9.5px] font-bold"
                      style={{ color: statusCfg.text }}>
                      Current
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>

      {/* Line items */}
      <View
        className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm"
        style={{ elevation: 2 }}>
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
              className={`px-4 py-3 border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
              <Text
                className="text-[13px] font-semibold text-gray-800 mb-1.5"
                numberOfLines={2}>
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
          style={{ fontFamily: MONO }}>
          ₱{fmt(record.totalAmount)}
        </Text>
      </View>

      {/* Remarks placeholder */}
      <View
        className="bg-blue-50 rounded-2xl border border-blue-200 overflow-hidden shadow-sm"
        style={{ elevation: 2 }}>
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
      className={`flex-row items-center justify-between py-2.5 ${last ? "" : "border-b border-gray-100"}`}>
      <Text className="text-[11.5px] font-semibold text-gray-400">{label}</Text>
      {children ?? (
        <Text
          className="text-[12.5px] font-semibold text-gray-800 text-right max-w-[60%]"
          style={mono ? { fontFamily: MONO } : undefined}>
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
      className={`flex-row items-center gap-1 px-2 py-0.5 rounded-md ${highlight ? "bg-emerald-100" : "bg-gray-100"}`}>
      <Text
        className={`text-[9.5px] font-bold uppercase tracking-wide ${highlight ? "text-emerald-600" : "text-gray-400"}`}>
        {label}
      </Text>
      <Text
        className={`text-[11.5px] font-semibold ${highlight ? "text-emerald-800" : "text-gray-700"}`}>
        {value}
      </Text>
    </View>
  );
}
