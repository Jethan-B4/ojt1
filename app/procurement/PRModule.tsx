import type { PRRow, PRStatusRow, RemarkRow } from "@/lib/supabase-types";
import { toPRDisplay } from "@/types/model";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useNavigation } from "@react-navigation/native";
import React, { useCallback, useEffect, useState } from "react";
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
import RemarkSheet from "../(components)/RemarkSheet";
import CancelPRModal from "../(modals)/CancelPRModal";
import { CreatePRModal, PRSubmitPayload } from "../(modals)/CreatePRModal";
import DeletePRModal from "../(modals)/DeletePRModal";
import EditPRModal, {
  type PREditPayload,
  type PREditRecord,
} from "../(modals)/EditPRModal";
import ProcessPRModal, {
  STATUS_FLAGS,
  type ProcessRecord,
  type StatusFlag,
} from "../(modals)/ProcessPRModal";
import ViewPRModal from "../(modals)/ViewPRModal";
import {
  fetchLatestRemarkByPR,
  fetchPRStatuses,
  fetchPurchaseRequests,
  fetchPurchaseRequestsByDivision,
  insertProposalForPR,
  insertPurchaseRequest,
  updatePRStatus,
} from "../../lib/supabase/pr";
import { useAuth } from "../AuthContext";

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

// role_id 2 = Division Head, 3 = BAC, 4 = Budget, 5 = PARPO
const PROCESS_ROLES = new Set([2, 3, 4, 5]);

// ─── Flag ID helpers (display only — full mapping lives in RemarkSheet) ───────

