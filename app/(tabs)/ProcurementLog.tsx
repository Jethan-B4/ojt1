/**
 * ProcurementLog.tsx — Procurement Audit Trail & History
 *
 * Role behaviour:
 *   role_id 1 (Admin)       → all PRs system-wide, all remarks
 *   role_id 2–5 (Processor) → all PRs system-wide, all remarks (read-only)
 *   role_id 6+ (End User)   → own division's PRs only
 *
 * Each PR row expands to show its full remark timeline sourced from the
 * `remarks` table via fetchRemarksByPR / fetchRemarksByPR.
 *
 * Filters: free-text search · status filter · flag filter
 */

import {
  fetchPRStatuses,
  fetchPurchaseRequests,
  fetchPurchaseRequestsByDivision,
  fetchRemarksByPR,
  type PRRow,
  type PRStatusRow,
  type RemarkRow,
  type StatusFlag,
} from "@/lib/supabase";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../AuthContext";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

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

const FLAG_CFG: Record<
  StatusFlag,
  {
    label: string;
    icon: keyof typeof MaterialIcons.glyphMap;
    bg: string;
    text: string;
    dot: string;
  }
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

const EDIT_ROLES = new Set([1, 4]);
const ENDUSER_ROLE = 6;

// ─── Flag ID Mapping ──────────────────────────────────────────────────────────
/**
 * Reverse mapping: status_flag_id → StatusFlag string.
 * Used to display flag badges in remarks and filtering.
 */
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
      }}>
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
      }}>
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
          }}>
          <MaterialIcons
            name={flag ? flag.icon : "chat-bubble-outline"}
            size={11}
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
          }}>
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
}: {
  entry: LogEntry;
  expanded: boolean;
  onToggle: () => void;
  statusConfig?: Record<number, any>;
}) {
  const { pr, remarks, loaded } = entry;
  const latestFlagId =
    remarks.find((r) => r.status_flag_id)?.status_flag_id ?? null;
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
      }}>
      {/* ── Header row (always visible) ── */}
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.75}
        style={{ padding: 14 }}>
        <View
          style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          {/* PR icon */}
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: "#ecfdf5",
              alignItems: "center",
              justifyContent: "center",
            }}>
            <MaterialIcons name="description" size={18} color="#064E3B" />
          </View>

          {/* PR info */}
          <View style={{ flex: 1, gap: 2 }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text
                style={{
                  fontSize: 12.5,
                  fontWeight: "800",
                  color: "#064E3B",
                  fontFamily: MONO,
                }}>
                {pr.pr_no}
              </Text>
              {pr.is_high_value && (
                <View
                  style={{
                    backgroundColor: "#022c22",
                    paddingHorizontal: 5,
                    paddingVertical: 1,
                    borderRadius: 4,
                  }}>
                  <Text
                    style={{
                      fontSize: 8.5,
                      fontWeight: "700",
                      color: "#a7f3d0",
                    }}>
                    HIGH-VALUE
                  </Text>
                </View>
              )}
            </View>
            <Text
              style={{ fontSize: 11.5, color: "#6b7280" }}
              numberOfLines={1}>
              {pr.purpose}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: 3,
                flexWrap: "wrap",
              }}>
              <StatusPill statusId={pr.status_id} statusConfig={statusConfig} />
              {latestFlag && <FlagPill flag={latestFlag} />}
            </View>
          </View>

          {/* Right side */}
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <Text
              style={{
                fontSize: 12.5,
                fontWeight: "700",
                color: "#374151",
                fontFamily: MONO,
              }}>
              ₱{Number(pr.total_cost).toLocaleString("en-PH")}
            </Text>
            <Text style={{ fontSize: 10, color: "#9ca3af" }}>
              {fmtDate(pr.created_at)}
            </Text>
            <MaterialIcons
              name={expanded ? "keyboard-arrow-up" : "keyboard-arrow-down"}
              size={18}
              color="#9ca3af"
            />
          </View>
        </View>

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
            }}>
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
              <Text
                style={{
                  fontSize: 11,
                  color: "#064E3B",
                  fontWeight: "600",
                  marginLeft: "auto",
                }}>
                {expanded ? "Hide trail" : "View trail →"}
              </Text>
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
          }}>
          {/* Section label */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginBottom: 14,
            }}>
            <View style={{ flex: 1, height: 1, backgroundColor: "#e5e7eb" }} />
            <Text
              style={{
                fontSize: 9.5,
                fontWeight: "700",
                color: "#9ca3af",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}>
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
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: bg,
        borderWidth: 1.5,
        borderColor: border,
      }}>
      <Text style={{ fontSize: 11.5, fontWeight: "700", color: txt }}>
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Filter & sort state ──────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<number | null>(null);
  const [flagFilter, setFlagFilter] = useState<StatusFlag | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"date_created" | "has_flag">("date_created");

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
        // Seed entries map — remarks fetched lazily on expand
        setEntries((prev) => {
          const next: Record<string, LogEntry> = {};
          for (const pr of rows) {
            const key = String(pr.id);
            next[key] = prev[key] ?? { pr, remarks: [], loaded: false };
            next[key].pr = pr; // always refresh PR data
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
      if (statusFilter !== null && pr.status_id !== statusFilter) return false;
      if (flagFilter !== null) {
        const entry = entries[String(pr.id)];
        // Only filter by flag if remarks are loaded; otherwise keep in list
        if (
          entry?.loaded &&
          !entry.remarks.some(
            (r) => getFlagFromId(r.status_flag_id) === flagFilter,
          )
        )
          return false;
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
      } else if (sortBy === "has_flag") {
        // Sort by presence of flags (flagged first), then by creation date
        const aFlags =
          entries[String(a.id)]?.remarks?.some((r) => r.status_flag_id) ?? false;
        const bFlags =
          entries[String(b.id)]?.remarks?.some((r) => r.status_flag_id) ?? false;
        if (aFlags !== bFlags) return aFlags ? -1 : 1;
        return (
          new Date(b.created_at || "").getTime() -
          new Date(a.created_at || "").getTime()
        );
      }
      return 0;
    });

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f9fafb",
        }}>
        <ActivityIndicator size="large" color="#064E3B" />
        <Text style={{ fontSize: 13, color: "#9ca3af", marginTop: 10 }}>
          Loading procurement log…
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#f9fafb" }}>
      {/* ── Page header ── */}
      <View
        style={{
          backgroundColor: "#064E3B",
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 16,
        }}>
        <Text
          style={{
            fontSize: 9.5,
            fontWeight: "600",
            color: "rgba(255,255,255,0.4)",
            textTransform: "uppercase",
            letterSpacing: 1.2,
          }}>
          DAR · Procurement
        </Text>
        <Text
          style={{
            fontSize: 22,
            fontWeight: "800",
            color: "#ffffff",
            marginTop: 2,
          }}>
          Procurement Log
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.5)",
            marginTop: 2,
          }}>
          {isEndUser
            ? "Your division's PR audit trail"
            : "System-wide PR history & remarks"}
        </Text>

        {/* Summary strip */}
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            marginTop: 14,
          }}>
          {[
            { label: "Total PRs", value: allPRs.length },
            {
              label: "With Remarks",
              value: Object.values(entries).filter(
                (e) => e.loaded && e.remarks.length > 0,
              ).length,
            },
            {
              label: "Flagged",
              value: allPRs.filter((p) => {
                const entry = entries[String(p.id)];
                return entry?.loaded && entry.remarks.some((r) => r.status_flag_id);
              }).length,
            },
          ].map((s) => (
            <View
              key={s.label}
              style={{
                flex: 1,
                backgroundColor: "rgba(255,255,255,0.08)",
                borderRadius: 12,
                padding: 10,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
              }}>
              <Text
                style={{ fontSize: 20, fontWeight: "800", color: "#ffffff" }}>
                {s.value}
              </Text>
              <Text
                style={{
                  fontSize: 9.5,
                  color: "rgba(255,255,255,0.5)",
                  marginTop: 1,
                  textAlign: "center",
                }}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Search bar ── */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginHorizontal: 12,
          marginTop: 12,
          marginBottom: 4,
        }}>
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: "#ffffff",
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: "#e5e7eb",
            paddingHorizontal: 12,
            paddingVertical: 9,
          }}>
          <MaterialIcons name="search" size={16} color="#9ca3af" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search PR no., purpose, section…"
            placeholderTextColor="#9ca3af"
            style={{ flex: 1, fontSize: 13, color: "#111827" }}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
              <MaterialIcons name="close" size={14} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
        {/* Filter toggle */}
        <TouchableOpacity
          onPress={() => setFilterOpen((o) => !o)}
          activeOpacity={0.8}
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor:
              statusFilter !== null || flagFilter !== null
                ? "#064E3B"
                : "#ffffff",
            borderWidth: 1.5,
            borderColor:
              statusFilter !== null || flagFilter !== null
                ? "#064E3B"
                : "#e5e7eb",
          }}>
          <MaterialIcons
            name="filter-list"
            size={20}
            color={
              statusFilter !== null || flagFilter !== null
                ? "#ffffff"
                : "#6b7280"
            }
          />
        </TouchableOpacity>
      </View>

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
          }}>
          {/* Sort options */}
          <Text
            style={{
              fontSize: 10.5,
              fontWeight: "700",
              color: "#9ca3af",
              textTransform: "uppercase",
              letterSpacing: 0.8,
            }}>
            Sort By
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6 }}>
            {[
              { key: "date_created", label: "Date Created" },
              { key: "has_flag", label: "Flagged First" },
            ].map((opt) => (
              <FilterChip
                key={opt.key}
                label={opt.label}
                active={sortBy === opt.key}
                color="#064E3B"
                onPress={() =>
                  setSortBy(opt.key as "date_created" | "has_flag")
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
            }}>
            Status
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6 }}>
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
            }}>
            Latest Flag
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6 }}>
            <FilterChip
              label="Any"
              active={flagFilter === null}
              onPress={() => setFlagFilter(null)}
            />
            {ALL_FLAGS.map((flag) => {
              const c = FLAG_CFG[flag];
              return (
                <FilterChip
                  key={flag}
                  label={c.label}
                  active={flagFilter === flag}
                  color={c.dot}
                  onPress={() =>
                    setFlagFilter((prev) => (prev === flag ? null : flag))
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
              }}
              style={{ alignSelf: "flex-end" }}>
              <Text
                style={{ fontSize: 11.5, fontWeight: "700", color: "#ef4444" }}>
                Clear filters
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Results count ── */}
      <View style={{ paddingHorizontal: 14, paddingBottom: 6 }}>
        <Text style={{ fontSize: 11, color: "#9ca3af" }}>
          {filteredPRs.length} of {allPRs.length} records
          {statusFilter !== null || flagFilter !== null || search
            ? " (filtered)"
            : ""}
        </Text>
      </View>

      {/* ── PR log list ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40, paddingTop: 2 }}
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
        }>
        {filteredPRs.length === 0 ? (
          <View style={{ alignItems: "center", paddingTop: 48, gap: 10 }}>
            <MaterialIcons name="history" size={44} color="#d1d5db" />
            <Text style={{ fontSize: 14, fontWeight: "700", color: "#374151" }}>
              No records found
            </Text>
            <Text
              style={{ fontSize: 12, color: "#9ca3af", textAlign: "center" }}>
              {search
                ? `No PRs match "${search}"`
                : "Try adjusting your filters."}
            </Text>
          </View>
        ) : (
          filteredPRs.map((pr) => {
            const key = String(pr.id);
            const entry = entries[key] ?? { pr, remarks: [], loaded: false };
            return (
              <PRLogCard
                key={key}
                entry={entry}
                expanded={expanded.has(key)}
                onToggle={() => handleToggle(key)}
                statusConfig={statusConfig}
              />
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
