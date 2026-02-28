/**
 * dashboard.tsx
 *
 * DAR Procurement Dashboard Screen
 *
 * Mirrors the Alytic-style reference layout adapted for the DAR procurement
 * workflow (Phase 1–4, Steps 1–48). Uses placeholder data structured to
 * match the Supabase schema — swap each `PLACEHOLDER_*` constant with a
 * real `supabase.from(…).select(…)` call when ready.
 *
 * Supabase tables expected:
 *   purchase_requests     — PR headers
 *   purchase_request_items — line items
 *   purchase_orders       — PO records
 *   deliveries            — delivery tracking
 *   alerts                — urgent notices
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useEffect, useState } from "react";
import {
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ─── Supabase (uncomment when ready) ─────────────────────────────────────────
// import { supabase } from "../lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

type PRStatus = "pending" | "approved" | "overdue" | "processing" | "draft";
type AlertLevel = "urgent" | "scheduled" | "shipped" | "info";

interface StatCard {
  label: string;
  value: number | string;
  sub: string;
  subType: "up" | "warn" | "ok" | "info";
  icon: keyof typeof MaterialIcons.glyphMap;
}

interface PRSummary {
  id: string;
  prNo: string;
  purpose: string;
  section: string;
  status: PRStatus;
  date: string;
  totalCost: number;
  stage: number; // 1–4 procurement phase
}

interface DeliveryAlert {
  id: string;
  prNo: string;
  label: string;
  sub: string;
  level: AlertLevel;
}

interface StageCount {
  stage: number;
  label: string;
  shortLabel: string;
  count: number;
  color: string;
}

// ─── Placeholder data (replace with Supabase queries) ────────────────────────

const PLACEHOLDER_STATS: StatCard[] = [
  { label: "Active PRs",       value: 14, sub: "+3 this week",      subType: "up",   icon: "description"    },
  { label: "Pending Approval", value: 6,  sub: "Awaiting signature", subType: "warn", icon: "pending-actions" },
  { label: "Open POs",         value: 28, sub: "5 approved today",   subType: "ok",   icon: "shopping-bag"    },
  { label: "Deliveries",       value: 9,  sub: "Next: tomorrow",     subType: "info", icon: "local-shipping"  },
];

const PLACEHOLDER_PRS: PRSummary[] = [
  { id: "1",  prNo: "2026-PR-0014", purpose: "Office supplies & equipment",  section: "STOD",   status: "pending",    date: "Feb 25, 2026", totalCost: 6700,  stage: 1 },
  { id: "2",  prNo: "2026-PR-0013", purpose: "Field survey materials",        section: "LTSP",   status: "processing", date: "Feb 24, 2026", totalCost: 15400, stage: 2 },
  { id: "3",  prNo: "2026-PR-0012", purpose: "Training program meals",        section: "ARBDSP", status: "approved",   date: "Feb 23, 2026", totalCost: 12500, stage: 3 },
  { id: "4",  prNo: "2026-PR-0011", purpose: "Legal reference materials",     section: "Legal",  status: "overdue",    date: "Feb 20, 2026", totalCost: 4800,  stage: 1 },
  { id: "5",  prNo: "2026-PR-0010", purpose: "IT equipment & peripherals",    section: "STOD",   status: "approved",   date: "Feb 18, 2026", totalCost: 38000, stage: 4 },
  { id: "6",  prNo: "2026-PR-0009", purpose: "PARPO office consumables",      section: "PARPO",  status: "draft",      date: "Feb 17, 2026", totalCost: 3200,  stage: 1 },
];

const PLACEHOLDER_ALERTS: DeliveryAlert[] = [
  { id: "1", prNo: "2026-PR-0013", label: "Canvass deadline today",         sub: "Submit to BAC by 5 PM",          level: "urgent"    },
  { id: "2", prNo: "2026-PR-0010", label: "Delivery expected tomorrow",     sub: "IT equipment · PO-2026-0021",     level: "shipped"   },
  { id: "3", prNo: "2026-PR-0012", label: "BAC signature needed",           sub: "Abstract of Awards pending",      level: "info"      },
  { id: "4", prNo: "2026-PR-0008", label: "COA transmittal due Mar 1",      sub: "Supply: Viviene",                 level: "scheduled" },
];

const PLACEHOLDER_STAGES: StageCount[] = [
  { stage: 1, label: "Request & Approval",   shortLabel: "Phase 1", count: 8,  color: "#3b82f6" },
  { stage: 2, label: "Canvass & Evaluation", shortLabel: "Phase 2", count: 5,  color: "#f59e0b" },
  { stage: 3, label: "Order & Delivery",     shortLabel: "Phase 3", count: 4,  color: "#10b981" },
  { stage: 4, label: "Payment & Closure",    shortLabel: "Phase 4", count: 3,  color: "#8b5cf6" },
];

// ─── Config ───────────────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get("window").width;
const MONO     = Platform.OS === "ios" ? "Courier New" : "monospace";

const STATUS_CFG: Record<PRStatus, { bg: string; text: string; dot: string; label: string }> = {
  pending:    { bg: "#fefce8", text: "#854d0e", dot: "#eab308", label: "Pending"    },
  approved:   { bg: "#f0fdf4", text: "#166534", dot: "#22c55e", label: "Approved"   },
  overdue:    { bg: "#fef2f2", text: "#991b1b", dot: "#ef4444", label: "Overdue"    },
  processing: { bg: "#eff6ff", text: "#1e40af", dot: "#3b82f6", label: "Processing" },
  draft:      { bg: "#f9fafb", text: "#6b7280", dot: "#9ca3af", label: "Draft"      },
};

const ALERT_CFG: Record<AlertLevel, { bg: string; text: string; label: string; icon: keyof typeof MaterialIcons.glyphMap }> = {
  urgent:    { bg: "#fef2f2", text: "#991b1b", label: "Urgent",    icon: "warning"         },
  shipped:   { bg: "#f0fdf4", text: "#166534", label: "Shipped",   icon: "local-shipping"  },
  // action:      { bg: "#fefce8", text: "#854d0e", label: "Action",    icon: "edit-note"       },
  scheduled: { bg: "#f5f3ff", text: "#5b21b6", label: "Scheduled", icon: "event"           },
  info:      { bg: "#eff6ff", text: "#1e40af", label: "Info",      icon: "info"            },
};

// TODO: Replace with real fetch
// async function loadDashboardData() {
//   const [{ data: prs }, { data: pos }, { data: deliveries }] = await Promise.all([
//     supabase.from("purchase_requests").select("*").order("created_at", { ascending: false }).limit(6),
//     supabase.from("purchase_orders").select("*").eq("status", "open"),
//     supabase.from("deliveries").select("*").order("expected_date").limit(5),
//   ]);
//   return { prs, pos, deliveries };
// }

// ─── Sub-components ───────────────────────────────────────────────────────────

// Compact donut drawn purely with View arcs (no SVG dependency)
function DonutChart({ stages }: { stages: StageCount[] }) {
  const total = stages.reduce((s, st) => s + st.count, 0) || 1;
  const size  = 110;
  const cx    = size / 2;

  // Build arc segments as thick colored rings using stacked Views with borders
  // (Simple bar-based fallback that works reliably in RN without SVG)
  return (
    <View style={{ alignItems: "center" }}>
      {/* Segmented ring built from colored bars */}
      <View style={{ width: size, height: size, position: "relative", justifyContent: "center", alignItems: "center" }}>
        {/* Outer ring via nested views */}
        <View style={{
          width: size, height: size, borderRadius: size / 2,
          borderWidth: 14, borderColor: "#f3f4f6",
          position: "absolute",
        }} />
        {stages.map((st, i) => {
          const pct = (st.count / total) * 100;
          // Use quadrant fills as approximation — place colored arc wedge
          return (
            <View key={st.stage} style={{
              position: "absolute",
              width: size, height: size, borderRadius: size / 2,
              borderWidth: 14,
              borderColor: "transparent",
              borderTopColor: i === 0 ? st.color : "transparent",
              borderRightColor: i === 1 ? st.color : "transparent",
              borderBottomColor: i === 2 ? st.color : "transparent",
              borderLeftColor: i === 3 ? st.color : "transparent",
              transform: [{ rotate: `${(i * 90)}deg` }],
            }} />
          );
        })}
        {/* Center label */}
        <View style={{ position: "absolute", alignItems: "center" }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: "#064E3B" }}>{total}</Text>
          <Text style={{ fontSize: 9, color: "#9ca3af", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>Total</Text>
        </View>
      </View>

      {/* Legend */}
      <View style={{ marginTop: 12, gap: 6, width: "100%" }}>
        {stages.map((st) => (
          <View key={st.stage} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: st.color }} />
              <Text style={{ fontSize: 11, color: "#6b7280", flex: 1 }} numberOfLines={1}>{st.label}</Text>
            </View>
            <Text style={{ fontSize: 11, fontWeight: "700", color: "#374151", fontFamily: MONO }}>
              {st.count}{" "}
              <Text style={{ color: "#9ca3af", fontWeight: "400" }}>({Math.round(st.count / total * 100)}%)</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function StatPill({ card }: { card: StatCard }) {
  const subColors = {
    up:   { text: "#166534", bg: "#dcfce7" },
    warn: { text: "#854d0e", bg: "#fef9c3" },
    ok:   { text: "#166534", bg: "#dcfce7" },
    info: { text: "#1e40af", bg: "#dbeafe" },
  };
  const c = subColors[card.subType];

  return (
    <View style={{
      backgroundColor: "#ffffff",
      borderRadius: 16, borderWidth: 1, borderColor: "#e5e7eb",
      padding: 16, flex: 1, minWidth: (SCREEN_W - 48) / 2,
      shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "#f0fdf4", alignItems: "center", justifyContent: "center" }}>
          <MaterialIcons name={card.icon} size={18} color="#064E3B" />
        </View>
        <Text style={{ fontSize: 10, color: "#9ca3af", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>
          {card.label}
        </Text>
      </View>
      <Text style={{ fontSize: 32, fontWeight: "800", color: "#064E3B", lineHeight: 36, marginBottom: 6 }}>
        {card.value}
      </Text>
      <View style={{ backgroundColor: c.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: "flex-start" }}>
        <Text style={{ fontSize: 11, fontWeight: "600", color: c.text }}>{card.sub}</Text>
      </View>
    </View>
  );
}

function StatusBadge({ status }: { status: PRStatus }) {
  const cfg = STATUS_CFG[status];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4,
      backgroundColor: cfg.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: cfg.dot }} />
      <Text style={{ fontSize: 10, fontWeight: "700", color: cfg.text }}>{cfg.label}</Text>
    </View>
  );
}

function StageBadge({ stage }: { stage: number }) {
  const cfg = PLACEHOLDER_STAGES[stage - 1];
  return (
    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
      backgroundColor: cfg.color + "18" }}>
      <Text style={{ fontSize: 9, fontWeight: "700", color: cfg.color, textTransform: "uppercase", letterSpacing: 0.5 }}>
        P{stage}
      </Text>
    </View>
  );
}