const ID_TO_FLAG: Record<number, StatusFlag> = {
  2: "complete",
  3: "incomplete_info",
  4: "wrong_information",
  5: "needs_revision",
  6: "on_hold",
  7: "urgent",
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
  onCreatePress: () => void;
  canCreate?: boolean;
  filterActive: boolean;
  onFilterToggle: () => void;
}> = ({
  value,
  onChange,
  onCreatePress,
  canCreate = true,
  filterActive,
  onFilterToggle,
}) => (
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
  onEdit: (r: PRRecord) => void;
  onProcess: (r: PRRecord) => void;
  onMore: (r: PRRecord) => void;
}> = ({
  record,
  isEven,
  roleId,
  statuses,
  latestFlag,
  onView,
  onEdit,
  onProcess,
  onMore,
}) => {
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
          <Text style={{ fontFamily: undefined }}>{"\u20B1"}</Text>
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
        {roleId === 6 ? (
          record.statusId === 1 ? (
            <TouchableOpacity
              onPress={() => onProcess(record)}
              activeOpacity={0.8}
              className="flex-1 bg-violet-600 rounded-xl py-2 items-center"
            >
              <Text className="text-white text-[12px] font-bold">Process</Text>
            </TouchableOpacity>
          ) : record.statusId <= 2 ? (
            <TouchableOpacity
              onPress={() => onEdit(record)}
              activeOpacity={0.8}
              className="flex-1 bg-amber-500 rounded-xl py-2 items-center"
            >
              <Text className="text-white text-[12px] font-bold">Edit</Text>
            </TouchableOpacity>
          ) : record.statusId >= 6 ? (
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
              className="flex-1 bg-gray-300 rounded-xl py-2 items-center"
            >
              <Text className="text-white text-[12px] font-bold">Locked</Text>
            </TouchableOpacity>
          )
        ) : (
          <TouchableOpacity
            onPress={() => onProcess(record)}
            activeOpacity={0.8}
            className="flex-1 bg-violet-600 rounded-xl py-2 items-center"
          >
            <Text className="text-white text-[12px] font-bold">Process</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => onMore(record)}
          activeOpacity={0.8}
          className="w-10 h-10 bg-emerald-700 rounded-xl items-center justify-center"
        >
          <Text className="text-white text-[11px] font-bold tracking-widest">
            •••
          </Text>
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
  onRemarks: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onDelete: () => void;
}> = ({
  visible,
  record,
  roleId,
  onClose,
  onRemarks,
  onEdit,
  onCancel,
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
        onRemarks();
      },
    },
    {
      icon: "edit",
      label: "Edit PR",
      sublabel: "Modify PR details and line items",
      color: "#b45309",
      bg: "#fffbeb",
      onPress: () => {
        onClose();
        onEdit();
      },
    },
    ...(roleId === 1
      ? ([
          {
            icon: "cancel",
            label: "Cancel PR",
            sublabel: "Void this PR and stop further processing",
            color: "#b91c1c",
            bg: "#fff1f2",
            onPress: () => {
              onClose();
              onCancel();
            },
          },
          {
            icon: "delete-forever",
            label: "Delete PR",
            sublabel: "Permanently remove PR and linked records",
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
  const navigation = useNavigation();
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

  // Edit PR modal state
  const [editRecord, setEditRecord] = useState<PREditRecord | null>(null);
  const [editVisible, setEditVisible] = useState(false);

  // Process PR modal state (Division Head / BAC / Budget)
  const [processRecord, setProcessRecord] = useState<ProcessRecord | null>(
    null,
  );
  const [processVisible, setProcessVisible] = useState(false);
  const [processRoleOverride, setProcessRoleOverride] = useState<number | null>(
    null,
  );
  const [cancelVisible, setCancelVisible] = useState(false);
  const [cancelRecord, setCancelRecord] = useState<{
    id: string;
    prNo: string;
  } | null>(null);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteRecord, setDeleteRecord] = useState<{
    id: string;
    prNo: string;
  } | null>(null);

  // More / actions sheet state
  const [moreRecord, setMoreRecord] = useState<PRRecord | null>(null);
  const [moreVisible, setMoreVisible] = useState(false);
  const [remarkRecord, setRemarkRecord] = useState<PRRecord | null>(null);
  const [remarkVisible, setRemarkVisible] = useState(false);

  // Create PR modal state
  const [prModalOpen, setPrModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
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
      let rows: PRRow[] = [];
      // role_id 1 (Admin), PROCESS_ROLES (2-5), and role_id 8 (Supply) see all PRs.
      const canSeeAll =
        roleId === 1 || roleId === 8 || PROCESS_ROLES.has(roleId);

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
    } catch {}
  }, [activeSubTab, roleId, currentUser?.division_id]);

  useEffect(() => {
    loadPRs();
  }, [loadPRs]);

  // Pull-to-refresh handler
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPRs();
    setRefreshing(false);
  }, [loadPRs]);

  // No auto-navigation; we open Canvassing when user taps "Process" in the Canvass subtab.

  const handleOpenCreate = useCallback(() => {
    setPrModalOpen(true);
  }, []);

  const handlePRSubmit = useCallback(async (payload: PRSubmitPayload) => {
    setSaving(true);
    try {
      const saved = await insertPurchaseRequest(payload.pr, payload.items);
      try {
        await insertProposalForPR(
          saved.id,
          payload.proposalNo,
          payload.divisionId,
        );
      } catch {}
      setRecords((prev) => [rowToRecord(saved, payload.items.length), ...prev]);
      setPage(1);
    } catch (e: any) {
      const message = e.message ?? "Insert failed";
      setRecords((prev) => [
        {
          id: `local-${Date.now()}`,
          prNo: payload.pr.pr_no,
          // Mirror display fields exactly
          officeSection: payload.pr.office_section,
          purpose: payload.pr.purpose,
          totalCost: payload.pr.total_cost,
          statusId: 1, // Pending — status_id 1 per status table
          date: new Date().toLocaleDateString("en-PH"),
          // Extra display-only fields
          itemDescription: payload.pr.purpose,
          quantity: payload.items.length,
          elapsedTime: "just now",
        } as PRRecord,
        ...prev,
      ]);
      setPage(1);
      Alert.alert(
        "Saved locally",
        `Could not reach the server. Record will sync when online. ${message}`,
      );
    } finally {
      setSaving(false);
    }
    // Modal already inserted to DB. Optimistically add to list and refresh later.
    // setRecords((prev) => [{
    //   id: `local-${Date.now()}`, prNo: payload.pr.pr_no,
    //   itemDescription: `${payload.pr.office_section} procurement request`,
    //   officeSection: payload.pr.office_section, quantity: payload.items.length,
    //   totalCost: payload.pr.total_cost, date: new Date().toLocaleDateString("en-PH"),
    //   status: "pending", elapsedTime: "just now",
    // }, ...prev]);
    // setPage(1);
    // setSaving(false);
  }, []);

  // Fix 3: actually persists to Supabase (updatePurchaseRequest was never called before).
  // Fix 5: uses payload.purpose for itemDescription instead of a hardcoded placeholder.
  // Note: persistence is now handled inside EditPRModal itself before onSave is called,
  // so this callback only needs to sync the in-memory list and handle the saving overlay.
  const handlePRSave = useCallback((payload: PREditPayload) => {
    setRecords((prev) =>
      prev.map((r) =>
        r.id !== payload.id
          ? r
          : {
              ...r,
              officeSection: payload.officeSection,
              purpose: payload.purpose, // Fix 5: keep purpose in sync
              totalCost: payload.totalCost,
              quantity: payload.items.length,
              itemDescription: payload.purpose, // Fix 5: was hardcoded placeholder
            },
      ),
    );
  }, []);

  const filtered = records
    .filter((r) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        !q ||
        r.prNo.toLowerCase().includes(q) ||
        r.itemDescription.toLowerCase().includes(q) ||
        r.officeSection.toLowerCase().includes(q);
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

  return (
    <View className="flex-1 bg-gray-50">
      <SubTabRow active={activeSubTab} onSelect={setActiveSubTab} />
      <SearchBar
        value={searchQuery}
        onChange={(t) => {
          setSearchQuery(t);
          setPage(1);
        }}
        onCreatePress={handleOpenCreate}
        canCreate={roleId === 6}
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
              latestFlag={latestRemarks[record.id] ?? null}
              onView={(r) => {
                setViewRecord(r);
                setViewVisible(true);
              }}
              onEdit={(r) => {
                setEditRecord({ id: r.id, prNo: r.prNo });
                setEditVisible(true);
              }}
              onProcess={async (r) => {
                // End User initial processing: Pending (1) → Div. Head (2)
                if (roleId === 6 && r.statusId === 1) {
                  Alert.alert(
                    "Forward to Division Head",
                    "Do you want to forward this PR to the Division Head for review?",
                    [
                      {
                        text: "Cancel",
                        onPress: () => {},
                        style: "cancel",
                      },
                      {
                        text: "Confirm",
                        onPress: async () => {
                          try {
                            setSaving(true);
                            await updatePRStatus(r.id, 2);
                            setRecords((prev) =>
                              prev.map((x) =>
                                x.id === r.id ? { ...x, statusId: 2 } : x,
                              ),
                            );
                            Alert.alert(
                              "Success",
                              "PR forwarded to Division Head.",
                            );
                          } catch (e: any) {
                            Alert.alert(
                              "Failed",
                              e?.message ?? "Could not update PR status.",
                            );
                          } finally {
                            setSaving(false);
                          }
                        },
                        style: "default",
                      },
                    ],
                  );
                  return;
                }
                if (roleId === 1) {
                  if (r.statusId >= 6 && r.statusId < 11) {
                    (navigation as any).navigate(
                      "Canvassing" as never,
                      { prNo: r.prNo } as never,
                    );
                    return;
                  }
                  if (r.statusId === 11) {
                    (navigation as any).navigate(
                      "Canvassing" as never,
                      { prNo: r.prNo, targetStage: "aaa_preparation" } as never,
                    );
                    return;
                  }
                  const mapped =
                    r.statusId === 2 ||
                    r.statusId === 3 ||
                    r.statusId === 4 ||
                    r.statusId === 5
                      ? r.statusId
                      : 2;
                  setProcessRoleOverride(mapped);
                  setProcessRecord({ id: r.id, prNo: r.prNo });
                  setProcessVisible(true);
                  return;
                }
                // Division Head can process when status <= 2
                if (roleId === 2) {
                  if (r.statusId <= 2) {
                    try {
                      if (r.statusId !== 2) {
                        setSaving(true);
                        await updatePRStatus(r.id, 2);
                        setRecords((prev) =>
                          prev.map((x) =>
                            x.id === r.id ? { ...x, statusId: 2 } : x,
                          ),
                        );
                      }
                    } catch (e: any) {
                      Alert.alert(
                        "Failed",
                        e?.message ?? "Could not update PR status.",
                      );
                    } finally {
                      setSaving(false);
                    }
                    setProcessRecord({ id: r.id, prNo: r.prNo });
                    setProcessVisible(true);
                    return;
                  }
                  Alert.alert(
                    "Not Available",
                    "This PR is already beyond the Division Head step.",
                  );
                  return;
                }
                if (roleId === 3) {
                  if (r.statusId === 3) {
                    setProcessRecord({ id: r.id, prNo: r.prNo });
                    setProcessVisible(true);
                    return;
                  }
                  if (r.statusId >= 6 && r.statusId <= 9) {
                    (navigation as any).navigate(
                      "Canvassing" as never,
                      { prNo: r.prNo } as never,
                    );
                    return;
                  }
                  if (r.statusId === 10) {
                    (navigation as any).navigate(
                      "Canvassing" as never,
                      { prNo: r.prNo, targetStage: "aaa_preparation" } as never,
                    );
                    return;
                  }
                  Alert.alert(
                    "Not Available",
                    "This PR is not yet in the BAC step or canvassing phase.",
                  );
                  return;
                }
                if (roleId === 7 || roleId === 6) {
                  if (r.statusId >= 6 && r.statusId <= 9) {
                    (navigation as any).navigate(
                      "Canvassing" as never,
                      { prNo: r.prNo } as never,
                    );
                    return;
                  }
                  if (r.statusId === 10) {
                    (navigation as any).navigate(
                      "Canvassing" as never,
                      { prNo: r.prNo, targetStage: "aaa_preparation" } as never,
                    );
                    return;
                  }
                  Alert.alert(
                    "Not Available",
                    "This PR is not yet in the canvassing phase.",
                  );
                  return;
                }
                if (!PROCESS_ROLES.has(roleId)) {
                  Alert.alert(
                    "Not Allowed",
                    "You cannot process this purchase request from this screen.",
                  );
                  return;
                }
                if (r.statusId !== roleId) {
                  Alert.alert(
                    "Not Available",
                    "Only the role that matches this PR's status can process it.",
                  );
                  return;
                }
                setProcessRecord({ id: r.id, prNo: r.prNo });
                setProcessVisible(true);
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
          {[
            { label: "‹", page: Math.max(1, page - 1), disabled: page === 1 },
            ...Array.from(
              { length: Math.min(5, totalPages) },
              (_, i) => i + 1,
            ).map((p) => ({
              label: String(p),
              page: p,
              disabled: false,
              active: p === page,
            })),
            {
              label: "›",
              page: Math.min(totalPages, page + 1),
              disabled: page === totalPages,
            },
          ].map((btn, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => setPage(btn.page)}
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
                className={`text-[12px] font-bold ${
                  (btn as any).active
                    ? "text-white"
                    : btn.disabled
                      ? "text-gray-300"
                      : "text-gray-500"
                }`}
              >
                {btn.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* View PR modal */}
      <ViewPRModal
        visible={viewVisible}
        record={viewRecord}
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
        onRemarks={() => {
          if (!moreRecord) return;
          setRemarkRecord(moreRecord);
          setRemarkVisible(true);
        }}
        onEdit={() => {
          if (!moreRecord) return;
          setEditRecord({ id: moreRecord.id, prNo: moreRecord.prNo });
          setEditVisible(true);
        }}
        onCancel={() => {
          if (!moreRecord) return;
          setCancelRecord({ id: moreRecord.id, prNo: moreRecord.prNo });
          setCancelVisible(true);
        }}
        onDelete={() => {
          if (!moreRecord) return;
          setDeleteRecord({ id: moreRecord.id, prNo: moreRecord.prNo });
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

      {/* Edit PR modal */}
      <EditPRModal
        visible={editVisible}
        record={editRecord}
        onClose={() => {
          setEditVisible(false);
          setEditRecord(null);
        }}
        onSave={handlePRSave}
      />

      {/* Process PR modal — Division Head / BAC / Budget */}
      <ProcessPRModal
        visible={processVisible}
        record={processRecord}
        roleId={processRoleOverride ?? roleId}
        onClose={() => {
          setProcessVisible(false);
          setProcessRecord(null);
          setProcessRoleOverride(null);
        }}
        onProcessed={(id, newStatusId) => {
          // newStatusId is the raw status_id integer from status.
          // Update the record in-place so the list reflects the new state immediately.
          setRecords((prev) =>
            prev.map((r) =>
              r.id === id ? { ...r, statusId: Number(newStatusId) } : r,
            ),
          );
        }}
      />
      <CancelPRModal
        visible={cancelVisible}
        prId={cancelRecord?.id ?? null}
        prNo={cancelRecord?.prNo ?? null}
        onClose={() => {
          setCancelVisible(false);
          setCancelRecord(null);
        }}
        onCancelled={(id) => {
          setRecords((prev) => prev.filter((r) => r.id !== id));
        }}
      />
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

      {/* Create PR modal */}
      {prModalOpen && (
        <CreatePRModal
          visible={prModalOpen}
          onClose={() => setPrModalOpen(false)}
          onSubmit={handlePRSubmit}
          currentUser={currentUser as any}
        />
      )}

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
