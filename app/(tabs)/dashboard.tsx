/**
 * dashboard.tsx
 *
 * DAR Procurement Dashboard — real-time Supabase data, role-aware views.
 *
 * Role routing:
 *   role_id 1  → AdminDashboard     — system-wide overview (all PRs, pipeline, KPIs)
 *   role_id 2  → ProcessorDashboard — Division Head: sees PRs pending their review (status_id 1)
 *   role_id 3  → ProcessorDashboard — BAC: sees PRs at status_id 2
 *   role_id 4  → ProcessorDashboard — Budget: sees PRs at status_id 3
 *   role_id 5  → ProcessorDashboard — PARPO: sees PRs at status_id 4
 *   role_id 6+ → EndUserDashboard   — own division's PRs only
 *
 * Status ID → approval step mapping:
 *   1 = Pending          (submitted, awaiting Division Head)
 *   2 = Division Head    (being reviewed by Div. Head)
 *   3 = BAC              (being reviewed by BAC)
 *   4 = Budget           (being reviewed by Budget Office)
 *   5 = PARPO            (awaiting final PARPO approval)
 *   6 = Approved         (Phase 1 complete)
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    Platform,
    RefreshControl,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import type { PRRow, PRStatusRow } from "../../lib/supabase";
import {
    fetchPRStatuses,
    fetchPurchaseRequests,
    fetchPurchaseRequestsByDivision,
} from "../../lib/supabase";
import { useAuth } from "../AuthContext";

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get("window").width;
const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const CLR = {
  brand900: "#064E3B",
  brand700: "#047857",
  brand500: "#10B981",
  brand100: "#A7F3D0",
} as const;

/**
 * status_id → UI colour / label config.
 * Colours match the approval chain: yellow → blue → purple → orange → green → teal.
 */
const STATUS_ID_CFG: Record<
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
  6: { bg: "#f0fdf4", text: "#166534", dot: "#22c55e", label: "Approved" },
};

const STAGE_CFG = [
  {
    stage: 1,
    label: "Request & Approval",
    shortLabel: "Phase 1",
    color: "#3b82f6",
  },
  {
    stage: 2,
    label: "Canvass & Evaluation",
    shortLabel: "Phase 2",
    color: "#f59e0b",
  },
  {
    stage: 3,
    label: "Order & Delivery",
    shortLabel: "Phase 3",
    color: "#10b981",
  },
  {
    stage: 4,
    label: "Payment & Closure",
    shortLabel: "Phase 4",
    color: "#8b5cf6",
  },
];

/**
 * Maps each processor role_id to the status_id they are responsible for reviewing.
 * Division Head (2) reviews status_id 1 (Pending),
 * BAC (3) reviews status_id 2, and so on.
 */
const ROLE_QUEUE_STATUS: Record<number, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
};

