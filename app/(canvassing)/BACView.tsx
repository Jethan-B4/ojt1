/**
 * BACView.tsx — BAC role (role_id 3) canvassing workflow, Steps 6–10.
 * All UI primitives inlined using NativeWind className — no ../ui dependency.
 */

import {
  CANVASS_PR_STATUS,
  ensureCanvassSession, fetchAssignmentsForSession, fetchPRIdByNo,
fetchPRWithItemsById, fetchQuotesForSession,
  fetchUsersByRole,
  insertAAAForSession, insertAssignmentsForDivisions, insertBACResolution,
  insertSupplierQuotesForSession, updateCanvassSessionMeta, updateCanvassStage,
  updatePRStatus,
  type CanvassEntryRow, type CanvassUserRow,
  type CanvasserAssignmentRow,
} from "@/lib/supabase";
import type {
  BACMember, CanvassStage, CanvassingPR, CanvassingPRItem, SupplierQ,
} from "@/types/canvassing";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import type { CanvassPreviewData } from "../(modals)/CanvassPreview";
import CanvassPreviewModal from "../(modals)/CanvassPreviewModal";

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

/**
 * CompletedBanner — shown when the BAC navigates back to an already-submitted step.
 * Mirrors page.tsx's phase-completion banner style.
 * The "Re-submit" action un-marks the step so the form becomes editable again,
 * but does NOT touch the DB — the next submission will update it.
 */
const CompletedBanner = ({ label, onResubmit }: {
  label: string; onResubmit: () => void;
}) => (
  <View className="flex-row items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 mb-3">
    <View className="w-7 h-7 rounded-full bg-emerald-200 items-center justify-center">
      <MaterialIcons name="check-circle" size={16} color="#065f46" />
    </View>
    <View className="flex-1">
      <Text className="text-[12.5px] font-bold text-emerald-800">Step completed</Text>
      <Text className="text-[11px] text-emerald-700 mt-0.5">{label}</Text>
    </View>
    <TouchableOpacity onPress={onResubmit} activeOpacity={0.8}
      className="px-3 py-1.5 rounded-lg border border-emerald-300 bg-white">
      <Text className="text-[11.5px] font-bold text-emerald-700">Edit</Text>
    </TouchableOpacity>
  </View>
);

/**
 * StepNav — Previous / Submit / Next footer row.
 * Mirrors page.tsx's navigation buttons:
 *   Previous — always available (goes to prior stage in STAGE_ORDER)
 *   Submit   — only shown when the step is not yet completed
 *   Next     — goes to the next stage (visible even on completed steps for review)
 */
