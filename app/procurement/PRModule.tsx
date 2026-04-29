import { assertOnline } from "@/lib/network";
import type { PRRow, PRStatusRow, RemarkRow } from "@/lib/supabase-types";
import { toPRDisplay } from "@/types/model";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useEffect, useState } from "react";
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
import RemarkSheet from "../(components)/RemarkSheet";
import DeletePRModal from "../(modals)/DeletePRModal";
import ViewPRModal from "../(modals)/ViewPRModal";
import {
    fetchLatestRemarkByPR,
    fetchPRStatuses,
    fetchPurchaseRequests,
    fetchPurchaseRequestsByDivision,
} from "../../lib/supabase/pr";
import { useAuth } from "../AuthContext";
import { useEntityChanges } from "../RealtimeContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type SubTab = "all" | "pr" | "canvass" | "abstract_of_awards";

type PRRecord = ReturnType<typeof toPRDisplay> & {
  itemDescription: string;
  quantity: number;
  elapsedTime: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Visual config keyed by status_id (FK from status table).
 * Covers the full lifecycle including canvassing sub-statuses from the DB:
 *
 *   1  = Pending
 *   2  = Processing (Division Head)
 *   3  = Processing (BAC)
 *   4  = Processing (Budget)
 *   5  = Processing (PARPO)
 *   6  = Canvassing (Reception)    ← BAC receives & assigns canvass number
 *   7  = BAC Resolution
 *   8  = Canvassing (Releasing)    ← RFQ released to canvassers
 *   9  = Canvassing (Collection)   ← BAC collecting filled canvass sheets
 *   10 = Abstract of Awards
 *   11 = PO (Creation)
 */
const STATUS_CFG: Record<
  number,
  { bg: string; text: string; dot: string; label: string }
> = {
  1: { bg: "#fefce8", text: "#854d0e", dot: "#eab308", label: "Pending" },
  2: {
    bg: "#eff6ff",
    text: "#1e40af",
    dot: "#3b82f6",
    label: "Div. Head Review",
  },
  3: { bg: "#f5f3ff", text: "#5b21b6", dot: "#8b5cf6", label: "BAC Review" },
  4: { bg: "#fff7ed", text: "#9a3412", dot: "#f97316", label: "Budget Review" },
  5: {
    bg: "#ecfdf5",
    text: "#065f46",
    dot: "#10b981",
    label: "PARPO Approval",
  },
  6: {
    bg: "#f0fdf4",
    text: "#166534",
    dot: "#22c55e",
    label: "Canvass · Reception",
  },
  7: {
    bg: "#faf5ff",
    text: "#6b21a8",
    dot: "#9333ea",
    label: "BAC Resolution",
  },
  8: {
    bg: "#ecfdf5",
    text: "#065f46",
    dot: "#16a34a",
    label: "Canvass · Releasing",
  },
  9: {
    bg: "#f0fdfa",
    text: "#0f766e",
    dot: "#0d9488",
    label: "Canvass · Collection",
  },
  10: {
    bg: "#fdf4ff",
    text: "#86198f",
    dot: "#c026d3",
    label: "Abstract of Awards",
  },
  11: {
    bg: "#eff6ff",
    text: "#1e40af",
    dot: "#3b82f6",
    label: "PO (Creation)",
  },
  33: {
    bg: "#ecfdf5",
    text: "#14532d",
    dot: "#22c55e",
    label: "Completed (PR Phase)",
  },
};

function statusCfgFor(id: number) {
  return (
    STATUS_CFG[id] ?? {
      bg: "#f9fafb",
      text: "#6b7280",
      dot: "#9ca3af",
      label: `Status ${id}`,
    }
  );
}

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pr", label: "Purchase Request" },
  { key: "canvass", label: "Canvass" },
  { key: "abstract_of_awards", label: "Abstract of Awards" },
];

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const PAGE_SIZE = 7;
const fmt = (n: number) =>
  n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

type SortBy = "date_created" | "date_modified";