const ROLE_LABELS: Record<number, string> = {
  1: "Admin",
  2: "Division Head",
  3: "BAC",
  4: "Budget Officer",
  5: "PARPO",
  6: "End User",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface PRSummary {
  id: string;
  prNo: string;
  purpose: string;
  section: string;
  statusId: number;
  statusLabel: string;
  date: string;
  totalCost: number;
  isHighValue: boolean;
  proposalNo: string;
}

interface StageCount {
  stage: number;
  label: string;
  shortLabel: string;
  count: number;
  color: string;
}

interface StatCard {
  label: string;
  value: number | string;
  sub: string;
  subType: "up" | "warn" | "ok" | "info" | "neutral";
  icon: keyof typeof MaterialIcons.glyphMap;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusCfgFor(statusId: number) {
  return (
    STATUS_ID_CFG[statusId] ?? {
      bg: "#f9fafb",
      text: "#6b7280",
      dot: "#9ca3af",
      label: `Status ${statusId}`,
    }
  );
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function rowToSummary(row: PRRow, statuses: PRStatusRow[]): PRSummary {
  const statusRow = statuses.find((s) => s.id === row.status_id);
  return {
    id: String(row.id),
    prNo: row.pr_no,
    purpose: row.purpose,
    section: row.office_section,
    statusId: row.status_id,
    statusLabel: statusRow?.status_name ?? statusCfgFor(row.status_id).label,
    date: fmtDate(row.created_at),
    totalCost: Number(row.total_cost),
    isHighValue: row.is_high_value,
    proposalNo: row.proposal_no,
  };
}

// ─── Data hooks ───────────────────────────────────────────────────────────────

/** Admin hook — all PRs system-wide + pr_status labels. */
function useAdminData() {
  const [rows, setRows] = useState<PRRow[]>([]);
  const [statuses, setStatuses] = useState<PRStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [allRows, allStatuses] = await Promise.all([
        fetchPurchaseRequests(),
        fetchPRStatuses(),
      ]);
      setRows(allRows);
      setStatuses(allStatuses);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e?.message ?? "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const prs = rows.map((r) => rowToSummary(r, statuses));
  const recent = [...prs]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  const total = prs.length;
  const pending = prs.filter((p) => p.statusId === 1).length;
  const inProgress = prs.filter(
    (p) => p.statusId >= 2 && p.statusId <= 4,
  ).length;
  const atParpo = prs.filter((p) => p.statusId === 5).length;
  const approved = prs.filter((p) => p.statusId === 6).length;
  const highValue = prs.filter((p) => p.isHighValue).length;

  const thisWeek = (() => {
    const ago = new Date();
    ago.setDate(ago.getDate() - 7);
    return rows.filter((r) => r.created_at && new Date(r.created_at) >= ago)
      .length;
  })();

  const statCards: StatCard[] = [
    {
      label: "Total PRs",
      value: total,
      sub: `+${thisWeek} this week`,
      subType: "up",
      icon: "description",
    },
    {
      label: "Pending",
      value: pending,
      sub: "Awaiting Div. Head review",
      subType: "warn",
      icon: "pending-actions",
    },
    {
      label: "In Approval Flow",
      value: inProgress,
      sub: "Div. Head → BAC → Budget",
      subType: "info",
      icon: "autorenew",
    },
    {
      label: "Awaiting PARPO",
      value: atParpo,
      sub: "Final approval step",
      subType: "warn",
      icon: "verified-user",
    },
    {
      label: "Approved",
      value: approved,
      sub: "Phase 1 complete",
      subType: "ok",
      icon: "check-circle",
    },
    {
      label: "High-Value PRs",
      value: highValue,
      sub: "Total cost > ₱10,000",
      subType: "neutral",
      icon: "star",
    },
  ];

  // All live PRs are in Phase 1; future phases would need additional tables.
  const stages: StageCount[] = [
    { ...STAGE_CFG[0], count: total },
    { ...STAGE_CFG[1], count: 0 },
    { ...STAGE_CFG[2], count: 0 },
    { ...STAGE_CFG[3], count: 0 },
  ];

  // Approval funnel breakdown for the status chart.
  const statusBreakdown = [1, 2, 3, 4, 5, 6]
    .map((sid) => ({
      id: sid,
      label:
        statuses.find((s) => s.id === sid)?.status_name ??
        statusCfgFor(sid).label,
      count: prs.filter((p) => p.statusId === sid).length,
      color: statusCfgFor(sid).dot,
    }))
    .filter((s) => s.count > 0);

  return {
    prs,
    recent,
    statCards,
    stages,
    statusBreakdown,
    loading,
    error,
    refresh: load,
    lastRefresh,
  };
}

/**
 * Processor hook (role 2–5).
 * Fetches all PRs and surfaces the subset this role is responsible for.
 */
function useProcessorData(roleId: number) {
  const queueStatusId = ROLE_QUEUE_STATUS[roleId] ?? 1;

  const [rows, setRows] = useState<PRRow[]>([]);
  const [statuses, setStatuses] = useState<PRStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [allRows, allStatuses] = await Promise.all([
        fetchPurchaseRequests(),
        fetchPRStatuses(),
      ]);
      setRows(allRows);
      setStatuses(allStatuses);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e?.message ?? "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const prs = rows.map((r) => rowToSummary(r, statuses));
  const queue = prs.filter((p) => p.statusId === queueStatusId);
  const forwarded = prs.filter((p) => p.statusId > queueStatusId);
  const approved = prs.filter((p) => p.statusId === 6).length;

  const statCards: StatCard[] = [
    {
      label: "Action Required",
      value: queue.length,
      sub: queue.length > 0 ? "PRs awaiting your review" : "Queue is clear",
      subType: queue.length > 0 ? "warn" : "ok",
      icon: "pending-actions",
    },
    {
      label: "Total System PRs",
      value: prs.length,
      sub: "All divisions",
      subType: "info",
      icon: "description",
    },
    {
      label: "Forwarded",
      value: forwarded.length,
      sub: "Past your approval step",
      subType: "up",
      icon: "forward",
    },
    {
      label: "Fully Approved",
      value: approved,
      sub: "Phase 1 complete",
      subType: "ok",
      icon: "check-circle",
    },
  ];

  // Recent PRs that are NOT in this role's queue (read-only reference).
  const recentOther = prs
    .filter((p) => p.statusId !== queueStatusId)
    .slice(0, 6);

  return {
    queue,
    recentOther,
    statCards,
    totalCount: prs.length,
    loading,
    error,
    refresh: load,
    lastRefresh,
    queueStatusId,
  };
}

/** End-user hook — only their division's PRs. */
function useEndUserData(divisionId: number | null) {
  const [rows, setRows] = useState<PRRow[]>([]);
  const [statuses, setStatuses] = useState<PRStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [allRows, allStatuses] = await Promise.all([
        divisionId != null
          ? fetchPurchaseRequestsByDivision(divisionId)
          : fetchPurchaseRequests(),
        fetchPRStatuses(),
      ]);
      setRows(allRows);
      setStatuses(allStatuses);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e?.message ?? "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, [divisionId]);

  useEffect(() => {
    load();
  }, [load]);

  const prs = rows.map((r) => rowToSummary(r, statuses));
  const recent = [...prs]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  const pending = prs.filter((p) => p.statusId === 1).length;
  const inFlow = prs.filter((p) => p.statusId >= 2 && p.statusId <= 4).length;
  const approved = prs.filter((p) => p.statusId === 6).length;

  const statCards: StatCard[] = [
    {
      label: "My PRs",
      value: prs.length,
      sub: "Total submitted",
      subType: "info",
      icon: "description",
    },
    {
      label: "Pending",
      value: pending,
      sub: "Awaiting Div. Head review",
      subType: "warn",
      icon: "pending-actions",
    },
    {
      label: "In Approval Flow",
      value: inFlow,
      sub: "Being reviewed",
      subType: "up",
      icon: "autorenew",
    },
    {
      label: "Approved",
      value: approved,
      sub: "Phase 1 complete",
      subType: "ok",
      icon: "check-circle",
    },
  ];

  return {
    prs,
    recent,
    statCards,
    loading,
    error,
    refresh: load,
    lastRefresh,
  };
}

// ─── Shared micro-components ─────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f9fafb",
        gap: 12,
      }}>
      <ActivityIndicator size="large" color={CLR.brand500} />
      <Text style={{ color: "#9ca3af", fontSize: 13 }}>Loading dashboard…</Text>
    </View>
  );
}

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <View
      style={{
        margin: 16,
        backgroundColor: "#fef2f2",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#fecaca",
        padding: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}>
      <MaterialIcons name="error-outline" size={20} color="#dc2626" />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12.5, fontWeight: "700", color: "#991b1b" }}>
          Failed to load data
        </Text>
        <Text style={{ fontSize: 11.5, color: "#b91c1c", marginTop: 2 }}>
          {message}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onRetry}
        activeOpacity={0.8}
        style={{
          backgroundColor: "#dc2626",
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 8,
        }}>
        <Text style={{ fontSize: 11, fontWeight: "700", color: "#ffffff" }}>
          Retry
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function LastRefreshedBadge({ time }: { time: Date | null }) {
  if (!time) return null;
  const label = time.toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        alignSelf: "flex-end",
        paddingHorizontal: 16,
        paddingTop: 6,
        paddingBottom: 2,
      }}>
      <MaterialIcons name="update" size={11} color="#9ca3af" />
      <Text style={{ fontSize: 10.5, color: "#9ca3af" }}>Updated {label}</Text>
    </View>
  );
}

