/**
 * RFQReviewModal.tsx
 *
 * BAC tool for reviewing all submitted canvass RFQs for a session.
 *
 * Features:
 *   • Lists every canvasser's returned submission grouped by division
 *   • Per-item winner calculation (lowest unit price across returned submissions)
 *   • Winning offer highlighted in green; others shown for comparison
 *   • Grand total of winning offers
 *   • "View / Print RFQ" button per submission → opens CanvassPreviewModal
 *   • "Export Abstract" button → opens a full abstract view ready for printing
 */

import type {
  CanvassEntryRow,
  CanvasserAssignmentRow,
  CanvassUserRow,
} from "@/lib/supabase";
import type { CanvassingPR, CanvassingPRItem } from "@/types/canvassing";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { CanvassPreviewData } from "../../(components)/CanvassPreview";
import CanvassPreviewModal from "../../(modals)/CanvassPreviewModal";

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

const fmt = (n: number) =>
  n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// ─── Types ────────────────────────────────────────────────────────────────────

/** One canvasser's full submission — all their entries grouped */
interface CanvasserSubmission {
  assignment: CanvasserAssignmentRow;
  user: CanvassUserRow | undefined;
  entries: CanvassEntryRow[];
  totalQuoted: number;
}

/** Per-item winner info */
interface ItemWinner {
  itemNo: number;
  description: string;
  unit: string;
  qty: number;
  winnerName: string;
  winnerPrice: number;
  winnerTotal: number;
  allQuotes: {
    supplierName: string;
    unitPrice: number;
    total: number;
    divisionName: string;
  }[];
}

// ─── Winner calculation ───────────────────────────────────────────────────────

