/**
 * AAAView — Step 10: Abstract of Price Quotations preparation.
 *
 * Input fields mirror the sample DAR document:
 *   • Top-right reference block  → RFQ No. (read-only), PR No. (read-only),
 *                                   Resolution No. (read-only), Date (today, read-only)
 *   • AAA No.                    → editable, required
 *   • Particulars / Job Order    → editable — the description text shown as the
 *                                   first row in the abstract table
 *
 * Abstract table (read-only, built from canvass_entries):
 *   ITEM NO. | QTY | UNIT | PARTICULARS | [Supplier 1] | [Supplier 2] | [Supplier 3]
 *   Lowest price per item is auto-marked as winner.
 *   BAC can tap any price cell to manually override the winner.
 *
 * New in this revision:
 *   • PriorStepsSummary card — shows BAC Resolution details + winning canvass
 *     abstract, collapsed by default, expandable in-place.
 *   • "Review All RFQs" button — opens RFQReviewModal to browse every
 *     canvasser's submitted quotation, exactly as available in the Collect step.
 *
 * On submit: upserts the aaa_documents row and advances PR status to 11.
 */

import type { EnrichedAssignmentRow } from "@/lib/supabase-types";
import {
  fetchAAAForSession,
  insertAAAForSession,
  updateAAAForSession,
} from "@/lib/supabase/aaa";
import {
  fetchBACResolutionForPR,
  fetchBACResolutionForSession,
} from "@/lib/supabase/bac";
import {
  fetchAssignmentsWithDetails,
  fetchCanvassSessionById,
  fetchQuotesForSubmission,
  replaceSupplierQuotesForSubmission,
  setItemWinningSupplier,
  updateCanvassSessionMeta,
} from "@/lib/supabase/canvassing";
import {
  fetchPRIdByNo,
  fetchPRWithItemsById,
  updatePRStatus,
} from "@/lib/supabase/pr";
import type { CanvassingPR, CanvassingPRItem } from "@/types/canvassing";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { AAAPreviewData } from "../../(components)/AAAPreview";
import { buildAAAPreviewHTML } from "../../(components)/AAAPreview";
import AAAPreviewModal from "../../(modals)/AAAPreviewModal";
import { useAuth } from "../../AuthContext";
import { CompletedBanner, StepNav } from "../BACView/components";
import RFQReviewModal from "../BACView/RFQReviewModal";
import { Card, Divider, Field, Input } from "../BACView/ui";
import StageRemarkBox from "../StageRemarkBox";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AAAViewProps {
  sessionId: string;
  pr: CanvassingPR;
  resolutionNo: string;
  mode: string;
  onComplete?: (payload: any) => void;
  onBack?: () => void;
}

interface EntryRow {
  item_no: number;
  supplier_name: string;
  unit_price: number;
  is_winning?: boolean | null;
}

type SupplierDraft = {
  id: number;
  name: string;
  address: string;
  tin: string;
  days: string;
  prices: Record<number, string>;
};

// ─── Atoms ────────────────────────────────────────────────────────────────────

const MONO_FONT = Platform.OS === "ios" ? "Courier New" : "monospace";

const fmt = (n: number) =>
  n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// ─── PriorStepsSummary ────────────────────────────────────────────────────────
/**
 * Collapsible card shown at the top of the AAA step.
 * Displays:
 *   • BAC Resolution details (resolution no., mode, prepared date)
 *   • Per-item winning supplier + price derived from canvass_entries
 *   • "Review All RFQs" button that opens RFQReviewModal
 */
