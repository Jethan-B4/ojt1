/**
 * PaymentModule — Monitoring view for payment phase (deliveries.status_id 35 → 25–32 → 36)
 * This is a read-only monitoring extension; processing is handled in the main system.
 */

import {
  fetchDeliveriesForPaymentPhase,
  fetchDeliveryPOContext,
  fetchPaymentPhaseStatuses,
} from "@/lib/supabase/delivery";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import ViewDeliveryModal from "../(modals)/ViewDeliveryModal";
import { useAuth } from "../contexts/AuthContext";
import { useFiscalYear } from "../contexts/FiscalYearContext";
import { useRealtime } from "../contexts/RealtimeContext";
import { PaymentRemarkSheet, PaymentRemarkSheetRecord } from "./PaymentRemarkSheet";

type SubTab = "all" | "active" | "completed";

const PAY_STATUS_CFG: Record<
  number,
  { bg: string; text: string; dot: string; label: string }
> = {
  35: {
    bg: "#ecfdf5",
    text: "#065f46",
    dot: "#10b981",
    label: "Queue (post-delivery)",
  },
  25: {
    bg: "#fefce8",
    text: "#854d0e",
    dot: "#ca8a04",
    label: "Payment (Accounting)",
  },
  26: {
    bg: "#fdf4ff",
    text: "#86198f",
    dot: "#c026d3",
    label: "Payment (PARPO)",
  },
  27: {
    bg: "#f0fdfa",
    text: "#0f766e",
    dot: "#0d9488",
    label: "Payment (EMDS)",
  },
  28: {
    bg: "#fdf4ff",
    text: "#86198f",
    dot: "#a855f7",
    label: "Payment (PARPO) II",
  },
  29: {
    bg: "#eff6ff",
    text: "#1e40af",
    dot: "#3b82f6",
    label: "Payment (Approval)",
  },
  30: {
    bg: "#fff7ed",
    text: "#9a3412",
    dot: "#f97316",
    label: "Report Encoding",
  },
  31: {
    bg: "#fefce8",
    text: "#854d0e",
    dot: "#eab308",
    label: "Tax Processing",
  },
  32: {
    bg: "#f0fdf4",
    text: "#166534",
    dot: "#22c55e",
    label: "Payment (Releasing)",
  },
  36: {
    bg: "#ecfdf5",
    text: "#14532d",
    dot: "#22c55e",
    label: "Completed (Payment Phase)",
  },
};

const cfg = (id: number) =>
  PAY_STATUS_CFG[id] ?? {
    bg: "#f9fafb",
    text: "#6b7280",
    dot: "#9ca3af",
    label: `Status ${id}`,
  };

type PaymentRow = {
  id: number;
  deliveryNo: string;
  poNo: string;
  supplier: string;
  officeSection: string;
  statusId: number;
  date: string;
  updatedAt: string;
  elapsedTime: string;
  raw: any;
};

function toRow(r: any): PaymentRow {
  const created = r?.created_at ? new Date(r.created_at) : new Date();
  const updated = r?.updated_at ? new Date(r.updated_at) : created;
  const diffMin = Math.floor((Date.now() - created.getTime()) / 60000);
  const elapsedTime =
    diffMin < 60
      ? `${diffMin} min`
      : diffMin < 1440
        ? `${Math.floor(diffMin / 60)} hr`
        : `${Math.floor(diffMin / 1440)} days`;
  return {
    id: Number(r.id),
    deliveryNo: String(r.delivery_no ?? "—"),
    poNo: String(r.po_no ?? "—"),
    supplier: String(r.supplier ?? "—"),
    officeSection: String(r.office_section ?? "—"),
    statusId: Number(r.status_id ?? 35),
    date: created.toLocaleDateString("en-PH"),
    updatedAt: updated.toLocaleDateString("en-PH"),
    elapsedTime,
    raw: r,
  };
}

