/**
 * CanvasserView.tsx — Canvasser role (role_id 7), Step 8.
 *
 * UI layout:
 *   ┌─────────────────────────────────────────┐
 *   │  Green header — PR no, meta, status     │
 *   ├─────────────────────────────────────────┤
 *   │  [Canvass Progress]  [My RFQ]           │
 *   ├─────────────────────────────────────────┤
 *   │  Progress tab:                          │
 *   │    • Return progress bar                │
 *   │    • Per-division return status rows    │
 *   │    • Lowest-offer abstract table        │
 *   │    • Submitted RFQ cards (winner ★)     │
 *   │                                         │
 *   │  My RFQ tab:                            │
 *   │    • PR line-items reference table      │
 *   │    • Supplier + price input per item    │
 *   │    • Quoted total preview               │
 *   │    • [View RFQ]  [Submit / Re-submit]   │
 *   └─────────────────────────────────────────┘
 */

import type {
  CanvassEntryRow,
  CanvasserAssignmentRow,
  CanvassUserRow,
} from "@/lib/supabase";
import {
  ensureCanvassSession,
  fetchAssignmentsForSession,
  fetchQuotesForSession,
  fetchUsersByRole,
  markAssignmentReturnedById,
} from "@/lib/supabase/canvassing";
import { supabase } from "@/lib/supabase/client";
import { fetchPRIdByNo, fetchPRWithItemsById, insertRemark } from "@/lib/supabase/pr";
import type {
  CanvassingPR,
  CanvassingPRItem,
} from "@/types/canvassing";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { CanvassPreviewData } from "../(components)/CanvassPreview";
import CanvassPreviewModal from "../(modals)/CanvassPreviewModal";
import { useAuth } from "../contexts/AuthContext";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const CANVASS_ROLE_IDS = [6, 7];

const fmt = (n: number) =>
  n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const prTotal = (items: CanvassingPRItem[]) =>
  items.reduce((s, i) => s + i.qty * i.unitCost, 0);

type Tab = "progress" | "my_rfq";

function pickMyAssignment(asgns: any[], currentUser: any) {
  const bySelf = (asgns ?? []).filter(
    (a) => Number(a.canvasser_id) === Number(currentUser?.id),
  );
  const byDiv = (asgns ?? []).filter(
    (a) => Number(a.division_id) === Number(currentUser?.division_id),
  );
  const pool = bySelf.length ? bySelf : byDiv;
  const released = pool.filter((a) => String(a.status) === "released");
  const candidates = released.length ? released : pool;
  const sorted = [...candidates].sort((a, b) => {
    const ai = Number(a.rfq_index ?? 0) || 0;
    const bi = Number(b.rfq_index ?? 0) || 0;
    if (ai !== bi) return ai - bi;
    const ad = Date.parse(String(a.released_at ?? "")) || 0;
    const bd = Date.parse(String(b.released_at ?? "")) || 0;
    return bd - ad;
  });
  return sorted[0] ?? null;
}

// ─── Winner calculation ───────────────────────────────────────────────────────

interface ItemWinner {
  itemId: number;
  winnerName: string;
  winnerPrice: number;
  winnerTotal: number;
}

