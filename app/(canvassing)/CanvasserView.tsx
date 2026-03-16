/**
 * CanvasserView.tsx — Canvasser role (role_id 7), Step 8.
 * All UI primitives inlined — no ../ui dependency.
 */

import {
  ensureCanvassSession,
  fetchPRIdByNo,
  fetchPRWithItemsById,
  insertSupplierQuotesForSession,
  markAssignmentReturned,
  supabase,
} from "@/lib/supabase";
import type { CanvassStage, CanvassingPR, CanvassingPRItem } from "@/types/canvassing";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React from "react";
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import type { CanvassPreviewData } from "../(modals)/CanvassPreview";
import CanvassPreviewModal from "../(modals)/CanvassPreviewModal";
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

// ─── Inlined UI atoms (NativeWind className — matches existing code style) ────

const Divider = ({ label }: { label: string }) => (
  <View className="flex-row items-center gap-2 mb-2.5 mt-1">
    <Text className="text-[9.5px] font-bold tracking-widest uppercase text-gray-400">{label}</Text>
    <View className="flex-1 h-px bg-gray-200" />
  </View>
);

const Card = ({ children }: { children: React.ReactNode }) => (
  <View className="bg-white rounded-3xl border border-gray-200 mb-3 overflow-hidden"
    style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.07, shadowRadius: 6, elevation: 3 }}>
    {children}
  </View>
);

const Btn = ({ label, onPress, disabled }: {
  label: string; onPress: () => void; disabled?: boolean;
}) => (
  <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.8}
    className={`px-5 py-2.5 rounded-xl ${disabled ? "bg-gray-300" : "bg-[#064E3B]"}`}>
    <Text className="text-[13px] font-bold text-white">{label}</Text>
  </TouchableOpacity>
);