function StatPill({ card }: { card: StatCard }) {
  const subColors: Record<string, { text: string; bg: string }> = {
    up: { text: "#166534", bg: "#dcfce7" },
    warn: { text: "#854d0e", bg: "#fef9c3" },
    ok: { text: "#166534", bg: "#dcfce7" },
    info: { text: "#1e40af", bg: "#dbeafe" },
    neutral: { text: "#374151", bg: "#f3f4f6" },
  };
  const c = subColors[card.subType] ?? subColors.neutral;
  return (
    <View
      style={{
        backgroundColor: "#ffffff",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        padding: 16,
        flex: 1,
        minWidth: (SCREEN_W - 48) / 2,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
      }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 8,
        }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            backgroundColor: "#f0fdf4",
            alignItems: "center",
            justifyContent: "center",
          }}>
          <MaterialIcons name={card.icon} size={18} color={CLR.brand900} />
        </View>
        <Text
          style={{
            fontSize: 10,
            color: "#9ca3af",
            fontWeight: "600",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            textAlign: "right",
            maxWidth: "60%",
          }}
          numberOfLines={2}>
          {card.label}
        </Text>
      </View>
      <Text
        style={{
          fontSize: 32,
          fontWeight: "800",
          color: CLR.brand900,
          lineHeight: 36,
          marginBottom: 6,
        }}>
        {card.value}
      </Text>
      <View
        style={{
          backgroundColor: c.bg,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 999,
          alignSelf: "flex-start",
        }}>
        <Text style={{ fontSize: 11, fontWeight: "600", color: c.text }}>
          {card.sub}
        </Text>
      </View>
    </View>
  );
}

function SectionHeader({
  title,
  sub,
  onViewAll,
}: {
  title: string;
  sub?: string;
  onViewAll?: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingTop: 20,
        paddingBottom: 8,
      }}>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: "800",
            color: "#111827",
            letterSpacing: -0.3,
          }}>
          {title}
        </Text>
        {sub && (
          <Text style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>
            {sub}
          </Text>
        )}
      </View>
      {onViewAll && (
        <TouchableOpacity onPress={onViewAll} hitSlop={8}>
          <Text
            style={{ fontSize: 12, fontWeight: "600", color: CLR.brand700 }}>
            View all →
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function StatusBadge({ statusId }: { statusId: number }) {
  const cfg = statusCfgFor(statusId);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: cfg.bg,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
      }}>
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: cfg.dot,
        }}
      />
      <Text style={{ fontSize: 10, fontWeight: "700", color: cfg.text }}>
        {cfg.label}
      </Text>
    </View>
  );
}

