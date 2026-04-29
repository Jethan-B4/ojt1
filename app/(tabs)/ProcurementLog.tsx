/**
 * ProcurementLog.tsx — Procurement Audit Trail & History
 *
 * Integrated with procurement module pattern:
 *   • SubTabRow for phase filtering (All, PR, PO, Delivery, Payment, Completed)
 *   • SearchBar with filter toggle (matches PRModule/POModule)
 *   • Expandable PR cards with remark timeline
 *
 * Role behaviour:
 *   role_id 1 (Admin)       → all PRs system-wide, all remarks
 *   role_id 2–5 (Processor) → all PRs system-wide, all remarks (read-only)
 *   role_id 6+ (End User)   → own division's PRs only
 */

import {
    fetchLatestRemarkByPR,
    fetchPRStatuses,
    fetchPurchaseRequests,
    fetchPurchaseRequestsByDivision,
    fetchRemarksByPR,
    type PRRow,
    type PRStatusRow,
    type RemarkRow,
    type StatusFlag,
} from "@/lib/supabase/index";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { useAuth } from "../AuthContext";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_RANGE = Array.from({ length: 7 }, (_, i) => CURRENT_YEAR - 5 + i);

// Default status styles — fallback for statuses not explicitly configured
const DEFAULT_STATUS_COLORS = [
  { bg: "#fefce8", text: "#854d0e", dot: "#eab308" }, // yellow — statuses 1
  { bg: "#eff6ff", text: "#1e40af", dot: "#3b82f6" }, // blue — statuses 2
  { bg: "#f5f3ff", text: "#5b21b6", dot: "#8b5cf6" }, // purple — statuses 3
  { bg: "#fff7ed", text: "#9a3412", dot: "#f97316" }, // orange — statuses 4
  { bg: "#ecfdf5", text: "#065f46", dot: "#10b981" }, // green — statuses 5
  { bg: "#f0fdf4", text: "#166534", dot: "#22c55e" }, // light green — statuses 6
  { bg: "#fef2f2", text: "#991b1b", dot: "#ef4444" }, // red — statuses 8
  { bg: "#fdf4ff", text: "#6b21a8", dot: "#a855f7" }, // pink — statuses 9
  { bg: "#f9fafb", text: "#374151", dot: "#9ca3af" }, // gray — statuses 10
  { bg: "#fef3c7", text: "#92400e", dot: "#f59e0b" }, // amber — statuses 11
];

// Build STATUS_CFG dynamically from database statuses
function buildStatusConfig(
  dbStatuses: PRStatusRow[],
): Record<number, { bg: string; text: string; dot: string; label: string }> {
  const cfg: Record<
    number,
    { bg: string; text: string; dot: string; label: string }
  > = {};
  for (const status of dbStatuses) {
    const colorIdx = (status.id - 1) % DEFAULT_STATUS_COLORS.length;
    const colors = DEFAULT_STATUS_COLORS[colorIdx];
    cfg[status.id] = {
      ...colors,
      label: status.status_name,
    };
  }
  return cfg;
}

const FLAG_CFG: Partial<
  Record<
    StatusFlag,
    {
      label: string;
      icon: keyof typeof MaterialIcons.glyphMap;
      bg: string;
      text: string;
      dot: string;
    }
  >
> = {
  complete: {
    label: "Complete",
    icon: "check-circle",
    bg: "#f0fdf4",
    text: "#166534",
    dot: "#22c55e",
  },
  incomplete_info: {
    label: "Incomplete Info",
    icon: "info",
    bg: "#eff6ff",
    text: "#1e40af",
    dot: "#3b82f6",
  },
  wrong_information: {
    label: "Wrong Information",
    icon: "error",
    bg: "#fef2f2",
    text: "#991b1b",
    dot: "#ef4444",
  },
  needs_revision: {
    label: "Needs Revision",
    icon: "edit",
    bg: "#fff7ed",
    text: "#9a3412",
    dot: "#f97316",
  },
  on_hold: {
    label: "On Hold",
    icon: "pause-circle",
    bg: "#f9fafb",
    text: "#374151",
    dot: "#9ca3af",
  },
  urgent: {
    label: "Urgent",
    icon: "warning",
    bg: "#fef3c7",
    text: "#92400e",
    dot: "#f59e0b",
  },
};

