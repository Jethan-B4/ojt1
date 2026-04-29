/**
 * BACView — BAC role (role_id 3) canvassing workflow, Steps 6–10.
 * Handles PR reception, canvasser release, quote collection, BAC resolution,
 * and AAA preparation. Step 10 (AAA) is rendered inline via AAAView.
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
import {
  fetchBACResolutionForPR,
  insertBACResolution,
  updateBACResolutionById,
} from "@/lib/supabase/bac";
import {
  ensureCanvassSession,
  fetchAssignmentsForSession,
  fetchQuotesForSession,
  fetchQuotesForSubmission,
  fetchUsersByRole,
  insertAssignmentsForDivisions,
  replaceSupplierQuotesForSubmission,
  updateCanvassStage,
} from "@/lib/supabase/canvassing";
import { supabase } from "@/lib/supabase/client";
import {
  fetchCanvassablePRs,
  fetchPRIdByNo,
  fetchPRWithItemsById,
  updatePRStatus,
} from "@/lib/supabase/pr";
import type {
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
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import BACResolutionModule from "../../(components)/BACResolutionModule";
import type { BACResolutionData } from "../../(components)/BACResolutionPreview";
import type { CanvassPreviewData } from "../../(components)/CanvassPreview";
import BACResolutionPreviewModal from "../../(modals)/BACResolutionPreviewModal";
import CanvassPreviewModal from "../../(modals)/CanvassPreviewModal";
import { useAuth } from "../../contexts/AuthContext";
import AAAView from "../AAAView/AAAModule";
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
import { Card, Divider, Field, Input, PickerField } from "./ui";
import { fmt } from "./utils";

// ─── Local state factories ────────────────────────────────────────────────────

type BACMember = {
  name: string;
  designation: string;
  signed: boolean;
  signedAt: string;
};

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

type ResolutionPRRow = {
  key: string;
  prId: number | null;
  prNo: string;
  date: string;
  estimatedCost: string;
  endUser: string;
  procMode: string;
};

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
  const [members] = useState<BACMember[]>(mkBACMembers);
  const [canvassUsers, setCanvassUsers] = useState<CanvassUserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [supps, setSupps] = useState<SupplierQ[]>([mkSupplier(1)]);
  const [liveItems, setLiveItems] = useState<CanvassingPRItem[]>(pr.items);
  const [prId, setPrId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [resNo, setResNo] = useState("");
  const [mode, setMode] = useState(PROC_MODES[0]);
  const [resolutionDivisionId, setResolutionDivisionId] = useState<
    number | null
  >(null);
  const [resolutionWhereas1, setResolutionWhereas1] = useState("");
  const [resolutionWhereas2, setResolutionWhereas2] = useState("");
  const [resolutionWhereas3, setResolutionWhereas3] = useState("");
  const [resolutionNowTherefore, setResolutionNowTherefore] = useState(
    "to recommend to the Head of Procuring Entity the procurement of items through SVP method.",
  );
  const [resolutionLocation, setResolutionLocation] = useState(
    "HL Bldg. Carnation St, Triangulo Naga City",
  );
  const [resolutionSource, setResolutionSource] = useState<"manual" | "valid">(
    "valid",
  );
  const [resolutionPRRows, setResolutionPRRows] = useState<ResolutionPRRow[]>(
    [],
  );
  const [divisionPRPool, setDivisionPRPool] = useState<any[]>([]);
  const sessionRef = useRef<any>({ pr_no: pr.prNo });
  const [previewOpen, setPreviewOpen] = useState(false);

  const [assignments, setAssignments] = useState<CanvasserAssignmentRow[]>([]);
  const [canvassEntries, setCanvassEntries] = useState<CanvassEntryRow[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [rfqReviewOpen, setRfqReviewOpen] = useState(false);
  const [selectedReturnId, setSelectedReturnId] = useState<number | null>(null);
  const [expandedRFQs, setExpandedRFQs] = useState<Set<number>>(new Set());
  const [standaloneResOpen, setStandaloneResOpen] = useState(false);
  const [collectedRFQ, setCollectedRFQ] = useState<CanvassPreviewData | null>(
    null,
  );
  const [prExpanded, setPrExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [resolutionPreviewOpen, setResolutionPreviewOpen] = useState(false);
  const [collectionMode, setCollectionMode] = useState<"encode" | "skip">(
    "encode",
  );
  const [rfqSaving, setRfqSaving] = useState(false);
  const [linkedResolution, setLinkedResolution] = useState<any | null>(null);
  const [linkedResolutionLoading, setLinkedResolutionLoading] = useState(false);
  const [linkedResolutionHydrated, setLinkedResolutionHydrated] =
    useState(false);

  const [releaseModalOpen, setReleaseModalOpen] = useState(false);
  const [releaseTarget, setReleaseTarget] = useState<CanvassUserRow | null>(
    null,
  );
  const [rfqCount, setRfqCount] = useState("1");
  const [qPrefix, setQPrefix] = useState("");
  const [qStart, setQStart] = useState("");

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
        const { header, items } = await fetchPRWithItemsById(prId);
        const mappedItems = items.map((i) => ({
          id: parseInt(String(i.id)),
          desc: i.description,
          stock: i.stock_no,
          unit: i.unit,
          qty: i.quantity,
          unitCost: i.unit_price,
        }));
        setLiveItems(mappedItems);
        const divId =
          header?.division_id != null ? Number(header.division_id) : null;
        setResolutionDivisionId(
          Number.isFinite(divId as number) ? divId : null,
        );
        const defaultCost = mappedItems.reduce(
          (s, i) => s + i.qty * i.unitCost,
          0,
        );
        setResolutionPRRows([
          {
            key: `pr-${pr.prNo}`,
            prId: Number(prId),
            prNo: pr.prNo,
            date: header?.created_at
              ? new Date(header.created_at).toLocaleDateString("en-PH")
              : new Date().toLocaleDateString("en-PH"),
            estimatedCost: defaultCost.toFixed(2),
            endUser: header?.office_section ?? "",
            procMode: header?.status ?? "SVP/Canvass",
          },
        ]);
        const pool = await fetchCanvassablePRs();
        setDivisionPRPool(pool ?? []);
        setResolutionWhereas1(
          (prev) =>
            prev ||
            `${header?.office_section || "Requesting division"} has requested procurement for ${header?.purpose || "the stated requirements"}.`,
        );
        setResolutionWhereas2(
          (prev) =>
            prev ||
            `Funds for the requested procurement are certified available and approved by the Head of Procuring Entity.`,
        );
        setResolutionWhereas3(
          (prev) =>
            prev ||
            `The BAC evaluated the request and recommends procurement through the selected mode.`,
        );

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
                address: (e as any).supplier_address ?? "",
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
      } catch {}
    })();
  }, [pr.prNo]);

  useEffect(() => {
    if (!prId) return;
    if (stage !== "bac_resolution") return;
    setLinkedResolutionLoading(true);
    fetchBACResolutionForPR(prId)
      .then((res) => {
        setLinkedResolution(res ?? null);
        if (!res) return;
        if (linkedResolutionHydrated) return;

        setResNo(res.resolution_no ?? "");
        setMode(res.mode ?? PROC_MODES[0]);
        setResolutionLocation(
          res.resolved_at_place ?? "HL Bldg. Carnation St, Triangulo Naga City",
        );
        setResolutionWhereas1(res.whereas_1 ?? "");
        setResolutionWhereas2(res.whereas_2 ?? "");
        setResolutionWhereas3(res.whereas_3 ?? "");
        setResolutionNowTherefore(
          res.now_therefore_text ??
            "to recommend to the Head of Procuring Entity the procurement of items through SVP method.",
        );
        setResolutionDivisionId(
          res.division_id != null ? Number(res.division_id) : null,
        );
        setResolutionPRRows(
          (res.bac_resolution_prs ?? []).map((p: any) => ({
            key: `respr-${p.id ?? `${p.pr_no}-${Date.now()}`}`,
            prId: p.pr_id != null ? Number(p.pr_id) : null,
            prNo: String(p.pr_no ?? ""),
            date: String(p.pr_date ?? ""),
            estimatedCost: String(p.estimated_cost ?? ""),
            endUser: String(p.end_user ?? ""),
            procMode: String(p.recommended_mode ?? res.mode ?? ""),
          })),
        );
        setLinkedResolutionHydrated(true);
      })
      .catch(() => {})
      .finally(() => setLinkedResolutionLoading(false));
  }, [prId, stage, linkedResolutionHydrated]);

  // ── Step Handlers ──────────────────────────────────────────────────────────

  const handleStep6 = useCallback(async () => {
    try {
      const prId = await fetchPRIdByNo(pr.prNo);
      if (!prId) throw new Error("PR not found");
      const session = await ensureCanvassSession(prId);
      setSessionId(session.id);
      await updateCanvassStage(session.id, "bac_resolution");
      await updatePRStatus(prId, 7); // status_id 7 = BAC Resolution
      advance("pr_received");
    } catch (e: any) {
      Alert.alert(
        "Save failed",
        e?.message ?? "Could not create canvass session",
      );
    }
  }, [pr.prNo, advance]);

  const handleStep8 = useCallback(async () => {
    if (!sessionId) return;
    try {
      const prId = await fetchPRIdByNo(pr.prNo);
      if (!prId) throw new Error("PR not found");
      const asgns = await fetchAssignmentsForSession(sessionId);
      if (!asgns.length) {
        Alert.alert(
          "No RFQs released",
          "Release at least one RFQ (with a Quotation No.) before proceeding.",
        );
        return;
      }
      await updatePRStatus(prId, 9);
      await updateCanvassStage(sessionId, "collect_canvass");
      fetchAssignmentsForSession(sessionId)
        .then(setAssignments)
        .catch(() => {});
      advance("release_canvass");
    } catch (e: any) {
      Alert.alert(
        "Release failed",
        e?.message ?? "Could not proceed to collection",
      );
    }
  }, [sessionId, pr.prNo, advance]);

  const handleStep9 = useCallback(async () => {
    if (!sessionId) return;
    try {
      const prId = await fetchPRIdByNo(pr.prNo);
      if (!prId) throw new Error("PR not found");
      if (collectionMode === "encode") {
        if (selectedReturnId == null) {
          throw new Error(
            "Select an RFQ return to attach the encoded quotes to.",
          );
        }
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
                supplier_address: sp.address || null,
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
        await replaceSupplierQuotesForSubmission(
          sessionId,
          Number(selectedReturnId),
          quotes,
        );
      }
      await updatePRStatus(prId, 10);
      await updateCanvassStage(sessionId, "aaa_preparation");
      fetchQuotesForSession(sessionId)
        .then(setCanvassEntries)
        .catch(() => {});
      advance("collect_canvass");
      onComplete?.({
        pr_no: pr.prNo,
        resolution_no: resNo,
        mode,
        stage: "aaa_preparation",
      });
    } catch (e: any) {
      Alert.alert(
        "Quotes failed",
        e?.message ?? "Could not save supplier quotations",
      );
    }
  }, [
    sessionId,
    pr.prNo,
    supps,
    liveItems,
    advance,
    onComplete,
    resNo,
    mode,
    collectionMode,
    selectedReturnId,
  ]);

  const handleStep7 = useCallback(async () => {
    if (!sessionId || !resNo) return;
    try {
      const prId = await fetchPRIdByNo(pr.prNo);
      if (!prId) throw new Error("PR not found");
      const cleanRows = resolutionPRRows
        .map((r) => ({
          ...r,
          prNo: r.prNo.trim(),
          endUser: r.endUser.trim(),
          procMode: r.procMode.trim(),
          date: r.date.trim(),
          estimatedCost: r.estimatedCost.trim(),
        }))
        .filter((r) => r.prNo && r.endUser && r.procMode);
      if (cleanRows.length === 0)
        throw new Error("Add at least one PR row for this resolution.");

      const hasCurrentPR = cleanRows.some((r) => r.prNo === pr.prNo);
      const ensuredRows = hasCurrentPR
        ? cleanRows
        : [
            ...cleanRows,
            {
              key: `pr-${pr.prNo}`,
              prId: Number(prId),
              prNo: pr.prNo,
              date: new Date().toLocaleDateString("en-PH"),
              estimatedCost: liveItems
                .reduce((s, i) => s + i.qty * i.unitCost, 0)
                .toFixed(2),
              endUser:
                resolutionPRRows.find((r) => r.prNo === pr.prNo)?.endUser ?? "",
              procMode: mode,
            },
          ];

      const linkedRows: {
        pr_id?: number | null;
        pr_no: string;
        pr_date?: string | null;
        estimated_cost?: number | null;
        end_user?: string | null;
        recommended_mode?: string | null;
      }[] = [];
      for (const row of ensuredRows) {
        let linkedPrId: number | null = row.prId ?? null;
        if (!linkedPrId) {
          const { data } = await supabase
            .from("purchase_requests")
            .select("id, division_id")
            .eq("pr_no", row.prNo)
            .maybeSingle();
          if (!data)
            throw new Error(`PR ${row.prNo} not found. Use a valid PR number.`);
          if (
            resolutionDivisionId != null &&
            Number(data.division_id) !== Number(resolutionDivisionId)
          ) {
            throw new Error(
              `PR ${row.prNo} belongs to a different division and cannot be linked.`,
            );
          }
          linkedPrId = Number(data.id);
        }
        linkedRows.push({
          pr_id: linkedPrId,
          pr_no: row.prNo,
          pr_date: row.date || null,
          estimated_cost: Number(row.estimatedCost || "0") || 0,
          end_user: row.endUser || null,
          recommended_mode: row.procMode || null,
        });
      }

      sessionRef.current.resolution_no = resNo;
      sessionRef.current.mode = mode;
      const core = {
        resolution_no: resNo,
        prepared_by: currentUser?.id ?? 0,
        division_id: resolutionDivisionId ?? null,
        mode,
        resolved_at: new Date().toISOString(),
        resolved_at_place: resolutionLocation,
        whereas_1: resolutionWhereas1,
        whereas_2: resolutionWhereas2,
        whereas_3: resolutionWhereas3,
        now_therefore_text: resolutionNowTherefore,
        notes: null,
        prs: linkedRows,
      };

      if (linkedResolution?.id != null) {
        await updateBACResolutionById(Number(linkedResolution.id), core);
      } else {
        await insertBACResolution(sessionId, core);
      }
      // BAC Resolution now happens before RFQ release.
      await updatePRStatus(prId, 8);
      await updateCanvassStage(sessionId, "release_canvass");
      advance("bac_resolution");
    } catch (e: any) {
      Alert.alert(
        "Resolution failed",
        e?.message ?? "Could not record BAC resolution",
      );
    }
  }, [
    sessionId,
    pr.prNo,
    resNo,
    mode,
    currentUser?.id,
    advance,
    resolutionPRRows,
    resolutionDivisionId,
    resolutionLocation,
    resolutionWhereas1,
    resolutionWhereas2,
    resolutionWhereas3,
    resolutionNowTherefore,
    linkedResolution?.id,
    liveItems,
  ]);

  const allSigned = true;
  const userById = React.useMemo(
    () => Object.fromEntries(canvassUsers.map((u) => [u.id, u])),
    [canvassUsers],
  );

  useEffect(() => {
    if (stage !== "collect_canvass") return;
    if (collectionMode !== "encode") return;
    if (selectedReturnId != null) return;
    const returned = assignments.filter((a) => a.status === "returned");
    if (returned.length === 0) return;
    setSelectedReturnId(Number(returned[0].id));
  }, [stage, collectionMode, selectedReturnId, assignments]);

  const hasAssignmentId = React.useMemo(
    () => canvassEntries.some((e: any) => e.assignment_id !== undefined),
    [canvassEntries],
  );

  const prItemIdSet = React.useMemo(
    () => new Set(liveItems.map((i) => i.id)),
    [liveItems],
  );

  const entriesForAssignment = React.useCallback(
    (assignmentId: number) => {
      const filtered = canvassEntries.filter((e) => prItemIdSet.has(e.item_no));
      if (!hasAssignmentId) return filtered;
      return filtered.filter(
        (e: any) => Number(e.assignment_id) === Number(assignmentId),
      );
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
          address: (e as any).supplier_address ?? "",
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
        quotationNo: (a as any).quotation_no ?? "—",
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
    [pr, members, liveItems, userById],
  );

  const applyReturnAsBase = React.useCallback(
    async (assignmentId: number) => {
      if (!sessionId) return;
      const src = entriesForAssignment(assignmentId);
      const payload = src
        .map((e) => ({
          item_no: e.item_no,
          description: e.description,
          unit: e.unit,
          quantity: e.quantity,
          supplier_name: e.supplier_name,
          supplier_address: (e as any).supplier_address ?? null,
          tin_no: (e as any).tin_no ?? null,
          delivery_days: (e as any).delivery_days ?? null,
          unit_price: e.unit_price,
          total_price: e.total_price,
          is_winning: e.is_winning ?? null,
        }))
        .filter((e) => (Number(e.unit_price) || 0) > 0);

      setSelectedReturnId(assignmentId);
      await replaceSupplierQuotesForSubmission(sessionId, null, payload);
      const encoded = await fetchQuotesForSubmission(sessionId, null);
      setSupps(rebuildSuppsFromQuotes(encoded));
      setCanvassEntries(await fetchQuotesForSession(sessionId));
    },
    [sessionId, entriesForAssignment, rebuildSuppsFromQuotes],
  );

  const loadReturnForEditing = React.useCallback(
    (assignmentId: number) => {
      const src = entriesForAssignment(assignmentId);
      setSelectedReturnId(assignmentId);
      setCollectionMode("encode");
      setSupps(rebuildSuppsFromQuotes(src as any));
    },
    [entriesForAssignment, rebuildSuppsFromQuotes],
  );

  const buildQuotesFromInputs = React.useCallback(() => {
    const quotes: any[] = [];
    supps.forEach((sp) => {
      const supplierName = sp.name.trim();
      if (!supplierName) return;
      liveItems.forEach((item) => {
        const raw = String(sp.prices[item.id] ?? "").trim();
        const up = raw ? parseFloat(raw.replace(/,/g, "")) || 0 : 0;
        if (up <= 0) return;
        quotes.push({
          item_no: item.id,
          description: item.desc,
          unit: item.unit,
          quantity: item.qty,
          supplier_name: supplierName,
          supplier_address: sp.address.trim() || null,
          tin_no: sp.tin.trim() || null,
          delivery_days: sp.days.trim() || null,
          unit_price: up,
          total_price: up * item.qty,
          is_winning: null,
        });
      });
    });
    return quotes;
  }, [supps, liveItems]);

  const saveSelectedReturnRFQ = React.useCallback(async () => {
    if (!sessionId) return;
    if (selectedReturnId == null) {
      Alert.alert(
        "Select an RFQ return",
        "Choose a returned RFQ to save into.",
      );
      return;
    }
    const quotes = buildQuotesFromInputs();
    setRfqSaving(true);
    try {
      await replaceSupplierQuotesForSubmission(
        sessionId,
        Number(selectedReturnId),
        quotes,
      );
      const nextEntries = await fetchQuotesForSession(sessionId);
      setCanvassEntries(nextEntries);
      Alert.alert("Saved", "RFQ return details saved.");
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? "Could not save RFQ return.");
    } finally {
      setRfqSaving(false);
    }
  }, [sessionId, selectedReturnId, buildQuotesFromInputs]);

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

    let bestId: number | null = null;
    let bestTotal = Number.POSITIVE_INFINITY;
    returned.forEach((a) => {
      const aid = Number(a.id);
      const ent = entriesForAssignment(aid);
      const total = ent.reduce((sum, e) => sum + (e.total_price || 0), 0);
      if (ent.length > 0 && total < bestTotal) {
        bestTotal = total;
        bestId = aid;
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

  useEffect(() => {
    if (!sessionId) return;
    if (selectedReturnId != null) return;
    if (!hasAssignmentId) return;
    const returned = assignments.filter((a) => a.status === "returned");
    if (returned.length === 0) return;
    const encoded = canvassEntries.filter(
      (e: any) =>
        prItemIdSet.has(e.item_no) &&
        (e.assignment_id === null || e.assignment_id === undefined),
    );
    if (encoded.length === 0) return;

    const sig = new Set(
      encoded.map(
        (e: any) =>
          `${e.item_no}|${String(e.supplier_name)}|${Number(e.unit_price)}`,
      ),
    );

    let best: number | null = null;
    let bestScore = -1;
    returned.forEach((a) => {
      const aid = Number(a.id);
      const ent = entriesForAssignment(aid);
      let score = 0;
      ent.forEach((e: any) => {
        if (
          sig.has(
            `${e.item_no}|${String(e.supplier_name)}|${Number(e.unit_price)}`,
          )
        )
          score++;
      });
      if (score > bestScore) {
        bestScore = score;
        best = aid;
      }
    });

    if (best != null && bestScore > 0) setSelectedReturnId(best);
  }, [
    sessionId,
    selectedReturnId,
    hasAssignmentId,
    assignments,
    canvassEntries,
    prItemIdSet,
    entriesForAssignment,
  ]);

  const buildPreviewData = (): CanvassPreviewData => {
    const deadlineDate = new Date();
    deadlineDate.setDate(deadlineDate.getDate() + 7);
    return {
      prNo: pr.prNo,
      quotationNo: "—",
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
      canvasserNames: assignments
        .map((a) =>
          a.canvasser_id ? userById[a.canvasser_id]?.username : null,
        )
        .filter(Boolean) as string[],
    };
  };

  const openReleaseModal = useCallback(
    (u: CanvassUserRow) => {
      if (!sessionId) {
        Alert.alert("Not ready", "Session not initialized yet.");
        return;
      }
      if (!u.division_id) {
        Alert.alert("Missing division", "This canvasser has no division set.");
        return;
      }
      setReleaseTarget(u);
      setRfqCount("1");
      setQPrefix("");
      setQStart("");
      setReleaseModalOpen(true);
    },
    [sessionId],
  );

  const confirmReleaseRFQs = useCallback(async () => {
    if (!sessionId || !releaseTarget?.division_id) return;
    const count = Math.max(0, parseInt(rfqCount || "0", 10) || 0);
    if (count <= 0) {
      Alert.alert("Invalid count", "Enter how many RFQs to release.");
      return;
    }
    const startNum = parseInt(qStart || "0", 10);
    if (!qPrefix.trim() || !Number.isFinite(startNum) || startNum <= 0) {
      Alert.alert(
        "Quotation numbers required",
        "Provide a prefix and a starting number to generate Quotation Nos.",
      );
      return;
    }

    try {
      const now = new Date().toISOString();
      const existing = await fetchAssignmentsForSession(sessionId);
      const maxIdx = existing
        .filter(
          (a: any) =>
            Number(a.division_id) === Number(releaseTarget.division_id) &&
            (releaseTarget.id
              ? Number(a.canvasser_id) === Number(releaseTarget.id)
              : true),
        )
        .reduce((m, a: any) => Math.max(m, Number(a.rfq_index ?? 0) || 0), 0);

      const rows = Array.from({ length: count }).map((_, i) => ({
        division_id: releaseTarget.division_id!,
        canvasser_id: releaseTarget.id,
        released_at: now,
        rfq_index: maxIdx + i + 1,
        quotation_no: `${qPrefix.trim()}${startNum + i}`,
      }));

      await insertAssignmentsForDivisions(sessionId, rows);
      setReleaseModalOpen(false);
      setReleaseTarget(null);

      const fresh = await fetchAssignmentsForSession(sessionId);
      setAssignments(fresh as any);
    } catch (e: any) {
      Alert.alert(
        "Release failed",
        e?.message ?? "Could not release RFQs for this canvasser.",
      );
    }
  }, [sessionId, releaseTarget, rfqCount, qPrefix, qStart]);

  const buildResolutionData = (): BACResolutionData => {
    const chairperson =
      members.find((m) => m.designation.includes("Chairperson"))?.name ??
      "BAC Chairperson";
    const viceChair =
      members.find((m) => m.designation.includes("Vice"))?.name ?? "";
    const bacMems = members.filter((m) => m.designation === "BAC Member");
    const approver =
      members.find((m) => m.designation.includes("PARPO"))?.name ?? "PARPO II";
    return {
      resolutionNo: resNo || "—",
      resolvedDate: new Date().toLocaleDateString("en-PH", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
      location:
        resolutionLocation || "HL Bldg. Carnation St. Triangulo Naga City",
      prEntries:
        resolutionPRRows.length > 0
          ? resolutionPRRows.map((r) => ({
              prNo: r.prNo,
              date: r.date,
              estimatedCost: (
                Number(r.estimatedCost || "0") || 0
              ).toLocaleString("en-PH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }),
              endUser: r.endUser,
              procMode: r.procMode,
            }))
          : [
              {
                prNo: pr.prNo,
                date: pr.date,
                estimatedCost: (
                  liveItems.reduce((s, i) => s + i.qty * i.unitCost, 0) || 0
                ).toLocaleString("en-PH", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }),
                endUser: pr.officeSection,
                procMode: mode,
              },
            ],
      whereas1: resolutionWhereas1,
      whereas2: resolutionWhereas2,
      whereas3: resolutionWhereas3,
      nowThereforeText: resolutionNowTherefore,
      provincialOffice: "DARPO-CAMARINES SUR I",
      bacChairperson: chairperson,
      bacViceChairperson: viceChair,
      bacMembers: bacMems.slice(0, 2).map((m) => ({ name: m.name, title: m.designation })),
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
      const [{ header, items }, quotes, asgns] = await Promise.all([
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
      const divId =
        header?.division_id != null ? Number(header.division_id) : null;
      setResolutionDivisionId(Number.isFinite(divId as number) ? divId : null);
      setDivisionPRPool(await fetchCanvassablePRs());
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
          <View className="items-end gap-2">
            <View className="bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-300">
              <View className="flex-row items-center gap-1">
                <MaterialIcons name="schedule" size={14} color="#92400e" />
                <Text className="text-[10.5px] font-bold text-amber-800">
                  7-day window
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setStandaloneResOpen(true)}
              activeOpacity={0.85}
              className="flex-row items-center gap-1.5 bg-white/10 px-2.5 py-1.5 rounded-lg border border-white/15"
            >
              <MaterialIcons name="gavel" size={13} color="#ffffff" />
              <Text className="text-[10.5px] font-bold text-white/90">
                Open Standalone BAC Resolution
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <StageStrip current={stage} completed={done} onNavigate={goToStage} />
      </View>

      <Modal
        visible={standaloneResOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setStandaloneResOpen(false)}
      >
        <View className="flex-1 bg-gray-50">
          <View className="bg-white border-b border-gray-100 px-4 pt-4 pb-3">
            <View className="flex-row items-center justify-between">
              <TouchableOpacity
                onPress={() => setStandaloneResOpen(false)}
                activeOpacity={0.8}
                className="w-9 h-9 rounded-xl bg-gray-100 items-center justify-center"
              >
                <MaterialIcons name="close" size={18} color="#6b7280" />
              </TouchableOpacity>
              <View className="items-center flex-1 px-3">
                <Text className="text-[11px] text-gray-400 font-semibold">
                  Standalone
                </Text>
                <Text className="text-[13px] font-extrabold text-gray-900">
                  BAC Resolution
                </Text>
              </View>
              <View style={{ width: 36 }} />
            </View>
          </View>

          <BACResolutionModule
            currentUserId={currentUser?.id ?? null}
            divisionId={
              resolutionDivisionId ?? currentUser?.division_id ?? null
            }
          />
        </View>
      </Modal>

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
                    const roleLabel =
                      user.role_id === 7 ? "Canvasser" : "End User";
                    const roleBg =
                      user.role_id === 7 ? "bg-violet-100" : "bg-blue-100";
                    const roleText =
                      user.role_id === 7 ? "text-violet-800" : "text-blue-800";
                    return (
                      <View
                        key={user.id}
                        className="flex-row items-center justify-between p-2.5 mb-1.5 rounded-2xl border bg-white border-gray-200"
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
                        {user.role_id === 7 ? (
                          <TouchableOpacity
                            onPress={() => openReleaseModal(user)}
                            activeOpacity={0.8}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600"
                          >
                            <Text className="text-[11px] font-bold text-white">
                              Release RFQs
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <View className="px-2.5 py-1 rounded-lg bg-gray-100 border border-gray-200">
                            <Text className="text-[11px] font-bold text-gray-400">
                              —
                            </Text>
                          </View>
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
                      const aid = Number(a.id);
                      const user = a.canvasser_id
                        ? userById[a.canvasser_id]
                        : undefined;
                      const divName =
                        user?.division_name ?? `Division ${a.division_id}`;
                      const canvasserName = user?.username ?? "—";
                      const ent = entriesForAssignment(aid);
                      const totalQuoted = ent.reduce(
                        (s, e) => s + (e.total_price || 0),
                        0,
                      );
                      const expanded = expandedRFQs.has(aid);
                      const active = selectedReturnId === aid;
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
                                if (n.has(aid)) n.delete(aid);
                                else n.add(aid);
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
                                onPress={() => loadReturnForEditing(aid)}
                                activeOpacity={0.85}
                                className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50"
                              >
                                <MaterialIcons
                                  name="edit"
                                  size={14}
                                  color="#065f46"
                                />
                                <Text className="text-[11.5px] font-bold text-emerald-700">
                                  Encode
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => applyReturnAsBase(Number(a.id))}
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
                <Divider label="Collection Action" />
                <View className="flex-row gap-2 mb-3">
                  <TouchableOpacity
                    onPress={() => setCollectionMode("encode")}
                    activeOpacity={0.85}
                    className={`px-3 py-2 rounded-xl border ${collectionMode === "encode" ? "bg-emerald-50 border-emerald-300" : "bg-white border-gray-200"}`}
                  >
                    <Text
                      className={`text-[11px] font-bold ${collectionMode === "encode" ? "text-emerald-700" : "text-gray-500"}`}
                    >
                      Encode Returned RFQ Details
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setCollectionMode("skip")}
                    activeOpacity={0.85}
                    className={`px-3 py-2 rounded-xl border ${collectionMode === "skip" ? "bg-amber-50 border-amber-300" : "bg-white border-gray-200"}`}
                  >
                    <Text
                      className={`text-[11px] font-bold ${collectionMode === "skip" ? "text-amber-700" : "text-gray-500"}`}
                    >
                      Skip Encoding · Proceed to Abstract of Awards
                    </Text>
                  </TouchableOpacity>
                </View>
                {collectionMode === "skip" && (
                  <View className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-2">
                    <Text className="text-[11.5px] font-semibold text-amber-800">
                      Encoding is skipped.
                    </Text>
                    <Text className="text-[10.5px] text-amber-700 mt-0.5">
                      Submit to continue to Abstract of Awards using currently
                      available RFQ return data.
                    </Text>
                  </View>
                )}
                <View className="flex-row items-center justify-between gap-3 mb-1">
                  <Divider label="Supplier Quotations" />
                  {selectedReturnId != null && (
                    <TouchableOpacity
                      onPress={() => {
                        const a = assignments.find(
                          (x) => Number(x.id) === Number(selectedReturnId),
                        );
                        if (!a) return;
                        const ent = entriesForAssignment(Number(a.id));
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
                {collectionMode === "encode" && (
                  <View className="flex-row items-center gap-2 mb-3">
                    <TouchableOpacity
                      onPress={() => void saveSelectedReturnRFQ()}
                      activeOpacity={0.85}
                      disabled={rfqSaving || selectedReturnId == null}
                      className={`flex-row items-center gap-1.5 px-3 py-2 rounded-xl ${
                        rfqSaving || selectedReturnId == null
                          ? "bg-gray-200"
                          : "bg-[#064E3B]"
                      }`}
                    >
                      <MaterialIcons
                        name="save"
                        size={14}
                        color={
                          rfqSaving || selectedReturnId == null
                            ? "#6b7280"
                            : "#ffffff"
                        }
                      />
                      <Text
                        className={`text-[11.5px] font-bold ${
                          rfqSaving || selectedReturnId == null
                            ? "text-gray-500"
                            : "text-white"
                        }`}
                      >
                        {rfqSaving ? "Saving…" : "Save RFQ Return"}
                      </Text>
                    </TouchableOpacity>
                    {selectedReturnId == null && (
                      <Text className="text-[10.5px] text-gray-400 flex-1">
                        Select a returned RFQ above to save into.
                      </Text>
                    )}
                  </View>
                )}
                {collectionMode === "encode" &&
                  supps.map((sp, sIdx) => (
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
                            <Field label="Address">
                              <Input
                                value={sp.address}
                                placeholder="Supplier address"
                                onChange={(v) =>
                                  setSupps((s) =>
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
                {collectionMode === "encode" && (
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
                )}
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
              submitLabel={
                collectionMode === "encode"
                  ? "Encoded · AAA Preparation"
                  : "Proceed · AAA Preparation"
              }
              onSubmit={handleStep9}
            />
          </View>
        )}

        {/* ── Step 9: BAC Resolution ── */}
        {stage === "bac_resolution" && (
          <View>
            <Card>
              <View className="px-4 pt-3 pb-2">
                {linkedResolutionLoading ? (
                  <View className="bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2 mb-3">
                    <Text className="text-[11.5px] font-semibold text-gray-600">
                      Checking linked BAC Resolution…
                    </Text>
                  </View>
                ) : linkedResolution ? (
                  <View className="bg-emerald-50 border border-emerald-200 rounded-2xl px-3 py-2 mb-3">
                    <View className="flex-row items-center justify-between gap-3">
                      <View className="flex-1">
                        <Text className="text-[11.5px] font-bold text-emerald-800">
                          Linked BAC Resolution found
                        </Text>
                        <Text className="text-[10.5px] text-emerald-700 mt-0.5">
                          Resolution No. {linkedResolution.resolution_no ?? "—"}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setResolutionPreviewOpen(true)}
                        activeOpacity={0.85}
                        className="px-3 py-2 rounded-xl bg-[#064E3B]"
                      >
                        <Text className="text-[11px] font-bold text-white">
                          Preview
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <Text className="text-[10.5px] text-emerald-700 mt-2">
                      Review the values below and adjust if needed, then submit
                      to proceed.
                    </Text>
                  </View>
                ) : (
                  <View className="bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2 mb-3">
                    <Text className="text-[11.5px] font-bold text-amber-800">
                      No linked BAC Resolution yet
                    </Text>
                    <Text className="text-[10.5px] text-amber-700 mt-0.5">
                      Create a BAC Resolution below to connect this PR and
                      proceed to RFQ release.
                    </Text>
                  </View>
                )}
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
                    <Field label="Resolved At" required>
                      <Input
                        value={resolutionLocation}
                        onChange={setResolutionLocation}
                        placeholder="Location of resolution signing"
                      />
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
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => setResolutionSource("valid")}
                    activeOpacity={0.85}
                    className={`px-3 py-2 rounded-xl border ${resolutionSource === "valid" ? "bg-emerald-50 border-emerald-300" : "bg-white border-gray-200"}`}
                  >
                    <Text
                      className={`text-[11px] font-bold ${resolutionSource === "valid" ? "text-emerald-700" : "text-gray-500"}`}
                    >
                      Choose Valid PRs
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setResolutionSource("manual")}
                    activeOpacity={0.85}
                    className={`px-3 py-2 rounded-xl border ${resolutionSource === "manual" ? "bg-emerald-50 border-emerald-300" : "bg-white border-gray-200"}`}
                  >
                    <Text
                      className={`text-[11px] font-bold ${resolutionSource === "manual" ? "text-emerald-700" : "text-gray-500"}`}
                    >
                      Manual PR Entry
                    </Text>
                  </TouchableOpacity>
                </View>
                <View className="mt-3">
                  <Field label="WHEREAS #1" required>
                    <Input
                      value={resolutionWhereas1}
                      onChange={setResolutionWhereas1}
                    />
                  </Field>
                  <Field label="WHEREAS #2" required>
                    <Input
                      value={resolutionWhereas2}
                      onChange={setResolutionWhereas2}
                    />
                  </Field>
                  <Field label="WHEREAS #3" required>
                    <Input
                      value={resolutionWhereas3}
                      onChange={setResolutionWhereas3}
                    />
                  </Field>
                  <Field label="NOW THEREFORE / RESOLVED text" required>
                    <Input
                      value={resolutionNowTherefore}
                      onChange={setResolutionNowTherefore}
                    />
                  </Field>
                </View>
              </View>
            </Card>

            <Card>
              <View className="px-4 pt-3 pb-3">
                <Divider label="Resolution PR Table Entries" />
                {resolutionSource === "valid" && (
                  <View className="mb-2">
                    {divisionPRPool
                      .filter((p: any) => Number(p.status_id) > 8)
                      .slice(0, 20)
                      .map((p: any) => {
                        const exists = resolutionPRRows.some(
                          (r) => r.prNo === p.pr_no,
                        );
                        return (
                          <TouchableOpacity
                            key={p.id}
                            onPress={() =>
                              setResolutionPRRows((prev) => {
                                if (exists)
                                  return prev.filter((r) => r.prNo !== p.pr_no);
                                return [
                                  ...prev,
                                  {
                                    key: `pool-${p.id}`,
                                    prId: Number(p.id),
                                    prNo: p.pr_no,
                                    date: p.created_at
                                      ? new Date(
                                          p.created_at,
                                        ).toLocaleDateString("en-PH")
                                      : "",
                                    estimatedCost: String(p.total_cost ?? 0),
                                    endUser: p.office_section ?? "",
                                    procMode: mode,
                                  },
                                ];
                              })
                            }
                            className={`px-3 py-2 rounded-xl border mb-1 ${exists ? "bg-emerald-50 border-emerald-300" : "bg-white border-gray-200"}`}
                          >
                            <Text className="text-[11.5px] font-semibold text-gray-700">
                              {p.pr_no} · {p.office_section ?? "—"} · Status{" "}
                              {p.status_id}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                  </View>
                )}
                {resolutionPRRows.map((row) => (
                  <View
                    key={row.key}
                    className="border border-gray-200 rounded-xl p-2 mb-2"
                  >
                    <View className="flex-row gap-2.5">
                      <View className="flex-1">
                        <Field label="PR Number" required>
                          <Input
                            value={row.prNo}
                            onChange={(v) =>
                              setResolutionPRRows((prev) =>
                                prev.map((x) =>
                                  x.key === row.key ? { ...x, prNo: v } : x,
                                ),
                              )
                            }
                          />
                        </Field>
                      </View>
                      <View className="flex-1">
                        <Field label="Date" required>
                          <Input
                            value={row.date}
                            onChange={(v) =>
                              setResolutionPRRows((prev) =>
                                prev.map((x) =>
                                  x.key === row.key ? { ...x, date: v } : x,
                                ),
                              )
                            }
                          />
                        </Field>
                      </View>
                    </View>
                    <View className="flex-row gap-2.5">
                      <View className="flex-1">
                        <Field label="Estimated Cost (Php)" required>
                          <Input
                            value={row.estimatedCost}
                            onChange={(v) =>
                              setResolutionPRRows((prev) =>
                                prev.map((x) =>
                                  x.key === row.key
                                    ? { ...x, estimatedCost: v }
                                    : x,
                                ),
                              )
                            }
                            numeric
                          />
                        </Field>
                      </View>
                      <View className="flex-1">
                        <Field label="End User" required>
                          <Input
                            value={row.endUser}
                            onChange={(v) =>
                              setResolutionPRRows((prev) =>
                                prev.map((x) =>
                                  x.key === row.key ? { ...x, endUser: v } : x,
                                ),
                              )
                            }
                          />
                        </Field>
                      </View>
                    </View>
                    <Field label="Recommended Procurement Mode" required>
                      <Input
                        value={row.procMode}
                        onChange={(v) =>
                          setResolutionPRRows((prev) =>
                            prev.map((x) =>
                              x.key === row.key ? { ...x, procMode: v } : x,
                            ),
                          )
                        }
                      />
                    </Field>
                    <View className="items-end">
                      <TouchableOpacity
                        onPress={() =>
                          setResolutionPRRows((prev) =>
                            prev.filter((x) => x.key !== row.key),
                          )
                        }
                      >
                        <Text className="text-[11px] font-bold text-red-500">
                          Remove
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
                <TouchableOpacity
                  onPress={() =>
                    setResolutionPRRows((prev) => [
                      ...prev,
                      {
                        key: `manual-${Date.now()}-${prev.length}`,
                        prId: null,
                        prNo: "",
                        date: "",
                        estimatedCost: "",
                        endUser: "",
                        procMode: mode,
                      },
                    ])
                  }
                  activeOpacity={0.85}
                  className="px-3 py-2 rounded-xl border border-dashed border-gray-300"
                >
                  <Text className="text-[11.5px] font-bold text-gray-600 text-center">
                    + Add PR Row
                  </Text>
                </TouchableOpacity>
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
            ) : null}

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
              canSubmit={
                !isViewingCompleted &&
                allSigned &&
                !!resNo &&
                !!mode &&
                !!resolutionLocation &&
                !!resolutionWhereas1 &&
                !!resolutionWhereas2 &&
                !!resolutionWhereas3 &&
                !!resolutionNowTherefore &&
                resolutionPRRows.length > 0
              }
              submitLabel="Resolved · Release RFQs"
              onSubmit={handleStep7}
            />
          </View>
        )}

        {/* ── Step 10: AAA Preparation ── */}
        {stage === "aaa_preparation" && sessionId && (
          <AAAView
            sessionId={sessionId}
            pr={pr}
            resolutionNo={resNo}
            mode={mode}
            onComplete={onComplete}
            onBack={() => goToStage("bac_resolution")}
          />
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
        chairperson={
          members.find((m) => m.designation.includes("Chairperson"))?.name ??
          "BAC Chairperson"
        }
      />

      {/* ── Release RFQs Modal ── */}
      <Modal
        visible={releaseModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setReleaseModalOpen(false)}
      >
        <Pressable
          className="flex-1 bg-black/40"
          onPress={() => setReleaseModalOpen(false)}
        />
        <View className="absolute left-0 right-0 bottom-0 bg-white rounded-t-3xl overflow-hidden">
          <View className="px-5 pt-4 pb-3 border-b border-gray-100">
            <Text className="text-[13px] font-extrabold text-gray-900">
              Release RFQs
            </Text>
            <Text className="text-[11px] text-gray-500 mt-0.5">
              Assign Quotation Nos. before releasing to the canvasser.
            </Text>
          </View>
          <View className="px-5 pt-3 pb-4">
            <Field label="Canvasser">
              <Input value={releaseTarget?.username ?? "—"} readonly />
            </Field>
            <View className="flex-row gap-2.5">
              <View className="flex-1">
                <Field label="How many RFQs to release?" required>
                  <Input
                    value={rfqCount}
                    onChange={setRfqCount}
                    placeholder="e.g. 3"
                    numeric
                  />
                </Field>
              </View>
              <View className="flex-1">
                <Field label="Starting number" required>
                  <Input
                    value={qStart}
                    onChange={setQStart}
                    placeholder="e.g. 79"
                    numeric
                  />
                </Field>
              </View>
            </View>
            <Field label="Quotation No. prefix" required>
              <Input
                value={qPrefix}
                onChange={setQPrefix}
                placeholder="e.g. 2026-02-"
              />
            </Field>

            <View className="flex-row items-center justify-end gap-2 mt-2">
              <TouchableOpacity
                onPress={() => setReleaseModalOpen(false)}
                activeOpacity={0.8}
                className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white"
              >
                <Text className="text-[12px] font-bold text-gray-600">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmReleaseRFQs}
                activeOpacity={0.85}
                className="px-4 py-2.5 rounded-xl bg-[#064E3B]"
              >
                <Text className="text-[12px] font-bold text-white">
                  Release
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