function StageBadge({ stage }: { stage: number }) {
  const cfg = STAGE_CFG[(stage - 1) % STAGE_CFG.length];
  return (
    <View
      style={{
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 6,
        backgroundColor: cfg.color + "18",
      }}>
      <Text
        style={{
          fontSize: 9,
          fontWeight: "700",
          color: cfg.color,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}>
        P{stage}
      </Text>
    </View>
  );
}

/** Compact table row used in admin + processor views */
function PRTableRow({
  record,
  isEven,
  onPress,
}: {
  record: PRSummary;
  isEven: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 11,
        backgroundColor: isEven ? "#ffffff" : "#f9fafb",
        borderBottomWidth: 1,
        borderBottomColor: "#f3f4f6",
        gap: 8,
      }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            fontSize: 11.5,
            fontWeight: "700",
            color: CLR.brand900,
            fontFamily: MONO,
          }}>
          {record.prNo}
        </Text>
        <Text style={{ fontSize: 10.5, color: "#6b7280" }} numberOfLines={1}>
          {record.purpose}
        </Text>
      </View>
      <View style={{ width: 68, alignItems: "center" }}>
        <Text
          style={{
            fontSize: 9.5,
            fontWeight: "700",
            color: CLR.brand700,
            backgroundColor: "#ecfdf5",
            borderRadius: 6,
            paddingHorizontal: 6,
            paddingVertical: 2,
          }}
          numberOfLines={1}>
          {record.section}
        </Text>
      </View>
      <View style={{ width: 90, alignItems: "center" }}>
        <StatusBadge statusId={record.statusId} />
      </View>
      <StageBadge stage={1} />
      <Text
        style={{
          fontSize: 10.5,
          fontWeight: "700",
          color: "#374151",
          fontFamily: MONO,
          width: 60,
          textAlign: "right",
        }}>
        ₱{record.totalCost.toLocaleString("en-PH")}
      </Text>
      <MaterialIcons name="chevron-right" size={16} color="#d1d5db" />
    </TouchableOpacity>
  );
}

/** Phase 1 step tracker — status_id drives which nodes are filled */
const PR_STEPS = [
  { key: "submitted", label: "Submitted", icon: "description" as const },
  { key: "div_head", label: "Div. Head", icon: "how-to-reg" as const },
  { key: "bac", label: "BAC", icon: "gavel" as const },
  { key: "budget", label: "Budget", icon: "account-balance" as const },
  { key: "parpo", label: "PARPO", icon: "verified" as const },
];

/**
 * status_id → active step index (0-based).
 *   1 → step 0 active (just submitted)
 *   2 → step 1 active (at Div. Head)
 *   …
 *   6 → all done
 */
function statusIdToStep(statusId: number): number {
  if (statusId >= 6) return PR_STEPS.length;
  return Math.max(0, statusId - 1);
}

