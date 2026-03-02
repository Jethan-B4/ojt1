/**
 * CanvassingModule.tsx
 *
 * Phase 1 · Stage 2 — Canvass & Resolution (Steps 6–10)
 *
 * Callable from:
 *   • _layout.tsx  (Drawer.Screen as a standalone screen)
 *   • ProcurementContent.tsx  (via navigation.navigate or modal prop)
 *
 * Props:
 *   • prRecord  — the approved PR from ProcurementContent / Supabase
 *   • onComplete — called when AAA is fully signed (moves to Phase 2)
 *   • onBack    — optional back handler
 *
 * Supabase tables used:
 *   canvass_sessions      — one row per PR canvass session
 *   canvass_suppliers     — supplier quotes per session
 *   canvass_bac_members   — BAC/PARPO signatories per session
 *   canvass_division_assignments — canvasser per division per session
 *
 * All DB calls are wrapped in TODO comments — replace with real queries.
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
// ─── Supabase (uncomment when ready) ─────────────────────────────────────────
// import { supabase } from "../lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape of an approved PR passed in from ProcurementContent / Supabase */
export interface CanvassingPR {
  prNo: string;
  date: string;
  officeSection: string;
  responsibilityCode: string;
  purpose: string;
  isHighValue: boolean;
  budgetNumber?: string | null;
  papCode?: string | null;
  items: CanvassingPRItem[];
}

export interface CanvassingPRItem {
  id: number;
  desc: string;
  stock: string;
  unit: string;
  qty: number;
  unitCost: number;
}

type CanvassStage =
  | "pr_received"      // Step 6
  | "bac_resolution"   // Step 7
  | "release_canvass"  // Step 8
  | "collect_canvass"  // Step 9
  | "aaa_preparation"; // Step 10

interface BACMember {
  name: string;
  designation: string;
  signed: boolean;
  signedAt: string;
}

interface DivisionAssignment {
  section: string;
  canvasserName: string;
  releaseDate: string;
  returnDate: string;
  status: "pending" | "released" | "returned";
}

interface SupplierQuote {
  id: number;
  supplierName: string;
  address: string;
  contactNo: string;
  tinNo: string;
  deliveryDays: string;
  unitPrices: Record<number, string>; // itemId → price string
  remarks: string;
}

export interface CanvassingModuleProps {
  /** Approved PR data — passed from ProcurementContent or fetched from Supabase */
  prRecord?: CanvassingPR;
  /** Called after AAA is fully signed — advance to Phase 2 */
  onComplete?: (sessionData: CanvassSessionPayload) => void;
  onBack?: () => void;
}

/** Supabase-ready payload emitted on completion */
export interface CanvassSessionPayload {
  pr_no: string;
  bac_no: string;
  resolution_no: string;
  mode_of_procurement: string;
  aaa_no: string;
  awarded_supplier: string;
  awarded_total: number;
  suppliers: SupplierQuote[];
  bac_members: BACMember[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const TODAY = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });

const G = {
  dark:   "#1a4d2e",
  mid:    "#2d6a4f",
  green:  "#52b788",
  light:  "#d8f3dc",
  llight: "#edfbf2",
  gold:   "#c9a84c",
  goldD:  "#7a5000",
  goldL:  "#fdf5e0",
  red:    "#c0392b",
  redL:   "#fdecea",
  blue:   "#2563eb",
  blueL:  "#eff6ff",
  border: "#e5e7eb",
  muted:  "#6b7280",
  bg:     "#f8faf8",
} as const;

const STAGE_ORDER: CanvassStage[] = [
  "pr_received", "bac_resolution", "release_canvass", "collect_canvass", "aaa_preparation",
];

const STAGE_META: Record<CanvassStage, { step: number; label: string; icon: keyof typeof MaterialIcons.glyphMap }> = {
  pr_received:     { step: 6,  label: "PR Received",     icon: "inbox"           },
  bac_resolution:  { step: 7,  label: "BAC Resolution",  icon: "gavel"           },
  release_canvass: { step: 8,  label: "Release Canvass", icon: "send"            },
  collect_canvass: { step: 9,  label: "Collect Canvass", icon: "assignment-return"},
  aaa_preparation: { step: 10, label: "Prepare AAA",     icon: "emoji-events"    },
};

const MODES_OF_PROCUREMENT = [
  "Small Value Procurement (SVP)",
  "Competitive Bidding",
  "Direct Contracting",
  "Shopping",
  "Negotiated Procurement",
];

const DIVISIONS = ["STOD","LTSP","ARBDSP","Legal","PARPO","PARAD","TDG Unit","Budget","Accounting"];

// ─── Placeholder PR (used when no prRecord prop is passed) ───────────────────
// TODO: Remove when always called with a real prRecord from ProcurementContent

const PLACEHOLDER_PR: CanvassingPR = {
  prNo: "2026-PR-0042",
  date: "February 26, 2026",
  officeSection: "STOD",
  responsibilityCode: "10-001",
  purpose: "Procurement of office supplies for Q1 operations and administrative needs of the division.",
  isHighValue: false,
  items: [
    { id: 1, desc: "Bond Paper, Short (70gsm)", stock: "SP-001", unit: "ream", qty: 10, unitCost: 220 },
    { id: 2, desc: "Ballpen, Black (0.5mm)",    stock: "SP-002", unit: "box",  qty: 5,  unitCost: 85  },
    { id: 3, desc: "Stapler, Heavy Duty",        stock: "SP-003", unit: "pc",   qty: 2,  unitCost: 350 },
    { id: 4, desc: "Correction Tape",            stock: "SP-004", unit: "pc",   qty: 12, unitCost: 45  },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function prTotal(items: CanvassingPRItem[]) {
  return items.reduce((s, i) => s + i.qty * i.unitCost, 0);
}

function initDivisions(pr: CanvassingPR): DivisionAssignment[] {
  const CANVASSERS: Record<string, string> = {
    STOD: "Yvonne M.", LTSP: "Mariel T.", ARBDSP: "Robert A.",
    Legal: "Angel D.", PARPO: "Nessie P.", PARAD: "Viviene S.",
  };
  return DIVISIONS.map((sec) => ({
    section: sec,
    canvasserName: CANVASSERS[sec] ?? "—",
    releaseDate: "", returnDate: "",
    status: "pending" as const,
  }));
}

function initBACMembers(): BACMember[] {
  return [
    { name: "Yvonne M.", designation: "BAC Chairperson", signed: false, signedAt: "" },
    { name: "Mariel T.",  designation: "BAC Member",      signed: false, signedAt: "" },
    { name: "Robert A.",  designation: "BAC Member",      signed: false, signedAt: "" },
    { name: "PARPO II",   designation: "PARPO / Approver", signed: false, signedAt: "" },
  ];
}

// ─── Atoms ────────────────────────────────────────────────────────────────────

const SectionLabel = ({ children }: { children: string }) => (
  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10, marginTop: 4 }}>
    <Text style={{ fontSize: 9.5, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: G.muted }}>
      {children}
    </Text>
    <View style={{ flex: 1, height: 1, backgroundColor: G.border }} />
  </View>
);