function PRRow({ record, isEven, onPress }: {
  record: PRSummary; isEven: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: isEven ? "#ffffff" : "#f9fafb",
        borderBottomWidth: 1, borderBottomColor: "#f3f4f6", gap: 10 }}>

      {/* PR No + Purpose */}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 12, fontWeight: "700", color: "#064E3B", fontFamily: MONO }}>
          {record.prNo}
        </Text>
        <Text style={{ fontSize: 11, color: "#6b7280" }} numberOfLines={1}>{record.purpose}</Text>
      </View>

      {/* Section */}
      <View style={{ width: 52, alignItems: "center" }}>
        <Text style={{ fontSize: 10, fontWeight: "700", color: "#064E3B",
          backgroundColor: "#ecfdf5", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
          {record.section}
        </Text>
      </View>

      {/* Status */}
      <View style={{ width: 82, alignItems: "center" }}>
        <StatusBadge status={record.status} />
      </View>

      {/* Stage */}
      <StageBadge stage={record.stage} />

      {/* Cost */}
      <Text style={{ fontSize: 11, fontWeight: "700", color: "#374151", fontFamily: MONO, width: 64, textAlign: "right" }}>
        ₱{record.totalCost.toLocaleString("en-PH")}
      </Text>

      {/* Chevron */}
      <MaterialIcons name="chevron-right" size={16} color="#d1d5db" />
    </TouchableOpacity>
  );
}