function PRTrackerCard({
  pr,
  onPress,
}: {
  pr: PRSummary;
  onPress: () => void;
}) {
  const currentStep = statusIdToStep(pr.statusId);
  const cfg = statusCfgFor(pr.statusId);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        backgroundColor: "#ffffff",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        marginHorizontal: 12,
        marginBottom: 12,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 2,
      }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: "#f3f4f6",
        }}>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 12,
              fontWeight: "700",
              color: CLR.brand900,
              fontFamily: MONO,
            }}>
            {pr.prNo}
          </Text>
          <Text
            style={{ fontSize: 11.5, color: "#6b7280", marginTop: 2 }}
            numberOfLines={1}>
            {pr.purpose}
          </Text>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            backgroundColor: cfg.bg,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
          }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: cfg.dot,
            }}
          />
          <Text style={{ fontSize: 10, fontWeight: "700", color: cfg.text }}>
            {cfg.label}
          </Text>
        </View>
      </View>

      {/* Step tracker */}
      <View style={{ paddingHorizontal: 14, paddingVertical: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {PR_STEPS.map((step, i) => {
            const done = i < currentStep;
            const active = i === currentStep;
            return (
              <React.Fragment key={step.key}>
                <View style={{ alignItems: "center", gap: 4 }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: done
                        ? CLR.brand900
                        : active
                          ? "#ecfdf5"
                          : "#f9fafb",
                      borderWidth: active ? 2 : 1,
                      borderColor: active
                        ? CLR.brand500
                        : done
                          ? CLR.brand900
                          : "#e5e7eb",
                      alignItems: "center",
                      justifyContent: "center",
                    }}>
                    <MaterialIcons
                      name={done ? "check" : step.icon}
                      size={15}
                      color={
                        done ? "#ffffff" : active ? CLR.brand500 : "#d1d5db"
                      }
                    />
                  </View>
                  <Text
                    style={{
                      fontSize: 8.5,
                      fontWeight: active || done ? "700" : "500",
                      color: done
                        ? CLR.brand900
                        : active
                          ? CLR.brand500
                          : "#9ca3af",
                      textAlign: "center",
                      maxWidth: 38,
                    }}
                    numberOfLines={1}>
                    {step.label}
                  </Text>
                </View>
                {i < PR_STEPS.length - 1 && (
                  <View
                    style={{
                      flex: 1,
                      height: 2,
                      marginBottom: 14,
                      marginHorizontal: 2,
                      backgroundColor:
                        i < currentStep ? CLR.brand900 : "#e5e7eb",
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </View>
      </View>

      {/* Footer */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingBottom: 12,
        }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <MaterialIcons name="calendar-today" size={11} color="#9ca3af" />
          <Text style={{ fontSize: 11, color: "#9ca3af" }}>{pr.date}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {pr.isHighValue && (
            <View
              style={{
                backgroundColor: "#022c22",
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 6,
              }}>
              <Text
                style={{ fontSize: 9, fontWeight: "700", color: "#a7f3d0" }}>
                HIGH-VALUE
              </Text>
            </View>
          )}
          <Text
            style={{
              fontSize: 12,
              fontWeight: "700",
              color: "#374151",
              fontFamily: MONO,
            }}>
            ₱{pr.totalCost.toLocaleString("en-PH")}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

/** Horizontal progress bar + phase chips */
function PhasePipeline({ stages }: { stages: StageCount[] }) {
  const total = stages.reduce((s, st) => s + st.count, 0) || 1;
  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 4, gap: 10 }}>
      <View
        style={{
          flexDirection: "row",
          height: 6,
          borderRadius: 999,
          overflow: "hidden",
          backgroundColor: "#f3f4f6",
        }}>
        {stages.map((st) => (
          <View
            key={st.stage}
            style={{
              flex: Math.max(st.count / total, 0.01),
              backgroundColor: st.color,
            }}
          />
        ))}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexDirection: "row", gap: 8 }}>
        {stages.map((st) => (
          <View
            key={st.stage}
            style={{
              backgroundColor: st.color + "15",
              borderRadius: 10,
              borderWidth: 1,
              borderColor: st.color + "40",
              paddingHorizontal: 12,
              paddingVertical: 8,
              alignItems: "center",
              gap: 2,
              minWidth: 80,
            }}>
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color: st.color,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}>
              {st.shortLabel}
            </Text>
            <Text style={{ fontSize: 22, fontWeight: "800", color: st.color }}>
              {st.count}
            </Text>
            <Text
              style={{
                fontSize: 9.5,
                color: st.color + "cc",
                textAlign: "center",
                fontWeight: "500",
              }}
              numberOfLines={1}>
              {st.label}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/** Horizontal bar chart showing how many PRs sit at each status */
function ApprovalFunnelChart({
  breakdown,
}: {
  breakdown: { id: number; label: string; count: number; color: string }[];
}) {
  const total = breakdown.reduce((s, b) => s + b.count, 0) || 1;
  return (
    <View style={{ gap: 10 }}>
      {breakdown.length === 0 ? (
        <Text
          style={{
            fontSize: 12,
            color: "#9ca3af",
            textAlign: "center",
            paddingVertical: 8,
          }}>
          No purchase requests yet.
        </Text>
      ) : (
        breakdown.map((b) => (
          <View key={b.id}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 4,
              }}>
              <Text
                style={{ fontSize: 11, color: "#6b7280", flex: 1 }}
                numberOfLines={1}>
                {b.label}
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: "#374151",
                  fontFamily: MONO,
                }}>
                {b.count}
                <Text style={{ color: "#9ca3af", fontWeight: "400" }}>
                  {" "}
                  ({Math.round((b.count / total) * 100)}%)
                </Text>
              </Text>
            </View>
            <View
              style={{
                height: 7,
                borderRadius: 999,
                backgroundColor: "#f3f4f6",
              }}>
              <View
                style={{
                  height: 7,
                  borderRadius: 999,
                  backgroundColor: b.color,
                  width:
                    `${Math.max(Math.round((b.count / total) * 100), 2)}%` as any,
                }}
              />
            </View>
          </View>
        ))
      )}
    </View>
  );
}

/** Shared green welcome header bar */
function WelcomeHeader({
  roleLabel,
  username,
}: {
  roleLabel: string;
  username: string;
}) {
  return (
    <View
      style={{
        backgroundColor: CLR.brand900,
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 20,
      }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}>
        <View style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
            }}>
            <View
              style={{
                backgroundColor: "rgba(255,255,255,0.12)",
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 6,
              }}>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "700",
                  color: CLR.brand100,
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                }}>
                {roleLabel}
              </Text>
            </View>
          </View>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "800",
              color: "#ffffff",
              letterSpacing: -0.4,
            }}>
            {username}
          </Text>
          <Text style={{ fontSize: 12, color: CLR.brand100, marginTop: 2 }}>
            {new Date().toLocaleDateString("en-PH", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Dashboard entry point ────────────────────────────────────────────────────

export default function DashboardScreen({ navigation }: any) {
  const { currentUser } = useAuth();
  const roleId = currentUser?.role_id ?? 6;

  if (roleId === 1) return <AdminDashboard navigation={navigation} />;
  if (roleId in ROLE_QUEUE_STATUS)
    return <ProcessorDashboard navigation={navigation} roleId={roleId} />;
  return <EndUserDashboard navigation={navigation} />;
}

// ─── Admin Dashboard (role_id 1) ─────────────────────────────────────────────
// System-wide overview: all PRs, KPI cards, approval funnel, pipeline.

function AdminDashboard({ navigation }: any) {
  const { currentUser } = useAuth();
  const {
    prs,
    recent,
    statCards,
    stages,
    statusBreakdown,
    loading,
    error,
    refresh,
    lastRefresh,
  } = useAdminData();

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && prs.length === 0) return <LoadingScreen />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#f9fafb" }}
      contentContainerStyle={{ paddingBottom: 36 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={CLR.brand500}
        />
      }>
      <WelcomeHeader
        roleLabel="Admin · System Overview"
        username={currentUser?.username ?? "Administrator"}
      />

      {error && <ErrorBanner message={error} onRetry={refresh} />}
      <LastRefreshedBadge time={lastRefresh} />

      {/* ── KPI stat cards ── */}
      <View
        style={{
          paddingHorizontal: 12,
          paddingTop: 8,
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
        }}>
        {statCards.map((card) => (
          <StatPill key={card.label} card={card} />
        ))}
      </View>

      {/* ── Phase pipeline ── */}
      <SectionHeader
        title="Procurement Pipeline"
        sub="Current phase distribution across all PRs"
      />
      <PhasePipeline stages={stages} />

      {/* ── Approval funnel ── */}
      <View
        style={{
          marginHorizontal: 12,
          marginTop: 16,
          backgroundColor: "#ffffff",
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "#e5e7eb",
          padding: 16,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 6,
          elevation: 2,
        }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "800",
            color: "#111827",
            marginBottom: 12,
          }}>
          Approval Funnel
        </Text>
        <ApprovalFunnelChart breakdown={statusBreakdown} />
      </View>

      {/* ── Recent PRs table ── */}
      <View
        style={{
          marginHorizontal: 12,
          marginTop: 12,
          backgroundColor: "#ffffff",
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "#e5e7eb",
          overflow: "hidden",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 6,
          elevation: 2,
        }}>
        <SectionHeader
          title="All Recent Purchase Requests"
          sub={`${prs.length} total across all divisions`}
          onViewAll={() => navigation?.navigate?.("Procurement")}
        />

        {/* Column headers */}
        <View
          style={{
            flexDirection: "row",
            paddingHorizontal: 14,
            paddingBottom: 8,
            borderBottomWidth: 1,
            borderBottomColor: "#f3f4f6",
          }}>
          {[
            { label: "PR / Purpose", flex: 1 },
            { label: "Section", w: 68 },
            { label: "Status", w: 90 },
            { label: "Ph", w: 24 },
            { label: "Amount", w: 60, right: true },
          ].map((h) => (
            <Text
              key={h.label}
              style={{
                fontSize: 9,
                fontWeight: "700",
                color: "#9ca3af",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                flex: (h as any).flex,
                width: (h as any).w,
                textAlign: h.right ? "right" : "left",
              }}>
              {h.label}
            </Text>
          ))}
          <View style={{ width: 16 }} />
        </View>

        {recent.length === 0 ? (
          <View style={{ paddingVertical: 28, alignItems: "center", gap: 8 }}>
            <MaterialIcons name="inbox" size={32} color="#d1d5db" />
            <Text style={{ fontSize: 13, color: "#9ca3af" }}>
              No purchase requests found.
            </Text>
          </View>
        ) : (
          recent.map((record, i) => (
            <PRTableRow
              key={record.id}
              record={record}
              isEven={i % 2 === 0}
              onPress={() => navigation?.navigate?.("Procurement")}
            />
          ))
        )}
      </View>

      {/* ── Admin quick actions ── */}
      <SectionHeader title="Admin Actions" />
      <QuickActionGrid navigation={navigation} roleId={1} />
    </ScrollView>
  );
}

