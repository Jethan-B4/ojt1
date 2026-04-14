/**
 * EndUserView.tsx — read-only canvassing status tracker.
 *
 * Data strategy:
 *   • Fetches real PR items from purchase_request_items via fetchPRWithItemsById
 *   • Resolves canvasser_assignments with division_name + canvasser fullname
 *     via fetchAssignmentsWithDetails (single join query — no raw IDs shown)
 *   • Fetches session metadata (bac_no, deadline) from canvass_sessions
 *   • Subscribes to Supabase realtime on canvasser_assignments + canvass_entries
 *
 * UI:
 *   • Compact header with PR number, section, status chip
 *   • Single combined progress + timeline card (no redundant "current stage" card)
 *   • Return-status rows show division name + canvasser name, not numeric IDs
 *   • Submitted quotations: supplier count only — no raw price data shown
 *   • PR line items collapsible to save vertical space
 */

import type {
  CanvassEntryRow,
  EnrichedAssignmentRow,
} from "@/lib/supabase-types";
import {
  fetchAssignmentsWithDetails,
  fetchCanvassSessionById,
  fetchCanvassSessionForPR,
  fetchQuotesForSession,
} from "@/lib/supabase/canvassing";
import { supabase } from "@/lib/supabase/client";
import { fetchPRIdByNo, fetchPRWithItemsById } from "@/lib/supabase/pr";
import type {
  CanvassStage,
  CanvassingPR,
  CanvassingPRItem,
} from "@/types/canvassing";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { CanvassPreviewData } from "../(components)/CanvassPreview";
import CanvassPreviewModal from "../(modals)/CanvassPreviewModal";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

const fmt = (n: number) =>
  n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const prTotal = (items: CanvassingPRItem[]) =>
  items.reduce((s, i) => s + i.qty * i.unitCost, 0);

const STAGE_ORDER: CanvassStage[] = [
  "pr_received",
  "release_canvass",
  "collect_canvass",
  "bac_resolution",
  "aaa_preparation",
];

type StageMeta = {
  step: number;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
};
const STAGE_META: Record<CanvassStage, StageMeta> = {
  pr_received: { step: 6, label: "PR Received", icon: "inbox" },
  release_canvass: { step: 7, label: "RFQ Released", icon: "send" },
  collect_canvass: { step: 8, label: "Collecting", icon: "assignment-return" },
  bac_resolution: { step: 9, label: "Resolution", icon: "gavel" },
  aaa_preparation: { step: 10, label: "AAA", icon: "emoji-events" },
};

// ─── Atoms ────────────────────────────────────────────────────────────────────

const Card = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <View
    className={`bg-white rounded-2xl border border-gray-200 mb-3 overflow-hidden ${className ?? ""}`}
    style={{
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    }}
  >
    {children}
  </View>
);

const SectionLabel = ({ label }: { label: string }) => (
  <View className="flex-row items-center gap-2 mb-2 mt-0.5">
    <Text className="text-[9.5px] font-bold tracking-widest uppercase text-gray-400">
      {label}
    </Text>
    <View className="flex-1 h-px bg-gray-100" />
  </View>
);

// ─── Line items — collapsible ────────────────────────────────────────────────

