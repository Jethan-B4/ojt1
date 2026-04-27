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
 *   role_id 6  → EndUserDashboard    — own division's PRs only
 *   role_id 7  → CanvasserDashboard  — all canvassable PRs (status_id >= 6), cross-division
 *   role_id 8  → SupplyDashboard     — all PRs system-wide, PO-readiness oriented
 *
 * Real-time:
 *   Every data hook subscribes to Supabase Realtime on the purchase_requests table.
 *   On INSERT / UPDATE / DELETE the hook re-fetches (debounced 300 ms) so the
 *   dashboard stays live without user interaction.  The subscription is scoped
 *   per role — division-scoped hooks filter on division_id server-side so only
 *   relevant changes trigger a refresh.  Subscriptions are cleaned up when the
 *   component unmounts.
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { YearPickerModal } from "../(components)/DivisionBudgetModule";
import type { PRRow, PRStatusRow } from "../../lib/supabase";
import {
    fetchPRStatuses,
    fetchPurchaseRequests,
    fetchPurchaseRequestsByDivision,
} from "../../lib/supabase";
import { supabase } from "../../lib/supabase/client";
import { useAuth } from "../AuthContext";

// ─── Centralised user accessor ────────────────────────────────────────────────

/**
 * Reads the authenticated user from AuthContext and returns every field the
 * dashboard needs, each with a safe typed default.
 *
 * All values come from the single source-of-truth set by handleSignIn in
 * AuthContext — which fetches fullname, role_id, division_id, role_name, and
 * division_name from the DB at sign-in time.
 *
 * Using this hook instead of spreading `currentUser?.x` across components
 * ensures consistent defaults and a single place to add new fields.
 */