// ─── Processor Dashboard (role_id 2–5) ────────────────────────────────────────
// Shows the role's personal action queue prominently, plus visibility into all PRs.

function ProcessorDashboard({
  navigation,
  roleId,
}: {
  navigation: any;
  roleId: number;
}) {
  const { currentUser } = useAuth();
  const {
    queue,
    recentOther,
    statCards,
    loading,
    error,
    refresh,
    lastRefresh,
    queueStatusId,
  } = useProcessorData(roleId);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const roleLabel = ROLE_LABELS[roleId] ?? "Processor";
  const queueCfg = statusCfgFor(queueStatusId);

  if (loading && queue.length === 0 && recentOther.length === 0)
    return <LoadingScreen />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#f9fafb" }}
      contentContainerStyle={{ paddingBottom: 36 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={CLR.brand500}
        />
      }>
      <WelcomeHeader
        roleLabel={roleLabel}
        username={currentUser?.username ?? roleLabel}
      />

      {error && <ErrorBanner message={error} onRetry={refresh} />}
      <LastRefreshedBadge time={lastRefresh} />

      {/* ── Stat cards ── */}
      <View
        style={{
          paddingHorizontal: 12,
          paddingTop: 8,
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
        }}>
        {statCards.map((card) => (
          <StatPill key={card.label} card={card} />
        ))}
      </View>

      {/* ── Action queue ── */}
      <View style={{ marginTop: 20, paddingHorizontal: 16, paddingBottom: 10 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "800", color: "#111827" }}>
              Your Action Queue
            </Text>
            <Text style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>
              PRs waiting for your review and sign-off
            </Text>
          </View>
          {queue.length > 0 && (
            <View
              style={{
                backgroundColor: queueCfg.bg,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: queueCfg.dot + "60",
              }}>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "800",
                  color: queueCfg.text,
                }}>
                {queue.length} pending
              </Text>
            </View>
          )}
        </View>
      </View>

      {queue.length === 0 ? (
        <View
          style={{
            marginHorizontal: 12,
            backgroundColor: "#f0fdf4",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#bbf7d0",
            padding: 28,
            alignItems: "center",
            gap: 8,
          }}>
          <MaterialIcons name="check-circle" size={40} color={CLR.brand500} />
          <Text
            style={{ fontSize: 14, fontWeight: "700", color: CLR.brand900 }}>
            Queue is clear!
          </Text>
          <Text style={{ fontSize: 12, color: "#6b7280", textAlign: "center" }}>
            No PRs require your attention right now.{"\n"}Pull down to refresh.
          </Text>
        </View>
      ) : (
        <View
          style={{
            marginHorizontal: 12,
            backgroundColor: "#ffffff",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#e5e7eb",
            overflow: "hidden",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 6,
            elevation: 2,
          }}>
          {queue.map((record, i) => (
            <PRTableRow
              key={record.id}
              record={record}
              isEven={i % 2 === 0}
              onPress={() => navigation?.navigate?.("Procurement")}
            />
          ))}
        </View>
      )}

      {/* ── Other PRs in system (read-only) ── */}
      {recentOther.length > 0 && (
        <View
          style={{
            marginHorizontal: 12,
            marginTop: 16,
            backgroundColor: "#ffffff",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#e5e7eb",
            overflow: "hidden",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 6,
            elevation: 2,
          }}>
          <SectionHeader
            title="Other PRs in System"
            sub="Not currently in your queue"
            onViewAll={() => navigation?.navigate?.("Procurement")}
          />
          {recentOther.map((record, i) => (
            <PRTableRow
              key={record.id}
              record={record}
              isEven={i % 2 === 0}
              onPress={() => navigation?.navigate?.("Procurement")}
            />
          ))}
        </View>
      )}

      {/* ── Quick actions ── */}
      <SectionHeader title="Quick Actions" />
      <QuickActionGrid navigation={navigation} roleId={roleId} />
    </ScrollView>
  );
}

