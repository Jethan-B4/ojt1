/**
 * dashboard.tsx
 *
 * DAR Procurement Dashboard — real-time Supabase data, role-aware views.
 *
 * Role routing:
 *   role_id 1  → AdminDashboard      — system-wide KPIs, approval funnel, recent PRs
 *   role_id 2  → ProcessorDashboard  — Division Head: queue of status_id 1 PRs
 *   role_id 3  → ProcessorDashboard  — BAC: queue of status_id 2 PRs
 *   role_id 4  → ProcessorDashboard  — Budget: queue of status_id 3 PRs
 *   role_id 5  → ProcessorDashboard  — PARPO: queue of status_id 4 PRs
 *   role_id 6+ → EndUserDashboard    — own division's PRs only
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
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

const STATUS_ID_CFG: Record<
  number,
  { bg: string; text: string; dot: string; label: string }
> = {
  1: { bg: "#fefce8", text: "#854d0e", dot: "#eab308", label: "Pending" },
  2: { bg: "#eff6ff", text: "#1e40af", dot: "#3b82f6", label: "Div. Head" },
  3: { bg: "#f5f3ff", text: "#5b21b6", dot: "#8b5cf6", label: "BAC" },
  4: { bg: "#fff7ed", text: "#9a3412", dot: "#f97316", label: "Budget" },
  5: { bg: "#ecfdf5", text: "#065f46", dot: "#10b981", label: "PARPO" },
  6: { bg: "#f0fdf4", text: "#166534", dot: "#22c55e", label: "Approved" },
};

const ROLE_QUEUE_STATUS: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4 };

const ROLE_LABELS: Record<number, string> = {
  1: "Admin",
  2: "Division Head",
  3: "BAC",
  4: "Budget Officer",
  5: "PARPO",
  6: "End User",
  8: "Supply",
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

interface StatCard {
  label: string;
  value: number | string;
  icon: keyof typeof MaterialIcons.glyphMap;
  accent: string;
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

  const statCards: StatCard[] = [
    { label: "Total", value: total, icon: "description", accent: CLR.brand700 },
    {
      label: "Pending",
      value: pending,
      icon: "pending-actions",
      accent: "#d97706",
    },
    {
      label: "In Flow",
      value: inProgress,
      icon: "autorenew",
      accent: "#3b82f6",
    },
    {
      label: "At PARPO",
      value: atParpo,
      icon: "verified-user",
      accent: "#8b5cf6",
    },
    {
      label: "Approved",
      value: approved,
      icon: "check-circle",
      accent: "#16a34a",
    },
  ];

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
    statusBreakdown,
    loading,
    error,
    refresh: load,
    lastRefresh,
  };
}

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

  const prs = rows.map((r) => rowToSummary(r, statuses));
  const queue = prs.filter((p) => p.statusId === queueStatusId);
  const forwarded = prs.filter((p) => p.statusId > queueStatusId);
  const approved = prs.filter((p) => p.statusId === 6).length;
  const recentOther = prs
    .filter((p) => p.statusId !== queueStatusId)
    .slice(0, 6);

  const statCards: StatCard[] = [
    {
      label: "Action Required",
      value: queue.length,
      icon: "pending-actions",
      accent: queue.length > 0 ? "#d97706" : "#16a34a",
    },
    {
      label: "Total PRs",
      value: prs.length,
      icon: "description",
      accent: CLR.brand700,
    },
    {
      label: "Forwarded",
      value: forwarded.length,
      icon: "forward",
      accent: "#3b82f6",
    },
    {
      label: "Approved",
      value: approved,
      icon: "check-circle",
      accent: "#16a34a",
    },
  ];

  return {
    queue,
    recentOther,
    statCards,
    loading,
    error,
    refresh: load,
    lastRefresh,
    queueStatusId,
  };
}

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
      icon: "description",
      accent: CLR.brand700,
    },
    {
      label: "Pending",
      value: pending,
      icon: "pending-actions",
      accent: "#d97706",
    },
    { label: "In Flow", value: inFlow, icon: "autorenew", accent: "#3b82f6" },
    {
      label: "Approved",
      value: approved,
      icon: "check-circle",
      accent: "#16a34a",
    },
  ];

  return { prs, recent, statCards, loading, error, refresh: load, lastRefresh };
}

// ─── Supply data hook — all PRs across all divisions ─────────────────────────

function useSupplyData() {
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

  const prs = rows.map((r) => rowToSummary(r, statuses));
  const recent = [...prs]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  // Supply-relevant KPIs: total system PRs, those ready for PO (status >= 6),
  // pending (still in approval pipeline), and high-value count.
  const total = prs.length;
  const readyForPO = prs.filter((p) => p.statusId >= 6).length;
  const pending = prs.filter((p) => p.statusId < 6).length;
  const highValue = prs.filter((p) => p.isHighValue).length;

  const statCards: StatCard[] = [
    {
      label: "Total PRs",
      value: total,
      icon: "description",
      accent: CLR.brand700,
    },
    {
      label: "Ready / PO",
      value: readyForPO,
      icon: "receipt-long",
      accent: "#16a34a",
    },
    {
      label: "In Pipeline",
      value: pending,
      icon: "pending-actions",
      accent: "#d97706",
    },
    {
      label: "High-Value",
      value: highValue,
      icon: "monetization-on",
      accent: "#7c3aed",
    },
  ];

  return { prs, recent, statCards, loading, error, refresh: load, lastRefresh };
}

function LoadingScreen() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f9fafb",
        gap: 12,
      }}
    >
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
        margin: 12,
        backgroundColor: "#fef2f2",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#fecaca",
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <MaterialIcons name="error-outline" size={18} color="#dc2626" />
      <Text style={{ flex: 1, fontSize: 12, color: "#991b1b" }}>{message}</Text>
      <TouchableOpacity
        onPress={onRetry}
        activeOpacity={0.8}
        style={{
          backgroundColor: "#dc2626",
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: 7,
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: "700", color: "#ffffff" }}>
          Retry
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function LastRefreshedBadge({ time }: { time: Date | null }) {
  if (!time) return null;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        alignSelf: "flex-end",
        paddingHorizontal: 14,
        paddingTop: 4,
        paddingBottom: 2,
      }}
    >
      <MaterialIcons name="update" size={10} color="#9ca3af" />
      <Text style={{ fontSize: 10, color: "#9ca3af" }}>
        Updated{" "}
        {time.toLocaleTimeString("en-PH", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </Text>
    </View>
  );
}

/**
 * Compact stat tile — 4-per-row.
 * Icon tinted with accent colour, large number, small uppercase label.
 */
