/**
 * CanvassingModule.tsx
 * Phase 1 · Stage 2 — Canvass & Resolution (Steps 6–10)
 *
 * Two views based on roleId:
 *   roleId === 2  →  BAC View   — full Steps 6–10 editable workflow
 *   roleId !== 2  →  End-User View — read-only status tracker
 *
 * PR data flows in from PRModule via the `prRecord` prop.
 * UI matches PRModule: NativeWind classes, emerald theme, RecordCard
 * style cards, monospace amounts, status pills, section dividers.
 *
 * Usage:
 *   <CanvassingModule prRecord={pr} roleId={user.role_id} onBack={…} />
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useRef, useState } from "react";
import {
  Alert, KeyboardAvoidingView, Modal, Platform,
  ScrollView, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useAuth } from "../AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CanvassingPRItem {
  id: number; desc: string; stock: string;
  unit: string; qty: number; unitCost: number;
}

export interface CanvassingPR {
  prNo: string; date: string; officeSection: string;
  responsibilityCode: string; purpose: string;
  isHighValue: boolean; budgetNumber?: string | null;
  items: CanvassingPRItem[];
}

type CanvassStage =
  | "pr_received"       // Step 6  — BAC receives PR from PARPO
  | "bac_resolution"    // Step 7  — Prepare BAC Resolution
  | "release_canvass"   // Step 8  — Release to canvassers per division
  | "collect_canvass"   // Step 9  — Collect filled-out canvass + encode quotes
  | "aaa_preparation";  // Step 10 — Prepare & sign Abstract of Awards

interface BACMember   { name: string; designation: string; signed: boolean; signedAt: string; }
interface DivAssign   { section: string; canvasser: string; releaseDate: string; returnDate: string; status: "pending"|"released"|"returned"; }
interface SupplierQ   { id: number; name: string; address: string; contact: string; tin: string; days: string; prices: Record<number,string>; remarks: string; }

export interface CanvassPayload {
  pr_no: string; bac_no: string; resolution_no: string; mode: string;
  aaa_no: string; awarded_supplier: string; awarded_total: number;
  suppliers: SupplierQ[]; bac_members: BACMember[];
}

export interface CanvassingModuleProps {
  prRecord?:   CanvassingPR;
  roleId?:     number;           // 2 = BAC; anything else = end-user
  onComplete?: (payload: CanvassPayload) => void;
  onBack?:     () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO   = Platform.OS === "ios" ? "Courier New" : "monospace";
const TODAY  = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });

const STAGE_ORDER: CanvassStage[] = [
  "pr_received","bac_resolution","release_canvass","collect_canvass","aaa_preparation",
];

const STAGE_META: Record<CanvassStage, { step: number; label: string; icon: keyof typeof MaterialIcons.glyphMap }> = {
  pr_received:     { step: 6,  label: "PR Received",    icon: "inbox"             },
  bac_resolution:  { step: 7,  label: "Resolution",     icon: "gavel"             },
  release_canvass: { step: 8,  label: "Release",        icon: "send"              },
  collect_canvass: { step: 9,  label: "Collect",        icon: "assignment-return" },
  aaa_preparation: { step: 10, label: "AAA",            icon: "emoji-events"      },
};

const STAGE_DESC: Record<CanvassStage, string> = {
  pr_received:     "BAC has received your approved PR from PARPO's office.",
  bac_resolution:  "BAC is preparing the resolution and collecting signatures.",
  release_canvass: "Canvass sheets released to divisions. Returns due in 7 days.",
  collect_canvass: "BAC is collecting and encoding supplier quotations.",
  aaa_preparation: "BAC is preparing the Abstract of Awards for signature.",
};

const PROC_MODES = [
  "Small Value Procurement (SVP)","Competitive Bidding",
  "Direct Contracting","Shopping","Negotiated Procurement",
];

const DIVISIONS  = ["STOD","LTSP","ARBDSP","Legal","PARPO","PARAD","TDG Unit","Budget","Accounting"];
const CANVASSERS: Record<string,string> = {
  STOD:"Yvonne M.", LTSP:"Mariel T.", ARBDSP:"Robert A.",
  Legal:"Angel D.", PARPO:"Nessie P.", PARAD:"Viviene S.",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt      = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const prTotal  = (items: CanvassingPRItem[]) => items.reduce((s, i) => s + i.qty * i.unitCost, 0);
const nowTime  = () => new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });

const mkDivisions  = (): DivAssign[] => DIVISIONS.map(sec => ({
  section: sec, canvasser: CANVASSERS[sec] ?? "—", releaseDate: "", returnDate: "", status: "pending",
}));
const mkBACMembers = (): BACMember[] => [
  { name: "Yvonne M.", designation: "BAC Chairperson",   signed: false, signedAt: "" },
  { name: "Mariel T.", designation: "BAC Member",        signed: false, signedAt: "" },
  { name: "Robert A.", designation: "BAC Member",        signed: false, signedAt: "" },
  { name: "PARPO II",  designation: "PARPO / Approver",  signed: false, signedAt: "" },
];
const mkSupplier = (id: number): SupplierQ => ({
  id, name: "", address: "", contact: "", tin: "", days: "", prices: {}, remarks: "",
});

// ─── Shared UI atoms — match PRModule visual language ─────────────────────────

/** Uppercase label + horizontal rule — mirrors PRModule's section headers */
const Divider = ({ label }: { label: string }) => (
  <View className="flex-row items-center gap-2 mb-2.5 mt-1">
    <Text className="text-[9.5px] font-bold tracking-widest uppercase text-gray-400">{label}</Text>
    <View className="flex-1 h-px bg-gray-200" />
  </View>
);

/** White card — mirrors RecordCard container */
const Card = ({ children, className, style }: { children: React.ReactNode; className?: string; style?: object }) => (
  <View className={`bg-white rounded-3xl border border-gray-200 mb-3 overflow-hidden ${className ?? ""}`}
    style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 3, ...style }}>
    {children}
  </View>
);