// ─── End-User Dashboard (role_id 6+) ─────────────────────────────────────────
// Personal view: own division's PRs, tracker cards, quick actions.

function EndUserDashboard({ navigation }: any) {
  const { currentUser } = useAuth();
  const divisionId = currentUser?.division_id ?? null;
  const { prs, recent, statCards, loading, error, refresh, lastRefresh } =
    useEndUserData(divisionId);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && prs.length === 0) return <LoadingScreen />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#f9fafb" }}
      contentContainerStyle={{ paddingBottom: 36 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={CLR.brand500}
        />
      }>
      <WelcomeHeader
        roleLabel={currentUser?.division_name ?? "End User"}
        username={currentUser?.username ?? "Welcome"}
        // onNewPR={() => navigation?.navigate?.("Procurement")}
      />

      {error && <ErrorBanner message={error} onRetry={refresh} />}
      <LastRefreshedBadge time={lastRefresh} />

      {/* ── Stat cards ── */}
      <View
        style={{
          paddingHorizontal: 12,
          paddingTop: 8,
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
        }}>
        {statCards.map((card) => (
          <StatPill key={card.label} card={card} />
        ))}
      </View>

      {/* ── My PRs (tracker cards) ── */}
      <SectionHeader
        title="My Purchase Requests"
        sub={
          prs.length > 0 ? `${prs.length} total in your division` : undefined
        }
        onViewAll={
          prs.length > 0
            ? () => navigation?.navigate?.("Procurement")
            : undefined
        }
      />

      {recent.length === 0 ? (
        <View
          style={{
            marginHorizontal: 12,
            backgroundColor: "#f9fafb",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#e5e7eb",
            padding: 28,
            alignItems: "center",
            gap: 10,
          }}>
          <MaterialIcons name="description" size={36} color="#d1d5db" />
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#374151" }}>
            No Purchase Requests
          </Text>
          <Text style={{ fontSize: 12, color: "#9ca3af", textAlign: "center" }}>
            You haven't submitted any PRs yet.{"\n"}Tap "New PR" to get started.
          </Text>
          {/* <TouchableOpacity
            onPress={() => navigation?.navigate?.("Procurement")}
            activeOpacity={0.8}
            style={{
              marginTop: 4, backgroundColor: CLR.brand900,
              paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10,
            }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#ffffff" }}>
              Create First PR
            </Text>
          </TouchableOpacity> */}
        </View>
      ) : (
        recent.map((pr) => (
          <PRTrackerCard
            key={pr.id}
            pr={pr}
            onPress={() => navigation?.navigate?.("Procurement")}
          />
        ))
      )}

      {/* ── Quick actions ── */}
      <SectionHeader title="Quick Actions" />
      <QuickActionGrid navigation={navigation} roleId={6} />
    </ScrollView>
  );
}