function StatTile({ card }: { card: StatCard }) {
  const tileW = (SCREEN_W - 12 * 2 - 6 * 4) / 4; // 4 cols, 12px side padding, 6px gaps
  return (
    <View
      style={{
        width: tileW,
        backgroundColor: "#ffffff",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        paddingVertical: 10,
        paddingHorizontal: 6,
        alignItems: "center",
        gap: 4,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
        elevation: 1,
      }}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 7,
          backgroundColor: card.accent + "18",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MaterialIcons name={card.icon} size={14} color={card.accent} />
      </View>
      <Text
        style={{
          fontSize: 20,
          fontWeight: "800",
          color: CLR.brand900,
          lineHeight: 24,
        }}
      >
        {card.value}
      </Text>
      <Text
        style={{
          fontSize: 9,
          fontWeight: "600",
          color: "#9ca3af",
          textAlign: "center",
          textTransform: "uppercase",
          letterSpacing: 0.3,
        }}
        numberOfLines={1}
      >
        {card.label}
      </Text>
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
        paddingHorizontal: 14,
        paddingTop: 16,
        paddingBottom: 8,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "800",
            color: "#111827",
            letterSpacing: -0.2,
          }}
        >
          {title}
        </Text>
        {sub && (
          <Text style={{ fontSize: 10.5, color: "#9ca3af", marginTop: 1 }}>
            {sub}
          </Text>
        )}
      </View>
      {onViewAll && (
        <TouchableOpacity onPress={onViewAll} hitSlop={8}>
          <Text
            style={{ fontSize: 11.5, fontWeight: "600", color: CLR.brand700 }}
          >
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
        gap: 3,
        backgroundColor: cfg.bg,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 999,
      }}
    >
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 2.5,
          backgroundColor: cfg.dot,
        }}
      />
      <Text style={{ fontSize: 9.5, fontWeight: "700", color: cfg.text }}>
        {cfg.label}
      </Text>
    </View>
  );
}