const ALL_FLAGS = Object.keys(FLAG_CFG) as StatusFlag[];

const ENDUSER_ROLE = 6;

// ─── SubTabRow (matches PRModule/POModule pattern) ─────────────────────────────

type PhaseFilter = "all" | "pr" | "po" | "delivery" | "payment" | "completed";

const PHASE_TABS: { key: PhaseFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pr", label: "PR" },
  { key: "po", label: "PO" },
  { key: "delivery", label: "Delivery" },
  { key: "payment", label: "Payment" },
  { key: "completed", label: "Completed" },
];

const SubTabRow: React.FC<{
  active: PhaseFilter;
  onSelect: (s: PhaseFilter) => void;
}> = ({ active, onSelect }) => (
  <View className="flex-row bg-white border-b border-gray-200 px-4 gap-2 py-2.5">
    {PHASE_TABS.map((tab) => {
      const on = tab.key === active;
      return (
        <TouchableOpacity
          key={tab.key}
          onPress={() => onSelect(tab.key)}
          activeOpacity={0.8}
          className={`px-3 py-1.5 rounded-lg ${on ? "bg-[#064E3B]" : "bg-transparent"}`}
        >
          <Text
            className={`text-[12px] font-semibold ${on ? "text-white" : "text-gray-400"}`}
          >
            {tab.label}
          </Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

// ─── SearchBar (matches PRModule/POModule pattern) ────────────────────────────

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
        placeholder="Search PR, section, purpose…"
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

// ─── Flag ID Mapping ──────────────────────────────────────────────────────────
/**
 * Reverse mapping: status_flag_id → StatusFlag string.
 * Used to display flag badges in remarks and filtering.
 */
const ID_TO_FLAG: Partial<Record<number, StatusFlag>> = {
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

// Fallback status config for unknown statuses
function defaultStatusCfg(id: number) {
  const colorIdx = (id - 1) % DEFAULT_STATUS_COLORS.length;
  const colors = DEFAULT_STATUS_COLORS[colorIdx];
  return {
    ...colors,
    label: `Status ${id}`,
  };
}

function statusCfg(id: number, statusConfig?: Record<number, any>) {
  if (statusConfig && statusConfig[id]) {
    return statusConfig[id];
  }
  return defaultStatusCfg(id);
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTime(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function phaseForStatusId(
  statusId: number,
): "pr" | "po" | "delivery" | "payment" | "completed" {
  if (statusId >= 33 && statusId <= 36) return "completed";
  if (statusId >= 25 && statusId <= 32) return "payment";
  if (statusId >= 18 && statusId <= 24) return "delivery";
  if (statusId >= 11 && statusId <= 17) return "po";
  return "pr";
}

function phaseLabel(phase: "pr" | "po" | "delivery" | "payment" | "completed") {
  if (phase === "po") return "PO";
  if (phase === "delivery") return "Delivery";
  if (phase === "payment") return "Payment";
  if (phase === "completed") return "Completed";
  return "PR";
}

function lifecycleFillCount(statusId: number): number {
  const p = phaseForStatusId(statusId);
  if (p === "payment") return 4;
  if (p === "delivery") return 3;
  if (p === "po") return 2;
  return 1;
}

function LifecycleMini({ statusId }: { statusId: number }) {
  const p = phaseForStatusId(statusId);
  const fill = lifecycleFillCount(statusId);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: i <= fill ? "#064E3B" : "#e5e7eb",
            }}
          />
        ))}
      </View>
      <Text style={{ fontSize: 10, fontWeight: "700", color: "#6b7280" }}>
        {phaseLabel(p)}
      </Text>
    </View>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface LogEntry {
  pr: PRRow;
  remarks: RemarkRow[];
  loaded: boolean; // whether remarks have been fetched
}

// ─── Atoms ────────────────────────────────────────────────────────────────────

function StatusPill({
  statusId,
  statusConfig,
}: {
  statusId: number;
  statusConfig?: Record<number, any>;
}) {
  const c = statusCfg(statusId, statusConfig);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: c.bg,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
      }}
    >
      <View
        style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.dot }}
      />
      <Text style={{ fontSize: 10, fontWeight: "700", color: c.text }}>
        {c.label}
      </Text>
    </View>
  );
}