/** Form field wrapper */
const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
  <View className="mb-3">
    <View className="flex-row gap-1 mb-1">
      <Text className="text-[12px] font-semibold text-gray-700">{label}</Text>
      {required && <Text className="text-[12px] font-bold text-red-500">*</Text>}
    </View>
    {children}
  </View>
);

/** Styled TextInput with focus ring */
const Input = ({ value, onChange, placeholder, readonly, numeric, multi }: {
  value: string; onChange?: (v: string) => void; placeholder?: string;
  readonly?: boolean; numeric?: boolean; multi?: boolean;
}) => {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value} onChangeText={onChange} placeholder={placeholder}
      placeholderTextColor="#9ca3af" editable={!readonly}
      keyboardType={numeric ? "decimal-pad" : "default"} multiline={multi}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      className={`rounded-xl px-3 py-2.5 text-[13px] ${readonly ? "bg-gray-50 text-gray-400" : "bg-white text-gray-900"}`}
      style={{
        borderWidth: 1.5,
        borderColor: readonly ? "#e5e7eb" : focused ? "#52b788" : "#e5e7eb",
        fontFamily: readonly ? MONO : undefined,
        minHeight: multi ? 72 : undefined, textAlignVertical: multi ? "top" : undefined,
      }}
    />
  );
};

/** Bottom-sheet picker */
const Picker = ({ title, options, value, onSelect }: {
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
        <TouchableOpacity className="flex-1 bg-black/50" activeOpacity={1} onPress={() => setOpen(false)} />
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
                className={`flex-row justify-between items-center px-5 py-3.5 border-b border-gray-50 ${opt === value ? "bg-emerald-50" : ""}`}>
                <Text className={`text-[14px] ${opt === value ? "font-bold text-[#1a4d2e]" : "text-gray-700"}`}>{opt}</Text>
                {opt === value && <MaterialIcons name="check" size={16} color="#52b788" />}
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View className="h-6" />
        </View>
      </Modal>
    </View>
  );
};

/** Info / warning banner */
const Banner = ({ type, text }: { type: "info"|"warning"; text: string }) => (
  <View className={`flex-row gap-2.5 rounded-xl p-3 mb-3 ${type === "info" ? "bg-emerald-50" : "bg-amber-50"}`}
    style={{ borderLeftWidth: 4, borderLeftColor: type === "info" ? "#52b788" : "#c9a84c" }}>
    <MaterialIcons name={type === "info" ? "info" : "warning"} size={16}
      color={type === "info" ? "#2d6a4f" : "#7a5000"} style={{ marginTop: 1 }} />
    <Text className={`flex-1 text-[12.5px] leading-5 ${type === "info" ? "text-emerald-900" : "text-amber-900"}`}>
      {text}
    </Text>
  </View>
);

/** Primary / ghost button — matches PRModule's action buttons */
const Btn = ({ label, onPress, disabled, ghost }: {
  label: string; onPress: () => void; disabled?: boolean; ghost?: boolean;
}) => (
  <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.8}
    className={`px-5 py-2.5 rounded-xl ${ghost ? "bg-transparent border border-gray-200" : disabled ? "bg-gray-300" : "bg-[#064E3B]"}`}>
    <Text className={`text-[13px] font-bold ${ghost ? "text-gray-400" : "text-white"}`}>{label}</Text>
  </TouchableOpacity>
);

/** Step number badge — monospace, mirrors PRModule prNo style */
const StepBadge = ({ step }: { step: number }) => (
  <View className="bg-[#064E3B] rounded-xl px-3 py-2 items-center">
    <Text className="text-[22px] font-bold text-white" style={{ fontFamily: MONO, lineHeight: 26 }}>
      {String(step).padStart(2,"0")}
    </Text>
    <Text className="text-[8px] font-bold tracking-widest uppercase text-white/50 mt-0.5">STEP</Text>
  </View>
);

