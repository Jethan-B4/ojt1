import {
  fetchDVByDelivery,
  fetchDeliveries,
  fetchDeliveriesByDivision,
  fetchDeliveryStatuses,
  fetchIARByDelivery,
  fetchLOAByDelivery,
  fetchPoCandidatesForDelivery,
  insertDelivery,
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
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import CreateDeliveryModal from "../(modals)/CreateDeliveryModal";
import DeleteDeliveryModal from "../(modals)/DeleteDeliveryModal";
import ProcessDeliveryModal from "../(modals)/ProcessDeliveryModal";
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
  elapsedTime: string;
  raw: any;
};

const STATUS_CFG: Record<
  number,
  { bg: string; text: string; dot: string; label: string }
> = {
  16: {
    bg: "#fefce8",
    text: "#854d0e",
    dot: "#eab308",
    label: "Awaiting Delivery",
  },
  17: {
    bg: "#fff7ed",
    text: "#9a3412",
    dot: "#f97316",
    label: "Delivery Received",
  },
  18: {
    bg: "#f0fdfa",
    text: "#0f766e",
    dot: "#0d9488",
    label: "IAR Preparation",
  },
  19: { bg: "#faf5ff", text: "#6b21a8", dot: "#9333ea", label: "IAR Signing" },
  20: {
    bg: "#eff6ff",
    text: "#1e40af",
    dot: "#3b82f6",
    label: "LOA / DV Prep",
  },
  21: {
    bg: "#f0fdf4",
    text: "#166534",
    dot: "#22c55e",
    label: "Division Signature",
  },
  22: {
    bg: "#ecfdf5",
    text: "#065f46",
    dot: "#10b981",
    label: "COA Submission",
  },
};
const SUB_TAB_STATUS_MAP: Record<SubTab, number[]> = {
  all: [16, 17, 18, 19, 20, 21, 22],
  deliveries: [16, 17],
  inspection: [18, 19],
  acceptance: [20, 21, 22],
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
  onCreatePress: () => void;
  canCreate: boolean;
  filterActive: boolean;
  onFilterToggle: () => void;
}> = ({
  value,
  onChange,
  onCreatePress,
  canCreate,
  filterActive,
  onFilterToggle,
}) => (
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
    {canCreate && (
      <Pressable
        onPress={onCreatePress}
        className="flex-row items-center gap-1.5 bg-[#064E3B] px-4 py-2.5 rounded-xl"
        style={({ pressed }) => (pressed ? { opacity: 0.82 } : undefined)}
      >
        <MaterialIcons name="add" size={18} color="#ffffff" />
        <Text className="text-white text-[13px] font-bold">Log</Text>
      </Pressable>
    )}
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
  onView: () => void;
  onProcess: () => void;
  onDelete: () => void;
}> = ({
  visible,
  record,
  roleId,
  canProcess,
  statusLabel,
  onClose,
  onView,
  onProcess,
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

const canRoleCreate = (roleId: number) => roleId === 1 || roleId === 8;
const canRoleProcess = (roleId: number, statusId: number) =>
  roleId === 1 ||
  (roleId === 8 && [16, 17, 18, 20, 22].includes(statusId)) ||
  (roleId === 9 && statusId === 19) ||
  (roleId === 2 && statusId === 21);

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
    statusId: Number(row.status_id ?? 16),
    date: created.toLocaleDateString("en-PH"),
    updatedAt: updated.toLocaleDateString("en-PH"),
    elapsedTime,
    raw: row,
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

  const [createOpen, setCreateOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [processOpen, setProcessOpen] = useState(false);
  const [active, setActive] = useState<any | null>(null);
  const [moreRecord, setMoreRecord] = useState<DeliveryRecord | null>(null);
  const [moreVisible, setMoreVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteDeliveryId, setDeleteDeliveryId] = useState<
    string | number | null
  >(null);
  const [deleteDeliveryNo, setDeleteDeliveryNo] = useState<string | null>(null);

  const [poOptions, setPoOptions] = useState<any[]>([]);
  const [selectedPoId, setSelectedPoId] = useState<number | null>(null);
  const [deliveryNo, setDeliveryNo] = useState("");

  const [drNo, setDrNo] = useState("");
  const [soaNo, setSoaNo] = useState("");
  const [notes, setNotes] = useState("");
  const [iar, setIar] = useState<any>(null);
  const [loa, setLoa] = useState<any>(null);
  const [dv, setDv] = useState<any>(null);
  const [viewTab, setViewTab] = useState<"iar" | "loa" | "dv">("iar");

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
        if (!tabStatuses.includes(r.statusId)) return false;
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
  }, [records, tabStatuses, searchQuery, sectionFilter, statusFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openCreate = async () => {
    try {
      const options = (await fetchPoCandidatesForDelivery()) as any[];
      setPoOptions(options);
      if (!options.length) {
        Alert.alert(
          "No served PO found",
          "Only served Purchase Orders can be logged for delivery.",
        );
      }
      setCreateOpen(true);
    } catch (e: any) {
      Alert.alert("Load failed", e?.message ?? "Could not load PO options.");
    }
  };

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

  const submitCreate = async () => {
    const po = poOptions.find((x) => Number(x.id) === Number(selectedPoId));
    if (!deliveryNo.trim())
      return Alert.alert("Missing field", "Delivery No. is required.");
    if (!po)
      return Alert.alert("Missing field", "Please select a Purchase Order.");
    try {
      await insertDelivery({
        po_id: Number(po.id),
        po_no: po.po_no ?? "",
        supplier: po.supplier ?? "",
        office_section: po.office_section ?? "",
        division_id: po.division_id ?? null,
        delivery_no: deliveryNo.trim(),
        created_by: (currentUser as any)?.id ?? null,
      });
      setCreateOpen(false);
      setDeliveryNo("");
      setSelectedPoId(null);
      await load();
      Alert.alert("Success", "Delivery logged successfully.");
    } catch (e: any) {
      Alert.alert("Create failed", e?.message ?? "Could not log delivery.");
    }
  };

  const submitProcess = async () => {
    if (!active) return;
    try {
      if (active.status_id === 16) {
        await updateDelivery(active.id, {
          status_id: 17,
          dr_no: drNo || null,
          soa_no: soaNo || null,
          notes: notes || null,
        });
      } else if (active.status_id === 17) {
        await upsertIARByDelivery(active.id, {
          iar_no: iar?.iar_no ?? "",
          invoice_no: iar?.invoice_no ?? "",
          invoice_date: iar?.invoice_date ?? "",
        });
        await updateDelivery(active.id, {
          status_id: 18,
          notes: notes || null,
        });
      } else if (active.status_id === 18) {
        await updateDelivery(active.id, {
          status_id: 19,
          notes: notes || null,
        });
      } else if (active.status_id === 19) {
        await upsertIARByDelivery(active.id, {
          inspector_name: iar?.inspector_name ?? "",
          inspected_at: iar?.inspected_at ?? "",
        });
        await updateDelivery(active.id, {
          status_id: 20,
          notes: notes || null,
        });
      } else if (active.status_id === 20) {
        await upsertLOAByDelivery(active.id, {
          loa_no: loa?.loa_no ?? "",
          invoice_no: loa?.invoice_no ?? "",
          accepted_by_name: loa?.accepted_by_name ?? "",
          accepted_by_title: loa?.accepted_by_title ?? "",
        });
        await upsertDVByDelivery(active.id, {
          dv_no: dv?.dv_no ?? "",
          amount_due: dv?.amount_due ?? "",
          particulars: dv?.particulars ?? "",
          mode_of_payment: dv?.mode_of_payment ?? "",
        });
        await updateDelivery(active.id, {
          status_id: 21,
          notes: notes || null,
        });
      } else if (active.status_id === 21) {
        await updateDelivery(active.id, {
          status_id: 22,
          notes: notes || null,
        });
      } else {
        await updateDelivery(active.id, { notes: notes || null });
      }
      setProcessOpen(false);
      await load();
      Alert.alert("Success", "Delivery status updated.");
    } catch (e: any) {
      Alert.alert(
        "Process failed",
        e?.message ?? "Could not process delivery.",
      );
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
        onCreatePress={() => void openCreate()}
        canCreate={canRoleCreate(roleId)}
        filterActive={filterOpen || statusFilter !== null || sectionFilter !== "All"}
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
                </View>
                <View className="h-px bg-gray-100 mx-4" />
                <View className="flex-row items-center px-3 py-2.5 gap-2">
                  <View className="flex-1">
                    <Text className="text-[10.5px] text-gray-400">{r.date}</Text>
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
                  {canProcess && (
                    <TouchableOpacity
                      onPress={() => void openProcess(r)}
                      activeOpacity={0.85}
                      className="flex-row items-center gap-1 px-3 py-1.5 rounded-xl bg-[#064E3B]"
                    >
                      <MaterialIcons
                        name="arrow-forward"
                        size={14}
                        color="#fff"
                      />
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

      <Pagination page={page} totalPages={totalPages} total={filtered.length} onPage={setPage} />

      <MoreSheet
        visible={moreVisible}
        record={moreRecord}
        roleId={roleId}
        canProcess={moreRecord ? canRoleProcess(roleId, moreRecord.statusId) : false}
        statusLabel={
          moreRecord
            ? statuses.find((s) => s.id === moreRecord.statusId)?.status_name ??
              cfg(moreRecord.statusId).label
            : ""
        }
        onClose={() => {
          setMoreVisible(false);
          setMoreRecord(null);
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
        }}
      />

      <CreateDeliveryModal
        visible={createOpen}
        deliveryNo={deliveryNo}
        setDeliveryNo={setDeliveryNo}
        poOptions={poOptions}
        selectedPoId={selectedPoId}
        setSelectedPoId={setSelectedPoId}
        onClose={() => setCreateOpen(false)}
        onSubmit={submitCreate}
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
            ?.status_name ?? cfg(active?.status_id ?? 16).label
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
    </View>
  );
}