function FlagPill({ flag }: { flag: StatusFlag }) {
  const c = FLAG_CFG[flag];
  if (!c) return null;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        backgroundColor: c.bg,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 999,
      }}
    >
      <MaterialIcons name={c.icon} size={10} color={c.dot} />
      <Text style={{ fontSize: 9.5, fontWeight: "700", color: c.text }}>
        {c.label}
      </Text>
    </View>
  );
}

// ─── Remark timeline item ─────────────────────────────────────────────────────

function RemarkItem({
  remark,
  isLast,
}: {
  remark: RemarkRow;
  isLast: boolean;
}) {
  const flagKey = getFlagFromId(remark.status_flag_id);
  const flag = flagKey ? FLAG_CFG[flagKey] : null;
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      {/* Spine */}
      <View style={{ alignItems: "center", width: 24 }}>
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: flag ? flag.bg : "#f3f4f6",
            borderWidth: 1.5,
            borderColor: flag ? flag.dot : "#e5e7eb",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MaterialIcons
            name={flag ? flag.icon : "chat-bubble-outline"}
            size={12}
            color={flag ? flag.dot : "#9ca3af"}
          />
        </View>
        {!isLast && (
          <View
            style={{
              flex: 1,
              width: 1.5,
              backgroundColor: "#e5e7eb",
              marginVertical: 2,
            }}
          />
        )}
      </View>

      {/* Content */}
      <View style={{ flex: 1, paddingBottom: isLast ? 0 : 14 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
            marginBottom: 3,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "700", color: "#111827" }}>
            {remark.username ?? `User ${remark.user_id}`}
          </Text>
          <Text style={{ fontSize: 10, color: "#9ca3af" }}>
            {fmtDate(remark.created_at)} · {fmtTime(remark.created_at)}
          </Text>
          {flagKey && <FlagPill flag={flagKey} />}
        </View>
        <Text style={{ fontSize: 12, color: "#374151", lineHeight: 17 }}>
          {remark.remark}
        </Text>
      </View>
    </View>
  );
}

// ─── PR log card ──────────────────────────────────────────────────────────────