// ─── Shared action grid ───────────────────────────────────────────────────────

const ACTION_GRID: Record<number, { label: string; icon: any; nav: string }[]> =
  {
    1: [
      { label: "Manage PRs", icon: "description", nav: "Procurement" },
      { label: "Canvassing", icon: "create", nav: "Canvassing" },
      { label: "Track Delivery", icon: "local-shipping", nav: "Procurement" },
      { label: "Payment", icon: "account-balance-wallet", nav: "Procurement" },
      { label: "Reports", icon: "bar-chart", nav: "Procurement" },
      { label: "Procurement Log", icon: "history", nav: "ProcurementLog" },
      {
        label: "User Management",
        icon: "manage-accounts",
        nav: "UserManagement",
      },
    ],
    2: [
      { label: "Review Queue", icon: "pending-actions", nav: "Procurement" },
      { label: "All PRs", icon: "description", nav: "Procurement" },
      { label: "Procurement Log", icon: "history", nav: "ProcurementLog" },
      { label: "Canvassing", icon: "create", nav: "Canvassing" },
    ],
    3: [
      { label: "Review Queue", icon: "pending-actions", nav: "Procurement" },
      { label: "All PRs", icon: "description", nav: "Procurement" },
      { label: "APP Tracking", icon: "gavel", nav: "Procurement" },
      { label: "Procurement Log", icon: "history", nav: "ProcurementLog" },
      { label: "Canvassing", icon: "create", nav: "Canvassing" },
    ],
    4: [
      { label: "Review Queue", icon: "pending-actions", nav: "Procurement" },
      { label: "All PRs", icon: "description", nav: "Procurement" },
      { label: "Budget Codes", icon: "account-balance", nav: "Procurement" },
      { label: "Procurement Log", icon: "history", nav: "ProcurementLog" },
    ],
    5: [
      { label: "Review Queue", icon: "pending-actions", nav: "Procurement" },
      { label: "All PRs", icon: "description", nav: "Procurement" },
      { label: "Reports", icon: "bar-chart", nav: "Procurement" },
      { label: "Procurement Log", icon: "history", nav: "ProcurementLog" },
      { label: "Canvassing", icon: "create", nav: "Canvassing" },
    ],
    6: [
      { label: "New PR", icon: "add-circle-outline", nav: "Procurement" },
      { label: "Track PR", icon: "track-changes", nav: "Procurement" },
      { label: "View History", icon: "history", nav: "ProcurementLog" },
      { label: "Canvassing", icon: "create", nav: "Canvassing" },
    ],
  };

function QuickActionGrid({
  navigation,
  roleId,
}: {
  navigation: any;
  roleId: number;
}) {
  const actions = ACTION_GRID[roleId] ?? ACTION_GRID[6];
  return (
    <View
      style={{
        flexDirection: "row",
        paddingHorizontal: 12,
        gap: 8,
        flexWrap: "wrap",
      }}>
      {actions.map((a) => (
        <TouchableOpacity
          key={a.label}
          onPress={() => navigation?.navigate?.(a.nav)}
          activeOpacity={0.8}
          style={{
            flex: 1,
            minWidth: (SCREEN_W - 56) / 2,
            backgroundColor: "#ffffff",
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "#e5e7eb",
            paddingVertical: 14,
            paddingHorizontal: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.04,
            shadowRadius: 4,
            elevation: 1,
          }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: "#ecfdf5",
              alignItems: "center",
              justifyContent: "center",
            }}>
            <MaterialIcons name={a.icon} size={20} color={CLR.brand900} />
          </View>
          <Text style={{ fontSize: 12.5, fontWeight: "700", color: "#111827" }}>
            {a.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
