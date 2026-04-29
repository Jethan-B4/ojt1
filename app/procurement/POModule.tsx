/**
 * POModule.tsx — Purchase Order Module
 *
 * Mirrors PRModule UI patterns exactly:
 *   - Status labels fetched from public.status (same fetchPOStatuses helper)
 *   - Latest remark / status-flag badge shown on each card
 *   - RecordCard: View | Process (primary) | ••• (Remarks · Edit · Cancel)
 *   - Edit is inside the ••• sheet, NOT a primary card button
 *   - Filter panel, pagination — identical shape to PRModule
 *   - Pull-to-refresh, saving overlay, empty state
 *
 * PO status lifecycle (public.status table) — full Phase 2:
 *   11 = PO (Creation)    ← every new PO starts here (Supply logs receipt)
 *   12 = PO (Allocation)  ← Supply assigns PO # and prepares document
 *   13 = ORS (Creation)   ← Budget prepares ORS
 *   14 = ORS (Processing) ← Budget officer signs; forwards to Accounting
 *   15 = PO (Accounting)  ← Accounting verifies document completeness
 *   16 = PO (PARPO)       ← PARPO II reviews and signs PO
 *   17 = PO (Serving)     ← Supply serves PO to suppliers
 *   34 = Completed (PO Phase)
 *
 * Role permissions:
 *   role_id 1  = Admin   — sees all, can process (override all statuses), can edit
 *   role_id 4  = Budget  — sees all, can process 13→14 and 14→15 (ORS), can edit ORS
 *   role_id 8  = Supply  — sees all, can create, can process 11→12→13 and 16→17, can edit ≤ 12
 *   All others           — view only
 */

import { assertOnline } from "@/lib/network";
import type { RemarkRow } from "@/lib/supabase-types";
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
import { ORSInlinePanel } from "../(components)/ORSModule";
import PORemarkSheet, { type PORemarkSheetRecord } from "../(components)/PORemarkSheet";
import DeletePOModal from "../(modals)/DeletePOModal";
import ViewPOModal from "../(modals)/ViewPOModal";
import {
  fetchLatestRemarkByPO,
  fetchPOStatuses,
  fetchPurchaseOrders,
  fetchPurchaseOrdersByDivision,
  type PORow,
} from "../../lib/supabase/po";
import { useAuth } from "../AuthContext";
import { useRealtime } from "../RealtimeContext";
import { useFiscalYear } from "../contexts/FiscalYearContext";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PORecord {
  id: string;
  poNo: string;
  prNo: string;
  /** purchase_orders.pr_id — UUID of the linked purchase_requests row, if any */
  prId: string | null;
  supplier: string;
  officeSection: string;
  totalAmount: number;
  statusId: number;
  date: string;
  updatedAt: string;
  createdAtMs: number;
  updatedAtMs: number;
  elapsedTime: string;
}

type SortBy = "date_created" | "date_modified";

type SubTab = "all" | "po" | "ors" | "serving";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Visual config keyed by status_id — mirrors public.status table.
 * Full Phase 2 lifecycle (statuses 11–17):
 *   11 = PO (Creation)    — Supply receives Abstract, logs receipt
 *   12 = PO (Allocation)  — Supply assigns PO # and prepares document
 *   13 = ORS (Creation)   — Budget prepares ORS and assigns ORS number
 *   14 = ORS (Processing) — Budget officer signs; forwards to Accounting
 *   15 = PO (Accounting)  — Accounting verifies document completeness
 *   16 = PO (PARPO)       — PARPO II reviews and signs PO
 *   17 = PO (Serving)     — Supply serves PO to suppliers
 *   34 = Completed (PO Phase)
 */
const PO_STATUS_CFG: Record<
  number,
  { bg: string; text: string; dot: string; label: string }
