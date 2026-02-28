/**
 * ProcurementContent.tsx
 *
 * Pure React Native + NativeWind (Tailwind) component.
 * The "Create" Pressable opens PRModal directly — no external
 * state or callback needed from a parent screen.
 */

import React, { useCallback, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import PurchaseRequestModal, { PRFormState } from "./(modals)/PurchaseRequestModal";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MainTab =
  | "purchase_request"
  | "purchase_order"
  | "delivery_inspection"
  | "payment_closure";

export type SubTab = "pr" | "canvass" | "abstract_of_awards";

export type PRStatus =
  | "approved"
  | "pending"
  | "overdue"
  | "processing"
  | "draft";

export interface PRRecord {
  id: string;
  prNo: string;
  itemDescription: string;
  officeSection: string;
  quantity: number;
  totalCost: number;
  date: string;
  status: PRStatus;
  elapsedTime: string;
}

export interface ProcurementContentProps {
  onViewRecord?: (record: PRRecord) => void;
  onEditRecord?: (record: PRRecord) => void;
  /** Optional — called after PRModal submits, in addition to internal handling */
  onPRSubmit?: (data: PRFormState & { total: number; isHighValue: boolean }) => void;
  initialTab?: MainTab;
  records?: PRRecord[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const PAGE_SIZE = 7;

const MAIN_TABS: { key: MainTab; label: string; short: string }[] = [
  { key: "purchase_request",    label: "Purchase Request",      short: "PR"       },
  { key: "purchase_order",      label: "Purchase Order",        short: "PO"       },
  { key: "delivery_inspection", label: "Delivery & Inspection", short: "Delivery" },
  { key: "payment_closure",     label: "Payment & Closure",     short: "Payment"  },
];

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "pr",                 label: "Purchase Request"   },
  { key: "canvass",            label: "Canvass"            },
  { key: "abstract_of_awards", label: "Abstract of Awards" },
];

const SECTION_FILTERS = ["All", "STOD", "LTSP", "ARBDSP", "Legal", "PARPO", "PARAD"];

const STATUS_CONFIG: Record<
  PRStatus,
  { dotClass: string; bgClass: string; textClass: string; label: string }
> = {
  approved:   { dotClass: "bg-green-500",  bgClass: "bg-green-50",  textClass: "text-green-700",  label: "Approved"   },
  pending:    { dotClass: "bg-yellow-400", bgClass: "bg-yellow-50", textClass: "text-yellow-700", label: "Pending"    },
  overdue:    { dotClass: "bg-red-500",    bgClass: "bg-red-50",    textClass: "text-red-700",    label: "Overdue"    },
  processing: { dotClass: "bg-blue-500",   bgClass: "bg-blue-50",   textClass: "text-blue-700",   label: "Processing" },
  draft:      { dotClass: "bg-gray-400",   bgClass: "bg-gray-100",  textClass: "text-gray-500",   label: "Draft"      },
};

const DEFAULT_RECORDS: PRRecord[] = [
  { id: "1", prNo: "2026-0201", itemDescription: "Cocomband and Engk", officeSection: "STOD",   quantity: 1, totalCost: 6700,  date: "02-01-2026", status: "pending",    elapsedTime: "2 days"  },
  { id: "2", prNo: "2026-0202", itemDescription: "Cocomband and Engk", officeSection: "LTSP",   quantity: 1, totalCost: 6700,  date: "02-01-2026", status: "overdue",    elapsedTime: "4 days"  },
  { id: "3", prNo: "2026-0203", itemDescription: "Cocomband and Engk", officeSection: "ARBDSP", quantity: 1, totalCost: 6700,  date: "02-01-2026", status: "processing", elapsedTime: "1 day"   },
  { id: "4", prNo: "2026-0204", itemDescription: "Cocomband and Engk", officeSection: "Legal",  quantity: 1, totalCost: 6700,  date: "02-01-2026", status: "approved",   elapsedTime: "2 hours" },
  { id: "5", prNo: "2026-0205", itemDescription: "Cocomband and Engk", officeSection: "STOD",   quantity: 1, totalCost: 6700,  date: "02-01-2026", status: "approved",   elapsedTime: "1 hour"  },
  { id: "6", prNo: "2026-0206", itemDescription: "Cocomband and Engk", officeSection: "PARPO",  quantity: 1, totalCost: 6700,  date: "02-01-2026", status: "approved",   elapsedTime: "40 min"  },
  { id: "7", prNo: "2026-0207", itemDescription: "Cocomband and Engk", officeSection: "STOD",   quantity: 3, totalCost: 12500, date: "02-01-2026", status: "pending",    elapsedTime: "2 days"  },
  { id: "8", prNo: "2026-0208", itemDescription: "Cocomband and Engk", officeSection: "STOD",   quantity: 2, totalCost: 6700,  date: "02-01-2026", status: "draft",      elapsedTime: "3 days"  },
  { id: "9", prNo: "2026-0209", itemDescription: "Cocomband and Engk", officeSection: "PARAD",  quantity: 1, totalCost: 6700,  date: "02-01-2026", status: "pending",    elapsedTime: "5 hours" },
];

const fmt = (n: number) =>
  n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── TabStrip ─────────────────────────────────────────────────────────────────

const TabStrip: React.FC<{
  active: MainTab;
  onSelect: (t: MainTab) => void;
}> = ({ active, onSelect }) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    className="bg-white border-b border-gray-200 max-h-12"
    contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 4 }}
  >
    {MAIN_TABS.map((tab) => {
      const isActive = tab.key === active;
      return (
        <TouchableOpacity
          key={tab.key}
          onPress={() => onSelect(tab.key)}
          activeOpacity={0.8}
          className={[
            "h-9 px-4 rounded-t-xl border-b-2 items-center justify-center",
            isActive
              ? "bg-[#064E3B] border-[#064E3B]"
              : "bg-transparent border-transparent",
          ].join(" ")}
        >
          <Text
            className={[
              "text-[13px] font-semibold",
              isActive ? "text-white" : "text-gray-400",
            ].join(" ")}
          >
            {tab.short}
          </Text>
        </TouchableOpacity>
      );
    })}
  </ScrollView>
);

