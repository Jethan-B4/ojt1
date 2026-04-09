/**
 * DeliveryModule.tsx — Delivery & Inspection Module
 *
 * Mirrors PRModule / POModule UI patterns:
 *   - Sub-tabs: Deliveries | Inspection (IAR) | Acceptance (LOA / DV)
 *   - SearchBar, FilterPanel, FilterChip, RecordCard, Pagination — identical shape
 *   - StatusPill with colour-coded lifecycle badges
 *   - Pull-to-refresh, saving overlay, empty state
 *
 * Delivery status lifecycle (public.status table — Phase 3):
 *   16 = Awaiting Delivery   ← PO served; waiting for supplier
 *   17 = Delivery Received   ← Supplier gives DR / SOA to Supply
 *   18 = IAR Preparation     ← Supply prepares IAR for numbering
 *   19 = IAR Signing         ← Inspectors sign IAR
 *   20 = LOA / DV Prep       ← Supply prepares Letter of Acceptance + DV
 *   21 = Division Signature  ← LOA / DV forwarded to Division Chief
 *   22 = COA Submission      ← Photocopied attachments submitted to COA
 *
 * Role permissions (mirrors PO pattern):
 *   role_id 1  = Admin   — sees all, can process any step, can edit
 *   role_id 8  = Supply  — primary actor: creates, processes 16→17→18→20→22
 *   role_id 9  = Inspector — signs IAR (step 19)
 *   role_id 2  = Division Head — signs LOA / DV (step 21)
 *   All others — view only
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useEffect, useState } from "react";
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type SubTab = "deliveries" | "inspection" | "acceptance";

export interface DeliveryRecord {
  id: string;
  /** Delivery reference number */
  deliveryNo: string;
  /** Linked PO number */
  poNo: string;
  /** Supplier name */
  supplier: string;
  /** Office / division section */
  officeSection: string;
  /** IAR number once assigned */
  iarNo: string | null;
  /** DV number once prepared */
  dvNo: string | null;
  statusId: number;
  date: string;
  updatedAt: string;
  elapsedTime: string;
}

type SortBy = "date_created" | "date_modified";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Visual config keyed by status_id — Phase 3 lifecycle.
 *   16 = Awaiting Delivery
 *   17 = Delivery Received
 *   18 = IAR Preparation
 *   19 = IAR Signing
 *   20 = LOA / DV Preparation
 *   21 = Division Signature
 *   22 = COA Submission
 */
const DELIVERY_STATUS_CFG: Record<
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
  19: {
    bg: "#faf5ff",
    text: "#6b21a8",
    dot: "#9333ea",
    label: "IAR Signing",
  },
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

function deliveryCfgFor(id: number) {
  return (
    DELIVERY_STATUS_CFG[id] ?? {
      bg: "#f9fafb",
      text: "#6b7280",
      dot: "#9ca3af",
      label: `Status ${id}`,
    }
  );
}

/** Which statuses appear under each sub-tab */
const SUB_TAB_STATUS_MAP: Record<SubTab, number[]> = {
  deliveries: [16, 17],
  inspection: [18, 19],
  acceptance: [20, 21, 22],
};

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "deliveries", label: "Deliveries" },
  { key: "inspection", label: "Inspection (IAR)" },
  { key: "acceptance", label: "Acceptance (LOA/DV)" },
];

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const PAGE_SIZE = 7;

// ─── Role helpers ─────────────────────────────────────────────────────────────

/** Returns true when the given role can process a delivery at statusId. */
function canRoleProcessDelivery(roleId: number, statusId: number): boolean {
  if (roleId === 1) return true; // Admin — always
  if (roleId === 8) return [16, 17, 18, 20].includes(statusId); // Supply
  if (roleId === 9) return statusId === 19; // Inspector
  if (roleId === 2) return statusId === 21; // Division Head
  return false;
}

/** Returns true when the given role can create a delivery record. */
function canRoleCreate(roleId: number): boolean {
  return roleId === 1 || roleId === 8;
}

// ─── Mock data (replace with Supabase fetch) ─────────────────────────────────

