/**
 * BACView.tsx — BAC role (role_id 3) canvassing workflow, Steps 6–10.
 * All UI primitives inlined using NativeWind className — no ../ui dependency.
 */

import {
  ensureCanvassSession, fetchPRIdByNo, fetchPRWithItemsById,
  fetchUsersByRole,
  insertAAAForSession, insertAssignmentsForDivisions, insertBACResolution,
  insertSupplierQuotesForSession, updateCanvassSessionMeta, updateCanvassStage,
  type CanvassUserRow,
} from "@/lib/supabase";
import type {
  BACMember, CanvassStage, CanvassingPR, CanvassingPRItem, SupplierQ,
} from "@/types/canvassing";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert, KeyboardAvoidingView, Modal, Platform, ScrollView,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useAuth } from "../AuthContext";

// ─── Inlined constants ────────────────────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

const fmt = (n: number) =>
  n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const prTotal = (items: CanvassingPRItem[]) =>
  items.reduce((s, i) => s + i.qty * i.unitCost, 0);

type StageMeta = { step: number; label: string; icon: keyof typeof MaterialIcons.glyphMap };

const STAGE_ORDER: CanvassStage[] = [
  "pr_received", "release_canvass", "collect_canvass", "bac_resolution", "aaa_preparation",
];

const STAGE_META: Record<CanvassStage, StageMeta> = {
  pr_received:     { step: 6,  label: "PR Received", icon: "inbox"             },
  release_canvass: { step: 7,  label: "Release",      icon: "send"              },
  collect_canvass: { step: 8,  label: "Collect",      icon: "assignment-return" },
  bac_resolution:  { step: 9,  label: "Resolution",   icon: "gavel"             },
  aaa_preparation: { step: 10, label: "AAA",          icon: "emoji-events"      },
};

const PROC_MODES = [
  "Small Value Procurement (SVP)", "Competitive Bidding",
  "Direct Contracting", "Shopping", "Negotiated Procurement",
];

// Role IDs for users involved in the canvassing process (from DB roles table):
// role_id 6 = End User  (division representative who submitted the PR)
// role_id 7 = Canvasser (designated canvass collector per division)
const CANVASS_ROLE_IDS = [6, 7];

// ─── Inlined UI atoms (NativeWind className) ──────────────────────────────────

const Divider = ({ label }: { label: string }) => (
  <View className="flex-row items-center gap-2 mb-2.5 mt-1">
    <Text className="text-[9.5px] font-bold tracking-widest uppercase text-gray-400">{label}</Text>
    <View className="flex-1 h-px bg-gray-200" />
  </View>
);

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <View className={`bg-white rounded-3xl border border-gray-200 mb-3 overflow-hidden ${className ?? ""}`}
    style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.07, shadowRadius: 6, elevation: 3 }}>
    {children}
  </View>
);

const Field = ({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode;
}) => (
  <View className="mb-3">
    <View className="flex-row items-center gap-1 mb-1">
      <Text className="text-[12px] font-semibold text-gray-700">{label}</Text>
      {required && <Text className="text-[12px] font-bold text-red-500">*</Text>}
    </View>
    {children}
  </View>
);

const Input = ({ value, onChange, placeholder, readonly, numeric }: {
  value: string; onChange?: (v: string) => void; placeholder?: string;
  readonly?: boolean; numeric?: boolean;
}) => {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value} onChangeText={onChange} placeholder={placeholder}
      placeholderTextColor="#9ca3af" editable={!readonly}
      keyboardType={numeric ? "decimal-pad" : "default"}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      className={`rounded-xl px-3 py-2.5 text-[13px] ${
        readonly ? "bg-gray-50 text-gray-400" : "bg-white text-gray-900"
      }`}
      style={{
        borderWidth: 1.5,
        borderColor: readonly ? "#e5e7eb" : focused ? "#10b981" : "#e5e7eb",
        fontFamily: readonly ? MONO : undefined,
      }}
    />
  );
};

