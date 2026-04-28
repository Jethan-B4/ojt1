/**
 * PaymentModule — Phase 4 disbursement & closure (deliveries.status_id 35 → 25–32 → 36)
 */

import {
    fetchDeliveriesForPaymentPhase,
    fetchDeliveryPOContext,
    fetchDVByDelivery,
    fetchIARByDelivery,
    fetchLOAByDelivery,
    fetchPaymentPhaseStatuses,
} from "@/lib/supabase/delivery";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import PORemarkSheet, { type PORemarkSheetRecord } from "../(components)/PORemarkSheet";
import ProcessPaymentModal, {
    canRoleProcessPayment,
    type ProcessPaymentRecord,
} from "../(modals)/ProcessPaymentModal";
import ViewDeliveryModal from "../(modals)/ViewDeliveryModal";
import { useAuth } from "../AuthContext";
import { useRealtime } from "../RealtimeContext";

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

  const [subTab, setSubTab] = useState<SubTab>("all");
  const [records, setRecords] = useState<PaymentRow[]>([]);
  const [statuses, setStatuses] = useState<{ id: number; status_name: string }[]>(
    [],
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [processOpen, setProcessOpen] = useState(false);
  const [processRecord, setProcessRecord] = useState<ProcessPaymentRecord | null>(
    null,
  );

  const [viewOpen, setViewOpen] = useState(false);
  const [viewActive, setViewActive] = useState<any>(null);
  const [viewTab, setViewTab] = useState<"iar" | "loa" | "dv">("iar");
  const [iar, setIar] = useState<any>(null);
  const [loa, setLoa] = useState<any>(null);
  const [dv, setDv] = useState<any>(null);

  const [moreRecord, setMoreRecord] = useState<PaymentRow | null>(null);
  const [moreVisible, setMoreVisible] = useState(false);
  const [remarkVisible, setRemarkVisible] = useState(false);
  const [remarkRecord, setRemarkRecord] = useState<PORemarkSheetRecord | null>(
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
  }, [records, subTab, searchQuery]);

  const openView = async (r: PaymentRow) => {
    try {
      setViewActive(r.raw);
      const [i, l, d] = await Promise.all([
        fetchIARByDelivery(r.id),
        fetchLOAByDelivery(r.id),
        fetchDVByDelivery(r.id),
      ]);
      setIar(i);
      setLoa(l);
      setDv(d);
      setViewTab("dv");
      setViewOpen(true);
    } catch (e: any) {
      Alert.alert("Load failed", e?.message ?? "Could not load documents.");
    }
  };

  const openProcess = (r: PaymentRow) => {
    setProcessRecord({
      id: r.id,
      deliveryNo: r.deliveryNo,
      poNo: r.poNo,
      statusId: r.statusId,
      supplier: r.supplier,
    });
    setProcessOpen(true);
  };

  const openRemarks = async (r: PaymentRow) => {
    try {
      const ctx = await fetchDeliveryPOContext(Number(r.id));
      if (!ctx?.poId) {
        Alert.alert("Not available", "Linked PO context not found.");
        return;
      }
      setRemarkRecord({
        id: String(ctx.poId),
        poNo: ctx.poNo || r.poNo,
        supplier: ctx.supplier || r.supplier,
        linkedPrId: ctx.prId,
        prNo: ctx.prNo || "—",
      });
      setRemarkVisible(true);
    } catch (e: any) {
      Alert.alert("Load failed", e?.message ?? "Could not load remarks.");
    }
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
            const canProcess = canRoleProcessPayment(roleId, r.statusId);
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
                        {r.deliveryNo}
                      </Text>
                      <Text className="text-[11.5px] text-gray-500 font-semibold mt-0.5">
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
                  <TouchableOpacity
                    onPress={() => void openView(r)}
                    className="flex-row items-center gap-1 px-3 py-1.5 rounded-xl bg-gray-100 border border-gray-200"
                  >
                    <MaterialIcons name="visibility" size={14} color="#6b7280" />
                    <Text className="text-[12px] font-semibold text-gray-600">
                      View
                    </Text>
                  </TouchableOpacity>
                  {canProcess && r.statusId !== 36 && (
                    <TouchableOpacity
                      onPress={() => openProcess(r)}
                      className="flex-row items-center gap-1 px-3 py-1.5 rounded-xl bg-[#064E3B]"
                    >
                      <MaterialIcons name="arrow-forward" size={14} color="#fff" />
                      <Text className="text-[12px] font-semibold text-white">
                        Process
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => {
                      setMoreRecord(r);
                      setMoreVisible(true);
                    }}
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

      <Modal
        visible={moreVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setMoreVisible(false);
          setMoreRecord(null);
        }}
      >
        <Pressable
          className="flex-1 bg-black/40 justify-end"
          onPress={() => {
            setMoreVisible(false);
            setMoreRecord(null);
          }}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View className="bg-white rounded-t-3xl px-4 pt-3 pb-8">
              <View className="items-center pt-1 pb-3">
                <View className="w-10 h-1 rounded-full bg-gray-200" />
              </View>
              {moreRecord && (
                <Text
                  className="text-[14px] font-extrabold text-gray-900 mb-3"
                  style={{ fontFamily: MONO }}
                >
                  {moreRecord.deliveryNo}
                </Text>
              )}
              <TouchableOpacity
                onPress={() => {
                  if (!moreRecord) return;
                  setMoreVisible(false);
                  void openRemarks(moreRecord);
                }}
                className="py-3 border-b border-gray-100"
              >
                <Text className="text-[13px] font-bold text-gray-800">
                  Remarks
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (!moreRecord) return;
                  setMoreVisible(false);
                  void openView(moreRecord);
                }}
                className="py-3 border-b border-gray-100"
              >
                <Text className="text-[13px] font-bold text-gray-800">
                  View documents
                </Text>
              </TouchableOpacity>
              {moreRecord &&
                canRoleProcessPayment(roleId, moreRecord.statusId) &&
                moreRecord.statusId !== 36 && (
                  <TouchableOpacity
                    onPress={() => {
                      if (!moreRecord) return;
                      const rec = moreRecord;
                      setMoreVisible(false);
                      setMoreRecord(null);
                      openProcess(rec);
                    }}
                    className="py-3 border-b border-gray-100"
                  >
                    <Text className="text-[13px] font-bold text-[#064E3B]">
                      Process payment
                    </Text>
                  </TouchableOpacity>
                )}
              {roleId === 1 && moreRecord && (
                <TouchableOpacity
                  onPress={() => {
                    if (!moreRecord) return;
                    const rec = moreRecord;
                    setMoreVisible(false);
                    setMoreRecord(null);
                    openProcess(rec);
                  }}
                  className="py-3 border-b border-gray-100"
                >
                  <Text className="text-[13px] font-bold text-blue-700">
                    Override status (admin)
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => {
                  setMoreVisible(false);
                  setMoreRecord(null);
                }}
                className="mt-3 py-3 rounded-2xl bg-gray-100 items-center"
              >
                <Text className="text-[13px] font-bold text-gray-500">Dismiss</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ProcessPaymentModal
        visible={processOpen}
        record={processRecord}
        roleId={roleId}
        onClose={() => {
          setProcessOpen(false);
          setProcessRecord(null);
        }}
        onProcessed={() => {
          void load();
        }}
      />

      <ViewDeliveryModal
        visible={viewOpen}
        onClose={() => setViewOpen(false)}
        viewTab={viewTab}
        setViewTab={setViewTab}
        deliveryId={viewActive?.id ?? null}
      />

      <PORemarkSheet
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