// ─── SubTabRow ────────────────────────────────────────────────────────────────

const SubTabRow: React.FC<{
  active: SubTab;
  onSelect: (s: SubTab) => void;
}> = ({ active, onSelect }) => (
  <View className="flex-row bg-white border-b border-gray-200 px-4 gap-2 py-2.5">
    {SUB_TABS.map((sub) => {
      const isActive = sub.key === active;
      return (
        <TouchableOpacity
          key={sub.key}
          onPress={() => onSelect(sub.key)}
          activeOpacity={0.8}
          className={[
            "px-3 py-1.5 rounded-lg",
            isActive ? "bg-[#064E3B]" : "bg-transparent",
          ].join(" ")}
        >
          <Text
            className={[
              "text-[12px] font-semibold",
              isActive ? "text-white" : "text-gray-400",
            ].join(" ")}
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
  onCreatePress: () => void;
}> = ({ value, onChange, onCreatePress }) => (
  <View className="flex-row items-center gap-2.5 px-4 py-3 bg-white border-b border-gray-100">
    {/* Search input */}
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

    {/* Create button */}
    <Pressable
      onPress={onCreatePress}
      className="flex-row items-center gap-1.5 bg-[#064E3B] px-4 py-2.5 rounded-xl"
      style={({ pressed }) => pressed ? { opacity: 0.82 } : undefined}
    >
      <Text className="text-white text-[18px] leading-none font-light">+</Text>
      <Text className="text-white text-[13px] font-bold">Create</Text>
    </Pressable>
  </View>
);

// ─── FilterChips ──────────────────────────────────────────────────────────────

const FilterChips: React.FC<{
  active: string;
  onSelect: (s: string) => void;
}> = ({ active, onSelect }) => (
  <View className="bg-white border-b border-gray-100">
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}
    >
      {SECTION_FILTERS.map((f) => {
        const isActive = f === active;
        return (
          <TouchableOpacity
            key={f}
            onPress={() => onSelect(f)}
            activeOpacity={0.8}
            className={[
              "px-3 py-1.5 rounded-full border",
              isActive
                ? "bg-[#064E3B] border-[#064E3B]"
                : "bg-white border-gray-200",
            ].join(" ")}
          >
            <Text
              className={[
                "text-[11.5px] font-semibold",
                isActive ? "text-white" : "text-gray-500",
              ].join(" ")}
            >
              {f}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  </View>
);

// ─── StatStrip ────────────────────────────────────────────────────────────────

const StatStrip: React.FC<{ records: PRRecord[] }> = ({ records }) => {
  const approved = records.filter((r) => r.status === "approved").length;
  const pending  = records.filter((r) => r.status === "pending").length;
  const overdue  = records.filter((r) => r.status === "overdue").length;
  const amount   = records.reduce((s, r) => s + r.totalCost, 0);

  const stats = [
    { label: "Total",    value: String(records.length), colorClass: "text-[#1a4d2e]", bgClass: "bg-emerald-50" },
    { label: "Approved", value: String(approved),       colorClass: "text-green-700",  bgClass: "bg-green-50"   },
    { label: "Pending",  value: String(pending),        colorClass: "text-amber-700",  bgClass: "bg-amber-50"   },
    { label: "Overdue",  value: String(overdue),        colorClass: "text-red-700",    bgClass: "bg-red-50"     },
    { label: "Amount",   value: `₱${fmt(amount)}`,      colorClass: "text-blue-700",   bgClass: "bg-blue-50"    },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="bg-white border-b border-gray-100 max-h-20"
      contentContainerStyle={{ flexDirection: "row", paddingHorizontal: 4, paddingVertical: 4, gap: 4 }}
    >
      {stats.map((s) => (
        <View
          key={s.label}
          className={`${s.bgClass} rounded-xl px-4 py-2.5 items-center border border-gray-100 min-w-[72px]`}
        >
          <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">
            {s.label}
          </Text>
          <Text
            className={`text-[15px] font-bold ${s.colorClass}`}
            style={s.label === "Amount" ? { fontFamily: MONO, fontSize: 13 } : undefined}
          >
            {s.value}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
};

// ─── StatusPill ───────────────────────────────────────────────────────────────

const StatusPill: React.FC<{ status: PRStatus; elapsed: string }> = ({
  status,
  elapsed,
}) => {
  const cfg = STATUS_CONFIG[status];
  return (
    <View className={`flex-row items-center gap-1.5 self-start px-2.5 py-1 rounded-full ${cfg.bgClass}`}>
      <View className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass}`} />
      <Text className={`text-[10.5px] font-bold ${cfg.textClass}`}>{elapsed}</Text>
    </View>
  );
};

// ─── RecordCard ───────────────────────────────────────────────────────────────

const RecordCard: React.FC<{
  record: PRRecord;
  isEven: boolean;
  onView?: (r: PRRecord) => void;
  onEdit?: (r: PRRecord) => void;
  onMore?: (r: PRRecord) => void;
}> = ({ record, isEven, onView, onEdit, onMore }) => (
  <View
    className={[
      "mx-4 mb-3 rounded-3xl border border-gray-200 overflow-hidden",
      isEven ? "bg-white" : "bg-gray-50",
    ].join(" ")}
    style={{
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.07,
      shadowRadius: 6,
      elevation: 3,
    }}
  >
    {/* Top section */}
    <View className="flex-row items-start justify-between px-4 pt-3.5 pb-2">
      <View className="flex-1 pr-3">
        <Text
          className="text-[13px] font-bold text-[#1a4d2e] mb-0.5"
          style={{ fontFamily: MONO }}
        >
          {record.prNo}
        </Text>
        <Text className="text-[12.5px] text-gray-700 leading-5" numberOfLines={2}>
          {record.itemDescription}
        </Text>
      </View>
      <StatusPill status={record.status} elapsed={record.elapsedTime} />
    </View>

    <View className="h-px bg-gray-100 mx-4" />

    {/* Meta row */}
    <View className="flex-row items-center gap-3 px-4 py-2.5">
      <View className="bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5">
        <Text className="text-[10.5px] font-bold text-emerald-700">
          {record.officeSection}
        </Text>
      </View>
      <View className="flex-row items-center gap-1">
        <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Qty</Text>
        <Text
          className="text-[12px] font-semibold text-gray-600"
          style={{ fontFamily: MONO }}
        >
          {record.quantity}
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
        ₱{fmt(record.totalCost)}
      </Text>
    </View>

    <View className="h-px bg-gray-100 mx-4" />

    {/* Actions */}
    <View className="flex-row items-center gap-2 px-4 py-2.5">
      <TouchableOpacity
        onPress={() => onView?.(record)}
        activeOpacity={0.8}
        className="flex-1 bg-blue-600 rounded-xl py-2 items-center"
      >
        <Text className="text-white text-[12px] font-bold">View</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => onEdit?.(record)}
        activeOpacity={0.8}
        className="flex-1 bg-amber-500 rounded-xl py-2 items-center"
      >
        <Text className="text-white text-[12px] font-bold">Edit</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => onMore?.(record)}
        activeOpacity={0.8}
        className="w-10 h-10 bg-emerald-700 rounded-xl items-center justify-center"
      >
        <Text className="text-white text-[11px] font-bold tracking-widest">•••</Text>
      </TouchableOpacity>
    </View>
  </View>
);

// ─── EmptyState ───────────────────────────────────────────────────────────────

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
  <View className="flex-1 items-center justify-center py-24 px-8">
    <Text className="text-5xl mb-4">📋</Text>
    <Text className="text-[16px] font-bold text-gray-600 mb-2 text-center">
      {label}
    </Text>
    <Text className="text-[13px] text-gray-400 text-center leading-5 max-w-[240px]">
      No records here yet. They will appear as they are created and routed.
    </Text>
  </View>
);

// ─── Pagination ───────────────────────────────────────────────────────────────

const Pagination: React.FC<{
  total: number;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
}> = ({ total, page, pageSize, onPage }) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  const visible = Array.from({ length: Math.min(pages, 5) }, (_, i) => {
    if (pages <= 5) return i + 1;
    if (page <= 3) return i + 1;
    if (page >= pages - 2) return pages - 4 + i;
    return page - 2 + i;
  });

  return (
    <View className="flex-row items-center justify-between px-4 py-3 bg-white border-t border-gray-100">
      <Text className="text-[12px] text-gray-400">
        <Text className="font-semibold text-gray-600">{total}</Text> records
      </Text>
      <View className="flex-row items-center gap-1.5">
        <TouchableOpacity
          onPress={() => onPage(Math.max(1, page - 1))}
          disabled={page === 1}
          className={`w-8 h-8 rounded-lg border items-center justify-center ${
            page === 1 ? "border-gray-100 bg-gray-50" : "border-gray-200 bg-white"
          }`}
        >
          <Text className={`text-sm ${page === 1 ? "text-gray-300" : "text-gray-500"}`}>‹</Text>
        </TouchableOpacity>

        {visible.map((p) => (
          <TouchableOpacity
            key={p}
            onPress={() => onPage(p)}
            activeOpacity={0.8}
            className={`w-8 h-8 rounded-lg items-center justify-center ${
              p === page
                ? "bg-[#064E3B]"
                : "border border-gray-200 bg-white"
            }`}
          >
            <Text
              className={`text-[12px] font-bold ${
                p === page ? "text-white" : "text-gray-500"
              }`}
            >
              {p}
            </Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          onPress={() => onPage(Math.min(pages, page + 1))}
          disabled={page === pages}
          className={`w-8 h-8 rounded-lg border items-center justify-center ${
            page === pages ? "border-gray-100 bg-gray-50" : "border-gray-200 bg-white"
          }`}
        >
          <Text className={`text-sm ${page === pages ? "text-gray-300" : "text-gray-500"}`}>›</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ─── MoreModal ────────────────────────────────────────────────────────────────

const MoreModal: React.FC<{
  record: PRRecord | null;
  visible: boolean;
  onClose: () => void;
  onView: (r: PRRecord) => void;
  onEdit: (r: PRRecord) => void;
}> = ({ record, visible, onClose, onView, onEdit }) => {
  if (!record) return null;
  const cfg = STATUS_CONFIG[record.status];

  const OPTIONS = [
    { label: "👁  View Record",          onPress: () => { onView(record); onClose(); } },
    { label: "✏️  Edit Record",           onPress: () => { onEdit(record); onClose(); } },
    { label: "📋  Duplicate",             onPress: onClose },
    { label: "📤  Forward to Next Stage", onPress: onClose },
    { label: "🗑  Delete",                onPress: onClose, danger: true },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable className="flex-1 bg-black/40" onPress={onClose} />
      <View className="bg-white rounded-t-3xl pb-8">
        {/* Handle */}
        <View className="items-center pt-3 pb-4">
          <View className="w-10 h-1 rounded-full bg-gray-300" />
        </View>
        {/* Record summary */}
        <View className="px-5 pb-4 border-b border-gray-100 flex-row items-start gap-3">
          <View className="flex-1">
            <Text className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">
              Purchase Request
            </Text>
            <Text
              className="text-[15px] font-bold text-[#064E3B]"
              style={{ fontFamily: MONO }}
            >
              {record.prNo}
            </Text>
            <Text className="text-[12.5px] text-gray-600 mt-0.5" numberOfLines={1}>
              {record.itemDescription}
            </Text>
          </View>
          <View className={`flex-row items-center gap-1.5 px-2.5 py-1 rounded-full ${cfg.bgClass}`}>
            <View className={`w-2 h-2 rounded-full ${cfg.dotClass}`} />
            <Text className={`text-[11px] font-bold ${cfg.textClass}`}>
              {cfg.label}
            </Text>
          </View>
        </View>
        {/* Options */}
        <View className="px-4 pt-2">
          {OPTIONS.map((opt, i) => (
            <TouchableOpacity
              key={i}
              onPress={opt.onPress}
              activeOpacity={0.7}
              className="flex-row items-center py-3.5 border-b border-gray-100"
            >
              <Text
                className={`text-[14px] font-medium ${
                  opt.danger ? "text-red-500" : "text-gray-700"
                }`}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
};

// ─── ProcurementContent ───────────────────────────────────────────────────────

const ProcurementContent: React.FC<ProcurementContentProps> = ({
  onViewRecord,
  onEditRecord,
  onPRSubmit,
  initialTab = "purchase_request",
  records = DEFAULT_RECORDS,
}) => {
  const [activeTab,     setActiveTab]     = useState<MainTab>(initialTab);
  const [activeSubTab,  setActiveSubTab]  = useState<SubTab>("pr");
  const [searchQuery,   setSearchQuery]   = useState("");
  const [sectionFilter, setSectionFilter] = useState("All");
  const [page,          setPage]          = useState(1);
  const [moreRecord,    setMoreRecord]    = useState<PRRecord | null>(null);
  const [moreVisible,   setMoreVisible]   = useState(false);
  const [prModalOpen,   setPrModalOpen]   = useState(false);

  const isPR = activeTab === "purchase_request";

  // ── Filtered + paged records ─────────────────────────────────────────────

  const filtered = isPR
    ? records.filter((r) => {
        const q = searchQuery.toLowerCase();
        const matchSearch =
          !q ||
          r.prNo.toLowerCase().includes(q) ||
          r.itemDescription.toLowerCase().includes(q) ||
          r.officeSection.toLowerCase().includes(q);
        const matchSection =
          sectionFilter === "All" || r.officeSection === sectionFilter;
        return matchSearch && matchSection;
      })
    : [];

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleTabSelect = useCallback((t: MainTab) => {
    setActiveTab(t);
    setPage(1);
    setSearchQuery("");
    setSectionFilter("All");
  }, []);

  const handleSearch = useCallback((t: string) => {
    setSearchQuery(t);
    setPage(1);
  }, []);

  const handleFilter = useCallback((s: string) => {
    setSectionFilter(s);
    setPage(1);
  }, []);

  const openMore = useCallback((r: PRRecord) => {
    setMoreRecord(r);
    setMoreVisible(true);
  }, []);

  const handlePRSubmit = useCallback(
    (data: PRFormState & { total: number; isHighValue: boolean }) => {
      onPRSubmit?.(data);
      // You could also add the new PR to the local records list here
    },
    [onPRSubmit]
  );

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <View className="flex-1 bg-gray-50">
      {/* Main tab strip */}
      <TabStrip active={activeTab} onSelect={handleTabSelect} />

      {/* Sub-tabs (PR only) */}
      {isPR && (
        <SubTabRow active={activeSubTab} onSelect={setActiveSubTab} />
      )}

      {isPR ? (
        <>
          {/* Search + Create */}
          <SearchBar
            value={searchQuery}
            onChange={handleSearch}
            onCreatePress={() => setPrModalOpen(true)}
          />

          {/* Stats */}
          <StatStrip records={filtered} />

          {/* Section filter chips */}
          <FilterChips active={sectionFilter} onSelect={handleFilter} />

          {/* Record list */}
          <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: 12, paddingBottom: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            {paged.length === 0 ? (
              <EmptyState label="No records found" />
            ) : (
              paged.map((record, idx) => (
                <RecordCard
                  key={record.id}
                  record={record}
                  isEven={idx % 2 === 0}
                  onView={onViewRecord}
                  onEdit={onEditRecord}
                  onMore={openMore}
                />
              ))
            )}
          </ScrollView>

          {/* Pagination */}
          <Pagination
            total={filtered.length}
            page={page}
            pageSize={PAGE_SIZE}
            onPage={setPage}
          />
        </>
      ) : (
        <View className="flex-1 bg-white">
          <EmptyState
            label={MAIN_TABS.find((t) => t.key === activeTab)?.label ?? ""}
          />
        </View>
      )}

      {/* Record action sheet */}
      <MoreModal
        record={moreRecord}
        visible={moreVisible}
        onClose={() => setMoreVisible(false)}
        onView={onViewRecord ?? (() => {})}
        onEdit={onEditRecord ?? (() => {})}
      />

      {/* ── Purchase Request create modal ── */}
      <PurchaseRequestModal
        visible={prModalOpen}
        onClose={() => setPrModalOpen(false)}
        onSubmit={handlePRSubmit}
      />
    </View>
  );
};

export default ProcurementContent;