// Status flags for remark badges
type StatusFlag =
  | "complete"
  | "incomplete_info"
  | "wrong_information"
  | "needs_revision"
  | "on_hold"
  | "urgent";

// ─── Flag ID helpers (display only — full mapping lives in RemarkSheet) ───────

const ID_TO_FLAG: Record<number, StatusFlag> = {
  2: "complete",
  3: "incomplete_info",
  4: "wrong_information",
  5: "needs_revision",
  6: "on_hold",
  7: "urgent",
};

// Flag badge styling (matches STATUS_CFG pattern)
const STATUS_FLAGS: Record<
  StatusFlag,
  {
    bg: string;
    text: string;
    dot: string;
    label: string;
    icon: keyof typeof MaterialIcons.glyphMap;
  }
> = {
  complete: {
    bg: "#f0fdf4",
    text: "#15803d",
    dot: "#22c55e",
    label: "Complete",
    icon: "check-circle",
  },
  incomplete_info: {
    bg: "#fef2f2",
    text: "#dc2626",
    dot: "#ef4444",
    label: "Incomplete",
    icon: "error-outline",
  },
  wrong_information: {
    bg: "#fff7ed",
    text: "#f97316",
    dot: "#f97316",
    label: "Wrong Info",
    icon: "report-problem",
  },
  needs_revision: {
    bg: "#fefce8",
    text: "#eab308",
    dot: "#eab308",
    label: "Needs Revision",
    icon: "refresh",
  },
  on_hold: {
    bg: "#f3f4f6",
    text: "#6b7280",
    dot: "#9ca3af",
    label: "On Hold",
    icon: "pause-circle",
  },
  urgent: {
    bg: "#fef2f2",
    text: "#dc2626",
    dot: "#ef4444",
    label: "Urgent",
    icon: "priority-high",
  },
};

/** Used by RecordCard to resolve the latest flag badge from its numeric ID. */
function getFlagFromId(id: number | null): StatusFlag | null {
  return id ? (ID_TO_FLAG[id] ?? null) : null;
}