/** Compact PR row — no stage badge, tighter padding */
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
        paddingHorizontal: 12,
        paddingVertical: 9,
        backgroundColor: isEven ? "#ffffff" : "#f9fafb",
        borderBottomWidth: 1,
        borderBottomColor: "#f3f4f6",
        gap: 8,
      }}
    >
      <View style={{ flex: 1, gap: 1 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: "700",
            color: CLR.brand900,
            fontFamily: MONO,
          }}
        >
          {record.prNo}
        </Text>
        <Text style={{ fontSize: 10, color: "#6b7280" }} numberOfLines={1}>
          {record.purpose}
        </Text>
      </View>
      <StatusBadge statusId={record.statusId} />
      <Text
        style={{
          fontSize: 10,
          fontWeight: "700",
          color: "#374151",
          fontFamily: MONO,
          minWidth: 54,
          textAlign: "right",
        }}
      >
        ₱{record.totalCost.toLocaleString("en-PH")}
      </Text>
      <MaterialIcons name="chevron-right" size={14} color="#d1d5db" />
    </TouchableOpacity>
  );
}

/** Slim PR card for End-User — status pill + cost, no step tracker */
function PRSummaryCard({
  pr,
  onPress,
}: {
  pr: PRSummary;
  onPress: () => void;
}) {
  const cfg = statusCfgFor(pr.statusId);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        backgroundColor: "#ffffff",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        marginHorizontal: 12,
        marginBottom: 8,
        paddingHorizontal: 14,
        paddingVertical: 11,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
      }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: cfg.dot,
        }}
      />
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 11.5,
            fontWeight: "700",
            color: CLR.brand900,
            fontFamily: MONO,
          }}
        >
          {pr.prNo}
        </Text>
        <Text
          style={{ fontSize: 10.5, color: "#6b7280", marginTop: 1 }}
          numberOfLines={1}
        >
          {pr.purpose}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 3 }}>
        <View
          style={{
            backgroundColor: cfg.bg,
            paddingHorizontal: 7,
            paddingVertical: 2,
            borderRadius: 999,
          }}
        >
          <Text style={{ fontSize: 9.5, fontWeight: "700", color: cfg.text }}>
            {cfg.label}
          </Text>
        </View>
        <Text
          style={{
            fontSize: 10.5,
            fontWeight: "700",
            color: "#374151",
            fontFamily: MONO,
          }}
        >
          ₱{pr.totalCost.toLocaleString("en-PH")}
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={14} color="#d1d5db" />
    </TouchableOpacity>
  );
}

