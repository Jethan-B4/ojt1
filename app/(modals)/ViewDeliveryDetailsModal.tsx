/**
 * ViewDeliveryDetailsModal.tsx — Full-screen Delivery viewer
 *
 * - Green header with Delivery No., status pill, close button
 * - Shows delivery details similar to ViewPOModal
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  fetchDeliveryById,
  fetchDeliveryStatuses,
  fetchIARByDelivery,
  fetchLOAByDelivery,
  fetchDVByDelivery,
} from "@/lib/supabase/delivery";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

const STATUS_CFG: Record<
  number,
  { bg: string; text: string; dot: string; hex: string; label: string }
> = {
  18: { bg: "#fefce8", text: "#854d0e", dot: "#eab308", hex: "#eab308", label: "Delivery (Waiting)" },
  19: { bg: "#fff7ed", text: "#9a3412", dot: "#f97316", hex: "#f97316", label: "Delivery (Received)" },
  20: { bg: "#f0fdfa", text: "#0f766e", dot: "#0d9488", hex: "#0d9488", label: "Delivery (IAR)" },
  21: { bg: "#faf5ff", text: "#6b21a8", dot: "#9333ea", hex: "#9333ea", label: "Delivery (IAR Processing)" },
  22: { bg: "#eff6ff", text: "#1e40af", dot: "#3b82f6", hex: "#3b82f6", label: "Delivery (LOA)" },
  23: { bg: "#f0fdf4", text: "#166534", dot: "#22c55e", hex: "#22c55e", label: "Delivery (DV)" },
  24: { bg: "#ecfdf5", text: "#065f46", dot: "#10b981", hex: "#10b981", label: "Delivery (Division Chief)" },
  35: { bg: "#ecfdf5", text: "#14532d", dot: "#22c55e", hex: "#22c55e", label: "Completed" },
  27: { bg: "#fef2f2", text: "#991b1b", dot: "#ef4444", hex: "#ef4444", label: "Cancelled" },
};

const STATUS_FALLBACK = {
  bg: "#f3f4f6",
  text: "#6b7280",
  dot: "#9ca3af",
  hex: "#9ca3af",
};

function statusCfgFor(id: number | null | undefined) {
  if (!id) return { ...STATUS_FALLBACK, label: "—" };
  return STATUS_CFG[id] ?? { ...STATUS_FALLBACK, label: `Status ${id}` };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ViewDeliveryDetailsModalProps {
  visible: boolean;
  deliveryId: number | null;
  onClose: () => void;
}

// ─── ViewDeliveryDetailsModal ────────────────────────────────────────────────

export default function ViewDeliveryDetailsModal({
  visible,
  deliveryId,
  onClose,
}: ViewDeliveryDetailsModalProps) {
  const [delivery, setDelivery] = useState<any>(null);
  const [iar, setIar] = useState<any>(null);
  const [loa, setLoa] = useState<any>(null);
  const [dv, setDv] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [statusNameById, setStatusNameById] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!visible || !deliveryId) return;
    setLoading(true);
    Promise.all([
      fetchDeliveryById(deliveryId),
      fetchDeliveryStatuses(),
      fetchIARByDelivery(deliveryId),
      fetchLOAByDelivery(deliveryId),
      fetchDVByDelivery(deliveryId),
    ])
      .then(([delData, statuses, iarData, loaData, dvData]) => {
        setDelivery(delData);
        setIar(iarData);
        setLoa(loaData);
        setDv(dvData);
        setStatusNameById(Object.fromEntries(statuses.map((s) => [s.id, s.status_name])));
      })
      .catch((e: any) => {
        console.error("Failed to load delivery:", e);
      })
      .finally(() => setLoading(false));
  }, [visible, deliveryId]);

  if (!visible) return null;
  if (!deliveryId) return null;

  const statusId = delivery?.status_id ?? 18;
  const statusCfg = statusCfgFor(statusId);
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
                Delivery
              </Text>
              <Text className="text-[18px] font-black text-white mt-0.5" style={{ fontFamily: MONO }}>
                {delivery?.delivery_no ?? "—"}
              </Text>
              <Text className="text-[11.5px] text-white/60 mt-0.5">
                PO {delivery?.po_no} · {delivery?.supplier}
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
        </View>

        {/* Loading */}
        {loading && (
          <View className="flex-1 items-center justify-center gap-3">
            <ActivityIndicator size="large" color="#064E3B" />
            <Text className="text-[13px] text-gray-400">Loading delivery details...</Text>
          </View>
        )}

        {/* Details */}
        {!loading && delivery && (
          <DetailsView
            delivery={delivery}
            iar={iar}
            loa={loa}
            dv={dv}
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
  delivery,
  iar,
  loa,
  dv,
  statusCfg,
  statusLabel,
}: {
  delivery: any;
  iar: any;
  loa: any;
  dv: any;
  statusCfg: { bg: string; text: string; dot: string; hex: string };
  statusLabel: string;
}) {
  const createdAt = delivery?.created_at
    ? new Date(delivery.created_at).toLocaleDateString("en-PH")
    : "—";
  const updatedAt = delivery?.updated_at
    ? new Date(delivery.updated_at).toLocaleDateString("en-PH")
    : "—";
  const expectedDate = delivery?.expected_delivery_date
    ? new Date(delivery.expected_delivery_date).toLocaleDateString("en-PH")
    : "—";

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
            Delivery Details
          </Text>
        </View>
        <View className="px-4 py-2">
          <InfoRow label="Delivery No." value={delivery?.delivery_no} mono />
          <InfoRow label="PO No." value={delivery?.po_no} mono />
          <InfoRow label="Supplier" value={delivery?.supplier ?? "—"} />
          <InfoRow label="Office Section" value={delivery?.office_section ?? "—"} />
          <InfoRow label="Date Created" value={createdAt} />
          <InfoRow label="Last Updated" value={updatedAt} />
          <InfoRow label="Expected Delivery" value={expectedDate} />
          <InfoRow label="DR No." value={delivery?.dr_no ?? "—"} mono />
          <InfoRow label="SOA No." value={delivery?.soa_no ?? "—"} mono />
          <InfoRow label="Notes" value={delivery?.notes ?? "—"} last />
        </View>
      </View>

      {/* IAR Card */}
      {iar && (
        <View
          className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm"
          style={{ elevation: 2 }}
        >
          <View className="bg-blue-600 px-4 py-3">
            <Text className="text-[10px] font-bold uppercase tracking-widest text-white/70">
              Inspection & Acceptance (IAR)
            </Text>
          </View>
          <View className="px-4 py-2">
            <InfoRow label="IAR No." value={iar?.iar_no ?? "—"} mono />
            <InfoRow label="Invoice No." value={iar?.invoice_no ?? "—"} />
            <InfoRow label="Invoice Date" value={iar?.invoice_date ?? "—"} />
            <InfoRow label="Date Inspected" value={iar?.inspected_at ?? "—"} />
            <InfoRow label="Date Received" value={iar?.received_at ?? "—"} last />
          </View>
        </View>
      )}

      {/* LOA Card */}
      {loa && (
        <View
          className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm"
          style={{ elevation: 2 }}
        >
          <View className="bg-purple-600 px-4 py-3">
            <Text className="text-[10px] font-bold uppercase tracking-widest text-white/70">
              Letter of Acceptance (LOA)
            </Text>
          </View>
          <View className="px-4 py-2">
            <InfoRow label="Accepted By" value={loa?.accepted_by_name ?? "—"} />
            <InfoRow label="Title" value={loa?.accepted_by_title ?? "—"} />
            <InfoRow label="Date Accepted" value={loa?.accepted_at ?? "—"} last />
          </View>
        </View>
      )}

      {/* DV Card */}
      {dv && (
        <View
          className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm"
          style={{ elevation: 2 }}
        >
          <View className="bg-emerald-600 px-4 py-3">
            <Text className="text-[10px] font-bold uppercase tracking-widest text-white/70">
              Disbursement Voucher (DV)
            </Text>
          </View>
          <View className="px-4 py-2">
            <InfoRow label="DV No." value={dv?.dv_no ?? "—"} mono />
            <InfoRow label="Mode of Payment" value={dv?.mode_of_payment ?? "—"} />
            <InfoRow label="Amount Due" value={dv?.amount_due ?? "—"} mono />
            <InfoRow label="Particulars" value={dv?.particulars ?? "—"} last />
          </View>
        </View>
      )}

      {/* Status */}
      <View
        className="rounded-2xl px-5 py-4 flex-row items-center justify-between"
        style={{ backgroundColor: statusCfg.hex }}
      >
        <Text className="text-[11px] font-bold uppercase tracking-widest text-white/70">
          Current Status
        </Text>
        <View className="flex-row items-center gap-1.5">
          <View className="w-2 h-2 rounded-full bg-white" />
          <Text className="text-[14px] font-black text-white">{statusLabel}</Text>
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
          numberOfLines={2}
        >
          {value}
        </Text>
      )}
    </View>
  );
}