const MOCK_RECORDS: DeliveryRecord[] = [
  {
    id: "d-001",
    deliveryNo: "DEL-2025-001",
    poNo: "PO-2025-042",
    supplier: "ABC Office Supplies Inc.",
    officeSection: "STOD",
    iarNo: null,
    dvNo: null,
    statusId: 16,
    date: "Apr 5, 2025",
    updatedAt: "Apr 5, 2025",
    elapsedTime: "2 days",
  },
  {
    id: "d-002",
    deliveryNo: "DEL-2025-002",
    poNo: "PO-2025-038",
    supplier: "XYZ Technology Corp.",
    officeSection: "ARBDSP",
    iarNo: "IAR-2025-015",
    dvNo: null,
    statusId: 19,
    date: "Apr 3, 2025",
    updatedAt: "Apr 7, 2025",
    elapsedTime: "4 days",
  },
  {
    id: "d-003",
    deliveryNo: "DEL-2025-003",
    poNo: "PO-2025-031",
    supplier: "Metro Print Solutions",
    officeSection: "DARAB",
    iarNo: "IAR-2025-010",
    dvNo: "DV-2025-007",
    statusId: 22,
    date: "Mar 28, 2025",
    updatedAt: "Apr 8, 2025",
    elapsedTime: "11 days",
  },
  {
    id: "d-004",
    deliveryNo: "DEL-2025-004",
    poNo: "PO-2025-045",
    supplier: "Reliable Goods Trading",
    officeSection: "STOD",
    iarNo: null,
    dvNo: null,
    statusId: 17,
    date: "Apr 7, 2025",
    updatedAt: "Apr 7, 2025",
    elapsedTime: "1 day",
  },
  {
    id: "d-005",
    deliveryNo: "DEL-2025-005",
    poNo: "PO-2025-039",
    supplier: "Premier Equipment Corp.",
    officeSection: "LEGAL",
    iarNo: "IAR-2025-016",
    dvNo: "DV-2025-008",
    statusId: 20,
    date: "Apr 1, 2025",
    updatedAt: "Apr 8, 2025",
    elapsedTime: "7 days",
  },
];

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
        placeholder="Search delivery, PO, supplier…"
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
          const c = deliveryCfgFor(sid);
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
  elapsed: string;
}> = ({ statusId, elapsed }) => {
  const cfg = deliveryCfgFor(statusId);
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

/** Step indicator badge shown on cards — maps status to the swimlane step number */
const STEP_MAP: Record<number, string> = {
  16: "Step 24",
  17: "Step 25–26",
  18: "Step 27",
  19: "Step 28",
  20: "Step 29",
  21: "Step 30",
  22: "Step 31",
};

const RecordCard: React.FC<{
  record: DeliveryRecord;
  isEven: boolean;
  roleId: number;
  canProcess: boolean;
  onView: (r: DeliveryRecord) => void;
  onProcess: (r: DeliveryRecord) => void;
  onMore: (r: DeliveryRecord) => void;
}> = ({ record, isEven, roleId, canProcess, onView, onProcess, onMore }) => {
  const stepLabel = STEP_MAP[record.statusId] ?? "";

  return (
    <View
      className="mx-3 mb-2.5 rounded-2xl border border-gray-100 overflow-hidden"
      style={{ backgroundColor: isEven ? "#ffffff" : "#fafafa" }}
    >
      {/* Card header */}
      <View className="flex-row items-start justify-between px-4 pt-4 pb-2">
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-2">
            <Text
              className="text-[14px] font-extrabold text-gray-800"
              style={{ fontFamily: MONO }}
            >
              {record.deliveryNo}
            </Text>
            {stepLabel ? (
              <View className="bg-gray-100 rounded-md px-1.5 py-0.5">
                <Text className="text-[9.5px] font-bold text-gray-400">
                  {stepLabel}
                </Text>
              </View>
            ) : null}
          </View>
          <Text className="text-[11.5px] text-gray-500 font-semibold">
            PO:{" "}
            <Text
              className="text-gray-700 font-bold"
              style={{ fontFamily: MONO }}
            >
              {record.poNo}
            </Text>
          </Text>
        </View>
        <StatusPill statusId={record.statusId} elapsed={record.elapsedTime} />
      </View>

      {/* Metadata row */}
      <View className="flex-row flex-wrap gap-x-4 gap-y-1 px-4 pb-3">
        <View className="flex-row items-center gap-1">
          <MaterialIcons name="store" size={12} color="#9ca3af" />
          <Text className="text-[11.5px] text-gray-600" numberOfLines={1}>
            {record.supplier}
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <MaterialIcons name="apartment" size={12} color="#9ca3af" />
          <Text className="text-[11.5px] text-gray-500">
            {record.officeSection}
          </Text>
        </View>
        {record.iarNo && (
          <View className="flex-row items-center gap-1">
            <MaterialIcons name="assignment" size={12} color="#9ca3af" />
            <Text
              className="text-[11.5px] text-gray-500"
              style={{ fontFamily: MONO }}
            >
              {record.iarNo}
            </Text>
          </View>
        )}
        {record.dvNo && (
          <View className="flex-row items-center gap-1">
            <MaterialIcons name="receipt-long" size={12} color="#9ca3af" />
            <Text
              className="text-[11.5px] text-gray-500"
              style={{ fontFamily: MONO }}
            >
              {record.dvNo}
            </Text>
          </View>
        )}
      </View>

      {/* Divider */}
      <View className="h-px bg-gray-100 mx-4" />

      {/* Action row */}
      <View className="flex-row items-center px-3 py-2.5 gap-2">
        {/* Date */}
        <View className="flex-row items-center gap-1 flex-1">
          <MaterialIcons name="calendar-today" size={11} color="#d1d5db" />
          <Text className="text-[10.5px] text-gray-400">{record.date}</Text>
        </View>

        {/* View */}
        <TouchableOpacity
          onPress={() => onView(record)}
          activeOpacity={0.8}
          className="flex-row items-center gap-1 px-3 py-1.5 rounded-xl bg-gray-100 border border-gray-200"
        >
          <MaterialIcons name="visibility" size={14} color="#6b7280" />
          <Text className="text-[12px] font-semibold text-gray-600">View</Text>
        </TouchableOpacity>

        {/* Process */}
        {canProcess && (
          <TouchableOpacity
            onPress={() => onProcess(record)}
            activeOpacity={0.8}
            className="flex-row items-center gap-1 px-3 py-1.5 rounded-xl bg-[#064E3B]"
          >
            <MaterialIcons name="arrow-forward" size={14} color="#ffffff" />
            <Text className="text-[12px] font-semibold text-white">
              Process
            </Text>
          </TouchableOpacity>
        )}

        {/* More */}
        <TouchableOpacity
          onPress={() => onMore(record)}
          activeOpacity={0.8}
          className="w-8 h-8 rounded-xl items-center justify-center bg-gray-100 border border-gray-200"
        >
          <MaterialIcons name="more-horiz" size={18} color="#6b7280" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
  <View className="items-center justify-center py-20 gap-3">
    <View className="w-16 h-16 rounded-2xl bg-gray-100 items-center justify-center">
      <MaterialIcons name="local-shipping" size={30} color="#d1d5db" />
    </View>
    <Text className="text-[14px] font-bold text-gray-400">{label}</Text>
    <Text className="text-[12px] text-gray-300 text-center max-w-[220px]">
      No delivery records match the current filter.
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
        { label: "prev", page: Math.max(1, page - 1), disabled: page === 1 },
        ...Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map(
          (p) => ({
            label: String(p),
            page: p,
            disabled: false,
            active: p === page,
          }),
        ),
        {
          label: "next",
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
          {btn.label === "prev" ? (
            <MaterialIcons
              name="chevron-left"
              size={18}
              color={
                (btn as any).active
                  ? "#ffffff"
                  : btn.disabled
                    ? "#d1d5db"
                    : "#6b7280"
              }
            />
          ) : btn.label === "next" ? (
            <MaterialIcons
              name="chevron-right"
              size={18}
              color={
                (btn as any).active
                  ? "#ffffff"
                  : btn.disabled
                    ? "#d1d5db"
                    : "#6b7280"
              }
            />
          ) : (
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
          )}
        </TouchableOpacity>
      ))}
    </View>
  </View>
);