function useCurrentUser() {
  const { currentUser, isAuthenticated, handleSignOut } = useAuth();
  return {
    isAuthenticated,
    handleSignOut,
    // Numeric IDs — 0 / null used as "not yet loaded" sentinels
    roleId: currentUser?.role_id ?? 0,
    divisionId: currentUser?.division_id ?? null,
    // Display strings — resolved from DB joins at sign-in
    fullname: currentUser?.fullname ?? "",
    roleName:
      currentUser?.role_name ??
      ROLE_LABELS[currentUser?.role_id ?? 0] ??
      "User",
    divisionName: currentUser?.division_name ?? "",
    // Raw row for cases that still need the full object
    currentUser,
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get("window").width;
const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const CLR = {
  brand900: "#064E3B",
  brand700: "#047857",
  brand500: "#10B981",
  brand100: "#A7F3D0",
} as const;

// Fiscal year filtering - Philippine fiscal year is calendar year (Jan 1 - Dec 31)
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_RANGE = Array.from({ length: 7 }, (_, i) => CURRENT_YEAR - 5 + i);

/**
 * Visual config keyed by status_id — mirrors the full public.status table.
 * Labels here are ONLY used as a render-time fallback when the DB fetch hasn't
 * resolved yet.  The authoritative label always comes from the fetched
 * PRStatusRow array (status_name column).
 *
 *  1  Pending
 *  2  Processing (Division Head)
 *  3  Processing (BAC)
 *  4  Processing (Budget)
 *  5  Processing (PARPO)
 *  6  Canvassing (Reception)
 *  8  Canvassing (Releasing)
 *  9  Canvassing (Collection)
 * 10  BAC Resolution
 * 11  Abstract of Awards
 * 12  PO (Creation)
 * 13  PO (Allocation)
 * 14  ORS (Creation)
 * 15  ORS (Processing)
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
    label: "Processing (Div. Head)",
  },
  3: {
    bg: "#f5f3ff",
    text: "#5b21b6",
    dot: "#8b5cf6",
    label: "Processing (BAC)",
  },
  4: {
    bg: "#fff7ed",
    text: "#9a3412",
    dot: "#f97316",
    label: "Processing (Budget)",
  },
  5: {
    bg: "#ecfdf5",
    text: "#065f46",
    dot: "#10b981",
    label: "Processing (PARPO)",
  },
  6: {
    bg: "#f0fdf4",
    text: "#166534",
    dot: "#22c55e",
    label: "Canvassing (Reception)",
  },
  8: {
    bg: "#ecfdf5",
    text: "#065f46",
    dot: "#16a34a",
    label: "Canvassing (Releasing)",
  },
  9: {
    bg: "#f0fdfa",
    text: "#0f766e",
    dot: "#0d9488",
    label: "Canvassing (Collection)",
  },
  10: {
    bg: "#faf5ff",
    text: "#6b21a8",
    dot: "#9333ea",
    label: "BAC Resolution",
  },
  11: {
    bg: "#fdf4ff",
    text: "#86198f",
    dot: "#c026d3",
    label: "Abstract of Awards",
  },
  12: {
    bg: "#f0fdfa",
    text: "#0f766e",
    dot: "#0d9488",
    label: "PO (Creation)",
  },
  13: {
    bg: "#faf5ff",
    text: "#6b21a8",
    dot: "#9333ea",
    label: "PO (Allocation)",
  },
  14: {
    bg: "#fff7ed",
    text: "#9a3412",
    dot: "#f97316",
    label: "ORS (Creation)",
  },
  15: {
    bg: "#eff6ff",
    text: "#1e40af",
    dot: "#3b82f6",
    label: "ORS (Processing)",
  },
  33: {
    bg: "#ecfdf5",
    text: "#14532d",
    dot: "#22c55e",
    label: "Completed (PR Phase)",
  },
  34: {
    bg: "#ecfdf5",
    text: "#065f46",
    dot: "#10b981",
    label: "Completed (PO Phase)",
  },
  35: {
    bg: "#ecfdf5",
    text: "#065f46",
    dot: "#10b981",
    label: "Completed (Delivery Phase)",
  },
  36: {
    bg: "#ecfdf5",
    text: "#065f46",
    dot: "#10b981",
    label: "Completed (Payment Phase)",
  },
};

const ROLE_QUEUE_STATUS: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4 };

const ROLE_LABELS: Record<number, string> = {
  1: "Admin",
  2: "Division Head",
  3: "BAC",
  4: "Budget Officer",
  5: "PARPO",
  6: "End User",
  7: "Canvasser",
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

/**
 * Resolve visual config + label for a given status_id.
 * Priority: DB status_name (from fetched PRStatusRow[]) → hardcoded fallback label → "Status N".
 * Always pass the fetched `statuses` array when available so labels come from the DB.
 */
function statusCfgFor(statusId: number, statuses: PRStatusRow[] = []) {
  const dbLabel = statuses.find((s) => s.id === statusId)?.status_name;
  const cfg = STATUS_ID_CFG[statusId] ?? {
    bg: "#f9fafb",
    text: "#6b7280",
    dot: "#9ca3af",
    label: `Status ${statusId}`,
  };
  return { ...cfg, label: dbLabel ?? cfg.label };
}

function LifecycleSummaryCard({ prs }: { prs: PRSummary[] }) {
  if (!prs || prs.length === 0) return null;
  const prDone = prs.filter((r) => Number(r.statusId) === 33).length;
  const poDone = prs.filter((r) => Number(r.statusId) === 34).length;
  const delDone = prs.filter((r) => Number(r.statusId) === 35).length;
  const payDone = prs.filter((r) => Number(r.statusId) === 36).length;

  return (
    <View
      style={{
        marginHorizontal: 12,
        marginTop: 10,
        backgroundColor: "#ffffff",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        paddingHorizontal: 14,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, fontWeight: "800", color: "#111827" }}>
          Lifecycle Completion
        </Text>
        <Text style={{ fontSize: 10.5, color: "#6b7280", marginTop: 2 }}>
          {prDone} PR · {poDone} PO · {delDone} Delivery · {payDone} Payment
        </Text>
      </View>
      <View
        style={{
          backgroundColor: "#f3f4f6",
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 999,
        }}
      >
        <Text style={{ fontSize: 10, fontWeight: "800", color: "#374151" }}>
          {prs.length}
        </Text>
      </View>
    </View>
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
    // Always prefer the DB status_name; fall back to the visual config label.
    statusLabel:
      statusRow?.status_name ?? statusCfgFor(row.status_id, statuses).label,
    date: fmtDate(row.created_at),
    totalCost: Number(row.total_cost),
    isHighValue: row.is_high_value,
    proposalNo: row.proposal_no,
  };
}

// ─── Data hooks ───────────────────────────────────────────────────────────────

async function fetchPurchaseRequestsByYear(year: number): Promise<PRRow[]> {
  const startDate = `${year}-01-01T00:00:00.000Z`;
  const endDate = `${year}-12-31T23:59:59.999Z`;
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("*")
    .gte("created_at", startDate)
    .lte("created_at", endDate)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PRRow[];
}

async function fetchPurchaseOrdersByYear(year: number): Promise<any[]> {
  const startDate = `${year}-01-01T00:00:00.000Z`;
  const endDate = `${year}-12-31T23:59:59.999Z`;
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("*")
    .gte("created_at", startDate)
    .lte("created_at", endDate);
  if (error) throw error;
  return data ?? [];
}

async function fetchDeliveriesByYear(year: number): Promise<any[]> {
  const startDate = `${year}-01-01T00:00:00.000Z`;
  const endDate = `${year}-12-31T23:59:59.999Z`;
  const { data, error } = await supabase
    .from("deliveries")
    .select("*")
    .gte("created_at", startDate)
    .lte("created_at", endDate);
  if (error) throw error;
  return data ?? [];
}

async function fetchPaymentsByYear(year: number): Promise<any[]> {
  const startDate = `${year}-01-01T00:00:00.000Z`;
  const endDate = `${year}-12-31T23:59:59.999Z`;
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .gte("created_at", startDate)
    .lte("created_at", endDate);
  if (error) throw error;
  return data ?? [];
}

function useAdminData(year: number) {
  const [rows, setRows] = useState<PRRow[]>([]);
  const [statuses, setStatuses] = useState<PRStatusRow[]>([]);
  const [phaseCounts, setPhaseCounts] = useState({
    pr: 0,
    po: 0,
    delivery: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [allRows, allStatuses, poCount, deliveryCount] = await Promise.all([
        fetchPurchaseRequestsByYear(year),
        fetchPRStatuses(),
        fetchPurchaseOrdersByYear(year),
        fetchDeliveriesByYear(year),
      ]);
      setRows(allRows);
      setStatuses(allStatuses);
      setPhaseCounts({
        pr: allRows.length,
        po: poCount.length,
        delivery: deliveryCount.length,
      });
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e?.message ?? "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [year]);

  // Real-time subscription — Admin sees all rows, so we listen to every change.
  useEffect(() => {
    const channel = supabase
      .channel("admin-dashboard-pr")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "purchase_requests" },
        () => {
          // Debounce rapid bursts (e.g. bulk status updates)
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            load();
          }, 300);
        },
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
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

  // Build breakdown from ALL statuses fetched from the DB, not a hardcoded list.
  // Only include statuses that actually have PRs so the funnel stays clean.
  const statusBreakdown = statuses
    .map((s) => ({
      id: s.id,
      label: s.status_name,
      count: prs.filter((p) => p.statusId === s.id).length,
      color: statusCfgFor(s.id, statuses).dot,
    }))
    .filter((s) => s.count > 0)
    .sort((a, b) => a.id - b.id);

  return {
    prs,
    recent,
    statCards,
    statusBreakdown,
    statuses,
    phaseCounts,
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Real-time: Processor roles care about any status change that might move a PR
  // into or out of their queue, so subscribe to all purchase_requests changes.
  useEffect(() => {
    const channel = supabase
      .channel(`processor-dashboard-pr-role${roleId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "purchase_requests" },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            load();
          }, 300);
        },
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [load, roleId]);

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
    statuses,
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Guard: if divisionId is null the user has no division assigned.
      // Return an empty list rather than silently fetching every PR in the system.
      if (divisionId == null) {
        setRows([]);
        setStatuses([]);
        setLastRefresh(new Date());
        return;
      }
      const [allRows, allStatuses] = await Promise.all([
        fetchPurchaseRequestsByDivision(divisionId),
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

  // Real-time: End Users only see their own division. Filter the subscription
  // to rows matching their division_id so irrelevant changes are ignored.
  useEffect(() => {
    const filter =
      divisionId != null ? `division_id=eq.${divisionId}` : undefined;

    const channel = supabase
      .channel(`enduser-dashboard-pr-div${divisionId ?? "all"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "purchase_requests",
          ...(filter ? { filter } : {}),
        },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            load();
          }, 300);
        },
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [load, divisionId]);

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

  return {
    prs,
    recent,
    statCards,
    statuses,
    loading,
    error,
    refresh: load,
    lastRefresh,
  };
}

// ─── Supply data hook — all PRs across all divisions ─────────────────────────

function useSupplyData() {
  const [rows, setRows] = useState<PRRow[]>([]);
  const [statuses, setStatuses] = useState<PRStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Real-time: Supply sees all PRs system-wide.
  useEffect(() => {
    const channel = supabase
      .channel("supply-dashboard-pr")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "purchase_requests" },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            load();
          }, 300);
        },
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [load]);

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

  return {
    prs,
    recent,
    statCards,
    statuses,
    loading,
    error,
    refresh: load,
    lastRefresh,
  };
}