function computeWinners(
  entries: CanvassEntryRow[],
  items: CanvassingPRItem[],
): ItemWinner[] {
  return items.map((item) => {
    const relevant = entries.filter(
      (e) => e.item_no === item.id && e.unit_price > 0,
    );
    const winner = relevant.reduce<CanvassEntryRow | null>((best, e) => {
      if (!best || e.unit_price < best.unit_price) return e;
      return best;
    }, null);
    return {
      itemId: item.id,
      winnerName: winner?.supplier_name ?? "—",
      winnerPrice: winner?.unit_price ?? 0,
      winnerTotal: winner ? winner.unit_price * item.qty : 0,
    };
  });
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

const Divider = ({ label }: { label: string }) => (
  <View className="flex-row items-center gap-2 mb-2.5 mt-1">
    <Text className="text-[9.5px] font-bold tracking-widest uppercase text-gray-400">
      {label}
    </Text>
    <View className="flex-1 h-px bg-gray-200" />
  </View>
);

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

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-2.5">
      <Text className="text-[11px] font-bold text-gray-500 mb-1">
        {label}
        {required ? <Text className="text-red-500"> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}

// ─── Progress tab: lowest-offer abstract ─────────────────────────────────────

const WinnerAbstract = ({
  winners,
  items,
}: {
  winners: ItemWinner[];
  items: CanvassingPRItem[];
}) => {
  const grandTotal = winners.reduce((s, w) => s + w.winnerTotal, 0);
  const hasData = winners.some((w) => w.winnerPrice > 0);

  if (!hasData) {
    return (
      <View className="items-center py-8 bg-white rounded-2xl border border-dashed border-gray-200 mb-3">
        <MaterialIcons name="pending" size={26} color="#d1d5db" />
        <Text className="text-[12px] text-gray-400 mt-2 text-center px-8">
          Winning offers will appear once submissions come in.
        </Text>
      </View>
    );
  }

  return (
    <View
      className="bg-white rounded-2xl border border-emerald-200 mb-3 overflow-hidden"
      style={{
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
      }}
    >
      <View className="bg-[#064E3B] px-3 py-2 flex-row items-center gap-2">
        <MaterialIcons name="emoji-events" size={13} color="#fbbf24" />
        <Text className="text-[11.5px] font-bold text-white">
          Lowest Offer Summary
        </Text>
      </View>
      <View className="flex-row bg-emerald-50 px-3 py-1.5">
        {["Item", "Supplier", "Unit Price", "Total"].map((h, i) => (
          <Text
            key={h}
            className="text-[8.5px] font-bold uppercase tracking-wide text-emerald-700"
            style={{
              flex: i === 0 ? 2 : 1,
              textAlign: i > 0 ? "right" : "left",
            }}
          >
            {h}
          </Text>
        ))}
      </View>
      {items.map((item, i) => {
        const w = winners.find((x) => x.itemId === item.id);
        return (
          <View
            key={item.id}
            className={`flex-row items-center px-3 py-2 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
            style={{ borderTopWidth: 1, borderTopColor: "#f0fdf4" }}
          >
            <Text
              className="flex-[2] text-[10.5px] text-gray-700"
              numberOfLines={1}
            >
              {item.desc}
            </Text>
            <Text
              className="flex-1 text-[10px] font-semibold text-emerald-700 text-right"
              numberOfLines={1}
            >
              {w && w.winnerPrice > 0 ? w.winnerName : "—"}
            </Text>
            <Text className="flex-1 text-[10.5px] font-bold text-emerald-700 text-right">
              {w && w.winnerPrice > 0 ? (
                <>
                  ₱
                  <Text style={{ fontFamily: MONO }}>{fmt(w.winnerPrice)}</Text>
                </>
              ) : (
                "—"
              )}
            </Text>
            <Text className="flex-1 text-[11px] font-extrabold text-[#064E3B] text-right">
              {w && w.winnerTotal > 0 ? (
                <>
                  ₱
                  <Text style={{ fontFamily: MONO }}>{fmt(w.winnerTotal)}</Text>
                </>
              ) : (
                "—"
              )}
            </Text>
          </View>
        );
      })}
      <View
        className="flex-row justify-between items-center px-3 py-2.5 bg-emerald-50"
        style={{ borderTopWidth: 2, borderTopColor: "#bbf7d0" }}
      >
        <Text className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">
          Grand Total
        </Text>
        <Text className="text-[13px] font-extrabold text-[#064E3B]">
          ₱<Text style={{ fontFamily: MONO }}>{fmt(grandTotal)}</Text>
        </Text>
      </View>
    </View>
  );
};

// ─── Progress tab: per-canvasser submission card ──────────────────────────────

const SubmissionCard = ({
  assignment,
  user,
  entries,
  liveItems,
  winners,
  isOwn,
  onViewRFQ,
}: {
  assignment: CanvasserAssignmentRow;
  user: CanvassUserRow | undefined;
  entries: CanvassEntryRow[];
  liveItems: CanvassingPRItem[];
  winners: ItemWinner[];
  isOwn: boolean;
  onViewRFQ: () => void;
}) => {
  const divName = user?.division_name ?? `Division ${assignment.division_id}`;
  const totalQuoted = entries.reduce((s, e) => s + e.total_price, 0);

  return (
    <Card>
      <View
        className={`flex-row items-center justify-between px-4 py-2.5 border-b border-gray-100 ${isOwn ? "bg-blue-50" : "bg-gray-50"}`}
      >
        <View className="flex-row items-center gap-2.5">
          <View className="w-7 h-7 rounded-xl bg-emerald-100 items-center justify-center">
            <MaterialIcons
              name="assignment-turned-in"
              size={13}
              color="#065f46"
            />
          </View>
          <View>
            <View className="flex-row items-center gap-1.5">
              <Text
                className="text-[12.5px] font-bold text-gray-900"
                numberOfLines={1}
              >
                {divName}
              </Text>
              {isOwn && (
                <View className="bg-blue-100 px-1.5 py-0.5 rounded-md">
                  <Text className="text-[8px] font-bold text-blue-700">
                    You
                  </Text>
                </View>
              )}
            </View>
            <Text className="text-[10.5px] text-gray-400">
              {user?.username ?? "—"}
            </Text>
          </View>
        </View>
        <View className="items-end gap-1">
          <View className="bg-emerald-100 px-2 py-0.5 rounded-full">
            <Text className="text-[9px] font-bold text-emerald-700">
              Returned
            </Text>
          </View>
          <TouchableOpacity
            onPress={onViewRFQ}
            activeOpacity={0.8}
            className="flex-row items-center gap-1 bg-[#064E3B] px-2.5 py-1 rounded-lg mt-0.5"
          >
            <MaterialIcons name="description" size={10} color="#fff" />
            <Text className="text-[10px] font-bold text-white">View RFQ</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View className="px-4 pt-2 pb-2.5">
        {liveItems.map((item) => {
          const entry = entries.find((e) => e.item_no === item.id);
          const winner = winners.find((w) => w.itemId === item.id);
          const isWin =
            entry &&
            winner &&
            winner.winnerPrice > 0 &&
            entry.unit_price === winner.winnerPrice;
          return (
            <View
              key={item.id}
              className={`flex-row items-center px-2 py-1.5 rounded-lg mb-0.5 ${
                isWin
                  ? "bg-emerald-50 border border-emerald-200"
                  : "bg-gray-50 border border-gray-100"
              }`}
            >
              <Text
                className="flex-[2] text-[10.5px] text-gray-700"
                numberOfLines={1}
              >
                {item.desc}
              </Text>
              <Text
                className={`w-20 text-[10.5px] font-semibold text-right ${isWin ? "text-emerald-700" : "text-gray-600"}`}
              >
                {entry ? (
                  <>
                    ₱
                    <Text style={{ fontFamily: MONO }}>
                      {fmt(entry.unit_price)}
                    </Text>
                  </>
                ) : (
                  "—"
                )}
              </Text>
              <Text
                className={`w-20 text-[10.5px] font-bold text-right ${isWin ? "text-emerald-700" : "text-gray-500"}`}
              >
                {entry ? (
                  <>
                    ₱
                    <Text style={{ fontFamily: MONO }}>
                      {fmt(entry.total_price)}
                    </Text>
                  </>
                ) : (
                  "—"
                )}
              </Text>
              <View className="w-5 items-center">
                {isWin ? (
                  <MaterialIcons name="star" size={12} color="#10b981" />
                ) : (
                  <View className="w-1 h-1 rounded-full bg-gray-300" />
                )}
              </View>
            </View>
          );
        })}
        <View className="flex-row justify-between items-center mt-1.5 pt-1.5 border-t border-gray-100">
          <Text className="text-[10px] text-gray-400">
            {entries.length} item{entries.length !== 1 ? "s" : ""} quoted
          </Text>
          <Text className="text-[11.5px] font-bold text-[#064E3B]">
            ₱<Text style={{ fontFamily: MONO }}>{fmt(totalQuoted)}</Text>
          </Text>
        </View>
      </View>
    </Card>
  );
};

// ─── Items reference table (My RFQ tab) ──────────────────────────────────────

const ItemsTable = ({ items }: { items: CanvassingPRItem[] }) => (
  <Card>
    <View className="px-4 pt-3 pb-2">
      <Divider label="PR Line Items (Reference)" />
      <View className="rounded-xl overflow-hidden border border-gray-100">
        <View className="flex-row bg-[#064E3B] px-2.5 py-1.5">
          {["Description", "Unit", "Qty", "Unit Cost", "Total"].map((h, i) => (
            <Text
              key={h}
              className="text-[9.5px] font-bold uppercase tracking-wide text-white/70"
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
            className={`flex-row px-2.5 py-2 ${i % 2 ? "bg-gray-50" : "bg-white"}`}
            style={{ borderTopWidth: 1, borderTopColor: "#f3f4f6" }}
          >
            <Text
              className="flex-[2] text-[11.5px] text-gray-700"
              numberOfLines={2}
            >
              {item.desc}
            </Text>
            <Text className="flex-1 text-[11.5px] text-gray-500">
              {item.unit}
            </Text>
            <Text className="flex-1 text-[11.5px] text-gray-700 text-right">
              {item.qty}
            </Text>
            <Text className="flex-1 text-[11.5px] text-gray-700 text-right">
              ₱<Text style={{ fontFamily: MONO }}>{fmt(item.unitCost)}</Text>
            </Text>
            <Text className="flex-1 text-[11.5px] font-semibold text-[#2d6a4f] text-right">
              ₱
              <Text style={{ fontFamily: MONO }}>
                {fmt(item.qty * item.unitCost)}
              </Text>
            </Text>
          </View>
        ))}
        <View
          className="flex-row px-2.5 py-2 bg-[#f0fdf4]"
          style={{ borderTopWidth: 1, borderTopColor: "#d1fae5" }}
        >
          <Text className="flex-[2] text-[11px] font-bold text-[#064E3B]">
            Total
          </Text>
          <Text className="flex-1 text-[11px] text-transparent">—</Text>
          <Text className="flex-1 text-[11px] text-transparent">—</Text>
          <Text className="flex-1 text-[11px] text-transparent">—</Text>
          <Text className="flex-1 text-[12px] font-bold text-[#064E3B] text-right">
            ₱<Text style={{ fontFamily: MONO }}>{fmt(prTotal(items))}</Text>
          </Text>
        </View>
      </View>
    </View>
  </Card>
);

// ─── Main component ───────────────────────────────────────────────────────────

export default function CanvasserView({
  pr,
  onBack,
}: {
  pr: CanvassingPR;
  onBack?: () => void;
}) {
  const { currentUser } = useAuth();
  const hideLowestOffers = true;

  const [activeTab, setActiveTab] = useState<Tab>("my_rfq");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [assigned, setAssigned] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [liveItems, setLiveItems] = useState<CanvassingPRItem[]>(pr.items);
  const [assignments, setAssignments] = useState<CanvasserAssignmentRow[]>([]);
  const [allEntries, setAllEntries] = useState<CanvassEntryRow[]>([]);
  const [allUsers, setAllUsers] = useState<CanvassUserRow[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDataOverride, setPreviewDataOverride] =
    useState<CanvassPreviewData | null>(null);
  const [myAssignmentId, setMyAssignmentId] = useState<number | null>(null);
  const [myQuotationNo, setMyQuotationNo] = useState<string>("—");
  const [returnRemark, setReturnRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const prId = await fetchPRIdByNo(pr.prNo);
        if (!prId) return;

        const session = await ensureCanvassSession(prId);
        setSessionId(session.id);

        const { data: asgns } = await supabase
          .from("canvasser_assignments")
          .select("*")
          .eq("session_id", session.id);

        const mine = pickMyAssignment(asgns ?? [], currentUser);
        setMyAssignmentId(mine?.id ?? null);
        setMyQuotationNo(mine?.quotation_no ?? "—");
        setAssigned(
          Boolean(mine && String(mine.status) === "released"),
        );

        const { items } = await fetchPRWithItemsById(prId);
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

        setSubmitted(Boolean(mine && String(mine.status) === "returned"));

        const [asgnsAll, entries, users] = await Promise.all([
          fetchAssignmentsForSession(session.id),
          fetchQuotesForSession(session.id),
          fetchUsersByRole(CANVASS_ROLE_IDS),
        ]);
        setAssignments(asgnsAll);
        const mine2 = pickMyAssignment(asgnsAll as any[], currentUser);
        setMyAssignmentId(mine2?.id ?? null);
        setMyQuotationNo(mine2?.quotation_no ?? "—");
        setAllEntries(entries);
        setAllUsers(users);
      } catch {
      } finally {
        setLoading(false);
      }
    })();
  }, [pr.prNo, currentUser]);

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      const prId = await fetchPRIdByNo(pr.prNo);
      if (!prId) return;
      const session = await ensureCanvassSession(prId);
      setSessionId(session.id);
      const { data: asgns } = await supabase
        .from("canvasser_assignments")
        .select("*")
        .eq("session_id", session.id);
      const mine = pickMyAssignment(asgns ?? [], currentUser);
      setMyAssignmentId(mine?.id ?? null);
      setMyQuotationNo(mine?.quotation_no ?? "—");
      setAssigned(
        Boolean(mine && String(mine.status) === "released"),
      );
      const { items } = await fetchPRWithItemsById(prId);
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
      setSubmitted(Boolean(mine && String(mine.status) === "returned"));
      const [asgnsAll, entries, users] = await Promise.all([
        fetchAssignmentsForSession(session.id),
        fetchQuotesForSession(session.id),
        fetchUsersByRole(CANVASS_ROLE_IDS),
      ]);
      setAssignments(asgnsAll);
      const mine2 = pickMyAssignment(asgnsAll as any[], currentUser);
      setMyAssignmentId(mine2?.id ?? null);
      setMyQuotationNo(mine2?.quotation_no ?? "—");
      setAllEntries(entries);
      setAllUsers(users);
    } catch {
    } finally {
      setRefreshing(false);
    }
  }, [pr.prNo, currentUser]);
  // ── Realtime subscriptions ───────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;

    const entriesChannel = supabase
      .channel(`cv-entries-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "canvass_entries",
          filter: `session_id=eq.${sessionId}`,
        },
        async () => {
          try {
            setAllEntries(await fetchQuotesForSession(sessionId));
          } catch {}
        },
      )
      .subscribe();

    const assignChannel = supabase
      .channel(`cv-asgns-${sessionId}`)
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
            const fresh = await fetchAssignmentsForSession(sessionId);
            setAssignments(fresh);
            const mine = pickMyAssignment(fresh as any[], currentUser);
            setMyAssignmentId(mine?.id ?? null);
            setMyQuotationNo(mine?.quotation_no ?? "—");
            setAssigned(Boolean(mine && String(mine.status) === "released"));
            setSubmitted(Boolean(mine && String(mine.status) === "returned"));
          } catch {}
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(entriesChannel);
      supabase.removeChannel(assignChannel);
    };
  }, [sessionId, currentUser]);

  // ── Submit handler ───────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!sessionId) return;
    try {
      if (!myAssignmentId) {
        Alert.alert(
          "No assignment",
          "You don't have an active RFQ assignment for this PR.",
        );
        return;
      }
      const prId = await fetchPRIdByNo(pr.prNo);
      if (!prId) throw new Error("PR not found");
      if (!returnRemark.trim()) {
        Alert.alert("Remarks required", "Please enter your return remarks.");
        return;
      }
      setSubmitting(true);
      await insertRemark(
        prId,
        currentUser?.id ?? null,
        `[Canvasser Return][RFQ ${myQuotationNo || myAssignmentId}] ${returnRemark.trim()}`,
        null,
      );
      await markAssignmentReturnedById(sessionId, myAssignmentId);

      setSubmitted(true);
      setActiveTab("progress");
      setReturnRemark("");
      Alert.alert("Returned", "Filled-out RFQ has been returned to BAC.");
    } catch (e: any) {
      Alert.alert("Return failed", e?.message ?? "Could not return RFQ");
    } finally {
      setSubmitting(false);
    }
  }, [
    sessionId,
    myAssignmentId,
    pr.prNo,
    returnRemark,
    currentUser?.id,
    myQuotationNo,
  ]);

  // ── Build RFQ preview data ────────────────────────────────────────────────────
  const buildPreviewDataForAssignment = useCallback(
    (assignment?: CanvasserAssignmentRow | null): CanvassPreviewData => {
      const issuedDate = assignment?.released_at
        ? new Date(assignment.released_at)
        : new Date();
      const deadline = new Date(issuedDate);
      deadline.setDate(deadline.getDate() + 7);
      const quotationNo =
        (assignment as any)?.quotation_no ??
        `RFQ #${(assignment as any)?.rfq_index ?? assignment?.id ?? "—"}`;
      return {
        prNo: pr.prNo,
        quotationNo,
        date: issuedDate.toLocaleDateString("en-PH", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
        deadline: deadline.toLocaleDateString("en-PH", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
        bacChairperson: "ATTY. JAIME G. RESOCO, JR.",
        officeSection: pr.officeSection,
        purpose: pr.purpose,
        assignedTo: currentUser?.fullname ?? "—",
        assignedDivision:
          allUsers.find((u) => Number(u.id) === Number(currentUser?.id))
            ?.division_name ?? "—",
        items: liveItems.map((item, i) => ({
          itemNo: i + 1,
          description: item.desc,
          qty: item.qty,
          unit: item.unit,
          unitPrice: "",
        })),
        canvasserNames: currentUser?.fullname ? [currentUser.fullname] : [],
      };
    },
    [pr, liveItems, currentUser, allUsers],
  );

  const buildPreviewData = useCallback((): CanvassPreviewData => {
    const mine = assignments.find(
      (a) => Number(a.id) === Number(myAssignmentId),
    );
    return buildPreviewDataForAssignment(mine ?? null);
  }, [assignments, myAssignmentId, buildPreviewDataForAssignment]);

  // ── Derived ───────────────────────────────────────────────────────────────────
  const userById = useMemo(
    () => Object.fromEntries(allUsers.map((u) => [u.id, u])),
    [allUsers],
  );

  const winners = useMemo(
    () => computeWinners(allEntries, liveItems),
    [allEntries, liveItems],
  );

  const returnedAssignments = assignments.filter(
    (a) => a.status === "returned",
  );
  const returnedCount = returnedAssignments.length;
  const totalCount = assignments.length;
  const myAssignments = assignments.filter(
    (a) =>
      Number(a.canvasser_id) === Number(currentUser?.id) ||
      Number(a.division_id) === Number(currentUser?.division_id),
  );

  // ── Render ─────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center gap-3">
        <ActivityIndicator size="large" color="#064E3B" />
        <Text className="text-[12px] text-gray-400">Loading canvass data…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* ── Header ── */}
      <View className="bg-[#064E3B] px-4 pt-3.5 pb-3.5">
        <View className="flex-row items-center justify-between">
          {/* Back + title */}
          <View className="flex-row items-center gap-2.5 flex-1">
            {onBack && (
              <TouchableOpacity
                onPress={onBack}
                activeOpacity={0.7}
                className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center"
              >
                <MaterialIcons name="chevron-left" size={20} color="#fff" />
              </TouchableOpacity>
            )}
            <View className="flex-1">
              <Text className="text-[9px] font-semibold tracking-widest uppercase text-white/40">
                DAR · Canvassing
              </Text>
              <Text
                className="text-[15px] font-extrabold text-white leading-tight"
                style={{ fontFamily: MONO }}
              >
                {pr.prNo}
              </Text>
            </View>
          </View>

          {/* Status chip */}
          {submitted ? (
            <View className="flex-row items-center gap-1 bg-emerald-500/25 px-2.5 py-1 rounded-full border border-emerald-400/40">
              <MaterialIcons name="check-circle" size={11} color="#6ee7b7" />
              <Text className="text-[10px] font-bold text-emerald-300">
                Submitted
              </Text>
            </View>
          ) : !assigned ? (
            <View className="bg-red-500/25 px-2.5 py-1 rounded-full border border-red-400/30">
              <Text className="text-[10px] font-bold text-red-300">
                No Assignment
              </Text>
            </View>
          ) : (
            <View className="bg-amber-400/20 px-2.5 py-1 rounded-full border border-amber-400/30">
              <Text className="text-[10px] font-bold text-amber-300">
                Pending Submission
              </Text>
            </View>
          )}
        </View>

        {/* Meta row */}
        <View className="flex-row items-center flex-wrap gap-x-2 gap-y-0.5 mt-2">
          {[
            pr.officeSection,
            pr.date,
            `₱${fmt(prTotal(liveItems))}`,
            totalCount > 0 ? `${returnedCount}/${totalCount} returned` : null,
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
                          fontWeight: "600",
                          color: "rgba(255,255,255,0.75)",
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

      {/* ── Tab bar ── */}
      <View className="flex-row bg-white border-b border-gray-200">
        {[
          {
            key: "progress" as Tab,
            label: "Canvass Progress",
            icon: "bar-chart" as const,
          },
          { key: "my_rfq" as Tab, label: "My RFQ", icon: "edit-note" as const },
        ].map((tab) => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.8}
              className="flex-1 flex-row items-center justify-center gap-1.5 py-3"
              style={{
                borderBottomWidth: 2.5,
                borderBottomColor: active ? "#064E3B" : "transparent",
              }}
            >
              <MaterialIcons
                name={tab.icon}
                size={15}
                color={active ? "#064E3B" : "#9ca3af"}
              />
              <Text
                className={`text-[12.5px] font-bold ${active ? "text-[#064E3B]" : "text-gray-400"}`}
              >
                {tab.label}
              </Text>
              {/* Returned count badge on Progress tab */}
              {tab.key === "progress" && returnedCount > 0 && (
                <View className="bg-emerald-500 rounded-full min-w-[16px] h-4 items-center justify-center px-1">
                  <Text className="text-[8px] font-bold text-white">
                    {returnedCount}
                  </Text>
                </View>
              )}
              {/* Pending dot on My RFQ tab while assigned and not returned */}
              {tab.key === "my_rfq" && assigned && !submitted && (
                <View className="bg-amber-400 rounded-full w-2 h-2" />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── No-assignment banner ── */}
      {!assigned && (
        <View className="flex-row items-center gap-2.5 bg-amber-50 border-b border-amber-300 px-4 py-3">
          <MaterialIcons name="warning" size={15} color="#92400e" />
          <Text className="flex-1 text-[11.5px] text-amber-900 leading-5">
            Your division has no canvassing assignment for this PR. Contact the
            BAC office.
          </Text>
        </View>
      )}

      {/* ══ TAB: PROGRESS ══════════════════════════════════════════════════════ */}
      {activeTab === "progress" && (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 14, paddingBottom: 36 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Return progress bar */}
          {totalCount > 0 && (
            <View
              className="bg-white rounded-2xl border border-gray-200 px-4 py-3 mb-3"
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.04,
                shadowRadius: 3,
                elevation: 1,
              }}
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-[12px] font-bold text-gray-700">
                  {returnedCount === totalCount
                    ? "All forms returned"
                    : `${returnedCount} of ${totalCount} returned`}
                </Text>
                <Text className="text-[11px] text-gray-400">
                  {totalCount - returnedCount > 0
                    ? `${totalCount - returnedCount} outstanding`
                    : "Complete"}
                </Text>
              </View>
              <View className="bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <View
                  className="h-1.5 rounded-full bg-emerald-500"
                  style={{
                    width: `${totalCount > 0 ? (returnedCount / totalCount) * 100 : 0}%`,
                  }}
                />
              </View>
            </View>
          )}

          {/* Per-division return status */}
          {assignments.length > 0 && (
            <Card>
              <View className="px-4 pt-3 pb-2">
                <Divider label="Return Status" />
                {assignments.map((a, i) => {
                  const user = a.canvasser_id
                    ? userById[a.canvasser_id]
                    : undefined;
                  const isOwn =
                    a.canvasser_id === currentUser?.id ||
                    a.division_id === currentUser?.division_id;
                  const returned = a.status === "returned";
                  return (
                    <View
                      key={a.id ?? i}
                      className={`flex-row items-center gap-3 px-3 py-2.5 rounded-xl mb-1.5 border ${
                        isOwn
                          ? returned
                            ? "bg-emerald-50 border-emerald-300"
                            : "bg-blue-50 border-blue-200"
                          : returned
                            ? "bg-emerald-50 border-emerald-200"
                            : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <View
                        className={`w-6 h-6 rounded-full items-center justify-center ${returned ? "bg-emerald-500" : "bg-amber-400"}`}
                      >
                        <MaterialIcons
                          name={returned ? "check" : "schedule"}
                          size={11}
                          color="#fff"
                        />
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center gap-1.5">
                          <Text
                            className="text-[12px] font-semibold text-gray-800"
                            numberOfLines={1}
                          >
                            {user?.division_name ?? `Division ${a.division_id}`}
                          </Text>
                          {isOwn && (
                            <View className="bg-blue-100 px-1.5 py-0.5 rounded-md">
                              <Text className="text-[8px] font-bold text-blue-700">
                                You
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text className="text-[10.5px] text-gray-400">
                          {user?.username ?? "—"}
                        </Text>
                      </View>
                      <View
                        className={`px-2 py-0.5 rounded-full ${returned ? "bg-emerald-100" : "bg-amber-100"}`}
                      >
                        <Text
                          className={`text-[9.5px] font-bold ${returned ? "text-emerald-700" : "text-amber-700"}`}
                        >
                          {returned ? "Submitted" : "Pending"}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </Card>
          )}

          {/* Lowest-offer abstract */}
          {!hideLowestOffers && allEntries.length > 0 && (
            <>
              <View className="flex-row items-center gap-2 mb-2 mt-1">
                <Text className="text-[9.5px] font-bold tracking-widest uppercase text-gray-400">
                  Lowest Offers
                </Text>
                <View className="flex-1 h-px bg-gray-200" />
              </View>
              <WinnerAbstract winners={winners} items={liveItems} />
            </>
          )}

          {/* Submitted RFQ cards */}
          {returnedAssignments.length > 0 && (
            <>
              <View className="flex-row items-center gap-2 mb-2 mt-1">
                <Text className="text-[9.5px] font-bold tracking-widest uppercase text-gray-400">
                  Submitted Forms
                </Text>
                <View className="bg-emerald-100 px-1.5 py-0.5 rounded-md">
                  <Text className="text-[9px] font-bold text-emerald-700">
                    {returnedAssignments.length}
                  </Text>
                </View>
                <View className="flex-1 h-px bg-gray-200" />
              </View>
              {returnedAssignments.map((a, i) => {
                const user = a.canvasser_id
                  ? userById[a.canvasser_id]
                  : undefined;
                const isOwn =
                  a.canvasser_id === currentUser?.id ||
                  a.division_id === currentUser?.division_id;
                // Filter entries belonging to this specific assignment
                const cardEntries = allEntries.filter((e) =>
                  e.assignment_id != null
                    ? e.assignment_id === a.id
                    : liveItems.some((li) => li.id === e.item_no),
                );
                const makePreview = (): CanvassPreviewData => ({
                  prNo: pr.prNo,
                  quotationNo: (a as any).quotation_no ?? "—",
                  date: new Date().toLocaleDateString("en-PH"),
                  deadline: "—",
                  bacChairperson: "ATTY. JAIME G. RESOCO, JR.",
                  officeSection: pr.officeSection,
                  purpose: pr.purpose,
                  assignedTo: user?.username ?? "—",
                  assignedDivision: user?.division_name ?? "—",
                  items: liveItems.map((item, idx) => {
                    const entry = cardEntries.find(
                      (e) => e.item_no === item.id,
                    );
                    return {
                      itemNo: idx + 1,
                      description: item.desc,
                      qty: item.qty,
                      unit: item.unit,
                      unitPrice: entry ? entry.unit_price.toFixed(2) : "",
                    };
                  }),
                  canvasserNames: user?.username ? [user.username] : [],
                });
                return (
                  <SubmissionCard
                    key={a.id ?? i}
                    assignment={a}
                    user={user}
                    entries={cardEntries}
                    liveItems={liveItems}
                    winners={winners}
                    isOwn={isOwn}
                    onViewRFQ={() => {
                      setPreviewDataOverride(makePreview());
                      setPreviewOpen(true);
                    }}
                  />
                );
              })}
            </>
          )}

          {/* Empty states */}
          {totalCount === 0 && (
            <View className="items-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
              <MaterialIcons name="hourglass-empty" size={32} color="#d1d5db" />
              <Text className="text-[13px] font-semibold text-gray-500 mt-3">
                Awaiting Release
              </Text>
              <Text className="text-[11.5px] text-gray-400 mt-1 text-center px-8">
                The BAC office has not released canvass assignments yet.
              </Text>
            </View>
          )}

          {totalCount > 0 && returnedCount === 0 && (
            <View className="items-center py-8 bg-white rounded-2xl border border-dashed border-gray-200 mt-1">
              <MaterialIcons name="pending" size={28} color="#d1d5db" />
              <Text className="text-[12.5px] font-semibold text-gray-500 mt-2">
                No submissions yet
              </Text>
              <Text className="text-[11px] text-gray-400 mt-1 text-center px-8">
                Quotations appear here once canvassers submit.
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* ══ TAB: MY RFQ ════════════════════════════════════════════════════════ */}
      {activeTab === "my_rfq" && (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Submitted banner */}
          {submitted && (
            <View className="flex-row items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 mb-3">
              <MaterialIcons name="check-circle" size={17} color="#065f46" />
              <View className="flex-1">
                <Text className="text-[12.5px] font-bold text-emerald-800">
                  Returned to BAC
                </Text>
                <Text className="text-[11px] text-emerald-600 mt-0.5">
                  This RFQ is already marked as returned.
                </Text>
              </View>
            </View>
          )}

          {/* PR line-items reference */}
          <ItemsTable items={liveItems} />

          <Card>
            <View className="px-4 pt-3 pb-3">
              <Divider label="My Assigned RFQs" />
              {myAssignments.length === 0 ? (
                <Text className="text-[11.5px] text-gray-400">
                  No RFQ assignments yet.
                </Text>
              ) : (
                myAssignments.map((a) => {
                  const active = Number(a.id) === Number(myAssignmentId);
                  return (
                    <TouchableOpacity
                      key={a.id}
                      activeOpacity={0.8}
                      onPress={() => {
                        setMyAssignmentId(Number(a.id));
                        setMyQuotationNo((a as any).quotation_no ?? "—");
                        setSubmitted(String(a.status) === "returned");
                        setReturnRemark("");
                      }}
                      className={`flex-row items-center justify-between px-3 py-2.5 rounded-xl mb-1.5 border ${
                        active
                          ? "bg-emerald-50 border-emerald-300"
                          : "bg-white border-gray-200"
                      }`}
                    >
                      <View>
                        <Text className="text-[12.5px] font-bold text-gray-800" style={{ fontFamily: MONO }}>
                          {(a as any).quotation_no ?? `RFQ #${(a as any).rfq_index ?? a.id}`}
                        </Text>
                        <Text className="text-[10.5px] text-gray-400">
                          Released{" "}
                          {a.released_at
                            ? new Date(a.released_at).toLocaleDateString("en-PH")
                            : "—"}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-2">
                        <TouchableOpacity
                          onPress={() => {
                            setPreviewDataOverride(
                              buildPreviewDataForAssignment(a),
                            );
                            setPreviewOpen(true);
                          }}
                          activeOpacity={0.8}
                          className="w-9 h-9 rounded-xl bg-white border border-gray-200 items-center justify-center"
                        >
                          <MaterialIcons
                            name="description"
                            size={16}
                            color="#064E3B"
                          />
                        </TouchableOpacity>
                        <View
                          className={`px-2 py-0.5 rounded-full ${a.status === "returned" ? "bg-emerald-100" : "bg-amber-100"}`}
                        >
                          <Text
                            className={`text-[9.5px] font-bold ${a.status === "returned" ? "text-emerald-700" : "text-amber-700"}`}
                          >
                            {a.status === "returned" ? "Returned" : "Released"}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </Card>

          {/* Assigned RFQ + remarks */}
          <Card>
            <View className="px-4 pt-3 pb-3">
              <Divider label="Assigned RFQ" />
              <View className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 mb-3">
                <Text className="text-[10px] text-gray-500">Quotation No.</Text>
                <Text className="text-[14px] font-extrabold text-[#064E3B]" style={{ fontFamily: MONO }}>
                  {myQuotationNo || "—"}
                </Text>
              </View>
              <Field label="Return Remarks" required>
                <TextInput
                  value={returnRemark}
                  onChangeText={setReturnRemark}
                  placeholder="Describe where/when canvassing was conducted and any notes on the returned RFQ."
                  placeholderTextColor="#9ca3af"
                  multiline
                  className="rounded-xl bg-white px-3 py-2.5 text-[12.5px] text-gray-800"
                  style={{ borderWidth: 1.5, borderColor: "#e5e7eb", minHeight: 88, textAlignVertical: "top" }}
                />
              </Field>
            </View>
          </Card>

          {/* Action buttons */}
          <View className="flex-row items-center gap-2.5">
            <TouchableOpacity
              onPress={() => {
                setPreviewDataOverride(null);
                setPreviewOpen(true);
              }}
              activeOpacity={0.8}
              className="flex-row items-center gap-1.5 flex-1 justify-center py-2.5 rounded-xl border border-gray-200 bg-white"
            >
              <MaterialIcons name="description" size={14} color="#064E3B" />
              <Text className="text-[12.5px] font-bold text-[#064E3B]">
                View / Print / Download
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!assigned || submitted || !returnRemark.trim() || submitting}
              activeOpacity={0.8}
              className={`flex-row items-center gap-1.5 flex-[2] justify-center py-2.5 rounded-xl ${
                !assigned || submitted || !returnRemark.trim() || submitting
                  ? "bg-gray-300"
                  : "bg-[#064E3B]"
              }`}
            >
              <MaterialIcons
                name={submitting ? "hourglass-empty" : "assignment-return"}
                size={14}
                color="#fff"
              />
              <Text className="text-[12.5px] font-bold text-white">
                {submitting ? "Returning..." : "Return Filled-Out RFQ to BAC"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* ── RFQ Preview Modal ── */}
      <CanvassPreviewModal
        visible={previewOpen}
        data={previewDataOverride ?? buildPreviewData()}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewDataOverride(null);
        }}
      />
    </KeyboardAvoidingView>
  );
}