const StepNav = ({ stage, done, onPrev, onNext, canSubmit, submitLabel, onSubmit }: {
  stage:       CanvassStage;
  done:        Set<CanvassStage>;
  onPrev:      (s: CanvassStage) => void;
  onNext:      (s: CanvassStage) => void;
  canSubmit:   boolean;
  submitLabel: string;
  onSubmit:    () => void;
}) => {
  const idx     = STAGE_ORDER.indexOf(stage);
  const prevStage = idx > 0 ? STAGE_ORDER[idx - 1] : null;
  const nextStage = idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : null;
  return (
    <View className="flex-row items-center justify-between mt-3 pt-3"
      style={{ borderTopWidth: 1, borderTopColor: "#f3f4f6" }}>
      {/* Previous */}
      {prevStage ? (
        <TouchableOpacity onPress={() => onPrev(prevStage)} activeOpacity={0.8}
          className="flex-row items-center gap-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-white">
          <MaterialIcons name="chevron-left" size={16} color="#6b7280" />
          <Text className="text-[12.5px] font-bold text-gray-500">Previous</Text>
        </TouchableOpacity>
      ) : (
        <View />
      )}

      {/* Submit — hidden on already-completed steps */}
      {canSubmit && (
        <Btn label={submitLabel} onPress={onSubmit} />
      )}

      {/* Next */}
      {nextStage ? (
        <TouchableOpacity onPress={() => onNext(nextStage)} activeOpacity={0.8}
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
 * StageStrip — mirrors page.tsx's StepIndicator.
 *
 * Any stage is tappable via onNavigate:
 *   completed  → green dot, checkmark, "tap to edit" hint
 *   active     → white dot, current icon
 *   future     → dim dot, can still be tapped to preview (read-only view)
 *
 * Navigating never clears completion state — that is preserved in `done`
 * and only modified when the user confirms an action button.
 */
const StageStrip = ({ current, completed, onNavigate }: {
  current:    CanvassStage;
  completed:  Set<CanvassStage>;
  onNavigate: (stage: CanvassStage) => void;
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
          <TouchableOpacity
            onPress={() => onNavigate(s)}
            activeOpacity={0.65}
            className="items-center gap-1">
            <View className={`w-7 h-7 rounded-full items-center justify-center ${
              isDone  ? "bg-[#52b788]" :
              active  ? "bg-white"     : "bg-white/15"
            }`}
              style={isDone && !active
                ? { borderWidth: 1.5, borderColor: "#a7f3d0" }
                : undefined}>
              <MaterialIcons
                name={isDone ? "check" : meta.icon} size={13}
                color={
                  isDone  ? "#1a4d2e" :
                  active  ? "#064E3B" : "rgba(255,255,255,0.4)"
                } />
            </View>
            <Text className="text-[9px] font-bold text-center" style={{
              maxWidth: 54,
              color: active ? "#fff" : isDone ? "#52b788" : "rgba(255,255,255,0.35)",
            }}>
              {meta.label}
            </Text>
            {/* Subtle hint only on completed (re-editable) stages */}
            {isDone && !active && (
              <Text style={{
                fontSize: 7, color: "rgba(167,243,208,0.7)",
                textAlign: "center", maxWidth: 54,
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

// ─── AssignmentList — Step 7 ──────────────────────────────────────────────────
// Shows canvasser_assignments rows for the current session joined with the
// canvassUsers list (for division name + username display).

const AssignmentList = ({
  assignments, users, loading,
}: {
  assignments: CanvasserAssignmentRow[];
  users:       CanvassUserRow[];
  loading:     boolean;
}) => {
  if (loading) {
    return (
      <View className="items-center py-4 gap-2">
        <ActivityIndicator size="small" color="#064E3B" />
        <Text className="text-[11.5px] text-gray-400">Loading assignments…</Text>
      </View>
    );
  }
  if (assignments.length === 0) {
    return (
      <View className="items-center py-4">
        <Text className="text-[12px] text-gray-400">No assignments recorded yet.</Text>
      </View>
    );
  }

  // Build a lookup so we can display name + division without extra queries
  const userById = Object.fromEntries(users.map(u => [u.id, u]));

  return (
    <>
      {/* Table header */}
      <View className="flex-row bg-[#064E3B] rounded-xl px-3 py-1.5 mb-1">
        {["Division", "Canvasser", "Released", "Returned", "Status"].map((h, i) => (
          <Text key={h} className="text-[9px] font-bold uppercase tracking-wide text-white/70"
            style={{ flex: i === 0 ? 1.2 : i === 1 ? 1.5 : i === 4 ? 0.9 : 1.1 }}>
            {h}
          </Text>
        ))}
      </View>

      {assignments.map((row, i) => {
        const user = row.canvasser_id ? userById[row.canvasser_id] : undefined;
        const fmtDt = (iso?: string | null) =>
          iso ? new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "—";

        return (
          <View key={row.id}
            className={`flex-row items-center px-3 py-2 rounded-xl mb-0.5 ${
              i % 2 === 0 ? "bg-white" : "bg-gray-50"
            }`}
            style={{ borderWidth: 1, borderColor: "#f3f4f6" }}>
            {/* Division */}
            <View className="flex-[1.2]">
              <View className="bg-emerald-100 self-start px-1.5 py-0.5 rounded-md">
                <Text className="text-[9.5px] font-bold text-emerald-800" numberOfLines={1}>
                  {user?.division_name ?? `Div ${row.division_id}`}
                </Text>
              </View>
            </View>
            {/* Canvasser name */}
            <Text className="flex-[1.5] text-[11px] text-gray-700 font-medium" numberOfLines={1}>
              {user?.username ?? "—"}
            </Text>
            {/* Released */}
            <Text className="flex-[1.1] text-[10.5px] text-gray-500" style={{ fontFamily: MONO }}>
              {fmtDt(row.released_at)}
            </Text>
            {/* Returned */}
            <Text className="flex-[1.1] text-[10.5px] text-gray-500" style={{ fontFamily: MONO }}>
              {fmtDt(row.returned_at)}
            </Text>
            {/* Status pill */}
            <View className={`flex-[0.9] self-center px-1.5 py-0.5 rounded-full ${
              row.status === "returned" ? "bg-blue-100" : "bg-emerald-100"
            }`}>
              <Text className={`text-[9px] font-bold text-center ${
                row.status === "returned" ? "text-blue-700" : "text-emerald-700"
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

// ─── CanvassEntriesList — Step 8 ─────────────────────────────────────────────
// Shows canvass_entries rows for the current session, grouped by supplier.

const CanvassEntriesList = ({
  entries, loading,
}: {
  entries: CanvassEntryRow[];
  loading: boolean;
}) => {
  if (loading) {
    return (
      <View className="items-center py-4 gap-2">
        <ActivityIndicator size="small" color="#064E3B" />
        <Text className="text-[11.5px] text-gray-400">Loading quotations…</Text>
      </View>
    );
  }
  if (entries.length === 0) {
    return (
      <View className="items-center py-4">
        <Text className="text-[12px] text-gray-400">No quotations encoded yet.</Text>
      </View>
    );
  }

  // Group by supplier_name
  const grouped = entries.reduce<Record<string, CanvassEntryRow[]>>((acc, e) => {
    (acc[e.supplier_name] ??= []).push(e);
    return acc;
  }, {});

  return (
    <>
      {Object.entries(grouped).map(([supplier, rows], gIdx) => {
        const supplierTotal = rows.reduce((s, r) => s + r.total_price, 0);
        return (
          <View key={supplier}
            className="border border-gray-200 rounded-2xl mb-2.5 overflow-hidden">
            {/* Supplier header */}
            <View className="flex-row items-center justify-between px-3 py-2 bg-gray-50">
              <View className="flex-row items-center gap-2">
                <View className="w-6 h-6 rounded-full bg-[#064E3B] items-center justify-center">
                  <Text className="text-[10px] font-bold text-white">{gIdx + 1}</Text>
                </View>
                <Text className="text-[13px] font-bold text-[#1a4d2e]" numberOfLines={1}>
                  {supplier}
                </Text>
              </View>
              <Text className="text-[11.5px] font-bold text-[#064E3B]"
                style={{ fontFamily: MONO }}>
                ₱{fmt(supplierTotal)}
              </Text>
            </View>
            {/* Item rows */}
            {rows.map((entry, i) => (
              <View key={entry.id}
                className={`flex-row items-center px-3 py-2 ${
                  i % 2 === 0 ? "bg-white" : "bg-gray-50"
                }`}
                style={{ borderTopWidth: 1, borderTopColor: "#f3f4f6" }}>
                <Text className="flex-[2.5] text-[11.5px] text-gray-700" numberOfLines={2}>
                  {entry.description}
                </Text>
                <Text className="w-8 text-[10.5px] text-gray-400 text-center">
                  {entry.unit}
                </Text>
                <Text className="w-8 text-[10.5px] text-gray-600 text-right"
                  style={{ fontFamily: MONO }}>
                  {entry.quantity}
                </Text>
                <Text className="flex-1 text-[11px] text-gray-700 text-right"
                  style={{ fontFamily: MONO }}>
                  ₱{fmt(entry.unit_price)}
                </Text>
                <Text className="flex-1 text-[11.5px] font-semibold text-[#064E3B] text-right"
                  style={{ fontFamily: MONO }}>
                  ₱{fmt(entry.total_price)}
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </>
  );
};

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
  const [previewOpen, setPreviewOpen] = useState(false);

  // ── DB-backed canvass lists ───────────────────────────────────────────────
  // Fetched whenever sessionId is first established or on re-open.
  const [assignments,      setAssignments]      = useState<CanvasserAssignmentRow[]>([]);
  const [canvassEntries,   setCanvassEntries]   = useState<CanvassEntryRow[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [entriesLoading,     setEntriesLoading]     = useState(false);

  // ── Free stage navigation — mirrors page.tsx's onStepClick ─────────────
  // Navigating NEVER clears `done`. The DB stage is only advanced by the
  // action buttons (handleStep6, handleStep8, etc.).  This lets BAC freely
  // review any step without risking accidental re-submission or data loss.
  const goToStage = useCallback((target: CanvassStage) => {
    setStage(target);
  }, []);

  // ── Advance: marks a stage done and moves to the next stage ─────────────
  // Unlike before, `done` is never mutated by navigation — only by this.
  // This precisely mirrors page.tsx where setStepNData is the commit action.
  const advance = useCallback((current: CanvassStage) => {
    setDone(s => new Set([...s, current]));
    const idx = STAGE_ORDER.indexOf(current);
    if (idx < STAGE_ORDER.length - 1) setStage(STAGE_ORDER[idx + 1]);
  }, []);

  // True when the BAC is viewing a stage that has already been submitted.
  // Used to show a read-only notice banner — same as page.tsx's "completed" status UI.
  const isViewingCompleted = done.has(stage);

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

  // ── Load assignments + canvass entries whenever sessionId is available ────
  // Re-runs if the BAC navigates away and back (e.g. after re-opening a PR).
  useEffect(() => {
    if (!sessionId) return;

    setAssignmentsLoading(true);
    fetchAssignmentsForSession(sessionId)
      .then(setAssignments)
      .catch(() => {})
      .finally(() => setAssignmentsLoading(false));

    setEntriesLoading(true);
    fetchQuotesForSession(sessionId)
      .then(setCanvassEntries)
      .catch(() => {})
      .finally(() => setEntriesLoading(false));
  }, [sessionId]);

  // ── Load existing session on mount ───────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
                const prId = await fetchPRIdByNo(pr.prNo);
        if (!prId) return;
                const session = await ensureCanvassSession(prId);
        setSessionId(session.id);
const dbStage = (session.stage as CanvassStage) || "pr_received";
        setStage(dbStage);
        // Reconstruct `done` from the DB stage so CompletedBanner shows
        // correctly when the BAC re-opens a PR that's already in progress.
        // All stages that come BEFORE the current DB stage are considered done.
        const dbIdx = STAGE_ORDER.indexOf(dbStage);
        if (dbIdx > 0) {
          setDone(new Set(STAGE_ORDER.slice(0, dbIdx)));
        }
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
await updatePRStatus(prId, CANVASS_PR_STATUS.pr_received);   // → status 6
      sessionRef.current.bac_no = bacNo;
      advance("pr_received");
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? "Could not create canvass session");
    }
  }, [pr.prNo, bacNo, advance]);

  const handleStep8 = useCallback(async () => {
        if (!sessionId) return;
    try {
const prId = await fetchPRIdByNo(pr.prNo);
      if (!prId) throw new Error("PR not found");
      // Build assignment rows from users who have been released
      const released = canvassUsers.filter(
        u => canvassStatuses[u.id]?.status !== "pending" && u.division_id !== null
      );
      const rows = released.map(u => ({
        division_id:  u.division_id!,
        canvasser_id: u.id,
// releaseDate is stored as ISO string by toggleUserStatus — use directly
        released_at:  canvassStatuses[u.id]?.releaseDate || new Date().toISOString(),
      }));
      if (rows.length) await insertAssignmentsForDivisions(sessionId, rows);
      await updatePRStatus(prId, CANVASS_PR_STATUS.release_canvass);  // → status 8
      await updateCanvassStage(sessionId, "collect_canvass");
// Refresh the assignment list so Step 8 immediately shows new rows
      fetchAssignmentsForSession(sessionId).then(setAssignments).catch(() => {});
      advance("release_canvass");
    } catch (e: any) {
      Alert.alert("Release failed", e?.message ?? "Could not record canvass releases");
    }
  }, [sessionId, pr.prNo, canvassUsers, canvassStatuses, advance]);

  const handleStep9 = useCallback(async () => {
        if (!sessionId) return;
    try {
const prId = await fetchPRIdByNo(pr.prNo);
      if (!prId) throw new Error("PR not found");
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
      await updatePRStatus(prId, CANVASS_PR_STATUS.collect_canvass);  // → status 9
      await updateCanvassStage(sessionId, "bac_resolution");
// Refresh the entries list so it reflects the just-inserted quotes
      fetchQuotesForSession(sessionId).then(setCanvassEntries).catch(() => {});
      advance("collect_canvass");
    } catch (e: any) {
      Alert.alert("Quotes failed", e?.message ?? "Could not save supplier quotations");
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
        mode, resolved_at: new Date().toISOString(), notes: null,
      });
            await updateCanvassStage(sessionId, "aaa_preparation");
await updatePRStatus(prId, CANVASS_PR_STATUS.bac_resolution);   // → status 10
      advance("bac_resolution");
    } catch (e: any) {
      Alert.alert("Resolution failed", e?.message ?? "Could not record BAC resolution");
    }
  }, [sessionId, pr.prNo, resNo, mode, currentUser?.id, advance]);

  const handleComplete = useCallback(async () => {
        if (!sessionId || !aaaNo) return;
    try {
const prId = await fetchPRIdByNo(pr.prNo);
      if (!prId) throw new Error("PR not found");
      sessionRef.current.aaa_no = aaaNo;
      await insertAAAForSession(sessionId, {
        aaa_no: aaaNo, prepared_by: currentUser?.id ?? 0,
        prepared_at: new Date().toISOString(), file_url: null,
      });
            await updateCanvassSessionMeta(sessionId, { status: "closed" });
await updatePRStatus(prId, CANVASS_PR_STATUS.aaa_preparation);  // → status 11
      onComplete?.({
        pr_no: pr.prNo, bac_no: sessionRef.current.bac_no,
        resolution_no: sessionRef.current.resolution_no, mode, aaa_no: aaaNo,
      });
      Alert.alert("✅ Canvassing Complete", "Forward to Supply Section");
    } catch (e: any) {
      Alert.alert("AAA failed", e?.message ?? "Could not record AAA");
    }
  }, [sessionId, pr.prNo, aaaNo, currentUser?.id, mode, onComplete]);

  // Helper to toggle a user's release/return status.
  // releaseDate / returnDate are stored as ISO strings so that handleStep8
  // can pass them directly to new Date(...).toISOString() without parsing errors.
  // They are formatted for display only at render time.
  const toggleUserStatus = useCallback((userId: number) => {
    setCanvassStatuses(prev => {
      const cur = prev[userId] ?? { status: "pending", releaseDate: "", returnDate: "" };
      const now = new Date().toISOString();
      if (cur.status === "pending")   return { ...prev, [userId]: { ...cur, status: "released", releaseDate: now } };
      if (cur.status === "released")  return { ...prev, [userId]: { ...cur, status: "returned",  returnDate: now } };
      return prev; // "returned" — no further toggle
    });
  }, []);

  const allSigned = members.every(m => m.signed);

  // ── Build RFQ preview data ───────────────────────────────────────────────
  const buildPreviewData = (): CanvassPreviewData => {
    const deadlineDate = new Date();
    deadlineDate.setDate(deadlineDate.getDate() + 7);
    return {
      prNo:           pr.prNo,
      quotationNo:    bacNo || "—",
      date:           new Date().toLocaleDateString("en-PH"),
      deadline:       deadlineDate.toLocaleDateString("en-PH", {
                        month: "long", day: "numeric", year: "numeric" }),
      bacChairperson: members.find(m => m.designation.includes("Chairperson"))?.name || "BAC Chairperson",
      officeSection:  pr.officeSection,
      purpose:        pr.purpose,
      items:          liveItems.map((item, i) => ({
        itemNo:       i + 1,
        description:  item.desc,
        qty:          item.qty,
        unit:         item.unit,
        unitPrice:    "", // Blank for BAC preview
      })),
      canvasserNames: canvassUsers
        .filter(u => canvassStatuses[u.id]?.status !== "pending")
        .map(u => u.username),
    };
  };

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
            {isViewingCompleted ? (
              <CompletedBanner
                label={`BAC Canvass No. ${bacNo} recorded.`}
                onResubmit={() => setDone(prev => { const n = new Set(prev); n.delete("pr_received"); return n; })}
              />
            ) : (
              <Banner type="info" text="PR has been approved by PARPO. Assign a BAC canvass number to begin." />
            )}
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
{/* ── DB assignment records ── */}
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
                onResubmit={() => setDone(prev => { const n = new Set(prev); n.delete("release_canvass"); return n; })}
              />
            )}

            {/* ── Live assignment list from DB ── */}
            {assignments.length > 0 && (
              <Card>
                <View className="px-4 pt-3 pb-2">
                  <View className="flex-row items-center justify-between mb-2">
                    <Divider label="Assignment Tracker" />
                    <View className="flex-row items-center gap-1.5 ml-2 mb-2.5">
                      <View className="w-2 h-2 rounded-full bg-emerald-500" />
                      <Text className="text-[10px] text-gray-400">
                        {assignments.filter(a => a.status === "returned").length}/{assignments.length} returned
                      </Text>
                    </View>
                  </View>
                  {/* Table header */}
                  <View className="flex-row bg-[#064E3B] rounded-xl px-3 py-1.5 mb-1">
                    <Text className="flex-[2] text-[9px] font-bold uppercase tracking-wide text-white/70">Canvasser</Text>
                    <Text className="flex-1 text-[9px] font-bold uppercase tracking-wide text-white/70">Division</Text>
                    <Text className="flex-1 text-[9px] font-bold uppercase tracking-wide text-white/70 text-center">Released</Text>
                    <Text className="flex-1 text-[9px] font-bold uppercase tracking-wide text-white/70 text-center">Returned</Text>
                  </View>
                  {entriesLoading ? (
                    <View className="items-center py-4">
                      <Text className="text-[12px] text-gray-400">Loading…</Text>
                    </View>
                  ) : (
                    assignments.map((a, i) => {
                      const relDate = a.released_at
                        ? new Date(a.released_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })
                        : "—";
                      const retDate = a.returned_at
                        ? new Date(a.returned_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })
                        : null;
                      return (
                        <View key={a.id}
                          className={`flex-row items-center px-3 py-2 rounded-xl ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
                          style={{ borderWidth: 1, borderColor: "#f3f4f6" }}>
                          <Text className="flex-[2] text-[11.5px] font-semibold text-gray-800" numberOfLines={1}>
                            {canvassUsers.find(u => u.id === a.canvasser_id)?.username ?? `User ${a.canvasser_id}`}
                          </Text>
                          <Text className="flex-1 text-[11px] text-gray-500" numberOfLines={1}>
                            {canvassUsers.find(u => u.id === a.canvasser_id)?.division_name ?? "—"}
                          </Text>
                          <Text className="flex-1 text-[10.5px] text-gray-500 text-center"
                            style={{ fontFamily: MONO }}>{relDate}</Text>
                          <View className="flex-1 items-center">
                            {retDate ? (
                              <View className="bg-emerald-100 px-2 py-0.5 rounded-full">
                                <Text className="text-[9.5px] font-bold text-emerald-700">{retDate}</Text>
                              </View>
                            ) : (
                              <View className="bg-amber-100 px-2 py-0.5 rounded-full">
                                <Text className="text-[9.5px] font-bold text-amber-700">Pending</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              </Card>
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
            <StepHeader stage="collect_canvass" title="Collect & Encode Canvass"
              desc="Collect returned RFQ forms and encode each supplier's quoted prices." />
            <ItemsTable items={liveItems} />

            {/* ── Previously submitted entries from DB ── */}
            {canvassEntries.length > 0 && (
              <Card>
                <View className="px-4 pt-3 pb-2">
                  <View className="flex-row items-center gap-2 mb-1">
                    <Divider label="Submitted Quotations" />
                    <View className="bg-emerald-100 px-2 py-0.5 rounded-full mb-2.5 ml-1">
                      <Text className="text-[10px] font-bold text-emerald-700">
                        {canvassEntries.length} entr{canvassEntries.length === 1 ? "y" : "ies"}
                      </Text>
                    </View>
                  </View>
                  {/* Table header */}
                  <View className="flex-row bg-[#064E3B] rounded-xl px-3 py-1.5 mb-1">
                    <Text className="flex-[3] text-[9px] font-bold uppercase tracking-wide text-white/70">Item / Supplier</Text>
                    <Text className="w-16 text-[9px] font-bold uppercase tracking-wide text-white/70 text-center">Qty</Text>
                    <Text className="w-20 text-[9px] font-bold uppercase tracking-wide text-white/70 text-right">Unit Price</Text>
                    <Text className="w-20 text-[9px] font-bold uppercase tracking-wide text-white/70 text-right">Total</Text>
                  </View>
                  {entriesLoading ? (
                    <View className="items-center py-4">
                      <Text className="text-[12px] text-gray-400">Loading…</Text>
                    </View>
                  ) : (
                    canvassEntries.map((e, i) => (
                      <View key={e.id}
                        className={`px-3 py-2 rounded-xl ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
                        style={{ borderWidth: 1, borderColor: "#f3f4f6" }}>
                        <View className="flex-row items-center">
                          <View className="flex-[3] pr-2">
                            <Text className="text-[11.5px] font-semibold text-gray-800" numberOfLines={1}>
                              {e.description}
                            </Text>
                            <Text className="text-[10.5px] text-gray-400 mt-0.5" numberOfLines={1}>
                              {e.supplier_name}
                            </Text>
                          </View>
                          <Text className="w-16 text-[11px] text-gray-500 text-center"
                            style={{ fontFamily: MONO }}>
                            {e.quantity} {e.unit}
                          </Text>
                          <Text className="w-20 text-[11.5px] font-semibold text-gray-700 text-right"
                            style={{ fontFamily: MONO }}>
                            ₱{fmt(e.unit_price)}
                          </Text>
                          <Text className="w-20 text-[11.5px] font-bold text-[#064E3B] text-right"
                            style={{ fontFamily: MONO }}>
                            ₱{fmt(e.total_price)}
                          </Text>
                        </View>
                      </View>
                    ))
                  )}
                  {/* Grand total row */}
                  {canvassEntries.length > 0 && (
                    <View className="flex-row justify-end mt-1.5 px-3 pt-2"
                      style={{ borderTopWidth: 1, borderTopColor: "#d1fae5" }}>
                      <Text className="text-[11px] font-bold text-gray-500 mr-3">Grand Total</Text>
                      <Text className="text-[12px] font-extrabold text-[#064E3B]"
                        style={{ fontFamily: MONO }}>
                        ₱{fmt(canvassEntries.reduce((s, e) => s + e.total_price, 0))}
                      </Text>
                    </View>
                  )}
                </View>
              </Card>
            )}
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
            {isViewingCompleted && (
              <CompletedBanner
                label="Supplier quotations encoded."
                onResubmit={() => setDone(prev => { const n = new Set(prev); n.delete("collect_canvass"); return n; })}
              />
            )}
{/* Preview RFQ Button */}
            <View className="flex-row justify-center mb-3">
              <TouchableOpacity
                onPress={() => setPreviewOpen(true)}
                activeOpacity={0.8}
                className="flex-row items-center gap-2 px-5 py-2.5 rounded-xl border border-[#064E3B] bg-[#064E3B]">
                <MaterialIcons name="description" size={16} color="#ffffff" />
                <Text className="text-[13px] font-bold text-white">Preview RFQ Form</Text>
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

            {isViewingCompleted ? (
              <CompletedBanner
                label={`Resolution No. ${resNo} recorded. Mode: ${mode}.`}
                onResubmit={() => setDone(prev => { const n = new Set(prev); n.delete("bac_resolution"); return n; })}
              />
            ) : (
              !allSigned && (
                <Banner type="warning"
                  text="All BAC members and PARPO II must sign before proceeding." />
              )
            )}
            <StepNav
              stage={stage}
              done={done}
              onPrev={goToStage}
              onNext={goToStage}
              canSubmit={!isViewingCompleted && allSigned && !!resNo && !!mode}
              submitLabel="Resolve → Prepare AAA"
              onSubmit={handleStep7}
            />
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
            {isViewingCompleted && (
              <CompletedBanner
                label={`AAA No. ${aaaNo} prepared. Forwarded to Supply.`}
                onResubmit={() => setDone(prev => { const n = new Set(prev); n.delete("aaa_preparation"); return n; })}
              />
            )}
            <StepNav
              stage={stage}
              done={done}
              onPrev={goToStage}
              onNext={goToStage}
              canSubmit={!isViewingCompleted && !!aaaNo}
              submitLabel="Finalize & Forward to Supply →"
              onSubmit={handleComplete}
            />
          </View>
        )}

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