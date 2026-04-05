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
 * PO status lifecycle (public.status table):
 *   12 = PO (Reception)   ← every new PO starts here
 *   13 = PO (Create)
 *   14 = ORS Processing
 *
 * Role permissions:
 *   role_id 1  = Admin   — sees all, can process (override), can edit
 *   role_id 8  = Supply  — sees all, can create, can process 12→13, can edit ≤ 13
 *   All others           — view only
 */

import type { RemarkRow } from "@/lib/supabase-types";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
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
import { ORSInlinePanel } from "../(components)/ORSModule";
import CreatePOModal, { type POCreatePayload } from "../(modals)/CreatePOModal";
import EditPOModal, {
  type POEditPayload,
  type POEditRecord,
} from "../(modals)/EditPOModal";
import ProcessPOModal, {
  STATUS_FLAGS,
  canRoleProcessPO,
  type ProcessPORecord,
  type StatusFlag,
} from "../(modals)/ProcessPOModal";
import ViewPOModal from "../(modals)/ViewPOModal";
import {
  fetchLatestRemarkByPO,
  fetchPOStatuses,
  fetchPurchaseOrders,
  fetchPurchaseOrdersByDivision,
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

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Visual config keyed by status_id — mirrors public.status table.
 * PO lifecycle starts at 12 (PO Reception).
 *   12 = PO (Reception)
 *   13 = PO (Create)
 *   14 = ORS Processing
 */
const PO_STATUS_CFG: Record<
  number,
  { bg: string; text: string; dot: string; label: string }
> = {
  12: {
    bg: "#f0fdfa",
    text: "#0f766e",
    dot: "#0d9488",
    label: "PO (Reception)",
  },
  13: { bg: "#faf5ff", text: "#6b21a8", dot: "#9333ea", label: "PO (Create)" },
  14: {
    bg: "#fff7ed",
    text: "#9a3412",
    dot: "#f97316",
    label: "ORS Processing",
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

// ORS inline panel is shown when PO reaches ORS Processing (status_id 14)
const ORS_INLINE_STATUS = 14;

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const PAGE_SIZE = 7;
const fmt = (n: number) =>
  n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// ─── Flag ID helpers (mirrors PRModule) ──────────────────────────────────────

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
    supplier: row.supplier ?? "—",
    officeSection: row.office_section ?? "—",
    totalAmount: Number(row.total_amount) || 0,
    statusId: Number(row.status_id) || 12,
    date: created.toLocaleDateString("en-PH"),
    updatedAt: updated.toLocaleDateString("en-PH"),
    elapsedTime: elapsed,
  };
}

// ─── SearchBar ────────────────────────────────────────────────────────────────

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
  canEdit: boolean;
  onClose: () => void;
  onRemarks: () => void;
  onEdit: () => void;
}