/** Compact horizontal-bar approval funnel */
function ApprovalFunnelChart({
  breakdown,
}: {
  breakdown: { id: number; label: string; count: number; color: string }[];
}) {
  const total = breakdown.reduce((s, b) => s + b.count, 0) || 1;
  if (breakdown.length === 0) {
    return (
      <Text
        style={{
          fontSize: 12,
          color: "#9ca3af",
          textAlign: "center",
          paddingVertical: 12,
        }}
      >
        No purchase requests yet.
      </Text>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      {breakdown.map((b) => (
        <View key={b.id}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: 3,
            }}
          >
            <Text
              style={{ fontSize: 10.5, color: "#6b7280" }}
              numberOfLines={1}
            >
              {b.label}
            </Text>
            <Text
              style={{
                fontSize: 10.5,
                fontWeight: "700",
                color: "#374151",
                fontFamily: MONO,
              }}
            >
              {b.count}
              <Text style={{ color: "#9ca3af", fontWeight: "400" }}>
                {" "}
                ({Math.round((b.count / total) * 100)}%)
              </Text>
            </Text>
          </View>
          <View
            style={{ height: 5, borderRadius: 999, backgroundColor: "#f3f4f6" }}
          >
            <View
              style={{
                height: 5,
                borderRadius: 999,
                backgroundColor: b.color,
                width:
                  `${Math.max(Math.round((b.count / total) * 100), 2)}%` as any,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Compact green welcome header */
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
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 16,
      }}
    >
      <View
        style={{
          backgroundColor: "rgba(255,255,255,0.10)",
          paddingHorizontal: 7,
          paddingVertical: 2,
          borderRadius: 5,
          alignSelf: "flex-start",
          marginBottom: 6,
        }}
      >
        <Text
          style={{
            fontSize: 9.5,
            fontWeight: "700",
            color: CLR.brand100,
            textTransform: "uppercase",
            letterSpacing: 0.7,
          }}
        >
          {roleLabel}
        </Text>
      </View>
      <Text
        style={{
          fontSize: 18,
          fontWeight: "800",
          color: "#ffffff",
          letterSpacing: -0.3,
        }}
      >
        {username}
      </Text>
      <Text style={{ fontSize: 11, color: CLR.brand100, marginTop: 2 }}>
        {new Date().toLocaleDateString("en-PH", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </Text>
    </View>
  );
}

/** 2-column quick action grid */
const ACTION_GRID: Record<number, { label: string; icon: any; nav: string }[]> =
  {
    1: [
      { label: "Manage PRs", icon: "description", nav: "Procurement" },
      { label: "Procurement Log", icon: "history", nav: "ProcurementLog" },
      {
        label: "User Management",
        icon: "manage-accounts",
        nav: "UserManagement",
      },
      { label: "Canvassing", icon: "gavel", nav: "Canvassing" },
    ],
    2: [
      { label: "Review Queue", icon: "pending-actions", nav: "Procurement" },
      { label: "All PRs", icon: "description", nav: "Procurement" },
      { label: "Procurement Log", icon: "history", nav: "ProcurementLog" },
      { label: "Canvassing", icon: "gavel", nav: "Canvassing" },
    ],
    3: [
      { label: "Review Queue", icon: "pending-actions", nav: "Procurement" },
      { label: "All PRs", icon: "description", nav: "Procurement" },
      { label: "Procurement Log", icon: "history", nav: "ProcurementLog" },
      { label: "Canvassing", icon: "gavel", nav: "Canvassing" },
    ],
    4: [
      { label: "Review Queue", icon: "pending-actions", nav: "Procurement" },
      { label: "All PRs", icon: "description", nav: "Procurement" },
      { label: "Procurement Log", icon: "history", nav: "ProcurementLog" },
      { label: "Budget", icon: "account-balance-wallet", nav: "Budget" },
    ],
    5: [
      { label: "Review Queue", icon: "pending-actions", nav: "Procurement" },
      { label: "All PRs", icon: "description", nav: "Procurement" },
      { label: "Procurement Log", icon: "history", nav: "ProcurementLog" },
      { label: "Canvassing", icon: "gavel", nav: "Canvassing" },
    ],
    6: [
      { label: "New PR", icon: "add-circle-outline", nav: "Procurement" },
      { label: "Track PR", icon: "track-changes", nav: "Procurement" },
      { label: "View History", icon: "history", nav: "ProcurementLog" },
      { label: "Canvassing", icon: "gavel", nav: "Canvassing" },
    ],
    8: [
      { label: "All PRs", icon: "description", nav: "Procurement" },
      { label: "Procurement Log", icon: "history", nav: "ProcurementLog" },
      { label: "Purchase Orders", icon: "receipt-long", nav: "PurchaseOrder" },
      { label: "Canvassing", icon: "gavel", nav: "Canvassing" },
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
  const colW = (SCREEN_W - 36) / 2;
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        paddingHorizontal: 12,
        gap: 8,
      }}
    >
      {actions.map((a) => (
        <TouchableOpacity
          key={a.label}
          onPress={() => navigation?.navigate?.(a.nav)}
          activeOpacity={0.8}
          style={{
            width: colW,
            backgroundColor: "#ffffff",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#e5e7eb",
            paddingVertical: 11,
            paddingHorizontal: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 9,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.04,
            shadowRadius: 3,
            elevation: 1,
          }}
        >
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              backgroundColor: "#ecfdf5",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialIcons name={a.icon} size={17} color={CLR.brand900} />
          </View>
          <Text
            style={{
              fontSize: 12,
              fontWeight: "700",
              color: "#111827",
              flexShrink: 1,
            }}
            numberOfLines={1}
          >
            {a.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Supply Dashboard ─────────────────────────────────────────────────────────
// role_id 8 — sees all PRs system-wide, oriented toward PO readiness.

function SupplyDashboard({ navigation }: any) {
  const { currentUser } = useAuth();
  const { prs, recent, statCards, loading, error, refresh, lastRefresh } =
    useSupplyData();

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

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
      }
    >
      <WelcomeHeader
        roleLabel="Supply Section · All Divisions"
        username={currentUser?.fullname ?? "Supply Officer"}
      />

      {error && <ErrorBanner message={error} onRetry={refresh} />}
      <LastRefreshedBadge time={lastRefresh} />

      {/* ── KPI tiles ── */}
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 12,
          paddingTop: 10,
          gap: 6,
        }}
      >
        {statCards.map((card) => (
          <StatTile key={card.label} card={card} />
        ))}
      </View>

      {/* ── All recent PRs across every division ── */}
      <SectionHeader
        title="All Purchase Requests"
        sub={
          prs.length > 0
            ? `${prs.length} total across all divisions`
            : undefined
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
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#e5e7eb",
            padding: 24,
            alignItems: "center",
            gap: 8,
          }}
        >
          <MaterialIcons name="description" size={32} color="#d1d5db" />
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#374151" }}>
            No Purchase Requests
          </Text>
          <Text
            style={{ fontSize: 11.5, color: "#9ca3af", textAlign: "center" }}
          >
            {"No PRs have been submitted yet.\nPull down to refresh."}
          </Text>
        </View>
      ) : (
        <View
          style={{
            marginHorizontal: 12,
            backgroundColor: "#ffffff",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#e5e7eb",
            overflow: "hidden",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.04,
            shadowRadius: 4,
            elevation: 1,
          }}
        >
          {recent.map((record, i) => (
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
      <QuickActionGrid navigation={navigation} roleId={8} />
    </ScrollView>
  );
}

// ─── Dashboard entry point ────────────────────────────────────────────────────

export default function DashboardScreen({ navigation }: any) {
  const { currentUser } = useAuth();
  const roleId = currentUser?.role_id ?? 6;
  if (roleId === 1) return <AdminDashboard navigation={navigation} />;
  if (roleId === 8) return <SupplyDashboard navigation={navigation} />;
  if (roleId in ROLE_QUEUE_STATUS)
    return <ProcessorDashboard navigation={navigation} roleId={roleId} />;
  return <EndUserDashboard navigation={navigation} />;
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────

function AdminDashboard({ navigation }: any) {
  const { currentUser } = useAuth();
  const {
    prs,
    recent,
    statCards,
    statusBreakdown,
    loading,
    error,
    refresh,
    lastRefresh,
  } = useAdminData();

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

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
      }
    >
      <WelcomeHeader
        roleLabel="Admin · System Overview"
        username={currentUser?.fullname ?? "Administrator"}
      />

      {error && <ErrorBanner message={error} onRetry={refresh} />}
      <LastRefreshedBadge time={lastRefresh} />

      {/* ── KPI tiles — 4 across ── */}
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 12,
          paddingTop: 10,
          gap: 6,
        }}
      >
        {statCards.map((card) => (
          <StatTile key={card.label} card={card} />
        ))}
      </View>

      {/* ── Approval funnel ── */}
      <SectionHeader title="Approval Funnel" sub="PRs by current status" />
      <View
        style={{
          marginHorizontal: 12,
          backgroundColor: "#ffffff",
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "#e5e7eb",
          padding: 14,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.04,
          shadowRadius: 4,
          elevation: 1,
        }}
      >
        <ApprovalFunnelChart breakdown={statusBreakdown} />
      </View>

      {/* ── Recent PRs ── */}
      <SectionHeader
        title="Recent Purchase Requests"
        sub={`${prs.length} total`}
        onViewAll={() => navigation?.navigate?.("Procurement")}
      />
      <View
        style={{
          marginHorizontal: 12,
          backgroundColor: "#ffffff",
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "#e5e7eb",
          overflow: "hidden",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.04,
          shadowRadius: 4,
          elevation: 1,
        }}
      >
        {recent.length === 0 ? (
          <View style={{ paddingVertical: 24, alignItems: "center", gap: 6 }}>
            <MaterialIcons name="inbox" size={28} color="#d1d5db" />
            <Text style={{ fontSize: 12, color: "#9ca3af" }}>
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

      {/* ── Quick actions ── */}
      <SectionHeader title="Quick Actions" />
      <QuickActionGrid navigation={navigation} roleId={1} />
    </ScrollView>
  );
}

// ─── Processor Dashboard ──────────────────────────────────────────────────────

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

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

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
      }
    >
      <WelcomeHeader
        roleLabel={roleLabel}
        username={currentUser?.fullname ?? roleLabel}
      />

      {error && <ErrorBanner message={error} onRetry={refresh} />}
      <LastRefreshedBadge time={lastRefresh} />

      {/* ── KPI tiles ── */}
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 12,
          paddingTop: 10,
          gap: 6,
        }}
      >
        {statCards.map((card) => (
          <StatTile key={card.label} card={card} />
        ))}
      </View>

      {/* ── Action queue ── */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 14,
          paddingTop: 16,
          paddingBottom: 8,
        }}
      >
        <View>
          <Text style={{ fontSize: 13, fontWeight: "800", color: "#111827" }}>
            Your Action Queue
          </Text>
          <Text style={{ fontSize: 10.5, color: "#9ca3af", marginTop: 1 }}>
            PRs awaiting your review
          </Text>
        </View>
        {queue.length > 0 && (
          <View
            style={{
              backgroundColor: queueCfg.bg,
              paddingHorizontal: 9,
              paddingVertical: 3,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: queueCfg.dot + "60",
            }}
          >
            <Text
              style={{ fontSize: 11, fontWeight: "800", color: queueCfg.text }}
            >
              {queue.length} pending
            </Text>
          </View>
        )}
      </View>

      {queue.length === 0 ? (
        <View
          style={{
            marginHorizontal: 12,
            backgroundColor: "#f0fdf4",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#bbf7d0",
            padding: 24,
            alignItems: "center",
            gap: 6,
          }}
        >
          <MaterialIcons name="check-circle" size={36} color={CLR.brand500} />
          <Text
            style={{ fontSize: 13, fontWeight: "700", color: CLR.brand900 }}
          >
            Queue is clear!
          </Text>
          <Text
            style={{ fontSize: 11.5, color: "#6b7280", textAlign: "center" }}
          >
            {"No PRs require your attention.\nPull down to refresh."}
          </Text>
        </View>
      ) : (
        <View
          style={{
            marginHorizontal: 12,
            backgroundColor: "#ffffff",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#e5e7eb",
            overflow: "hidden",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.04,
            shadowRadius: 4,
            elevation: 1,
          }}
        >
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

      {/* ── Other PRs ── */}
      {recentOther.length > 0 && (
        <>
          <SectionHeader
            title="Other PRs in System"
            sub="Not currently in your queue"
            onViewAll={() => navigation?.navigate?.("Procurement")}
          />
          <View
            style={{
              marginHorizontal: 12,
              backgroundColor: "#ffffff",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#e5e7eb",
              overflow: "hidden",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.04,
              shadowRadius: 4,
              elevation: 1,
            }}
          >
            {recentOther.map((record, i) => (
              <PRTableRow
                key={record.id}
                record={record}
                isEven={i % 2 === 0}
                onPress={() => navigation?.navigate?.("Procurement")}
              />
            ))}
          </View>
        </>
      )}

      {/* ── Quick actions ── */}
      <SectionHeader title="Quick Actions" />
      <QuickActionGrid navigation={navigation} roleId={roleId} />
    </ScrollView>
  );
}

// ─── End-User Dashboard ───────────────────────────────────────────────────────

function EndUserDashboard({ navigation }: any) {
  const { currentUser } = useAuth();
  const divisionId = currentUser?.division_id ?? null;
  const { prs, recent, statCards, loading, error, refresh, lastRefresh } =
    useEndUserData(divisionId);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

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
      }
    >
      <WelcomeHeader
        roleLabel={currentUser?.division_name ?? "End User"}
        username={currentUser?.fullname ?? "Welcome"}
      />

      {error && <ErrorBanner message={error} onRetry={refresh} />}
      <LastRefreshedBadge time={lastRefresh} />

      {/* ── KPI tiles ── */}
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 12,
          paddingTop: 10,
          gap: 6,
        }}
      >
        {statCards.map((card) => (
          <StatTile key={card.label} card={card} />
        ))}
      </View>

      {/* ── PR list ── */}
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
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#e5e7eb",
            padding: 24,
            alignItems: "center",
            gap: 8,
          }}
        >
          <MaterialIcons name="description" size={32} color="#d1d5db" />
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#374151" }}>
            No Purchase Requests
          </Text>
          <Text
            style={{ fontSize: 11.5, color: "#9ca3af", textAlign: "center" }}
          >
            {
              "You haven't submitted any PRs yet.\nGo to Procurement to create one."
            }
          </Text>
        </View>
      ) : (
        recent.map((pr) => (
          <PRSummaryCard
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