function computeWinners(
  entries: CanvassEntryRow[],
  liveItems: CanvassingPRItem[],
  assignments: CanvasserAssignmentRow[],
  users: CanvassUserRow[],
): ItemWinner[] {
  const userById = Object.fromEntries(users.map((u) => [u.id, u]));

  return liveItems.map((item) => {
    const itemEntries = entries.filter(
      (e) => e.item_no === item.id && e.unit_price > 0,
    );

    // Annotate each entry with its canvasser's division name
    const allQuotes = itemEntries.map((e) => {
      // Find assignment linked to this entry (match by supplier_name heuristic or all returned)
      const assignment = assignments.find((a) => a.status === "returned");
      const user = assignment?.canvasser_id
        ? userById[assignment.canvasser_id]
        : undefined;
      return {
        supplierName: e.supplier_name,
        unitPrice: e.unit_price,
        total: e.total_price,
        divisionName: user?.division_name ?? "—",
      };
    });

    // Winner = lowest unit price
    const winner = allQuotes.reduce<(typeof allQuotes)[0] | null>((best, q) => {
      if (!best || q.unitPrice < best.unitPrice) return q;
      return best;
    }, null);

    return {
      itemNo: item.id,
      description: item.desc,
      unit: item.unit,
      qty: item.qty,
      winnerName: winner?.supplierName ?? "—",
      winnerPrice: winner?.unitPrice ?? 0,
      winnerTotal: winner ? winner.unitPrice * item.qty : 0,
      allQuotes,
    };
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const SectionDivider = ({
  label,
  count,
}: {
  label: string;
  count?: number;
}) => (
  <View className="flex-row items-center gap-2 mb-2 mt-1">
    <Text className="text-[10px] font-bold tracking-widest uppercase text-gray-400">
      {label}
    </Text>
    {count !== undefined && (
      <View className="bg-emerald-100 px-1.5 py-0.5 rounded-md">
        <Text className="text-[9.5px] font-bold text-emerald-700">{count}</Text>
      </View>
    )}
    <View className="flex-1 h-px bg-gray-200" />
  </View>
);

/** Single canvasser submission card */
const SubmissionCard = ({
  submission,
  liveItems,
  winners,
  pr,
  bacNo,
  chairperson,
  onViewRFQ,
}: {
  submission: CanvasserSubmission;
  liveItems: CanvassingPRItem[];
  winners: ItemWinner[];
  pr: CanvassingPR;
  bacNo: string;
  chairperson: string;
  onViewRFQ: (data: CanvassPreviewData) => void;
}) => {
  const { user, entries, totalQuoted } = submission;
  const divName =
    user?.division_name ?? `Division ${submission.assignment.division_id}`;
  const canvasserName = user?.username ?? "—";

  const buildRFQData = (): CanvassPreviewData => ({
    prNo: pr.prNo,
    quotationNo: bacNo || "—",
    date: new Date().toLocaleDateString("en-PH"),
    deadline: "—",
    bacChairperson: chairperson,
    officeSection: pr.officeSection,
    purpose: pr.purpose,
    items: liveItems.map((item, i) => {
      const entry = entries.find((e) => e.item_no === item.id);
      return {
        itemNo: i + 1,
        description: item.desc,
        qty: item.qty,
        unit: item.unit,
        unitPrice: entry ? entry.unit_price.toFixed(2) : "",
      };
    }),
    canvasserNames: canvasserName ? [canvasserName] : [],
  });

  return (
    <View
      className="bg-white rounded-2xl border border-gray-200 mb-3 overflow-hidden"
      style={{
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
      }}
    >
      {/* Card header */}
      <View className="flex-row items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
        <View className="flex-row items-center gap-2.5">
          <View className="w-8 h-8 rounded-xl bg-emerald-100 items-center justify-center">
            <MaterialIcons
              name="assignment-turned-in"
              size={16}
              color="#065f46"
            />
          </View>
          <View>
            <Text
              className="text-[13px] font-bold text-gray-900"
              numberOfLines={1}
            >
              {divName}
            </Text>
            <Text className="text-[11px] text-gray-400">{canvasserName}</Text>
          </View>
        </View>
        <View className="items-end gap-1">
          <View className="bg-emerald-100 px-2 py-0.5 rounded-full">
            <Text className="text-[10px] font-bold text-emerald-700">
              Returned
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => onViewRFQ(buildRFQData())}
            activeOpacity={0.8}
            className="flex-row items-center gap-1 bg-[#064E3B] px-2.5 py-1 rounded-lg"
          >
            <MaterialIcons name="description" size={11} color="#fff" />
            <Text className="text-[10.5px] font-bold text-white">
              View / Print RFQ
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Entries table */}
      <View className="px-4 pt-2 pb-3">
        <View className="flex-row bg-[#f3f4f6] rounded-lg px-2 py-1.5 mb-1">
          <Text className="flex-[2] text-[9px] font-bold uppercase tracking-wide text-gray-500">
            Item
          </Text>
          <Text className="flex-1 text-[9px] font-bold uppercase tracking-wide text-gray-500 text-center">
            Qty
          </Text>
          <Text className="w-24 text-[9px] font-bold uppercase tracking-wide text-gray-500 text-right">
            Unit Price
          </Text>
          <Text className="w-24 text-[9px] font-bold uppercase tracking-wide text-gray-500 text-right">
            Total
          </Text>
          <Text className="w-14 text-[9px] font-bold uppercase tracking-wide text-gray-500 text-center">
            Winner
          </Text>
        </View>

        {liveItems.map((item, i) => {
          const entry = entries.find((e) => e.item_no === item.id);
          const winner = winners.find((w) => w.itemNo === item.id);
          const isWin =
            entry &&
            winner &&
            entry.unit_price === winner.winnerPrice &&
            winner.winnerPrice > 0;
          return (
            <View
              key={item.id}
              className={`flex-row items-center px-2 py-2 rounded-lg mb-0.5 ${
                isWin
                  ? "bg-emerald-50 border border-emerald-200"
                  : "bg-white border border-gray-100"
              }`}
            >
              <Text
                className="flex-[2] text-[11px] text-gray-700"
                numberOfLines={1}
              >
                {item.desc}
              </Text>
              <Text
                className="flex-1 text-[11px] text-gray-500 text-center"
                style={{ fontFamily: MONO }}
              >
                {item.qty} {item.unit}
              </Text>
              <Text
                className={`w-24 text-[11.5px] font-semibold text-right ${isWin ? "text-emerald-700" : "text-gray-700"}`}
                style={{ fontFamily: MONO }}
              >
                {entry ? `₱${fmt(entry.unit_price)}` : "—"}
              </Text>
              <Text
                className={`w-24 text-[11.5px] font-bold text-right ${isWin ? "text-emerald-700" : "text-gray-600"}`}
                style={{ fontFamily: MONO }}
              >
                {entry ? `₱${fmt(entry.total_price)}` : "—"}
              </Text>
              <View className="w-14 items-center">
                {isWin ? (
                  <View className="bg-emerald-500 rounded-full w-5 h-5 items-center justify-center">
                    <MaterialIcons name="check" size={11} color="#fff" />
                  </View>
                ) : (
                  <View className="bg-gray-200 rounded-full w-5 h-5 items-center justify-center">
                    <Text className="text-[8px] text-gray-400">—</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}

        {/* Card total */}
        <View className="flex-row justify-between items-center mt-2 pt-2 border-t border-gray-100">
          <Text className="text-[10.5px] font-semibold text-gray-400">
            {entries.length} item{entries.length !== 1 ? "s" : ""} quoted
          </Text>
          <Text
            className="text-[12px] font-bold text-[#064E3B]"
            style={{ fontFamily: MONO }}
          >
            Total: ₱{fmt(totalQuoted)}
          </Text>
        </View>
      </View>
    </View>
  );
};

/** Winner summary table — one row per item, shows the winning supplier */
const WinnerSummaryTable = ({ winners }: { winners: ItemWinner[] }) => {
  const grandTotal = winners.reduce((s, w) => s + w.winnerTotal, 0);
  const hasWinners = winners.some((w) => w.winnerPrice > 0);

  if (!hasWinners) {
    return (
      <View className="items-center py-6 bg-white rounded-2xl border border-dashed border-gray-300 mb-4">
        <MaterialIcons name="pending" size={28} color="#d1d5db" />
        <Text className="text-[12px] text-gray-400 mt-2 text-center">
          Winning offers will appear here{"\n"}once canvassers submit their
          quotations.
        </Text>
      </View>
    );
  }

  return (
    <View
      className="bg-white rounded-2xl border border-emerald-200 mb-4 overflow-hidden"
      style={{
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 5,
        elevation: 2,
      }}
    >
      {/* Header */}
      <View className="bg-[#064E3B] px-4 py-2.5 flex-row items-center gap-2">
        <MaterialIcons name="emoji-events" size={16} color="#fbbf24" />
        <Text className="text-[12px] font-bold text-white">
          Lowest Offer Summary (Abstract)
        </Text>
      </View>

      {/* Column headers */}
      <View className="flex-row bg-emerald-50 px-3 py-1.5">
        <Text className="flex-[2] text-[9px] font-bold uppercase tracking-wide text-emerald-700">
          Item
        </Text>
        <Text className="flex-1 text-[9px] font-bold uppercase tracking-wide text-emerald-700 text-center">
          Unit
        </Text>
        <Text className="w-8 text-[9px] font-bold uppercase tracking-wide text-emerald-700 text-center">
          Qty
        </Text>
        <Text className="w-28 text-[9px] font-bold uppercase tracking-wide text-emerald-700 text-right">
          Winning Supplier
        </Text>
        <Text className="w-20 text-[9px] font-bold uppercase tracking-wide text-emerald-700 text-right">
          Unit Price
        </Text>
        <Text className="w-20 text-[9px] font-bold uppercase tracking-wide text-emerald-700 text-right">
          Total
        </Text>
      </View>

      {/* Rows */}
      {winners.map((w, i) => (
        <View
          key={w.itemNo}
          className={`flex-row items-center px-3 py-2.5 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
          style={{ borderTopWidth: 1, borderTopColor: "#f0fdf4" }}
        >
          <Text
            className="flex-[2] text-[11px] text-gray-700"
            numberOfLines={1}
          >
            {w.description}
          </Text>
          <Text className="flex-1 text-[11px] text-gray-500 text-center">
            {w.unit}
          </Text>
          <Text
            className="w-8 text-[11px] text-gray-500 text-center"
            style={{ fontFamily: MONO }}
          >
            {w.qty}
          </Text>
          <Text
            className="w-28 text-[11px] font-semibold text-emerald-700 text-right"
            numberOfLines={1}
          >
            {w.winnerPrice > 0 ? w.winnerName : "—"}
          </Text>
          <Text
            className="w-20 text-[11.5px] font-bold text-emerald-700 text-right"
            style={{ fontFamily: MONO }}
          >
            {w.winnerPrice > 0 ? `₱${fmt(w.winnerPrice)}` : "—"}
          </Text>
          <Text
            className="w-20 text-[12px] font-extrabold text-[#064E3B] text-right"
            style={{ fontFamily: MONO }}
          >
            {w.winnerTotal > 0 ? `₱${fmt(w.winnerTotal)}` : "—"}
          </Text>
        </View>
      ))}

      {/* Grand total */}
      <View
        className="flex-row justify-between items-center px-3 py-3 bg-emerald-50"
        style={{ borderTopWidth: 2, borderTopColor: "#bbf7d0" }}
      >
        <Text className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide">
          Total Winning Offer
        </Text>
        <Text
          className="text-[15px] font-extrabold text-[#064E3B]"
          style={{ fontFamily: MONO }}
        >
          ₱{fmt(grandTotal)}
        </Text>
      </View>
    </View>
  );
};

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface RFQReviewModalProps {
  visible: boolean;
  onClose: () => void;
  pr: CanvassingPR;
  liveItems: CanvassingPRItem[];
  entries: CanvassEntryRow[];
  assignments: CanvasserAssignmentRow[];
  users: CanvassUserRow[];
  bacNo: string;
  chairperson: string;
}

export default function RFQReviewModal({
  visible,
  onClose,
  pr,
  liveItems,
  entries,
  assignments,
  users,
  bacNo,
  chairperson,
}: RFQReviewModalProps) {
  const [rfqPreviewData, setRfqPreviewData] =
    useState<CanvassPreviewData | null>(null);

  const userById = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u])),
    [users],
  );

  /** Build per-canvasser submissions from returned assignments */
  const submissions = useMemo<CanvasserSubmission[]>(() => {
    const returned = assignments.filter((a) => a.status === "returned");
    return returned.map((a) => {
      const user = a.canvasser_id ? userById[a.canvasser_id] : undefined;
      // Entries for this canvasser — match by item_no presence and supplier_name
      // Since entries are stored per-session (not per-assignment), we show all
      const relevantEntries = entries.filter((e) =>
        liveItems.some((i) => i.id === e.item_no),
      );
      const total = relevantEntries.reduce((s, e) => s + e.total_price, 0);
      return {
        assignment: a,
        user,
        entries: relevantEntries,
        totalQuoted: total,
      };
    });
  }, [assignments, entries, userById, liveItems]);

  const winners = useMemo(
    () => computeWinners(entries, liveItems, assignments, users),
    [entries, liveItems, assignments, users],
  );

  const returnedCount = assignments.filter(
    (a) => a.status === "returned",
  ).length;
  const releasedCount = assignments.filter(
    (a) => a.status === "released",
  ).length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable className="flex-1 bg-black/40" onPress={onClose} />

      <View
        className="bg-gray-50 rounded-t-3xl overflow-hidden"
        style={{
          maxHeight: "92%",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
          elevation: 16,
        }}
      >
        {/* Modal header */}
        <View className="bg-[#064E3B] px-5 pt-4 pb-4">
          <View className="w-10 h-1 rounded-full bg-white/20 self-center mb-3" />
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-0.5">
                RFQ Review · BAC
              </Text>
              <Text
                className="text-[15px] font-extrabold text-white"
                style={{ fontFamily: MONO }}
              >
                {pr.prNo}
              </Text>
              <View className="flex-row items-center gap-3 mt-1.5">
                <View className="flex-row items-center gap-1">
                  <View className="w-2 h-2 rounded-full bg-emerald-400" />
                  <Text className="text-[10.5px] text-white/70">
                    {returnedCount} returned
                  </Text>
                </View>
                <View className="flex-row items-center gap-1">
                  <View className="w-2 h-2 rounded-full bg-amber-400" />
                  <Text className="text-[10.5px] text-white/70">
                    {releasedCount} outstanding
                  </Text>
                </View>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={10}
              className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center mt-0.5"
            >
              <Text className="text-white text-[20px] leading-none font-light">
                ×
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        >
          {/* ── Winner Abstract ── */}
          <SectionDivider label="Lowest Offer Abstract" />
          <WinnerSummaryTable winners={winners} />

          {/* ── Submitted RFQs ── */}
          <SectionDivider
            label="Submitted Canvass Returns"
            count={returnedCount}
          />

          {submissions.length === 0 ? (
            <View className="items-center py-8 bg-white rounded-2xl border border-dashed border-gray-300 mb-3">
              <MaterialIcons name="hourglass-empty" size={28} color="#d1d5db" />
              <Text className="text-[12.5px] font-semibold text-gray-500 mt-2">
                No returns yet
              </Text>
              <Text className="text-[11px] text-gray-400 mt-1 text-center px-6">
                Canvass forms will appear here once canvassers submit their
                quotations.
              </Text>
            </View>
          ) : (
            submissions.map((sub, i) => (
              <SubmissionCard
                key={sub.assignment.id ?? i}
                submission={sub}
                liveItems={liveItems}
                winners={winners}
                pr={pr}
                bacNo={bacNo}
                chairperson={chairperson}
                onViewRFQ={setRfqPreviewData}
              />
            ))
          )}

          {/* Outstanding (released but not returned) */}
          {releasedCount > 0 && (
            <>
              <SectionDivider
                label="Outstanding (Not Yet Returned)"
                count={releasedCount}
              />
              {assignments
                .filter((a) => a.status === "released")
                .map((a, i) => {
                  const user = a.canvasser_id
                    ? userById[a.canvasser_id]
                    : undefined;
                  return (
                    <View
                      key={a.id ?? i}
                      className="flex-row items-center gap-3 bg-white rounded-xl border border-amber-200 px-4 py-3 mb-2"
                    >
                      <View className="w-7 h-7 rounded-full bg-amber-100 items-center justify-center">
                        <MaterialIcons
                          name="schedule"
                          size={14}
                          color="#92400e"
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="text-[12.5px] font-semibold text-gray-800">
                          {user?.division_name ?? `Division ${a.division_id}`}
                        </Text>
                        <Text className="text-[11px] text-gray-400">
                          {user?.username ?? "—"} · Awaiting return
                        </Text>
                      </View>
                      <View className="bg-amber-100 px-2 py-0.5 rounded-full">
                        <Text className="text-[9.5px] font-bold text-amber-700">
                          Pending
                        </Text>
                      </View>
                    </View>
                  );
                })}
            </>
          )}
        </ScrollView>
      </View>

      {/* RFQ Preview Modal (per-submission) */}
      {rfqPreviewData && (
        <CanvassPreviewModal
          visible={!!rfqPreviewData}
          data={rfqPreviewData}
          onClose={() => setRfqPreviewData(null)}
        />
      )}
    </Modal>
  );
}