/** Horizontal stage strip — shown in BAC header */
const StageStrip = ({ current, completed }: { current: CanvassStage; completed: Set<CanvassStage> }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false}
    className="bg-[#064E3B]"
    contentContainerStyle={{ flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 4 }}>
    {STAGE_ORDER.map((s, i) => {
      const meta = STAGE_META[s]; const done = completed.has(s); const active = s === current;
      return (
        <React.Fragment key={s}>
          <View className="items-center gap-1">
            <View className={`w-7 h-7 rounded-full items-center justify-center ${done ? "bg-[#52b788]" : active ? "bg-white" : "bg-white/15"}`}>
              <MaterialIcons name={done ? "check" : meta.icon} size={13}
                color={done ? "#1a4d2e" : active ? "#064E3B" : "rgba(255,255,255,0.4)"} />
            </View>
            <Text className="text-[9px] font-bold text-center max-w-[54px]"
              style={{ color: active ? "#fff" : done ? "#52b788" : "rgba(255,255,255,0.35)" }}>
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

/** Step title block used at the top of every BAC step */
const StepHeader = ({ stage, title, desc }: { stage: CanvassStage; title: string; desc: string }) => (
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

/** Dark PR summary card — mirrors RecordCard header (emerald, monospace) */
const PRCard = ({ pr }: { pr: CanvassingPR }) => (
  <Card className="bg-[#064E3B]">
    <View className="px-4 pt-3.5 pb-3">
      <View className="flex-row justify-between items-start mb-2.5">
        <View>
          <Text className="text-[9px] font-bold tracking-widest uppercase text-white/40">Purchase Request</Text>
          <Text className="text-[16px] font-bold text-white mt-0.5" style={{ fontFamily: MONO }}>{pr.prNo}</Text>
          <Text className="text-[11.5px] font-semibold text-emerald-400 mt-0.5">{pr.officeSection} · {pr.date}</Text>
        </View>
        {pr.isHighValue && (
          <View className="bg-amber-800 px-2 py-1 rounded-lg">
            <Text className="text-[9.5px] font-bold text-white uppercase tracking-wide">High-Value</Text>
          </View>
        )}
      </View>
      <View className="h-px bg-white/10 mb-2" />
      {pr.items.map(item => (
        <View key={item.id} className="flex-row justify-between py-0.5">
          <Text className="text-[11px] text-white/50 flex-1 pr-2" numberOfLines={1}>{item.desc}</Text>
          <Text className="text-[11px] text-white/30" style={{ fontFamily: MONO }}>₱{fmt(item.qty * item.unitCost)}</Text>
        </View>
      ))}
      <View className="flex-row justify-between mt-2.5 pt-2.5 border-t border-white/10">
        <Text className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Total</Text>
        <Text className="text-[14px] font-bold text-emerald-400" style={{ fontFamily: MONO }}>₱{fmt(prTotal(pr.items))}</Text>
      </View>
    </View>
  </Card>
);

/** Items breakdown table — matches PRModule's inline item list */
const ItemsTable = ({ items }: { items: CanvassingPRItem[] }) => (
  <Card>
    <View className="px-4 pt-3 pb-2">
      <Divider label="Line Items" />
      <View className="rounded-xl overflow-hidden border border-gray-100">
        <View className="flex-row bg-[#064E3B] px-2.5 py-1.5">
          {["Description","Unit","Qty","Unit Cost","Total"].map((h, i) => (
            <Text key={h} className="text-[9.5px] font-bold uppercase tracking-wide text-white/70"
              style={{ flex: i === 0 ? 2 : 1, textAlign: i > 1 ? "right" : "left" }}>
              {h}
            </Text>
          ))}
        </View>
        {items.map((item, i) => (
          <View key={item.id} className={`flex-row px-2.5 py-2 ${i % 2 ? "bg-gray-50" : "bg-white"}`}
            style={{ borderTopWidth: 1, borderTopColor: "#f3f4f6" }}>
            <Text className="flex-[2] text-[12px] text-gray-700" numberOfLines={2}>{item.desc}</Text>
            <Text className="flex-1 text-[12px] text-gray-500">{item.unit}</Text>
            <Text className="flex-1 text-[12px] text-gray-700 text-right" style={{ fontFamily: MONO }}>{item.qty}</Text>
            <Text className="flex-1 text-[12px] text-gray-700 text-right" style={{ fontFamily: MONO }}>₱{fmt(item.unitCost)}</Text>
            <Text className="flex-1 text-[12px] font-semibold text-[#2d6a4f] text-right" style={{ fontFamily: MONO }}>₱{fmt(item.qty * item.unitCost)}</Text>
          </View>
        ))}
      </View>
    </View>
  </Card>
);

/** Signatory list with tap-to-sign — matches RecordCard action button row */
const Signatories = ({ members, onSign, title = "Signatories" }: {
  members: BACMember[]; onSign: (i: number) => void; title?: string;
}) => (
  <Card>
    <View className="px-4 pt-3 pb-2">
      <View className="flex-row items-center gap-2 mb-3">
        <Text className="text-[9.5px] font-bold tracking-widest uppercase text-gray-400">{title}</Text>
        <View className="bg-emerald-100 px-2 py-0.5 rounded-md">
          <Text className="text-[10px] font-bold text-emerald-700">
            {members.filter(m => m.signed).length}/{members.length} signed
          </Text>
        </View>
        <View className="flex-1 h-px bg-gray-200" />
      </View>
      {members.map((m, idx) => (
        <View key={m.name}
          className={`flex-row items-center justify-between p-3 mb-2 rounded-2xl border ${m.signed ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-200"}`}>
          <View className="flex-row items-center gap-2.5 flex-1">
            <View className={`w-8 h-8 rounded-lg items-center justify-center border ${m.signed ? "bg-emerald-500 border-emerald-500" : "bg-gray-100 border-gray-200"}`}>
              <Text className="text-[12px] font-bold" style={{ color: m.signed ? "#fff" : "#6b7280" }}>
                {m.signed ? "✓" : m.name[0]}
              </Text>
            </View>
            <View>
              <Text className={`text-[13px] font-semibold ${m.signed ? "text-emerald-800" : "text-gray-800"}`}>{m.name}</Text>
              <Text className="text-[11px] text-gray-400">{m.designation}</Text>
            </View>
          </View>
          {m.signed
            ? <View className="items-end"><Text className="text-[11.5px] font-semibold text-emerald-600">✅ Signed</Text><Text className="text-[10px] text-gray-400">at {m.signedAt}</Text></View>
            : <TouchableOpacity onPress={() => onSign(idx)} activeOpacity={0.8} className="px-3.5 py-1.5 rounded-lg border border-gray-200 bg-white"><Text className="text-[12px] font-semibold text-gray-500">✍️ Sign</Text></TouchableOpacity>
          }
        </View>
      ))}
    </View>
  </Card>
);

/** Division canvasser row with Release / Receive buttons */
const DivRow = ({ div, onAction }: { div: DivAssign; onAction: () => void }) => {
  const pill = {
    pending:  { bg: "bg-amber-50",    text: "text-amber-700",   label: "Pending"  },
    released: { bg: "bg-emerald-50",  text: "text-emerald-700", label: "Released" },
    returned: { bg: "bg-blue-50",     text: "text-blue-700",    label: "Returned" },
  }[div.status];
  return (
    <View className={`flex-row items-center gap-2 p-2.5 mb-1.5 rounded-2xl border ${div.status !== "pending" ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-200"}`}>
      <View className="w-16">
        <Text className="text-[10.5px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded-md text-center">{div.section}</Text>
      </View>
      <Text className="flex-1 text-[12.5px] text-gray-700">{div.canvasser}</Text>
      <Text className="text-[10.5px] text-gray-400 w-18" style={{ fontFamily: MONO }} numberOfLines={1}>
        {div.releaseDate || div.returnDate || "—"}
      </Text>
      <View className={`px-2 py-0.5 rounded-full ${pill.bg}`}>
        <Text className={`text-[10px] font-bold ${pill.text}`}>{pill.label}</Text>
      </View>
      {div.status !== "returned" && (
        <TouchableOpacity onPress={onAction} activeOpacity={0.8}
          className={`px-2.5 py-1 rounded-lg ${div.status === "pending" ? "bg-emerald-600" : "bg-blue-600"}`}>
          <Text className="text-[11px] font-bold text-white">
            {div.status === "pending" ? "📤 Release" : "📥 Receive"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

/** Progress bar — mirrors PRModule's stat strip proportions */
const ProgressBar = ({ done, total, label }: { done: number; total: number; label: string }) => {
  const pct = Math.round((done / Math.max(total, 1)) * 100);
  return (
    <View className="flex-row items-center gap-3 bg-gray-50 rounded-2xl p-3 mb-3">
      <View className="flex-1">
        <View className="flex-row justify-between mb-1.5">
          <Text className="text-[11px] font-semibold text-gray-500">{label}</Text>
          <Text className="text-[11px] font-semibold text-gray-500">{done}/{total}</Text>
        </View>
        <View className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <View className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
        </View>
      </View>
      <Text className="text-[18px] font-bold text-[#1a4d2e]" style={{ fontFamily: MONO }}>{pct}%</Text>
    </View>
  );
};

// ─── BAC Steps ────────────────────────────────────────────────────────────────

const Step6 = ({ pr, onDone }: { pr: CanvassingPR; onDone: () => void }) => {
  const [bacNo, setBacNo]     = useState("");
  const [rcvBy, setRcvBy]     = useState("Yvonne M.");
  const [notes, setNotes]     = useState("");
  return (
    <>
      <StepHeader stage="pr_received" title="PR Received from PARPO"
        desc="BAC receives the approved PR from PARPO's Office. Assign a BAC canvass number and acknowledge receipt." />
      <Banner type="info" text="PR has been approved by PARPO and budget earmarked. Assign BAC canvass number to continue." />
      <PRCard pr={pr} />
      <ItemsTable items={pr.items} />
      <Card>
        <View className="px-4 pt-3 pb-2">
          <Divider label="BAC Acknowledgement" />
          <View className="flex-row gap-2.5">
            <View className="flex-1">
              <Field label="BAC Canvass No." required>
                <Input value={bacNo} onChange={setBacNo} placeholder="e.g. 2026-BAC-0042" />
              </Field>
            </View>
            <View className="flex-1">
              <Field label="Date Received"><Input value={TODAY} readonly /></Field>
            </View>
          </View>
          <Field label="Received By" required>
            <Picker title="Received By" options={["Yvonne M.","Mariel T."]} value={rcvBy} onSelect={setRcvBy} />
          </Field>
          <Field label="Remarks / Notes">
            <Input value={notes} onChange={setNotes} placeholder="Any observations…" multi />
          </Field>
        </View>
      </Card>
      <View className="flex-row justify-end gap-2.5 mt-1">
        <Btn ghost label="Save Draft" onPress={() => {}} />
        <Btn label="Acknowledge Receipt →" disabled={!bacNo} onPress={onDone} />
      </View>
    </>
  );
};

const Step7 = ({ pr, members, setMembers, onDone }: {
  pr: CanvassingPR; members: BACMember[];
  setMembers: React.Dispatch<React.SetStateAction<BACMember[]>>; onDone: () => void;
}) => {
  const [resNo, setResNo]   = useState("");
  const [mode,  setMode]    = useState("");
  const [basis, setBasis]   = useState("");
  const allSigned = members.every(m => m.signed);
  const sign = (i: number) =>
    setMembers(m => m.map((mb, idx) => idx === i ? { ...mb, signed: true, signedAt: nowTime() } : mb));
  return (
    <>
      <StepHeader stage="bac_resolution" title="BAC Resolution"
        desc="Prepare the BAC Resolution with mode of procurement and collect all required signatures." />
      <Card>
        <View className="px-4 pt-3 pb-2">
          <Divider label="Resolution Details" />
          <View className="flex-row gap-2.5">
            <View className="flex-1">
              <Field label="Resolution No." required>
                <Input value={resNo} onChange={setResNo} placeholder="e.g. 2026-RES-001" />
              </Field>
            </View>
            <View className="flex-1">
              <Field label="PR Reference"><Input value={pr.prNo} readonly /></Field>
            </View>
          </View>
          <Field label="Mode of Procurement" required>
            <Picker title="Mode of Procurement" options={PROC_MODES} value={mode} onSelect={setMode} />
          </Field>
          <Field label="Legal Basis / Justification" required>
            <Input value={basis} onChange={setBasis} placeholder="Cite applicable law or regulation…" multi />
          </Field>
          <Field label="Date Prepared"><Input value={TODAY} readonly /></Field>
        </View>
      </Card>
      {!allSigned && <Banner type="warning" text="All BAC members and PARPO II must sign before releasing the canvass." />}
      <Signatories members={members} onSign={sign} />
      <View className="flex-row justify-end gap-2.5 mt-1">
        <Btn ghost label="Save Draft" onPress={() => {}} />
        <Btn label="Resolution Finalized → Release Canvass" disabled={!allSigned || !resNo || !mode} onPress={onDone} />
      </View>
    </>
  );
};

const Step8 = ({ divs, setDivs, onDone }: {
  divs: DivAssign[]; setDivs: React.Dispatch<React.SetStateAction<DivAssign[]>>; onDone: () => void;
}) => {
  const released    = divs.filter(d => d.status !== "pending").length;
  const allReleased = divs.every(d => d.status !== "pending");
  const releaseOne  = (i: number) =>
    setDivs(d => d.map((div, idx) => idx === i ? { ...div, status: "released", releaseDate: TODAY } : div));
  const releaseAll  = () =>
    setDivs(d => d.map(div => div.status === "pending" ? { ...div, status: "released", releaseDate: TODAY } : div));
  return (
    <>
      <StepHeader stage="release_canvass" title="Release Canvass to Divisions"
        desc="Release canvass sheets to designated canvassers per division. Must be returned within 7 days." />
      <Banner type="warning" text="Availability check: Verify canvassers are not on travel before releasing." />
      <ProgressBar done={released} total={divs.length} label="Release Progress" />
      <Card>
        <View className="px-4 pt-3 pb-2">
          <View className="flex-row justify-between items-center mb-2">
            <Divider label="Canvassers by Division" />
            {!allReleased && (
              <TouchableOpacity onPress={releaseAll} activeOpacity={0.8}
                className="bg-[#064E3B] px-3 py-1.5 rounded-xl mb-2.5">
                <Text className="text-[11px] font-bold text-white">Release All</Text>
              </TouchableOpacity>
            )}
          </View>
          {divs.map((div, i) => <DivRow key={div.section} div={div} onAction={() => releaseOne(i)} />)}
        </View>
      </Card>
      <View className="flex-row justify-end gap-2.5 mt-1">
        <Btn ghost label="Save Draft" onPress={() => {}} />
        <Btn label="All Released → Await Returns" disabled={!allReleased} onPress={onDone} />
      </View>
    </>
  );
};

const Step9 = ({ pr, divs, setDivs, suppliers, setSuppliers, onDone }: {
  pr: CanvassingPR;
  divs: DivAssign[]; setDivs: React.Dispatch<React.SetStateAction<DivAssign[]>>;
  suppliers: SupplierQ[]; setSuppliers: React.Dispatch<React.SetStateAction<SupplierQ[]>>;
  onDone: () => void;
}) => {
  const nextId     = useRef(suppliers.length + 1);
  const returned   = divs.filter(d => d.status === "returned").length;
  const hasQuotes  = suppliers.some(sp => sp.name && Object.keys(sp.prices).length > 0);
  const addSup     = () => setSuppliers(s => [...s, mkSupplier(nextId.current++)]);
  const removeSup  = (id: number) => setSuppliers(s => s.filter(sp => sp.id !== id));
  const updateSup  = (id: number, f: keyof SupplierQ, v: string) =>
    setSuppliers(s => s.map(sp => sp.id === id ? { ...sp, [f]: v } : sp));
  const updatePrice = (suppId: number, itemId: number, v: string) =>
    setSuppliers(s => s.map(sp => sp.id === suppId ? { ...sp, prices: { ...sp.prices, [itemId]: v } } : sp));
  const markRet = (i: number) =>
    setDivs(d => d.map((div, idx) => idx === i ? { ...div, status: "returned", returnDate: TODAY } : div));

  return (
    <>
      <StepHeader stage="collect_canvass" title="Receive Filled-Out Canvass"
        desc="Collect completed canvass forms and encode supplier quotations. Due within 7 days of release." />
      <ProgressBar done={returned} total={divs.length} label="Returns Received" />

      {/* Track returns */}
      <Card>
        <View className="px-4 pt-3 pb-2">
          <Divider label="Track Canvass Returns" />
          {divs.map((div, i) => <DivRow key={div.section} div={div} onAction={() => markRet(i)} />)}
        </View>
      </Card>

      {/* Supplier quotes */}
      <Card>
        <View className="px-4 pt-3 pb-2">
          <View className="flex-row items-center gap-2 mb-2.5">
            <Divider label="Supplier Quotations" />
            <View className="bg-emerald-100 px-2 py-0.5 rounded-md mb-2.5">
              <Text className="text-[10px] font-bold text-emerald-700">
                {suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}
              </Text>
            </View>
          </View>

          {suppliers.map((sp, sIdx) => (
            <View key={sp.id} className="border border-gray-200 rounded-2xl mb-3 overflow-hidden">
              {/* Supplier header */}
              <View className="flex-row items-center justify-between px-3 py-2.5 bg-gray-50">
                <View className="flex-row items-center gap-2">
                  <View className="w-6 h-6 rounded-lg bg-[#064E3B] items-center justify-center">
                    <Text className="text-[12px] font-bold text-white">{sIdx + 1}</Text>
                  </View>
                  <Text className="text-[13.5px] font-semibold text-gray-800">
                    {sp.name || `Supplier ${sIdx + 1}`}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => removeSup(sp.id)} hitSlop={8}
                  className="p-1.5 rounded-lg border border-gray-200">
                  <MaterialIcons name="close" size={13} color="#c0392b" />
                </TouchableOpacity>
              </View>

              <View className="p-3 gap-2.5">
                <View className="flex-row gap-2.5">
                  <View className="flex-[2]">
                    <Field label="Supplier Name" required>
                      <Input value={sp.name} onChange={v => updateSup(sp.id, "name", v)} placeholder="Business / trade name" />
                    </Field>
                  </View>
                  <View className="flex-1">
                    <Field label="TIN No.">
                      <Input value={sp.tin} onChange={v => updateSup(sp.id, "tin", v)} placeholder="000-000-000" />
                    </Field>
                  </View>
                </View>
                <View className="flex-row gap-2.5">
                  <View className="flex-[2]">
                    <Field label="Address">
                      <Input value={sp.address} onChange={v => updateSup(sp.id, "address", v)} placeholder="Business address" />
                    </Field>
                  </View>
                  <View className="flex-1">
                    <Field label="Contact No.">
                      <Input value={sp.contact} onChange={v => updateSup(sp.id, "contact", v)} placeholder="09XX-XXX-XXXX" />
                    </Field>
                  </View>
                </View>
                <View className="flex-row gap-2.5">
                  <View className="flex-1">
                    <Field label="Delivery (days)">
                      <Input value={sp.days} onChange={v => updateSup(sp.id, "days", v)} placeholder="e.g. 7" numeric />
                    </Field>
                  </View>
                  <View className="flex-[2]">
                    <Field label="Remarks">
                      <Input value={sp.remarks} onChange={v => updateSup(sp.id, "remarks", v)} placeholder="Warranty, terms…" />
                    </Field>
                  </View>
                </View>

                {/* Per-item unit prices */}
                <Divider label="Unit Prices Quoted (₱)" />
                <View className="rounded-xl overflow-hidden border border-gray-100">
                  <View className="flex-row bg-[#064E3B] px-2.5 py-1.5">
                    {["Item","Unit","Qty","Unit Price ₱","Line Total"].map((h, i) => (
                      <Text key={h} className="text-[9px] font-bold uppercase tracking-wide text-white/70"
                        style={{ flex: i === 0 ? 2 : 1, textAlign: i > 1 ? "right" : "left" }}>
                        {h}
                      </Text>
                    ))}
                  </View>
                  {pr.items.map((item, i) => {
                    const price = parseFloat(sp.prices[item.id] || "0") || 0;
                    return (
                      <View key={item.id} className={`flex-row items-center px-2.5 py-1.5 ${i % 2 ? "bg-gray-50" : "bg-white"}`}
                        style={{ borderTopWidth: 1, borderTopColor: "#f3f4f6" }}>
                        <Text className="flex-[2] text-[11.5px] text-gray-700" numberOfLines={1}>{item.desc}</Text>
                        <Text className="flex-1 text-[11.5px] text-gray-400">{item.unit}</Text>
                        <Text className="flex-1 text-[11.5px] text-right text-gray-700" style={{ fontFamily: MONO }}>{item.qty}</Text>
                        <View className="flex-1 items-end">
                          <TextInput
                            value={sp.prices[item.id] ?? ""}
                            onChangeText={v => updatePrice(sp.id, item.id, v)}
                            keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#9ca3af"
                            style={{ borderWidth: 1.5, borderColor: "#e5e7eb", borderRadius: 6,
                              paddingHorizontal: 6, paddingVertical: 4,
                              fontSize: 12, fontFamily: MONO, textAlign: "right", width: 70, color: "#111" }}
                          />
                        </View>
                        <Text className="flex-1 text-[11.5px] font-semibold text-right"
                          style={{ fontFamily: MONO, color: price > 0 ? "#2d6a4f" : "#9ca3af" }}>
                          {price > 0 ? `₱${fmt(price * item.qty)}` : "—"}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          ))}

          <TouchableOpacity onPress={addSup} activeOpacity={0.8}
            className="flex-row items-center justify-center gap-1.5 py-3 rounded-2xl"
            style={{ borderWidth: 2, borderStyle: "dashed", borderColor: "#d1d5db" }}>
            <MaterialIcons name="add" size={18} color="#2d6a4f" />
            <Text className="text-[13px] font-semibold text-[#2d6a4f]">Add Supplier Quote</Text>
          </TouchableOpacity>
        </View>
      </Card>

      <View className="flex-row justify-end gap-2.5 mt-1">
        <Btn ghost label="Save Draft" onPress={() => {}} />
        <Btn label="Encode Complete → Prepare AAA" disabled={!hasQuotes} onPress={onDone} />
      </View>
    </>
  );
};

const Step10 = ({ pr, suppliers, members, onDone }: {
  pr: CanvassingPR; suppliers: SupplierQ[];
  members: BACMember[];
  onDone: (awarded: { name: string; total: number }) => void;
}) => {
  const [aaaNo,    setAAANo]    = useState(`${new Date().getFullYear()}-AAA-${pr.prNo.slice(-4)}`);
  const [aaaMembs, setAAAMembs] = useState<BACMember[]>(() => members.map(m => ({ ...m, signed: false, signedAt: "" })));
  const allSigned = aaaMembs.every(m => m.signed);
  const sign = (i: number) =>
    setAAAMembs(m => m.map((mb, idx) => idx === i ? { ...mb, signed: true, signedAt: nowTime() } : mb));

  const supTotals = suppliers.map(sp => ({
    sp, total: pr.items.reduce((s, item) => s + (parseFloat(sp.prices[item.id] || "0") || 0) * item.qty, 0),
  }));
  const lowest = supTotals.reduce(
    (best, cur) => cur.total > 0 && (!best || cur.total < best.total) ? cur : best,
    null as typeof supTotals[0] | null,
  );

  return (
    <>
      <StepHeader stage="aaa_preparation" title="Abstract of Awards"
        desc="Summarize all quotations. The lowest compliant bidder is recommended for award." />

      {/* AAA header */}
      <Card>
        <View className="px-4 pt-3 pb-2">
          <Divider label="AAA Details" />
          <View className="flex-row gap-2.5">
            <View className="flex-1"><Field label="AAA No."><Input value={aaaNo} onChange={setAAANo} /></Field></View>
            <View className="flex-1"><Field label="PR Reference"><Input value={pr.prNo} readonly /></Field></View>
            <View className="flex-1"><Field label="Date Prepared"><Input value={TODAY} readonly /></Field></View>
          </View>
        </View>
      </Card>

      {/* Price comparison */}
      <Card>
        <View className="px-4 pt-3 pb-2">
          <Divider label="Canvass Price Comparison" />
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              {/* Header */}
              <View className="flex-row bg-[#064E3B] rounded-xl px-2.5 py-2">
                {["Item","Unit","Qty",...suppliers.map((s,i) => s.name || `Supplier ${i+1}`),"Lowest ₱","Awarded To"].map((h, i) => (
                  <Text key={`h-${i}`} className="text-[9.5px] font-bold uppercase tracking-wide text-white/75"
                    style={{ width: i < 3 ? (i === 0 ? 140 : 48) : 100, textAlign: i > 1 ? "right" : "left" }}>
                    {h}
                  </Text>
                ))}
              </View>
              {/* Rows */}
              {pr.items.map((item, ri) => {
                const prices  = suppliers.map(sp => parseFloat(sp.prices[item.id] || "0") || 0);
                const low     = prices.length ? Math.min(...prices.filter(p => p > 0)) : 0;
                const winner  = suppliers.find(sp => parseFloat(sp.prices[item.id] || "0") === low);
                return (
                  <View key={item.id} className={`flex-row px-2.5 py-2 ${ri % 2 ? "bg-gray-50" : "bg-white"}`}
                    style={{ borderTopWidth: 1, borderTopColor: "#f3f4f6"}}>
                    <Text style={{ width: 140 }} className="text-[12px] text-gray-700" numberOfLines={2}>{item.desc}</Text>
                    <Text style={{ width: 48 }} className="text-[12px] text-gray-400">{item.unit}</Text>
                    <Text style={{ width: 48 }} className="text-[12px] text-right text-gray-700">{item.qty}</Text>
                    {prices.map((p, pi) => (
                      <Text key={pi} style={{ width: 100, fontFamily: MONO }}
                        className={`text-[12px] text-right ${p === low && p > 0 ? "font-bold text-emerald-700" : "text-gray-700"}`}>
                        {p > 0 ? `₱${fmt(p)}` : "—"}
                      </Text>
                    ))}
                    <Text style={{ width: 100, fontFamily: MONO }} className="text-[12px] font-bold text-emerald-700 text-right">
                      {low > 0 ? `₱${fmt(low)}` : "—"}
                    </Text>
                    <Text style={{ width: 100 }} className="text-[11px] font-semibold text-[#1a4d2e]" numberOfLines={1}>
                      {winner?.name || "—"}
                    </Text>
                  </View>
                );
              })}
              {/* Grand totals */}
              <View className="flex-row px-2.5 py-2.5 bg-emerald-50" style={{ borderTopWidth: 2, borderTopColor: "#52b788" }}>
                <Text style={{ width: 236 }} className="text-[11px] font-bold uppercase tracking-wide text-[#1a4d2e]">Grand Total</Text>
                {supTotals.map(({ sp, total }) => (
                  <Text key={sp.id} style={{ width: 100, fontFamily: MONO }}
                    className={`text-[13px] font-bold text-right ${lowest?.sp.id === sp.id ? "text-emerald-700" : "text-gray-700"}`}>
                    {total > 0 ? `₱${fmt(total)}` : "—"}
                  </Text>
                ))}
              </View>
            </View>
          </ScrollView>

          {lowest && (
            <View className="flex-row items-center gap-2.5 mt-3.5 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
              <Text className="text-[18px]">🏆</Text>
              <Text className="flex-1 text-[13px] text-gray-700 leading-5">
                Recommended awardee: <Text className="font-bold">{lowest.sp.name}</Text>
                {" "}— total of <Text className="font-bold text-emerald-700">₱{fmt(lowest.total)}</Text>
              </Text>
            </View>
          )}
        </View>
      </Card>

      <Signatories members={aaaMembs} onSign={sign} title="AAA Signatories" />

      {allSigned && lowest ? (
        <View className="bg-[#064E3B] rounded-3xl p-5 mb-3">
          <Text className="text-[10px] font-bold tracking-widest uppercase text-emerald-400 mb-1">Canvassing Complete ✓</Text>
          <Text className="text-[20px] font-extrabold text-white mb-1">Proceed to Phase 2 – Evaluation</Text>
          <Text className="text-[12.5px] text-white/60 leading-5 mb-4">
            AAA signed. Forward to Supply Section with PR, canvass sheets, BAC Resolution, and proposals.
          </Text>
          <TouchableOpacity onPress={() => onDone({ name: lowest.sp.name, total: lowest.total })}
            activeOpacity={0.8} className="bg-emerald-400 self-end px-5 py-3 rounded-xl">
            <Text className="text-[14px] font-bold text-[#1a4d2e]">Forward to Supply Section →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View className="flex-row justify-end gap-2.5 mt-1">
          <Btn ghost label="Save Draft" onPress={() => {}} />
          <Btn label="Awaiting Signatures…" disabled onPress={() => {}} />
        </View>
      )}
    </>
  );
};

// ─── BAC View (roleId === 2) ──────────────────────────────────────────────────

function BACView({ pr, onComplete, onBack }: {
  pr: CanvassingPR;
  onComplete?: CanvassingModuleProps["onComplete"];
  onBack?: () => void;
}) {
  const [stage,   setStage]   = useState<CanvassStage>("pr_received");
  const [done,    setDone]    = useState<Set<CanvassStage>>(new Set());
  const [members, setMembers] = useState<BACMember[]>(mkBACMembers);
  const [divs,    setDivs]    = useState<DivAssign[]>(mkDivisions);
  const [supps,   setSupps]   = useState<SupplierQ[]>([mkSupplier(1)]);
  const sessionRef = useRef<Partial<CanvassPayload>>({ pr_no: pr.prNo });

  const advance = useCallback((current: CanvassStage) => {
    setDone(s => new Set([...s, current]));
    const idx = STAGE_ORDER.indexOf(current);
    if (idx < STAGE_ORDER.length - 1) setStage(STAGE_ORDER[idx + 1]);
  }, []);

  const handleComplete = useCallback((awarded: { name: string; total: number }) => {
    const payload: CanvassPayload = {
      pr_no: pr.prNo, bac_no: sessionRef.current.bac_no ?? "",
      resolution_no: sessionRef.current.resolution_no ?? "", mode: sessionRef.current.mode ?? "",
      aaa_no: sessionRef.current.aaa_no ?? "", awarded_supplier: awarded.name,
      awarded_total: awarded.total, suppliers: supps, bac_members: members,
    };
    // TODO: supabase.from("canvass_sessions").upsert(payload)
    advance("aaa_preparation");
    onComplete?.(payload);
    Alert.alert("✅ Canvassing Complete", `Awarded: ${awarded.name}\nTotal: ₱${fmt(awarded.total)}`);
  }, [pr.prNo, supps, members, advance, onComplete]);

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
                <MaterialIcons name="chevron-left" size={20} color="#fff" />
              </TouchableOpacity>
            )}
            <View>
              <Text className="text-[9.5px] font-semibold tracking-widest uppercase text-white/40">
                DAR · Procurement › Canvassing
              </Text>
              <Text className="text-[15px] font-extrabold text-white">Canvassing · BAC</Text>
            </View>
          </View>
          {/* 7-day deadline chip — mirrors PRModule's StatusPill */}
          <View className="bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-300">
            <Text className="text-[10.5px] font-bold text-amber-800">⏱ 7-day window</Text>
          </View>
        </View>
        <StageStrip current={stage} completed={done} />
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {stage === "pr_received"    && <Step6  pr={pr} onDone={() => advance("pr_received")} />}
        {stage === "bac_resolution" && <Step7  pr={pr} members={members} setMembers={setMembers} onDone={() => advance("bac_resolution")} />}
        {stage === "release_canvass"&& <Step8  divs={divs} setDivs={setDivs} onDone={() => advance("release_canvass")} />}
        {stage === "collect_canvass"&& <Step9  pr={pr} divs={divs} setDivs={setDivs} suppliers={supps} setSuppliers={setSupps} onDone={() => advance("collect_canvass")} />}
        {stage === "aaa_preparation"&& <Step10 pr={pr} suppliers={supps} members={members} onDone={handleComplete} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── End-User View (roleId !== 2) ────────────────────────────────────────────

function EndUserView({ pr, onBack }: { pr: CanvassingPR; onBack?: () => void }) {
  // TODO: replace with real fetch → supabase.from("canvass_sessions").select("stage").eq("pr_no", pr.prNo)
  const currentStage: CanvassStage = "release_canvass";
  const currentIdx = STAGE_ORDER.indexOf(currentStage);

  return (
    <View className="flex-1 bg-gray-50">

      {/* ── Header — identical structure to PRModule's header ── */}
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
          {/* PR No. chip — mirrors SearchBar's "Create" button style */}
          <View className="bg-white/15 px-2.5 py-1 rounded-xl">
            <Text className="text-[10.5px] font-bold text-white/80" style={{ fontFamily: MONO }}>
              {pr.prNo}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}>

        {/* ── PR summary — mirrors RecordCard ── */}
        <Card>
          <View className="px-4 pt-3.5 pb-2">
            <View className="flex-row justify-between items-start">
              <View className="flex-1">
                <Text className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-1">Purchase Request</Text>
                <Text className="text-[15px] font-extrabold text-[#1a4d2e]" style={{ fontFamily: MONO }}>{pr.prNo}</Text>
                <Text className="text-[12px] text-gray-400 mt-0.5">{pr.officeSection} · {pr.date}</Text>
              </View>
              <View className="items-end">
                <Text className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-1">Total</Text>
                <Text className="text-[15px] font-extrabold text-[#064E3B]" style={{ fontFamily: MONO }}>₱{fmt(prTotal(pr.items))}</Text>
                <Text className="text-[11px] text-gray-400 mt-0.5">{pr.items.length} item{pr.items.length !== 1 ? "s" : ""}</Text>
              </View>
            </View>
            <View className="h-px bg-gray-100 my-2.5" />
            <Text className="text-[12px] text-gray-500 leading-5">{pr.purpose}</Text>
          </View>
        </Card>

        {/* ── Current stage highlight — mirrors RecordCard status section ── */}
        <Card className="bg-[#064E3B]">
          <View className="px-4 pt-3.5 pb-3">
            <Text className="text-[10px] font-bold tracking-widest uppercase text-white/50 mb-1.5">Current Stage</Text>
            <Text className="text-[17px] font-extrabold text-white mb-1">
              Step {STAGE_META[currentStage].step} · {STAGE_META[currentStage].label}
            </Text>
            <Text className="text-[13px] text-white/60 leading-5">{STAGE_DESC[currentStage]}</Text>
          </View>
        </Card>

        {/* ── Stage timeline — mirrors SubTabRow / FilterChips progression ── */}
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
                    <View className={`w-7 h-7 rounded-full items-center justify-center ${isDone ? "bg-emerald-500" : active ? "bg-[#064E3B]" : "bg-gray-200"}`}>
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
                  {/* Text */}
                  <View className="flex-1 pl-2.5 pt-1">
                    <Text className={`text-[12.5px] font-bold ${isDone ? "text-emerald-700" : active ? "text-[#1a4d2e]" : "text-gray-400"}`}>
                      Step {meta.step} · {meta.label}
                    </Text>
                    <Text className="text-[11px] text-gray-400 mt-0.5 leading-4">{STAGE_DESC[s]}</Text>
                  </View>
                  {/* Status pill — identical to PRModule's StatusPill */}
                  <View className={`px-2 py-0.5 rounded-full self-start mt-1 ${isDone ? "bg-emerald-100" : active ? "bg-blue-100" : "bg-gray-100"}`}>
                    <Text className={`text-[10px] font-bold ${isDone ? "text-emerald-700" : active ? "text-blue-700" : "text-gray-400"}`}>
                      {isDone ? "Done" : active ? "In Progress" : "Pending"}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </Card>

        <ItemsTable items={pr.items} />

        <Banner type="info"
          text="Your PR is being processed by BAC. The awarded supplier and final amount will appear once the Abstract of Awards is fully signed." />
      </ScrollView>
    </View>
  );
}

// ─── Default placeholder PR (used when no prRecord is passed) ────────────────

const PLACEHOLDER_PR: CanvassingPR = {
  prNo: "2026-PR-0001", date: TODAY,
  officeSection: "STOD", responsibilityCode: "10-001",
  purpose: "Procurement of office supplies for Q1 operations.",
  isHighValue: false,
  items: [
    { id: 1, desc: "Bond Paper, Short (70gsm)", stock: "SP-001", unit: "ream", qty: 10, unitCost: 220 },
    { id: 2, desc: "Ballpen, Black (0.5mm)",    stock: "SP-002", unit: "box",  qty: 5,  unitCost: 85  },
  ],
};

// ─── Root export — role switch ────────────────────────────────────────────────

/**
 * roleId === 2  →  BACView   (full Steps 6–10 editable workflow)
 * roleId !== 2  →  EndUserView  (read-only tracker with stage timeline)
 *
 * prRecord flows in from PRModule. Falls back to PLACEHOLDER_PR in isolation.
 */
export default function CanvassingModule({ prRecord, roleId, onComplete, onBack }: CanvassingModuleProps) {
  const { currentUser } = useAuth();
  const effectiveRoleId = roleId ?? currentUser?.role_id ?? 0;
  const pr = prRecord ?? PLACEHOLDER_PR;
  return effectiveRoleId === 2
    ? <BACView     pr={pr} onComplete={onComplete} onBack={onBack} />
    : <EndUserView pr={pr} onBack={onBack} />;
}
