import type { CanvasserAssignmentRow, CanvassUserRow } from "@/lib/supabase";
import type {
    CanvassingPR,
    CanvassingPRItem,
    CanvassStage,
} from "@/types/canvassing";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React from "react";
import {
    ActivityIndicator,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { MONO, STAGE_META, STAGE_ORDER } from "./constants";
import { Btn, Card, Divider, StepBadge } from "./ui";
import { fmt, prTotal } from "./utils";

/**
 * CompletedBanner — shown when viewing an already-submitted step.
 * Mirrors page.tsx's phase-completion banner style.
 */
export const CompletedBanner = ({
  label,
  onResubmit,
}: {
  label: string;
  onResubmit: () => void;
}) => (
  <View className="flex-row items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 mb-3">
    <View className="w-7 h-7 rounded-full bg-emerald-200 items-center justify-center">
      <MaterialIcons name="check-circle" size={16} color="#065f46" />
    </View>
    <View className="flex-1">
      <Text className="text-[12.5px] font-bold text-emerald-800">
        Step completed
      </Text>
      <Text className="text-[11px] text-emerald-700 mt-0.5">{label}</Text>
    </View>
    <TouchableOpacity
      onPress={onResubmit}
      activeOpacity={0.8}
      className="px-3 py-1.5 rounded-lg border border-emerald-300 bg-white">
      <Text className="text-[11.5px] font-bold text-emerald-700">Edit</Text>
    </TouchableOpacity>
  </View>
);

/**
 * StepNav — Previous / Submit / Next footer navigation.
 */
export const StepNav = ({
  stage,
  done,
  onPrev,
  onNext,
  canSubmit,
  submitLabel,
  onSubmit,
}: {
  stage: CanvassStage;
  done: Set<CanvassStage>;
  onPrev: (s: CanvassStage) => void;
  onNext: (s: CanvassStage) => void;
  canSubmit: boolean;
  submitLabel: string;
  onSubmit: () => void;
}) => {
  const idx = STAGE_ORDER.indexOf(stage);
  const prevStage = idx > 0 ? STAGE_ORDER[idx - 1] : null;
  const nextStage = idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : null;
  return (
    <View
      className="flex-row items-center justify-between mt-3 pt-3"
      style={{ borderTopWidth: 1, borderTopColor: "#f3f4f6" }}>
      {prevStage ? (
        <TouchableOpacity
          onPress={() => onPrev(prevStage)}
          activeOpacity={0.8}
          className="flex-row items-center gap-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-white">
          <MaterialIcons name="chevron-left" size={16} color="#6b7280" />
          <Text className="text-[12.5px] font-bold text-gray-500">
            Previous
          </Text>
        </TouchableOpacity>
      ) : (
        <View />
      )}

      {canSubmit && <Btn label={submitLabel} onPress={onSubmit} />}

      {nextStage ? (
        <TouchableOpacity
          onPress={() => onNext(nextStage)}
          activeOpacity={0.8}
          className="flex-row items-center gap-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-white">
          <Text className="text-[12.5px] font-bold text-gray-500">Next</Text>
          <MaterialIcons name="chevron-right" size={16} color="#6b7280" />
        </TouchableOpacity>
      ) : (
        <View />
      )}
    </View>
  );
};

/**
 * StageStrip — horizontal stage indicator with tap-to-navigate.
 */
export const StageStrip = ({
  current,
  completed,
  onNavigate,
}: {
  current: CanvassStage;
  completed: Set<CanvassStage>;
  onNavigate: (stage: CanvassStage) => void;
}) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    className="bg-[#064E3B]"
    contentContainerStyle={{
      flexDirection: "row",
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 4,
    }}>
    {STAGE_ORDER.map((s, i) => {
      const meta = STAGE_META[s];
      const isDone = completed.has(s);
      const active = s === current;
      return (
        <React.Fragment key={s}>
          <TouchableOpacity
            onPress={() => onNavigate(s)}
            activeOpacity={0.65}
            className="items-center gap-1">
            <View
              className={`w-7 h-7 rounded-full items-center justify-center ${
                isDone ? "bg-[#52b788]" : active ? "bg-white" : "bg-white/15"
              }`}
              style={
                isDone && !active
                  ? { borderWidth: 1.5, borderColor: "#a7f3d0" }
                  : undefined
              }>
              <MaterialIcons
                name={(isDone ? "check" : meta.icon) as any}
                size={13}
                color={
                  isDone
                    ? "#1a4d2e"
                    : active
                      ? "#064E3B"
                      : "rgba(255,255,255,0.4)"
                }
              />
            </View>
            <Text
              className="text-[9px] font-bold text-center"
              style={{
                maxWidth: 54,
                color: active
                  ? "#fff"
                  : isDone
                    ? "#52b788"
                    : "rgba(255,255,255,0.35)",
              }}>
              {meta.label}
            </Text>
            {isDone && !active && (
              <Text
                style={{
                  fontSize: 7,
                  color: "rgba(167,243,208,0.7)",
                  textAlign: "center",
                  maxWidth: 54,
                }}>
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

/**
 * StepHeader — title section for each step.
 */
export const StepHeader = ({
  stage,
  title,
  desc,
}: {
  stage: CanvassStage;
  title: string;
  desc: string;
}) => (
  <View className="flex-row justify-between items-start mb-4">
    <View className="flex-1 pr-3">
      <Text className="text-[10.5px] font-bold tracking-wide uppercase text-emerald-600 mb-1">
        Stage 2 · Canvass & Resolution
      </Text>
      <Text className="text-[22px] font-extrabold text-[#1a4d2e] mb-1">
        {title}
      </Text>
      <Text className="text-[13px] text-gray-500 leading-5">{desc}</Text>
    </View>
    <StepBadge step={STAGE_META[stage].step} />
  </View>
);

/**
 * PRCard — displays PR header with PR number and total cost.
 */
export const PRCard = ({ pr }: { pr: CanvassingPR }) => (
  <Card>
    <View className="bg-[#064E3B] px-4 pt-3.5 pb-3">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-2">
          <Text className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-1">
            Purchase Request
          </Text>
          <Text
            className="text-[16px] font-extrabold text-white"
            style={{ fontFamily: MONO }}>
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
          <Text
            className="text-[15px] font-extrabold text-white"
            style={{ fontFamily: MONO }}>
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

/**
 * ItemsTable — displays PR line items in a table.
 */
export const ItemsTable = ({ items }: { items: CanvassingPRItem[] }) => (
  <Card>
    <View className="px-4 pt-3 pb-2">
      <Divider label="Line Items" />
      <View className="rounded-xl overflow-hidden border border-gray-100">
        <View className="flex-row bg-[#064E3B] px-2.5 py-1.5">
          {["Description", "Unit", "Qty", "Unit Cost", "Total"].map((h, i) => (
            <Text
              key={h}
              className="text-[9.5px] font-bold uppercase tracking-wide text-white/70"
              style={{
                flex: i === 0 ? 2 : 1,
                textAlign: i > 1 ? "right" : "left",
              }}>
              {h}
            </Text>
          ))}
        </View>
        {items.map((item, i) => (
          <View
            key={item.id}
            className={`flex-row px-2.5 py-2 ${i % 2 ? "bg-gray-50" : "bg-white"}`}
            style={{ borderTopWidth: 1, borderTopColor: "#f3f4f6" }}>
            <Text
              className="flex-[2] text-[12px] text-gray-700"
              numberOfLines={2}>
              {item.desc}
            </Text>
            <Text className="flex-1 text-[12px] text-gray-500">
              {item.unit}
            </Text>
            <Text
              className="flex-1 text-[12px] text-gray-700 text-right"
              style={{ fontFamily: MONO }}>
              {item.qty}
            </Text>
            <Text
              className="flex-1 text-[12px] text-gray-700 text-right"
              style={{ fontFamily: MONO }}>
              ₱{fmt(item.unitCost)}
            </Text>
            <Text
              className="flex-1 text-[12px] font-semibold text-[#2d6a4f] text-right"
              style={{ fontFamily: MONO }}>
              ₱{fmt(item.qty * item.unitCost)}
            </Text>
          </View>
        ))}
        <View
          className="flex-row px-2.5 py-2 bg-[#f0fdf4]"
          style={{ borderTopWidth: 1, borderTopColor: "#d1fae5" }}>
          <Text className="flex-[2] text-[11px] font-bold text-[#064E3B]">
            Total
          </Text>
          <Text className="flex-1 text-[11px] text-transparent">—</Text>
          <Text className="flex-1 text-[11px] text-transparent">—</Text>
          <Text className="flex-1 text-[11px] text-transparent">—</Text>
          <Text
            className="flex-1 text-[12px] font-bold text-[#064E3B] text-right"
            style={{ fontFamily: MONO }}>
            ₱{fmt(prTotal(items))}
          </Text>
        </View>
      </View>
    </View>
  </Card>
);

/**
 * AssignmentList — displays canvasser_assignments with joined user data.
 */
export const AssignmentList = ({
  assignments,
  users,
  loading,
}: {
  assignments: CanvasserAssignmentRow[];
  users: CanvassUserRow[];
  loading: boolean;
}) => {
  if (loading) {
    return (
      <View className="items-center py-4 gap-2">
        <ActivityIndicator size="small" color="#064E3B" />
        <Text className="text-[11.5px] text-gray-400">
          Loading assignments…
        </Text>
      </View>
    );
  }
  if (assignments.length === 0) {
    return (
      <View className="items-center py-4">
        <Text className="text-[12px] text-gray-400">
          No assignments recorded yet.
        </Text>
      </View>
    );
  }

  const userById = Object.fromEntries(users.map((u) => [u.id, u]));

  return (
    <>
      <View className="flex-row bg-[#064E3B] rounded-xl px-3 py-1.5 mb-1">
        {["Division", "Canvasser", "Released", "Returned", "Status"].map(
          (h, i) => (
            <Text
              key={h}
              className="text-[9px] font-bold uppercase tracking-wide text-white/70"
              style={{
                flex: i === 0 ? 1.2 : i === 1 ? 1.5 : i === 4 ? 0.9 : 1.1,
              }}>
              {h}
            </Text>
          ),
        )}
      </View>

      {assignments.map((row, i) => {
        const user = row.canvasser_id ? userById[row.canvasser_id] : undefined;
        const fmtDt = (iso?: string | null) =>
          iso
            ? new Date(iso).toLocaleDateString("en-PH", {
                month: "short",
                day: "numeric",
              })
            : "—";

        return (
          <View
            key={row.id}
            className={`flex-row items-center px-3 py-2 rounded-xl mb-0.5 ${
              i % 2 === 0 ? "bg-white" : "bg-gray-50"
            }`}
            style={{ borderWidth: 1, borderColor: "#f3f4f6" }}>
            <View className="flex-[1.2]">
              <View className="bg-emerald-100 self-start px-1.5 py-0.5 rounded-md">
                <Text
                  className="text-[9.5px] font-bold text-emerald-800"
                  numberOfLines={1}>
                  {user?.division_name ?? `Div ${row.division_id}`}
                </Text>
              </View>
            </View>
            <Text
              className="flex-[1.5] text-[11px] text-gray-700 font-medium"
              numberOfLines={1}>
              {user?.username ?? "—"}
            </Text>
            <Text
              className="flex-[1.1] text-[10.5px] text-gray-500"
              style={{ fontFamily: MONO }}>
              {fmtDt(row.released_at)}
            </Text>
            <Text
              className="flex-[1.1] text-[10.5px] text-gray-500"
              style={{ fontFamily: MONO }}>
              {fmtDt(row.returned_at)}
            </Text>
            <View
              className={`flex-[0.9] self-center px-1.5 py-0.5 rounded-full ${
                row.status === "returned" ? "bg-blue-100" : "bg-emerald-100"
              }`}>
              <Text
                className={`text-[9px] font-bold text-center ${
                  row.status === "returned"
                    ? "text-blue-700"
                    : "text-emerald-700"
                }`}>
                {row.status === "returned" ? "Returned" : "Released"}
              </Text>
            </View>
          </View>
        );
      })}
    </>
  );
};