// ─── Canvasser data hook — all canvassable PRs (status_id >= 6), cross-division ──

function useCanvasserData() {
  const [rows, setRows] = useState<PRRow[]>([]);
  const [statuses, setStatuses] = useState<PRStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [allRows, allStatuses] = await Promise.all([
        fetchPurchaseRequests(),
        fetchPRStatuses(),
      ]);
      // Canvassers only need to act on PRs that are in the canvassing phase (status_id >= 6)
      setRows(allRows.filter((r) => r.status_id >= 6));
      setStatuses(allStatuses);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e?.message ?? "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Real-time: Canvassers care about PRs transitioning into or through the
  // canvassing phase (status_id >= 6). We subscribe to all changes and let
  // the load() re-fetch + filter client-side — Supabase Realtime postgres_changes
  // filter syntax doesn't support gte, so we listen broadly and filter on load.
  useEffect(() => {
    const channel = supabase
      .channel("canvasser-dashboard-pr")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "purchase_requests" },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            load();
          }, 300);
        },
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [load]);

  const prs = rows.map((r) => rowToSummary(r, statuses));
  const recent = [...prs]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  const inCanvass = prs.filter(
    (p) => p.statusId >= 6 && p.statusId <= 9,
  ).length;
  const bacResolution = prs.filter((p) => p.statusId === 7).length;
  const aaaIssuance = prs.filter((p) => p.statusId === 10).length;
  const total = prs.length;

  const statCards: StatCard[] = [
    {
      label: "Total",
      value: total,
      icon: "description",
      accent: CLR.brand700,
    },
    {
      label: "Canvassing",
      value: inCanvass,
      icon: "pending-actions",
      accent: "#d97706",
    },
    {
      label: "BAC Res.",
      value: bacResolution,
      icon: "gavel",
      accent: "#7c3aed",
    },
    {
      label: "AAA",
      value: aaaIssuance,
      icon: "verified",
      accent: "#16a34a",
    },
  ];

  return {
    prs,
    recent,
    statCards,
    statuses,
    loading,
    error,
    refresh: load,
    lastRefresh,
  };
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
        gap: 5,
        alignSelf: "flex-end",
        paddingHorizontal: 14,
        paddingTop: 4,
        paddingBottom: 2,
      }}
    >
      {/* Live indicator dot */}
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 3,
          backgroundColor: "#10b981",
        }}
      />
      <MaterialIcons name="update" size={10} color="#9ca3af" />
      <Text style={{ fontSize: 10, color: "#9ca3af" }}>
        Live · Updated{" "}
        {time.toLocaleTimeString("en-PH", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Text
              style={{ fontSize: 11.5, fontWeight: "600", color: CLR.brand700 }}
            >
              View all
            </Text>
            <MaterialIcons
              name="chevron-right"
              size={16}
              color={CLR.brand700}
            />
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

function StatusBadge({
  statusId,
  statuses = [],
}: {
  statusId: number;
  statuses?: PRStatusRow[];
}) {
  const cfg = statusCfgFor(statusId, statuses);
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
  statuses = [],
  onPress,
}: {
  record: PRSummary;
  isEven: boolean;
  statuses?: PRStatusRow[];
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
      <StatusBadge statusId={record.statusId} statuses={statuses} />
      <Text
        style={{
          fontSize: 10,
          fontWeight: "700",
          color: "#374151",
          minWidth: 54,
          textAlign: "right",
        }}
      >
        <Text style={{ fontFamily: undefined }}>{"\u20B1"}</Text>
        <Text style={{ fontFamily: MONO }}>
          {record.totalCost.toLocaleString("en-PH")}
        </Text>
      </Text>
      <MaterialIcons name="chevron-right" size={14} color="#d1d5db" />
    </TouchableOpacity>
  );
}

/** Slim PR card for End-User — status pill + cost, no step tracker */
function PRSummaryCard({
  pr,
  statuses = [],
  onPress,
}: {
  pr: PRSummary;
  statuses?: PRStatusRow[];
  onPress: () => void;
}) {
  // Always resolve from the DB-fetched statuses array; pr.statusLabel is the
  // pre-resolved label from rowToSummary, which already uses status_name from the DB.
  const cfg = statusCfgFor(pr.statusId, statuses);
  // Use the DB-resolved label stored on the summary (most accurate source).
  const label = pr.statusLabel || cfg.label;
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
            {label}
          </Text>
        </View>
        <Text
          style={{
            fontSize: 10.5,
            fontWeight: "700",
            color: "#374151",
          }}
        >
          <Text style={{ fontFamily: undefined }}>{"\u20B1"}</Text>
          <Text style={{ fontFamily: MONO }}>
            {pr.totalCost.toLocaleString("en-PH")}
          </Text>
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
        <View
          key={b.id}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <View
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: b.color,
              width: `${(b.count / total) * 100}%`,
            }}
          />
          <Text
            style={{
              fontSize: 10,
              fontWeight: "600",
              color: "#4b5563",
              minWidth: 36,
            }}
          >
            {b.count}
          </Text>
          <Text
            style={{
              fontSize: 10,
              fontWeight: "600",
              color: "#6b7280",
              flex: 1,
            }}
            numberOfLines={1}
          >
            {b.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

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
    ],
    2: [
      { label: "Review Queue", icon: "pending-actions", nav: "Procurement" },
      { label: "All PRs", icon: "description", nav: "Procurement" },
      { label: "Procurement Log", icon: "history", nav: "ProcurementLog" },
    ],
    3: [
      { label: "Review Queue", icon: "pending-actions", nav: "Procurement" },
      { label: "All PRs", icon: "description", nav: "Procurement" },
      { label: "Procurement Log", icon: "history", nav: "ProcurementLog" },
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
    ],
    6: [
      { label: "New PR", icon: "add-circle-outline", nav: "Procurement" },
      { label: "Track PR", icon: "track-changes", nav: "Procurement" },
      { label: "View History", icon: "history", nav: "ProcurementLog" },
    ],
    8: [
      { label: "All PRs", icon: "description", nav: "Procurement" },
      { label: "Procurement Log", icon: "history", nav: "ProcurementLog" },
      { label: "Purchase Orders", icon: "receipt-long", nav: "PurchaseOrder" },
    ],
    7: [
      { label: "View PRs", icon: "description", nav: "Procurement" },
      { label: "Procurement Log", icon: "history", nav: "ProcurementLog" },
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
  const { fullname, roleName } = useCurrentUser();
  const {
    prs,
    recent,
    statCards,
    statuses,
    loading,
    error,
    refresh,
    lastRefresh,
  } = useSupplyData();

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
        roleLabel={roleName || "Supply"}
        username={fullname || "Supply Officer"}
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

      <LifecycleSummaryCard prs={prs} />

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
              statuses={statuses}
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

// ─── Canvasser Dashboard ──────────────────────────────────────────────────────
// role_id 7 — sees all canvassable PRs (status_id >= 6) across every division.

function CanvasserDashboard({ navigation }: any) {
  const { fullname, roleName } = useCurrentUser();
  const {
    prs,
    recent,
    statCards,
    statuses,
    loading,
    error,
    refresh,
    lastRefresh,
  } = useCanvasserData();

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
        roleLabel={roleName || "Canvasser"}
        username={fullname || "Canvasser"}
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

      {/* ── Canvassable PRs ── */}
      <SectionHeader
        title="Canvassable Purchase Requests"
        sub={
          prs.length > 0
            ? `${prs.length} PRs ready for canvassing across all divisions`
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
          <MaterialIcons name="gavel" size={32} color="#d1d5db" />
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#374151" }}>
            No Canvassable PRs
          </Text>
          <Text
            style={{ fontSize: 11.5, color: "#9ca3af", textAlign: "center" }}
          >
            {
              "No PRs are currently in the canvassing phase.\nPull down to refresh."
            }
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
              statuses={statuses}
              onPress={() =>
                navigation?.navigate?.("Canvassing", { prNo: record.prNo })
              }
            />
          ))}
        </View>
      )}

      {/* ── Quick actions ── */}
      <SectionHeader title="Quick Actions" />
      <QuickActionGrid navigation={navigation} roleId={7} />
    </ScrollView>
  );
}