const Card = ({ children, style }: { children: React.ReactNode; style?: object }) => (
  <View style={{
    backgroundColor: "#fff", borderRadius: 14, borderWidth: 1,
    borderColor: G.border, padding: 16, marginBottom: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    ...style,
  }}>
    {children}
  </View>
);

const Field = ({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode;
}) => (
  <View style={{ marginBottom: 12 }}>
    <View style={{ flexDirection: "row", gap: 3, marginBottom: 5 }}>
      <Text style={{ fontSize: 12, fontWeight: "600", color: "#374151" }}>{label}</Text>
      {required && <Text style={{ fontSize: 12, fontWeight: "700", color: G.red }}>*</Text>}
    </View>
    {children}
  </View>
);

const RNInput = ({ value, onChangeText, placeholder, readonly, keyboardType, multiline }: {
  value: string; onChangeText?: (t: string) => void; placeholder?: string;
  readonly?: boolean; keyboardType?: "default" | "numeric" | "decimal-pad"; multiline?: boolean;
}) => {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value} onChangeText={onChangeText} placeholder={placeholder}
      placeholderTextColor="#9ca3af" editable={!readonly}
      keyboardType={keyboardType ?? "default"} multiline={multiline}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{
        borderWidth: 1.5,
        borderColor: readonly ? G.border : focused ? G.green : G.border,
        borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
        fontSize: 13, color: readonly ? G.muted : "#111827",
        backgroundColor: readonly ? G.bg : "#fff",
        fontFamily: readonly ? MONO : undefined,
        minHeight: multiline ? 72 : undefined,
        textAlignVertical: multiline ? "top" : undefined,
      }}
    />
  );
};