const SubTabRow: React.FC<{
  active: SubTab;
  onSelect: (s: SubTab) => void;
}> = ({ active, onSelect }) => (
  <View className="flex-row bg-white border-b border-gray-200 px-4 gap-2 py-2.5">
    {(
      [
        { key: "all" as const, label: "All" },
        { key: "active" as const, label: "In progress" },
        { key: "completed" as const, label: "Completed" },
      ] as const
    ).map((sub) => {
      const on = sub.key === active;
      return (
        <TouchableOpacity
          key={sub.key}
          onPress={() => onSelect(sub.key)}
          activeOpacity={0.8}
          className={`px-3 py-1.5 rounded-lg ${on ? "bg-[#064E3B]" : "bg-transparent"}`}
        >
          <Text
            className={`text-[12px] font-semibold ${on ? "text-white" : "text-gray-400"}`}
          >
            {sub.label}
          </Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

export default function PaymentModule() {
  const { currentUser } = useAuth();
  const roleId = Number((currentUser as any)?.role_id ?? 0);
  const divisionId = (currentUser as any)?.division_id ?? null;
  const { tick } = useRealtime();
  const { year } = useFiscalYear();

  const [subTab, setSubTab] = useState<SubTab>("all");
  const [records, setRecords] = useState<PaymentRow[]>([]);
  const [statuses, setStatuses] = useState<{ id: number; status_name: string }[]>(
    [],
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewActive, setViewActive] = useState<any>(null);
  const [viewTab, setViewTab] = useState<"pr" | "po">("po");

  const [moreRecord, setMoreRecord] = useState<PaymentRow | null>(null);
  const [moreVisible, setMoreVisible] = useState(false);
  const [remarkVisible, setRemarkVisible] = useState(false);
  const [remarkRecord, setRemarkRecord] = useState<PaymentRemarkSheetRecord | null>(
    null,
  );

  useEffect(() => {
    fetchPaymentPhaseStatuses()
      .then(setStatuses)
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const div =
      roleId === 1 || divisionId == null ? null : Number(divisionId);
    const rows = await fetchDeliveriesForPaymentPhase(div);
    setRecords((rows ?? []).map(toRow));
  }, [roleId, divisionId]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return records.filter((r) => {
      // Filter by fiscal year (based on creation date)
      const createdYear = new Date(r.date).getFullYear();
      if (createdYear !== year) return false;
      
      const tabOk =
        subTab === "all"
          ? true
          : subTab === "active"
            ? r.statusId !== 36
            : r.statusId === 36;
      const searchOk =
        !q ||
        r.deliveryNo.toLowerCase().includes(q) ||
        r.poNo.toLowerCase().includes(q) ||
        r.supplier.toLowerCase().includes(q);
      return tabOk && searchOk;
    });
  }, [records, subTab, searchQuery, year]);

  const openView = async (r: PaymentRow) => {
    try {
      setViewActive(r.raw);
      setViewTab("po");
      setViewOpen(true);
    } catch (e: any) {
      Alert.alert("Load failed", e?.message ?? "Could not load documents.");
    }
  };

  const openRemarks = async (r: PaymentRow) => {
    try {
      const ctx = await fetchDeliveryPOContext(Number(r.id));
      if (!ctx?.poId) {
        Alert.alert("Not available", "Linked PO context not found.");
        return;
      }
      setRemarkRecord({
        id: r.id,
        deliveryNo: r.deliveryNo,
        poNo: ctx.poNo || r.poNo,
        supplier: ctx.supplier || r.supplier,
        poId: ctx.poId,
        prId: ctx.prId,
        prNo: ctx.prNo || "—",
      });
      setRemarkVisible(true);
    } catch (e: any) {
      Alert.alert("Load failed", e?.message ?? "Could not load remarks.");
    }
  };

  // ─── More Sheet ─────────────────────────────────────────────────────────────
  const MoreSheet: React.FC<{
    visible: boolean;
    record: PaymentRow | null;
    roleId: number;
    onClose: () => void;
    onRemarks: (r: PaymentRow) => void;
    onView: (r: PaymentRow) => void;
  }> = ({ visible, record, onClose, onRemarks, onView }) => {
    if (!record) return null;

    type Action = {
      icon: keyof typeof MaterialIcons.glyphMap;
      label: string;
      sublabel: string;
      color: string;
      bg: string;
      onPress: () => void;
    };

    const actions: Action[] = [
      {
        icon: "chat-bubble-outline",
        label: "Remarks",
        sublabel: "View or add payment notes",
        color: "#7c3aed",
        bg: "#faf5ff",
        onPress: () => {
          onClose();
          onRemarks(record);
        },
      },
      {
        icon: "visibility",
        label: "View Documents",
        sublabel: "Open PR / PO document preview",
        color: "#1d4ed8",
        bg: "#eff6ff",
        onPress: () => {
          onClose();
          onView(record);
        },
      },
    ];

    const c = cfg(record.statusId);

    return (
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <TouchableOpacity
          className="flex-1 bg-black/40 justify-end"
          activeOpacity={1}
          onPress={onClose}
        >
          <TouchableOpacity activeOpacity={1}>
            <View className="bg-white rounded-t-3xl overflow-hidden" style={{ paddingBottom: 32 }}>
              {/* Drag handle */}
              <View className="items-center pt-3 pb-1">
                <View className="w-10 h-1 rounded-full bg-gray-200" />
              </View>

              {/* Identity header */}
              <View className="px-5 pt-2 pb-4 border-b border-gray-100">
                <Text
                  className="text-[15px] font-extrabold text-gray-900"
                  style={{ fontFamily: MONO }}
                >
                  PO {record.poNo}
                </Text>
                <Text className="text-[12px] text-gray-500 mt-0.5" numberOfLines={1}>
                  {record.supplier}
                </Text>
                <View
                  className="mt-2 self-start flex-row items-center gap-1.5 rounded-full px-2.5 py-1"
                  style={{ backgroundColor: c.bg }}
                >
                  <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.dot }} />
                  <Text className="text-[10.5px] font-bold" style={{ color: c.text }}>
                    {c.label}
                  </Text>
                </View>
              </View>

              {/* Action rows */}
              <View className="px-4 pt-3 gap-2">
                {actions.map((a) => (
                  <TouchableOpacity
                    key={a.label}
                    onPress={a.onPress}
                    activeOpacity={0.75}
                    className="flex-row items-center gap-3 rounded-xl px-3 py-3"
                    style={{ backgroundColor: a.bg }}
                  >
                    <View
                      className="w-9 h-9 rounded-lg items-center justify-center"
                      style={{ backgroundColor: a.color + "15" }}
                    >
                      <MaterialIcons name={a.icon} size={18} color={a.color} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[13px] font-bold" style={{ color: a.color }}>
                        {a.label}
                      </Text>
                      <Text className="text-[11px] text-gray-500">{a.sublabel}</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={18} color="#9ca3af" />
                  </TouchableOpacity>
                ))}
              </View>

              {/* Dismiss */}
              <View className="px-4 pt-4">
                <TouchableOpacity
                  onPress={onClose}
                  activeOpacity={0.8}
                  className="py-3 rounded-xl bg-gray-100 items-center"
                >
                  <Text className="text-[13px] font-bold text-gray-500">Dismiss</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  };

  return (
    <View className="flex-1 bg-gray-50">
      <SubTabRow
        active={subTab}
        onSelect={(t) => {
          setSubTab(t);
          setSearchQuery("");
        }}
      />

      <View className="flex-row items-center gap-2 px-3 py-2.5 bg-white border-b border-gray-100">
        <View className="flex-1 flex-row items-center bg-gray-100 rounded-xl px-3 py-2 gap-2 border border-gray-200">
          <MaterialIcons name="search" size={16} color="#9ca3af" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search delivery, PO, supplier…"
            placeholderTextColor="#9ca3af"
            className="flex-1 text-[13px] text-gray-800"
          />
        </View>
      </View>

      <View className="mx-3 mt-2 mb-1 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <Text className="text-[11px] font-semibold text-emerald-800">
          Prior-phase rule: Payment processing intake is limited to delivery
          records marked <Text className="font-extrabold">Completed (Delivery Phase)</Text>.
        </Text>
        <Text className="text-[10.5px] text-emerald-700 mt-1">
          Payment entries are manually processed from this completed queue and
          remain accessible in this module (including the All tab).
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
      >
        {filtered.length === 0 ? (
          <View className="items-center justify-center py-20 gap-2 px-6">
            <MaterialIcons name="payments" size={40} color="#d1d5db" />
            <Text className="text-[14px] font-bold text-gray-400 text-center">
              No payment records in this view
            </Text>
            <Text className="text-[12px] text-gray-400 text-center leading-5">
              Records appear after the delivery phase is completed (status 35),
              then move through accounting, PARPO, EMDS, approval, encoding, tax,
              and cash releasing until status 36.
            </Text>
          </View>
        ) : (
          filtered.map((r, idx) => {
            const statusLabel =
              statuses.find((s) => s.id === r.statusId)?.status_name ??
              cfg(r.statusId).label;
            const c = cfg(r.statusId);
            return (
              <View
                key={r.id}
                className="mx-3 mb-2.5 rounded-2xl border border-gray-100 overflow-hidden"
                style={{ backgroundColor: idx % 2 === 0 ? "#fff" : "#fafafa" }}
              >
                <View className="px-4 pt-4 pb-2">
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <Text
                        className="text-[14px] font-extrabold text-gray-800"
                        style={{ fontFamily: MONO }}
                      >
                        PO {r.poNo}
                      </Text>
                    </View>
                    <View
                      className="flex-row items-center self-start rounded-full px-2.5 py-1 gap-1.5"
                      style={{ backgroundColor: c.bg }}
                    >
                      <View
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: c.dot }}
                      />
                      <Text className="text-[10.5px] font-bold" style={{ color: c.text }}>
                        {statusLabel}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-[11.5px] text-gray-600 mt-2">{r.supplier}</Text>
                  <Text className="text-[11px] text-gray-400">{r.officeSection}</Text>
                </View>
                <View className="h-px bg-gray-100 mx-4" />
                <View className="flex-row items-center px-3 py-2.5 gap-2">
                  <View className="flex-1">
                    <Text className="text-[10.5px] text-gray-400">
                      {r.date}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => void openView(r)}
                    activeOpacity={0.85}
                    className="flex-row items-center gap-1 px-3 py-1.5 rounded-xl bg-gray-100 border border-gray-200"
                  >
                    <MaterialIcons name="visibility" size={14} color="#6b7280" />
                    <Text className="text-[12px] font-semibold text-gray-600">
                      View
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setMoreRecord(r);
                      setMoreVisible(true);
                    }}
                    activeOpacity={0.85}
                    className="w-10 h-10 bg-emerald-700 rounded-xl items-center justify-center"
                  >
                    <Text className="text-white text-[16px] font-extrabold">•••</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <MoreSheet
        visible={moreVisible}
        record={moreRecord}
        roleId={roleId}
        onClose={() => {
          setMoreVisible(false);
          setMoreRecord(null);
        }}
        onRemarks={(r) => void openRemarks(r)}
        onView={(r) => void openView(r)}
      />

      <ViewDeliveryModal
        visible={viewOpen}
        onClose={() => setViewOpen(false)}
        deliveryId={viewActive?.id ?? null}
        initialTab={viewTab}
      />

      <PaymentRemarkSheet
        visible={remarkVisible}
        record={remarkRecord}
        currentUser={currentUser}
        onClose={() => {
          setRemarkVisible(false);
          setRemarkRecord(null);
        }}
      />
    </View>
  );
}