function AlertRow({ alert }: { alert: DeliveryAlert }) {
  const cfg = ALERT_CFG[alert.level];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: "#f3f4f6", gap: 12 }}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: cfg.bg,
        alignItems: "center", justifyContent: "center" }}>
        <MaterialIcons name={cfg.icon} size={18} color={cfg.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12.5, fontWeight: "600", color: "#111827" }} numberOfLines={1}>
          {alert.label}
        </Text>
        <Text style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }} numberOfLines={1}>
          {alert.sub}
        </Text>
      </View>
      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: cfg.bg }}>
        <Text style={{ fontSize: 10, fontWeight: "700", color: cfg.text }}>{cfg.label}</Text>
      </View>
    </View>
  );
}

function SectionHeader({ title, onViewAll }: { title: string; onViewAll?: () => void }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10 }}>
      <Text style={{ fontSize: 14, fontWeight: "800", color: "#111827", letterSpacing: -0.3 }}>{title}</Text>
      {onViewAll && (
        <TouchableOpacity onPress={onViewAll} hitSlop={8}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#064E3B" }}>View all</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Phase Pipeline ───────────────────────────────────────────────────────────

function PhasePipeline({ stages }: { stages: StageCount[] }) {
  const total = stages.reduce((s, st) => s + st.count, 0) || 1;
  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 4, gap: 10 }}>
      {/* Progress bar */}
      <View style={{ flexDirection: "row", height: 6, borderRadius: 999, overflow: "hidden", backgroundColor: "#f3f4f6" }}>
        {stages.map((st) => (
          <View key={st.stage}
            style={{ flex: st.count / total, backgroundColor: st.color }} />
        ))}
      </View>
      {/* Phase chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexDirection: "row", gap: 8 }}>
        {stages.map((st) => (
          <View key={st.stage}
            style={{ backgroundColor: st.color + "15", borderRadius: 10, borderWidth: 1,
              borderColor: st.color + "40", paddingHorizontal: 12, paddingVertical: 8,
              alignItems: "center", gap: 2, minWidth: 82 }}>
            <Text style={{ fontSize: 10, fontWeight: "700", color: st.color,
              textTransform: "uppercase", letterSpacing: 0.5 }}>
              {st.shortLabel}
            </Text>
            <Text style={{ fontSize: 22, fontWeight: "800", color: st.color }}>{st.count}</Text>
            <Text style={{ fontSize: 9.5, color: st.color + "cc", textAlign: "center", fontWeight: "500" }}
              numberOfLines={1}>
              {st.label}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Dashboard Screen ─────────────────────────────────────────────────────────

export default function DashboardScreen({ navigation }: any) {
  const [stats,   setStats]   = useState<StatCard[]>([]);
  const [prs,     setPrs]     = useState<PRSummary[]>([]);
  const [alerts,  setAlerts]  = useState<DeliveryAlert[]>([]);
  const [stages,  setStages]  = useState<StageCount[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Data loading ─────────────────────────────────────────────────────────
  // Replace the placeholder assignments below with real Supabase queries:
  //
  // const { data: prData } = await supabase
  //   .from("purchase_requests")
  //   .select("*, purchase_request_items(count)")
  //   .order("created_at", { ascending: false })
  //   .limit(6);
  //
  // const { count: activePRs } = await supabase
  //   .from("purchase_requests")
  //   .select("*", { count: "exact", head: true })
  //   .neq("status", "draft");
  //
  // ... etc.

  useEffect(() => {
    // Simulate async load
    const t = setTimeout(() => {
      setStats(PLACEHOLDER_STATS);
      setPrs(PLACEHOLDER_PRS);
      setAlerts(PLACEHOLDER_ALERTS);
      setStages(PLACEHOLDER_STAGES);
      setLoading(false);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f9fafb" }}>
        <Text style={{ color: "#9ca3af", fontSize: 13 }}>Loading dashboard…</Text>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#f9fafb" }}
      contentContainerStyle={{ paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Welcome bar ── */}
      <View style={{ backgroundColor: "#064E3B", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <View>
            <Text style={{ fontSize: 20, fontWeight: "800", color: "#ffffff", letterSpacing: -0.4 }}>
              DAR Procurement
            </Text>
            <Text style={{ fontSize: 12, color: "#a7f3d0", marginTop: 2 }}>
              {new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </Text>
          </View>
          <Pressable
            onPress={() => navigation?.navigate?.("Procurement")}
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", gap: 6,
              backgroundColor: pressed ? "#ffffff" : "rgba(255,255,255,0.15)",
              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
              borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
            })}>
            {({ pressed }) => (
              <>
                <MaterialIcons name="add" size={16} color={pressed ? "#064E3B" : "#ffffff"} />
                <Text style={{ fontSize: 12, fontWeight: "700", color: pressed ? "#064E3B" : "#ffffff" }}>
                  Create PR
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>

      {/* ── KPI stat cards ── */}
      <View style={{ paddingHorizontal: 12, paddingTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {stats.map((card) => <StatPill key={card.label} card={card} />)}
      </View>

      {/* ── Phase pipeline ── */}
      <SectionHeader title="Procurement Pipeline" />
      <PhasePipeline stages={stages} />

      {/* ── Main row: Recent PRs + Status breakdown ── */}
      {/* Recent PRs table */}
      <View style={{ marginHorizontal: 12, marginTop: 16, backgroundColor: "#ffffff",
        borderRadius: 16, borderWidth: 1, borderColor: "#e5e7eb", overflow: "hidden",
        shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 }}>

        <SectionHeader title="Recent Purchase Requests"
          onViewAll={() => navigation?.navigate?.("Procurement")} />

        {/* Table header */}
        <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingBottom: 8,
          borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}>
          {["PR / Purpose", "Section", "Status", "Phase", "Amount"].map((h) => (
            <Text key={h} style={{
              fontSize: 9.5, fontWeight: "700", color: "#9ca3af",
              textTransform: "uppercase", letterSpacing: 0.5,
              flex: h === "PR / Purpose" ? 1 : undefined,
              width: h === "Section" ? 52 : h === "Status" ? 82 : h === "Phase" ? 28 : 64,
              textAlign: h === "Amount" ? "right" : "left",
            }}>
              {h}
            </Text>
          ))}
          <View style={{ width: 16 }} />
        </View>

        {prs.map((record, i) => (
          <PRRow key={record.id} record={record} isEven={i % 2 === 0}
            onPress={() => navigation?.navigate?.("Procurement")} />
        ))}
      </View>

      {/* ── Bottom row: Status chart + Alerts ── */}
      <View style={{ flexDirection: "row", marginHorizontal: 12, marginTop: 12, gap: 10 }}>

        {/* Status breakdown */}
        <View style={{ flex: 1, backgroundColor: "#ffffff", borderRadius: 16,
          borderWidth: 1, borderColor: "#e5e7eb", overflow: "hidden",
          shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05, shadowRadius: 6, elevation: 2, paddingBottom: 16 }}>
          <SectionHeader title="Phase Breakdown" />
          <View style={{ paddingHorizontal: 16 }}>
            <DonutChart stages={stages} />
          </View>
        </View>

        {/* Alerts */}
        <View style={{ flex: 1, backgroundColor: "#ffffff", borderRadius: 16,
          borderWidth: 1, borderColor: "#e5e7eb", overflow: "hidden",
          shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 }}>
          <SectionHeader title="Alerts" onViewAll={() => {}} />
          {alerts.map((alert) => <AlertRow key={alert.id} alert={alert} />)}
        </View>
      </View>

      {/* ── Quick actions ── */}
      <SectionHeader title="Quick Actions" />
      <View style={{ flexDirection: "row", paddingHorizontal: 12, gap: 8, flexWrap: "wrap" }}>
        {[
          { label: "New PR",          icon: "add-circle-outline",    nav: "Procurement" },
          { label: "Canvassing",      icon: "create",                nav: "Canvassing"  },
          { label: "Track Delivery",  icon: "local-shipping",        nav: "Procurement" },
          { label: "Payment",         icon: "account-balance-wallet", nav: "Procurement" },
        ].map((action) => (
          <TouchableOpacity
            key={action.label}
            onPress={() => navigation?.navigate?.(action.nav)}
            activeOpacity={0.8}
            style={{
              flex: 1, minWidth: (SCREEN_W - 56) / 2,
              backgroundColor: "#ffffff", borderRadius: 14,
              borderWidth: 1, borderColor: "#e5e7eb",
              paddingVertical: 14, paddingHorizontal: 12,
              flexDirection: "row", alignItems: "center", gap: 10,
              shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
            }}>
            <View style={{ width: 36, height: 36, borderRadius: 10,
              backgroundColor: "#ecfdf5", alignItems: "center", justifyContent: "center" }}>
              <MaterialIcons name={action.icon as any} size={20} color="#064E3B" />
            </View>
            <Text style={{ fontSize: 12.5, fontWeight: "700", color: "#111827" }}>
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Process timeline summary ── */}
      <SectionHeader title="Process Guide" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}>
        {[
          { phase: 1, title: "Request & Approval", steps: "Steps 1–5",  detail: "PR → Div. Head → BAC → Budget → PARPO",   color: "#3b82f6" },
          { phase: 2, title: "Canvass & Awards",   steps: "Steps 6–10", detail: "Canvass release → AAA → BAC resolution",   color: "#f59e0b" },
          { phase: 3, title: "Order & Delivery",   steps: "Steps 11–31",detail: "PO → ORS → Accounting → Delivery → IAR",  color: "#10b981" },
          { phase: 4, title: "Payment & Closure",  steps: "Steps 32–48",detail: "DV → Accounting → PARPO → Check/LLDAP",   color: "#8b5cf6" },
        ].map((p) => (
          <View key={p.phase} style={{
            width: 200, borderRadius: 14, borderWidth: 1,
            borderColor: p.color + "40", backgroundColor: p.color + "0d",
            padding: 14, gap: 6,
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ backgroundColor: p.color, paddingHorizontal: 8, paddingVertical: 3,
                borderRadius: 999 }}>
                <Text style={{ fontSize: 9.5, fontWeight: "800", color: "#fff",
                  textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Phase {p.phase}
                </Text>
              </View>
              <Text style={{ fontSize: 10, color: p.color, fontWeight: "600" }}>{p.steps}</Text>
            </View>
            <Text style={{ fontSize: 13, fontWeight: "800", color: "#111827" }}>{p.title}</Text>
            <Text style={{ fontSize: 11, color: "#6b7280", lineHeight: 16 }}>{p.detail}</Text>
          </View>
        ))}
      </ScrollView>
    </ScrollView>
  );
}
