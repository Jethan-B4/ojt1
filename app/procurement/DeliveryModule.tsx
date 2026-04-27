import {
  fetchDVByDelivery,
  fetchDeliveries,
  fetchDeliveriesByDivision,
  fetchDeliveryPOContext,
  fetchDeliveryStatuses,
  fetchIARByDelivery,
  fetchLOAByDelivery,
  insertDeliveryProcessRemark,
  updateDelivery,
  upsertDVByDelivery,
  upsertIARByDelivery,
  upsertLOAByDelivery,
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
import PORemarkSheet, {
  type PORemarkSheetRecord,
} from "../(components)/PORemarkSheet";
import DeleteDeliveryModal from "../(modals)/DeleteDeliveryModal";
import ProcessDeliveryModal from "../(modals)/ProcessDeliveryModal";
import { type StatusFlag } from "../(modals)/ProcessPRModal";
import ViewDeliveryModal from "../(modals)/ViewDeliveryModal";
import { useAuth } from "../AuthContext";
import { useRealtime } from "../RealtimeContext";

type SubTab = "all" | "deliveries" | "inspection" | "acceptance";
type SortBy = "date_created" | "date_modified";

type DeliveryRecord = {
  id: number;
  deliveryNo: string;
  poNo: string;
  supplier: string;
  officeSection: string;
  iarNo: string | null;
  dvNo: string | null;
  statusId: number;
  date: string;
  updatedAt: string;
  createdAtIso: string;
  expectedDeliveryDate: string | null;
  elapsedTime: string;
  raw: any;
};

const STATUS_CFG: Record<
  number,
  { bg: string; text: string; dot: string; label: string }
> = {
  18: {
    bg: "#fefce8",
    text: "#854d0e",
    dot: "#eab308",
    label: "Delivery (Waiting)",
  },
  19: {
    bg: "#fff7ed",
    text: "#9a3412",
    dot: "#f97316",
    label: "Delivery (Received)",
  },
  20: {
    bg: "#f0fdfa",
    text: "#0f766e",
    dot: "#0d9488",
    label: "Delivery (IAR)",
  },
  21: {
    bg: "#faf5ff",
    text: "#6b21a8",
    dot: "#9333ea",
    label: "Delivery (IAR Processing)",
  },
  22: {
    bg: "#eff6ff",
    text: "#1e40af",
    dot: "#3b82f6",
    label: "Delivery (LOA)",
  },
  23: {
    bg: "#f0fdf4",
    text: "#166534",
    dot: "#22c55e",
    label: "Delivery (DV)",
  },
  24: {
    bg: "#ecfdf5",
    text: "#065f46",
    dot: "#10b981",
    label: "Delivery (Division Chief)",
  },
  35: {
    bg: "#ecfdf5",
    text: "#14532d",
    dot: "#22c55e",
    label: "Completed (Delivery Phase)",
  },
  27: {
    bg: "#fef2f2",
    text: "#991b1b",
    dot: "#ef4444",
    label: "Cancelled",
  },
};
const SUB_TAB_STATUS_MAP: Record<SubTab, number[]> = {
  all: [],
  deliveries: [18, 19],
  inspection: [20, 21],
  acceptance: [22, 23, 24],
};
const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "deliveries", label: "Deliveries" },
  { key: "inspection", label: "Inspection (IAR)" },
  { key: "acceptance", label: "Acceptance (LOA/DV)" },
];
const PAGE_SIZE = 7;

