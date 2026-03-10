/**
 * EndUserView.tsx — read-only canvassing status tracker for all non-BAC / non-Canvasser roles.
 * All UI primitives inlined — no ../ui dependency.
 */

import type { CanvassStage, CanvassingPR, CanvassingPRItem } from "@/types/canvassing";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React from "react";
import { Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";

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

const STAGE_DESC: Record<CanvassStage, string> = {
  pr_received:     "BAC receives the approved PR from PARPO's office, assigns a BAC canvass number, and creates the RFQ.",
  release_canvass: "Canvass sheets (RFQ) released to designated canvassers per division. Due back within 7 days.",
  collect_canvass: "BAC collects filled-out canvass forms and encodes each supplier's quoted prices for comparison.",
  bac_resolution:  "BAC prepares the Resolution documenting the mode of procurement and collects all required signatures.",
  aaa_preparation: "BAC prepares the Abstract of Awards for member and PARPO II signatures, then forwards to Supply.",
};

// ─── Inlined UI atoms (NativeWind className — matches existing code style) ────

const Divider = ({ label }: { label: string }) => (
  <View className="flex-row items-center gap-2 mb-2.5 mt-1">
    <Text className="text-[9.5px] font-bold tracking-widest uppercase text-gray-400">{label}</Text>
    <View className="flex-1 h-px bg-gray-200" />
  </View>
);

const Card = ({ children, className }: {
  children: React.ReactNode; className?: string;
}) => (
  <View className={`bg-white rounded-3xl border border-gray-200 mb-3 overflow-hidden ${className ?? ""}`}
    style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.07, shadowRadius: 6, elevation: 3 }}>
    {children}
  </View>
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
            <Text className="flex-[2] text-[12px] text-gray-700" numberOfLines={2}>
              {item.desc}
            </Text>
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

export default function EndUserView({ pr, onBack, currentStage: currentStageProp }: {
  pr: CanvassingPR;
  onBack?: () => void;
  /** Optionally pass the live stage fetched from DB; defaults to "release_canvass" */
  currentStage?: CanvassStage;
}) {
  const currentStage: CanvassStage = currentStageProp ?? "release_canvass";
  const currentIdx = STAGE_ORDER.indexOf(currentStage);

  return (
    <View className="flex-1 bg-gray-50">

      {/* ── Header ── */}
      <View className="bg-[#064E3B] px-4 pt-3.5 pb-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            {onBack && (
              <TouchableOpacity onPress={onBack} hitSlop={10}
                className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center">
                <MaterialIcons name="chevron-left" size={20} color="#fff" />
              </TouchableOpacity>
            )}
            <View>
              <Text className="text-[9.5px] font-semibold tracking-widest uppercase text-white/40">
                DAR · Procurement › Canvassing
              </Text>
              <Text className="text-[15px] font-extrabold text-white">Canvassing Status</Text>
            </View>
          </View>
          <View className="bg-white/15 px-2.5 py-1 rounded-xl">
            <Text className="text-[10.5px] font-bold text-white/80" style={{ fontFamily: MONO }}>
              {pr.prNo}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}>

        {/* ── PR summary card ── */}
        <Card>
          <View className="px-4 pt-3.5 pb-2">
            <View className="flex-row justify-between items-start">
              <View className="flex-1">
                <Text className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-1">
                  Purchase Request
                </Text>
                <Text className="text-[15px] font-extrabold text-[#1a4d2e]"
                  style={{ fontFamily: MONO }}>{pr.prNo}</Text>
                <Text className="text-[12px] text-gray-400 mt-0.5">
                  {pr.officeSection} · {pr.date}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-1">
                  Total
                </Text>
                <Text className="text-[15px] font-extrabold text-[#064E3B]"
                  style={{ fontFamily: MONO }}>₱{fmt(prTotal(pr.items))}</Text>
                <Text className="text-[11px] text-gray-400 mt-0.5">
                  {pr.items.length} item{pr.items.length !== 1 ? "s" : ""}
                </Text>
              </View>
            </View>
            <View className="h-px bg-gray-100 my-2.5" />
            <Text className="text-[12px] text-gray-500 leading-5">{pr.purpose}</Text>
          </View>
        </Card>

        {/* ── Current stage highlight card ── */}
        <Card className="bg-[#064E3B]">
          <View className="px-4 pt-3.5 pb-3">
            <Text className="text-[10px] font-bold tracking-widest uppercase text-white/50 mb-1.5">
              Current Stage
            </Text>
            <Text className="text-[17px] font-extrabold text-white mb-1">
              Step {STAGE_META[currentStage].step} · {STAGE_META[currentStage].label}
            </Text>
            <Text className="text-[13px] text-white/60 leading-5">
              {STAGE_DESC[currentStage]}
            </Text>
          </View>
        </Card>

        {/* ── Stage timeline ── */}
        <Card>
          <View className="px-4 pt-3 pb-2">
            <Divider label="Stage Timeline" />
            {STAGE_ORDER.map((s, i) => {
              const meta   = STAGE_META[s];
              const isDone = i < currentIdx;
              const active = i === currentIdx;
              return (
                <View key={s} className="flex-row items-start mb-3">
                  {/* Icon + connector line */}
                  <View className="items-center w-9">
                    <View className={`w-7 h-7 rounded-full items-center justify-center ${
                      isDone ? "bg-emerald-500" : active ? "bg-[#064E3B]" : "bg-gray-200"
                    }`}>
                      <MaterialIcons
                        name={isDone ? "check" : meta.icon}
                        size={13}
                        color={isDone || active ? "#fff" : "#9ca3af"}
                      />
                    </View>
                    {i < STAGE_ORDER.length - 1 && (
                      <View className={`w-0.5 h-6 mt-0.5 ${isDone ? "bg-emerald-500" : "bg-gray-200"}`} />
                    )}
                  </View>

                  {/* Label + description */}
                  <View className="flex-1 pl-2.5 pt-1">
                    <Text className={`text-[12.5px] font-bold ${
                      isDone ? "text-emerald-700" : active ? "text-[#1a4d2e]" : "text-gray-400"
                    }`}>
                      Step {meta.step} · {meta.label}
                    </Text>
                    <Text className="text-[11px] text-gray-400 mt-0.5 leading-4">
                      {STAGE_DESC[s]}
                    </Text>
                  </View>

                  {/* Status badge */}
                  <View className={`px-2 py-0.5 rounded-full self-start mt-1 ${
                    isDone ? "bg-emerald-100" : active ? "bg-blue-100" : "bg-gray-100"
                  }`}>
                    <Text className={`text-[10px] font-bold ${
                      isDone ? "text-emerald-700" : active ? "text-blue-700" : "text-gray-400"
                    }`}>
                      {isDone ? "Done" : active ? "In Progress" : "Pending"}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </Card>

        {/* ── Items table ── */}
        <ItemsTable items={pr.items} />

      </ScrollView>
    </View>
  );
}