const PickerField = ({ title, options, value, onSelect }: {
  title: string; options: string[]; value: string; onSelect: (v: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <TouchableOpacity onPress={() => setOpen(true)} activeOpacity={0.8}
        className="flex-row items-center justify-between bg-white rounded-xl px-3 py-2.5"
        style={{ borderWidth: 1.5, borderColor: "#e5e7eb" }}>
        <Text className={`text-[13px] flex-1 ${value ? "text-gray-900" : "text-gray-400"}`}>
          {value || "Select…"}
        </Text>
        <MaterialIcons name="keyboard-arrow-down" size={18} color="#6b7280" />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity className="flex-1 bg-black/50"
          activeOpacity={1} onPress={() => setOpen(false)} />
        <View className="bg-white rounded-t-3xl">
          <View className="items-center py-3">
            <View className="w-10 h-1 rounded-full bg-gray-300" />
          </View>
          <View className="flex-row justify-between items-center px-5 pb-3 border-b border-gray-100">
            <Text className="text-[15px] font-bold text-gray-900">{title}</Text>
            <TouchableOpacity onPress={() => setOpen(false)} hitSlop={8}>
              <Text className="text-[13px] font-semibold text-emerald-700">Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
            {options.map(opt => (
              <TouchableOpacity key={opt} onPress={() => { onSelect(opt); setOpen(false); }}
                activeOpacity={0.7}
                className={`flex-row justify-between items-center px-5 py-3.5 border-b border-gray-50 ${
                  opt === value ? "bg-emerald-50" : ""
                }`}>
                <Text className={`text-[14px] ${
                  opt === value ? "font-bold text-[#1a4d2e]" : "text-gray-700"
                }`}>{opt}</Text>
                {opt === value && <MaterialIcons name="check" size={16} color="#10b981" />}
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View className="h-6" />
        </View>
      </Modal>
    </View>
  );
};

const Banner = ({ type, text }: { type: "info" | "warning"; text: string }) => (
  <View className={`flex-row gap-2.5 rounded-xl p-3 mb-3 ${
    type === "info" ? "bg-emerald-50" : "bg-amber-50"
  }`} style={{ borderLeftWidth: 4, borderLeftColor: type === "info" ? "#10b981" : "#f59e0b" }}>
    <MaterialIcons name={type === "info" ? "info" : "warning"} size={16}
      color={type === "info" ? "#065f46" : "#92400e"} style={{ marginTop: 1 }} />
    <Text className={`flex-1 text-[12.5px] leading-5 ${
      type === "info" ? "text-emerald-900" : "text-amber-900"
    }`}>{text}</Text>
  </View>
);

const Btn = ({ label, onPress, disabled, ghost }: {
  label: string; onPress: () => void; disabled?: boolean; ghost?: boolean;
}) => (
  <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.8}
    className={`px-5 py-2.5 rounded-xl ${
      ghost ? "bg-transparent border border-gray-200" :
      disabled ? "bg-gray-300" : "bg-[#064E3B]"
    }`}>
    <Text className={`text-[13px] font-bold ${ghost ? "text-gray-400" : "text-white"}`}>
      {label}
    </Text>
  </TouchableOpacity>
);

const StageStrip = ({ current, completed, onNavigate }: {
  current: CanvassStage;
  completed: Set<CanvassStage>;
  onNavigate?: (stage: CanvassStage) => void;
}) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false}
    className="bg-[#064E3B]"
    contentContainerStyle={{ flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 4 }}>
    {STAGE_ORDER.map((s, i) => {
      const meta     = STAGE_META[s];
      const isDone   = completed.has(s);
      const active   = s === current;
      const tappable = isDone && !active && !!onNavigate;
      return (
        <React.Fragment key={s}>
          <TouchableOpacity
            onPress={tappable ? () => onNavigate!(s) : undefined}
            activeOpacity={tappable ? 0.65 : 1}
            className="items-center gap-1">
            <View className={`w-7 h-7 rounded-full items-center justify-center ${
              isDone ? "bg-[#52b788]" : active ? "bg-white" : "bg-white/15"
            }`}
              style={tappable ? { borderWidth: 1.5, borderColor: "#a7f3d0" } : undefined}>
              <MaterialIcons
                name={isDone ? (tappable ? "replay" : "check") : meta.icon} size={13}
                color={isDone ? "#1a4d2e" : active ? "#064E3B" : "rgba(255,255,255,0.4)"} />
            </View>
            <Text className="text-[9px] font-bold text-center" style={{ maxWidth: 54,
              color: active ? "#fff" : isDone ? "#52b788" : "rgba(255,255,255,0.35)" }}>
              {meta.label}
            </Text>
            {tappable && (
              <Text style={{ fontSize: 7, color: "rgba(167,243,208,0.7)", textAlign: "center", maxWidth: 54 }}>
                tap to edit
              </Text>
            )}
          </TouchableOpacity>
          {i < STAGE_ORDER.length - 1 && (
            <View className="w-5 h-px bg-white/15 self-center -mt-3" />
          )}
        </React.Fragment>
      );
    })}
  </ScrollView>
);

const StepBadge = ({ step }: { step: number }) => (
  <View className="bg-[#064E3B] rounded-xl px-3 py-2 items-center">
    <Text className="text-[22px] font-bold text-white" style={{ fontFamily: MONO, lineHeight: 26 }}>
      {String(step).padStart(2, "0")}
    </Text>
    <Text className="text-[8px] font-bold tracking-widest uppercase text-white/50 mt-0.5">STEP</Text>
  </View>
);

const StepHeader = ({ stage, title, desc }: {
  stage: CanvassStage; title: string; desc: string;
}) => (
  <View className="flex-row justify-between items-start mb-4">
    <View className="flex-1 pr-3">
      <Text className="text-[10.5px] font-bold tracking-wide uppercase text-emerald-600 mb-1">
        Stage 2 · Canvass & Resolution
      </Text>
      <Text className="text-[22px] font-extrabold text-[#1a4d2e] mb-1">{title}</Text>
      <Text className="text-[13px] text-gray-500 leading-5">{desc}</Text>
    </View>
    <StepBadge step={STAGE_META[stage].step} />
  </View>
);

const PRCard = ({ pr }: { pr: CanvassingPR }) => (
  <Card>
    <View className="bg-[#064E3B] px-4 pt-3.5 pb-3">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-2">
          <Text className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-1">
            Purchase Request
          </Text>
          <Text className="text-[16px] font-extrabold text-white" style={{ fontFamily: MONO }}>
            {pr.prNo}
          </Text>
          <Text className="text-[12px] text-white/70 mt-0.5">{pr.officeSection} · {pr.date}</Text>
        </View>
        <View className="items-end">
          <Text className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-1">
            Total
          </Text>
          <Text className="text-[15px] font-extrabold text-white" style={{ fontFamily: MONO }}>
            ₱{fmt(prTotal(pr.items))}
          </Text>
          <Text className="text-[11px] text-white/70 mt-0.5">
            {pr.items.length} item{pr.items.length !== 1 ? "s" : ""}
          </Text>
        </View>
      </View>
    </View>
  </Card>
);

const ItemsTable = ({ items }: { items: CanvassingPRItem[] }) => (
  <Card>
    <View className="px-4 pt-3 pb-2">
      <Divider label="Line Items" />
      <View className="rounded-xl overflow-hidden border border-gray-100">
        <View className="flex-row bg-[#064E3B] px-2.5 py-1.5">
          {["Description", "Unit", "Qty", "Unit Cost", "Total"].map((h, i) => (
            <Text key={h} className="text-[9.5px] font-bold uppercase tracking-wide text-white/70"
              style={{ flex: i === 0 ? 2 : 1, textAlign: i > 1 ? "right" : "left" }}>
              {h}
            </Text>
          ))}
        </View>
        {items.map((item, i) => (
          <View key={item.id}
            className={`flex-row px-2.5 py-2 ${i % 2 ? "bg-gray-50" : "bg-white"}`}
            style={{ borderTopWidth: 1, borderTopColor: "#f3f4f6" }}>
            <Text className="flex-[2] text-[12px] text-gray-700" numberOfLines={2}>{item.desc}</Text>
            <Text className="flex-1 text-[12px] text-gray-500">{item.unit}</Text>
            <Text className="flex-1 text-[12px] text-gray-700 text-right"
              style={{ fontFamily: MONO }}>{item.qty}</Text>
            <Text className="flex-1 text-[12px] text-gray-700 text-right"
              style={{ fontFamily: MONO }}>₱{fmt(item.unitCost)}</Text>
            <Text className="flex-1 text-[12px] font-semibold text-[#2d6a4f] text-right"
              style={{ fontFamily: MONO }}>₱{fmt(item.qty * item.unitCost)}</Text>
          </View>
        ))}
        <View className="flex-row px-2.5 py-2 bg-[#f0fdf4]"
          style={{ borderTopWidth: 1, borderTopColor: "#d1fae5" }}>
          <Text className="flex-[2] text-[11px] font-bold text-[#064E3B]">Total</Text>
          <Text className="flex-1 text-[11px] text-transparent">—</Text>
          <Text className="flex-1 text-[11px] text-transparent">—</Text>
          <Text className="flex-1 text-[11px] text-transparent">—</Text>
          <Text className="flex-1 text-[12px] font-bold text-[#064E3B] text-right"
            style={{ fontFamily: MONO }}>₱{fmt(prTotal(items))}</Text>
        </View>
      </View>
    </View>
  </Card>
);

// ─── Local state factories ────────────────────────────────────────────────────

const mkBACMembers = (): BACMember[] => [
  { name: "Yvonne M.", designation: "BAC Chairperson",  signed: false, signedAt: "" },
  { name: "Mariel T.", designation: "BAC Member",       signed: false, signedAt: "" },
  { name: "Robert A.", designation: "BAC Member",       signed: false, signedAt: "" },
  { name: "PARPO II",  designation: "PARPO / Approver", signed: false, signedAt: "" },
];

const mkSupplier = (id: number): SupplierQ => ({
  id, name: "", address: "", contact: "", tin: "", days: "", prices: {}, remarks: "",
});

// ─── Component ────────────────────────────────────────────────────────────────

export default function BACView({ pr, onComplete, onBack }: {
  pr: CanvassingPR; onComplete?: (payload: any) => void; onBack?: () => void;
}) {
  const { currentUser } = useAuth();

  const [stage,     setStage]     = useState<CanvassStage>("pr_received");
  const [done,      setDone]      = useState<Set<CanvassStage>>(new Set());
  const [members,   setMembers]   = useState<BACMember[]>(mkBACMembers);
  // canvassUsers: End Users (role 6) + Canvassers (role 7) from DB,
  // each with a local release/return status tracked in canvassStatuses
  const [canvassUsers,    setCanvassUsers]    = useState<CanvassUserRow[]>([]);
  const [canvassStatuses, setCanvassStatuses] = useState<
    Record<number, { status: "pending" | "released" | "returned"; releaseDate: string; returnDate: string }>
  >({});
  const [usersLoading, setUsersLoading] = useState(true);
  const [supps,     setSupps]     = useState<SupplierQ[]>([mkSupplier(1)]);
  const [liveItems, setLiveItems] = useState<CanvassingPRItem[]>(pr.items);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [bacNo,     setBacNo]     = useState("");
  const [resNo,     setResNo]     = useState("");
  const [mode,      setMode]      = useState(PROC_MODES[0]);
  const [aaaNo,     setAaaNo]     = useState("");
  const sessionRef = useRef<any>({ pr_no: pr.prNo });

  // ── Back-navigation: jump to any previously completed stage ──────────────
  const goToStage = useCallback((target: CanvassStage) => {
    Alert.alert(
      "Go back to this stage?",
      `Return to "${STAGE_META[target].label}"? You can re-submit from there.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Go Back",
          onPress: () => {
            // Remove the target and all stages after it from completed set
            const targetIdx = STAGE_ORDER.indexOf(target);
            setDone(prev => {
              const next = new Set(prev);
              STAGE_ORDER.forEach((s, i) => { if (i >= targetIdx) next.delete(s); });
              return next;
            });
            setStage(target);
          },
        },
      ]
    );
  }, []);

  const advance = useCallback((current: CanvassStage) => {
    setDone(s => new Set([...s, current]));
    const idx = STAGE_ORDER.indexOf(current);
    if (idx < STAGE_ORDER.length - 1) setStage(STAGE_ORDER[idx + 1]);
  }, []);

  // ── Load canvass users (End Users + Canvassers) from DB ──────────────────
  useEffect(() => {
    setUsersLoading(true);
    fetchUsersByRole(CANVASS_ROLE_IDS)
      .then(users => {
        setCanvassUsers(users);
        // Seed statuses map: one entry per user id
        setCanvassStatuses(
          Object.fromEntries(
            users.map(u => [u.id, { status: "pending" as const, releaseDate: "", returnDate: "" }])
          )
        );
      })
      .catch(() => {}) // silently fall back to empty list
      .finally(() => setUsersLoading(false));
  }, []);

  // ── Load existing session on mount ───────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const prId = await fetchPRIdByNo(pr.prNo);
        if (!prId) return;
        const session = await ensureCanvassSession(prId);
        setSessionId(session.id);
        setStage((session.stage as CanvassStage) || "pr_received");
        const { items } = await fetchPRWithItemsById(prId);
        setLiveItems(items.map(i => ({
          id: parseInt(String(i.id)), desc: i.description,
          stock: i.stock_no, unit: i.unit, qty: i.quantity, unitCost: i.unit_price,
        })));
      } catch {}
    })();
  }, [pr.prNo]);

  // ── Step handlers ─────────────────────────────────────────────────────────

  const handleStep6 = useCallback(async () => {
    try {
      const prId = await fetchPRIdByNo(pr.prNo);
      if (!prId) throw new Error("PR not found");
      const session = await ensureCanvassSession(prId, { bac_no: bacNo });
      setSessionId(session.id);
      await updateCanvassSessionMeta(session.id, { bac_no: bacNo });
      await updateCanvassStage(session.id, "release_canvass");
      sessionRef.current.bac_no = bacNo;
      advance("pr_received");
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? "Could not create canvass session");
    }
  }, [pr.prNo, bacNo, advance]);

  const handleStep8 = useCallback(async () => {
    if (!sessionId) return;
    try {
      // Build assignment rows from users who have been released
      const released = canvassUsers.filter(
        u => canvassStatuses[u.id]?.status !== "pending" && u.division_id !== null
      );
      const rows = released.map(u => ({
        division_id:  u.division_id!,
        canvasser_id: u.id,               // actual user id from the DB users table
        released_at:  canvassStatuses[u.id]?.releaseDate
          ? new Date(canvassStatuses[u.id].releaseDate).toISOString()
          : new Date().toISOString(),
      }));
      if (rows.length) await insertAssignmentsForDivisions(sessionId, rows);
      await updateCanvassStage(sessionId, "collect_canvass");
      advance("release_canvass");
    } catch (e: any) {
      Alert.alert("Release failed", e?.message ?? "Could not record canvass releases");
    }
  }, [sessionId, canvassUsers, canvassStatuses, advance]);

  const handleStep9 = useCallback(async () => {
    if (!sessionId) return;
    try {
      const quotes: any[] = [];
      supps.forEach(sp => {
        liveItems.forEach(item => {
          const up = parseFloat(sp.prices[item.id] || "0") || 0;
          if (up > 0) quotes.push({
            item_no: item.id, description: item.desc, unit: item.unit, quantity: item.qty,
            supplier_name: sp.name || `Supplier ${sp.id}`,
            unit_price: up, total_price: up * item.qty, is_winning: null,
          });
        });
      });
      if (quotes.length) await insertSupplierQuotesForSession(sessionId, quotes);
      await updateCanvassStage(sessionId, "bac_resolution");
      advance("collect_canvass");
    } catch (e: any) {
      Alert.alert("Quotes failed", e?.message ?? "Could not save supplier quotations");
    }
  }, [sessionId, supps, liveItems, advance]);

  const handleStep7 = useCallback(async () => {
    if (!sessionId || !resNo) return;
    try {
      sessionRef.current.resolution_no = resNo;
      sessionRef.current.mode = mode;
      await insertBACResolution(sessionId, {
        resolution_no: resNo,
        prepared_by: currentUser?.id ?? 0,
        mode, resolved_at: new Date().toISOString(), notes: null,
      });
      await updateCanvassStage(sessionId, "aaa_preparation");
      advance("bac_resolution");
    } catch (e: any) {
      Alert.alert("Resolution failed", e?.message ?? "Could not record BAC resolution");
    }
  }, [sessionId, resNo, mode, currentUser?.id, advance]);

  const handleComplete = useCallback(async () => {
    if (!sessionId || !aaaNo) return;
    try {
      sessionRef.current.aaa_no = aaaNo;
      await insertAAAForSession(sessionId, {
        aaa_no: aaaNo, prepared_by: currentUser?.id ?? 0,
        prepared_at: new Date().toISOString(), file_url: null,
      });
      await updateCanvassSessionMeta(sessionId, { status: "closed" });
      onComplete?.({
        pr_no: pr.prNo, bac_no: sessionRef.current.bac_no,
        resolution_no: sessionRef.current.resolution_no, mode, aaa_no: aaaNo,
      });
      Alert.alert("✅ Canvassing Complete", "Forward to Supply Section");
    } catch (e: any) {
      Alert.alert("AAA failed", e?.message ?? "Could not record AAA");
    }
  }, [sessionId, aaaNo, currentUser?.id, mode, pr.prNo, onComplete]);

  // Helper to toggle a user's release/return status
  const toggleUserStatus = useCallback((userId: number) => {
    setCanvassStatuses(prev => {
      const cur = prev[userId] ?? { status: "pending", releaseDate: "", returnDate: "" };
      const now = new Date().toLocaleDateString("en-PH");
      if (cur.status === "pending")   return { ...prev, [userId]: { ...cur, status: "released", releaseDate: now } };
      if (cur.status === "released")  return { ...prev, [userId]: { ...cur, status: "returned",  returnDate: now } };
      return prev; // "returned" — no further toggle
    });
  }, []);

  const allSigned = members.every(m => m.signed);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView className="flex-1 bg-gray-50"
      behavior={Platform.OS === "ios" ? "padding" : "height"}>

      {/* ── Header ── */}
      <View className="bg-[#064E3B] px-4 pt-3">
        <View className="flex-row items-center justify-between mb-2.5">
          <View className="flex-row items-center gap-2">
            {onBack && (
              <TouchableOpacity onPress={onBack} hitSlop={10}
                className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center">
                <Text className="text-white text-[20px] leading-none font-light">←</Text>
              </TouchableOpacity>
            )}
            <View>
              <Text className="text-[9.5px] font-semibold tracking-widest uppercase text-white/40">
                DAR · Procurement › Canvassing
              </Text>
              <Text className="text-[15px] font-extrabold text-white">Canvassing · BAC</Text>
            </View>
          </View>
          <View className="bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-300">
            <Text className="text-[10.5px] font-bold text-amber-800">⏱ 7-day window</Text>
          </View>
        </View>
        <StageStrip current={stage} completed={done} onNavigate={goToStage} />
      </View>

      <ScrollView className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        <PRCard pr={{ ...pr, items: liveItems }} />

        {/* ── Step 6: PR Received ── */}
        {stage === "pr_received" && (
          <View>
            <StepHeader stage="pr_received" title="PR Received from PARPO"
              desc="Assign a BAC canvass number to acknowledge receipt of the approved PR." />
            <Banner type="info" text="PR has been approved by PARPO. Assign a BAC canvass number to begin." />
            <Card>
              <View className="px-4 pt-3 pb-2">
                <Divider label="BAC Acknowledgement" />
                <Field label="BAC Canvass No." required>
                  <Input value={bacNo} onChange={setBacNo} placeholder="e.g. BAC-2026-001" />
                </Field>
                <Field label="Date Received">
                  <Input value={new Date().toLocaleDateString("en-PH")} readonly />
                </Field>
              </View>
            </Card>
            <ItemsTable items={liveItems} />
            <View className="flex-row justify-end gap-2.5 mt-1">
              <Btn ghost label="Save Draft" onPress={() => {}} />
              <Btn label="Acknowledged → Release Canvass" disabled={!bacNo} onPress={handleStep6} />
            </View>
          </View>
        )}

        {/* ── Step 7: Release Canvass ── */}
        {stage === "release_canvass" && (
          <View>
            <StepHeader stage="release_canvass" title="Release Canvass to Divisions"
              desc="Release canvass sheets (RFQs) to the End Users and Canvassers per division." />
            <Banner type="warning" text="Verify availability before releasing. End Users (role 6) and Canvassers (role 7) are listed." />
            <Card>
              <View className="px-4 pt-3 pb-2">
                <Divider label="Canvassers & End Users by Division" />
                {usersLoading ? (
                  <View className="items-center py-6">
                    <Text className="text-[13px] text-gray-400">Loading users…</Text>
                  </View>
                ) : canvassUsers.length === 0 ? (
                  <View className="items-center py-6">
                    <Text className="text-[13px] text-gray-400">
                      No End Users or Canvassers found in the system.
                    </Text>
                  </View>
                ) : (
                  canvassUsers.map((user) => {
                    const st = canvassStatuses[user.id] ?? { status: "pending", releaseDate: "", returnDate: "" };
                    const roleLabel = user.role_id === 7 ? "Canvasser" : "End User";
                    const roleBg    = user.role_id === 7 ? "bg-violet-100" : "bg-blue-100";
                    const roleText  = user.role_id === 7 ? "text-violet-800" : "text-blue-800";
                    return (
                      <View key={user.id}
                        className={`flex-row items-center justify-between p-2.5 mb-1.5 rounded-2xl border ${
                          st.status !== "pending" ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-200"
                        }`}>
                        {/* Division badge */}
                        <View className="w-16 bg-emerald-100 px-1.5 py-0.5 rounded-md">
                          <Text className="text-[9.5px] font-bold text-emerald-800 text-center" numberOfLines={1}>
                            {user.division_name ?? "—"}
                          </Text>
                        </View>

                        {/* Name + role */}
                        <View className="flex-1 px-2">
                          <Text className="text-[12.5px] text-gray-700 font-semibold" numberOfLines={1}>
                            {user.username}
                          </Text>
                          <View className={`self-start px-1.5 py-0.5 rounded-md ${roleBg} mt-0.5`}>
                            <Text className={`text-[9px] font-bold ${roleText}`}>{roleLabel}</Text>
                          </View>
                        </View>

                        {/* Status pill */}
                        <View className={`px-2 py-0.5 rounded-full mr-2 ${
                          st.status === "pending"  ? "bg-amber-100" :
                          st.status === "released" ? "bg-emerald-100" : "bg-blue-100"
                        }`}>
                          <Text className={`text-[10px] font-bold ${
                            st.status === "pending"  ? "text-amber-800" :
                            st.status === "released" ? "text-emerald-700" : "text-blue-700"
                          }`}>
                            {st.status === "pending" ? "Pending" :
                             st.status === "released" ? "Released" : "Returned"}
                          </Text>
                        </View>

                        {/* Action button */}
                        {st.status !== "returned" && (
                          <TouchableOpacity onPress={() => toggleUserStatus(user.id)} activeOpacity={0.8}
                            className={`px-2.5 py-1 rounded-lg ${
                              st.status === "pending" ? "bg-emerald-600" : "bg-blue-600"
                            }`}>
                            <Text className="text-[11px] font-bold text-white">
                              {st.status === "pending" ? "📤 Release" : "📥 Receive"}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            </Card>
            <View className="flex-row justify-end gap-2.5 mt-1">
              <Btn ghost label="Save Draft" onPress={() => {}} />
              <Btn label="Released → Collect Canvass" onPress={handleStep8} />
            </View>
          </View>
        )}

        {/* ── Step 8: Collect & Encode Quotations ── */}
        {stage === "collect_canvass" && (
          <View>
            <StepHeader stage="collect_canvass" title="Collect & Encode Canvass"
              desc="Collect returned RFQ forms and encode each supplier's quoted prices." />
            <ItemsTable items={liveItems} />
            <Card>
              <View className="px-4 pt-3 pb-3">
                <Divider label="Supplier Quotations" />
                {supps.map((sp, sIdx) => (
                  <View key={sp.id}
                    className="border border-gray-200 rounded-2xl mb-3 overflow-hidden">
                    {/* Supplier header row */}
                    <View className="flex-row items-center justify-between px-3 py-2.5 bg-gray-50">
                      <Text className="text-[13.5px] font-semibold text-gray-800">
                        Supplier {sIdx + 1}{sp.name ? ` · ${sp.name}` : ""}
                      </Text>
                      {supps.length > 1 && (
                        <TouchableOpacity
                          onPress={() => setSupps(s => s.filter(x => x.id !== sp.id))}
                          hitSlop={8} className="p-1.5 rounded-lg border border-gray-200">
                          <Text className="text-[12px] text-red-500">✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <View className="p-3 gap-2">
                      <Field label="Supplier Name" required>
                        <Input value={sp.name} placeholder="Business / trade name"
                          onChange={v => setSupps(s => s.map(x =>
                            x.id === sp.id ? { ...x, name: v } : x))} />
                      </Field>
                      <View className="flex-row gap-2.5">
                        <View className="flex-1">
                          <Field label="TIN No.">
                            <Input value={sp.tin} placeholder="000-000-000"
                              onChange={v => setSupps(s => s.map(x =>
                                x.id === sp.id ? { ...x, tin: v } : x))} />
                          </Field>
                        </View>
                        <View className="flex-1">
                          <Field label="Delivery (days)">
                            <Input value={sp.days} placeholder="e.g. 7" numeric
                              onChange={v => setSupps(s => s.map(x =>
                                x.id === sp.id ? { ...x, days: v } : x))} />
                          </Field>
                        </View>
                      </View>
                      <Divider label="Unit Prices Quoted (₱)" />
                      {liveItems.map(item => {
                        const price = parseFloat(sp.prices[item.id] || "0") || 0;
                        return (
                          <View key={item.id}
                            className="flex-row items-center gap-2 py-1.5"
                            style={{ borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}>
                            <Text className="flex-[2] text-[12px] text-gray-700" numberOfLines={1}>
                              {item.desc}
                            </Text>
                            <Text className="text-[11.5px] text-gray-400 w-9 text-center">
                              {item.unit}
                            </Text>
                            <Text className="text-[11.5px] text-gray-600 w-7 text-right">
                              {item.qty}
                            </Text>
                            <View className="w-20">
                              <Input value={sp.prices[item.id] ?? ""} numeric placeholder="0.00"
                                onChange={v => setSupps(s => s.map(x =>
                                  x.id === sp.id
                                    ? { ...x, prices: { ...x.prices, [item.id]: v } }
                                    : x))} />
                            </View>
                            <Text className={`w-20 text-[11.5px] font-semibold text-right ${
                              price > 0 ? "text-[#064E3B]" : "text-gray-300"
                            }`} style={{ fontFamily: MONO }}>
                              {price > 0 ? `₱${fmt(price * item.qty)}` : "—"}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ))}
                <TouchableOpacity
                  onPress={() => setSupps(s => [...s, mkSupplier(s.length + 1)])}
                  activeOpacity={0.8}
                  className="flex-row items-center justify-center gap-2 py-3 rounded-2xl"
                  style={{ borderWidth: 2, borderStyle: "dashed", borderColor: "#d1d5db" }}>
                  <Text className="text-[13px] font-semibold text-[#064E3B]">
                    + Add Supplier Quote
                  </Text>
                </TouchableOpacity>
              </View>
            </Card>
            <View className="flex-row justify-end gap-2.5 mt-1">
              <Btn ghost label="Save Draft" onPress={() => {}} />
              <Btn label="Encoded → BAC Resolution" onPress={handleStep9} />
            </View>
          </View>
        )}

        {/* ── Step 9: BAC Resolution ── */}
        {stage === "bac_resolution" && (
          <View>
            <StepHeader stage="bac_resolution" title="BAC Resolution"
              desc="Prepare the BAC Resolution and collect all member signatures." />
            <Card>
              <View className="px-4 pt-3 pb-2">
                <Divider label="Resolution Details" />
                <View className="flex-row gap-2.5">
                  <View className="flex-1">
                    <Field label="Resolution No." required>
                      <Input value={resNo} onChange={setResNo}
                        placeholder="e.g. BAC-RES-2026-001" />
                    </Field>
                  </View>
                  <View className="flex-1">
                    <Field label="PR Reference">
                      <Input value={pr.prNo} readonly />
                    </Field>
                  </View>
                </View>
                <Field label="Mode of Procurement" required>
                  <PickerField title="Mode of Procurement" options={PROC_MODES}
                    value={mode} onSelect={setMode} />
                </Field>
              </View>
            </Card>

            {!allSigned && (
              <Banner type="warning"
                text="All BAC members and PARPO II must sign before proceeding." />
            )}

            {/* Signatories */}
            <Card>
              <View className="px-4 pt-3 pb-2">
                <View className="flex-row items-center gap-2 mb-3">
                  <Text className="text-[9.5px] font-bold tracking-widest uppercase text-gray-400">
                    Signatories
                  </Text>
                  <View className="bg-emerald-100 px-2 py-0.5 rounded-md">
                    <Text className="text-[10px] font-bold text-emerald-700">
                      {members.filter(m => m.signed).length}/{members.length} signed
                    </Text>
                  </View>
                  <View className="flex-1 h-px bg-gray-200" />
                </View>
                {members.map((m, idx) => (
                  <View key={m.name}
                    className={`flex-row items-center justify-between p-3 mb-2 rounded-2xl border ${
                      m.signed ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-200"
                    }`}>
                    <View className="flex-row items-center gap-2.5 flex-1">
                      <View className={`w-8 h-8 rounded-lg items-center justify-center border ${
                        m.signed
                          ? "bg-emerald-500 border-emerald-500"
                          : "bg-gray-100 border-gray-200"
                      }`}>
                        <Text className="text-[12px] font-bold"
                          style={{ color: m.signed ? "#fff" : "#6b7280" }}>
                          {m.signed ? "✓" : m.name[0]}
                        </Text>
                      </View>
                      <View>
                        <Text className={`text-[13px] font-semibold ${
                          m.signed ? "text-emerald-800" : "text-gray-800"
                        }`}>{m.name}</Text>
                        <Text className="text-[11px] text-gray-400">{m.designation}</Text>
                      </View>
                    </View>
                    {m.signed ? (
                      <View className="items-end">
                        <Text className="text-[11.5px] font-semibold text-emerald-600">
                          ✅ Signed
                        </Text>
                        <Text className="text-[10px] text-gray-400">at {m.signedAt}</Text>
                      </View>
                    ) : (
                      <TouchableOpacity activeOpacity={0.8}
                        onPress={() => setMembers(ms => ms.map((mb, i) => i !== idx ? mb : {
                          ...mb, signed: true,
                          signedAt: new Date().toLocaleTimeString("en-PH",
                            { hour: "2-digit", minute: "2-digit" }),
                        }))}
                        className="px-3.5 py-1.5 rounded-lg border border-gray-200 bg-white">
                        <Text className="text-[12px] font-semibold text-gray-500">✍️ Sign</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            </Card>

            <View className="flex-row justify-end gap-2.5 mt-1">
              <Btn ghost label="Save Draft" onPress={() => {}} />
              <Btn label="Resolve → Prepare AAA"
                disabled={!allSigned || !resNo || !mode} onPress={handleStep7} />
            </View>
          </View>
        )}

        {/* ── Step 10: Abstract of Awards ── */}
        {stage === "aaa_preparation" && (
          <View>
            <StepHeader stage="aaa_preparation" title="Abstract of Awards"
              desc="Prepare the AAA and finalize the canvassing process." />
            <Card>
              <View className="px-4 pt-3 pb-2">
                <Divider label="AAA Details" />
                <View className="flex-row gap-2.5">
                  <View className="flex-1">
                    <Field label="AAA No." required>
                      <Input value={aaaNo} onChange={setAaaNo}
                        placeholder="e.g. AAA-2026-0001" />
                    </Field>
                  </View>
                  <View className="flex-1">
                    <Field label="PR Reference">
                      <Input value={pr.prNo} readonly />
                    </Field>
                  </View>
                  <View className="flex-1">
                    <Field label="Date Prepared">
                      <Input value={new Date().toLocaleDateString("en-PH")} readonly />
                    </Field>
                  </View>
                </View>
              </View>
            </Card>
            <View className="flex-row justify-end gap-2.5 mt-1">
              <Btn ghost label="Save Draft" onPress={() => {}} />
              <Btn label="Finalize & Forward to Supply →"
                disabled={!aaaNo} onPress={handleComplete} />
            </View>
          </View>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}