const StageStrip = ({ current, completed }: {
  current: CanvassStage; completed: Set<CanvassStage>;
}) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false}
    className="bg-[#064E3B]"
    contentContainerStyle={{ flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 4 }}>
    {STAGE_ORDER.map((s, i) => {
      const meta   = STAGE_META[s];
      const isDone = completed.has(s);
      const active = s === current;
      return (
        <React.Fragment key={s}>
          <View className="items-center gap-1">
            <View className={`w-7 h-7 rounded-full items-center justify-center ${
              isDone ? "bg-[#52b788]" : active ? "bg-white" : "bg-white/15"
            }`}>
              <MaterialIcons
                name={isDone ? "check" : meta.icon} size={13}
                color={isDone ? "#1a4d2e" : active ? "#064E3B" : "rgba(255,255,255,0.4)"} />
            </View>
            <Text className="text-[9px] font-bold text-center"
              style={{ maxWidth: 54,
                color: active ? "#fff" : isDone ? "#52b788" : "rgba(255,255,255,0.35)" }}>
              {meta.label}
            </Text>
          </View>
          {i < STAGE_ORDER.length - 1 && (
            <View className="w-5 h-px bg-white/15 self-center -mt-3" />
          )}
        </React.Fragment>
      );
    })}
  </ScrollView>
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
        {/* Totals row */}
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function CanvasserView({ pr, onBack }: {
  pr: CanvassingPR; onBack?: () => void;
}) {
  const { currentUser } = useAuth();

  const [stage,     setStage]     = React.useState<CanvassStage>("collect_canvass");
  const [done,      setDone]      = React.useState<Set<CanvassStage>>(
    new Set<CanvassStage>(["pr_received", "release_canvass"])
  );
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [assigned,  setAssigned]  = React.useState(true);
  const [quotes,    setQuotes]    = React.useState<Record<number, { supplier: string; price: string }>>({});
  const [liveItems, setLiveItems] = React.useState<CanvassingPRItem[]>(pr.items);
  const [previewOpen, setPreviewOpen] = React.useState(false);

  // ── Build RFQ preview — pre-fills prices from quotes state ───────────────
  const buildPreviewData = (): CanvassPreviewData => {
    const deadlineDate = new Date();
    deadlineDate.setDate(deadlineDate.getDate() + 7);
    return {
      prNo:           pr.prNo,
      quotationNo:    "—",          // BAC canvass no. not available to canvasser
      date:           pr.date,
      deadline:       deadlineDate.toLocaleDateString("en-PH", {
                        month: "long", day: "numeric", year: "numeric" }),
      bacChairperson: "ATTY. JAIME G. RESOCO, JR.",
      officeSection:  pr.officeSection,
      purpose:        pr.purpose,
      items:          liveItems.map((item, i) => {
        const q  = quotes[item.id];
        const up = q?.price ? parseFloat(q.price) : undefined;
        return {
          itemNo:      i + 1,
          description: item.desc + (q?.supplier ? ` (${q.supplier})` : ""),
          qty:         item.qty,
          unit:        item.unit,
          // Show the price the canvasser has entered, blank if not yet filled
          unitPrice:   up && up > 0 ? up.toFixed(2) : "",
        };
      }),
      canvasserNames: currentUser?.username ? [currentUser.username] : [],
    };
  };

  // ── Load session + verify division assignment ─────────────────────────────
  React.useEffect(() => {
    (async () => {
      try {
        const prId = await fetchPRIdByNo(pr.prNo);
        if (!prId) return;

        const session = await ensureCanvassSession(prId);
        setSessionId(session.id);
        setStage((session.stage as CanvassStage) || "collect_canvass");

        const { data: assignments } = await supabase
          .from("canvasser_assignments")
          .select("*")
          .eq("session_id", session.id);

        // Match by canvasser_id (user.id) first — BAC now assigns by user record.
        // Fall back to division_id match for backwards compatibility.
        const mine = (assignments ?? []).find(
          (a: any) =>
            a.canvasser_id === (currentUser?.id ?? -1) ||
            a.division_id  === (currentUser?.division_id ?? -1),
        );
        if (!mine) {
          setAssigned(false);
          Alert.alert("No assignment", "Your division has no canvassing assignment for this PR.");
        }

        const { items } = await fetchPRWithItemsById(prId);
        setLiveItems(items.map(i => ({
          id:       parseInt(String(i.id)),
          desc:     i.description,
          stock:    i.stock_no,
          unit:     i.unit,
          qty:      i.quantity,
          unitCost: i.unit_price,
        })));
      } catch {
        // silently ignore — liveItems stays as pr.items prop
      }
    })();
  }, [pr.prNo, currentUser?.division_id]);

  // ── Submit quotations ─────────────────────────────────────────────────────
  const handleSubmitQuotes = async () => {
    if (!sessionId) return;
    try {
      const rows = liveItems
        .map(it => {
          const q  = quotes[it.id] ?? { supplier: "", price: "" };
          const up = parseFloat(q.price || "0") || 0;
          return {
            item_no:       it.id,
            description:   it.desc,
            unit:          it.unit,
            quantity:      it.qty,
            supplier_name: q.supplier || "Supplier",
            unit_price:    up,
            total_price:   up * it.qty,
            is_winning:    null as any,
          };
        })
        .filter(r => r.unit_price > 0);

      if (rows.length === 0) {
        Alert.alert("No quotes", "Enter at least one unit price before submitting.");
        return;
      }

      await insertSupplierQuotesForSession(sessionId, rows);

      // Mark the assignment returned — match by both canvasser_id and division_id
      if (currentUser?.division_id) {
        await markAssignmentReturned(sessionId, currentUser.division_id);
      }

      setDone(s => new Set([...s, "collect_canvass"]));
      setStage("bac_resolution");
      Alert.alert("✅ Submitted", "Your canvass quotations have been submitted to BAC.");
    } catch (e: any) {
      Alert.alert("Submit failed", e?.message ?? "Could not submit canvass");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView className="flex-1 bg-gray-50"
      behavior={Platform.OS === "ios" ? "padding" : "height"}>

      {/* ── Header ── */}
      <View className="bg-[#064E3B] px-4 pt-3 pb-1">
        <View className="flex-row items-center justify-between mb-2.5">
          <View className="flex-row items-center gap-2">
            {onBack && (
              <TouchableOpacity onPress={onBack} activeOpacity={0.7}
                className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center">
                <Text className="text-white text-[20px] leading-none font-light">←</Text>
              </TouchableOpacity>
            )}
            <View>
              <Text className="text-[9.5px] font-semibold tracking-widest uppercase text-white/40">
                DAR · Procurement › Canvassing
              </Text>
              <Text className="text-[15px] font-extrabold text-white">Canvassing · Step 8</Text>
            </View>
          </View>
          <View className="bg-white/15 px-2.5 py-1 rounded-xl">
            <Text className="text-[10.5px] font-bold text-white/80" style={{ fontFamily: MONO }}>
              {pr.prNo}
            </Text>
          </View>
        </View>
        <StageStrip current={stage} completed={done} />
      </View>

      <ScrollView className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* ── No-assignment warning ── */}
        {!assigned && (
          <View className="flex-row gap-2.5 bg-amber-50 border border-amber-300 rounded-2xl p-3.5 mb-3">
            <Text className="text-base">⚠️</Text>
            <Text className="flex-1 text-[12.5px] text-amber-900 leading-5">
              Your division does not have a canvassing assignment for this PR.
              Contact the BAC office.
            </Text>
          </View>
        )}

        {/* ── PR summary card ── */}
        <View className="bg-white rounded-3xl border border-gray-200 mb-3 overflow-hidden"
          style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.07, shadowRadius: 6, elevation: 3 }}>
          <View className="bg-[#064E3B] px-4 pt-3.5 pb-3">
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-2">
                <Text className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-1">
                  Purchase Request
                </Text>
                <Text className="text-[16px] font-extrabold text-white" style={{ fontFamily: MONO }}>
                  {pr.prNo}
                </Text>
                <Text className="text-[12px] text-white/70 mt-0.5">
                  {pr.officeSection} · {pr.date}
                </Text>
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
          <View className="px-4 pt-2.5 pb-3">
            <Text className="text-[12.5px] text-gray-500 leading-5" numberOfLines={3}>
              {pr.purpose}
            </Text>
          </View>
        </View>

        {/* ── Items reference table ── */}
        <ItemsTable items={liveItems} />

        {/* ── Quote entry card ── */}
        <Card>
          <View className="px-4 pt-3 pb-3">
            <Divider label="Enter Supplier Quotations" />

            {/* Column headers */}
            <View className="flex-row mb-2 px-1">
              <Text className="flex-[2] text-[10px] font-bold uppercase tracking-wide text-gray-400">
                Item
              </Text>
              <Text className="flex-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                Supplier
              </Text>
              <Text className="w-28 text-[10px] font-bold uppercase tracking-wide text-gray-400 text-right">
                Unit Price ₱
              </Text>
            </View>

            {liveItems.map((it) => {
              const up = parseFloat(quotes[it.id]?.price || "0") || 0;
              return (
                <View key={it.id} className="mb-3"
                  style={{ borderBottomWidth: 1, borderBottomColor: "#f3f4f6", paddingBottom: 12 }}>
                  {/* Item label */}
                  <View className="mb-2">
                    <Text className="text-[12.5px] font-semibold text-gray-800" numberOfLines={1}>
                      {it.desc}
                    </Text>
                    <Text className="text-[10.5px] text-gray-400">
                      {it.qty} {it.unit}
                      {up > 0 && (
                        <Text className="text-[10.5px] font-semibold text-[#064E3B]">
                          {" "}· Total: ₱{fmt(up * it.qty)}
                        </Text>
                      )}
                    </Text>
                  </View>
                  {/* Inputs row */}
                  <View className="flex-row gap-2">
                    <TextInput
                      value={quotes[it.id]?.supplier ?? ""}
                      onChangeText={(t) => setQuotes(q => ({
                        ...q, [it.id]: { ...(q[it.id] ?? { price: "" }), supplier: t },
                      }))}
                      placeholder="Supplier name"
                      placeholderTextColor="#9ca3af"
                      className="flex-1 rounded-xl bg-white px-3 py-2 text-[12px] text-gray-800"
                      style={{ borderWidth: 1.5, borderColor: "#e5e7eb" }}
                    />
                    <TextInput
                      value={quotes[it.id]?.price ?? ""}
                      onChangeText={(t) => setQuotes(q => ({
                        ...q, [it.id]: { ...(q[it.id] ?? { supplier: "" }), price: t },
                      }))}
                      placeholder="0.00"
                      placeholderTextColor="#9ca3af"
                      keyboardType="decimal-pad"
                      className="w-28 rounded-xl bg-white px-3 py-2 text-[12px] text-right text-gray-800"
                      style={{ borderWidth: 1.5, borderColor: "#e5e7eb" }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </Card>

        {/* ── Submit / submitted state ── */}
        <View className="flex-row justify-end mt-2 gap-2.5">
          {/* View RFQ always visible so canvasser can reference the form */}
          <TouchableOpacity
            onPress={() => setPreviewOpen(true)}
            activeOpacity={0.8}
            className="flex-row items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 bg-white">
            <MaterialIcons name="description" size={14} color="#064E3B" />
            <Text className="text-[12.5px] font-bold text-[#064E3B]">View RFQ</Text>
          </TouchableOpacity>
          {stage === "bac_resolution" ? (
            <View className="flex-row items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
              <Text className="text-[13px] font-bold text-emerald-700">✅ Submitted to BAC</Text>
            </View>
          ) : (
            <Btn label="Submit Quotations to BAC"
              onPress={handleSubmitQuotes} disabled={!assigned} />
          )}
        </View>

      </ScrollView>

      {/* ── RFQ Preview Modal ── */}
      <CanvassPreviewModal
        visible={previewOpen}
        data={buildPreviewData()}
        onClose={() => setPreviewOpen(false)}
      />

    </KeyboardAvoidingView>
  );
}