/**
 * BACView — BAC role (role_id 3) canvassing workflow, Steps 6–9.
 * Handles PR reception, canvasser release, quote collection, and BAC resolution.
 * Step 10 (AAA preparation) is handled separately in AAAView module.
 *
 * Modularized structure:
 *   /constants.ts — staging & procurement mode constants
 *   /utils.ts — formatting helpers (fmt, prTotal)
 *   /ui.tsx — reusable UI atoms (Divider, Card, Field, Input, Banner, Btn, etc.)
 *   /components.tsx — composed UI components (StepNav, StageStrip, PRCard, ItemsTable, etc.)
 *   /index.tsx — main BAC orchestrator component (this file)
 */

import type {
  CanvassEntryRow,
  CanvassUserRow,
  CanvasserAssignmentRow,
} from "@/lib/supabase";
import { insertBACResolution } from "@/lib/supabase/bac";
import {
  ensureCanvassSession,
  fetchAssignmentsForSession,
  fetchQuotesForSession,
  fetchUsersByRole,
  insertAssignmentReleased,
  insertAssignmentsForDivisions,
  markAssignmentReturned,
  replaceSupplierQuotesForSession,
  updateAssignmentReleased,
  updateCanvassSessionMeta,
  updateCanvassStage,
} from "@/lib/supabase/canvassing";
import { supabase } from "@/lib/supabase/client";
import {
  fetchPRIdByNo,
  fetchPRWithItemsById,
  updatePRStatus,
} from "@/lib/supabase/pr";
import type {
  BACMember,
  CanvassStage,
  CanvassingPR,
  CanvassingPRItem,
  SupplierQ,
} from "@/types/canvassing";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { BACResolutionData } from "../../(components)/BACResolutionPreview";
import type { CanvassPreviewData } from "../../(components)/CanvassPreview";
import BACResolutionPreviewModal from "../../(modals)/BACResolutionPreviewModal";
import CanvassPreviewModal from "../../(modals)/CanvassPreviewModal";
import { useAuth } from "../../AuthContext";
import RFQReviewModal from "./RFQReviewModal";

/* Import modularized components */
import {
  AssignmentList,
  CompletedBanner,
  ItemsTable,
  StageStrip,
  StepHeader,
  StepNav,
} from "./components";
import { CANVASS_ROLE_IDS, PROC_MODES, STAGE_ORDER } from "./constants";
import { Banner, Card, Divider, Field, Input, PickerField } from "./ui";
import { fmt } from "./utils";

// ─── Local state factories ────────────────────────────────────────────────────

const mkBACMembers = (): BACMember[] => [
  {
    name: "Yvonne M.",
    designation: "BAC Chairperson",
    signed: false,
    signedAt: "",
  },
  { name: "Mariel T.", designation: "BAC Member", signed: false, signedAt: "" },
  { name: "Robert A.", designation: "BAC Member", signed: false, signedAt: "" },
  {
    name: "PARPO II",
    designation: "PARPO / Approver",
    signed: false,
    signedAt: "",
  },
];

const mkSupplier = (id: number): SupplierQ => ({
  id,
  name: "",
  address: "",
  contact: "",
  tin: "",
  days: "",
  prices: {},
  remarks: "",
});

// ─── Component ────────────────────────────────────────────────────────────────