// ─── Dashboard entry point ────────────────────────────────────────────────────

export default function DashboardScreen({ navigation }: any) {
  const { isAuthenticated, roleId } = useCurrentUser();

  // Guard: if the user is not authenticated yet (e.g. session is still
  // hydrating), show a loading screen rather than rendering a dashboard
  // with no data and a potentially wrong role fallback.
  if (!isAuthenticated || roleId === 0) return <LoadingScreen />;

  if (roleId === 1) return <AdminDashboard navigation={navigation} />;
  if (roleId === 7) return <CanvasserDashboard navigation={navigation} />;
  if (roleId === 8) return <SupplyDashboard navigation={navigation} />;
  if (roleId in ROLE_QUEUE_STATUS)
    return <ProcessorDashboard navigation={navigation} roleId={roleId} />;
  // role_id 6 (End User) and any unrecognised role → division-scoped view
  return <EndUserDashboard navigation={navigation} />;
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────

function AdminDashboard({ navigation }: any) {
  const { fullname, roleName } = useCurrentUser();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const {
    prs,
    recent,
    statCards,
    statusBreakdown,
    statuses,
    phaseCounts,
    loading,
    error,
    refresh,
    lastRefresh,
  } = useAdminData(year);

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
      {/* ── Page header ── */}
      <View style={{ backgroundColor: "#064E3B", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <View>
            <Text style={{ fontSize: 9.5, fontWeight: "600", letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.4)" }}>
              DAR · Procurement
            </Text>
            <Text style={{ fontSize: 20, fontWeight: "800", color: "#ffffff", marginTop: 2 }}>
              Dashboard
            </Text>
            <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
              System-wide monitoring and KPIs
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
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 8,
              marginTop: 4,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.15)",
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#ffffff" }}>
              FY {year}
            </Text>
            <MaterialIcons name="keyboard-arrow-down" size={16} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>
      </View>

      {error && <ErrorBanner message={error} onRetry={refresh} />}
      <LastRefreshedBadge time={lastRefresh} />

      {/* ── Phase Counts KPI tiles — 4 across ── */}
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 12,
          paddingTop: 10,
          gap: 6,
        }}
      >
        <StatTile
          key="PR"
          card={{
            label: "PR",
            value: phaseCounts.pr,
            icon: "description",
            accent: CLR.brand700,
          }}
        />
        <StatTile
          key="PO"
          card={{
            label: "PO",
            value: phaseCounts.po,
            icon: "receipt",
            accent: "#047857",
          }}
        />
        <StatTile
          key="Delivery"
          card={{
            label: "Delivery",
            value: phaseCounts.delivery,
            icon: "local-shipping",
            accent: "#0369a1",
          }}
        />
        <StatTile
          key="Payment"
          card={{
            label: "Payment",
            value: 0,
            icon: "payment",
            accent: "#7c3aed",
          }}
        />
      </View>

      <LifecycleSummaryCard prs={prs} />

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
              statuses={statuses}
              onPress={() => navigation?.navigate?.("Procurement")}
            />
          ))
        )}
      </View>

      {/* ── Quick actions ── */}
      <SectionHeader title="Quick Actions" />
      <QuickActionGrid navigation={navigation} roleId={1} />

      <YearPickerModal
        visible={yearPickerOpen}
        selected={year}
        onSelect={(y: number) => {
          setYear(y);
          setYearPickerOpen(false);
        }}
        onClose={() => setYearPickerOpen(false)}
      />
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
  const { fullname, roleName } = useCurrentUser();
  const {
    queue,
    recentOther,
    statCards,
    statuses,
    loading,
    error,
    refresh,
    lastRefresh,
    queueStatusId,
  } = useProcessorData(useAuth().roleId);

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

  // Prefer the DB-sourced role_name; fall back to the local map then a generic string.
  const roleLabel = roleName || ROLE_LABELS[roleId] || "Processor";
  const queueCfg = statusCfgFor(queueStatusId, statuses);

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
      <WelcomeHeader roleLabel={roleLabel} username={fullname || roleLabel} />

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
        {statCards.map((card: StatCard) => (
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
          {queue.map((record: PRSummary, i: number) => (
            <PRTableRow
              key={record.id}
              record={record}
              isEven={i % 2 === 0}
              statuses={statuses}
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
            {recentOther.map((record: PRSummary, i: number) => (
              <PRTableRow
                key={record.id}
                record={record}
                isEven={i % 2 === 0}
                statuses={statuses}
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
  const { fullname, divisionId, divisionName, roleId } = useCurrentUser();
  const {
    prs,
    recent,
    statCards,
    statuses,
    loading,
    error,
    refresh,
    lastRefresh,
  } = useEndUserData(divisionId);

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
        roleLabel={divisionName || "End User"}
        username={fullname || "Welcome"}
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
            statuses={statuses}
            onPress={() => navigation?.navigate?.("Procurement")}
          />
        ))
      )}

      {/* ── Quick actions ── */}
      <SectionHeader title="Quick Actions" />
      <QuickActionGrid navigation={navigation} roleId={roleId} />
    </ScrollView>
  );
}