// ─── Phase progress banner ────────────────────────────────────────────────────

/** Compact swimlane progress strip shown at top of each sub-tab */
const PhaseBanner: React.FC<{ subTab: SubTab }> = ({ subTab }) => {
  const steps: Record<
    SubTab,
    { icon: keyof typeof MaterialIcons.glyphMap; label: string }[]
  > = {
    deliveries: [
      { icon: "local-shipping", label: "Awaiting" },
      { icon: "inventory", label: "Received" },
    ],
    inspection: [
      { icon: "assignment", label: "IAR Prep" },
      { icon: "draw", label: "IAR Sign" },
    ],
    acceptance: [
      { icon: "description", label: "LOA/DV" },
      { icon: "how-to-reg", label: "Div. Sign" },
      { icon: "send", label: "COA Sub." },
    ],
  };

  const current = steps[subTab];

  return (
    <View className="mx-3 my-2 bg-white rounded-2xl border border-gray-100 px-4 py-3">
      <Text className="text-[9.5px] font-bold uppercase tracking-widest text-gray-400 mb-2">
        {subTab === "deliveries"
          ? "Phase 3 · Order & Delivery"
          : subTab === "inspection"
            ? "Phase 3 · Inspection"
            : "Phase 3 · Acceptance"}
      </Text>
      <View className="flex-row items-center gap-1">
        {current.map((step, idx) => (
          <React.Fragment key={idx}>
            <View className="items-center gap-1">
              <View className="w-8 h-8 rounded-lg bg-[#064E3B]/10 items-center justify-center">
                <MaterialIcons name={step.icon} size={15} color="#064E3B" />
              </View>
              <Text
                className="text-[9px] font-semibold text-gray-500 text-center w-12"
                numberOfLines={1}
              >
                {step.label}
              </Text>
            </View>
            {idx < current.length - 1 && (
              <View className="flex-1 h-px bg-gray-200 mb-3" />
            )}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function DeliveryModule() {
  const { currentUser } = useAuth();
  const roleId: number = (currentUser as any)?.role_id ?? 0;

  const [subTab, setSubTab] = useState<SubTab>("deliveries");
  const [records, setRecords] = useState<DeliveryRecord[]>(MOCK_RECORDS);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<number | null>(null);
  const [sectionFilter, setSectionFilter] = useState("All");
  const [sortBy, setSortBy] = useState<SortBy>("date_created");
  const [page, setPage] = useState(1);

  // ── Data load (replace MOCK with Supabase fetch) ────────────────────────────
  const loadRecords = useCallback(async () => {
    // TODO: replace with fetchDeliveryRecords() from supabase/delivery.ts
    setRecords(MOCK_RECORDS);
  }, []);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRecords();
    setRefreshing(false);
  }, [loadRecords]);

  // ── Derived data ────────────────────────────────────────────────────────────
  const tabStatuses = SUB_TAB_STATUS_MAP[subTab];

  const filtered = records
    .filter((r) => {
      // Sub-tab filter
      if (!tabStatuses.includes(r.statusId)) return false;
      // Search
      const q = searchQuery.toLowerCase();
      const matchSearch =
        !q ||
        r.deliveryNo.toLowerCase().includes(q) ||
        r.poNo.toLowerCase().includes(q) ||
        r.supplier.toLowerCase().includes(q) ||
        r.officeSection.toLowerCase().includes(q) ||
        (r.iarNo ?? "").toLowerCase().includes(q) ||
        (r.dvNo ?? "").toLowerCase().includes(q);
      // Filters
      const matchSection =
        sectionFilter === "All" || r.officeSection === sectionFilter;
      const matchStatus = statusFilter === null || r.statusId === statusFilter;
      return matchSearch && matchSection && matchStatus;
    })
    .sort((a, b) => {
      if (sortBy === "date_modified")
        return b.updatedAt.localeCompare(a.updatedAt);
      return b.date.localeCompare(a.date);
    });

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const canCreate = canRoleCreate(roleId);

  // ── Handlers (wire to modals once built) ───────────────────────────────────
  const handleView = (r: DeliveryRecord) => {
    // TODO: open ViewDeliveryModal
    console.log("[DeliveryModule] view", r.id);
  };

  const handleProcess = (r: DeliveryRecord) => {
    // TODO: open ProcessDeliveryModal
    console.log("[DeliveryModule] process", r.id);
  };

  const handleMore = (r: DeliveryRecord) => {
    // TODO: open DeliveryRemarkSheet
    console.log("[DeliveryModule] more", r.id);
  };

  const handleCreate = () => {
    // TODO: open CreateDeliveryModal
    console.log("[DeliveryModule] create");
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View className="flex-1 bg-gray-50">
      {/* Sub-tabs: Deliveries | Inspection | Acceptance */}
      <SubTabRow
        active={subTab}
        onSelect={(s) => {
          setSubTab(s);
          setPage(1);
        }}
      />

      {/* Search + filter toggle + create */}
      <SearchBar
        value={searchQuery}
        onChange={(t) => {
          setSearchQuery(t);
          setPage(1);
        }}
        onCreatePress={handleCreate}
        canCreate={canCreate}
        filterActive={
          filterOpen || statusFilter !== null || sectionFilter !== "All"
        }
        onFilterToggle={() => setFilterOpen((o) => !o)}
      />

      {/* Collapsible filter panel */}
      <FilterPanel
        visible={filterOpen}
        records={records.filter((r) => tabStatuses.includes(r.statusId))}
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

      {/* Phase progress banner */}
      <PhaseBanner subTab={subTab} />

      {/* Results count + sort indicator */}
      <View className="flex-row items-center justify-between px-4 pb-1.5 pt-0.5">
        <Text className="text-[11px] text-gray-400">
          <Text className="font-semibold text-gray-500">{filtered.length}</Text>
          {" of "}
          {records.filter((r) => tabStatuses.includes(r.statusId)).length}{" "}
          records
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

      {/* Record list */}
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 16 }}
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
          <EmptyState label="No delivery records found" />
        ) : (
          paged.map((record, idx) => {
            const canProcess = canRoleProcessDelivery(roleId, record.statusId);
            return (
              <RecordCard
                key={record.id}
                record={record}
                isEven={idx % 2 === 0}
                roleId={roleId}
                canProcess={canProcess}
                onView={handleView}
                onProcess={handleProcess}
                onMore={handleMore}
              />
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
    </View>
  );
}