const SubTabRow: React.FC<{
  active: SubTab;
  onSelect: (s: SubTab) => void;
}> = ({ active, onSelect }) => (
  <View className="flex-row bg-white border-b border-gray-200 px-4 gap-2 py-2.5">
    {SUB_TABS.map((sub) => {
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

const SearchBar: React.FC<{
  value: string;
  onChange: (t: string) => void;
  filterActive: boolean;
  onFilterToggle: () => void;
}> = ({ value, onChange, filterActive, onFilterToggle }) => (
  <View className="flex-row items-center gap-2 px-3 py-2.5 bg-white border-b border-gray-100">
    <View className="flex-1 flex-row items-center bg-gray-100 rounded-xl px-3 py-2 gap-2 border border-gray-200">
      <MaterialIcons name="search" size={16} color="#9ca3af" />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Search delivery, PO, supplier, section…"
        placeholderTextColor="#9ca3af"
        returnKeyType="search"
        className="flex-1 text-[13px] text-gray-800"
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChange("")} hitSlop={8}>
          <MaterialIcons name="close" size={16} color="#9ca3af" />
        </TouchableOpacity>
      )}
    </View>
    <TouchableOpacity
      onPress={onFilterToggle}
      activeOpacity={0.8}
      className={`w-10 h-10 rounded-xl items-center justify-center border-2 ${
        filterActive
          ? "bg-[#064E3B] border-[#064E3B]"
          : "bg-white border-gray-200"
      }`}
    >
      <MaterialIcons
        name="filter-list"
        size={18}
        color={filterActive ? "#ffffff" : "#6b7280"}
      />
    </TouchableOpacity>
  </View>
);

const FilterChip: React.FC<{
  label: string;
  active: boolean;
  color?: string;
  onPress: () => void;
}> = ({ label, active, color, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.75}
    className="rounded-full px-3 py-1.5"
    style={{
      backgroundColor: active ? (color ?? "#064E3B") : "#ffffff",
      borderWidth: 1.5,
      borderColor: active ? (color ?? "#064E3B") : "#e5e7eb",
    }}
  >
    <Text
      className="text-[11.5px] font-bold"
      style={{ color: active ? "#ffffff" : "#6b7280" }}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

const FilterPanel: React.FC<{
  visible: boolean;
  records: DeliveryRecord[];
  statuses: { id: number; status_name: string }[];
  statusFilter: number | null;
  sectionFilter: string;
  sortBy: SortBy;
  onStatusFilter: (id: number | null) => void;
  onSectionFilter: (s: string) => void;
  onSortBy: (s: SortBy) => void;
  onClear: () => void;
}> = ({
  visible,
  records,
  statuses,
  statusFilter,
  sectionFilter,
  sortBy,
  onStatusFilter,
  onSectionFilter,
  onSortBy,
  onClear,
}) => {
  if (!visible) return null;
  const presentStatusIds = [...new Set(records.map((r) => r.statusId))].sort(
    (a, b) => a - b,
  );
  const presentSections = [
    "All",
    ...new Set(records.map((r) => r.officeSection).filter(Boolean)),
  ].sort();
  const hasActive = statusFilter !== null || sectionFilter !== "All";

  return (
    <View className="mx-3 mb-2 bg-white rounded-2xl border border-gray-200 p-3 gap-2.5 shadow-sm elevation-2">
      <Text className="text-[10.5px] font-bold uppercase tracking-widest text-gray-400">
        Status
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexDirection: "row", gap: 6 }}
      >
        <FilterChip
          label="All"
          active={statusFilter === null}
          onPress={() => onStatusFilter(null)}
        />
        {presentStatusIds.map((sid) => {
          const c = cfg(sid);
          const dbLabel =
            statuses.find((s) => s.id === sid)?.status_name ?? c.label;
          return (
            <FilterChip
              key={sid}
              label={dbLabel}
              active={statusFilter === sid}
              color={c.dot}
              onPress={() => onStatusFilter(statusFilter === sid ? null : sid)}
            />
          );
        })}
      </ScrollView>

      <Text className="text-[10.5px] font-bold uppercase tracking-widest text-gray-400">
        Section
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexDirection: "row", gap: 6 }}
      >
        {presentSections.map((s) => (
          <FilterChip
            key={s}
            label={s}
            active={sectionFilter === s}
            onPress={() => onSectionFilter(s)}
          />
        ))}
      </ScrollView>

      <Text className="text-[10.5px] font-bold uppercase tracking-widest text-gray-400">
        Sort By
      </Text>
      <View className="flex-row gap-2">
        {(
          [
            {
              key: "date_created" as SortBy,
              label: "Date Created",
              icon: "calendar-today",
            },
            {
              key: "date_modified" as SortBy,
              label: "Last Updated",
              icon: "update",
            },
          ] as {
            key: SortBy;
            label: string;
            icon: keyof typeof MaterialIcons.glyphMap;
          }[]
        ).map((opt) => {
          const active = sortBy === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              onPress={() => onSortBy(opt.key)}
              activeOpacity={0.8}
              className={`flex-1 flex-row items-center justify-center gap-1.5 py-2 rounded-xl border ${
                active
                  ? "bg-[#064E3B] border-[#064E3B]"
                  : "bg-white border-gray-200"
              }`}
            >
              <MaterialIcons
                name={opt.icon}
                size={13}
                color={active ? "#fff" : "#6b7280"}
              />
              <Text
                className={`text-[11.5px] font-bold ${active ? "text-white" : "text-gray-500"}`}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {hasActive && (
        <TouchableOpacity onPress={onClear} className="self-end">
          <Text className="text-[11.5px] font-bold text-red-500">
            Clear filters
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const StatusPill: React.FC<{
  statusId: number;
  label: string;
  elapsed: string;
}> = ({ statusId, label, elapsed }) => {
  const c = cfg(statusId);
  return (
    <View
      className="flex-row items-center self-start rounded-full px-2.5 py-1 gap-1.5"
      style={{ backgroundColor: c.bg }}
    >
      <View
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: c.dot }}
      />
      <Text className="text-[10.5px] font-bold" style={{ color: c.text }}>
        {label}
      </Text>
      <View
        className="w-px h-2.5 opacity-30"
        style={{ backgroundColor: c.dot }}
      />
      <Text
        className="text-[10px] font-semibold opacity-70"
        style={{ color: c.text }}
      >
        {elapsed}
      </Text>
    </View>
  );
};

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

const MoreSheet: React.FC<{
  visible: boolean;
  record: DeliveryRecord | null;
  roleId: number;
  canProcess: boolean;
  statusLabel: string;
  onClose: () => void;
  onRemarks: () => void;
  onView: () => void;
  onProcess: () => void;
  onOverride: () => void;
  onDelete: () => void;
}> = ({
  visible,
  record,
  roleId,
  canProcess,
  statusLabel,
  onClose,
  onRemarks,
  onView,
  onProcess,
  onOverride,
  onDelete,
}) => {
  if (!record) return null;
  const c = cfg(record.statusId);

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
      icon: "chat",
      label: "Remarks",
      sublabel: "View stacked PR/PO/Delivery/Payment remarks",
      color: "#1d4ed8",
      bg: "#eff6ff",
      onPress: () => {
        onClose();
        onRemarks();
      },
    },
    {
      icon: "visibility",
      label: "View Documents",
      sublabel: "Open IAR / LOA / DV previews",
      color: "#065f46",
      bg: "#ecfdf5",
      onPress: () => {
        onClose();
        onView();
      },
    },
    ...(canProcess
      ? ([
          {
            icon: "arrow-forward",
            label: "Process",
            sublabel: "Update fields and advance to next step",
            color: "#064E3B",
            bg: "#ecfdf5",
            onPress: () => {
              onClose();
              onProcess();
            },
          },
        ] as Action[])
      : []),
    ...(roleId === 1
      ? ([
          {
            icon: "admin-panel-settings",
            label: "Override Status",
            sublabel: "Force delivery to any Phase 3 status",
            color: "#1d4ed8",
            bg: "#eff6ff",
            onPress: () => {
              onClose();
              onOverride();
            },
          },
          {
            icon: "delete-forever",
            label: "Delete Delivery",
            sublabel: "Permanently remove delivery and linked documents",
            color: "#7f1d1d",
            bg: "#fee2e2",
            onPress: () => {
              onClose();
              onDelete();
            },
          },
        ] as Action[])
      : []),
  ];

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
          <View
            className="bg-white rounded-t-3xl overflow-hidden"
            style={{ paddingBottom: 32 }}
          >
            <View className="items-center pt-3 pb-1">
              <View className="w-10 h-1 rounded-full bg-gray-200" />
            </View>
            <View className="px-5 pt-2 pb-4 border-b border-gray-100">
              <Text
                className="text-[15px] font-extrabold text-gray-900"
                style={{ fontFamily: MONO }}
              >
                {record.deliveryNo}
              </Text>
              <Text
                className="text-[12px] text-gray-500 mt-0.5"
                numberOfLines={1}
              >
                PO {record.poNo}
              </Text>
              <View
                className="mt-2 self-start flex-row items-center gap-1.5 rounded-full px-2.5 py-1"
                style={{ backgroundColor: c.bg }}
              >
                <View
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: c.dot }}
                />
                <Text
                  className="text-[10.5px] font-bold"
                  style={{ color: c.text }}
                >
                  {statusLabel}
                </Text>
              </View>
            </View>
            <View className="px-4 pt-3 gap-2">
              {actions.map((a) => (
                <TouchableOpacity
                  key={a.label}
                  onPress={a.onPress}
                  activeOpacity={0.8}
                  className="flex-row items-center gap-3.5 px-4 py-3.5 rounded-2xl border border-gray-100"
                  style={{ backgroundColor: a.bg }}
                >
                  <View
                    className="w-9 h-9 rounded-xl items-center justify-center"
                    style={{ backgroundColor: a.color + "18" }}
                  >
                    <MaterialIcons name={a.icon} size={18} color={a.color} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-[13.5px] font-bold text-gray-800">
                      {a.label}
                    </Text>
                    <Text className="text-[11px] text-gray-400 mt-0.5">
                      {a.sublabel}
                    </Text>
                  </View>
                  <MaterialIcons
                    name="chevron-right"
                    size={18}
                    color="#d1d5db"
                  />
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.8}
              className="mx-4 mt-3 py-3 rounded-2xl bg-gray-100 items-center"
            >
              <Text className="text-[13.5px] font-bold text-gray-500">
                Dismiss
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const Pagination: React.FC<{
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
}> = ({ page, totalPages, total, onPage }) => (
  <View className="flex-row items-center justify-between px-4 py-3 bg-white border-t border-gray-100">
    <Text className="text-[12px] text-gray-400">
      <Text className="font-semibold text-gray-600">{total}</Text> records
    </Text>
    <View className="flex-row items-center gap-1.5">
      <TouchableOpacity
        onPress={() => onPage(Math.max(1, page - 1))}
        disabled={page === 1}
        className="w-8 h-8 rounded-lg items-center justify-center border bg-white border-gray-200"
      >
        <MaterialIcons
          name="chevron-left"
          size={18}
          color={page === 1 ? "#d1d5db" : "#6b7280"}
        />
      </TouchableOpacity>
      <Text className="text-[12px] text-gray-500">
        {page}/{totalPages}
      </Text>
      <TouchableOpacity
        onPress={() => onPage(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="w-8 h-8 rounded-lg items-center justify-center border bg-white border-gray-200"
      >
        <MaterialIcons
          name="chevron-right"
          size={18}
          color={page === totalPages ? "#d1d5db" : "#6b7280"}
        />
      </TouchableOpacity>
    </View>
  </View>
);

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
  <View className="flex-1 items-center justify-center py-20 gap-3">
    <View className="w-16 h-16 rounded-2xl bg-gray-100 items-center justify-center">
      <MaterialIcons name="local-shipping" size={30} color="#d1d5db" />
    </View>
    <Text className="text-[14px] font-bold text-gray-400">{label}</Text>
  </View>
);

const canRoleProcess = (roleId: number, statusId: number) => {
  if (roleId === 1) return true;
  if (roleId === 8 && [18, 19, 20, 21, 22, 23].includes(statusId)) return true;
  if (roleId === 2 && statusId === 24) return true;
  return false;
};

const FLAG_TO_ID: Record<StatusFlag, number> = {
  complete: 2,
  incomplete_info: 3,
  wrong_information: 4,
  needs_revision: 5,
  on_hold: 6,
  urgent: 7,
};

const cfg = (id: number) =>
  STATUS_CFG[id] ?? {
    bg: "#f9fafb",
    text: "#6b7280",
    dot: "#9ca3af",
    label: `Status ${id}`,
  };

const toRecord = (row: any): DeliveryRecord => {
  const created = row?.created_at ? new Date(row.created_at) : new Date();
  const updated = row?.updated_at ? new Date(row.updated_at) : created;
  const diffMin = Math.floor((Date.now() - created.getTime()) / 60000);
  const elapsedTime =
    diffMin < 60
      ? `${diffMin} min`
      : diffMin < 1440
        ? `${Math.floor(diffMin / 60)} hr`
        : `${Math.floor(diffMin / 1440)} days`;
  return {
    id: Number(row.id),
    deliveryNo: String(row.delivery_no ?? "—"),
    poNo: String(row.po_no ?? "—"),
    supplier: String(row.supplier ?? "—"),
    officeSection: String(row.office_section ?? "—"),
    iarNo: null,
    dvNo: null,
    statusId: Number(row.status_id ?? 18),
    createdAtIso: created.toISOString(),
    expectedDeliveryDate: row?.expected_delivery_date ?? null,
    date: created.toLocaleDateString("en-PH"),
    updatedAt: updated.toLocaleDateString("en-PH"),
    elapsedTime,
    raw: row,
  };
};

const normalizeDateOnly = (value?: string | null): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
};

const getDueMeta = (record: DeliveryRecord) => {
  const created = normalizeDateOnly(record.createdAtIso);
  const expected = normalizeDateOnly(record.expectedDeliveryDate);
  if (!created || !expected) return null;

  const today = new Date();
  const current = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const elapsedDays = Math.max(
    0,
    Math.floor((current.getTime() - created.getTime()) / 86400000),
  );
  const leadDays = Math.max(
    0,
    Math.floor((expected.getTime() - created.getTime()) / 86400000),
  );
  const remainingDays = Math.ceil(
    (expected.getTime() - current.getTime()) / 86400000,
  );

  if (remainingDays < 0) {
    return {
      label: `Past due by ${Math.abs(remainingDays)} day${Math.abs(remainingDays) === 1 ? "" : "s"}`,
      detail: `Elapsed ${elapsedDays}d since log (target ${leadDays}d)`,
      tone: "late" as const,
    };
  }
  if (remainingDays <= 2) {
    return {
      label: `Due in ${remainingDays} day${remainingDays === 1 ? "" : "s"}`,
      detail: `Elapsed ${elapsedDays}d since log (target ${leadDays}d)`,
      tone: "near" as const,
    };
  }
  return {
    label: `Due in ${remainingDays} days`,
    detail: `Elapsed ${elapsedDays}d since log (target ${leadDays}d)`,
    tone: "ontrack" as const,
  };
};

export default function DeliveryModule() {
  const { currentUser } = useAuth();
  const roleId = Number((currentUser as any)?.role_id ?? 0);
  const divisionId = (currentUser as any)?.division_id ?? null;
  const { tick } = useRealtime();

  const [subTab, setSubTab] = useState<SubTab>("all");
  const [records, setRecords] = useState<DeliveryRecord[]>([]);
  const [statuses, setStatuses] = useState<
    { id: number; status_name: string }[]
  >([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<number | null>(null);
  const [sectionFilter, setSectionFilter] = useState("All");
  const [sortBy, setSortBy] = useState<SortBy>("date_created");
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);

  const [viewOpen, setViewOpen] = useState(false);
  const [active, setActive] = useState<any>(null);
  const [processOpen, setProcessOpen] = useState(false);
  const [moreRecord, setMoreRecord] = useState<DeliveryRecord | null>(null);
  const [moreVisible, setMoreVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteDeliveryId, setDeleteDeliveryId] = useState<
    string | number | null
  >(null);
  const [deleteDeliveryNo, setDeleteDeliveryNo] = useState<string | null>(null);
  const [overrideVisible, setOverrideVisible] = useState(false);
  const [overrideRecord, setOverrideRecord] = useState<DeliveryRecord | null>(
    null,
  );

  const [drNo, setDrNo] = useState("");
  const [soaNo, setSoaNo] = useState("");
  const [notes, setNotes] = useState("");
  const [statusFlag, setStatusFlag] = useState<StatusFlag | null>(null);
  const [flagPickerOpen, setFlagPickerOpen] = useState(false);
  const [iar, setIar] = useState<any>(null);
  const [loa, setLoa] = useState<any>(null);
  const [dv, setDv] = useState<any>(null);
  const [viewTab, setViewTab] = useState<"iar" | "loa" | "dv">("iar");
  const [remarkVisible, setRemarkVisible] = useState(false);
  const [remarkRecord, setRemarkRecord] = useState<PORemarkSheetRecord | null>(
    null,
  );

  useEffect(() => {
    fetchDeliveryStatuses()
      .then(setStatuses)
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const rows =
      roleId === 1 || divisionId == null
        ? await fetchDeliveries()
        : await fetchDeliveriesByDivision(Number(divisionId));
    setRecords((rows ?? []).map(toRecord));
  }, [roleId, divisionId]);

  useEffect(() => {
    load().catch(() => {});
  }, [load, tick]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const tabStatuses = SUB_TAB_STATUS_MAP[subTab];
  const filtered = useMemo(() => {
    return records
      .filter((r) => {
        if (subTab !== "all" && !tabStatuses.includes(r.statusId)) return false;
        const q = searchQuery.toLowerCase();
        const matchSearch =
          !q ||
          r.deliveryNo.toLowerCase().includes(q) ||
          r.poNo.toLowerCase().includes(q) ||
          r.supplier.toLowerCase().includes(q) ||
          r.officeSection.toLowerCase().includes(q) ||
          (r.iarNo ?? "").toLowerCase().includes(q) ||
          (r.dvNo ?? "").toLowerCase().includes(q);
        const matchSection =
          sectionFilter === "All" || r.officeSection === sectionFilter;
        const matchStatus =
          statusFilter === null || r.statusId === statusFilter;
        return matchSearch && matchSection && matchStatus;
      })
      .sort((a, b) => {
        if (sortBy === "date_modified")
          return b.updatedAt.localeCompare(a.updatedAt);
        return b.date.localeCompare(a.date);
      });
  }, [
    records,
    subTab,
    tabStatuses,
    searchQuery,
    sectionFilter,
    statusFilter,
    sortBy,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openView = async (r: DeliveryRecord) => {
    try {
      setActive(r.raw);
      const [i, l, d] = await Promise.all([
        fetchIARByDelivery(r.id),
        fetchLOAByDelivery(r.id),
        fetchDVByDelivery(r.id),
      ]);
      setIar(i);
      setLoa(l);
      setDv(d);
      setViewTab("iar");
      setViewOpen(true);
    } catch (e: any) {
      Alert.alert(
        "Load failed",
        e?.message ?? "Could not load delivery documents.",
      );
    }
  };

  const openProcess = async (r: DeliveryRecord) => {
    try {
      setActive(r.raw);
      setDrNo(r.raw?.dr_no ?? "");
      setSoaNo(r.raw?.soa_no ?? "");
      setNotes(r.raw?.notes ?? "");
      setStatusFlag(null);
      const [i, l, d] = await Promise.all([
        fetchIARByDelivery(r.id),
        fetchLOAByDelivery(r.id),
        fetchDVByDelivery(r.id),
      ]);
      setIar(i);
      setLoa(l);
      setDv(d);
      setProcessOpen(true);
    } catch (e: any) {
      Alert.alert(
        "Load failed",
        e?.message ?? "Could not load processing details.",
      );
    }
  };

  const submitProcess = async () => {
    if (!active) return;
    try {
      const currentStatus = Number(active.status_id ?? 0);
      let nextStatus = currentStatus;
      if (active.status_id === 18) {
        nextStatus = 19;
        await updateDelivery(active.id, {
          status_id: nextStatus,
          dr_no: drNo || null,
          soa_no: soaNo || null,
          notes: notes || null,
        });
      } else if (active.status_id === 19) {
        nextStatus = 20;
        await updateDelivery(active.id, {
          status_id: nextStatus,
          dr_no: drNo || null,
          soa_no: soaNo || null,
          notes: notes || null,
        });
      } else if (active.status_id === 20) {
        await upsertIARByDelivery(active.id, {
          iar_no: iar?.iar_no ?? "",
          invoice_no: iar?.invoice_no ?? "",
          invoice_date: iar?.invoice_date ?? "",
          requisitioning_office:
            iar?.requisitioning_office ?? active.office_section ?? "",
          responsibility_center: iar?.responsibility_center ?? "",
          inspected_at: iar?.inspected_at ?? "",
          received_at: iar?.received_at ?? "",
          inspector_name: iar?.inspector_name ?? "",
          supply_officer_name: iar?.supply_officer_name ?? "",
        });
        nextStatus = 21;
        await updateDelivery(active.id, {
          status_id: nextStatus,
          notes: notes || null,
        });
      } else if (active.status_id === 21) {
        nextStatus = 22;
        await updateDelivery(active.id, {
          status_id: nextStatus,
          notes: notes || null,
        });
      } else if (active.status_id === 22) {
        await upsertLOAByDelivery(active.id, {
          loa_no: loa?.loa_no ?? "",
          invoice_no: loa?.invoice_no ?? "",
          invoice_date: loa?.invoice_date ?? "",
          accepted_at: loa?.accepted_at ?? "",
          accepted_by_name: loa?.accepted_by_name ?? "",
          accepted_by_title: loa?.accepted_by_title ?? "",
        });
        nextStatus = 23;
        await updateDelivery(active.id, {
          status_id: nextStatus,
          notes: notes || null,
        });
      } else if (active.status_id === 23) {
        await upsertDVByDelivery(active.id, {
          dv_no: dv?.dv_no ?? "",
          fund_cluster: dv?.fund_cluster ?? "",
          ors_no: dv?.ors_no ?? "",
          payee: dv?.payee ?? active.supplier ?? "",
          payee_tin: dv?.payee_tin ?? "",
          address: dv?.address ?? "",
          amount_due: dv?.amount_due ?? "",
          particulars: dv?.particulars ?? "",
          responsibility_center: dv?.responsibility_center ?? "",
          mfo_pap: dv?.mfo_pap ?? "",
          mode_of_payment: dv?.mode_of_payment ?? "",
          certified_by: dv?.certified_by ?? "",
          approved_by: dv?.approved_by ?? "",
        });
        nextStatus = 24;
        await updateDelivery(active.id, {
          status_id: nextStatus,
          notes: notes || null,
        });
      } else if (active.status_id === 24) {
        nextStatus = 35;
        await updateDelivery(active.id, {
          status_id: nextStatus,
          notes: notes || null,
        });
      } else {
        await updateDelivery(active.id, { notes: notes || null });
      }

      const flagId = statusFlag ? FLAG_TO_ID[statusFlag] : null;
      const statusLabel =
        statuses.find((s) => s.id === nextStatus)?.status_name ??
        cfg(nextStatus).label;
      const noteText =
        notes.trim() ||
        `Forwarded delivery from status ${currentStatus} to ${nextStatus} (${statusLabel}).`;
      await insertDeliveryProcessRemark(
        Number(active.id),
        (currentUser as any)?.id ?? null,
        noteText,
        flagId ?? null,
        "delivery",
      );

      setProcessOpen(false);
      setStatusFlag(null);
      await load();
      Alert.alert("Success", "Delivery status updated.");
    } catch (e: any) {
      Alert.alert(
        "Process failed",
        e?.message ?? "Could not process delivery.",
      );
    }
  };

  const openRemarks = async (r: DeliveryRecord) => {
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
        onSelect={(tab) => {
          setSubTab(tab);
          setPage(1);
          setStatusFilter(null);
          setSectionFilter("All");
          setSearchQuery("");
          setFilterOpen(false);
        }}
      />

      <SearchBar
        value={searchQuery}
        onChange={(t) => {
          setSearchQuery(t);
          setPage(1);
        }}
        filterActive={
          filterOpen || statusFilter !== null || sectionFilter !== "All"
        }
        onFilterToggle={() => setFilterOpen((o) => !o)}
      />

      <FilterPanel
        visible={filterOpen}
        records={records.filter((r) => tabStatuses.includes(r.statusId))}
        statuses={statuses}
        statusFilter={statusFilter}
        sectionFilter={sectionFilter}
        sortBy={sortBy}
        onStatusFilter={(id) => {
          setStatusFilter(id);
          setPage(1);
        }}
        onSectionFilter={(s) => {
          setSectionFilter(s);
          setPage(1);
        }}
        onSortBy={(s) => {
          setSortBy(s);
          setPage(1);
        }}
        onClear={() => {
          setStatusFilter(null);
          setSectionFilter("All");
          setPage(1);
        }}
      />

      <View className="flex-row items-center justify-between px-4 pb-1.5 pt-0.5">
        <Text className="text-[11px] text-gray-400">
          <Text className="font-semibold text-gray-500">{filtered.length}</Text>
          {" of "}
          {records.length} records
          {statusFilter !== null || sectionFilter !== "All" || searchQuery
            ? " (filtered)"
            : ""}
        </Text>
        <View className="flex-row items-center gap-1">
          <MaterialIcons
            name={sortBy === "date_created" ? "calendar-today" : "update"}
            size={11}
            color="#9ca3af"
          />
          <Text className="text-[10.5px] text-gray-400">
            {sortBy === "date_created" ? "Date Created" : "Last Updated"}
          </Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#064E3B"
            colors={["#064E3B"]}
          />
        }
      >
        {paged.length === 0 ? (
          <EmptyState label="No delivery records found" />
        ) : (
          paged.map((r, idx) => {
            const statusLabel =
              statuses.find((s) => s.id === r.statusId)?.status_name ??
              cfg(r.statusId).label;
            const canProcess = canRoleProcess(roleId, r.statusId);
            const dueMeta = getDueMeta(r);
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
                    <StatusPill
                      statusId={r.statusId}
                      label={statusLabel}
                      elapsed={r.elapsedTime}
                    />
                  </View>
                  <View className="flex-row flex-wrap gap-x-4 gap-y-1 mt-2">
                    <Text className="text-[11.5px] text-gray-600">
                      {r.supplier}
                    </Text>
                    <Text className="text-[11.5px] text-gray-500">
                      {r.officeSection}
                    </Text>
                  </View>
                  {dueMeta && (
                    <View
                      className="mt-2 rounded-lg px-2.5 py-1.5 self-start border"
                      style={{
                        backgroundColor:
                          dueMeta.tone === "late"
                            ? "#fef2f2"
                            : dueMeta.tone === "near"
                              ? "#fff7ed"
                              : "#ecfdf5",
                        borderColor:
                          dueMeta.tone === "late"
                            ? "#fecaca"
                            : dueMeta.tone === "near"
                              ? "#fed7aa"
                              : "#bbf7d0",
                      }}
                    >
                      <Text
                        className="text-[10.5px] font-bold"
                        style={{
                          color:
                            dueMeta.tone === "late"
                              ? "#991b1b"
                              : dueMeta.tone === "near"
                                ? "#9a3412"
                                : "#166534",
                        }}
                      >
                        {dueMeta.label}
                      </Text>
                      <Text className="text-[10px] text-gray-500">
                        {dueMeta.detail}
                      </Text>
                    </View>
                  )}
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
                    <MaterialIcons
                      name="visibility"
                      size={14}
                      color="#6b7280"
                    />
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
                    <Text className="text-white text-[16px] font-extrabold">
                      •••
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={filtered.length}
        onPage={setPage}
      />

      <MoreSheet
        visible={moreVisible}
        record={moreRecord}
        roleId={roleId}
        canProcess={
          moreRecord ? canRoleProcess(roleId, moreRecord.statusId) : false
        }
        statusLabel={
          moreRecord
            ? (statuses.find((s) => s.id === moreRecord.statusId)
                ?.status_name ?? cfg(moreRecord.statusId).label)
            : ""
        }
        onClose={() => {
          setMoreVisible(false);
          setMoreRecord(null);
        }}
        onRemarks={() => {
          if (!moreRecord) return;
          void openRemarks(moreRecord);
        }}
        onView={() => {
          if (!moreRecord) return;
          void openView(moreRecord);
        }}
        onProcess={() => {
          if (!moreRecord) return;
          void openProcess(moreRecord);
        }}
        onDelete={() => {
          if (!moreRecord) return;
          setDeleteDeliveryId(moreRecord.id);
          setDeleteDeliveryNo(moreRecord.deliveryNo);
          setDeleteVisible(true);
          setMoreVisible(false);
          setMoreRecord(null);
        }}
        onOverride={() => {
          if (!moreRecord) return;
          setOverrideRecord(moreRecord);
          setOverrideVisible(true);
        }}
      />

      <ViewDeliveryModal
        visible={viewOpen}
        onClose={() => setViewOpen(false)}
        viewTab={viewTab}
        setViewTab={setViewTab}
        active={active}
        iar={iar}
        loa={loa}
        dv={dv}
      />
      <ProcessDeliveryModal
        visible={processOpen}
        onClose={() => setProcessOpen(false)}
        onSubmit={submitProcess}
        active={active}
        statusLabel={
          statuses.find((s) => s.id === Number(active?.status_id ?? 0))
            ?.status_name ?? cfg(active?.status_id ?? 18).label
        }
        drNo={drNo}
        setDrNo={setDrNo}
        soaNo={soaNo}
        setSoaNo={setSoaNo}
        notes={notes}
        setNotes={setNotes}
        iar={iar}
        setIar={setIar}
        loa={loa}
        setLoa={setLoa}
        dv={dv}
        setDv={setDv}
        onPreviewIAR={() => {
          setViewTab("iar");
          setViewOpen(true);
        }}
        onPreviewLOA={() => {
          setViewTab("loa");
          setViewOpen(true);
        }}
        onPreviewDV={() => {
          setViewTab("dv");
          setViewOpen(true);
        }}
        statusFlag={statusFlag}
        onPressStatusFlag={() => setFlagPickerOpen(true)}
        flagPickerOpen={flagPickerOpen}
        onCloseFlagPicker={() => setFlagPickerOpen(false)}
        onSelectStatusFlag={(f: StatusFlag | null) => {
          setStatusFlag(f);
          setFlagPickerOpen(false);
        }}
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

      <DeleteDeliveryModal
        visible={deleteVisible}
        deliveryId={deleteDeliveryId}
        deliveryNo={deleteDeliveryNo}
        onClose={() => {
          setDeleteVisible(false);
          setDeleteDeliveryId(null);
          setDeleteDeliveryNo(null);
        }}
        onDeleted={(id) => {
          setRecords((prev) => prev.filter((r) => String(r.id) !== String(id)));
          setDeleteVisible(false);
          setDeleteDeliveryId(null);
          setDeleteDeliveryNo(null);
        }}
      />

      <Modal
        visible={overrideVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setOverrideVisible(false);
          setOverrideRecord(null);
        }}
      >
        <View className="flex-1 bg-black/50 justify-center px-5">
          <View className="bg-white rounded-2xl p-4 max-h-[80%]">
            <Text className="text-[13px] font-extrabold text-gray-900 mb-1">
              Override delivery status
            </Text>
            <Text className="text-[11px] text-gray-500 mb-3">
              {overrideRecord?.deliveryNo ?? ""} · Admin only
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {[18, 19, 20, 21, 22, 23, 24, 27].map((sid) => {
                const label =
                  statuses.find((s) => s.id === sid)?.status_name ??
                  cfg(sid).label;
                return (
                  <TouchableOpacity
                    key={sid}
                    onPress={async () => {
                      if (!overrideRecord) return;
                      try {
                        await updateDelivery(overrideRecord.id, {
                          status_id: sid,
                        });
                        setOverrideVisible(false);
                        setOverrideRecord(null);
                        await load();
                        Alert.alert("Success", "Delivery status updated.");
                      } catch (e: any) {
                        Alert.alert(
                          "Failed",
                          e?.message ?? "Could not override status.",
                        );
                      }
                    }}
                    className="py-3 border-b border-gray-100"
                  >
                    <Text className="text-[12px] font-bold text-gray-800">
                      {label}
                    </Text>
                    <Text className="text-[10px] text-gray-400">ID {sid}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              onPress={() => {
                setOverrideVisible(false);
                setOverrideRecord(null);
              }}
              className="mt-3 py-2.5 rounded-xl bg-gray-100 items-center"
            >
              <Text className="text-[12px] font-bold text-gray-600">
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