function rowToRecord(row: PRRow, itemCount = 0): PRRecord {
  const base = toPRDisplay(row);
  const created = row.created_at ? new Date(row.created_at) : new Date();
  const diffMs = Date.now() - created.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const elapsed =
    diffMin < 60
      ? `${diffMin} min`
      : diffMin < 1440
        ? `${Math.floor(diffMin / 60)} hr`
        : `${Math.floor(diffMin / 1440)} days`;
  return {
    ...base,
    itemDescription: base.purpose,
    quantity: itemCount,
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
}> = ({ value, onChange, filterActive, onFilterToggle }) => (
  <View className="flex-row items-center gap-2 px-3 py-2.5 bg-white border-b border-gray-100">
    <View className="flex-1 flex-row items-center bg-gray-100 rounded-xl px-3 py-2 gap-2 border border-gray-200">
      <Text className="text-gray-400 text-sm">🔍</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Search PR, section, item…"
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
    {/* Filter toggle — mirrors ProcurementLog */}
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

/** Reusable chip used inside FilterPanel — mirrors ProcurementLog's FilterChip. */
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

/**
 * Collapsible filter + sort panel — mirrors ProcurementLog.
 * Sections derived from actual record data (no hardcoded list).
 * Sort options: Date Created (newest first) · Last Modified (newest first).
 */
const FilterPanel: React.FC<{
  visible: boolean;
  records: PRRecord[];
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
    <View className="mx-3 mb-2 bg-white rounded-2xl border border-gray-200 p-3 gap-2.5 shadow-sm elevation-2">
      {/* ── Status ── */}
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
          const c = statusCfgFor(sid);
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

      {/* ── Section / Division ── */}
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

      {/* ── Sort ── */}
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

      {/* ── Clear ── */}
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
  const cfg = statusCfgFor(statusId);
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
        {label}
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

const RecordCard: React.FC<{
  record: PRRecord;
  isEven: boolean;
  roleId: number;
  statuses: PRStatusRow[];
  latestFlag: RemarkRow | null;
  onView: (r: PRRecord) => void;
  onMore: (r: PRRecord) => void;
}> = ({ record, isEven, roleId, statuses, latestFlag, onView, onMore }) => {
  const statusLabel =
    statuses.find((s) => s.id === record.statusId)?.status_name ??
    `Status ${record.statusId}`;
  const flagKey = latestFlag?.status_flag_id
    ? getFlagFromId(latestFlag.status_flag_id)
    : null;
  const flag = flagKey ? STATUS_FLAGS[flagKey] : null;

  return (
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
            {record.prNo}
          </Text>
          <Text
            className="text-[12.5px] text-gray-700 leading-5"
            numberOfLines={2}
          >
            {record.itemDescription}
          </Text>
        </View>
        <StatusPill
          statusId={record.statusId}
          label={statusLabel}
          elapsed={record.elapsedTime}
        />
      </View>
      <View className="h-px bg-gray-100 mx-4" />
      <View className="flex-row items-center gap-3 px-4 py-2.5">
        <View className="bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5">
          <Text className="text-[10.5px] font-bold text-emerald-700">
            {record.officeSection}
          </Text>
        </View>
        <View className="w-px h-3.5 bg-gray-200" />
        <Text
          className="text-[11px] text-gray-400"
          style={{ fontFamily: MONO }}
        >
          {record.date}
        </Text>
        <View className="flex-1" />
        <Text
          className="text-[12.5px] font-bold text-gray-700"
          style={{ fontFamily: MONO }}
        >
          <Text>₱</Text>
          {fmt(record.totalCost)}
        </Text>
      </View>
      {/* ── Latest status flag from remarks ── */}
      {flag && (
        <>
          <View className="h-px bg-gray-100 mx-4" />
          <View className="flex-row items-center gap-2 px-4 py-2">
            <View
              className="flex-row items-center gap-1.5 rounded-full px-2 py-0.5 border"
              style={{
                backgroundColor: flag.bg,
                borderColor: flag.dot + "40",
              }}
            >
              <MaterialIcons name={flag.icon} size={11} color={flag.dot} />
              <Text
                className="text-[10.5px] font-bold"
                style={{ color: flag.text }}
              >
                {flag.label}
              </Text>
            </View>
            {latestFlag?.username && (
              <Text className="text-[10px] text-gray-400">
                by {latestFlag.username}
              </Text>
            )}
            {latestFlag?.remark && (
              <Text
                className="flex-1 text-[10.5px] text-gray-500"
                numberOfLines={1}
              >
                · {latestFlag.remark}
              </Text>
            )}
          </View>
        </>
      )}
      <View className="h-px bg-gray-100 mx-4" />
      <View className="flex-row items-center gap-2 px-4 py-2.5">
        <TouchableOpacity
          onPress={() => onView(record)}
          activeOpacity={0.8}
          className="flex-1 bg-blue-600 rounded-xl py-2 items-center"
        >
          <Text className="text-white text-[12px] font-bold">View</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onMore(record)}
          activeOpacity={0.8}
          className="flex-1 bg-emerald-700 rounded-xl py-2 items-center"
        >
          <Text className="text-white text-[12px] font-bold">More</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const MoreSheet: React.FC<{
  visible: boolean;
  record: PRRecord | null;
  roleId: number;
  onClose: () => void;
  onRemarks: (r: PRRecord) => void;
  onViewDocuments: (r: PRRecord) => void;
  onDelete: (r: PRRecord) => void;
}> = ({
  visible,
  record,
  roleId,
  onClose,
  onRemarks,
  onViewDocuments,
  onDelete,
}) => {
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
      sublabel: "View or add processing notes",
      color: "#065f46",
      bg: "#ecfdf5",
      onPress: () => {
        onClose();
        onRemarks(record);
      },
    },
    {
      icon: "visibility",
      label: "View Documents",
      sublabel: "Open PR PDF preview",
      color: "#1d4ed8",
      bg: "#eff6ff",
      onPress: () => {
        onClose();
        onViewDocuments(record);
      },
    },
    ...(roleId === 1
      ? ([
          {
            icon: "delete-outline",
            label: "Delete PR",
            sublabel: "Permanently remove this PR from the system",
            color: "#dc2626",
            bg: "#fee2e2",
            onPress: () => {
              onClose();
              onDelete(record);
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
                {record.prNo}
              </Text>
              <Text
                className="text-[12px] text-gray-500 mt-0.5"
                numberOfLines={1}
              >
                {record.officeSection}
              </Text>
            </View>
            <View className="px-5 pt-4">
              {actions.map((a) => (
                <TouchableOpacity
                  key={a.label}
                  activeOpacity={0.85}
                  onPress={a.onPress}
                  className="flex-row items-center gap-3 rounded-2xl p-3 mb-2 border"
                  style={{ backgroundColor: a.bg, borderColor: a.color + "30" }}
                >
                  <View
                    className="w-10 h-10 rounded-2xl items-center justify-center"
                    style={{ backgroundColor: a.color + "15" }}
                  >
                    <MaterialIcons name={a.icon} size={20} color={a.color} />
                  </View>
                  <View className="flex-1">
                    <Text
                      className="text-[13px] font-extrabold"
                      style={{ color: a.color }}
                    >
                      {a.label}
                    </Text>
                    <Text className="text-[11px] text-gray-500 mt-0.5">
                      {a.sublabel}
                    </Text>
                  </View>
                  <MaterialIcons
                    name="chevron-right"
                    size={18}
                    color="#9ca3af"
                  />
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={onClose}
                activeOpacity={0.85}
                className="mt-2 px-4 py-3 rounded-2xl bg-gray-100"
              >
                <Text className="text-[12px] font-bold text-gray-700 text-center">
                  Close
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
  <View className="flex-1 items-center justify-center py-24 px-8">
    <Text className="text-5xl mb-4">📋</Text>
    <Text className="text-[16px] font-bold text-gray-600 mb-2 text-center">
      {label}
    </Text>
    <Text className="text-[13px] text-gray-400 text-center leading-5 max-w-[240px]">
      No records here yet.
    </Text>
  </View>
);

// ─── PRModule ─────────────────────────────────────────────────────────────────

export default function PRModule({
  initialSubTab,
}: { initialSubTab?: SubTab } = {}) {
  const { currentUser } = useAuth();
  const roleId = currentUser?.role_id ?? 0;

  const [activeSubTab, setActiveSubTab] = useState<SubTab>(
    initialSubTab ?? "all",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("date_created");
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [records, setRecords] = useState<PRRecord[]>([]);
  const [statuses, setStatuses] = useState<PRStatusRow[]>([]);
  // Latest remark per PR id — fetched alongside records, used to show flag on cards
  const [latestRemarks, setLatestRemarks] = useState<
    Record<string, RemarkRow | null>
  >({});

  // View PR modal state
  const [viewRecord, setViewRecord] = useState<PRRecord | null>(null);
  const [viewVisible, setViewVisible] = useState(false);
  const [viewInitialTab, setViewInitialTab] = useState<
    "details" | "pr" | "rfqs" | "resolution" | "abstract"
  >("details");

  // More / actions sheet state
  const [moreRecord, setMoreRecord] = useState<PRRecord | null>(null);
  const [moreVisible, setMoreVisible] = useState(false);
  const [remarkRecord, setRemarkRecord] = useState<PRRecord | null>(null);
  const [remarkVisible, setRemarkVisible] = useState(false);

  // Delete modal state (Admin only)
  const [deleteRecord, setDeleteRecord] = useState<PRRecord | null>(null);
  const [deleteVisible, setDeleteVisible] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  // Load PR status lookup table once — labels come from DB, not hardcoded strings.
  useEffect(() => {
    fetchPRStatuses()
      .then(setStatuses)
      .catch(() => {}); // non-fatal; StatusPill falls back to "Status N"
  }, []);

  // ── Load PRs — shared by initial load, subtab change, and pull-to-refresh ──
  const loadPRs = useCallback(async () => {
    try {
      await assertOnline("load PRs");
      let rows: PRRow[] = [];
      // role_id 1 (Admin) and role_id 8 (Supply) see all PRs.
      const canSeeAll = roleId === 1 || roleId === 8;

      const allRows = canSeeAll
        ? await fetchPurchaseRequests()
        : await fetchPurchaseRequestsByDivision(currentUser?.division_id ?? -1);

      if (activeSubTab === "all") {
        rows = allRows;
      } else if (activeSubTab === "pr") {
        rows = allRows.filter((r) => r.status_id >= 1 && r.status_id <= 5);
      } else if (activeSubTab === "canvass") {
        rows = allRows.filter((r) => r.status_id >= 6 && r.status_id <= 9);
      } else if (activeSubTab === "abstract_of_awards") {
        rows = allRows.filter((r) => r.status_id === 10);
      } else {
        rows = [];
      }
      setRecords(rows.map((r) => rowToRecord(r)));

      // Fetch latest remark for every PR in parallel (for status flag display on cards).
      // Fire-and-forget after records are set — flags are non-blocking UI enhancement.
      const remarkEntries = await Promise.all(
        rows.map(async (r) => {
          const remark = await fetchLatestRemarkByPR(String(r.id)).catch(
            () => null,
          );
          return [String(r.id), remark] as [string, RemarkRow | null];
        }),
      );
      setLatestRemarks(Object.fromEntries(remarkEntries));
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.toLowerCase().includes("no internet connection")) {
        Alert.alert("No Internet Connection", msg);
      } else if (msg) {
        Alert.alert("Load failed", msg);
      }
    }
  }, [activeSubTab, roleId, currentUser?.division_id]);

  useEffect(() => {
    loadPRs();
  }, [loadPRs]);

  // ── Live refresh: auto-reload on realtime changes ──
  useEntityChanges("pr", (event) => {
    console.log(
      "[PRModule] Realtime change detected:",
      event.table,
      event.eventType,
    );
    loadPRs();
  });

  // Pull-to-refresh handler
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPRs();
    setRefreshing(false);
  }, [loadPRs]);

  // No auto-navigation; we open Canvassing when user taps "Process" in the Canvass subtab.

  const filtered = records
    .filter((r) => {
      const q = searchQuery.trim().toLowerCase();
      const prNo = (r.prNo ?? "").toLowerCase();
      const itemDesc = (r.itemDescription ?? "").toLowerCase();
      const office = (r.officeSection ?? "").toLowerCase();
      const matchSearch =
        !q || prNo.includes(q) || itemDesc.includes(q) || office.includes(q);
      const matchSection =
        sectionFilter === "All" || r.officeSection === sectionFilter;
      const matchStatus = statusFilter === null || r.statusId === statusFilter;
      return matchSearch && matchSection && matchStatus;
    })
    .sort((a, b) => {
      // Both sort modes are newest-first.
      // date_modified uses elapsedTime indirectly; since we only have created_at on PRRecord
      // we use the raw date string. For "last modified" we use statusId as a proxy
      // tie-breaker (higher status = more recently processed) when dates are equal.
      if (sortBy === "date_modified") {
        // Primary: date desc, secondary: statusId desc (higher = further along = more recently touched)
        const dateDiff = b.date.localeCompare(a.date);
        return dateDiff !== 0 ? dateDiff : b.statusId - a.statusId;
      }
      // date_created: newest first by date string
      return b.date.localeCompare(a.date);
    });
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [activeSubTab]);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  return (
    <View className="flex-1 bg-gray-50">
      <SubTabRow
        active={activeSubTab}
        onSelect={(t) => {
          setActiveSubTab(t);
          setFilterOpen(false);
          setStatusFilter(null);
          setSectionFilter("All");
          setSearchQuery("");
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

      {/* Results count + active sort indicator */}
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
          <EmptyState label="No records found" />
        ) : (
          paged.map((record, idx) => (
            <RecordCard
              key={record.id}
              record={record}
              isEven={idx % 2 === 0}
              roleId={roleId}
              statuses={statuses}
              latestFlag={latestRemarks[String(record.id)] ?? null}
              onView={(r) => {
                setViewRecord(r);
                setViewInitialTab("details");
                setViewVisible(true);
              }}
              onMore={(r) => {
                setMoreRecord(r);
                setMoreVisible(true);
              }}
            />
          ))
        )}
      </ScrollView>

      {/* Pagination */}
      <View className="flex-row items-center justify-between px-4 py-3 bg-white border-t border-gray-100">
        <Text className="text-[12px] text-gray-400">
          <Text className="font-semibold text-gray-600">{filtered.length}</Text>{" "}
          records
        </Text>
        <View className="flex-row items-center gap-1.5">
          {(() => {
            type PageBtn =
              | {
                  kind: "prev" | "next";
                  label: string;
                  page: number;
                  disabled: boolean;
                }
              | {
                  kind: "page";
                  label: string;
                  page: number;
                  active: boolean;
                  disabled: false;
                };

            const windowSize = 5;
            const start = Math.max(
              1,
              Math.min(
                page - Math.floor(windowSize / 2),
                totalPages - windowSize + 1,
              ),
            );
            const end = Math.min(totalPages, start + windowSize - 1);

            const btns: PageBtn[] = [
              {
                kind: "prev",
                label: "‹",
                page: Math.max(1, page - 1),
                disabled: page === 1,
              },
              ...Array.from({ length: end - start + 1 }, (_, i) => {
                const p = start + i;
                return {
                  kind: "page",
                  label: String(p),
                  page: p,
                  active: p === page,
                  disabled: false,
                } as const;
              }),
              {
                kind: "next",
                label: "›",
                page: Math.min(totalPages, page + 1),
                disabled: page === totalPages,
              },
            ];

            return btns.map((btn) => (
              <TouchableOpacity
                key={`${btn.kind}-${btn.page}`}
                onPress={() => setPage(btn.page)}
                disabled={btn.disabled}
                activeOpacity={0.8}
                className={`w-8 h-8 rounded-lg items-center justify-center border ${
                  btn.kind === "page" && btn.active
                    ? "bg-[#064E3B] border-[#064E3B]"
                    : btn.disabled
                      ? "bg-gray-50 border-gray-100"
                      : "bg-white border-gray-200"
                }`}
              >
                <Text
                  className={`text-[12px] font-bold ${
                    btn.kind === "page" && btn.active
                      ? "text-white"
                      : btn.disabled
                        ? "text-gray-300"
                        : "text-gray-500"
                  }`}
                >
                  {btn.label}
                </Text>
              </TouchableOpacity>
            ));
          })()}
        </View>
      </View>

      {/* View PR modal */}
      <ViewPRModal
        visible={viewVisible}
        record={viewRecord}
        initialTab={viewInitialTab}
        onClose={() => {
          setViewVisible(false);
          setViewRecord(null);
        }}
      />

      {/* More / Remarks sheet */}
      <MoreSheet
        visible={moreVisible}
        record={moreRecord}
        roleId={roleId}
        onClose={() => {
          setMoreVisible(false);
          setMoreRecord(null);
        }}
        onRemarks={(r) => {
          setRemarkRecord(r);
          setRemarkVisible(true);
        }}
        onViewDocuments={(r) => {
          setViewRecord(r);
          setViewInitialTab("pr");
          setViewVisible(true);
        }}
        onDelete={(r) => {
          setDeleteRecord(r);
          setDeleteVisible(true);
        }}
      />

      <RemarkSheet
        visible={remarkVisible}
        record={remarkRecord}
        currentUser={currentUser}
        onClose={() => {
          setRemarkVisible(false);
          setRemarkRecord(null);
        }}
      />

      {/* Delete PR modal — Admin only */}
      <DeletePRModal
        visible={deleteVisible}
        prId={deleteRecord?.id ?? null}
        prNo={deleteRecord?.prNo ?? null}
        onClose={() => {
          setDeleteVisible(false);
          setDeleteRecord(null);
        }}
        onDeleted={(id) => {
          setRecords((prev) => prev.filter((r) => r.id !== id));
        }}
      />
    </View>
  );
}