function PriorStepsSummary({
  resolution,
  items,
  entries,
  onOpenRFQReview,
}: {
  resolution: {
    resolution_no: string;
    mode: string | null;
    resolved_at: string | null;
    notes: string | null;
  } | null;
  items: CanvassingPRItem[];
  entries: EntryRow[];
  onOpenRFQReview: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Derive winning entry per item (DB flag first, then lowest price)
  const winningRows = useMemo(() => {
    return items.map((item) => {
      const byItem = entries.filter(
        (e) => e.item_no === item.id && e.unit_price > 0,
      );
      const dbWinner = byItem.find((e) => e.is_winning === true);
      const winner =
        dbWinner ??
        (byItem.length > 0
          ? byItem.reduce((b, e) => (e.unit_price < b.unit_price ? e : b))
          : null);
      return {
        item,
        winner,
        allSuppliers: [...new Set(byItem.map((e) => e.supplier_name))],
      };
    });
  }, [items, entries]);

  const grandTotal = useMemo(
    () =>
      winningRows.reduce(
        (sum, r) => sum + (r.winner ? r.winner.unit_price * r.item.qty : 0),
        0,
      ),
    [winningRows],
  );

  const hasData = !!resolution || entries.length > 0;

  return (
    <Card>
      {/* ── Collapsed header ── */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setExpanded((v) => !v)}
        className="flex-row items-center gap-3 px-4 py-3"
      >
        <View className="w-8 h-8 rounded-xl bg-emerald-100 items-center justify-center">
          <MaterialIcons name="history-edu" size={17} color="#065f46" />
        </View>
        <View className="flex-1">
          <Text className="text-[13px] font-bold text-gray-900">
            Prior Steps Summary
          </Text>
          <Text className="text-[11px] text-gray-400 mt-0.5">
            {resolution
              ? `Resolution ${resolution.resolution_no} · ${resolution.mode ?? "—"}`
              : "BAC Resolution & winning canvass"}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          {hasData && (
            <View className="bg-emerald-100 px-2 py-0.5 rounded-full">
              <Text className="text-[9.5px] font-bold text-emerald-700">
                Ready
              </Text>
            </View>
          )}
          <MaterialIcons
            name={expanded ? "expand-less" : "expand-more"}
            size={20}
            color="#9ca3af"
          />
        </View>
      </TouchableOpacity>

      {/* ── Expanded body ── */}
      {expanded && (
        <View
          style={{ borderTopWidth: 1, borderTopColor: "#f3f4f6" }}
          className="px-4 pt-3 pb-4"
        >
          {/* BAC Resolution block */}
          <Divider label="BAC Resolution" />
          {resolution ? (
            <View className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden mb-3">
              {/* Header row */}
              <View className="bg-[#064E3B] px-3 py-2 flex-row items-center gap-2">
                <MaterialIcons name="gavel" size={13} color="#a7f3d0" />
                <Text className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                  Resolution on File
                </Text>
              </View>
              <View className="px-3 py-2.5 gap-1.5">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[11px] text-gray-500">
                    Resolution No.
                  </Text>
                  <Text
                    className="text-[12.5px] font-extrabold text-[#064E3B]"
                    style={{ fontFamily: MONO_FONT }}
                  >
                    {resolution.resolution_no}
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-[11px] text-gray-500">Mode</Text>
                  <Text className="text-[12px] font-semibold text-gray-800">
                    {resolution.mode ?? "—"}
                  </Text>
                </View>
                {resolution.resolved_at && (
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[11px] text-gray-500">Resolved</Text>
                    <Text
                      className="text-[11.5px] text-gray-600"
                      style={{ fontFamily: MONO_FONT }}
                    >
                      {new Date(resolution.resolved_at).toLocaleDateString(
                        "en-PH",
                        { month: "short", day: "numeric", year: "numeric" },
                      )}
                    </Text>
                  </View>
                )}
                {resolution.notes ? (
                  <View className="mt-1 bg-amber-50 rounded-xl px-2.5 py-2 border border-amber-100">
                    <Text className="text-[10.5px] text-amber-800 leading-[15px]">
                      {resolution.notes}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : (
            <View className="bg-gray-50 rounded-2xl border border-dashed border-gray-200 items-center py-4 mb-3">
              <MaterialIcons name="pending" size={22} color="#d1d5db" />
              <Text className="text-[11.5px] text-gray-400 mt-1">
                No BAC resolution found
              </Text>
            </View>
          )}

          {/* Winning canvass abstract */}
          <Divider label="Winning Canvass" />
          {winningRows.some((r) => r.winner) ? (
            <View className="rounded-2xl border border-gray-100 overflow-hidden mb-3">
              {/* Column headers */}
              <View className="flex-row bg-[#064E3B] px-2.5 py-1.5">
                {[
                  { label: "Item", flex: 2 },
                  { label: "Qty", flex: 0.7 },
                  { label: "Winner", flex: 1.5 },
                  { label: "Unit Price", flex: 1.2 },
                  { label: "Total", flex: 1.2 },
                ].map(({ label, flex }) => (
                  <Text
                    key={label}
                    className="text-[8.5px] font-bold uppercase tracking-wide text-white/70"
                    style={{ flex, textAlign: flex === 2 ? "left" : "right" }}
                  >
                    {label}
                  </Text>
                ))}
              </View>

              {winningRows.map(({ item, winner }, i) => (
                <View
                  key={item.id}
                  className={`flex-row items-center px-2.5 py-2 ${
                    i % 2 === 0 ? "bg-white" : "bg-gray-50"
                  }`}
                  style={{ borderTopWidth: 1, borderTopColor: "#f3f4f6" }}
                >
                  <Text
                    className="text-[10.5px] text-gray-700 leading-[14px]"
                    style={{ flex: 2 }}
                    numberOfLines={2}
                  >
                    {item.desc}
                  </Text>
                  <Text
                    className="text-[10px] text-gray-500 text-right"
                    style={{ flex: 0.7, fontFamily: MONO_FONT }}
                  >
                    {item.qty}
                  </Text>
                  {winner ? (
                    <>
                      <View className="items-end" style={{ flex: 1.5 }}>
                        <View className="bg-emerald-100 px-1.5 py-0.5 rounded-md">
                          <Text
                            className="text-[9px] font-bold text-emerald-800"
                            numberOfLines={1}
                          >
                            {winner.supplier_name}
                          </Text>
                        </View>
                      </View>
                      <Text
                        className="text-[10.5px] font-semibold text-emerald-700 text-right"
                        style={{ flex: 1.2, fontFamily: MONO_FONT }}
                      >
                        ₱{fmt(winner.unit_price)}
                      </Text>
                      <Text
                        className="text-[10.5px] font-bold text-[#064E3B] text-right"
                        style={{ flex: 1.2, fontFamily: MONO_FONT }}
                      >
                        ₱{fmt(winner.unit_price * item.qty)}
                      </Text>
                    </>
                  ) : (
                    <Text
                      className="text-[10px] text-gray-400 text-right"
                      style={{ flex: 3.9 }}
                    >
                      No quotes yet
                    </Text>
                  )}
                </View>
              ))}

              {/* Grand total row */}
              <View
                className="flex-row justify-between items-center px-2.5 py-2 bg-emerald-50"
                style={{ borderTopWidth: 2, borderTopColor: "#bbf7d0" }}
              >
                <Text className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">
                  Total Winning Offer
                </Text>
                <Text
                  className="text-[13px] font-extrabold text-[#064E3B]"
                  style={{ fontFamily: MONO_FONT }}
                >
                  ₱{fmt(grandTotal)}
                </Text>
              </View>
            </View>
          ) : (
            <View className="bg-gray-50 rounded-2xl border border-dashed border-gray-200 items-center py-4 mb-3">
              <MaterialIcons
                name="format-list-bulleted"
                size={22}
                color="#d1d5db"
              />
              <Text className="text-[11.5px] text-gray-400 mt-1">
                No quotations on file yet
              </Text>
            </View>
          )}

          {/* Review All RFQs button */}
          <TouchableOpacity
            onPress={onOpenRFQReview}
            activeOpacity={0.82}
            className="flex-row items-center justify-center gap-2 bg-white border border-[#064E3B] rounded-2xl py-2.5"
          >
            <MaterialIcons name="assignment" size={16} color="#064E3B" />
            <Text className="text-[13px] font-bold text-[#064E3B]">
              Review All Submitted RFQs
            </Text>
            <MaterialIcons name="chevron-right" size={16} color="#064E3B" />
          </TouchableOpacity>
        </View>
      )}
    </Card>
  );
}

// ─── Abstract table (native, read-only + winner toggle) ───────────────────────

function AbstractTable({
  items,
  suppliers,
  entries,
  sessionId,
  onWinnerChanged,
}: {
  items: CanvassingPRItem[];
  suppliers: string[];
  entries: EntryRow[];
  sessionId: string;
  onWinnerChanged: () => void;
}) {
  if (suppliers.length === 0 || items.length === 0) {
    return (
      <View className="items-center py-8 bg-white rounded-2xl border border-dashed border-gray-300 mb-3">
        <MaterialIcons name="pending" size={28} color="#d1d5db" />
        <Text className="text-[12.5px] text-gray-400 mt-2 text-center px-6">
          No quotations have been submitted yet.{"\n"}The abstract will appear
          once canvassers return their forms.
        </Text>
      </View>
    );
  }

  const priceFor = (itemId: number, supplier: string) =>
    entries.find((e) => e.item_no === itemId && e.supplier_name === supplier)
      ?.unit_price ?? 0;

  const winnerFor = (itemId: number): string => {
    const dbWinner = entries.find(
      (e) => e.item_no === itemId && e.is_winning === true,
    );
    if (dbWinner) return dbWinner.supplier_name;
    const byItem = entries.filter(
      (e) => e.item_no === itemId && e.unit_price > 0,
    );
    if (byItem.length === 0) return "";
    return byItem.reduce((b, e) => (e.unit_price < b.unit_price ? e : b))
      .supplier_name;
  };

  const handleToggleWinner = async (itemId: number, supplier: string) => {
    try {
      await setItemWinningSupplier(sessionId, itemId, supplier);
      onWinnerChanged();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not update winner");
    }
  };

  return (
    <Card>
      <View className="px-3 pt-3 pb-3">
        <Divider label="Abstract of Price Quotations" />

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            {/* "NAME OF DEALERS" spanning header */}
            <View className="flex-row">
              <View style={{ width: 200 }} />
              <View
                className="border border-gray-300 bg-gray-100 items-center py-1"
                style={{ width: suppliers.length * 100 }}
              >
                <Text className="text-[9px] font-bold uppercase tracking-widest text-gray-600">
                  Name of Dealers
                </Text>
              </View>
            </View>

            {/* Column headers */}
            <View className="flex-row bg-[#064E3B]">
              {[
                { label: "No.", w: 32 },
                { label: "Qty", w: 36 },
                { label: "Unit", w: 52 },
                { label: "Particulars", w: 180 },
              ].map((col) => (
                <View
                  key={col.label}
                  className="items-center justify-center py-1.5 border-r border-white/20"
                  style={{ width: col.w }}
                >
                  <Text className="text-[8px] font-bold uppercase text-white/80 text-center">
                    {col.label}
                  </Text>
                </View>
              ))}
              {suppliers.map((s, i) => (
                <View
                  key={s}
                  className={`items-center justify-center py-1.5 ${i < suppliers.length - 1 ? "border-r border-white/20" : ""}`}
                  style={{ width: 100 }}
                >
                  <Text
                    className="text-[7.5px] font-bold text-white/80 text-center px-1"
                    numberOfLines={2}
                  >
                    {s}
                  </Text>
                </View>
              ))}
            </View>

            {/* Item rows */}
            {items.map((item, rowIdx) => {
              const winner = winnerFor(item.id);
              return (
                <View
                  key={item.id}
                  className={`flex-row ${rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
                  style={{ borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}
                >
                  <View
                    className="items-center justify-center border-r border-gray-200"
                    style={{ width: 32 }}
                  >
                    <Text
                      className="text-[10px] text-gray-500"
                      style={{ fontFamily: MONO_FONT }}
                    >
                      {rowIdx + 1}
                    </Text>
                  </View>
                  <View
                    className="items-center justify-center border-r border-gray-200 px-1"
                    style={{ width: 36 }}
                  >
                    <Text
                      className="text-[10px] text-gray-700"
                      style={{ fontFamily: MONO_FONT }}
                    >
                      {item.qty}
                    </Text>
                  </View>
                  <View
                    className="items-center justify-center border-r border-gray-200 px-1"
                    style={{ width: 52 }}
                  >
                    <Text className="text-[10px] text-gray-500 text-center">
                      {item.unit}
                    </Text>
                  </View>
                  <View
                    className="justify-center border-r border-gray-200 px-2 py-1.5"
                    style={{ width: 180 }}
                  >
                    <Text
                      className="text-[10.5px] text-gray-700 leading-[14px]"
                      numberOfLines={3}
                    >
                      {item.desc}
                    </Text>
                  </View>
                  {suppliers.map((s, i) => {
                    const price = priceFor(item.id, s);
                    const isWin = winner === s && price > 0;
                    return (
                      <TouchableOpacity
                        key={s}
                        onPress={() =>
                          price > 0 ? handleToggleWinner(item.id, s) : undefined
                        }
                        activeOpacity={price > 0 ? 0.7 : 1}
                        className={`items-end justify-center px-2 py-1.5 ${
                          isWin ? "bg-emerald-50" : ""
                        } ${i < suppliers.length - 1 ? "border-r border-gray-200" : ""}`}
                        style={{ width: 100 }}
                      >
                        <Text
                          className={`text-[10px] ${isWin ? "font-bold text-emerald-700" : "text-gray-700"}`}
                          style={{ fontFamily: MONO_FONT }}
                        >
                          {price > 0 ? fmt(price) : "—"}
                        </Text>
                        {isWin && (
                          <MaterialIcons
                            name="check"
                            size={14}
                            color="#10b981"
                            style={{ marginTop: 2 }}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}

            {/* Totals row */}
            <View
              className="flex-row bg-emerald-50"
              style={{ borderTopWidth: 2, borderTopColor: "#bbf7d0" }}
            >
              <View style={{ width: 32 + 36 + 52 }} />
              <View
                className="justify-center px-2 py-2 border-r border-gray-200"
                style={{ width: 180 }}
              >
                <Text className="text-[9px] font-bold uppercase text-emerald-800 text-right">
                  Total
                </Text>
              </View>
              {suppliers.map((s, i) => {
                const total = items.reduce(
                  (sum, item) => sum + priceFor(item.id, s) * item.qty,
                  0,
                );
                return (
                  <View
                    key={s}
                    className={`items-end justify-center px-2 py-2 ${i < suppliers.length - 1 ? "border-r border-gray-200" : ""}`}
                    style={{ width: 100 }}
                  >
                    <Text
                      className="text-[10.5px] font-bold text-emerald-800"
                      style={{ fontFamily: MONO_FONT }}
                    >
                      {total > 0 ? fmt(total) : "—"}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>

        {/* Tap-to-mark hint */}
        {suppliers.length > 1 && (
          <View className="flex-row items-center gap-1.5 mt-2.5 px-1">
            <MaterialIcons name="touch-app" size={12} color="#9ca3af" />
            <Text className="text-[10px] text-gray-400">
              Tap a price cell to manually mark it as the winner for that item.
            </Text>
          </View>
        )}
      </View>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AAAView({
  sessionId,
  pr,
  resolutionNo: resolutionNoProp,
  mode: modeProp,
  onComplete,
  onBack,
}: AAAViewProps) {
  const { currentUser } = useAuth();

  // ── Editable fields ─────────────────────────────────────────────────────────
  const [aaaNo, setAaaNo] = useState("");
  const [particulars, setParticulars] = useState("");

  // ── Read-only reference fields (hydrated from DB) ───────────────────────────
  const [rfqNo, setRfqNo] = useState("");
  const [resolutionNo, setResolutionNo] = useState(resolutionNoProp);
  const [date, setDate] = useState(
    new Date().toLocaleDateString("en-PH", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
  );
  const [office, setOffice] = useState(pr.officeSection);
  const [prId, setPrId] = useState<string | null>(null);

  // ── Data state ──────────────────────────────────────────────────────────────
  const [liveItems, setLiveItems] = useState<CanvassingPRItem[]>(
    (pr.items as any) ?? [],
  );
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [returns, setReturns] = useState<EnrichedAssignmentRow[]>([]);
  const [allAssignments, setAllAssignments] = useState<EnrichedAssignmentRow[]>(
    [],
  );
  const [sourceReturnId, setSourceReturnId] = useState<number | null>(null);
  const [applyingSource, setApplyingSource] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // ── Prior steps data ─────────────────────────────────────────────────────────
  const [bacResolution, setBacResolution] = useState<{
    resolution_no: string;
    mode: string | null;
    resolved_at: string | null;
    notes: string | null;
  } | null>(null);

  // ── RFQ review modal ─────────────────────────────────────────────────────────
  const [rfqReviewOpen, setRfqReviewOpen] = useState(false);
  const [rfqEditOpen, setRfqEditOpen] = useState(false);
  const [rfqEditAssignment, setRfqEditAssignment] =
    useState<EnrichedAssignmentRow | null>(null);
  const [rfqEditSupps, setRfqEditSupps] = useState<SupplierDraft[]>([
    { id: 1, name: "", address: "", tin: "", days: "", prices: {} },
  ]);
  const [rfqEditSaving, setRfqEditSaving] = useState(false);

  const getRFQNoForAssignment = useCallback(
    async (assignmentId: number) => {
      const local = allAssignments.find(
        (x) => Number(x.id) === Number(assignmentId),
      );
      if (local) {
        return String(
          (local as any).quotation_no ??
            `RFQ #${(local as any).rfq_index ?? assignmentId}`,
        );
      }
      try {
        const fresh = await fetchAssignmentsWithDetails(sessionId);
        setAllAssignments(fresh);
        setReturns(fresh.filter((a) => a.status === "returned"));
        const matched = fresh.find(
          (x) => Number(x.id) === Number(assignmentId),
        );
        return String(
          (matched as any)?.quotation_no ??
            `RFQ #${(matched as any)?.rfq_index ?? assignmentId}`,
        );
      } catch {
        return `RFQ #${assignmentId}`;
      }
    },
    [allAssignments, sessionId],
  );

  // ── Load all data ────────────────────────────────────────────────────────────
  const loadEntries = useCallback(async () => {
    const rows = await fetchQuotesForSubmission(sessionId, null);
    setEntries(
      rows.map((r) => ({
        item_no: r.item_no,
        supplier_name: r.supplier_name ?? "",
        unit_price: r.unit_price ?? 0,
        is_winning: r.is_winning ?? null,
      })),
    );
  }, [sessionId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // PR items
        const resolvedPrId = await fetchPRIdByNo(pr.prNo);
        if (resolvedPrId) {
          setPrId(resolvedPrId);
          const { header: h, items } = await fetchPRWithItemsById(resolvedPrId);
          setOffice(h.office_section ?? pr.officeSection);
          setDate((prev) =>
            h.created_at
              ? new Date(h.created_at).toLocaleDateString("en-PH", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })
              : prev,
          );
          setLiveItems(
            items.map((i: any) => ({
              id: parseInt(String(i.id)),
              desc: i.description,
              stock: i.stock_no,
              unit: i.unit,
              qty: i.quantity,
              unitCost: i.unit_price,
            })),
          );
        }

        // Session meta
        await fetchCanvassSessionById(sessionId);

        // Assignments — store all, expose "returned" subset separately
        const asgn = await fetchAssignmentsWithDetails(sessionId);
        setAllAssignments(asgn);
        setReturns(asgn.filter((a) => a.status === "returned"));

        // Resolution — hydrate both the display No. and the full record
        const resByPr = resolvedPrId
          ? await fetchBACResolutionForPR(resolvedPrId)
          : null;
        const res = resByPr ?? (await fetchBACResolutionForSession(sessionId));
        if (res?.resolution_no) setResolutionNo(res.resolution_no);
        if (res) {
          setBacResolution({
            resolution_no: res.resolution_no,
            mode: res.mode ?? null,
            resolved_at: res.resolved_at ?? null,
            notes: res.notes ?? null,
          });
        }

        // Existing AAA doc
        const aaa = await fetchAAAForSession(sessionId);
        if (aaa?.aaa_no) {
          setAaaNo(aaa.aaa_no);
          setIsSubmitted(true);
        }
        if (aaa?.particulars) setParticulars(aaa.particulars);

        // Quotes
        await loadEntries();
      } catch {
        // silently fall back to props
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId, pr.prNo, pr.officeSection, loadEntries]);

  const applySource = useCallback(
    async (assignmentId: number) => {
      setApplyingSource(true);
      try {
        const src = await fetchQuotesForSubmission(sessionId, assignmentId);
        const payload = src
          .map((e: any) => ({
            item_no: e.item_no,
            description: e.description,
            unit: e.unit,
            quantity: e.quantity,
            supplier_name: e.supplier_name,
            unit_price: e.unit_price,
            total_price: e.total_price,
            is_winning: e.is_winning ?? null,
          }))
          .filter((e: any) => (Number(e.unit_price) || 0) > 0);

        await replaceSupplierQuotesForSubmission(sessionId, null, payload);
        setSourceReturnId(assignmentId);
        setRfqNo(await getRFQNoForAssignment(assignmentId));
        await loadEntries();
      } catch (e: any) {
        Alert.alert("Error", e?.message ?? "Could not apply selected RFQ.");
      } finally {
        setApplyingSource(false);
      }
    },
    [sessionId, loadEntries, getRFQNoForAssignment],
  );

  const openRFQEditor = useCallback(
    async (a: EnrichedAssignmentRow) => {
      setRfqEditAssignment(a);
      setRfqEditOpen(true);
      try {
        const rows = await fetchQuotesForSubmission(sessionId, Number(a.id));
        if (!rows || rows.length === 0) {
          setRfqEditSupps([{ id: 1, name: "", address: "", tin: "", days: "", prices: {} }]);
          return;
        }

        const byName = new Map<string, any[]>();
        rows.forEach((r: any) => {
          const n = String(r.supplier_name ?? "").trim() || "Supplier";
          const arr = byName.get(n) ?? [];
          arr.push(r);
          byName.set(n, arr);
        });

        const supps: SupplierDraft[] = Array.from(byName.entries()).map(
          ([name, rs], idx) => {
            const head = rs[0] ?? {};
            const prices: Record<number, string> = {};
            liveItems.forEach((it) => {
              const row = rs.find(
                (x: any) => Number(x.item_no) === Number(it.id),
              );
              const v = row?.unit_price;
              prices[it.id] =
                v === null || v === undefined ? "" : String(v);
            });
            return {
              id: idx + 1,
              name,
              address: String(head.supplier_address ?? ""),
              tin: String(head.tin_no ?? ""),
              days: String(head.delivery_days ?? ""),
              prices,
            };
          },
        );
        setRfqEditSupps(supps.length ? supps : [{ id: 1, name: "", address: "", tin: "", days: "", prices: {} }]);
      } catch {
        setRfqEditSupps([{ id: 1, name: "", address: "", tin: "", days: "", prices: {} }]);
      }
    },
    [sessionId, liveItems],
  );

  const saveRFQEdits = useCallback(
    async (useAsSource: boolean) => {
      const a = rfqEditAssignment;
      if (!a) return;
      const assignmentId = Number(a.id);
      const hasNamed = rfqEditSupps.some((s) => s.name.trim().length > 0);
      if (!hasNamed) {
        Alert.alert("Missing supplier", "Enter at least one Supplier Name.");
        return;
      }
      setRfqEditSaving(true);
      try {
        const quotes: any[] = [];
        rfqEditSupps.forEach((sp) => {
          const sName = sp.name.trim();
          if (!sName) return;
          liveItems.forEach((item) => {
            const raw = (sp.prices?.[item.id] ?? "").trim();
            const parsed =
              raw === "" ? null : (parseFloat(raw.replace(/,/g, "")) || 0);
            quotes.push({
              item_no: item.id,
              description: item.desc,
              unit: item.unit,
              quantity: item.qty,
              supplier_name: sName,
              supplier_address: sp.address.trim() || null,
              tin_no: sp.tin.trim() || null,
              delivery_days: sp.days.trim() || null,
              unit_price: parsed === null ? null : parsed,
              total_price: parsed === null ? null : parsed * item.qty,
              is_winning: null,
            });
          });
        });
        await replaceSupplierQuotesForSubmission(sessionId, assignmentId, quotes);
        setSourceReturnId(assignmentId);
        setRfqNo(await getRFQNoForAssignment(assignmentId));
        if (useAsSource) await applySource(assignmentId);
        setRfqEditOpen(false);
      } catch (e: any) {
        Alert.alert("Save failed", e?.message ?? "Could not update RFQ.");
      } finally {
        setRfqEditSaving(false);
      }
    },
    [
      rfqEditAssignment,
      rfqEditSupps,
      liveItems,
      sessionId,
      applySource,
      getRFQNoForAssignment,
    ],
  );

  useEffect(() => {
    if (sourceReturnId != null) return;
    if (returns.length === 0) return;
    if (entries.length === 0) return;
    (async () => {
      try {
        const sig = new Set(
          entries.map(
            (e) =>
              `${e.item_no}|${String(e.supplier_name)}|${Number(e.unit_price)}`,
          ),
        );

        let best: number | null = null;
        let bestScore = -1;
        await Promise.all(
          returns.map(async (r) => {
            const rid = Number(r.id);
            const rows = await fetchQuotesForSubmission(sessionId, rid);
            let score = 0;
            (rows as any[]).forEach((e) => {
              if (
                sig.has(
                  `${e.item_no}|${String(e.supplier_name)}|${Number(e.unit_price)}`,
                )
              )
                score++;
            });
            if (score > bestScore) {
              bestScore = score;
              best = rid;
            }
          }),
        );
        if (best != null && bestScore > 0) {
          setSourceReturnId(best);
          const chosen = returns.find((r) => Number(r.id) === Number(best));
          setRfqNo(
            String(
              (chosen as any)?.quotation_no ??
                `RFQ #${(chosen as any)?.rfq_index ?? best}`,
            ),
          );
        }
      } catch {}
    })();
  }, [sourceReturnId, returns, entries, sessionId]);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const suppliers = useMemo(
    () =>
      [...new Set(entries.map((e) => e.supplier_name).filter(Boolean))].slice(
        0,
        3,
      ),
    [entries],
  );

  const winnerFor = (itemId: number): string => {
    const dbWinner = entries.find(
      (e) => e.item_no === itemId && e.is_winning === true,
    );
    if (dbWinner) return dbWinner.supplier_name;
    const byItem = entries.filter(
      (e) => e.item_no === itemId && e.unit_price > 0,
    );
    if (byItem.length === 0) return "";
    return byItem.reduce((b, e) => (e.unit_price < b.unit_price ? e : b))
      .supplier_name;
  };

  const priceFor = (itemId: number, supplier: string) =>
    entries.find((e) => e.item_no === itemId && e.supplier_name === supplier)
      ?.unit_price ?? 0;

  // ── Submit ────────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!sessionId || !aaaNo.trim()) return;
    try {
      const resolvedPrId = await fetchPRIdByNo(pr.prNo);
      if (!resolvedPrId) throw new Error("PR not found");

      const existingAAA = await fetchAAAForSession(sessionId);
      if (existingAAA) {
        await updateAAAForSession(sessionId, {
          aaa_no: aaaNo.trim(),
          particulars: particulars.trim() || null,
          prepared_by: currentUser?.id ?? 0,
          prepared_at: new Date().toISOString(),
          file_url: null,
        });
      } else {
        await insertAAAForSession(sessionId, {
          aaa_no: aaaNo.trim(),
          particulars: particulars.trim() || null,
          prepared_by: currentUser?.id ?? 0,
          prepared_at: new Date().toISOString(),
          file_url: null,
        });
      }

      await updateCanvassSessionMeta(sessionId, { status: "closed" });
      await updatePRStatus(resolvedPrId, 33);

      setIsSubmitted(true);

      onComplete?.({
        pr_no: pr.prNo,
        bac_no: rfqNo,
        resolution_no: resolutionNo,
        aaa_no: aaaNo,
      });

      Alert.alert(
        "Canvassing Complete",
        "Abstract of Awards recorded. Forward to Supply Section.",
      );
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? "Could not record AAA");
    }
  }, [
    sessionId,
    pr.prNo,
    aaaNo,
    particulars,
    currentUser?.id,
    rfqNo,
    resolutionNo,
    onComplete,
  ]);

  // ── Preview data ──────────────────────────────────────────────────────────────
  const buildPreviewData = (): AAAPreviewData => ({
    rfqNo,
    prNo: pr.prNo,
    resolutionNo,
    date,
    office,
    particulars: particulars.trim(),
    suppliers,
    rows: liveItems.map((item, idx) => {
      const prices: Record<string, number> = {};
      suppliers.forEach((s) => {
        prices[s] = priceFor(item.id, s);
      });
      return {
        itemNo: idx + 1,
        qty: item.qty,
        unit: item.unit,
        desc: item.desc,
        prices,
        winner: winnerFor(item.id) || null,
      };
    }),
  });

  // ── RFQReviewModal props — adapt EnrichedAssignmentRow → CanvasserAssignmentRow shape ──
  // The modal expects the raw DB row shape; EnrichedAssignmentRow is a superset.
  const rfqModalAssignments = useMemo(
    () =>
      allAssignments.map((a) => ({
        id: a.id,
        session_id: a.session_id,
        division_id: a.division_id,
        canvasser_id: a.canvasser_id ?? null,
        released_at: a.released_at ?? null,
        returned_at: a.returned_at ?? null,
        status: a.status,
      })),
    [allAssignments],
  );

  // Synthesise CanvassUserRow list from EnrichedAssignmentRow for the modal
  const rfqModalUsers = useMemo(
    () =>
      allAssignments
        .filter((a) => a.canvasser_id != null)
        .map((a) => ({
          id: a.canvasser_id!,
          username: a.canvasser_name ?? "—",
          role_id: 7,
          division_id: a.division_id,
          division_name: a.division_name ?? null,
        })),
    [allAssignments],
  );

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-gray-50">
        <ActivityIndicator size="large" color="#064E3B" />
        <Text className="text-[12px] text-gray-400">Loading AAA data…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-gray-50"
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingVertical: 16,
          paddingBottom: 40,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Prior Steps Summary (new) ── */}
        <PriorStepsSummary
          resolution={bacResolution}
          items={liveItems}
          entries={entries}
          onOpenRFQReview={() => setRfqReviewOpen(true)}
        />

        {/* ── Reference block (top-right on printed form) ── */}
        <Card>
          <View className="px-4 pt-3 pb-3">
            <Divider label="Document References" />
            {/* Row 1: RFQ No + Resolution No */}
            <View className="flex-row gap-2.5">
              <View className="flex-1">
                <Field label="RFQ No.">
                  <Input value={rfqNo} readonly />
                </Field>
              </View>
              <View className="flex-1">
                <Field label="Resolution No.">
                  <Input value={resolutionNo} readonly />
                </Field>
              </View>
            </View>
            {/* Row 2: PR No + Date */}
            <View className="flex-row gap-2.5">
              <View className="flex-1">
                <Field label="PR No.">
                  <Input value={pr.prNo} readonly />
                </Field>
              </View>
              <View className="flex-1">
                <Field label="Date">
                  <Input value={date} readonly />
                </Field>
              </View>
            </View>
          </View>
        </Card>

        {/* ── AAA Number (the only required editable field) ── */}
        <Card>
          <View className="px-4 pt-3 pb-3">
            <Divider label="AAA Details" />
            <Field label="AAA No." required>
              <Input
                value={aaaNo}
                onChange={setAaaNo}
                placeholder="e.g. 2025-08-390"
              />
            </Field>
            {/* Particulars = job order description shown in the abstract table */}
            <Field label="Particulars / Job Order Description">
              <View
                style={{
                  borderWidth: 1.5,
                  borderColor: "#e5e7eb",
                  borderRadius: 12,
                  minHeight: 80,
                  backgroundColor: "#fff",
                  padding: 10,
                }}
              >
                <TextInput
                  value={particulars}
                  onChangeText={setParticulars}
                  placeholder={
                    "e.g. REQUEST FOR SUPPLY, LABOR AND MATERIALS OF THE NETHOUSE INSTALLATION FOR SPFARBA'S PILI NURSERY ESTABLISHMENT..."
                  }
                  placeholderTextColor="#9ca3af"
                  multiline
                  textAlignVertical="top"
                  style={{ fontSize: 13, color: "#111827", lineHeight: 20 }}
                />
              </View>
              <Text className="text-[10px] text-gray-400 mt-1 px-1">
                This text appears as the Job Order row at the top of the
                abstract table.
              </Text>
            </Field>
          </View>
        </Card>

        {currentUser?.role_id === 3 && returns.length > 0 && (
          <Card>
            <View className="px-4 pt-3 pb-3">
              <Divider label="RFQ Source" />
              <Text className="text-[11.5px] text-gray-500 mb-2">
                Choose which returned RFQ to use as the basis for the abstract.
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                {returns.map((r) => {
                  const rid = Number(r.id);
                  const active = sourceReturnId === rid;
                  return (
                    <TouchableOpacity
                      key={r.id}
                      activeOpacity={0.85}
                      onPress={() => void openRFQEditor(r)}
                      className={`px-3 py-2 rounded-xl border ${
                        active
                          ? "bg-emerald-50 border-emerald-200"
                          : "bg-white border-gray-200"
                      }`}
                    >
                      <Text
                        className={`text-[11.5px] font-bold ${
                          active ? "text-emerald-800" : "text-gray-700"
                        }`}
                      >
                        {r.division_name ?? `Division ${r.division_id}`}
                      </Text>
                      <Text className="text-[10px] text-gray-400">
                        {r.canvasser_name ?? "—"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <View className="flex-row justify-end mt-2">
                <TouchableOpacity
                  disabled={sourceReturnId == null || applyingSource}
                  onPress={() =>
                    sourceReturnId != null && applySource(sourceReturnId)
                  }
                  activeOpacity={0.85}
                  className={`flex-row items-center gap-1.5 px-4 py-2.5 rounded-xl ${
                    sourceReturnId == null || applyingSource
                      ? "bg-gray-300"
                      : "bg-[#064E3B]"
                  }`}
                >
                  <MaterialIcons name="done" size={16} color="#ffffff" />
                  <Text className="text-[12px] font-bold text-white">
                    {applyingSource ? "Applying…" : "Apply"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Card>
        )}

        <Modal
          visible={rfqEditOpen}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setRfqEditOpen(false)}
        >
          <View className="flex-1 bg-gray-50">
            <View className="bg-white border-b border-gray-100 px-4 pt-4 pb-3">
              <View className="flex-row items-center justify-between">
                <TouchableOpacity
                  onPress={() => setRfqEditOpen(false)}
                  activeOpacity={0.8}
                  className="w-9 h-9 rounded-xl bg-gray-100 items-center justify-center"
                >
                  <MaterialIcons name="close" size={18} color="#6b7280" />
                </TouchableOpacity>
                <View className="items-center flex-1 px-3">
                  <Text className="text-[11px] text-gray-400 font-semibold">
                    RFQ Editor
                  </Text>
                  <Text className="text-[13px] font-extrabold text-gray-900">
                    {(rfqEditAssignment as any)?.quotation_no ??
                      `RFQ #${(rfqEditAssignment as any)?.rfq_index ?? rfqEditAssignment?.id ?? "—"}`}
                  </Text>
                </View>
                <View style={{ width: 36 }} />
              </View>
            </View>

            <ScrollView
              className="flex-1"
              contentContainerStyle={{ padding: 14, paddingBottom: 120 }}
              keyboardShouldPersistTaps="handled"
            >
              {rfqEditSupps.map((sp, sIdx) => (
                <View
                  key={sp.id}
                  className="border border-gray-200 rounded-2xl mb-3 overflow-hidden bg-white"
                >
                  <View className="flex-row items-center justify-between px-3 py-2.5 bg-gray-50">
                    <Text className="text-[13.5px] font-semibold text-gray-800">
                      Supplier {sIdx + 1}
                      {sp.name ? ` · ${sp.name}` : ""}
                    </Text>
                    {rfqEditSupps.length > 1 && (
                      <TouchableOpacity
                        onPress={() =>
                          setRfqEditSupps((s) => s.filter((x) => x.id !== sp.id))
                        }
                        hitSlop={8}
                        className="p-1.5 rounded-lg border border-gray-200"
                      >
                        <MaterialIcons name="close" size={16} color="#ef4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                  <View className="p-3 gap-2">
                    <Field label="Supplier Name" required>
                      <Input
                        value={sp.name}
                        placeholder="Business / trade name"
                        onChange={(v) =>
                          setRfqEditSupps((s) =>
                            s.map((x) =>
                              x.id === sp.id ? { ...x, name: v } : x,
                            ),
                          )
                        }
                      />
                    </Field>
                    <View className="flex-row gap-2.5">
                      <View className="flex-1">
                        <Field label="Address">
                          <Input
                            value={sp.address}
                            placeholder="Supplier address"
                            onChange={(v) =>
                              setRfqEditSupps((s) =>
                                s.map((x) =>
                                  x.id === sp.id ? { ...x, address: v } : x,
                                ),
                              )
                            }
                          />
                        </Field>
                      </View>
                    </View>
                    <View className="flex-row gap-2.5">
                      <View className="flex-1">
                        <Field label="TIN No.">
                          <Input
                            value={sp.tin}
                            placeholder="000-000-000"
                            onChange={(v) =>
                              setRfqEditSupps((s) =>
                                s.map((x) =>
                                  x.id === sp.id ? { ...x, tin: v } : x,
                                ),
                              )
                            }
                          />
                        </Field>
                      </View>
                      <View className="flex-1">
                        <Field label="Delivery (days)">
                          <Input
                            value={sp.days}
                            placeholder="e.g. 7"
                            numeric
                            onChange={(v) =>
                              setRfqEditSupps((s) =>
                                s.map((x) =>
                                  x.id === sp.id ? { ...x, days: v } : x,
                                ),
                              )
                            }
                          />
                        </Field>
                      </View>
                    </View>
                    <Divider label="Unit Prices Quoted (₱)" />
                    {liveItems.map((item) => {
                      const raw = sp.prices?.[item.id] ?? "";
                      const price =
                        parseFloat(String(raw).replace(/,/g, "")) || 0;
                      return (
                        <View
                          key={item.id}
                          className="flex-row items-center gap-2 py-1.5"
                          style={{
                            borderBottomWidth: 1,
                            borderBottomColor: "#f3f4f6",
                          }}
                        >
                          <Text
                            className="flex-[2] text-[12px] text-gray-700"
                            numberOfLines={1}
                          >
                            {item.desc}
                          </Text>
                          <Text className="text-[11.5px] text-gray-400 w-9 text-center">
                            {item.unit}
                          </Text>
                          <Text className="text-[11.5px] text-gray-600 w-7 text-right">
                            {item.qty}
                          </Text>
                          <View className="w-20">
                            <Input
                              value={raw}
                              numeric
                              placeholder="0.00"
                              onChange={(v) =>
                                setRfqEditSupps((s) =>
                                  s.map((x) =>
                                    x.id === sp.id
                                      ? {
                                          ...x,
                                          prices: { ...x.prices, [item.id]: v },
                                        }
                                      : x,
                                  ),
                                )
                              }
                            />
                          </View>
                          <Text
                            className={`w-20 text-[11.5px] font-semibold text-right ${
                              price > 0 ? "text-[#064E3B]" : "text-gray-300"
                            }`}
                          >
                            {price > 0 ? `₱${fmt(price * item.qty)}` : "—"}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}

              <TouchableOpacity
                onPress={() =>
                  setRfqEditSupps((s) => [
                    ...s,
                    {
                      id: s.length + 1,
                      name: "",
                      address: "",
                      tin: "",
                      days: "",
                      prices: {},
                    },
                  ])
                }
                activeOpacity={0.8}
                className="flex-row items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-gray-300 bg-white"
              >
                <MaterialIcons name="add" size={18} color="#6b7280" />
                <Text className="text-[12px] font-bold text-gray-600">
                  Add Supplier
                </Text>
              </TouchableOpacity>
            </ScrollView>

            <View className="absolute left-0 right-0 bottom-0 bg-white border-t border-gray-100 px-4 py-3">
              <View className="flex-row items-center gap-2">
                <TouchableOpacity
                  onPress={() => setRfqEditOpen(false)}
                  activeOpacity={0.85}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-white"
                  disabled={rfqEditSaving}
                >
                  <Text className="text-[12px] font-bold text-gray-700 text-center">
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void saveRFQEdits(false)}
                  activeOpacity={0.85}
                  className={`flex-1 px-4 py-2.5 rounded-xl ${
                    rfqEditSaving ? "bg-gray-300" : "bg-gray-900"
                  }`}
                  disabled={rfqEditSaving}
                >
                  <Text className="text-[12px] font-bold text-white text-center">
                    Save
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void saveRFQEdits(true)}
                  activeOpacity={0.85}
                  className={`flex-1 px-4 py-2.5 rounded-xl ${
                    rfqEditSaving ? "bg-gray-300" : "bg-[#064E3B]"
                  }`}
                  disabled={rfqEditSaving}
                >
                  <Text className="text-[12px] font-bold text-white text-center">
                    Save & Use
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {prId && currentUser?.id && (
          <View className="mb-3">
            <StageRemarkBox
              prId={prId}
              userId={String(currentUser.id)}
              stageKey="aaa_preparation"
              stageLabel="AAA Preparation"
            />
          </View>
        )}

        {/* ── Abstract table ── */}
        <AbstractTable
          items={liveItems}
          suppliers={suppliers}
          entries={entries}
          sessionId={sessionId}
          onWinnerChanged={loadEntries}
        />

        {/* ── Preview / Print button ── */}
        {suppliers.length > 0 && (
          <TouchableOpacity
            onPress={() => setPreviewOpen(true)}
            activeOpacity={0.8}
            className="flex-row items-center justify-center gap-2 bg-[#064E3B] rounded-2xl py-3 mb-3"
          >
            <MaterialIcons name="description" size={16} color="#fff" />
            <Text className="text-[13px] font-bold text-white">
              Preview / Print Abstract
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Completed state ── */}
        {isSubmitted && (
          <CompletedBanner
            label={`AAA No. ${aaaNo} prepared. Forwarded to Supply.`}
            onResubmit={() => setIsSubmitted(false)}
          />
        )}

        {/* ── Submit nav ── */}
        <StepNav
          stage="aaa_preparation"
          done={new Set(isSubmitted ? (["aaa_preparation"] as any) : [])}
          onPrev={() => onBack?.()}
          onNext={() => {}}
          canSubmit={!isSubmitted && !!aaaNo.trim()}
          submitLabel="Finalize & Forward to Supply"
          onSubmit={handleSubmit}
        />
      </ScrollView>

      {/* ── Preview modal ── */}
      <AAAPreviewModal
        visible={previewOpen}
        html={buildAAAPreviewHTML(buildPreviewData())}
        aaaNo={aaaNo || "—"}
        prNo={pr.prNo}
        date={date}
        office={office}
        onClose={() => setPreviewOpen(false)}
      />

      {/* ── RFQ Review modal (wired from Prior Steps Summary) ── */}
      <RFQReviewModal
        visible={rfqReviewOpen}
        onClose={() => setRfqReviewOpen(false)}
        pr={{ ...pr, items: liveItems }}
        liveItems={liveItems}
        entries={entries as any}
        assignments={rfqModalAssignments as any}
        users={rfqModalUsers as any}
        bacNo={rfqNo}
        chairperson="BAC Chairperson"
      />
    </KeyboardAvoidingView>
  );
}
