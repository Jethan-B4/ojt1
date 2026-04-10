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
  fetchQuotesForSubmission,
  fetchUsersByRole,
  insertAssignmentReleased,
  insertAssignmentsForDivisions,
  markAssignmentReturned,
  replaceSupplierQuotesForSubmission,
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
import StageRemarkBox from "../StageRemarkBox";
import PRReceptionStep from "./PRReceptionStep";
import RFQReviewModal from "./RFQReviewModal";

/* Import modularized components */
import {
  AssignmentList,
  CompletedBanner,
  StageStrip,
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
  const [prId, setPrId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [bacNo, setBacNo] = useState("");
  const [resNo, setResNo] = useState("");
  const [mode, setMode] = useState(PROC_MODES[0]);
  const sessionRef = useRef<any>({ pr_no: pr.prNo });
  const [previewOpen, setPreviewOpen] = useState(false);

  const [assignments, setAssignments] = useState<CanvasserAssignmentRow[]>([]);
  const [canvassEntries, setCanvassEntries] = useState<CanvassEntryRow[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [rfqReviewOpen, setRfqReviewOpen] = useState(false);
  const [selectedReturnId, setSelectedReturnId] = useState<string | null>(null);
  const [expandedRFQs, setExpandedRFQs] = useState<Set<string>>(new Set());
  const [collectedRFQ, setCollectedRFQ] = useState<CanvassPreviewData | null>(
    null,
  );
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

    fetchQuotesForSession(sessionId)
      .then(setCanvassEntries)
      .catch(() => {});
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
        setPrId(prId);
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

        const allQuotes = await fetchQuotesForSession(session.id);
        if (allQuotes.length > 0) setCanvassEntries(allQuotes);

        const existingQuotes = await fetchQuotesForSubmission(session.id, null);
        if (existingQuotes.length > 0) {
          // Group entries by supplier_name to reconstruct each SupplierQ block
          const supplierMap = new Map<string, SupplierQ>();
          let nextId = 1;
          existingQuotes.forEach((e: any) => {
            const name = e.supplier_name || `Supplier ${nextId}`;
            if (!supplierMap.has(name)) {
              supplierMap.set(name, {
                id: nextId++,
                name,
                address: "",
                contact: "",
                tin: e.tin_no ?? "",
                days: e.delivery_days ?? "",
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
        }

        const prefill = (session as any).aaa_prefill_assignment_id as
          | string
          | null
          | undefined;
        if (prefill) setSelectedReturnId(prefill);
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
              tin_no: sp.tin || null,
              delivery_days: sp.days || null,
              unit_price: up,
              total_price: up * item.qty,
              is_winning: null,
            });
        });
      });
      // Always use replace (delete-then-insert) so that re-encoding or editing
      // never accumulates duplicate rows in canvass_entries.
      await replaceSupplierQuotesForSubmission(sessionId, null, quotes);
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
  const userById = React.useMemo(
    () => Object.fromEntries(canvassUsers.map((u) => [u.id, u])),
    [canvassUsers],
  );

  const hasAssignmentId = React.useMemo(
    () => canvassEntries.some((e: any) => e.assignment_id !== undefined),
    [canvassEntries],
  );

  const prItemIdSet = React.useMemo(
    () => new Set(liveItems.map((i) => i.id)),
    [liveItems],
  );

  const entriesForAssignment = React.useCallback(
    (assignmentId: string) => {
      const filtered = canvassEntries.filter((e) => prItemIdSet.has(e.item_no));
      if (!hasAssignmentId) return filtered;
      return filtered.filter((e: any) => e.assignment_id === assignmentId);
    },
    [canvassEntries, prItemIdSet, hasAssignmentId],
  );

  const rebuildSuppsFromQuotes = React.useCallback((quotes: any[]) => {
    if (!quotes.length) return [mkSupplier(1)];
    const supplierMap = new Map<string, SupplierQ>();
    let nextId = 1;
    quotes.forEach((e) => {
      const name = e.supplier_name || `Supplier ${nextId}`;
      if (!supplierMap.has(name)) {
        supplierMap.set(name, {
          id: nextId++,
          name,
          address: "",
          contact: "",
          tin: (e as any).tin_no ?? "",
          days: (e as any).delivery_days ?? "",
          prices: {},
          remarks: "",
        });
      }
      const sp = supplierMap.get(name)!;
      sp.prices[parseInt(String(e.item_no))] = String(e.unit_price);
    });
    const list = Array.from(supplierMap.values());
    return list.length ? list : [mkSupplier(1)];
  }, []);

  const buildCollectedRFQData = React.useCallback(
    (
      a: CanvasserAssignmentRow,
      entries: CanvassEntryRow[],
    ): CanvassPreviewData => {
      const user = a.canvasser_id ? userById[a.canvasser_id] : undefined;
      const canvasserName = user?.username ?? "—";
      return {
        prNo: pr.prNo,
        quotationNo: bacNo || "—",
        date: new Date().toLocaleDateString("en-PH"),
        deadline: "—",
        bacChairperson:
          members.find((m) => m.designation.includes("Chairperson"))?.name ||
          "BAC Chairperson",
        officeSection: pr.officeSection,
        purpose: pr.purpose,
        items: liveItems.map((item, i) => {
          const entry = entries.find((e) => e.item_no === item.id);
          return {
            itemNo: i + 1,
            description: item.desc,
            qty: item.qty,
            unit: item.unit,
            unitPrice: entry ? Number(entry.unit_price).toFixed(2) : "",
          };
        }),
        canvasserNames: canvasserName ? [canvasserName] : [],
      };
    },
    [pr, bacNo, members, liveItems, userById],
  );

  const applyReturnAsBase = React.useCallback(
    async (assignmentId: string) => {
      if (!sessionId) return;
      const src = entriesForAssignment(assignmentId);
      const payload = src
        .map((e) => ({
          item_no: e.item_no,
          description: e.description,
          unit: e.unit,
          quantity: e.quantity,
          supplier_name: e.supplier_name,
          tin_no: (e as any).tin_no ?? null,
          delivery_days: (e as any).delivery_days ?? null,
          unit_price: e.unit_price,
          total_price: e.total_price,
          is_winning: e.is_winning ?? null,
        }))
        .filter((e) => (Number(e.unit_price) || 0) > 0);

      await updateCanvassSessionMeta(sessionId, {
        aaa_prefill_assignment_id: assignmentId,
      });
      setSelectedReturnId(assignmentId);
      await replaceSupplierQuotesForSubmission(sessionId, null, payload);
      const encoded = await fetchQuotesForSubmission(sessionId, null);
      setSupps(rebuildSuppsFromQuotes(encoded));
      setCanvassEntries(await fetchQuotesForSession(sessionId));
    },
    [sessionId, entriesForAssignment, rebuildSuppsFromQuotes],
  );

  useEffect(() => {
    if (stage !== "collect_canvass") return;
    if (!sessionId) return;
    if (selectedReturnId) return;
    const returned = assignments.filter((a) => a.status === "returned");
    if (returned.length === 0) return;

    const hasPrices = supps.some(
      (s) => s.name.trim() && Object.keys(s.prices).length > 0,
    );
    if (hasPrices) return;

    let bestId: string | null = null;
    let bestTotal = Number.POSITIVE_INFINITY;
    returned.forEach((a) => {
      const ent = entriesForAssignment(a.id);
      const total = ent.reduce((sum, e) => sum + (e.total_price || 0), 0);
      if (ent.length > 0 && total < bestTotal) {
        bestTotal = total;
        bestId = a.id;
      }
    });
    if (!bestId) return;
    applyReturnAsBase(bestId).catch(() => {});
  }, [
    stage,
    sessionId,
    selectedReturnId,
    assignments,
    supps,
    entriesForAssignment,
    applyReturnAsBase,
  ]);

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
      setCanvassEntries(quotes as any);
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
                <MaterialIcons name="arrow-back" size={18} color="#ffffff" />
              </TouchableOpacity>
            )}
            <View>
              <Text className="text-[9.5px] font-semibold tracking-widest uppercase text-white/40">
                DAR · Procurement · Canvassing
              </Text>
              <Text className="text-[15px] font-extrabold text-white">
                Canvassing · BAC
              </Text>
            </View>
          </View>
          <View className="bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-300">
            <View className="flex-row items-center gap-1">
              <MaterialIcons name="schedule" size={14} color="#92400e" />
              <Text className="text-[10.5px] font-bold text-amber-800">
                7-day window
              </Text>
            </View>
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
          <PRReceptionStep
            pr={pr}
            liveItems={liveItems}
            bacNo={bacNo}
            onBacNoChange={setBacNo}
            currentUser={currentUser}
            isCompleted={isViewingCompleted}
            onResubmit={() =>
              setDone((prev) => {
                const n = new Set(prev);
                n.delete("pr_received");
                return n;
              })
            }
            onForward={handleStep6}
            stage={stage}
            done={done}
            onPrev={goToStage}
            onNext={goToStage}
          />
        )}

        {/* ── Step 7: Release Canvass ── */}
        {stage === "release_canvass" && (
          <View>
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

            {(assignments.length > 0 || assignmentsLoading) && (
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
            )}

            {isViewingCompleted && (
              <CompletedBanner
                label="Canvass sheets released."
                onResubmit={() =>
                  setDone((prev) => {
                    const n = new Set(prev);
                    n.delete("release_canvass");
                    return n;
                  })
                }
              />
            )}

            {currentUser?.id && prId && (
              <View className="px-4 mb-3">
                <StageRemarkBox
                  prId={prId}
                  userId={String(currentUser.id)}
                  stageKey="release_canvass"
                  stageLabel="Release Canvass"
                />
              </View>
            )}

            <StepNav
              stage={stage}
              done={done}
              onPrev={goToStage}
              onNext={goToStage}
              canSubmit={!isViewingCompleted}
              submitLabel="Released · Collect Canvass"
              onSubmit={handleStep8}
            />
          </View>
        )}

        {/* ── Step 8: Collect & Encode Quotations ── */}
        {stage === "collect_canvass" && (
          <View>
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
              const returned = assignments.filter(
                (a) => a.status === "returned",
              );
              if (returned.length === 0) return null;
              return (
                <Card>
                  <View className="px-4 pt-3 pb-2">
                    <Divider label="Collected RFQs" />
                    {returned.map((a) => {
                      const user = a.canvasser_id
                        ? userById[a.canvasser_id]
                        : undefined;
                      const divName =
                        user?.division_name ?? `Division ${a.division_id}`;
                      const canvasserName = user?.username ?? "—";
                      const ent = entriesForAssignment(a.id);
                      const totalQuoted = ent.reduce(
                        (s, e) => s + (e.total_price || 0),
                        0,
                      );
                      const expanded = expandedRFQs.has(a.id);
                      const active = selectedReturnId === a.id;
                      return (
                        <View
                          key={a.id}
                          className="bg-white rounded-2xl border border-gray-200 mb-3 overflow-hidden"
                        >
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() =>
                              setExpandedRFQs((prev) => {
                                const n = new Set(prev);
                                if (n.has(a.id)) n.delete(a.id);
                                else n.add(a.id);
                                return n;
                              })
                            }
                            className="flex-row items-center justify-between px-3 py-2.5 bg-gray-50"
                          >
                            <View className="flex-row items-center gap-2.5 flex-1 pr-2">
                              <View
                                className="w-8 h-8 rounded-xl items-center justify-center"
                                style={{
                                  backgroundColor: active
                                    ? "#064E3B"
                                    : "#ecfdf5",
                                }}
                              >
                                <MaterialIcons
                                  name="assignment-turned-in"
                                  size={16}
                                  color={active ? "#ffffff" : "#065f46"}
                                />
                              </View>
                              <View className="flex-1">
                                <Text
                                  className="text-[12.5px] font-bold text-gray-900"
                                  numberOfLines={1}
                                >
                                  {divName}
                                </Text>
                                <Text
                                  className="text-[10.5px] text-gray-400"
                                  numberOfLines={1}
                                >
                                  {canvasserName}
                                </Text>
                              </View>
                            </View>
                            <View className="items-end">
                              <Text className="text-[11px] font-extrabold text-[#064E3B]">
                                ₱{fmt(totalQuoted)}
                              </Text>
                              <View className="flex-row items-center gap-1">
                                <Text className="text-[10px] text-gray-400">
                                  {ent.length} item{ent.length !== 1 ? "s" : ""}
                                </Text>
                                <MaterialIcons
                                  name={
                                    expanded
                                      ? "keyboard-arrow-up"
                                      : "keyboard-arrow-down"
                                  }
                                  size={16}
                                  color="#9ca3af"
                                />
                              </View>
                            </View>
                          </TouchableOpacity>

                          <View className="px-3 pb-3 pt-2">
                            <View className="flex-row items-center gap-2">
                              <TouchableOpacity
                                onPress={() =>
                                  setCollectedRFQ(buildCollectedRFQData(a, ent))
                                }
                                activeOpacity={0.85}
                                className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white"
                              >
                                <MaterialIcons
                                  name="description"
                                  size={14}
                                  color="#065f46"
                                />
                                <Text className="text-[11.5px] font-bold text-gray-700">
                                  View RFQ
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => applyReturnAsBase(a.id)}
                                activeOpacity={0.85}
                                className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl bg-[#064E3B]"
                              >
                                <MaterialIcons
                                  name="done"
                                  size={14}
                                  color="#ffffff"
                                />
                                <Text className="text-[11.5px] font-bold text-white">
                                  Use as Base
                                </Text>
                              </TouchableOpacity>
                              {active && (
                                <View className="ml-auto bg-emerald-100 px-2 py-0.5 rounded-full">
                                  <Text className="text-[10px] font-bold text-emerald-700">
                                    Selected
                                  </Text>
                                </View>
                              )}
                            </View>

                            {expanded && (
                              <View className="mt-2">
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
                                {ent.map((e, i) => (
                                  <View
                                    key={`${a.id}-${e.id}-${i}`}
                                    className={`px-3 py-2 rounded-xl ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
                                    style={{
                                      borderWidth: 1,
                                      borderColor: "#f3f4f6",
                                    }}
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
                                ))}
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </Card>
              );
            })()}

            <Card>
              <View className="px-4 pt-3 pb-3">
                <View className="flex-row items-center justify-between gap-3 mb-1">
                  <Divider label="Supplier Quotations" />
                  {selectedReturnId && (
                    <TouchableOpacity
                      onPress={() => {
                        const a = assignments.find(
                          (x) => x.id === selectedReturnId,
                        );
                        if (!a) return;
                        const ent = entriesForAssignment(a.id);
                        setCollectedRFQ(buildCollectedRFQData(a, ent));
                      }}
                      activeOpacity={0.85}
                      className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white"
                    >
                      <MaterialIcons
                        name="description"
                        size={14}
                        color="#065f46"
                      />
                      <Text className="text-[11.5px] font-bold text-gray-700">
                        View Selected RFQ
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
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
                          <MaterialIcons
                            name="close"
                            size={16}
                            color="#ef4444"
                          />
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

            {currentUser?.id && prId && (
              <View className="px-4 mb-3">
                <StageRemarkBox
                  prId={prId}
                  userId={String(currentUser.id)}
                  stageKey="collect_canvass"
                  stageLabel="Collect Canvass"
                />
              </View>
            )}

            <StepNav
              stage={stage}
              done={done}
              onPrev={goToStage}
              onNext={goToStage}
              canSubmit={!isViewingCompleted}
              submitLabel="Encoded · BAC Resolution"
              onSubmit={handleStep9}
            />
          </View>
        )}

        {/* ── Step 9: BAC Resolution ── */}
        {stage === "bac_resolution" && (
          <View>
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
                        {m.signed ? (
                          <MaterialIcons
                            name="check"
                            size={16}
                            color="#ffffff"
                          />
                        ) : (
                          <Text className="text-[12px] font-bold text-gray-500">
                            {m.name[0]}
                          </Text>
                        )}
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
                        <View className="flex-row items-center gap-1">
                          <MaterialIcons
                            name="verified"
                            size={14}
                            color="#10b981"
                          />
                          <Text className="text-[11.5px] font-semibold text-emerald-600">
                            Signed
                          </Text>
                        </View>
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
                                      {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      },
                                    ),
                                  },
                            ),
                          )
                        }
                        className="px-3.5 py-1.5 rounded-lg border border-gray-200 bg-white"
                      >
                        <View className="flex-row items-center gap-1.5">
                          <MaterialIcons
                            name="edit"
                            size={14}
                            color="#6b7280"
                          />
                          <Text className="text-[12px] font-semibold text-gray-500">
                            Sign
                          </Text>
                        </View>
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

            {currentUser?.id && prId && (
              <View className="px-4 mb-3">
                <StageRemarkBox
                  prId={prId}
                  userId={String(currentUser.id)}
                  stageKey="bac_resolution"
                  stageLabel="BAC Resolution"
                />
              </View>
            )}

            <StepNav
              stage={stage}
              done={done}
              onPrev={goToStage}
              onNext={goToStage}
              canSubmit={!isViewingCompleted && allSigned && !!resNo && !!mode}
              submitLabel="Resolve & Complete BAC Workflow"
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

      <CanvassPreviewModal
        visible={!!collectedRFQ}
        data={collectedRFQ ?? buildPreviewData()}
        onClose={() => setCollectedRFQ(null)}
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