function PRLogCard({
  entry,
  expanded,
  onToggle,
  statusConfig,
  latestRemark,
}: {
  entry: LogEntry;
  expanded: boolean;
  onToggle: () => void;
  statusConfig?: Record<number, any>;
  latestRemark: RemarkRow | null;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const { pr, remarks, loaded } = entry;
  const latestFlagId = loaded
    ? (remarks.find((r) => r.status_flag_id)?.status_flag_id ?? null)
    : (latestRemark?.status_flag_id ?? null);
  const latestFlag = getFlagFromId(latestFlagId);

  return (
    <View
      style={{
        backgroundColor: "#ffffff",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        marginHorizontal: 12,
        marginBottom: 10,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
      }}
    >
      {/* ── Header row (always visible) ── */}
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.75}
        style={{ padding: 14 }}
      >
        {compact ? (
          <>
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 10,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: "#ecfdf5",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MaterialIcons name="description" size={18} color="#064E3B" />
              </View>

              <View style={{ flex: 1, gap: 2 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    flexWrap: "wrap",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12.5,
                      fontWeight: "800",
                      color: "#064E3B",
                      fontFamily: MONO,
                    }}
                  >
                    {pr.pr_no}
                  </Text>
                  {pr.is_high_value && (
                    <View
                      style={{
                        backgroundColor: "#022c22",
                        paddingHorizontal: 5,
                        paddingVertical: 1,
                        borderRadius: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 8.5,
                          fontWeight: "700",
                          color: "#a7f3d0",
                        }}
                      >
                        HIGH-VALUE
                      </Text>
                    </View>
                  )}
                </View>
                <Text
                  style={{ fontSize: 11.5, color: "#6b7280" }}
                  numberOfLines={2}
                >
                  {pr.purpose}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 3,
                    flexWrap: "wrap",
                  }}
                >
                  <StatusPill
                    statusId={pr.status_id}
                    statusConfig={statusConfig}
                  />
                  {latestFlag && <FlagPill flag={latestFlag} />}
                  <LifecycleMini statusId={pr.status_id} />
                </View>
              </View>
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "space-between",
                marginTop: 10,
                paddingTop: 10,
                borderTopWidth: 1,
                borderTopColor: "#f3f4f6",
                gap: 10,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, color: "#9ca3af" }}>
                  Created: {fmtDate(pr.created_at)}
                </Text>
                {pr.updated_at && pr.updated_at !== pr.created_at && (
                  <Text
                    style={{
                      fontSize: 10,
                      color: "#6b7280",
                      fontStyle: "italic",
                    }}
                  >
                    Updated: {fmtDate(pr.updated_at)}
                  </Text>
                )}
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text
                  style={{
                    fontSize: 12.5,
                    fontWeight: "800",
                    color: "#374151",
                  }}
                >
                  <Text>₱</Text>
                  <Text style={{ fontFamily: MONO }}>
                    {Number(pr.total_cost).toLocaleString("en-PH")}
                  </Text>
                </Text>
                <MaterialIcons
                  name={expanded ? "keyboard-arrow-up" : "keyboard-arrow-down"}
                  size={18}
                  color="#9ca3af"
                />
              </View>
            </View>
          </>
        ) : (
          <View
            style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: "#ecfdf5",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialIcons name="description" size={18} color="#064E3B" />
            </View>

            <View style={{ flex: 1, gap: 2 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Text
                  style={{
                    fontSize: 12.5,
                    fontWeight: "800",
                    color: "#064E3B",
                    fontFamily: MONO,
                  }}
                >
                  {pr.pr_no}
                </Text>
                {pr.is_high_value && (
                  <View
                    style={{
                      backgroundColor: "#022c22",
                      paddingHorizontal: 5,
                      paddingVertical: 1,
                      borderRadius: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 8.5,
                        fontWeight: "700",
                        color: "#a7f3d0",
                      }}
                    >
                      HIGH-VALUE
                    </Text>
                  </View>
                )}
              </View>
              <Text
                style={{ fontSize: 11.5, color: "#6b7280" }}
                numberOfLines={1}
              >
                {pr.purpose}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 3,
                  flexWrap: "wrap",
                }}
              >
                <StatusPill
                  statusId={pr.status_id}
                  statusConfig={statusConfig}
                />
                {latestFlag && <FlagPill flag={latestFlag} />}
                <LifecycleMini statusId={pr.status_id} />
              </View>
            </View>

            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <Text
                style={{ fontSize: 12.5, fontWeight: "700", color: "#374151" }}
              >
                <Text>₱</Text>
                <Text style={{ fontFamily: MONO }}>
                  {Number(pr.total_cost).toLocaleString("en-PH")}
                </Text>
              </Text>
              <Text style={{ fontSize: 10, color: "#9ca3af" }}>
                Created: {fmtDate(pr.created_at)}
              </Text>
              {pr.updated_at && pr.updated_at !== pr.created_at && (
                <Text
                  style={{
                    fontSize: 10,
                    color: "#6b7280",
                    fontStyle: "italic",
                  }}
                >
                  Updated: {fmtDate(pr.updated_at)}
                </Text>
              )}
              <MaterialIcons
                name={expanded ? "keyboard-arrow-up" : "keyboard-arrow-down"}
                size={18}
                color="#9ca3af"
              />
            </View>
          </View>
        )}

        {/* Remark count badge */}
        {loaded && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              marginTop: 8,
              paddingTop: 8,
              borderTopWidth: 1,
              borderTopColor: "#f3f4f6",
            }}
          >
            <MaterialIcons
              name="chat-bubble-outline"
              size={12}
              color="#9ca3af"
            />
            <Text style={{ fontSize: 11, color: "#9ca3af" }}>
              {remarks.length === 0
                ? "No remarks yet"
                : `${remarks.length} remark${remarks.length !== 1 ? "s" : ""}`}
            </Text>
            {remarks.length > 0 && (
              <View
                style={{
                  marginLeft: "auto",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    color: "#064E3B",
                    fontWeight: "600",
                  }}
                >
                  {expanded ? "Hide trail" : "View trail"}
                </Text>
                <MaterialIcons
                  name={expanded ? "keyboard-arrow-up" : "chevron-right"}
                  size={14}
                  color="#064E3B"
                />
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>

      {/* ── Expanded remark timeline ── */}
      {expanded && (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: "#f0fdf4",
            backgroundColor: "#fafffe",
            padding: 14,
            paddingTop: 16,
          }}
        >
          {/* Section label */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginBottom: 14,
            }}
          >
            <View style={{ flex: 1, height: 1, backgroundColor: "#e5e7eb" }} />
            <Text
              style={{
                fontSize: 9.5,
                fontWeight: "700",
                color: "#9ca3af",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Audit Trail
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: "#e5e7eb" }} />
          </View>

          {!loaded ? (
            <View style={{ alignItems: "center", paddingVertical: 16 }}>
              <ActivityIndicator size="small" color="#064E3B" />
            </View>
          ) : remarks.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 12, gap: 6 }}>
              <MaterialIcons name="history" size={28} color="#d1d5db" />
              <Text style={{ fontSize: 12, color: "#9ca3af" }}>
                No remarks recorded for this PR.
              </Text>
            </View>
          ) : (
            remarks.map((r, i) => (
              <RemarkItem
                key={r.id}
                remark={r}
                isLast={i === remarks.length - 1}
              />
            ))
          )}
        </View>
      )}
    </View>
  );
}