function ItemsSection({ items }: { items: CanvassingPRItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <TouchableOpacity
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.8}
        className="flex-row items-center justify-between px-4 py-3"
      >
        <View className="flex-row items-center gap-2">
          <MaterialIcons name="list-alt" size={15} color="#064E3B" />
          <Text className="text-[12.5px] font-bold text-gray-800">
            Line Items
          </Text>
          <View className="bg-emerald-100 px-1.5 py-0.5 rounded-md">
            <Text className="text-[9.5px] font-bold text-emerald-700">
              {items.length}
            </Text>
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          <Text className="text-[12px] font-bold text-[#064E3B]">
            ₱<Text style={{ fontFamily: MONO }}>{fmt(prTotal(items))}</Text>
          </Text>
          <MaterialIcons
            name={open ? "expand-less" : "expand-more"}
            size={18}
            color="#9ca3af"
          />
        </View>
      </TouchableOpacity>

      {open && (
        <View style={{ borderTopWidth: 1, borderTopColor: "#f3f4f6" }}>
          {/* Column headers */}
          <View className="flex-row bg-[#064E3B] px-3 py-1.5">
            {["Description", "Unit", "Qty", "Cost", "Total"].map((h, i) => (
              <Text
                key={h}
                className="text-[8.5px] font-bold uppercase tracking-wide text-white/70"
                style={{
                  flex: i === 0 ? 2 : 1,
                  textAlign: i > 1 ? "right" : "left",
                }}
              >
                {h}
              </Text>
            ))}
          </View>
          {items.map((item, i) => (
            <View
              key={item.id}
              className={`flex-row px-3 py-2 ${i % 2 ? "bg-gray-50" : "bg-white"}`}
              style={{ borderTopWidth: 1, borderTopColor: "#f3f4f6" }}
            >
              <Text
                className="flex-[2] text-[11px] text-gray-700"
                numberOfLines={2}
              >
                {item.desc}
              </Text>
              <Text className="flex-1 text-[11px] text-gray-500">
                {item.unit}
              </Text>
              <Text
                className="flex-1 text-[11px] text-gray-700 text-right"
                style={{ fontFamily: MONO }}
              >
                {item.qty}
              </Text>
              <Text className="flex-1 text-[11px] text-gray-700 text-right">
                ₱<Text style={{ fontFamily: MONO }}>{fmt(item.unitCost)}</Text>
              </Text>
              <Text className="flex-1 text-[11px] font-semibold text-[#2d6a4f] text-right">
                ₱
                <Text style={{ fontFamily: MONO }}>
                  {fmt(item.qty * item.unitCost)}
                </Text>
              </Text>
            </View>
          ))}
          {/* Total row */}
          <View
            className="flex-row px-3 py-2 bg-[#f0fdf4]"
            style={{ borderTopWidth: 1, borderTopColor: "#d1fae5" }}
          >
            <Text className="flex-[2] text-[11px] font-bold text-[#064E3B]">
              Total
            </Text>
            <Text className="flex-1" />
            <Text className="flex-1" />
            <Text className="flex-1" />
            <Text className="flex-1 text-[11.5px] font-bold text-[#064E3B] text-right">
              ₱<Text style={{ fontFamily: MONO }}>{fmt(prTotal(items))}</Text>
            </Text>
          </View>
        </View>
      )}
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EndUserView({
  pr,
  onBack,
  currentStage: currentStageProp,
}: {
  pr: CanvassingPR;
  onBack?: () => void;
  currentStage?: CanvassStage;
}) {
  // ── State ───────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentStage, setCurrentStage] = useState<CanvassStage>(
    currentStageProp ?? "pr_received",
  );
  const [bacNo, setBacNo] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [liveItems, setLiveItems] = useState<CanvassingPRItem[]>(pr.items);
  const [assignments, setAssignments] = useState<EnrichedAssignmentRow[]>([]);
  const [entries, setEntries] = useState<CanvassEntryRow[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const normalizeStage = (value: any): CanvassStage => {
    const v = String(value ?? "");
    return (v && (v as any) in STAGE_META ? v : STAGE_ORDER[0]) as CanvassStage;
  };

  // ── Initial load ─────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const prId = await fetchPRIdByNo(pr.prNo);
        if (!prId) return;

        // Read-only: never create a session on the end-user side.
        const sessionRow = await fetchCanvassSessionForPR(prId);
        if (!sessionRow) {
          // PR has not entered canvassing yet.
          setLoading(false);
          return;
        }

        const sid = String(sessionRow.id);
        setSessionId(sid);
        if (sessionRow.stage) setCurrentStage(normalizeStage(sessionRow.stage));
        setBacNo(sessionRow.bac_no ?? null);
        setDeadline(sessionRow.deadline ?? null);

        const [{ items }, asgns, quotes] = await Promise.all([
          fetchPRWithItemsById(prId),
          fetchAssignmentsWithDetails(sid),
          fetchQuotesForSession(sid),
        ]);

        setLiveItems(
          items.map((i) => ({
            id: parseInt(String(i.id)),
            desc: i.description,
            stock: i.stock_no,
            unit: i.unit,
            qty: i.quantity,
            unitCost: i.unit_price,
          })),
        );
        setAssignments(asgns);
        setEntries(quotes);
      } catch {
        // silently fall back to prop data already set as defaults
      } finally {
        setLoading(false);
      }
    })();
  }, [pr.prNo]);

  // ── Realtime — live updates when canvassers submit ──────────────────────────
  useEffect(() => {
    if (!sessionId) return;

    const sessionChannel = supabase
      .channel(`eu-session-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "canvass_sessions",
          filter: `id=eq.${sessionId}`,
        },
        async () => {
          try {
            const sess = await fetchCanvassSessionById(sessionId);
            if (!sess) return;
            if (sess.stage) setCurrentStage(normalizeStage(sess.stage));
            setBacNo(sess.bac_no ?? null);
            setDeadline(sess.deadline ?? null);
          } catch {}
        },
      )
      .subscribe();

    const asgnsChannel = supabase
      .channel(`eu-asgns-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "canvasser_assignments",
          filter: `session_id=eq.${sessionId}`,
        },
        async () => {
          try {
            setAssignments(await fetchAssignmentsWithDetails(sessionId));
          } catch {}
        },
      )
      .subscribe();

    const entriesChannel = supabase
      .channel(`eu-entries-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "canvass_entries",
          filter: `session_id=eq.${sessionId}`,
        },
        async () => {
          try {
            setEntries(await fetchQuotesForSession(sessionId));
          } catch {}
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sessionChannel);
      supabase.removeChannel(asgnsChannel);
      supabase.removeChannel(entriesChannel);
    };
  }, [sessionId]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const safeStage = normalizeStage(currentStage);
  const currentIdx = STAGE_ORDER.indexOf(safeStage);
  const returnedCount = assignments.filter(
    (a) => a.status === "returned",
  ).length;
  const totalAssigned = assignments.length;
  const uniqueSuppliers = [...new Set(entries.map((e) => e.supplier_name))];

  const buildPreviewData = (): CanvassPreviewData => {
    const deadlineDate = new Date();
    deadlineDate.setDate(deadlineDate.getDate() + 7);
    return {
      prNo: pr.prNo,
      quotationNo: bacNo ?? "—",
      date: pr.date,
      deadline: deadline
        ? new Date(deadline).toLocaleDateString("en-PH", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })
        : deadlineDate.toLocaleDateString("en-PH", {
            month: "long",
            day: "numeric",
            year: "numeric",
          }),
      bacChairperson: "ATTY. JAIME G. RESOCO, JR.",
      officeSection: pr.officeSection,
      purpose: pr.purpose,
      items: liveItems.map((item, i) => ({
        itemNo: i + 1,
        description: item.desc,
        qty: item.qty,
        unit: item.unit,
        unitPrice: "",
      })),
      canvasserNames: [],
    };
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View className="flex-1 bg-gray-50">
      {/* ── Header ── */}
      <View className="bg-[#064E3B] px-4 pt-3.5 pb-3.5">
        <View className="flex-row items-center gap-2.5">
          {onBack && (
            <TouchableOpacity
              onPress={onBack}
              hitSlop={10}
              className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center"
            >
              <MaterialIcons name="chevron-left" size={20} color="#fff" />
            </TouchableOpacity>
          )}
          <View className="flex-1">
            <Text className="text-[9px] font-semibold tracking-widest uppercase text-white/40">
              DAR · Canvassing Status
            </Text>
            <Text
              className="text-[15px] font-extrabold text-white leading-tight"
              style={{ fontFamily: MONO }}
            >
              {pr.prNo}
            </Text>
          </View>
          {/* Current stage chip */}
          <View className="items-end gap-1">
            <View className="bg-white/15 px-2.5 py-1 rounded-lg border border-white/20">
              <Text className="text-[10.5px] font-bold text-white">
                Step {STAGE_META[safeStage].step} ·{" "}
                {STAGE_META[safeStage].label}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setPreviewOpen(true)}
              activeOpacity={0.8}
              className="flex-row items-center gap-1 bg-white/10 px-2 py-1 rounded-lg border border-white/15"
            >
              <MaterialIcons
                name="description"
                size={11}
                color="rgba(255,255,255,0.75)"
              />
              <Text className="text-[10px] font-semibold text-white/75">
                View RFQ
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Meta row */}
        <View className="flex-row items-center flex-wrap gap-x-2 mt-2">
          {[
            pr.officeSection,
            pr.date,
            `₱${fmt(prTotal(liveItems))}`,
            bacNo ? `BAC No. ${bacNo}` : null,
          ]
            .filter(Boolean)
            .map((label, i, arr) => (
              <React.Fragment key={i}>
                <Text
                  className="text-[10.5px] text-white/60"
                  style={
                    i === 2
                      ? {
                          fontFamily: MONO,
                          color: "rgba(255,255,255,0.75)",
                          fontWeight: "600",
                        }
                      : undefined
                  }
                >
                  {label}
                </Text>
                {i < arr.length - 1 && (
                  <View className="w-1 h-1 rounded-full bg-white/25" />
                )}
              </React.Fragment>
            ))}
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center gap-3">
          <ActivityIndicator size="large" color="#064E3B" />
          <Text className="text-[12px] text-gray-400">
            Loading canvass data…
          </Text>
        </View>
      ) : !sessionId ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-[13px] font-bold text-gray-800 text-center">
            This PR has not entered the canvassing stage yet.
          </Text>
          <Text className="text-[11.5px] text-gray-500 text-center mt-2">
            Once BAC starts canvassing, this screen will show live progress and
            quotations.
          </Text>
          {onBack && (
            <TouchableOpacity
              onPress={onBack}
              activeOpacity={0.85}
              className="mt-4 px-4 py-2.5 rounded-xl bg-[#064E3B]"
            >
              <Text className="text-[12px] font-bold text-white">Back</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 14, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                try {
                  setRefreshing(true);
                  const prId = await fetchPRIdByNo(pr.prNo);
                  if (!prId) return;
                  const sessionRow = await fetchCanvassSessionForPR(prId);
                  if (!sessionRow) return;
                  const sid = String(sessionRow.id);
                  setSessionId(sid);
                  if (sessionRow.stage)
                    setCurrentStage(normalizeStage(sessionRow.stage));
                  setBacNo(sessionRow.bac_no ?? null);
                  setDeadline(sessionRow.deadline ?? null);
                  const [{ items }, asgns, quotes] = await Promise.all([
                    fetchPRWithItemsById(prId),
                    fetchAssignmentsWithDetails(sid),
                    fetchQuotesForSession(sid),
                  ]);
                  setLiveItems(
                    items.map((i) => ({
                      id: parseInt(String(i.id)),
                      desc: i.description,
                      stock: i.stock_no,
                      unit: i.unit,
                      qty: i.quantity,
                      unitCost: i.unit_price,
                    })),
                  );
                  setAssignments(asgns);
                  setEntries(quotes);
                } catch {
                } finally {
                  setRefreshing(false);
                }
              }}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* ── Progress + Stage Timeline ── */}
          <Card>
            <View className="px-4 pt-3 pb-3">
              <SectionLabel label="Canvassing Progress" />

              {/* Stage timeline — compact */}
              {STAGE_ORDER.map((s, i) => {
                const meta = STAGE_META[s];
                const isDone = i < currentIdx;
                const isActive = i === currentIdx;
                return (
                  <View key={s} className="flex-row items-start">
                    {/* Spine */}
                    <View className="items-center" style={{ width: 32 }}>
                      <View
                        className={`w-6 h-6 rounded-full items-center justify-center ${
                          isDone
                            ? "bg-emerald-500"
                            : isActive
                              ? "bg-[#064E3B]"
                              : "bg-gray-200"
                        }`}
                      >
                        <MaterialIcons
                          name={isDone ? "check" : meta.icon}
                          size={12}
                          color={isDone || isActive ? "#fff" : "#9ca3af"}
                        />
                      </View>
                      {i < STAGE_ORDER.length - 1 && (
                        <View
                          className={`w-0.5 ${isDone ? "bg-emerald-400" : "bg-gray-200"}`}
                          style={{ height: 22 }}
                        />
                      )}
                    </View>

                    {/* Label row */}
                    <View className="flex-1 pl-2 pb-3 pt-0.5">
                      <View className="flex-row items-center justify-between">
                        <Text
                          className={`text-[12px] font-bold ${
                            isDone
                              ? "text-emerald-700"
                              : isActive
                                ? "text-[#1a4d2e]"
                                : "text-gray-400"
                          }`}
                        >
                          {meta.label}
                        </Text>
                        <View
                          className={`px-2 py-0.5 rounded-full ${
                            isDone
                              ? "bg-emerald-100"
                              : isActive
                                ? "bg-blue-100"
                                : "bg-gray-100"
                          }`}
                        >
                          <Text
                            className={`text-[9px] font-bold ${
                              isDone
                                ? "text-emerald-700"
                                : isActive
                                  ? "text-blue-700"
                                  : "text-gray-400"
                            }`}
                          >
                            {isDone
                              ? "Done"
                              : isActive
                                ? "In Progress"
                                : "Pending"}
                          </Text>
                        </View>
                      </View>
                      {/* Only show deadline on the collect step if available */}
                      {isActive && deadline && s === "collect_canvass" && (
                        <Text className="text-[10px] text-amber-600 mt-0.5">
                          Due:{" "}
                          {new Date(deadline).toLocaleDateString("en-PH", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </Card>

          {/* ── Canvass Return Status (only when assignments exist) ── */}
          {totalAssigned > 0 && (
            <Card>
              <View className="px-4 pt-3 pb-3">
                <View className="flex-row items-center justify-between mb-2.5">
                  <SectionLabel label="Return Status" />
                  <Text className="text-[11px] font-bold text-gray-600 mb-2">
                    {returnedCount}/{totalAssigned} returned
                  </Text>
                </View>

                {/* Progress bar */}
                <View className="bg-gray-100 rounded-full h-1.5 overflow-hidden mb-3">
                  <View
                    className="h-1.5 rounded-full bg-emerald-500"
                    style={{
                      width: `${totalAssigned > 0 ? (returnedCount / totalAssigned) * 100 : 0}%`,
                    }}
                  />
                </View>

                {/* Per-division rows — show actual names from DB, not IDs */}
                {assignments.map((a, i) => {
                  const isReturned = a.status === "returned";
                  const isReleased = a.status === "released";
                  const divLabel =
                    a.division_name ?? `Division ${a.division_id}`;
                  const cvsrLabel = a.canvasser_name ?? "—";
                  return (
                    <View
                      key={a.id ?? i}
                      className={`flex-row items-center gap-2.5 px-3 py-2.5 rounded-xl mb-1.5 border ${
                        isReturned
                          ? "bg-emerald-50 border-emerald-200"
                          : isReleased
                            ? "bg-amber-50 border-amber-200"
                            : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <View
                        className={`w-6 h-6 rounded-full items-center justify-center ${
                          isReturned
                            ? "bg-emerald-500"
                            : isReleased
                              ? "bg-amber-400"
                              : "bg-gray-300"
                        }`}
                      >
                        <MaterialIcons
                          name={
                            isReturned
                              ? "check"
                              : isReleased
                                ? "schedule"
                                : "hourglass-empty"
                          }
                          size={12}
                          color="#fff"
                        />
                      </View>
                      <View className="flex-1">
                        <Text
                          className="text-[12px] font-semibold text-gray-800"
                          numberOfLines={1}
                        >
                          {divLabel}
                        </Text>
                        <Text
                          className="text-[10.5px] text-gray-400"
                          numberOfLines={1}
                        >
                          {cvsrLabel}
                        </Text>
                      </View>
                      <View
                        className={`px-2 py-0.5 rounded-full ${
                          isReturned
                            ? "bg-emerald-100"
                            : isReleased
                              ? "bg-amber-100"
                              : "bg-gray-100"
                        }`}
                      >
                        <Text
                          className={`text-[9.5px] font-bold ${
                            isReturned
                              ? "text-emerald-700"
                              : isReleased
                                ? "text-amber-700"
                                : "text-gray-500"
                          }`}
                        >
                          {isReturned
                            ? "Returned"
                            : isReleased
                              ? "Out for canvass"
                              : "Pending"}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </Card>
          )}

          {/* ── Quotations summary (visible once entries exist) ── */}
          {entries.length > 0 && (
            <Card>
              <View className="px-4 pt-3 pb-3">
                <SectionLabel label="Submitted Quotations" />
                <View className="flex-row items-center gap-3">
                  <View className="flex-row items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex-1">
                    <MaterialIcons
                      name="storefront"
                      size={14}
                      color="#065f46"
                    />
                    <Text className="text-[12px] font-bold text-emerald-800">
                      {uniqueSuppliers.length} supplier
                      {uniqueSuppliers.length !== 1 ? "s" : ""} quoted
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 flex-1">
                    <MaterialIcons
                      name="format-list-numbered"
                      size={14}
                      color="#1d4ed8"
                    />
                    <Text className="text-[12px] font-bold text-blue-800">
                      {entries.length} entr{entries.length !== 1 ? "ies" : "y"}
                    </Text>
                  </View>
                </View>
                <Text className="text-[10.5px] text-gray-400 mt-2 leading-4">
                  Quotes are under BAC review. The winning offer will be
                  determined once all forms are returned.
                </Text>
              </View>
            </Card>
          )}

          {/* ── PR details + line items (collapsible) ── */}
          <Card>
            <View className="px-4 pt-3 pb-3">
              <SectionLabel label="Purchase Request" />
              <View className="flex-row justify-between items-start mb-2">
                <View className="flex-1 pr-4">
                  <Text className="text-[11px] text-gray-400 mb-0.5">
                    {pr.officeSection} · {pr.date}
                  </Text>
                  <Text className="text-[12px] text-gray-600 leading-[18px]">
                    {pr.purpose}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-[10px] text-gray-400 mb-0.5">
                    Total
                  </Text>
                  <Text className="text-[14px] font-extrabold text-[#064E3B]">
                    ₱
                    <Text style={{ fontFamily: MONO }}>
                      {fmt(prTotal(liveItems))}
                    </Text>
                  </Text>
                  <Text className="text-[10.5px] text-gray-400">
                    {liveItems.length} item{liveItems.length !== 1 ? "s" : ""}
                  </Text>
                </View>
              </View>
            </View>
          </Card>

          {/* ── Line items — collapsible ── */}
          {liveItems.length > 0 && <ItemsSection items={liveItems} />}
        </ScrollView>
      )}

      {/* ── RFQ Preview Modal ── */}
      <CanvassPreviewModal
        visible={previewOpen}
        data={buildPreviewData()}
        onClose={() => setPreviewOpen(false)}
      />
    </View>
  );
}