> = {
  11: {
    bg: "#f0fdfa",
    text: "#0f766e",
    dot: "#0d9488",
    label: "PO (Creation)",
  },
  12: {
    bg: "#faf5ff",
    text: "#6b21a8",
    dot: "#9333ea",
    label: "PO (Allocation)",
  },
  13: {
    bg: "#fff7ed",
    text: "#9a3412",
    dot: "#f97316",
    label: "ORS (Creation)",
  },
  14: {
    bg: "#eff6ff",
    text: "#1e40af",
    dot: "#3b82f6",
    label: "ORS (Processing)",
  },
  15: {
    bg: "#fefce8",
    text: "#854d0e",
    dot: "#ca8a04",
    label: "PO (Accounting)",
  },
  16: {
    bg: "#fdf4ff",
    text: "#86198f",
    dot: "#c026d3",
    label: "PO (PARPO)",
  },
  17: {
    bg: "#f0fdf4",
    text: "#166534",
    dot: "#16a34a",
    label: "PO (Serving)",
  },
  34: {
    bg: "#ecfdf5",
    text: "#14532d",
    dot: "#22c55e",
    label: "Completed (PO Phase)",
  },
};

function poCfgFor(id: number) {
  return (
    PO_STATUS_CFG[id] ?? {
      bg: "#f9fafb",
      text: "#6b7280",
      dot: "#9ca3af",
      label: `Status ${id}`,
    }
  );
}

// ORS inline panel is shown when PO reaches ORS (Creation) status (status_id 13)
const ORS_INLINE_STATUS = 13;

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_RANGE = Array.from({ length: 7 }, (_, i) => CURRENT_YEAR - 5 + i);
const PAGE_SIZE = 7;
const fmt = (n: number) =>
  n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// ─── Flag ID helpers (mirrors PRModule) ──────────────────────────────────────

type StatusFlag =
  | "complete"
  | "incomplete_info"
  | "wrong_information"
  | "needs_revision"
  | "on_hold"
  | "urgent";

const ID_TO_FLAG: Record<number, StatusFlag> = {
  2: "complete",
  3: "incomplete_info",
  4: "wrong_information",
  5: "needs_revision",
  6: "on_hold",
  7: "urgent",
};

function getFlagFromId(id: number | null): StatusFlag | null {
  return id ? (ID_TO_FLAG[id] ?? null) : null;
}

// Flag badge styling
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

// ─── Row → display record ─────────────────────────────────────────────────────

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
    prId: row.pr_id ?? null,
    supplier: row.supplier ?? "—",
    officeSection: row.office_section ?? "—",
    totalAmount: Number(row.total_amount) || 0,
    statusId: Number(row.status_id) || 12,
    date: created.toLocaleDateString("en-PH"),
    updatedAt: updated.toLocaleDateString("en-PH"),
    createdAtMs: created.getTime(),
    updatedAtMs: updated.getTime(),
    elapsedTime: elapsed,
  };
}

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "po", label: "Purchase Order" },
  { key: "ors", label: "ORS" },
  { key: "serving", label: "Serving" },
];

// ─── SubTabRow ────────────────────────────────────────────────────────────────

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

// ─── SearchBar ────────────────────────────────────────────────────────────────

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
        placeholder="Search PO, supplier, section…"
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

// ─── FilterChip ───────────────────────────────────────────────────────────────

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

// ─── FilterPanel ──────────────────────────────────────────────────────────────