export default function BACView({
  pr,
  onComplete,
  onBack,
}: {
  pr: CanvassingPR;
  onComplete?: (payload: any) => void;
  onBack?: () => void;
}) {
  const { currentUser } = useAuth();

  const [stage, setStage] = useState<CanvassStage>("pr_received");
  const [done, setDone] = useState<Set<CanvassStage>>(new Set());
  const [members, setMembers] = useState<BACMember[]>(mkBACMembers);
  const [canvassUsers, setCanvassUsers] = useState<CanvassUserRow[]>([]);
  const [canvassStatuses, setCanvassStatuses] = useState<
    Record<
      number,
      {
        status: "pending" | "released" | "returned";
        releaseDate: string;
        returnDate: string;
      }
    >
  >({});
  const [usersLoading, setUsersLoading] = useState(true);
  const [supps, setSupps] = useState<SupplierQ[]>([mkSupplier(1)]);
  const [liveItems, setLiveItems] = useState<CanvassingPRItem[]>(pr.items);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [bacNo, setBacNo] = useState("");
  const [resNo, setResNo] = useState("");
  const [mode, setMode] = useState(PROC_MODES[0]);
  const sessionRef = useRef<any>({ pr_no: pr.prNo });
  const [previewOpen, setPreviewOpen] = useState(false);

  const [assignments, setAssignments] = useState<CanvasserAssignmentRow[]>([]);
  const [canvassEntries, setCanvassEntries] = useState<CanvassEntryRow[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [rfqReviewOpen, setRfqReviewOpen] = useState(false);
  const [prExpanded, setPrExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [resolutionPreviewOpen, setResolutionPreviewOpen] = useState(false);

  // ── Navigation & State Management ──────────────────────────────────────────

  const goToStage = useCallback((target: CanvassStage) => {
    setStage(target);
  }, []);

  const advance = useCallback((current: CanvassStage) => {
    setDone((s) => new Set([...s, current]));
    const idx = STAGE_ORDER.indexOf(current);
    if (idx < STAGE_ORDER.length - 1) setStage(STAGE_ORDER[idx + 1]);
  }, []);

  const isViewingCompleted = done.has(stage);

  // ── Data Loading ───────────────────────────────────────────────────────────

  useEffect(() => {
    setUsersLoading(true);
    fetchUsersByRole(CANVASS_ROLE_IDS)
      .then((users) => {
        setCanvassUsers(users);
        setCanvassStatuses(
          Object.fromEntries(
            users.map((u) => [
              u.id,
              { status: "pending" as const, releaseDate: "", returnDate: "" },
            ]),
          ),
        );
      })
      .catch(() => {})
      .finally(() => setUsersLoading(false));
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    setAssignmentsLoading(true);
    fetchAssignmentsForSession(sessionId)
      .then((asgns) => {
        setAssignments(asgns);
        // Rehydrate canvassStatuses from DB so the Release step shows the
        // correct Released/Returned state when the BAC reopens the screen.
        if (asgns.length > 0) {
          setCanvassStatuses((prev) => {
            const next = { ...prev };
            asgns.forEach((a: any) => {
              if (!a.canvasser_id) return;
              next[a.canvasser_id] = {
                status: a.status === "returned" ? "returned" : "released",
                releaseDate: a.released_at ?? "",
                returnDate: a.returned_at ?? "",
              };
            });
            return next;
          });
        }
      })
      .catch(() => {})
      .finally(() => setAssignmentsLoading(false));

    setEntriesLoading(true);
    fetchQuotesForSession(sessionId)
      .then(setCanvassEntries)
      .catch(() => {})
      .finally(() => setEntriesLoading(false));
  }, [sessionId]);

  // ── Realtime: refresh entries + assignments when canvassers submit ──────────
  useEffect(() => {
    if (!sessionId) return;

    const entriesChannel = supabase
      .channel(`bac-entries-${sessionId}`)
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
            const fresh = await fetchQuotesForSession(sessionId);
            setCanvassEntries(fresh);
          } catch {}
        },
      )
      .subscribe();

    const assignmentsChannel = supabase
      .channel(`bac-assignments-${sessionId}`)
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
          } catch {}
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(entriesChannel);
      supabase.removeChannel(assignmentsChannel);
    };
  }, [sessionId]);

  useEffect(() => {
    (async () => {
      try {
        const prId = await fetchPRIdByNo(pr.prNo);
        if (!prId) return;
        const session = await ensureCanvassSession(prId);
        setSessionId(session.id);
        const dbStage = (session.stage as CanvassStage) || "pr_received";
        setStage(dbStage);
        const dbIdx = STAGE_ORDER.indexOf(dbStage);
        if (dbIdx > 0) {
          setDone(new Set(STAGE_ORDER.slice(0, dbIdx)));
        }
        const { items } = await fetchPRWithItemsById(prId);
        const mappedItems = items.map((i) => ({
          id: parseInt(String(i.id)),
          desc: i.description,
          stock: i.stock_no,
          unit: i.unit,
          qty: i.quantity,
          unitCost: i.unit_price,
        }));
        setLiveItems(mappedItems);

        // ── Prefill supplier quotation form from existing DB entries ───────────
        // When the BAC navigates back to edit an already-submitted step, the
        // supps inputs must be pre-populated from the saved quotes.  Without
        // this, the form starts blank and re-submitting would wipe the DB entries
        // with an empty list (or the old insert path would create duplicates).
        const existingQuotes = await fetchQuotesForSession(session.id);
        if (existingQuotes.length > 0) {
          // Group entries by supplier_name to reconstruct each SupplierQ block
          const supplierMap = new Map<string, SupplierQ>();
          let nextId = 1;
          existingQuotes.forEach((e) => {
            const name = e.supplier_name || `Supplier ${nextId}`;
            if (!supplierMap.has(name)) {
              supplierMap.set(name, {
                id: nextId++,
                name,
                address: "",
                contact: "",
                tin: "",
                days: "",
                prices: {},
                remarks: "",
              });
            }
            const sp = supplierMap.get(name)!;
            sp.prices[parseInt(String(e.item_no))] = String(e.unit_price);
          });
          if (supplierMap.size > 0) {
            setSupps(Array.from(supplierMap.values()));
          }
          setCanvassEntries(existingQuotes);
        }
      } catch {}
    })();
  }, [pr.prNo]);

  // ── Step Handlers ──────────────────────────────────────────────────────────

  const handleStep6 = useCallback(async () => {
    try {
      const prId = await fetchPRIdByNo(pr.prNo);
      if (!prId) throw new Error("PR not found");
      // ensureCanvassSession creates the session with bac_no in one shot.
      // If the session already exists, update bac_no and stage separately.
      const session = await ensureCanvassSession(prId, { bac_no: bacNo });
      setSessionId(session.id);
      // Ensure bac_no and stage are persisted even if the session already existed
      await updateCanvassSessionMeta(session.id, { bac_no: bacNo });
      await updateCanvassStage(session.id, "release_canvass");
      await updatePRStatus(prId, 6); // status_id 6 = Canvassing (Reception)
      sessionRef.current.bac_no = bacNo;
      advance("pr_received");
    } catch (e: any) {
      Alert.alert(
        "Save failed",
        e?.message ?? "Could not create canvass session",
      );
    }
  }, [pr.prNo, bacNo, advance]);

  const handleStep8 = useCallback(async () => {
    if (!sessionId) return;
    try {
      const prId = await fetchPRIdByNo(pr.prNo);
      if (!prId) throw new Error("PR not found");
      const released = canvassUsers.filter(
        (u) =>
          canvassStatuses[u.id]?.status !== "pending" && u.division_id !== null,
      );
      const rows = released.map((u) => ({
        division_id: u.division_id!,
        canvasser_id: u.id,
        released_at:
          canvassStatuses[u.id]?.releaseDate || new Date().toISOString(),
      }));
      if (rows.length) await insertAssignmentsForDivisions(sessionId, rows);
      await updatePRStatus(prId, 8);
      await updateCanvassStage(sessionId, "collect_canvass");
      fetchAssignmentsForSession(sessionId)
        .then(setAssignments)
        .catch(() => {});
      advance("release_canvass");
    } catch (e: any) {
      Alert.alert(
        "Release failed",
        e?.message ?? "Could not record canvass releases",
      );
    }
  }, [sessionId, pr.prNo, canvassUsers, canvassStatuses, advance]);

  const handleStep9 = useCallback(async () => {
    if (!sessionId) return;
    try {
      const prId = await fetchPRIdByNo(pr.prNo);
      if (!prId) throw new Error("PR not found");
      const quotes: any[] = [];
      supps.forEach((sp) => {
        liveItems.forEach((item) => {
          const up = parseFloat(sp.prices[item.id] || "0") || 0;
          if (up > 0)
            quotes.push({
              item_no: item.id,
              description: item.desc,
              unit: item.unit,
              quantity: item.qty,
              supplier_name: sp.name || `Supplier ${sp.id}`,
              unit_price: up,
              total_price: up * item.qty,
              is_winning: null,
            });
        });
      });
      // Always use replace (delete-then-insert) so that re-encoding or editing
      // never accumulates duplicate rows in canvass_entries.
      await replaceSupplierQuotesForSession(sessionId, quotes);
      await updatePRStatus(prId, 9);
      await updateCanvassStage(sessionId, "bac_resolution");
      fetchQuotesForSession(sessionId)
        .then(setCanvassEntries)
        .catch(() => {});
      advance("collect_canvass");
    } catch (e: any) {
      Alert.alert(
        "Quotes failed",
        e?.message ?? "Could not save supplier quotations",
      );
    }
  }, [sessionId, pr.prNo, supps, liveItems, advance]);

  const handleStep7 = useCallback(async () => {
    if (!sessionId || !resNo) return;
    try {
      const prId = await fetchPRIdByNo(pr.prNo);
      if (!prId) throw new Error("PR not found");
      sessionRef.current.resolution_no = resNo;
      sessionRef.current.mode = mode;
      await insertBACResolution(sessionId, {
        resolution_no: resNo,
        prepared_by: currentUser?.id ?? 0,
        mode,
        resolved_at: new Date().toISOString(),
        notes: null,
      });
      // status_id 10 = BAC Resolution (canvassing step just completed)
      // Move PR to AAA Issuance after BAC Resolution
      await updatePRStatus(prId, 11);
      await updateCanvassStage(sessionId, "aaa_preparation");
      // advance() marks bac_resolution done and moves stage → aaa_preparation
      // (aaa_preparation is now included in STAGE_ORDER in constants.ts)
      advance("bac_resolution");
      // Notify parent so the shell route can open the AAA tab
      onComplete?.({
        pr_no: pr.prNo,
        resolution_no: resNo,
        mode,
        stage: "aaa_preparation",
      });
    } catch (e: any) {
      Alert.alert(
        "Resolution failed",
        e?.message ?? "Could not record BAC resolution",
      );
    }
  }, [sessionId, pr.prNo, resNo, mode, currentUser?.id, advance, onComplete]);

  const toggleUserStatus = useCallback(
    async (userId: number) => {
      try {
        if (!sessionId) return;
        const user = canvassUsers.find((u) => u.id === userId);
        if (!user || !user.division_id) return;

        const cur = canvassStatuses[userId] ?? {
          status: "pending",
          releaseDate: "",
          returnDate: "",
        };
        const now = new Date().toISOString();

        if (cur.status === "pending") {
          try {
            await updateAssignmentReleased(
              sessionId,
              user.division_id,
              userId,
              now,
            );
          } catch {
            await insertAssignmentReleased(
              sessionId,
              user.division_id,
              userId,
              now,
            );
          }
          setCanvassStatuses((prev) => ({
            ...prev,
            [userId]: { ...cur, status: "released", releaseDate: now },
          }));
          fetchAssignmentsForSession(sessionId)
            .then(setAssignments)
            .catch(() => {});
        } else if (cur.status === "released") {
          await markAssignmentReturned(sessionId, user.division_id, now);
          setCanvassStatuses((prev) => ({
            ...prev,
            [userId]: { ...cur, status: "returned", returnDate: now },
          }));
          fetchAssignmentsForSession(sessionId)
            .then(setAssignments)
            .catch(() => {});
        }
      } catch (e: any) {
        Alert.alert(
          "Error",
          e?.message ?? "Failed to update assignment status",
        );
      }
    },
    [sessionId, canvassUsers, canvassStatuses, setAssignments],
  );

  const allSigned = members.every((m) => m.signed);

  const buildPreviewData = (): CanvassPreviewData => {
    const deadlineDate = new Date();
    deadlineDate.setDate(deadlineDate.getDate() + 7);
    return {
      prNo: pr.prNo,
      quotationNo: bacNo || "—",
      date: new Date().toLocaleDateString("en-PH"),
      deadline: deadlineDate.toLocaleDateString("en-PH", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
      bacChairperson:
        members.find((m) => m.designation.includes("Chairperson"))?.name ||
        "BAC Chairperson",
      officeSection: pr.officeSection,
      purpose: pr.purpose,
      items: liveItems.map((item, i) => ({
        itemNo: i + 1,
        description: item.desc,
        qty: item.qty,
        unit: item.unit,
        unitPrice: "",
      })),
      canvasserNames: canvassUsers
        .filter((u) => canvassStatuses[u.id]?.status !== "pending")
        .map((u) => u.username),
    };
  };

  const buildResolutionData = (): BACResolutionData => {
    // Compute per-item winner (lowest unit price) from all canvass entries
    const winners = liveItems.map((item) => {
      const itemEntries = canvassEntries.filter(
        (e) => e.item_no === item.id && e.unit_price > 0,
      );
      const best = itemEntries.reduce<(typeof itemEntries)[0] | null>(
        (min, e) => (min == null || e.unit_price < min.unit_price ? e : min),
        null,
      );
      return {
        item,
        winner: best,
        total: best ? best.unit_price * item.qty : 0,
      };
    });
    const winnersTotal = winners.reduce((s, w) => s + w.total, 0);
    const recommendedSummary =
      winners
        .filter((w) => w.winner)
        .map(
          (w) =>
            `${w.item.desc} → ${w.winner!.supplier_name} (₱${fmt(
              w.winner!.unit_price,
            )}/unit)`,
        )
        .join("; ") || "—";

    const chairperson =
      members.find((m) => m.designation.includes("Chairperson"))?.name ??
      "BAC Chairperson";
    const viceChair =
      members.find((m) => m.designation.includes("Vice"))?.name ?? "";
    const bacMems = members
      .filter((m) => m.designation === "BAC Member")
      .map((m) => m.name);
    const approver =
      members.find((m) => m.designation.includes("PARPO"))?.name ?? "PARPO II";
    const totalCost =
      winnersTotal || liveItems.reduce((s, i) => s + i.qty * i.unitCost, 0);
    return {
      resolutionNo: resNo || "—",
      resolvedDate: new Date().toLocaleDateString("en-PH", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
      location: "HL Bldg. Carnation St. Triangulo Naga City",
      prEntries: [
        {
          prNo: pr.prNo,
          date: pr.date,
          estimatedCost: totalCost.toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
          endUser: pr.officeSection,
          procMode: mode,
        },
      ],
      whereasText:
        pr.purpose +
        (recommendedSummary && recommendedSummary !== "—"
          ? `\n\nRecommended suppliers (per item, lowest quote): ${recommendedSummary}.`
          : ""),
      requestingOffice: pr.officeSection,
      provincialOffice: "DARPO-CAMARINES SUR I",
      bacChairperson: chairperson,
      bacViceChairperson: viceChair,
      bacMembers:
        bacMems.length >= 2 ? [bacMems[0], bacMems[1]] : [bacMems[0] ?? "", ""],
      approvedBy: approver,
      approvedByDesig: "HOPE",
      procurementModeTitle: mode.toUpperCase(),
    };
  };

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      const prId = await fetchPRIdByNo(pr.prNo);
      if (!prId) return;
      const session = await ensureCanvassSession(prId);
      setSessionId(session.id);
      const [{ items }, quotes, asgns] = await Promise.all([
        fetchPRWithItemsById(prId),
        fetchQuotesForSession(session.id),
        fetchAssignmentsForSession(session.id),
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
      setEntries(quotes);
      setAssignments(asgns as any);
    } catch {
    } finally {
      setRefreshing(false);
    }
  }, [pr.prNo]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View className="bg-[#064E3B] px-4 pt-3">
        <View className="flex-row items-center justify-between mb-2.5">
          <View className="flex-row items-center gap-2">
            {onBack && (
              <TouchableOpacity
                onPress={onBack}
                hitSlop={10}
                className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center"
              >
                <Text className="text-white text-[20px] leading-none font-light">
                  ←
                </Text>
              </TouchableOpacity>
            )}
            <View>
              <Text className="text-[9.5px] font-semibold tracking-widest uppercase text-white/40">
                DAR · Procurement › Canvassing
              </Text>
              <Text className="text-[15px] font-extrabold text-white">
                Canvassing · BAC
              </Text>
            </View>
          </View>
          <View className="bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-300">
            <Text className="text-[10.5px] font-bold text-amber-800">
              ⏱ 7-day window
            </Text>
          </View>
        </View>
        <StageStrip current={stage} completed={done} onNavigate={goToStage} />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── Expandable PR pill ── */}
        <TouchableOpacity
          onPress={() => setPrExpanded((v) => !v)}
          activeOpacity={0.8}
          className="bg-white rounded-2xl border border-gray-200 mb-3 overflow-hidden"
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 4,
            elevation: 2,
          }}
        >
          {/* Collapsed header — always visible */}
          <View className="flex-row items-center px-4 py-3 gap-3">
            <View className="flex-1">
              <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                Purchase Request
              </Text>
              <Text
                className="text-[14px] font-extrabold text-[#064E3B]"
                style={{
                  fontFamily:
                    Platform.OS === "ios" ? "Courier New" : "monospace",
                }}
              >
                {pr.prNo}
              </Text>
            </View>
            <View className="items-end">
              <Text
                className="text-[12px] font-bold text-gray-800"
                style={{
                  fontFamily:
                    Platform.OS === "ios" ? "Courier New" : "monospace",
                }}
              >
                ₱
                {liveItems
                  .reduce((s, i) => s + i.qty * i.unitCost, 0)
                  .toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
              </Text>
              <Text className="text-[10.5px] text-gray-400">
                {liveItems.length} item{liveItems.length !== 1 ? "s" : ""}
              </Text>
            </View>
            <MaterialIcons
              name={prExpanded ? "expand-less" : "expand-more"}
              size={20}
              color="#9ca3af"
            />
          </View>

          {/* Expanded detail — PR meta + items table */}
          {prExpanded && (
            <View style={{ borderTopWidth: 1, borderTopColor: "#f3f4f6" }}>
              {/* Meta row */}
              <View className="flex-row items-center gap-4 px-4 py-2.5 bg-gray-50">
                <View>
                  <Text className="text-[9px] font-bold uppercase tracking-wide text-gray-400">
                    Section
                  </Text>
                  <Text className="text-[11.5px] font-semibold text-gray-700">
                    {pr.officeSection}
                  </Text>
                </View>
                <View>
                  <Text className="text-[9px] font-bold uppercase tracking-wide text-gray-400">
                    Date
                  </Text>
                  <Text className="text-[11.5px] font-semibold text-gray-700">
                    {pr.date}
                  </Text>
                </View>
                {pr.isHighValue && (
                  <View className="bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                    <Text className="text-[9.5px] font-bold text-amber-800">
                      HIGH VALUE
                    </Text>
                  </View>
                )}
              </View>
              {/* Purpose */}
              <View className="px-4 py-2.5">
                <Text className="text-[9px] font-bold uppercase tracking-wide text-gray-400 mb-1">
                  Purpose
                </Text>
                <Text className="text-[12px] text-gray-600 leading-[18px]">
                  {pr.purpose}
                </Text>
              </View>
              {/* Line items mini-table */}
              <View className="px-4 pb-3">
                <Text className="text-[9px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">
                  Line Items
                </Text>
                <View className="rounded-xl overflow-hidden border border-gray-100">
                  <View className="flex-row bg-[#064E3B] px-2.5 py-1.5">
                    {["Description", "Unit", "Qty", "Unit Cost", "Total"].map(
                      (h, i) => (
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
                      ),
                    )}
                  </View>
                  {liveItems.map((item, i) => (
                    <View
                      key={item.id}
                      className={`flex-row px-2.5 py-1.5 ${i % 2 ? "bg-gray-50" : "bg-white"}`}
                      style={{ borderTopWidth: 1, borderTopColor: "#f3f4f6" }}
                    >
                      <Text
                        className="flex-[2] text-[11px] text-gray-700"
                        numberOfLines={1}
                      >
                        {item.desc}
                      </Text>
                      <Text className="flex-1 text-[11px] text-gray-500">
                        {item.unit}
                      </Text>
                      <Text
                        className="flex-1 text-[11px] text-gray-700 text-right"
                        style={{
                          fontFamily:
                            Platform.OS === "ios" ? "Courier New" : "monospace",
                        }}
                      >
                        {item.qty}
                      </Text>
                      <Text
                        className="flex-1 text-[11px] text-gray-700 text-right"
                        style={{
                          fontFamily:
                            Platform.OS === "ios" ? "Courier New" : "monospace",
                        }}
                      >
                        ₱
                        {item.unitCost.toLocaleString("en-PH", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </Text>
                      <Text
                        className="flex-1 text-[11px] font-semibold text-[#2d6a4f] text-right"
                        style={{
                          fontFamily:
                            Platform.OS === "ios" ? "Courier New" : "monospace",
                        }}
                      >
                        ₱
                        {(item.qty * item.unitCost).toLocaleString("en-PH", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )}
        </TouchableOpacity>

        {/* ── Step 6: PR Received ── */}
        {stage === "pr_received" && (
          <View>
            <StepHeader
              stage="pr_received"
              title="PR Received from PARPO"
              desc="Assign a BAC canvass number to acknowledge receipt of the approved PR."
            />
            {isViewingCompleted ? (
              <CompletedBanner
                label={`BAC Canvass No. ${bacNo} recorded.`}
                onResubmit={() =>
                  setDone((prev) => {
                    const n = new Set(prev);
                    n.delete("pr_received");
                    return n;
                  })
                }
              />
            ) : (
              <Banner
                type="info"
                text="PR has been approved by PARPO. Assign a BAC canvass number to begin."
              />
            )}
            <Card>
              <View className="px-4 pt-3 pb-2">
                <Divider label="BAC Acknowledgement" />
                <Field label="BAC Canvass No." required>
                  <Input
                    value={bacNo}
                    onChange={setBacNo}
                    placeholder="e.g. BAC-2026-001"
                  />
                </Field>
                <Field label="Date Received">
                  <Input
                    value={new Date().toLocaleDateString("en-PH")}
                    readonly
                  />
                </Field>
              </View>
            </Card>
            <ItemsTable items={liveItems} />
            <StepNav
              stage={stage}
              done={done}
              onPrev={goToStage}
              onNext={goToStage}
              canSubmit={!isViewingCompleted && !!bacNo}
              submitLabel="Acknowledged → Release Canvass"
              onSubmit={handleStep6}
            />
          </View>
        )}

        {/* ── Step 7: Release Canvass ── */}
        {stage === "release_canvass" && (
          <View>
            <StepHeader
              stage="release_canvass"
              title="Release Canvass to Divisions"
              desc="Release canvass sheets (RFQs) to the End Users and Canvassers per division."
            />
            <Banner
              type="warning"
              text="Verify availability before releasing. End Users (role 6) and Canvassers (role 7) are listed."
            />
            <Card>
              <View className="px-4 pt-3 pb-2">
                <Divider label="Canvassers & End Users by Division" />
                {usersLoading ? (
                  <View className="items-center py-6">
                    <Text className="text-[13px] text-gray-400">
                      Loading users…
                    </Text>
                  </View>
                ) : canvassUsers.length === 0 ? (
                  <View className="items-center py-6">
                    <Text className="text-[13px] text-gray-400">
                      No End Users or Canvassers found in the system.
                    </Text>
                  </View>
                ) : (
                  canvassUsers.map((user) => {
                    const st = canvassStatuses[user.id] ?? {
                      status: "pending",
                      releaseDate: "",
                      returnDate: "",
                    };
                    const roleLabel =
                      user.role_id === 7 ? "Canvasser" : "End User";
                    const roleBg =
                      user.role_id === 7 ? "bg-violet-100" : "bg-blue-100";
                    const roleText =
                      user.role_id === 7 ? "text-violet-800" : "text-blue-800";
                    return (
                      <View
                        key={user.id}
                        className={`flex-row items-center justify-between p-2.5 mb-1.5 rounded-2xl border ${
                          st.status !== "pending"
                            ? "bg-emerald-50 border-emerald-200"
                            : "bg-white border-gray-200"
                        }`}
                      >
                        <View className="w-16 bg-emerald-100 px-1.5 py-0.5 rounded-md">
                          <Text
                            className="text-[9.5px] font-bold text-emerald-800 text-center"
                            numberOfLines={1}
                          >
                            {user.division_name ?? "—"}
                          </Text>
                        </View>

                        <View className="flex-1 px-2">
                          <Text
                            className="text-[12.5px] text-gray-700 font-semibold"
                            numberOfLines={1}
                          >
                            {user.username}
                          </Text>
                          <View
                            className={`self-start px-1.5 py-0.5 rounded-md ${roleBg} mt-0.5`}
                          >
                            <Text
                              className={`text-[9px] font-bold ${roleText}`}
                            >
                              {roleLabel}
                            </Text>
                          </View>
                        </View>

                        <View
                          className={`px-2 py-0.5 rounded-full mr-2 ${
                            st.status === "pending"
                              ? "bg-amber-100"
                              : st.status === "released"
                                ? "bg-emerald-100"
                                : "bg-blue-100"
                          }`}
                        >
                          <Text
                            className={`text-[10px] font-bold ${
                              st.status === "pending"
                                ? "text-amber-800"
                                : st.status === "released"
                                  ? "text-emerald-700"
                                  : "text-blue-700"
                            }`}
                          >
                            {st.status === "pending"
                              ? "Pending"
                              : st.status === "released"
                                ? "Released"
                                : "Returned"}
                          </Text>
                        </View>

                        {st.status !== "returned" && (
                          <TouchableOpacity
                            onPress={async () =>
                              await toggleUserStatus(user.id)
                            }
                            activeOpacity={0.8}
                            className={`px-2.5 py-1 rounded-lg ${
                              st.status === "pending"
                                ? "bg-emerald-600"
                                : "bg-blue-600"
                            }`}
                          >
                            <Text className="text-[11px] font-bold text-white">
                              {st.status === "pending"
                                ? "📤 Release"
                                : "📥 Receive"}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            </Card>
            {assignments.length > 0 || assignmentsLoading ? (
              <Card>
                <View className="px-4 pt-3 pb-3">
                  <Divider label="Recorded Assignments" />
                  <AssignmentList
                    assignments={assignments}
                    users={canvassUsers}
                    loading={assignmentsLoading}
                  />
                </View>
              </Card>
            ) : null}
            {isViewingCompleted && (
              <CompletedBanner
                label="Canvass sheets released. Waiting for returns."
                onResubmit={() =>
                  setDone((prev) => {
                    const n = new Set(prev);
                    n.delete("release_canvass");
                    return n;
                  })
                }
              />
            )}
            <StepNav
              stage={stage}
              done={done}
              onPrev={goToStage}
              onNext={goToStage}
              canSubmit={!isViewingCompleted}
              submitLabel="Released → Collect Canvass"
              onSubmit={handleStep8}
            />
          </View>
        )}

        {/* ── Step 8: Collect & Encode Quotations ── */}
        {stage === "collect_canvass" && (
          <View>
            <StepHeader
              stage="collect_canvass"
              title="Collect & Encode Canvass"
              desc="Collect returned RFQ forms and encode each supplier's quoted prices."
            />

            {/* ── Returned canvassers banner + Review button ── */}
            {(() => {
              const returnedCount = assignments.filter(
                (a) => a.status === "returned",
              ).length;
              const totalCount = assignments.length;
              return totalCount > 0 ? (
                <View
                  className="flex-row items-center justify-between bg-white rounded-2xl border border-gray-200 px-4 py-3 mb-3"
                  style={{
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.05,
                    shadowRadius: 3,
                    elevation: 1,
                  }}
                >
                  <View className="flex-1">
                    <Text className="text-[12.5px] font-bold text-gray-800">
                      {returnedCount}/{totalCount} RFQ
                      {totalCount !== 1 ? "s" : ""} returned
                    </Text>
                    <Text className="text-[10.5px] text-gray-400 mt-0.5">
                      {returnedCount === 0
                        ? "Awaiting canvasser submissions"
                        : returnedCount < totalCount
                          ? `${totalCount - returnedCount} still outstanding`
                          : "All forms returned — ready for encoding"}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setRfqReviewOpen(true)}
                    activeOpacity={0.8}
                    className="flex-row items-center gap-1.5 bg-[#064E3B] px-3 py-2 rounded-xl ml-3"
                  >
                    <MaterialIcons
                      name="assignment-turned-in"
                      size={14}
                      color="#fff"
                    />
                    <Text className="text-[11.5px] font-bold text-white">
                      Review RFQs
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null;
            })()}

            {(() => {
              const prItemIds = liveItems.map((i) => i.id);
              const filteredEntries = canvassEntries.filter((e) =>
                prItemIds.includes(e.item_no),
              );
              return filteredEntries.length > 0 ? (
                <Card>
                  <View className="px-4 pt-3 pb-2">
                    <View className="flex-row items-center gap-2 mb-1">
                      <Divider label="Submitted Quotations" />
                      <View className="bg-emerald-100 px-2 py-0.5 rounded-full mb-2.5 ml-1">
                        <Text className="text-[10px] font-bold text-emerald-700">
                          {filteredEntries.length} entr
                          {filteredEntries.length === 1 ? "y" : "ies"}
                        </Text>
                      </View>
                    </View>
                    <View className="flex-row bg-[#064E3B] rounded-xl px-3 py-1.5 mb-1">
                      <Text className="flex-[3] text-[9px] font-bold uppercase tracking-wide text-white/70">
                        Item / Supplier
                      </Text>
                      <Text className="w-16 text-[9px] font-bold uppercase tracking-wide text-white/70 text-center">
                        Qty
                      </Text>
                      <Text className="w-20 text-[9px] font-bold uppercase tracking-wide text-white/70 text-right">
                        Unit Price
                      </Text>
                      <Text className="w-20 text-[9px] font-bold uppercase tracking-wide text-white/70 text-right">
                        Total
                      </Text>
                    </View>
                    {entriesLoading ? (
                      <View className="items-center py-4">
                        <Text className="text-[12px] text-gray-400">
                          Loading…
                        </Text>
                      </View>
                    ) : (
                      filteredEntries.map((e, i) => (
                        <View
                          key={e.id}
                          className={`px-3 py-2 rounded-xl ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
                          style={{ borderWidth: 1, borderColor: "#f3f4f6" }}
                        >
                          <View className="flex-row items-center">
                            <View className="flex-[3] pr-2">
                              <Text
                                className="text-[11.5px] font-semibold text-gray-800"
                                numberOfLines={1}
                              >
                                {e.description}
                              </Text>
                              <Text
                                className="text-[10.5px] text-gray-400 mt-0.5"
                                numberOfLines={1}
                              >
                                {e.supplier_name}
                              </Text>
                            </View>
                            <Text className="w-16 text-[11px] text-gray-500 text-center">
                              {e.quantity} {e.unit}
                            </Text>
                            <Text className="w-20 text-[11.5px] font-semibold text-gray-700 text-right">
                              ₱{fmt(e.unit_price)}
                            </Text>
                            <Text className="w-20 text-[11.5px] font-bold text-[#064E3B] text-right">
                              ₱{fmt(e.total_price)}
                            </Text>
                          </View>
                        </View>
                      ))
                    )}
                    {filteredEntries.length > 0 && (
                      <View
                        className="flex-row justify-end mt-1.5 px-3 pt-2"
                        style={{
                          borderTopWidth: 1,
                          borderTopColor: "#d1fae5",
                        }}
                      >
                        <Text className="text-[11px] font-bold text-gray-500 mr-3">
                          Grand Total
                        </Text>
                        <Text className="text-[12px] font-extrabold text-[#064E3B]">
                          ₱
                          {fmt(
                            filteredEntries.reduce(
                              (s, e) => s + e.total_price,
                              0,
                            ),
                          )}
                        </Text>
                      </View>
                    )}
                  </View>
                </Card>
              ) : null;
            })()}
            <Card>
              <View className="px-4 pt-3 pb-3">
                <Divider label="Supplier Quotations" />
                {supps.map((sp, sIdx) => (
                  <View
                    key={sp.id}
                    className="border border-gray-200 rounded-2xl mb-3 overflow-hidden"
                  >
                    <View className="flex-row items-center justify-between px-3 py-2.5 bg-gray-50">
                      <Text className="text-[13.5px] font-semibold text-gray-800">
                        Supplier {sIdx + 1}
                        {sp.name ? ` · ${sp.name}` : ""}
                      </Text>
                      {supps.length > 1 && (
                        <TouchableOpacity
                          onPress={() =>
                            setSupps((s) => s.filter((x) => x.id !== sp.id))
                          }
                          hitSlop={8}
                          className="p-1.5 rounded-lg border border-gray-200"
                        >
                          <Text className="text-[12px] text-red-500">✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <View className="p-3 gap-2">
                      <Field label="Supplier Name" required>
                        <Input
                          value={sp.name}
                          placeholder="Business / trade name"
                          onChange={(v) =>
                            setSupps((s) =>
                              s.map((x) =>
                                x.id === sp.id ? { ...x, name: v } : x,
                              ),
                            )
                          }
                        />
                      </Field>
                      <View className="flex-row gap-2.5">
                        <View className="flex-1">
                          <Field label="TIN No.">
                            <Input
                              value={sp.tin}
                              placeholder="000-000-000"
                              onChange={(v) =>
                                setSupps((s) =>
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
                                setSupps((s) =>
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
                        const price =
                          parseFloat(sp.prices[item.id] || "0") || 0;
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
                                value={sp.prices[item.id] ?? ""}
                                numeric
                                placeholder="0.00"
                                onChange={(v) =>
                                  setSupps((s) =>
                                    s.map((x) =>
                                      x.id === sp.id
                                        ? {
                                            ...x,
                                            prices: {
                                              ...x.prices,
                                              [item.id]: v,
                                            },
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
                    setSupps((s) => [...s, mkSupplier(s.length + 1)])
                  }
                  activeOpacity={0.8}
                  className="flex-row items-center justify-center gap-2 py-3 rounded-2xl"
                  style={{
                    borderWidth: 2,
                    borderStyle: "dashed",
                    borderColor: "#d1d5db",
                  }}
                >
                  <Text className="text-[13px] font-semibold text-[#064E3B]">
                    + Add Supplier Quote
                  </Text>
                </TouchableOpacity>
              </View>
            </Card>
            {isViewingCompleted && (
              <CompletedBanner
                label="Supplier quotations encoded."
                onResubmit={() =>
                  setDone((prev) => {
                    const n = new Set(prev);
                    n.delete("collect_canvass");
                    return n;
                  })
                }
              />
            )}
            <View className="flex-row justify-center mb-3">
              <TouchableOpacity
                onPress={() => setPreviewOpen(true)}
                activeOpacity={0.8}
                className="flex-row items-center gap-2 px-5 py-2.5 rounded-xl border border-[#064E3B] bg-[#064E3B]"
              >
                <MaterialIcons name="description" size={16} color="#ffffff" />
                <Text className="text-[13px] font-bold text-white">
                  Preview RFQ Form
                </Text>
              </TouchableOpacity>
            </View>
            <StepNav
              stage={stage}
              done={done}
              onPrev={goToStage}
              onNext={goToStage}
              canSubmit={!isViewingCompleted}
              submitLabel="Encoded → BAC Resolution"
              onSubmit={handleStep9}
            />
          </View>
        )}

        {/* ── Step 9: BAC Resolution ── */}
        {stage === "bac_resolution" && (
          <View>
            <StepHeader
              stage="bac_resolution"
              title="BAC Resolution"
              desc="Prepare the BAC Resolution and collect all member signatures."
            />
            <Card>
              <View className="px-4 pt-3 pb-2">
                <Divider label="Resolution Details" />
                <View className="flex-row gap-2.5">
                  <View className="flex-1">
                    <Field label="Resolution No." required>
                      <Input
                        value={resNo}
                        onChange={setResNo}
                        placeholder="e.g. BAC-RES-2026-001"
                      />
                    </Field>
                  </View>
                  <View className="flex-1">
                    <Field label="PR Reference">
                      <Input value={pr.prNo} readonly />
                    </Field>
                  </View>
                </View>
                <Field label="Mode of Procurement" required>
                  <PickerField
                    title="Mode of Procurement"
                    options={PROC_MODES}
                    value={mode}
                    onSelect={setMode}
                  />
                </Field>
              </View>
            </Card>

            {!allSigned && (
              <Banner
                type="warning"
                text="All BAC members and PARPO II must sign before proceeding."
              />
            )}

            <Card>
              <View className="px-4 pt-3 pb-2">
                <View className="flex-row items-center gap-2 mb-3">
                  <Text className="text-[9.5px] font-bold tracking-widest uppercase text-gray-400">
                    Signatories
                  </Text>
                  <View className="bg-emerald-100 px-2 py-0.5 rounded-md">
                    <Text className="text-[10px] font-bold text-emerald-700">
                      {members.filter((m) => m.signed).length}/{members.length}{" "}
                      signed
                    </Text>
                  </View>
                  <View className="flex-1 h-px bg-gray-200" />
                </View>
                {members.map((m, idx) => (
                  <View
                    key={m.name}
                    className={`flex-row items-center justify-between p-3 mb-2 rounded-2xl border ${
                      m.signed
                        ? "bg-emerald-50 border-emerald-200"
                        : "bg-white border-gray-200"
                    }`}
                  >
                    <View className="flex-row items-center gap-2.5 flex-1">
                      <View
                        className={`w-8 h-8 rounded-lg items-center justify-center border ${
                          m.signed
                            ? "bg-emerald-500 border-emerald-500"
                            : "bg-gray-100 border-gray-200"
                        }`}
                      >
                        <Text
                          className="text-[12px] font-bold"
                          style={{ color: m.signed ? "#fff" : "#6b7280" }}
                        >
                          {m.signed ? "✓" : m.name[0]}
                        </Text>
                      </View>
                      <View>
                        <Text
                          className={`text-[13px] font-semibold ${
                            m.signed ? "text-emerald-800" : "text-gray-800"
                          }`}
                        >
                          {m.name}
                        </Text>
                        <Text className="text-[11px] text-gray-400">
                          {m.designation}
                        </Text>
                      </View>
                    </View>
                    {m.signed ? (
                      <View className="items-end">
                        <Text className="text-[11.5px] font-semibold text-emerald-600">
                          ✅ Signed
                        </Text>
                        <Text className="text-[10px] text-gray-400">
                          at {m.signedAt}
                        </Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() =>
                          setMembers((ms) =>
                            ms.map((mb, i) =>
                              i !== idx
                                ? mb
                                : {
                                    ...mb,
                                    signed: true,
                                    signedAt: new Date().toLocaleTimeString(
                                      "en-PH",
                                      { hour: "2-digit", minute: "2-digit" },
                                    ),
                                  },
                            ),
                          )
                        }
                        className="px-3.5 py-1.5 rounded-lg border border-gray-200 bg-white"
                      >
                        <Text className="text-[12px] font-semibold text-gray-500">
                          ✍️ Sign
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            </Card>

            {isViewingCompleted ? (
              <CompletedBanner
                label={`Resolution No. ${resNo} recorded. Mode: ${mode}.`}
                onResubmit={() =>
                  setDone((prev) => {
                    const n = new Set(prev);
                    n.delete("bac_resolution");
                    return n;
                  })
                }
              />
            ) : (
              !allSigned && (
                <Banner
                  type="warning"
                  text="All BAC members and PARPO II must sign before proceeding."
                />
              )
            )}

            {/* Preview Resolution button — visible once resolution no. is filled */}
            {!!resNo && (
              <View className="flex-row justify-center mb-3">
                <TouchableOpacity
                  onPress={() => setResolutionPreviewOpen(true)}
                  activeOpacity={0.8}
                  className="flex-row items-center gap-2 px-5 py-2.5 rounded-xl border border-[#064E3B] bg-[#064E3B]"
                >
                  <MaterialIcons name="gavel" size={16} color="#ffffff" />
                  <Text className="text-[13px] font-bold text-white">
                    Preview / Print Resolution
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <StepNav
              stage={stage}
              done={done}
              onPrev={goToStage}
              onNext={goToStage}
              canSubmit={!isViewingCompleted && allSigned && !!resNo && !!mode}
              submitLabel="Resolve & Complete BAC Workflow →"
              onSubmit={handleStep7}
            />
          </View>
        )}
      </ScrollView>

      <CanvassPreviewModal
        visible={previewOpen}
        data={buildPreviewData()}
        onClose={() => setPreviewOpen(false)}
      />

      <BACResolutionPreviewModal
        visible={resolutionPreviewOpen}
        data={buildResolutionData()}
        onClose={() => setResolutionPreviewOpen(false)}
      />

      <RFQReviewModal
        visible={rfqReviewOpen}
        onClose={() => setRfqReviewOpen(false)}
        pr={{ ...pr, items: liveItems }}
        liveItems={liveItems}
        entries={canvassEntries}
        assignments={assignments}
        users={canvassUsers}
        bacNo={bacNo}
        chairperson={
          members.find((m) => m.designation.includes("Chairperson"))?.name ??
          "BAC Chairperson"
        }
      />
    </KeyboardAvoidingView>
  );
}
function setEntries(quotes: any[]) {
  throw new Error("Function not implemented.");
}