const MoreSheet: React.FC<MoreSheetProps> = ({
  visible,
  record,
  canEdit,
  onClose,
  onRemarks,
  onEdit,
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
        onRemarks();
      },
    },
    ...(canEdit
      ? ([
          {
            icon: "edit",
            label: "Edit PO",
            sublabel: "Modify PO details and line items",
            color: "#b45309",
            bg: "#fffbeb",
            onPress: () => {
              onClose();
              onEdit();
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
  roleId: number;
  statuses: { id: number; status_name: string }[];
  latestFlag: RemarkRow | null;
  canProcess: boolean;
  onView: (r: PORecord) => void;
  onProcess: (r: PORecord) => void;
  onMore: (r: PORecord) => void;
}> = ({
  record,
  isEven,
  statuses,
  latestFlag,
  canProcess,
  onView,
  onProcess,
  onMore,
}) => {
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
        <Text
          className="text-[12.5px] font-bold text-gray-700"
          style={{ fontFamily: MONO }}
        >
          ₱{fmt(record.totalAmount)}
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

        {/* Process — primary action; locked when role cannot advance this status */}
        {canProcess ? (
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

        {/* ••• sheet — Remarks + Edit (role-gated) */}
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

// ─── EmptyState ───────────────────────────────────────────────────────────────

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

// ─── Pagination ───────────────────────────────────────────────────────────────

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
);

// ─── POModule ─────────────────────────────────────────────────────────────────

export default function POModule() {
  const { currentUser } = useAuth();
  const roleId = currentUser?.role_id ?? 0;

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
  const [saving, setSaving] = useState(false);

  // ── Modal state ────────────────────────────────────────────────────────────

  const [viewRecord, setViewRecord] = useState<PORecord | null>(null);
  const [viewVisible, setViewVisible] = useState(false);

  const [createVisible, setCreateVisible] = useState(false);

  const [editRecord, setEditRecord] = useState<POEditRecord | null>(null);
  const [editVisible, setEditVisible] = useState(false);

  const [processRecord, setProcessRecord] = useState<ProcessPORecord | null>(
    null,
  );
  const [processVisible, setProcessVisible] = useState(false);

  const [moreRecord, setMoreRecord] = useState<PORecord | null>(null);
  const [moreVisible, setMoreVisible] = useState(false);

  // ── Permissions ────────────────────────────────────────────────────────────

  // Roles that can see every PO regardless of division
  const canSeeAll = roleId === 1 || [3, 4, 5, 6, 8].includes(roleId);

  // Only Supply (8) can create new POs
  const canCreate = roleId === 8;

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
      const rows: PORow[] = canSeeAll
        ? await fetchPurchaseOrders()
        : await fetchPurchaseOrdersByDivision(currentUser?.division_id ?? -1);
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

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handlePOCreated = useCallback((row: POCreatePayload) => {
    setRecords((prev) => [rowToPORecord(row), ...prev]);
    setPage(1);
  }, []);

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

  const handlePOProcessed = useCallback((id: string, newStatusId: number) => {
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, statusId: newStatusId } : r)),
    );
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
        const d = b.updatedAt.localeCompare(a.updatedAt);
        return d !== 0 ? d : b.statusId - a.statusId;
      }
      return b.date.localeCompare(a.date);
    });

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View className="flex-1 bg-gray-50">
      {/* Search + filter toggle + create button */}
      <SearchBar
        value={searchQuery}
        onChange={(t) => {
          setSearchQuery(t);
          setPage(1);
        }}
        onCreatePress={() => setCreateVisible(true)}
        canCreate={canCreate}
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
            const canProcess = canRoleProcessPO(roleId, record.statusId);

            return (
              <React.Fragment key={record.id}>
                <RecordCard
                  record={record}
                  isEven={idx % 2 === 0}
                  roleId={roleId}
                  statuses={statuses}
                  latestFlag={latestRemarks[record.id] ?? null}
                  canProcess={canProcess}
                  onView={(r) => {
                    setViewRecord(r);
                    setViewVisible(true);
                  }}
                  onProcess={(r) => {
                    setProcessRecord({
                      id: r.id,
                      poNo: r.poNo,
                      statusId: r.statusId,
                    });
                    setProcessVisible(true);
                  }}
                  onMore={(r) => {
                    setMoreRecord(r);
                    setMoreVisible(true);
                  }}
                />
                {/* ORS inline panel — appears contextually at status 14 */}
                {record.statusId === ORS_INLINE_STATUS && (
                  <ORSInlinePanel
                    prNo={record.prNo}
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
        onClose={() => {
          setViewVisible(false);
          setViewRecord(null);
        }}
      />

      <CreatePOModal
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
        onCreated={handlePOCreated}
        divisionId={currentUser?.division_id ?? null}
      />

      <EditPOModal
        visible={editVisible}
        record={editRecord}
        onClose={() => {
          setEditVisible(false);
          setEditRecord(null);
        }}
        onSave={handlePOSave}
      />

      <ProcessPOModal
        visible={processVisible}
        record={processRecord}
        roleId={roleId}
        onClose={() => {
          setProcessVisible(false);
          setProcessRecord(null);
        }}
        onProcessed={handlePOProcessed}
      />

      {/* MoreSheet — Remarks + Edit (role-gated) */}
      <MoreSheet
        visible={moreVisible}
        record={moreRecord}
        canEdit={
          moreRecord
            ? (roleId === 8 && moreRecord.statusId <= 13) || roleId === 1
            : false
        }
        onClose={() => {
          setMoreVisible(false);
          setMoreRecord(null);
        }}
        onRemarks={() => {
          // TODO: wire to your RemarkSheet component the same way PRModule does:
          // setRemarkRecord(moreRecord); setRemarkVisible(true);
          Alert.alert("Remarks", `Opening remarks for ${moreRecord?.poNo}`);
        }}
        onEdit={() => {
          if (moreRecord) {
            setEditRecord({ id: moreRecord.id, poNo: moreRecord.poNo });
            setEditVisible(true);
          }
        }}
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