// ─── Filter chip ──────────────────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  color,
  onPress,
}: {
  label: string;
  active: boolean;
  color?: string;
  onPress: () => void;
}) {
  const bg = active ? (color ?? "#064E3B") : "#ffffff";
  const txt = active ? "#ffffff" : "#6b7280";
  const border = active ? (color ?? "#064E3B") : "#e5e7eb";
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: bg,
        borderWidth: 1.5,
        borderColor: border,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: "700", color: txt }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ProcurementLog({ navigation }: any) {
  const { currentUser } = useAuth();
  const roleId = currentUser?.role_id ?? 6;
  const divisionId = currentUser?.division_id ?? null;
  const isEndUser = roleId >= ENDUSER_ROLE;

  // ── Data state ──────────────────────────────────────────────────────────────
  const [allPRs, setAllPRs] = useState<PRRow[]>([]);
  const [statuses, setStatuses] = useState<PRStatusRow[]>([]);
  const [entries, setEntries] = useState<Record<string, LogEntry>>({});
  const [latestRemarks, setLatestRemarks] = useState<
    Record<string, RemarkRow | null>
  >({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Filter & sort state ──────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<number | null>(null);
  const [flagFilter, setFlagFilter] = useState<StatusFlag | null>(null);
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortBy, setSortBy] = useState<
    "date_created" | "last_updated" | "has_flag"
  >("last_updated");
  const [year, setYear] = useState(CURRENT_YEAR);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);

  // ── Pagination ────────────────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  // ── Expanded cards ────────────────────────────────────────────────────────────
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // ── Build dynamic status config ──────────────────────────────────────────────
  const statusConfig = buildStatusConfig(statuses);

  // ── Load PRs ──────────────────────────────────────────────────────────────────
  const loadPRs = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [rows, statRows] = await Promise.all([
          isEndUser && divisionId
            ? fetchPurchaseRequestsByDivision(divisionId)
            : fetchPurchaseRequests(),
          fetchPRStatuses(),
        ]);
        setAllPRs(rows);
        setStatuses(statRows);

        // Fetch all remarks for each PR in parallel (for immediate count display)
        const entriesWithRemarks = await Promise.all(
          rows.map(async (r) => {
            const key = String(r.id);
            const [latest, allRemarks] = await Promise.all([
              fetchLatestRemarkByPR(r.id).catch(() => null),
              fetchRemarksByPR(r.id).catch(() => []),
            ]);
            return {
              key,
              latest,
              entry: { pr: r, remarks: allRemarks, loaded: true },
            };
          }),
        );

        // Update latest remarks for badges
        setLatestRemarks(
          Object.fromEntries(entriesWithRemarks.map((e) => [e.key, e.latest])),
        );

        // Set entries with pre-loaded remarks
        setEntries((prev) => {
          const next: Record<string, LogEntry> = {};
          for (const { key, entry } of entriesWithRemarks) {
            next[key] = entry;
          }
          return next;
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isEndUser, divisionId],
  );

  useEffect(() => {
    loadPRs();
  }, [loadPRs]);

  // ── Lazy-load remarks on expand ───────────────────────────────────────────────
  const handleToggle = useCallback(
    async (prId: string) => {
      const isOpen = expanded.has(prId);
      if (isOpen) {
        setExpanded((prev) => {
          const s = new Set(prev);
          s.delete(prId);
          return s;
        });
        return;
      }
      // Open — mark expanded immediately, then fetch if not yet loaded
      setExpanded((prev) => new Set([...prev, prId]));
      if (!entries[prId]?.loaded) {
        const remarks = await fetchRemarksByPR(prId);
        setEntries((prev) => ({
          ...prev,
          [prId]: { ...prev[prId], remarks, loaded: true },
        }));
      }
    },
    [expanded, entries],
  );

  // ── Filtered & sorted list ──────────────────────────────────────────────────
  const filteredPRs = allPRs
    .filter((pr) => {
      // Fiscal year filter
      if (!pr.created_at) return false;
      const createdYear = new Date(pr.created_at).getFullYear();
      if (createdYear !== year) return false;

      const sid = Number(pr.status_id) || 0;
      if (phaseFilter !== "all") {
        if (phaseFilter === "completed") {
          if (![33, 34, 35, 36].includes(sid)) return false;
        } else {
          if (phaseForStatusId(sid) !== phaseFilter) return false;
        }
      }
      if (statusFilter !== null && pr.status_id !== statusFilter) return false;
      if (flagFilter !== null) {
        const prId = String(pr.id);
        const entry = entries[prId];
        const latest = latestRemarks[prId];

        // Check if any loaded remark matches the flag
        const loadedMatch =
          entry?.loaded &&
          entry.remarks.some(
            (r) => getFlagFromId(r.status_flag_id) === flagFilter,
          );

        // Or if the latest pre-fetched remark matches the flag
        const latestMatch =
          getFlagFromId(latest?.status_flag_id) === flagFilter;

        if (!loadedMatch && !latestMatch) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          pr.pr_no.toLowerCase().includes(q) ||
          pr.purpose.toLowerCase().includes(q) ||
          pr.office_section?.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "date_created") {
        return (
          new Date(b.created_at || "").getTime() -
          new Date(a.created_at || "").getTime()
        );
      } else if (sortBy === "last_updated") {
        return (
          new Date(b.updated_at || b.created_at || "").getTime() -
          new Date(a.updated_at || a.created_at || "").getTime()
        );
      } else if (sortBy === "has_flag") {
        // Sort by presence of flags (flagged first), then by creation date
        const aFlags =
          entries[String(a.id)]?.remarks?.some((r) => r.status_flag_id) ??
          false;
        const bFlags =
          entries[String(b.id)]?.remarks?.some((r) => r.status_flag_id) ??
          false;
        if (aFlags !== bFlags) return aFlags ? -1 : 1;
        return (
          new Date(b.created_at || "").getTime() -
          new Date(a.created_at || "").getTime()
        );
      }
      return 0;
    });

  // ── Pagination ─────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filteredPRs.length / PAGE_SIZE));
  const pagedPRs = filteredPRs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f9fafb",
        }}
      >
        <ActivityIndicator size="large" color="#064E3B" />
        <Text style={{ fontSize: 13, color: "#9ca3af", marginTop: 10 }}>
          Loading procurement log…
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#f9fafb" }}>
      {/* ── Page header with fiscal year picker ── */}
      <View
        style={{
          backgroundColor: "#064E3B",
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 12,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View>
            <Text
              style={{
                fontSize: 9.5,
                fontWeight: "600",
                color: "rgba(255,255,255,0.4)",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              DAR · Procurement
            </Text>
            <Text style={{ fontSize: 18, fontWeight: "800", color: "#ffffff" }}>
              Procurement Log
            </Text>
          </View>
          {/* Year selector */}
          <TouchableOpacity
            onPress={() => setYearPickerOpen(true)}
            activeOpacity={0.8}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: "rgba(255,255,255,0.1)",
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.15)",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: "#ffffff",
                fontFamily: MONO,
              }}
            >
              FY {year}
            </Text>
            <MaterialIcons
              name="keyboard-arrow-down"
              size={16}
              color="rgba(255,255,255,0.7)"
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── SubTabRow: Phase filters ── */}
      <SubTabRow
        active={phaseFilter}
        onSelect={(tab) => {
          setPhaseFilter(tab);
          setPage(1);
        }}
      />

      {/* ── SearchBar ── */}
      <SearchBar
        value={search}
        onChange={(t) => {
          setSearch(t);
          setPage(1);
        }}
        filterActive={
          filterOpen || statusFilter !== null || flagFilter !== null
        }
        onFilterToggle={() => setFilterOpen((o) => !o)}
      />

      {/* ── Filter panel ── */}
      {filterOpen && (
        <View
          style={{
            marginHorizontal: 12,
            marginBottom: 8,
            backgroundColor: "#ffffff",
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "#e5e7eb",
            padding: 12,
            gap: 10,
          }}
        >
          {/* Sort options */}
          <Text
            style={{
              fontSize: 10.5,
              fontWeight: "700",
              color: "#9ca3af",
              textTransform: "uppercase",
              letterSpacing: 0.8,
            }}
          >
            Sort By
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6 }}
          >
            {[
              { key: "last_updated", label: "Last Updated" },
              { key: "date_created", label: "Date Created" },
              { key: "has_flag", label: "Flagged First" },
            ].map((opt) => (
              <FilterChip
                key={opt.key}
                label={opt.label}
                active={sortBy === opt.key}
                color="#064E3B"
                onPress={() =>
                  setSortBy(
                    opt.key as "date_created" | "last_updated" | "has_flag",
                  )
                }
              />
            ))}
          </ScrollView>

          {/* Status filters */}
          <Text
            style={{
              fontSize: 10.5,
              fontWeight: "700",
              color: "#9ca3af",
              textTransform: "uppercase",
              letterSpacing: 0.8,
            }}
          >
            Status
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6 }}
          >
            <FilterChip
              label="All"
              active={statusFilter === null}
              onPress={() => setStatusFilter(null)}
            />
            {statuses.map((status) => {
              const c = statusCfg(status.id, statusConfig);
              return (
                <FilterChip
                  key={status.id}
                  label={c.label}
                  active={statusFilter === status.id}
                  color={c.dot}
                  onPress={() =>
                    setStatusFilter((prev) =>
                      prev === status.id ? null : status.id,
                    )
                  }
                />
              );
            })}
          </ScrollView>

          {/* Flag filters */}
          <Text
            style={{
              fontSize: 10.5,
              fontWeight: "700",
              color: "#9ca3af",
              textTransform: "uppercase",
              letterSpacing: 0.8,
            }}
          >
            Latest Flag
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6 }}
          >
            <FilterChip
              label="Any"
              active={flagFilter === null}
              onPress={() => setFlagFilter(null)}
            />
            {ALL_FLAGS.map((flag) => {
              const c = FLAG_CFG[flag];
              if (!c) return null;
              return (
                <FilterChip
                  key={flag}
                  label={c.label}
                  active={flagFilter === flag}
                  color={c.dot}
                  onPress={() =>
                    setFlagFilter((prev: any) => (prev === flag ? null : flag))
                  }
                />
              );
            })}
          </ScrollView>

          {/* Clear all */}
          {(statusFilter !== null || flagFilter !== null) && (
            <TouchableOpacity
              onPress={() => {
                setStatusFilter(null);
                setFlagFilter(null);
                setPhaseFilter("all");
              }}
              style={{ alignSelf: "flex-end" }}
            >
              <Text
                style={{ fontSize: 11.5, fontWeight: "700", color: "#ef4444" }}
              >
                Clear filters
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Results count + sort indicator ── */}
      <View className="flex-row items-center justify-between px-4 pb-1.5 pt-0.5">
        <Text className="text-[11px] text-gray-400">
          <Text className="font-semibold text-gray-500">
            {filteredPRs.length}
          </Text>
          {" of "}
          {allPRs.length} records
          {statusFilter !== null || flagFilter !== null || search
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
            {sortBy === "date_created"
              ? "Date Created"
              : sortBy === "has_flag"
                ? "Flagged First"
                : "Last Updated"}
          </Text>
        </View>
      </View>

      {/* ── PR log list ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 16, paddingTop: 2 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadPRs(true);
            }}
            tintColor="#064E3B"
          />
        }
      >
        {pagedPRs.length === 0 ? (
          <View style={{ alignItems: "center", paddingTop: 48, gap: 10 }}>
            <MaterialIcons name="history" size={44} color="#d1d5db" />
            <Text style={{ fontSize: 14, fontWeight: "700", color: "#374151" }}>
              No records found
            </Text>
            <Text
              style={{ fontSize: 12, color: "#9ca3af", textAlign: "center" }}
            >
              {search
                ? `No PRs match "${search}"`
                : "Try adjusting your filters."}
            </Text>
          </View>
        ) : (
          pagedPRs.map((pr) => {
            const key = String(pr.id);
            const entry = entries[key] ?? { pr, remarks: [], loaded: false };
            return (
              <PRLogCard
                key={key}
                entry={entry}
                expanded={expanded.has(key)}
                onToggle={() => handleToggle(key)}
                statusConfig={statusConfig}
                latestRemark={latestRemarks[key] ?? null}
              />
            );
          })
        )}
      </ScrollView>

      {/* ── Pagination ── */}
      <Pagination
        page={page}
        totalPages={totalPages}
        total={filteredPRs.length}
        onPage={setPage}
      />

      {/* ── Year Picker Modal ── */}
      <Modal
        visible={yearPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setYearPickerOpen(false)}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
          activeOpacity={1}
          onPress={() => setYearPickerOpen(false)}
        >
          <TouchableOpacity activeOpacity={1}>
            <View
              style={{
                backgroundColor: "#ffffff",
                borderRadius: 24,
                overflow: "hidden",
                width: 220,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.18,
                shadowRadius: 16,
                elevation: 12,
              }}
            >
              <View
                style={{
                  backgroundColor: "#064E3B",
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "700",
                    color: "rgba(255,255,255,0.5)",
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  Fiscal Year
                </Text>
                <Text
                  style={{ fontSize: 16, fontWeight: "800", color: "#ffffff" }}
                >
                  Select Year
                </Text>
              </View>
              {YEAR_RANGE.map((y) => {
                const isSelected = y === year;
                const isFuture = y > CURRENT_YEAR;
                return (
                  <TouchableOpacity
                    key={y}
                    onPress={() => {
                      setYear(y);
                      setPage(1);
                      setYearPickerOpen(false);
                    }}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      backgroundColor: isSelected ? "#ecfdf5" : undefined,
                      borderBottomWidth: 1,
                      borderBottomColor: "#f3f4f6",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      {isSelected ? (
                        <View
                          style={{
                            width: 6,
                            height: 20,
                            borderRadius: 3,
                            backgroundColor: "#10b981",
                          }}
                        />
                      ) : (
                        <View style={{ width: 6, height: 20 }} />
                      )}
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "700",
                          color: isSelected
                            ? "#064E3B"
                            : isFuture
                              ? "#9ca3af"
                              : "#1f2937",
                          fontFamily: MONO,
                        }}
                      >
                        FY {y}
                      </Text>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {isFuture && (
                        <View
                          style={{
                            backgroundColor: "#fef3c7",
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            borderRadius: 6,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 9,
                              fontWeight: "700",
                              color: "#92400e",
                            }}
                          >
                            Planning
                          </Text>
                        </View>
                      )}
                      {y === CURRENT_YEAR && (
                        <View
                          style={{
                            backgroundColor: "#d1fae5",
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            borderRadius: 6,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 9,
                              fontWeight: "700",
                              color: "#065f46",
                            }}
                          >
                            Current
                          </Text>
                        </View>
                      )}
                      {isSelected && (
                        <MaterialIcons name="check" size={14} color="#10b981" />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Pagination Component (matches procurement modules) ────────────────────

function Pagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
}) {
  return (
    <View className="flex-row items-center justify-between px-4 py-3 bg-white border-t border-gray-100">
      <Text className="text-[12px] text-gray-400">
        <Text className="font-semibold text-gray-600">{total}</Text> records
      </Text>
      <View className="flex-row items-center gap-1.5">
        {[
          { label: "prev", page: Math.max(1, page - 1), disabled: page === 1 },
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
}
