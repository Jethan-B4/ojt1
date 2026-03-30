/**
 * POModule.tsx — Purchase Order Module
 *
 * Changes from previous version:
 *   - SearchBar now accepts canCreate + onCreatePress props
 *   - Create button ("+  Create") shown only to role_id === 8 (Supply)
 *   - Edit button shown on RecordCard for Supply (role_id 8) when statusId <= 4
 *   - CreatePOModal wired in with handlePOCreated
 *   - EditPOModal wired in with handlePOSave
 *   - RecordCard receives onEdit prop + canEdit flag
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import CreatePOModal, { type POCreatePayload } from "../(modals)/CreatePOModal";
import EditPOModal, {
  type POEditPayload,
  type POEditRecord,
} from "../(modals)/EditPOModal";
import ViewPOModal from "../(modals)/ViewPOModal";
import {
  fetchPurchaseOrders,
  fetchPurchaseOrdersByDivision,
  updatePOStatus,
  type PORow,
} from "../../lib/supabase/po";
import { useAuth } from "../AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PORecord {
  id: string;
  poNo: string;
  prNo: string;
  supplier: string;
  officeSection: string;
  totalAmount: number;
  statusId: number;
  date: string;
  updatedAt: string;
  elapsedTime: string;
}

type SortBy = "date_created" | "date_modified";
type SubTab = "po" | "ors" | "coa";

// ─── Constants ────────────────────────────────────────────────────────────────

const PO_STATUS_CFG: Record<
  number,
  {
    bg: string;
    text: string;
    dot: string;
    label: string;
    step: number;
    actor: string;
  }
> = {
  1: {
    bg: "#fdf4ff",
    text: "#86198f",
    dot: "#c026d3",
    label: "AAA Signing",
    step: 11,
    actor: "BAC",
  },
  2: {
    bg: "#eff6ff",
    text: "#1e40af",
    dot: "#3b82f6",
    label: "Fwd. to Supply",
    step: 12,
    actor: "BAC",
  },
  3: {
    bg: "#fefce8",
    text: "#854d0e",
    dot: "#eab308",
    label: "PO # Assignment",
    step: 13,
    actor: "Supply",
  },
  4: {
    bg: "#f0fdf4",
    text: "#166534",
    dot: "#22c55e",
    label: "PO Preparation",
    step: 14,
    actor: "Supply",
  },
  5: {
    bg: "#fff7ed",
    text: "#9a3412",
    dot: "#f97316",
    label: "Budget Allocation",
    step: 15,
    actor: "Budget",
  },
  6: {
    bg: "#fefce8",
    text: "#713f12",
    dot: "#ca8a04",
    label: "ORS Preparation",
    step: 16,
    actor: "Budget",
  },
  7: {
    bg: "#fff7ed",
    text: "#7c2d12",
    dot: "#ea580c",
    label: "ORS # Assignment",
    step: 17,
    actor: "Budget",
  },
  8: {
    bg: "#ecfdf5",
    text: "#065f46",
    dot: "#10b981",
    label: "Budget Approval",
    step: 18,
    actor: "Budget",
  },
  9: {
    bg: "#f0f9ff",
    text: "#0c4a6e",
    dot: "#0ea5e9",
    label: "Accounting Review",
    step: 19,
    actor: "Accounting",
  },
  10: {
    bg: "#ecfdf5",
    text: "#064e3b",
    dot: "#059669",
    label: "PARPO Signature",
    step: 20,
    actor: "PARPO",
  },
  11: {
    bg: "#f0fdf4",
    text: "#14532d",
    dot: "#16a34a",
    label: "PO Approved",
    step: 21,
    actor: "Supply",
  },
  12: {
    bg: "#f0fdfa",
    text: "#0f766e",
    dot: "#0d9488",
    label: "Served to Supplier",
    step: 22,
    actor: "Supply",
  },
  13: {
    bg: "#faf5ff",
    text: "#6b21a8",
    dot: "#9333ea",
    label: "COA Submission",
    step: 23,
    actor: "Supply",
  },
};

function poCfgFor(id: number) {
  return (
    PO_STATUS_CFG[id] ?? {
      bg: "#f9fafb",
      text: "#6b7280",
      dot: "#9ca3af",
      label: `Status ${id}`,
      step: 0,
      actor: "—",
    }
  );
}

const PO_ROLE_STEPS: Record<number, number[]> = {
  3: [1, 2],
  6: [3, 4, 11, 12, 13],
  4: [5, 6, 7, 8],
  8: [9],
  5: [10],
  1: [],
};

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "po", label: "Purchase Order" },
  { key: "ors", label: "ORS" },
  { key: "coa", label: "COA" },
];

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const PAGE_SIZE = 7;
const fmt = (n: number) =>
  n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function rowToPORecord(row: PORow): PORecord {
  const created = row.created_at ? new Date(row.created_at) : new Date();
  const updated = row.updated_at ? new Date(row.updated_at) : created;
  const diffMin = Math.floor((Date.now() - created.getTime()) / 60_000);
  const elapsed =
    diffMin < 60
      ? `${diffMin} min`
      : diffMin < 1440
        ? `${Math.floor(diffMin / 60)} hr`
        : `${Math.floor(diffMin / 1440)} days`;
  return {
    id: String(row.id),
    poNo: row.po_no ?? "—",
    prNo: row.pr_no ?? "—",
    supplier: row.supplier ?? "—",
    officeSection: row.office_section ?? "—",
    totalAmount: Number(row.total_amount) || 0,
    statusId: Number(row.status_id) || 1,
    date: created.toLocaleDateString("en-PH"),
    updatedAt: updated.toLocaleDateString("en-PH"),
    elapsedTime: elapsed,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
  canCreate: boolean;
  onCreatePress: () => void;
}> = ({
  value,
  onChange,
  filterActive,
  onFilterToggle,
  canCreate,
  onCreatePress,
}) => (
  <View className="flex-row items-center gap-2 px-3 py-2.5 bg-white border-b border-gray-100">
    <View className="flex-1 flex-row items-center bg-gray-100 rounded-xl px-3 py-2 gap-2 border border-gray-200">
      <Text className="text-gray-400 text-sm">🔍</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Search PO, supplier, section…"
        placeholderTextColor="#9ca3af"
        returnKeyType="search"
        className="flex-1 text-[13px] text-gray-800"
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChange("")} hitSlop={8}>
          <Text className="text-gray-400 text-sm">✕</Text>
        </TouchableOpacity>
      )}
    </View>
    <TouchableOpacity
      onPress={onFilterToggle}
      activeOpacity={0.8}
      className={`w-10 h-10 rounded-xl items-center justify-center border-2 ${filterActive ? "bg-[#064E3B] border-[#064E3B]" : "bg-white border-gray-200"}`}
    >
      <MaterialIcons
        name="filter-list"
        size={18}
        color={filterActive ? "#ffffff" : "#6b7280"}
      />
    </TouchableOpacity>
    {/* Create button — Supply only (role_id 8) */}
    {canCreate && (
      <Pressable
        onPress={onCreatePress}
        className="flex-row items-center gap-1.5 bg-[#064E3B] px-4 py-2.5 rounded-xl"
        style={({ pressed }) => (pressed ? { opacity: 0.82 } : undefined)}
      >
        <Text className="text-white text-[18px] leading-none font-light">
          +
        </Text>
        <Text className="text-white text-[13px] font-bold">Create</Text>
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
  records: PORecord[];
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
    <View
      className="mx-3 mb-2 bg-white rounded-2xl border border-gray-200 p-3 gap-2.5 shadow-sm"
      style={{ elevation: 2 }}
    >
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
          const c = poCfgFor(sid);
          return (
            <FilterChip
              key={sid}
              label={c.label}
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
              label: "Last Processed",
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
              className={`flex-1 flex-row items-center justify-center gap-1.5 py-2 rounded-xl border ${active ? "bg-[#064E3B] border-[#064E3B]" : "bg-white border-gray-200"}`}
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

const StatusPill: React.FC<{ statusId: number; elapsed: string }> = ({
  statusId,
  elapsed,
}) => {
  const cfg = poCfgFor(statusId);
  return (
    <View
      className="flex-row items-center self-start rounded-full px-2.5 py-1 gap-1.5"
      style={{ backgroundColor: cfg.bg }}
    >
      <View
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: cfg.dot }}
      />
      <Text className="text-[10.5px] font-bold" style={{ color: cfg.text }}>
        {cfg.label}
      </Text>
      <View
        className="w-px h-2.5 opacity-30"
        style={{ backgroundColor: cfg.dot }}
      />
      <Text
        className="text-[10px] font-semibold opacity-70"
        style={{ color: cfg.text }}
      >
        {elapsed}
      </Text>
    </View>
  );
};

const StepBadge: React.FC<{ statusId: number }> = ({ statusId }) => {
  const cfg = poCfgFor(statusId);
  if (!cfg.step) return null;
  return (
    <View className="flex-row items-center gap-1 bg-gray-100 rounded-md px-2 py-0.5">
      <MaterialIcons name="linear-scale" size={10} color="#9ca3af" />
      <Text className="text-[10px] font-bold text-gray-400">
        Step {cfg.step} · {cfg.actor}
      </Text>
    </View>
  );
};

const RecordCard: React.FC<{
  record: PORecord;
  isEven: boolean;
  roleId: number;
  onView: (r: PORecord) => void;
  onEdit: (r: PORecord) => void;
  onProcess: (r: PORecord) => void;
  canProcess: boolean;
  canEdit: boolean;
}> = ({ record, isEven, onView, onEdit, onProcess, canProcess, canEdit }) => (
  <View
    className={`mx-4 mb-3 rounded-3xl border border-gray-200 overflow-hidden shadow-sm ${isEven ? "bg-white" : "bg-gray-50"}`}
    style={{ elevation: 3 }}
  >
    <View className="flex-row items-start justify-between px-4 pt-3.5 pb-2">
      <View className="flex-1 pr-3">
        <Text
          className="text-[13px] font-bold text-[#1a4d2e] mb-0.5"
          style={{ fontFamily: MONO }}
        >
          {record.poNo}
        </Text>
        <Text
          className="text-[11px] text-gray-400"
          style={{ fontFamily: MONO }}
        >
          PR: {record.prNo}
        </Text>
        <Text
          className="text-[12.5px] text-gray-700 leading-5 mt-0.5"
          numberOfLines={1}
        >
          {record.supplier}
        </Text>
      </View>
      <StatusPill statusId={record.statusId} elapsed={record.elapsedTime} />
    </View>

    <View className="h-px bg-gray-100 mx-4" />

    <View className="flex-row items-center gap-3 px-4 py-2.5">
      <View className="bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5">
        <Text className="text-[10.5px] font-bold text-emerald-700">
          {record.officeSection}
        </Text>
      </View>
      <View className="w-px h-3.5 bg-gray-200" />
      <Text className="text-[11px] text-gray-400" style={{ fontFamily: MONO }}>
        {record.date}
      </Text>
      <View className="flex-1" />
      <Text
        className="text-[12.5px] font-bold text-gray-700"
        style={{ fontFamily: MONO }}
      >
        ₱{fmt(record.totalAmount)}
      </Text>
    </View>

    <View className="flex-row items-center px-4 pb-2 gap-2">
      <StepBadge statusId={record.statusId} />
    </View>

    <View className="h-px bg-gray-100 mx-4" />

    <View className="flex-row items-center gap-2 px-4 py-2.5">
      {/* View */}
      <TouchableOpacity
        onPress={() => onView(record)}
        activeOpacity={0.8}
        className="flex-1 bg-blue-600 rounded-xl py-2 items-center"
      >
        <Text className="text-white text-[12px] font-bold">View</Text>
      </TouchableOpacity>

      {/* Edit — Supply only, while still in preparation (status ≤ 4) */}
      {canEdit ? (
        <TouchableOpacity
          onPress={() => onEdit(record)}
          activeOpacity={0.8}
          className="flex-1 bg-amber-500 rounded-xl py-2 items-center"
        >
          <Text className="text-white text-[12px] font-bold">Edit</Text>
        </TouchableOpacity>
      ) : canProcess ? (
        <TouchableOpacity
          onPress={() => onProcess(record)}
          activeOpacity={0.8}
          className="flex-1 bg-violet-600 rounded-xl py-2 items-center"
        >
          <Text className="text-white text-[12px] font-bold">Process</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          disabled
          activeOpacity={1}
          className="flex-1 bg-gray-200 rounded-xl py-2 items-center"
        >
          <Text className="text-gray-400 text-[12px] font-bold">Locked</Text>
        </TouchableOpacity>
      )}
    </View>
  </View>
);

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
  <View className="flex-1 items-center justify-center py-24 px-8">
    <Text className="text-5xl mb-4">🧾</Text>
    <Text className="text-[16px] font-bold text-gray-600 mb-2 text-center">
      {label}
    </Text>
    <Text className="text-[13px] text-gray-400 text-center leading-5 max-w-[240px]">
      No records here yet.
    </Text>
  </View>
);

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
      {[
        { label: "‹", page: Math.max(1, page - 1), disabled: page === 1 },
        ...Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map(
          (p) => ({
            label: String(p),
            page: p,
            disabled: false,
            active: p === page,
          }),
        ),
        {
          label: "›",
          page: Math.min(totalPages, page + 1),
          disabled: page === totalPages,
        },
      ].map((btn, i) => (
        <TouchableOpacity
          key={i}
          onPress={() => onPage(btn.page)}
          disabled={btn.disabled}
          activeOpacity={0.8}
          className={`w-8 h-8 rounded-lg items-center justify-center border ${
            (btn as any).active
              ? "bg-[#064E3B] border-[#064E3B]"
              : btn.disabled
                ? "bg-gray-50 border-gray-100"
                : "bg-white border-gray-200"
          }`}
        >
          <Text
            className={`text-[12px] font-bold ${(btn as any).active ? "text-white" : btn.disabled ? "text-gray-300" : "text-gray-500"}`}
          >
            {btn.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  </View>
);

// ─── POModule ─────────────────────────────────────────────────────────────────

export default function POModule() {
  const { currentUser } = useAuth();
  const roleId = currentUser?.role_id ?? 0;

  const [activeSubTab, setActiveSubTab] = useState<SubTab>("po");
  const [searchQuery, setSearchQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("date_created");
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [records, setRecords] = useState<PORecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // View modal
  const [viewRecord, setViewRecord] = useState<PORecord | null>(null);
  const [viewVisible, setViewVisible] = useState(false);

  // Create modal — Supply only
  const [createVisible, setCreateVisible] = useState(false);

  // Edit modal
  const [editRecord, setEditRecord] = useState<POEditRecord | null>(null);
  const [editVisible, setEditVisible] = useState(false);

  // Sub-tab → status range
  const subTabStatusRange: Record<SubTab, ((id: number) => boolean) | null> = {
    po: (id) => id >= 1 && id <= 10,
    ors: (id) => id >= 5 && id <= 8,
    coa: (id) => id === 13,
  };

  const canSeeAll = roleId === 1 || [3, 4, 5, 8].includes(roleId);

  // ── Data loading ────────────────────────────────────────────────────────
  const loadPOs = useCallback(async () => {
    try {
      const rows: PORow[] = canSeeAll
        ? await fetchPurchaseOrders()
        : await fetchPurchaseOrdersByDivision(currentUser?.division_id ?? -1);
      setRecords(rows.map(rowToPORecord));
    } catch {}
  }, [canSeeAll, currentUser?.division_id]);

  useEffect(() => {
    loadPOs();
  }, [loadPOs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPOs();
    setRefreshing(false);
  }, [loadPOs]);

  // ── Handlers ────────────────────────────────────────────────────────────

  /** Optimistically prepend the newly created PO to the list. */
  const handlePOCreated = useCallback((payload: POCreatePayload) => {
    const newRecord: PORecord = {
      id: `local-${Date.now()}`,
      poNo: payload.poNo,
      prNo: payload.prNo,
      supplier: payload.supplier,
      officeSection: payload.officeSection,
      totalAmount: payload.totalAmount,
      statusId: 1, // AAA Signing — initial status
      date: new Date().toLocaleDateString("en-PH"),
      updatedAt: new Date().toLocaleDateString("en-PH"),
      elapsedTime: "just now",
    };
    setRecords((prev) => [newRecord, ...prev]);
    setPage(1);
  }, []);

  /** Sync in-memory list after a successful edit. */
  const handlePOSave = useCallback((payload: POEditPayload) => {
    setRecords((prev) =>
      prev.map((r) =>
        r.id !== payload.id
          ? r
          : {
              ...r,
              supplier: payload.supplier,
              officeSection: payload.officeSection,
              totalAmount: payload.totalAmount,
            },
      ),
    );
  }, []);

  const handleProcess = useCallback(
    async (r: PORecord) => {
      const allowedSteps = PO_ROLE_STEPS[roleId] ?? [];

      if (roleId === 1) {
        Alert.alert(
          "Admin View",
          "Admins can view POs but processing is role-specific.",
        );
        return;
      }
      if (!allowedSteps.includes(r.statusId)) {
        Alert.alert(
          "Not Available",
          `Your role cannot process a PO at step "${poCfgFor(r.statusId).label}".`,
        );
        return;
      }

      const next = r.statusId + 1;

      // Pathway A: BAC checks completeness before forwarding
      if (roleId === 3 && r.statusId === 2) {
        Alert.alert(
          "Documents Complete?",
          "Are all required attachments complete?",
          [
            {
              text: "Yes — Forward to Supply",
              onPress: async () => {
                try {
                  setSaving(true);
                  await updatePOStatus(r.id, 3);
                  setRecords((prev) =>
                    prev.map((x) =>
                      x.id === r.id ? { ...x, statusId: 3 } : x,
                    ),
                  );
                } catch (e: any) {
                  Alert.alert("Failed", e?.message ?? "Could not update PO.");
                } finally {
                  setSaving(false);
                }
              },
            },
            {
              text: "No — Return to BAC",
              style: "destructive",
              onPress: async () => {
                try {
                  setSaving(true);
                  await updatePOStatus(r.id, 1);
                  setRecords((prev) =>
                    prev.map((x) =>
                      x.id === r.id ? { ...x, statusId: 1 } : x,
                    ),
                  );
                  Alert.alert("Returned", "PO returned to BAC.");
                } catch (e: any) {
                  Alert.alert("Failed", e?.message ?? "Could not return PO.");
                } finally {
                  setSaving(false);
                }
              },
            },
            { text: "Cancel", style: "cancel" },
          ],
        );
        return;
      }

      // Pathway B: Accounting routes to PARPO or returns
      if (roleId === 8 && r.statusId === 9) {
        Alert.alert("Accounting Decision", "How should this PO be routed?", [
          {
            text: "Pathway B — Accountant Approves → PARPO",
            onPress: async () => {
              try {
                setSaving(true);
                await updatePOStatus(r.id, 10);
                setRecords((prev) =>
                  prev.map((x) => (x.id === r.id ? { ...x, statusId: 10 } : x)),
                );
              } catch (e: any) {
                Alert.alert("Failed", e?.message);
              } finally {
                setSaving(false);
              }
            },
          },
          {
            text: "Pathway A — Lacks Documents → Return",
            style: "destructive",
            onPress: () => Alert.alert("Returned", "PO returned to approver."),
          },
          { text: "Cancel", style: "cancel" },
        ]);
        return;
      }

      Alert.alert(
        "Advance PO",
        `Mark as "${poCfgFor(next).label}" (Step ${poCfgFor(next).step})?`,
        [
          {
            text: "Confirm",
            onPress: async () => {
              try {
                setSaving(true);
                await updatePOStatus(r.id, next);
                setRecords((prev) =>
                  prev.map((x) =>
                    x.id === r.id ? { ...x, statusId: next } : x,
                  ),
                );
              } catch (e: any) {
                Alert.alert("Failed", e?.message ?? "Could not update PO.");
              } finally {
                setSaving(false);
              }
            },
          },
          { text: "Cancel", style: "cancel" },
        ],
      );
    },
    [roleId],
  );

  // ── Derived data ─────────────────────────────────────────────────────────
  const subTabFilter = subTabStatusRange[activeSubTab];

  const filtered = records
    .filter((r) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        !q ||
        r.poNo.toLowerCase().includes(q) ||
        r.prNo.toLowerCase().includes(q) ||
        r.supplier.toLowerCase().includes(q) ||
        r.officeSection.toLowerCase().includes(q);
      const matchSection =
        sectionFilter === "All" || r.officeSection === sectionFilter;
      const matchStatus = statusFilter === null || r.statusId === statusFilter;
      const matchSubTab = subTabFilter === null || subTabFilter(r.statusId);
      return matchSearch && matchSection && matchStatus && matchSubTab;
    })
    .sort((a, b) => {
      if (sortBy === "date_modified") {
        const d = b.updatedAt.localeCompare(a.updatedAt);
        return d !== 0 ? d : b.statusId - a.statusId;
      }
      return b.date.localeCompare(a.date);
    });

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // Supply can edit while PO is still in preparation (status ≤ 4)
  const canCreate = roleId === 8;

  return (
    <View className="flex-1 bg-gray-50">
      <SubTabRow
        active={activeSubTab}
        onSelect={(s) => {
          setActiveSubTab(s);
          setPage(1);
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
        canCreate={canCreate}
        onCreatePress={() => setCreateVisible(true)}
      />
      <FilterPanel
        visible={filterOpen}
        records={records}
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

      {/* Results count + sort indicator */}
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
            {sortBy === "date_created" ? "Date Created" : "Last Processed"}
          </Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
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
          <EmptyState label="No purchase orders found" />
        ) : (
          paged.map((record, idx) => {
            const allowedSteps = PO_ROLE_STEPS[roleId] ?? [];
            const canProcess = allowedSteps.includes(record.statusId);
            // Supply can edit while status ≤ 4 (PO still being prepared)
            const canEdit = roleId === 8 && record.statusId <= 4;
            return (
              <RecordCard
                key={record.id}
                record={record}
                isEven={idx % 2 === 0}
                roleId={roleId}
                canProcess={canProcess}
                canEdit={canEdit}
                onView={(r) => {
                  setViewRecord(r);
                  setViewVisible(true);
                }}
                onEdit={(r) => {
                  setEditRecord({ id: r.id, poNo: r.poNo });
                  setEditVisible(true);
                }}
                onProcess={handleProcess}
              />
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

      {/* ── Modals ── */}
      <ViewPOModal
        visible={viewVisible}
        record={viewRecord}
        onClose={() => {
          setViewVisible(false);
          setViewRecord(null);
        }}
      />

      {/* Create PO — Supply only */}
      <CreatePOModal
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
        onCreated={handlePOCreated}
        divisionId={currentUser?.division_id ?? null}
      />

      {/* Edit PO */}
      <EditPOModal
        visible={editVisible}
        record={editRecord}
        onClose={() => {
          setEditVisible(false);
          setEditRecord(null);
        }}
        onSave={handlePOSave}
      />

      {/* Saving overlay */}
      {saving && (
        <View className="absolute inset-0 bg-black/20 items-center justify-center">
          <View className="bg-white rounded-2xl px-6 py-4">
            <Text className="text-[14px] font-semibold text-gray-700">
              Saving…
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