type PickerSheetOption = string;
const PickerSheet = ({ title, options, selected, onSelect, onClose }: {
  title: string; options: PickerSheetOption[]; selected: string;
  onSelect: (v: string) => void; onClose: () => void;
}) => (
  <Modal visible transparent animationType="slide" onRequestClose={onClose}>
    <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}
      activeOpacity={1} onPress={onClose} />
    <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
      <View style={{ alignItems: "center", paddingVertical: 12 }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: G.border }} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between",
        paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: G.border }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: "#111" }}>{title}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={8}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: G.mid }}>Done</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
        {options.map((opt) => (
          <TouchableOpacity key={opt} onPress={() => { onSelect(opt); onClose(); }}
            activeOpacity={0.7}
            style={{ flexDirection: "row", justifyContent: "space-between",
              alignItems: "center", paddingHorizontal: 20, paddingVertical: 14,
              borderBottomWidth: 1, borderBottomColor: "#f9fafb",
              backgroundColor: opt === selected ? G.llight : undefined }}>
            <Text style={{ fontSize: 14, color: opt === selected ? G.dark : "#374151",
              fontWeight: opt === selected ? "700" : "400" }}>
              {opt}
            </Text>
            {opt === selected && (
              <MaterialIcons name="check" size={16} color={G.green} />
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={{ height: 24 }} />
    </View>
  </Modal>
);

const SelectField = ({ label, required, options, value, onSelect }: {
  label: string; required?: boolean; options: string[];
  value: string; onSelect: (v: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <Field label={label} required={required}>
      <TouchableOpacity onPress={() => setOpen(true)} activeOpacity={0.8}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          borderWidth: 1.5, borderColor: G.border, borderRadius: 10,
          paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "#fff" }}>
        <Text style={{ fontSize: 13, color: value ? "#111" : "#9ca3af", flex: 1 }}>
          {value || "Select…"}
        </Text>
        <MaterialIcons name="keyboard-arrow-down" size={18} color={G.muted} />
      </TouchableOpacity>
      {open && (
        <PickerSheet title={label} options={options} selected={value}
          onSelect={onSelect} onClose={() => setOpen(false)} />
      )}
    </Field>
  );
};

const AlertBanner = ({ type, children }: {
  type: "info" | "warning" | "danger"; children: React.ReactNode;
}) => {
  const cfg = {
    info:    { bg: G.llight, border: G.green,  icon: "info" as const,    iconColor: G.mid  },
    warning: { bg: G.goldL,  border: G.gold,   icon: "warning" as const, iconColor: G.goldD },
    danger:  { bg: G.redL,   border: G.red,    icon: "error" as const,   iconColor: G.red  },
  }[type];
  return (
    <View style={{ flexDirection: "row", gap: 10, backgroundColor: cfg.bg,
      borderLeftWidth: 4, borderLeftColor: cfg.border, borderRadius: 10,
      padding: 12, marginBottom: 14 }}>
      <MaterialIcons name={cfg.icon} size={18} color={cfg.iconColor} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
};

const StepBadge = ({ step }: { step: number }) => (
  <View style={{ backgroundColor: G.dark, borderRadius: 12, paddingHorizontal: 16,
    paddingVertical: 10, alignItems: "center" }}>
    <Text style={{ fontFamily: MONO, fontSize: 24, fontWeight: "700", color: "#fff", lineHeight: 28 }}>
      {String(step).padStart(2, "0")}
    </Text>
    <Text style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
      STEP
    </Text>
  </View>
);

const Btn = ({ label, onPress, disabled, variant = "primary" }: {
  label: string; onPress: () => void; disabled?: boolean;
  variant?: "primary" | "ghost" | "gold";
}) => {
  const styles: Record<string, object> = {
    primary: { backgroundColor: disabled ? "#9ca3af" : G.dark },
    ghost:   { backgroundColor: "transparent", borderWidth: 1.5, borderColor: G.border },
    gold:    { backgroundColor: G.goldD },
  };
  const textStyles: Record<string, object> = {
    primary: { color: "#fff" },
    ghost:   { color: G.muted },
    gold:    { color: "#fff" },
  };
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.8}
      style={{ paddingHorizontal: 20, paddingVertical: 11, borderRadius: 10,
        ...styles[variant] }}>
      <Text style={{ fontSize: 13.5, fontWeight: "700", ...textStyles[variant] }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

// ─── Stage Progress Strip ─────────────────────────────────────────────────────

const StageStrip = ({ current, completed }: {
  current: CanvassStage; completed: Set<CanvassStage>;
}) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false}
    style={{ backgroundColor: G.dark }}
    contentContainerStyle={{ flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 4 }}>
    {STAGE_ORDER.map((s, i) => {
      const meta  = STAGE_META[s];
      const done  = completed.has(s);
      const active = s === current;
      return (
        <React.Fragment key={s}>
          <View style={{ alignItems: "center", gap: 4 }}>
            <View style={{
              width: 28, height: 28, borderRadius: 14,
              backgroundColor: done ? G.green : active ? "#fff" : "rgba(255,255,255,0.15)",
              alignItems: "center", justifyContent: "center",
            }}>
              <MaterialIcons
                name={done ? "check" : meta.icon}
                size={14}
                color={done ? G.dark : active ? G.dark : "rgba(255,255,255,0.4)"}
              />
            </View>
            <Text style={{
              fontSize: 9, fontWeight: "700", letterSpacing: 0.3,
              color: active ? "#fff" : done ? G.green : "rgba(255,255,255,0.35)",
              textAlign: "center", maxWidth: 56,
            }}>
              {meta.label}
            </Text>
          </View>
          {i < STAGE_ORDER.length - 1 && (
            <View style={{ width: 20, height: 1, backgroundColor: "rgba(255,255,255,0.15)",
              alignSelf: "center", marginTop: -10 }} />
          )}
        </React.Fragment>
      );
    })}
  </ScrollView>
);

// ─── PR Summary Card ──────────────────────────────────────────────────────────

const PRSummaryCard = ({ pr }: { pr: CanvassingPR }) => {
  const total = prTotal(pr.items);
  return (
    <Card style={{ backgroundColor: G.dark, borderColor: "rgba(255,255,255,0.1)" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <View>
          <Text style={{ fontSize: 9, fontWeight: "700", letterSpacing: 1, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>
            Purchase Request
          </Text>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#fff", fontFamily: MONO, marginTop: 2 }}>
            {pr.prNo}
          </Text>
          <Text style={{ fontSize: 11.5, color: G.green, fontWeight: "600", marginTop: 2 }}>
            {pr.officeSection} · {pr.date}
          </Text>
        </View>
        {pr.isHighValue && (
          <View style={{ backgroundColor: G.goldD, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
            <Text style={{ fontSize: 9.5, fontWeight: "700", color: "#fff", textTransform: "uppercase", letterSpacing: 0.5 }}>
              High-Value
            </Text>
          </View>
        )}
      </View>
      {pr.items.map((item) => (
        <View key={item.id} style={{ flexDirection: "row", justifyContent: "space-between",
          paddingVertical: 3, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" }}>
          <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", flex: 1, paddingRight: 8 }} numberOfLines={1}>
            {item.desc}
          </Text>
          <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: MONO }}>
            ₱{fmt(item.qty * item.unitCost)}
          </Text>
        </View>
      ))}
      <View style={{ flexDirection: "row", justifyContent: "space-between",
        marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.12)" }}>
        <Text style={{ fontSize: 10, fontWeight: "600", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Total
        </Text>
        <Text style={{ fontSize: 14, fontWeight: "700", color: G.green, fontFamily: MONO }}>
          ₱{fmt(total)}
        </Text>
      </View>
    </Card>
  );
};

// ─── Items Table ──────────────────────────────────────────────────────────────

const ItemsTable = ({ items }: { items: CanvassingPRItem[] }) => (
  <Card>
    <SectionLabel>Line Items</SectionLabel>
    {/* Header */}
    <View style={{ flexDirection: "row", backgroundColor: G.dark,
      borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 2 }}>
      {["Description", "Unit", "Qty", "Unit Cost", "Total"].map((h, i) => (
        <Text key={h} style={{
          fontSize: 9.5, fontWeight: "700", color: "rgba(255,255,255,0.7)",
          textTransform: "uppercase", letterSpacing: 0.5,
          flex: i === 0 ? 2 : 1, textAlign: i > 1 ? "right" : "left",
        }}>
          {h}
        </Text>
      ))}
    </View>
    {items.map((item, i) => (
      <View key={item.id} style={{ flexDirection: "row", paddingHorizontal: 10,
        paddingVertical: 8, backgroundColor: i % 2 ? "#f9fafb" : "#fff",
        borderRadius: 6 }}>
        <Text style={{ flex: 2, fontSize: 12, color: "#374151" }} numberOfLines={2}>{item.desc}</Text>
        <Text style={{ flex: 1, fontSize: 12, color: G.muted, textAlign: "left", paddingLeft: 4 }}>{item.unit}</Text>
        <Text style={{ flex: 1, fontSize: 12, color: "#374151", textAlign: "right", fontFamily: MONO }}>{item.qty}</Text>
        <Text style={{ flex: 1, fontSize: 12, color: "#374151", textAlign: "right", fontFamily: MONO }}>₱{fmt(item.unitCost)}</Text>
        <Text style={{ flex: 1, fontSize: 12, fontWeight: "600", color: G.mid, textAlign: "right", fontFamily: MONO }}>
          ₱{fmt(item.qty * item.unitCost)}
        </Text>
      </View>
    ))}
  </Card>
);

// ─── BAC Signatories ──────────────────────────────────────────────────────────

const BACSignatories = ({ members, onSign, title = "Signatories" }: {
  members: BACMember[];
  onSign: (idx: number) => void;
  title?: string;
}) => (
  <Card>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: G.muted }}>
        {title}
      </Text>
      <View style={{ backgroundColor: G.light, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
        <Text style={{ fontSize: 10, fontWeight: "700", color: G.mid }}>
          {members.filter((m) => m.signed).length}/{members.length} signed
        </Text>
      </View>
      <View style={{ flex: 1, height: 1, backgroundColor: G.border }} />
    </View>
    {members.map((m, idx) => (
      <View key={m.name} style={{
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        padding: 12, marginBottom: 8, borderRadius: 10, borderWidth: 1.5,
        borderColor: m.signed ? G.green : G.border,
        backgroundColor: m.signed ? G.llight : "#fff",
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          <View style={{
            width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center",
            backgroundColor: m.signed ? G.green : "#f3f4f6",
            borderWidth: 1.5, borderColor: m.signed ? G.green : G.border,
          }}>
            <Text style={{ fontSize: 13, fontWeight: "700",
              color: m.signed ? "#fff" : G.muted }}>
              {m.signed ? "✓" : m.name[0]}
            </Text>
          </View>
          <View>
            <Text style={{ fontSize: 13, fontWeight: "600", color: m.signed ? G.mid : "#111" }}>
              {m.name}
            </Text>
            <Text style={{ fontSize: 11, color: G.muted }}>{m.designation}</Text>
          </View>
        </View>
        {m.signed ? (
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 11.5, fontWeight: "600", color: G.mid }}>✅ Signed</Text>
            <Text style={{ fontSize: 10, color: G.muted }}>at {m.signedAt}</Text>
          </View>
        ) : (
          <TouchableOpacity onPress={() => onSign(idx)} activeOpacity={0.8}
            style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8,
              borderWidth: 1.5, borderColor: G.border, backgroundColor: "#fff" }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: G.muted }}>✍️ Sign</Text>
          </TouchableOpacity>
        )}
      </View>
    ))}
  </Card>
);

// ─── Division Row ─────────────────────────────────────────────────────────────

const DivisionRow = ({ div, onAction }: {
  div: DivisionAssignment;
  onAction: () => void;
}) => {
  const statusCfg = {
    pending:  { bg: "#fefce8", text: "#854d0e", label: "Pending"  },
    released: { bg: G.light,   text: G.mid,     label: "Released" },
    returned: { bg: G.blueL,   text: G.blue,    label: "Returned" },
  }[div.status];

  return (
    <View style={{ flexDirection: "row", alignItems: "center",
      padding: 10, marginBottom: 6, borderRadius: 10, borderWidth: 1.5,
      borderColor: div.status !== "pending" ? G.green : G.border,
      backgroundColor: div.status !== "pending" ? G.llight : "#fff",
      gap: 8 }}>
      <View style={{ width: 56 }}>
        <Text style={{ fontSize: 11, fontWeight: "700", color: G.dark,
          backgroundColor: G.light, paddingHorizontal: 6, paddingVertical: 2,
          borderRadius: 5, textAlign: "center" }}>
          {div.section}
        </Text>
      </View>
      <Text style={{ flex: 1, fontSize: 12.5, color: "#374151" }}>{div.canvasserName}</Text>
      <Text style={{ fontSize: 10.5, color: G.muted, fontFamily: MONO, width: 72 }} numberOfLines={1}>
        {div.releaseDate || div.returnDate || "—"}
      </Text>
      <View style={{ backgroundColor: statusCfg.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 }}>
        <Text style={{ fontSize: 10, fontWeight: "700", color: statusCfg.text }}>{statusCfg.label}</Text>
      </View>
      {div.status !== "returned" && (
        <TouchableOpacity onPress={onAction} activeOpacity={0.8}
          style={{ backgroundColor: div.status === "pending" ? G.green : G.blue,
            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: "#fff" }}>
            {div.status === "pending" ? "📤 Release" : "📥 Receive"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

// ─── Progress Bar ─────────────────────────────────────────────────────────────

const ProgressBar = ({ done, total, label }: { done: number; total: number; label: string }) => {
  const pct = Math.round((done / Math.max(total, 1)) * 100);
  return (
    <View style={{ backgroundColor: G.bg, borderRadius: 12, padding: 14, marginBottom: 12,
      flexDirection: "row", alignItems: "center", gap: 14 }}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
          <Text style={{ fontSize: 11, fontWeight: "600", color: G.muted }}>{label}</Text>
          <Text style={{ fontSize: 11, fontWeight: "600", color: G.muted }}>{done} of {total}</Text>
        </View>
        <View style={{ height: 8, backgroundColor: G.border, borderRadius: 4, overflow: "hidden" }}>
          <View style={{ height: "100%", width: `${pct}%` as any,
            backgroundColor: G.green, borderRadius: 4 }} />
        </View>
      </View>
      <View style={{ alignItems: "center", minWidth: 44 }}>
        <Text style={{ fontSize: 20, fontWeight: "700", color: G.dark, fontFamily: MONO }}>{pct}%</Text>
      </View>
    </View>
  );
};

// ─── Step 6: PR Received ──────────────────────────────────────────────────────

const Step6PRReceived = ({ pr, onComplete }: { pr: CanvassingPR; onComplete: () => void }) => {
  const [bacNo,      setBacNo]      = useState("");
  const [receivedBy, setReceivedBy] = useState("Yvonne M.");
  const [notes,      setNotes]      = useState("");

  // TODO: supabase.from("canvass_sessions").insert({ pr_no: pr.prNo, bac_no: bacNo, received_by: receivedBy, notes })

  return (
    <>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ fontSize: 10.5, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: G.green, marginBottom: 3 }}>
            Stage 2 · Canvass & Resolution
          </Text>
          <Text style={{ fontSize: 22, fontWeight: "800", color: G.dark, marginBottom: 4 }}>
            PR Received from PARPO
          </Text>
          <Text style={{ fontSize: 13, color: G.muted, lineHeight: 19 }}>
            BAC receives the approved PR from PARPO&#39;s Office for preparation of the canvass sheet and BAC Resolution.
          </Text>
        </View>
        <StepBadge step={6} />
      </View>

      <AlertBanner type="info">
        <Text style={{ fontSize: 12.5, color: "#374151", lineHeight: 18 }}>
          This PR has been <Text style={{ fontWeight: "700" }}>approved by PARPO</Text> and budget has been earmarked. Assign a BAC canvass number and acknowledge receipt to proceed.
        </Text>
      </AlertBanner>

      <PRSummaryCard pr={pr} />
      <ItemsTable items={pr.items} />

      <Card>
        <SectionLabel>BAC Acknowledgement</SectionLabel>
        <Field label="BAC Canvass No." required>
          <RNInput value={bacNo} onChangeText={setBacNo} placeholder="e.g. 2026-BAC-0042" />
        </Field>
        <SelectField label="Received By" required options={["Yvonne M.", "Mariel T."]}
          value={receivedBy} onSelect={setReceivedBy} />
        <Field label="Date Received">
          <RNInput value={TODAY} readonly />
        </Field>
        <Field label="Remarks / Notes">
          <RNInput value={notes} onChangeText={setNotes}
            placeholder="Any observations on the received PR…" multiline />
        </Field>
      </Card>

      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
        <Btn label="Save Draft" variant="ghost" onPress={() => {}} />
        <Btn label="Acknowledge & Proceed →" disabled={!bacNo.trim()}
          onPress={onComplete} />
      </View>
    </>
  );
};

// ─── Step 7: BAC Resolution ───────────────────────────────────────────────────

const Step7BACResolution = ({ pr, bacMembers, setBACMembers, onComplete }: {
  pr: CanvassingPR;
  bacMembers: BACMember[];
  setBACMembers: React.Dispatch<React.SetStateAction<BACMember[]>>;
  onComplete: () => void;
}) => {
  const [resNo,      setResNo]      = useState(`${new Date().getFullYear()}-RES-${pr.prNo.slice(-4)}`);
  const [modeOfProc, setModeOfProc] = useState("Small Value Procurement (SVP)");
  const [basis,      setBasis]      = useState("The procurement amount is below the threshold for competitive bidding as prescribed under RA 9184 and its IRR.");
  const allSigned = bacMembers.every((m) => m.signed);

  const signMember = (idx: number) => {
    const now = new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
    setBACMembers((m) => m.map((mb, i) => i === idx ? { ...mb, signed: true, signedAt: now } : mb));
    // TODO: supabase.from("canvass_bac_members").update({ signed: true, signed_at: now }).eq("name", bacMembers[idx].name)
  };

  return (
    <>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ fontSize: 10.5, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: G.green, marginBottom: 3 }}>
            Stage 2 · BAC Resolution
          </Text>
          <Text style={{ fontSize: 22, fontWeight: "800", color: G.dark, marginBottom: 4 }}>BAC Resolution</Text>
          <Text style={{ fontSize: 13, color: G.muted, lineHeight: 19 }}>
            Prepare the BAC Resolution indicating the mode of procurement and release to all BAC members and PARPO II for signature.
          </Text>
        </View>
        <StepBadge step={7} />
      </View>

      <Card>
        <SectionLabel>Resolution Details</SectionLabel>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="Resolution No." required>
              <RNInput value={resNo} onChangeText={setResNo} />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="PR Reference">
              <RNInput value={pr.prNo} readonly />
            </Field>
          </View>
        </View>
        <SelectField label="Mode of Procurement" required options={MODES_OF_PROCUREMENT}
          value={modeOfProc} onSelect={setModeOfProc} />
        <Field label="Date Prepared">
          <RNInput value={TODAY} readonly />
        </Field>
        <Field label="Legal Basis / Justification" required>
          <RNInput value={basis} onChangeText={setBasis} multiline />
        </Field>
      </Card>

      {!allSigned && (
        <AlertBanner type="warning">
          <Text style={{ fontSize: 12.5, color: "#374151" }}>
            All BAC members and PARPO II must sign before releasing the canvass. Tap <Text style={{ fontWeight: "700" }}>Sign</Text> to simulate physical signature.
          </Text>
        </AlertBanner>
      )}

      <BACSignatories members={bacMembers} onSign={signMember} />

      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
        <Btn label="Save Draft" variant="ghost" onPress={() => {}} />
        <Btn label="Resolution Finalized → Release Canvass"
          disabled={!allSigned} onPress={onComplete} />
      </View>
    </>
  );
};

// ─── Step 8: Release Canvass ──────────────────────────────────────────────────

const Step8ReleaseCanvass = ({ divisions, setDivisions, onComplete }: {
  divisions: DivisionAssignment[];
  setDivisions: React.Dispatch<React.SetStateAction<DivisionAssignment[]>>;
  onComplete: () => void;
}) => {
  const released    = divisions.filter((d) => d.status !== "pending").length;
  const allReleased = divisions.every((d) => d.status !== "pending");

  const releaseOne = (idx: number) => {
    setDivisions((d) => d.map((div, i) =>
      i === idx ? { ...div, status: "released", releaseDate: TODAY } : div
    ));
    // TODO: supabase.from("canvass_division_assignments").update({ status: "released", release_date: TODAY }).eq("section", divisions[idx].section)
  };

  const releaseAll = () => {
    setDivisions((d) => d.map((div) =>
      div.status === "pending" ? { ...div, status: "released", releaseDate: TODAY } : div
    ));
    // TODO: supabase.from("canvass_division_assignments").update({ status: "released", release_date: TODAY }).eq("session_id", sessionId)
  };

  return (
    <>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ fontSize: 10.5, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: G.green, marginBottom: 3 }}>
            Stage 2 · Release Canvass
          </Text>
          <Text style={{ fontSize: 22, fontWeight: "800", color: G.dark, marginBottom: 4 }}>Release Canvass to Divisions</Text>
          <Text style={{ fontSize: 13, color: G.muted, lineHeight: 19 }}>
            Release canvass sheets to designated canvassers per division. Must be returned within <Text style={{ fontWeight: "700" }}>7 days</Text>.
          </Text>
        </View>
        <StepBadge step={8} />
      </View>

      <AlertBanner type="warning">
        <Text style={{ fontSize: 12.5, color: "#374151" }}>
          <Text style={{ fontWeight: "700" }}>Availability reminder:</Text> Verify canvassers are not on travel before releasing. Canvass must be returned within 7 days.
        </Text>
      </AlertBanner>

      <ProgressBar done={released} total={divisions.length} label="Release Progress" />

      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: G.muted }}>
            Canvassers by Division
          </Text>
          {!allReleased && (
            <TouchableOpacity onPress={releaseAll} activeOpacity={0.8}
              style={{ backgroundColor: G.dark, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: "#fff" }}>Release All</Text>
            </TouchableOpacity>
          )}
        </View>
        {divisions.map((div, idx) => (
          <DivisionRow key={div.section} div={div} onAction={() => releaseOne(idx)} />
        ))}
      </Card>

      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
        <Btn label="Save Draft" variant="ghost" onPress={() => {}} />
        <Btn label="All Released → Await Returns" disabled={!allReleased} onPress={onComplete} />
      </View>
    </>
  );
};

// ─── Step 9: Collect Canvass ──────────────────────────────────────────────────

const Step9CollectCanvass = ({ pr, divisions, setDivisions, suppliers, setSuppliers, onComplete }: {
  pr: CanvassingPR;
  divisions: DivisionAssignment[];
  setDivisions: React.Dispatch<React.SetStateAction<DivisionAssignment[]>>;
  suppliers: SupplierQuote[];
  setSuppliers: React.Dispatch<React.SetStateAction<SupplierQuote[]>>;
  onComplete: () => void;
}) => {
  const nextId  = useRef(suppliers.length + 1);
  const returned = divisions.filter((d) => d.status === "returned").length;
  const hasQuotes = suppliers.some((sp) => sp.supplierName && Object.keys(sp.unitPrices).length > 0);

  const addSupplier = () => {
    const id = nextId.current++;
    setSuppliers((s) => [...s, { id, supplierName: "", address: "", contactNo: "", tinNo: "", deliveryDays: "", unitPrices: {}, remarks: "" }]);
  };

  const removeSupplier = (id: number) => setSuppliers((s) => s.filter((sp) => sp.id !== id));

  const updateSupplier = (id: number, field: keyof SupplierQuote, value: string) =>
    setSuppliers((s) => s.map((sp) => sp.id === id ? { ...sp, [field]: value } : sp));

  const updatePrice = (suppId: number, itemId: number, val: string) =>
    setSuppliers((s) => s.map((sp) =>
      sp.id === suppId ? { ...sp, unitPrices: { ...sp.unitPrices, [itemId]: val } } : sp
    ));

  const markReturned = (idx: number) => {
    setDivisions((d) => d.map((div, i) =>
      i === idx ? { ...div, status: "returned", returnDate: TODAY } : div
    ));
    // TODO: supabase.from("canvass_division_assignments").update({ status: "returned", return_date: TODAY }).eq("section", divisions[idx].section)
  };

  return (
    <>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ fontSize: 10.5, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: G.green, marginBottom: 3 }}>
            Stage 2 · Collect Canvass
          </Text>
          <Text style={{ fontSize: 22, fontWeight: "800", color: G.dark, marginBottom: 4 }}>Receive Filled-Out Canvass</Text>
          <Text style={{ fontSize: 13, color: G.muted, lineHeight: 19 }}>
            Collect completed canvass forms and encode supplier quotations for comparison. Must be submitted within 7 days of release.
          </Text>
        </View>
        <StepBadge step={9} />
      </View>

      <ProgressBar done={returned} total={divisions.length} label="Returns Received" />

      <Card>
        <SectionLabel>Track Canvass Returns</SectionLabel>
        {divisions.map((div, idx) => (
          <DivisionRow key={div.section} div={div} onAction={() => markReturned(idx)} />
        ))}
      </Card>

      {/* Supplier quotations */}
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: G.muted }}>
            Supplier Quotations
          </Text>
          <View style={{ backgroundColor: G.light, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
            <Text style={{ fontSize: 10, fontWeight: "700", color: G.mid }}>
              {suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}
            </Text>
          </View>
        </View>

        {suppliers.map((sp, sIdx) => (
          <View key={sp.id} style={{ borderWidth: 1.5, borderColor: G.border,
            borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              padding: 12, backgroundColor: G.bg }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: G.dark,
                  alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>{sIdx + 1}</Text>
                </View>
                <Text style={{ fontSize: 13.5, fontWeight: "600", color: "#111" }}>
                  {sp.supplierName || `Supplier ${sIdx + 1}`}
                </Text>
              </View>
              <TouchableOpacity onPress={() => removeSupplier(sp.id)} hitSlop={8}
                style={{ padding: 6, borderRadius: 6, borderWidth: 1, borderColor: G.border }}>
                <MaterialIcons name="close" size={14} color={G.red} />
              </TouchableOpacity>
            </View>

            {/* Supplier info */}
            <View style={{ padding: 14, gap: 10 }}>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 2 }}>
                  <Field label="Supplier Name" required>
                    <RNInput value={sp.supplierName} onChangeText={(v) => updateSupplier(sp.id, "supplierName", v)}
                      placeholder="Business / trade name" />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="TIN No.">
                    <RNInput value={sp.tinNo} onChangeText={(v) => updateSupplier(sp.id, "tinNo", v)}
                      placeholder="000-000-000" />
                  </Field>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 2 }}>
                  <Field label="Address">
                    <RNInput value={sp.address} onChangeText={(v) => updateSupplier(sp.id, "address", v)}
                      placeholder="Business address" />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Contact No.">
                    <RNInput value={sp.contactNo} onChangeText={(v) => updateSupplier(sp.id, "contactNo", v)}
                      placeholder="09XX-XXX-XXXX" />
                  </Field>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Field label="Delivery (days)">
                    <RNInput value={sp.deliveryDays} onChangeText={(v) => updateSupplier(sp.id, "deliveryDays", v)}
                      placeholder="e.g. 7" keyboardType="numeric" />
                  </Field>
                </View>
                <View style={{ flex: 2 }}>
                  <Field label="Remarks">
                    <RNInput value={sp.remarks} onChangeText={(v) => updateSupplier(sp.id, "remarks", v)}
                      placeholder="Warranty, terms…" />
                  </Field>
                </View>
              </View>

              {/* Unit prices */}
              <SectionLabel>Unit Prices Quoted (₱)</SectionLabel>
              <View style={{ borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: G.border }}>
                <View style={{ flexDirection: "row", backgroundColor: G.dark,
                  paddingHorizontal: 10, paddingVertical: 7 }}>
                  {["Item", "Unit", "Qty", "Unit Price ₱", "Line Total"].map((h, i) => (
                    <Text key={h} style={{ flex: i === 0 ? 2 : 1, fontSize: 9, fontWeight: "700",
                      color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: 0.5,
                      textAlign: i > 1 ? "right" : "left" }}>
                      {h}
                    </Text>
                  ))}
                </View>
                {pr.items.map((item, i) => {
                  const price = parseFloat(sp.unitPrices[item.id] || "0") || 0;
                  return (
                    <View key={item.id} style={{ flexDirection: "row", alignItems: "center",
                      paddingHorizontal: 10, paddingVertical: 7,
                      backgroundColor: i % 2 ? "#f9fafb" : "#fff",
                      borderTopWidth: 1, borderTopColor: G.border }}>
                      <Text style={{ flex: 2, fontSize: 11.5, color: "#374151" }} numberOfLines={1}>{item.desc}</Text>
                      <Text style={{ flex: 1, fontSize: 11.5, color: G.muted }}>{item.unit}</Text>
                      <Text style={{ flex: 1, fontSize: 11.5, fontFamily: MONO, textAlign: "right", color: "#374151" }}>{item.qty}</Text>
                      <View style={{ flex: 1, alignItems: "flex-end" }}>
                        <TextInput
                          value={sp.unitPrices[item.id] ?? ""}
                          onChangeText={(v) => updatePrice(sp.id, item.id, v)}
                          keyboardType="decimal-pad" placeholder="0.00"
                          placeholderTextColor="#9ca3af"
                          style={{ borderWidth: 1.5, borderColor: G.border, borderRadius: 6,
                            paddingHorizontal: 7, paddingVertical: 5,
                            fontSize: 12, fontFamily: MONO, textAlign: "right",
                            width: 72, color: "#111" }}
                        />
                      </View>
                      <Text style={{ flex: 1, fontSize: 11.5, fontFamily: MONO, fontWeight: "600",
                        color: price > 0 ? G.mid : "#9ca3af", textAlign: "right" }}>
                        {price > 0 ? `₱${fmt(price * item.qty)}` : "—"}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        ))}

        <TouchableOpacity onPress={addSupplier} activeOpacity={0.8}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center",
            gap: 6, paddingVertical: 12, borderRadius: 10, borderWidth: 2,
            borderColor: G.border, borderStyle: "dashed" }}>
          <MaterialIcons name="add" size={18} color={G.mid} />
          <Text style={{ fontSize: 13, fontWeight: "600", color: G.mid }}>Add Supplier Quote</Text>
        </TouchableOpacity>
      </Card>

      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
        <Btn label="Save Draft" variant="ghost" onPress={() => {}} />
        <Btn label="Encode Complete → Prepare AAA" disabled={!hasQuotes} onPress={onComplete} />
      </View>
    </>
  );
};

// ─── Step 10: Abstract of Awards ──────────────────────────────────────────────

const Step10AAA = ({ pr, suppliers, bacMembers, onComplete }: {
  pr: CanvassingPR;
  suppliers: SupplierQuote[];
  bacMembers: BACMember[];
  onComplete: (awarded: { supplierName: string; total: number }) => void;
}) => {
  const [aaaNo,       setAAANo]       = useState(`${new Date().getFullYear()}-AAA-${pr.prNo.slice(-4)}`);
  const [aaaMembers,  setAAAMembers]  = useState<BACMember[]>(() =>
    bacMembers.map((m) => ({ ...m, signed: false, signedAt: "" }))
  );
  const allSigned = aaaMembers.every((m) => m.signed);

  // Compute lowest per item
  const lowestForItem = (itemId: number) => {
    let best: { sp: SupplierQuote; price: number } | null = null;
    for (const sp of suppliers) {
      const p = parseFloat(sp.unitPrices[itemId] || "0") || 0;
      if (p > 0 && (!best || p < best.price)) best = { sp, price: p };
    }
    return best;
  };

  // Grand total per supplier
  const supplierTotals = suppliers.map((sp) => ({
    sp,
    total: pr.items.reduce((s, item) => {
      const p = parseFloat(sp.unitPrices[item.id] || "0") || 0;
      return s + p * item.qty;
    }, 0),
  }));

  const lowestSupplier = supplierTotals.reduce(
    (best, cur) => cur.total > 0 && (!best || cur.total < best.total) ? cur : best,
    null as (typeof supplierTotals[0]) | null
  );

  const signMember = (idx: number) => {
    const now = new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
    setAAAMembers((m) => m.map((mb, i) => i === idx ? { ...mb, signed: true, signedAt: now } : mb));
    // TODO: supabase.from("canvass_bac_members").update({ aaa_signed: true, aaa_signed_at: now })
  };

  return (
    <>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ fontSize: 10.5, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: G.green, marginBottom: 3 }}>
            Stage 2 · Abstract of Awards
          </Text>
          <Text style={{ fontSize: 22, fontWeight: "800", color: G.dark, marginBottom: 4 }}>Abstract of Awards</Text>
          <Text style={{ fontSize: 13, color: G.muted, lineHeight: 19 }}>
            Summarize all supplier quotations. The lowest compliant bidder is recommended. Release to BAC members and PARPO II for signature.
          </Text>
        </View>
        <StepBadge step={10} />
      </View>

      <Card>
        <SectionLabel>AAA Details</SectionLabel>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="AAA No.">
              <RNInput value={aaaNo} onChangeText={setAAANo} />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="PR Reference">
              <RNInput value={pr.prNo} readonly />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Date Prepared">
              <RNInput value={TODAY} readonly />
            </Field>
          </View>
        </View>
      </Card>

      {/* Comparison table */}
      <Card>
        <SectionLabel>Canvass Price Comparison</SectionLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            {/* Table header */}
            <View style={{ flexDirection: "row", backgroundColor: G.dark,
              borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}>
              {["Item", "Unit", "Qty",
                ...suppliers.map((sp, i) => sp.supplierName || `Supplier ${i + 1}`),
                "Lowest ₱", "Awarded To",
              ].map((h, i) => (
                <Text key={`h-${i}`} style={{
                  fontSize: 9.5, fontWeight: "700", color: "rgba(255,255,255,0.75)",
                  textTransform: "uppercase", letterSpacing: 0.5,
                  width: i < 3 ? (i === 0 ? 140 : 50) : 100,
                  textAlign: i > 1 ? "right" : "left",
                }}>
                  {h}
                </Text>
              ))}
            </View>

            {pr.items.map((item, i) => {
              const best     = lowestForItem(item.id);
              const bestSupp = best?.sp;
              return (
                <View key={item.id} style={{ flexDirection: "row", alignItems: "center",
                  paddingHorizontal: 10, paddingVertical: 9,
                  backgroundColor: best ? (i % 2 ? G.llight : "#f0fdf8") : (i % 2 ? "#f9fafb" : "#fff"),
                  borderTopWidth: 1, borderTopColor: G.border }}>
                  <Text style={{ width: 140, fontSize: 12, color: "#374151" }} numberOfLines={2}>{item.desc}</Text>
                  <Text style={{ width: 50, fontSize: 12, color: G.muted }}>{item.unit}</Text>
                  <Text style={{ width: 50, fontSize: 12, fontFamily: MONO, textAlign: "right" }}>{item.qty}</Text>
                  {suppliers.map((sp) => {
                    const p       = parseFloat(sp.unitPrices[item.id] || "0") || 0;
                    const isLowest = bestSupp?.id === sp.id;
                    return (
                      <Text key={sp.id} style={{ width: 100, fontSize: 12, fontFamily: MONO,
                        textAlign: "right", fontWeight: isLowest ? "700" : "400",
                        color: isLowest ? G.mid : "#374151" }}>
                        {p > 0 ? `₱${fmt(p)}` : "—"}
                      </Text>
                    );
                  })}
                  <Text style={{ width: 100, fontSize: 12, fontFamily: MONO, fontWeight: "700",
                    color: G.mid, textAlign: "right" }}>
                    {best ? `₱${fmt(best.price)}` : "—"}
                  </Text>
                  <Text style={{ width: 100, fontSize: 12, fontWeight: "600",
                    color: G.dark, textAlign: "right" }}>
                    {bestSupp?.supplierName || "—"}
                  </Text>
                </View>
              );
            })}

            {/* Totals row */}
            <View style={{ flexDirection: "row", alignItems: "center",
              paddingHorizontal: 10, paddingVertical: 10, backgroundColor: "#f3f4f6",
              borderTopWidth: 2, borderTopColor: G.border }}>
              <Text style={{ width: 240, fontSize: 11, fontWeight: "700", color: G.muted,
                textTransform: "uppercase", letterSpacing: 0.5 }}>
                Grand Total
              </Text>
              {supplierTotals.map(({ sp, total }) => (
                <Text key={sp.id} style={{ width: 100, fontSize: 13, fontFamily: MONO,
                  fontWeight: "700", textAlign: "right", color: "#374151" }}>
                  {total > 0 ? `₱${fmt(total)}` : "—"}
                </Text>
              ))}
              <Text style={{ width: 100, fontSize: 13, fontFamily: MONO,
                fontWeight: "700", textAlign: "right", color: G.mid }}>
                {lowestSupplier ? `₱${fmt(lowestSupplier.total)}` : "—"}
              </Text>
              <Text style={{ width: 100, fontSize: 12, fontWeight: "700",
                color: G.dark, textAlign: "right" }}>
                {lowestSupplier?.sp.supplierName || "—"}
              </Text>
            </View>
          </View>
        </ScrollView>

        {lowestSupplier && (
          <View style={{ flexDirection: "row", gap: 10, backgroundColor: G.llight,
            borderLeftWidth: 4, borderLeftColor: G.green, borderRadius: 10,
            padding: 12, marginTop: 12 }}>
            <Text style={{ fontSize: 18 }}>🏆</Text>
            <Text style={{ flex: 1, fontSize: 13, color: "#374151", lineHeight: 19 }}>
              Recommended awardee: <Text style={{ fontWeight: "700" }}>{lowestSupplier.sp.supplierName}</Text> with a total of <Text style={{ fontWeight: "700", color: G.mid }}>₱{fmt(lowestSupplier.total)}</Text> — lowest among all submitted quotations.
            </Text>
          </View>
        )}
      </Card>

      <BACSignatories members={aaaMembers} onSign={signMember} title="AAA Signatories" />

      {allSigned && lowestSupplier && (
        <View style={{ backgroundColor: G.dark, borderRadius: 14, padding: 20, marginBottom: 12 }}>
          <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1,
            textTransform: "uppercase", color: G.green, marginBottom: 4 }}>
            Canvassing Complete ✓
          </Text>
          <Text style={{ fontSize: 20, fontWeight: "800", color: "#fff", marginBottom: 4 }}>
            Proceed to Phase 2 – Evaluation
          </Text>
          <Text style={{ fontSize: 12.5, color: "rgba(255,255,255,0.6)", lineHeight: 18, marginBottom: 16 }}>
            AAA signed by all parties. Forward to Supply Section with PR, canvass sheets, BAC Resolution, and supplier proposals.
          </Text>
          <TouchableOpacity onPress={() => onComplete({ supplierName: lowestSupplier.sp.supplierName, total: lowestSupplier.total })} activeOpacity={0.8}
            style={{ backgroundColor: G.green, paddingVertical: 12, paddingHorizontal: 20,
              borderRadius: 10, alignSelf: "flex-end" }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: G.dark }}>
              Forward to Supply Section →
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {!allSigned && (
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
          <Btn label="Save Draft" variant="ghost" onPress={() => {}} />
          <Btn label="Awaiting Signatures…" disabled onPress={() => {}} />
        </View>
      )}
    </>
  );
};

// ─── Root Component ───────────────────────────────────────────────────────────

export default function CanvassingModule({
  prRecord,
  onComplete,
  onBack,
}: CanvassingModuleProps) {
  const pr = prRecord ?? PLACEHOLDER_PR;

  const [stage,     setStage]     = useState<CanvassStage>("pr_received");
  const [completed, setCompleted] = useState<Set<CanvassStage>>(new Set());
  const [bacMembers,  setBACMembers]  = useState<BACMember[]>(initBACMembers);
  const [divisions,   setDivisions]   = useState<DivisionAssignment[]>(() => initDivisions(pr));
  const [suppliers,   setSuppliers]   = useState<SupplierQuote[]>([
    { id: 1, supplierName: "", address: "", contactNo: "", tinNo: "", deliveryDays: "", unitPrices: {}, remarks: "" },
  ]);

  // Session-level data accumulated across steps
  const sessionRef = useRef<Partial<CanvassSessionPayload>>({ pr_no: pr.prNo });

  const completeStage = useCallback((current: CanvassStage) => {
    setCompleted((s) => new Set([...s, current]));
    const idx = STAGE_ORDER.indexOf(current);
    if (idx < STAGE_ORDER.length - 1) setStage(STAGE_ORDER[idx + 1]);
  }, []);

  const handleFinalComplete = useCallback((awarded: { supplierName: string; total: number }) => {
    const payload: CanvassSessionPayload = {
      pr_no:               pr.prNo,
      bac_no:              sessionRef.current.bac_no      ?? "",
      resolution_no:       sessionRef.current.resolution_no ?? "",
      mode_of_procurement: sessionRef.current.mode_of_procurement ?? "",
      aaa_no:              sessionRef.current.aaa_no      ?? "",
      awarded_supplier:    awarded.supplierName,
      awarded_total:       awarded.total,
      suppliers,
      bac_members:         bacMembers,
    };

    // TODO: supabase.from("canvass_sessions").update(payload).eq("pr_no", pr.prNo)

    completeStage("aaa_preparation");
    onComplete?.(payload);
    Alert.alert("✅ Canvassing Complete", `Forwarded to Supply Section.\nAwarded to: ${awarded.supplierName}\nTotal: ₱${fmt(awarded.total)}`);
  }, [pr.prNo, suppliers, bacMembers, completeStage, onComplete]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: G.bg }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Top bar */}
      <View style={{ backgroundColor: G.dark, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {onBack && (
              <TouchableOpacity onPress={onBack} hitSlop={10}
                style={{ width: 32, height: 32, borderRadius: 8,
                  backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }}>
                <MaterialIcons name="chevron-left" size={20} color="#fff" />
              </TouchableOpacity>
            )}
            <View>
              <Text style={{ fontSize: 9.5, color: "rgba(255,255,255,0.45)", fontWeight: "600",
                textTransform: "uppercase", letterSpacing: 0.8 }}>
                Procurement › Purchase Request ›
              </Text>
              <Text style={{ fontSize: 15, fontWeight: "800", color: "#fff" }}>Canvassing</Text>
            </View>
          </View>
          <View style={{ backgroundColor: G.llight, paddingHorizontal: 10, paddingVertical: 5,
            borderRadius: 8, borderWidth: 1, borderColor: G.gold }}>
            <Text style={{ fontSize: 10.5, fontWeight: "700", color: G.goldD }}>
              ⏱ 7-day window
            </Text>
          </View>
        </View>

        {/* Stage strip */}
        <StageStrip current={stage} completed={completed} />
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {stage === "pr_received" && (
          <Step6PRReceived pr={pr} onComplete={() => completeStage("pr_received")} />
        )}
        {stage === "bac_resolution" && (
          <Step7BACResolution pr={pr} bacMembers={bacMembers}
            setBACMembers={setBACMembers} onComplete={() => completeStage("bac_resolution")} />
        )}
        {stage === "release_canvass" && (
          <Step8ReleaseCanvass divisions={divisions}
            setDivisions={setDivisions} onComplete={() => completeStage("release_canvass")} />
        )}
        {stage === "collect_canvass" && (
          <Step9CollectCanvass pr={pr} divisions={divisions} setDivisions={setDivisions}
            suppliers={suppliers} setSuppliers={setSuppliers}
            onComplete={() => completeStage("collect_canvass")} />
        )}
        {stage === "aaa_preparation" && (
          <Step10AAA pr={pr} suppliers={suppliers}
            bacMembers={bacMembers} onComplete={handleFinalComplete} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