const FilterPanel: React.FC<{
  visible: boolean;
  records: PORecord[];
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
      {/* Status */}
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

      {/* Section */}
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

      {/* Sort */}
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

// ─── StatusPill ───────────────────────────────────────────────────────────────

const StatusPill: React.FC<{
  statusId: number;
  label: string;
  elapsed: string;
}> = ({ statusId, label, elapsed }) => {
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

// ─── MoreSheet ────────────────────────────────────────────────────────────────

interface MoreSheetProps {
  visible: boolean;
  record: PORecord | null;
  roleId: number;
  onClose: () => void;
  onRemarks: (r: PORecord) => void;
  onViewDocuments: (r: PORecord) => void;
  /** Admin-only: open the Delete PO confirmation modal. */
  onDelete: (r: PORecord) => void;
}

const MoreSheet: React.FC<MoreSheetProps> = ({
  visible,
  record,
  roleId,
  onClose,
  onRemarks,
  onViewDocuments,
  onDelete,
}) => {
  if (!record) return null;
  const cfg = poCfgFor(record.statusId);

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
      sublabel: "Open PO PDF preview",
      color: "#1d4ed8",
      bg: "#eff6ff",
      onPress: () => {
        onClose();
        onViewDocuments(record);
      },
    },
    // Admin-only: Delete action
    ...(roleId === 1
      ? ([
          {
            icon: "delete-forever",
            label: "Delete PO",
            sublabel: "Permanently remove PO and linked records",
            color: "#7f1d1d",
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
        {/* Prevent tap-through on the sheet itself */}
        <TouchableOpacity activeOpacity={1}>
          <View
            className="bg-white rounded-t-3xl overflow-hidden"
            style={{ paddingBottom: 32 }}
          >
            {/* Drag handle */}
            <View className="items-center pt-3 pb-1">
              <View className="w-10 h-1 rounded-full bg-gray-200" />
            </View>

            {/* PO identity header */}
            <View className="px-5 pt-2 pb-4 border-b border-gray-100">
              <Text
                className="text-[15px] font-extrabold text-gray-900"
                style={{ fontFamily: MONO }}
              >
                {record.poNo}
              </Text>
              <Text
                className="text-[12px] text-gray-500 mt-0.5"
                numberOfLines={1}
              >
                {record.supplier}
              </Text>
              <View
                className="mt-2 self-start flex-row items-center gap-1.5 rounded-full px-2.5 py-1"
                style={{ backgroundColor: cfg.bg }}
              >
                <View
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: cfg.dot }}
                />
                <Text
                  className="text-[10.5px] font-bold"
                  style={{ color: cfg.text }}
                >
                  {cfg.label}
                </Text>
              </View>
            </View>

            {/* Action rows */}
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

            {/* Dismiss */}
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

// ─── RecordCard ───────────────────────────────────────────────────────────────

const RecordCard: React.FC<{
  record: PORecord;
  isEven: boolean;
  statuses: { id: number; status_name: string }[];
  latestFlag: RemarkRow | null;
  onView: (r: PORecord) => void;
  onMore: (r: PORecord) => void;
}> = ({ record, isEven, statuses, latestFlag, onView, onMore }) => {
  const statusLabel =
    statuses.find((s) => s.id === record.statusId)?.status_name ??
    poCfgFor(record.statusId).label;

  const flagKey = latestFlag?.status_flag_id
    ? getFlagFromId(latestFlag.status_flag_id)
    : null;
  const flag = flagKey ? STATUS_FLAGS[flagKey] : null;

  return (
    <View
      className={`mx-4 mb-3 rounded-3xl border border-gray-200 overflow-hidden shadow-sm ${isEven ? "bg-white" : "bg-gray-50"}`}
      style={{ elevation: 3 }}
    >
      {/* Top: PO no + status pill */}
      <View className="flex-row items-start justify-between px-4 pt-3.5 pb-2">
        <View className="flex-1 pr-3">
          <Text
            className="text-[13px] font-bold text-[#1a4d2e] mb-0.5"
            style={{ fontFamily: MONO }}
          >
            {record.poNo}
          </Text>
          <Text
            className="text-[12.5px] text-gray-700 leading-5"
            numberOfLines={2}
          >
            {record.supplier}
          </Text>
        </View>
        <StatusPill
          statusId={record.statusId}
          label={statusLabel}
          elapsed={record.elapsedTime}
        />
      </View>

      {/* Meta: section badge · date · amount */}
      <View className="h-px bg-gray-100 mx-4" />
      <View className="flex-row items-center gap-3 px-4 py-2.5">
        <View className="bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5">
          <Text
            className="text-[10.5px] font-bold text-emerald-700"
            numberOfLines={1}
          >
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
        <Text className="text-[12.5px] font-bold text-gray-700">
          ₱<Text style={{ fontFamily: MONO }}>{fmt(record.totalAmount)}</Text>
        </Text>
      </View>

      {/* Latest status flag from remarks — mirrors PRModule */}
      {flag && (
        <>
          <View className="h-px bg-gray-100 mx-4" />
          <View className="flex-row items-center gap-2 px-4 py-2">
            <View
              className="flex-row items-center gap-1.5 rounded-full px-2 py-0.5 border"
              style={{ backgroundColor: flag.bg, borderColor: flag.dot + "40" }}
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

      {/* Action buttons */}
      <View className="h-px bg-gray-100 mx-4" />
      <View className="flex-row items-center gap-2 px-4 py-2.5">
        {/* View — always shown */}
        <TouchableOpacity
          onPress={() => onView(record)}
          activeOpacity={0.8}
          className="flex-1 bg-blue-600 rounded-xl py-2 items-center"
        >
          <Text className="text-white text-[12px] font-bold">View</Text>
        </TouchableOpacity>

        {/* More — always shown */}
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

// ─── EmptyState ───────────────────────────────────────────────────────────────

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
  <View className="flex-1 items-center justify-center py-24 px-8">
    <MaterialIcons name="receipt-long" size={44} color="#d1d5db" />
    <Text className="text-[16px] font-bold text-gray-600 mb-2 text-center">
      {label}
    </Text>
    <Text className="text-[13px] text-gray-400 text-center leading-5 max-w-[240px]">
      No records here yet.
    </Text>
  </View>
);

// ─── Pagination ───────────────────────────────────────────────────────────────

const Pagination: React.FC<{
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
}> = ({ page, totalPages, total, onPage }) => {
  type PageBtn =
    | { kind: "prev" | "next"; page: number; disabled: boolean }
    | { kind: "page"; page: number; active: boolean; disabled: false };

  const windowSize = 5;
  const start = Math.max(
    1,
    Math.min(page - Math.floor(windowSize / 2), totalPages - windowSize + 1),
  );
  const end = Math.min(totalPages, start + windowSize - 1);

  const buttons: PageBtn[] = [
    { kind: "prev", page: Math.max(1, page - 1), disabled: page === 1 },
    ...Array.from({ length: end - start + 1 }, (_, i) => {
      const p = start + i;
      return {
        kind: "page",
        page: p,
        active: p === page,
        disabled: false,
      } as const;
    }),
    {
      kind: "next",
      page: Math.min(totalPages, page + 1),
      disabled: page === totalPages,
    },
  ];

  return (
    <View className="flex-row items-center justify-between px-4 py-3 bg-white border-t border-gray-100">
      <Text className="text-[12px] text-gray-400">
        <Text className="font-semibold text-gray-600">{total}</Text> records
      </Text>
      <View className="flex-row items-center gap-1.5">
        {buttons.map((btn) => {
          const isActive = btn.kind === "page" && btn.active;
          return (
            <TouchableOpacity
              key={`${btn.kind}-${btn.page}`}
              onPress={() => onPage(btn.page)}
              disabled={btn.disabled}
              activeOpacity={0.8}
              className={`w-8 h-8 rounded-lg items-center justify-center border ${
                isActive
                  ? "bg-[#064E3B] border-[#064E3B]"
                  : btn.disabled
                    ? "bg-gray-50 border-gray-100"
                    : "bg-white border-gray-200"
              }`}
            >
              {btn.kind === "prev" ? (
                <MaterialIcons
                  name="chevron-left"
                  size={18}
                  color={btn.disabled ? "#d1d5db" : "#6b7280"}
                />
              ) : btn.kind === "next" ? (
                <MaterialIcons
                  name="chevron-right"
                  size={18}
                  color={btn.disabled ? "#d1d5db" : "#6b7280"}
                />
              ) : (
                <Text
                  className={`text-[12px] font-bold ${
                    isActive
                      ? "text-white"
                      : btn.disabled
                        ? "text-gray-300"
                        : "text-gray-500"
                  }`}
                >
                  {btn.page}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

// ─── POModule ─────────────────────────────────────────────────────────────────

export default function POModule() {
  const { currentUser } = useAuth();
  const roleId = currentUser?.role_id ?? 0;
  const { tick } = useRealtime();
  const { year, setYearPickerOpen, yearPickerOpen } = useFiscalYear();

  const [activeSubTab, setActiveSubTab] = useState<SubTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("date_created");
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
    const [records, setRecords] = useState<PORecord[]>([]);

  // Status rows fetched from public.status — labels come from DB, not hardcoded
  const [statuses, setStatuses] = useState<
    { id: number; status_name: string }[]
  >([]);

  // Latest remark per PO id — for status-flag badges on cards
  const [latestRemarks, setLatestRemarks] = useState<
    Record<string, RemarkRow | null>
  >({});

  const [refreshing, setRefreshing] = useState(false);

  // ── Modal state ────────────────────────────────────────────────────────────

  const [viewRecord, setViewRecord] = useState<PORecord | null>(null);
  const [viewVisible, setViewVisible] = useState(false);
  const [viewInitialTab, setViewInitialTab] = useState<
    "details" | "po" | "ors"
  >("details");

  const [moreRecord, setMoreRecord] = useState<PORecord | null>(null);
  const [moreVisible, setMoreVisible] = useState(false);

  // PORemarkSheet state
  const [remarkRecord, setRemarkRecord] = useState<PORemarkSheetRecord | null>(
    null,
  );
  const [remarkVisible, setRemarkVisible] = useState(false);

  const [deletePoId, setDeletePoId] = useState<string | null>(null);
  const [deletePoNo, setDeletePoNo] = useState<string | null>(null);
  const [deleteVisible, setDeleteVisible] = useState(false);

  // ── Permissions ────────────────────────────────────────────────────────────

  // Roles that can see every PO regardless of division
  const canSeeAll = roleId === 1 || [3, 4, 5, 6, 8].includes(roleId);

  // Budget (4) and Admin (1) can edit ORS entries in the inline panel
  const canEditOrs = roleId === 1 || roleId === 4;

  // ── One-time lookups ───────────────────────────────────────────────────────

  useEffect(() => {
    fetchPOStatuses()
      .then(setStatuses)
      .catch(() => {}); // non-fatal; falls back to "Status N"
  }, []);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadPOs = useCallback(async () => {
    try {
      await assertOnline("load POs");
      // Fetch the full dataset once — subtab filtering is done client-side by status_id range.
      const allRows: PORow[] = canSeeAll
        ? await fetchPurchaseOrders()
        : await fetchPurchaseOrdersByDivision(currentUser?.division_id ?? -1);

      let rows: PORow[];
      if (activeSubTab === "all") {
        rows = allRows;
      } else if (activeSubTab === "po") {
        // Purchase Order: status_id 11–12 (PO Creation, PO Allocation)
        rows = allRows.filter(
          (r) => r.status_id !== null && r.status_id >= 11 && r.status_id <= 12,
        );
      } else if (activeSubTab === "ors") {
        // ORS: status_id 13–14 (ORS Creation, ORS Processing)
        rows = allRows.filter(
          (r) => r.status_id !== null && r.status_id >= 13 && r.status_id <= 14,
        );
      } else if (activeSubTab === "serving") {
        // Serving pipeline through PO phase completion (status 34)
        rows = allRows.filter(
          (r) =>
            r.status_id !== null &&
            ((r.status_id >= 15 && r.status_id <= 17) || r.status_id === 34),
        );
      } else {
        rows = allRows;
      }

      // Filter by fiscal year (based on created_at timestamp)
      rows = rows.filter((r) => {
        if (!r.created_at) return false;
        const createdYear = new Date(r.created_at).getFullYear();
        return createdYear === year;
      });

      setRecords(rows.map(rowToPORecord));

      // Fetch latest remark for each PO in parallel (non-blocking, for flag badges)
      const remarkEntries = await Promise.all(
        rows.map(async (r) => {
          const remark = await fetchLatestRemarkByPO(String(r.id)).catch(
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
  }, [canSeeAll, activeSubTab, currentUser?.division_id, year]);

  useEffect(() => {
    loadPOs();
  }, [loadPOs, tick]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPOs();
    setRefreshing(false);
  }, [loadPOs]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  /** Remove the deleted PO from the local list immediately. */
  const handlePODeleted = useCallback((id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
    setPage(1);
  }, []);

  // ── Derived list ──────────────────────────────────────────────────────────

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
      return matchSearch && matchSection && matchStatus;
    })
    .sort((a, b) => {
      if (sortBy === "date_modified") {
        const d = b.updatedAtMs - a.updatedAtMs;
        return d !== 0 ? d : b.statusId - a.statusId;
      }
      return b.createdAtMs - a.createdAtMs;
    });

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View className="flex-1 bg-gray-50">
      
      {/* Subtab navigation */}
      <SubTabRow
        active={activeSubTab}
        onSelect={(tab) => {
          setActiveSubTab(tab);
          setPage(1);
          setStatusFilter(null);
          setSectionFilter("All");
          setSearchQuery("");
          setFilterOpen(false);
        }}
      />

      {/* Search + filter toggle + create button */}
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

      {/* Collapsible filter panel */}
      <FilterPanel
        visible={filterOpen}
        records={records}
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

      {/* Record list */}
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
            return (
              <React.Fragment key={record.id}>
                <RecordCard
                  record={record}
                  isEven={idx % 2 === 0}
                  statuses={statuses}
                  latestFlag={latestRemarks[record.id] ?? null}
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
                {/* ORS inline panel — appears contextually at status 13 */}
                {record.statusId === ORS_INLINE_STATUS && (
                  <ORSInlinePanel
                    poId={record.id}
                    prNo={record.prNo}
                    prId={record.prId}
                    totalAmount={record.totalAmount}
                    canEdit={canEditOrs}
                    currentUserId={currentUser?.id}
                  />
                )}
              </React.Fragment>
            );
          })
        )}
      </ScrollView>

      {/* Pagination */}
      <Pagination
        page={page}
        totalPages={totalPages}
        total={filtered.length}
        onPage={setPage}
      />

      {/* ── Modals ────────────────────────────────────────────────────────── */}

      <ViewPOModal
        visible={viewVisible}
        record={viewRecord}
        initialTab={viewInitialTab}
        onClose={() => {
          setViewVisible(false);
          setViewRecord(null);
        }}
      />

      {/* MoreSheet — Remarks + Delete */}
      <MoreSheet
        visible={moreVisible}
        record={moreRecord}
        roleId={roleId}
        onClose={() => {
          setMoreVisible(false);
          setMoreRecord(null);
        }}
        onRemarks={(r) => {
          setRemarkRecord({
            id: r.id,
            poNo: r.poNo,
            prNo: r.prNo,
            linkedPrId: r.prId,
            supplier: r.supplier,
          });
          setRemarkVisible(true);
        }}
        onViewDocuments={(r) => {
          setViewRecord(r);
          const isOrs = r.statusId >= 13 && r.statusId <= 15;
          setViewInitialTab(isOrs ? "ors" : "po");
          setViewVisible(true);
        }}
        onDelete={(r) => {
          setDeletePoId(r.id);
          setDeletePoNo(r.poNo);
          setDeleteVisible(true);
        }}
      />

      {/* PORemarkSheet — unified PO + linked PR remarks */}
      <PORemarkSheet
        visible={remarkVisible}
        record={remarkRecord}
        currentUser={currentUser}
        onClose={() => {
          setRemarkVisible(false);
          setRemarkRecord(null);
        }}
      />

      <DeletePOModal
        visible={deleteVisible}
        poId={deletePoId}
        poNo={deletePoNo}
        onClose={() => {
          setDeleteVisible(false);
          setDeletePoId(null);
          setDeletePoNo(null);
        }}
        onDeleted={(id) => {
          handlePODeleted(id);
          setDeleteVisible(false);
          setDeletePoId(null);
          setDeletePoNo(null);
        }}
      />

      {/* Saving overlay
      {saving && (
        <View className="absolute inset-0 bg-black/20 items-center justify-center">
          <View className="bg-white rounded-2xl px-6 py-4">
            <Text className="text-[14px] font-semibold text-gray-700">
              Saving…
            </Text>
          </View>
        </View>
      )} */}

          </View>
  );
}
