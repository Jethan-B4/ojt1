/**
 * ProcessPRModal.tsx
 *
 * Role-gated processing modals for the DAR procurement workflow (Phase 1).
 * Swimlane reference:
 *   role_id 2 → Division Head  — Step 2: Sign & forward to BAC
 *   role_id 3 → BAC            — Step 3: Number, certify inclusion in APP
 *   role_id 4 → Budget         — Step 4: Earmark & record against PPMP
 *
 * Usage:
 *   <ProcessPRModal
 *     visible={processVisible}
 *     record={processRecord}          // { id, prNo }
 *     roleId={currentUser.role_id}
 *     onClose={close}
 *     onProcessed={(id, newStatus) => updateList(id, newStatus)}
 *   />
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView,
  Modal, Platform, ScrollView, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { fetchPRWithItemsById, supabase } from "../../lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProcessRecord { id: string; prNo: string; }

interface ProcessPRModalProps {
  visible:     boolean;
  record:      ProcessRecord | null;
  roleId:      number;
  onClose:     () => void;
  onProcessed: (id: string, newStatus: string) => void;
}

interface PRHeader {
  pr_no:          string;
  office_section: string;
  purpose:        string;
  total_cost:     number;
  status:         string;
  budget_number:  string | null;
  pap_code:       string | null;
}

// ─── Role metadata ────────────────────────────────────────────────────────────

const ROLE_META: Record<number, {
  step:         string;
  title:        string;
  accentColor:  string;
  bannerBg:     string;
  bannerBorder: string;
  nextStatus:   string;
}> = {
  2: {
    step: "Step 2", title: "Division Head Review",
    accentColor: "#1d4ed8", bannerBg: "bg-blue-50",   bannerBorder: "border-blue-400",
    nextStatus: "processing",
  },
  3: {
    step: "Step 3", title: "BAC Certification",
    accentColor: "#7c3aed", bannerBg: "bg-violet-50", bannerBorder: "border-violet-400",
    nextStatus: "processing",
  },
  4: {
    step: "Step 4", title: "Budget Earmarking",
    accentColor: "#b45309", bannerBg: "bg-amber-50",  bannerBorder: "border-amber-400",
    nextStatus: "processing",
  },
  5: {
    step: "Step 5", title: "PARPO Approval",
    accentColor: "#065f46", bannerBg: "bg-emerald-50", bannerBorder: "border-emerald-400",
    nextStatus: "approved",
  },
};

// ─── Shared utilities ─────────────────────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const fmt  = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Fetch PR header whenever the modal opens — mirrors ViewPRModal's useEffect pattern */
function usePRFetch(visible: boolean, record: ProcessRecord | null, onClose: () => void) {
  const [header,  setHeader]  = useState<PRHeader | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !record) return;
    setHeader(null);
    setLoading(true);
    fetchPRWithItemsById(record.id)
      .then(({ header }) => setHeader(header as unknown as PRHeader))
      .catch((e: any) => { Alert.alert("Error", e?.message ?? "Could not load PR."); onClose(); })
      .finally(() => setLoading(false));
  }, [visible, record]);

  return { header, loading };
}

// ─── Micro-components ─────────────────────────────────────────────────────────

function ModalHeader({ meta, prNo, onClose }: {
  meta: typeof ROLE_META[number]; prNo: string; onClose: () => void;
}) {
  return (
    <View style={{ backgroundColor: meta.accentColor, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 }}>
      <View className="flex-row items-start justify-between mb-3">
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-xl items-center justify-center bg-white/10">
            <Text className="text-xl">📋</Text>
          </View>
          <View>
            <Text className="text-[10px] font-bold uppercase tracking-widest text-white/50">
              DAR · Procurement · {meta.step}
            </Text>
            <Text className="text-[16px] font-bold text-white">{meta.title}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={10}
          className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center">
          <Text className="text-white text-[20px] leading-none font-light">×</Text>
        </TouchableOpacity>
      </View>
      <View className="self-start px-2.5 py-1 rounded-md bg-white/10 border border-white/20">
        <Text className="text-[10.5px] text-white/60" style={{ fontFamily: MONO }}>{prNo}</Text>
      </View>
    </View>
  );
}

function InfoBanner({ bg, border, children }: { bg: string; border: string; children: React.ReactNode }) {
  return (
    <View className={`flex-row items-start gap-3 ${bg} border-l-4 ${border} rounded-2xl p-3.5 mb-4`}>
      <Text className="text-base mt-0.5">ℹ️</Text>
      <Text className="flex-1 text-[12.5px] text-gray-700 leading-[19px]">{children}</Text>
    </View>
  );
}

function PRSummaryCard({ header }: { header: PRHeader }) {
  const rows = [
    { label: "PR No.",  value: header.pr_no,               mono: true  },
    { label: "Section", value: header.office_section,       mono: false },
    { label: "Purpose", value: header.purpose,              mono: false },
    { label: "Amount",  value: `₱${fmt(header.total_cost)}`, mono: true  },
    { label: "Status",  value: header.status,               mono: false },
  ];
  return (
    <View className="bg-white rounded-2xl border border-gray-200 p-4 mb-4"
      style={{ shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 }}>
      <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">PR Summary</Text>
      {rows.map(({ label, value, mono }, i) => (
        <View key={label}
          className={`flex-row items-start justify-between py-2 ${i < rows.length - 1 ? "border-b border-gray-100" : ""}`}>
          <Text className="text-[11.5px] font-semibold text-gray-400 w-20">{label}</Text>
          <Text className="text-[12px] font-semibold text-gray-800 flex-1 text-right"
            style={mono ? { fontFamily: MONO } : undefined} numberOfLines={2}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-[10.5px] font-bold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </Text>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <View className="mb-4">
      <View className="flex-row items-center gap-1 mb-1.5">
        <Text className="text-[12px] font-semibold text-gray-700">{label}</Text>
        {required && <Text className="text-[12px] font-bold text-red-500">*</Text>}
      </View>
      {children}
    </View>
  );
}

function StyledInput({ value, onChangeText, placeholder, multiline }: {
  value: string; onChangeText: (t: string) => void; placeholder?: string; multiline?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value} onChangeText={onChangeText}
      placeholder={placeholder} placeholderTextColor="#9ca3af"
      multiline={multiline} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      className={`rounded-xl px-3.5 py-2.5 text-[13.5px] text-gray-800 border bg-white
        ${focused ? "border-emerald-500" : "border-gray-200"}
        ${multiline ? "min-h-[80px]" : ""}`}
      style={multiline ? { textAlignVertical: "top" } : undefined}
    />
  );
}

function LoadingBody({ color }: { color: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-gray-50">
      <ActivityIndicator size="large" color={color} />
      <Text className="text-[13px] text-gray-400">Loading PR…</Text>
    </View>
  );
}

function ModalFooter({ onCancel, onConfirm, confirmLabel, confirmingLabel, disabled, saving, color }: {
  onCancel: () => void; onConfirm: () => void;
  confirmLabel: string; confirmingLabel: string;
  disabled: boolean; saving: boolean; color: string;
}) {
  return (
    <View className="flex-row items-center justify-between px-5 py-4 bg-white border-t border-gray-100">
      <TouchableOpacity onPress={onCancel} activeOpacity={0.7}
        className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white">
        <Text className="text-[13.5px] font-semibold text-gray-500">Cancel</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onConfirm} disabled={disabled || saving} activeOpacity={0.8}
        className={`flex-row items-center gap-2 px-5 py-2.5 rounded-xl ${(disabled || saving) ? "opacity-40" : ""}`}
        style={{ backgroundColor: color }}>
        {saving && <ActivityIndicator size="small" color="#fff" />}
        <Text className="text-[13.5px] font-bold text-white">
          {saving ? confirmingLabel : confirmLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Division Head Modal (role_id = 2 · Step 2) ───────────────────────────────

function DivisionHeadModal({ visible, record, onClose, onProcessed }: Omit<ProcessPRModalProps, "roleId">) {
  const meta              = ROLE_META[2];
  const { header, loading } = usePRFetch(visible, record, onClose);
  const [remarks, setRemarks] = useState("");
  const [saving,  setSaving]  = useState(false);

  useEffect(() => { if (visible) setRemarks(""); }, [visible]);

  const handleSign = async () => {
    if (!record || !remarks.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("purchase_requests").update({ status: meta.nextStatus }).eq("id", record.id);
      if (error) throw error;
      onProcessed(record.id, meta.nextStatus);
      onClose();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not process the PR.");
    } finally { setSaving(false); }
  };

  if (!record) return null;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView className="flex-1 bg-white" behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ModalHeader meta={meta} prNo={record.prNo} onClose={onClose} />
        {loading ? <LoadingBody color={meta.accentColor} /> : (
          <ScrollView className="flex-1 bg-gray-50"
            contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <InfoBanner bg={meta.bannerBg} border={meta.bannerBorder}>
              As <Text className="font-bold">Division Head</Text>, review and sign this PR to forward it
              to BAC for numbering and APP certification (Step 3).
            </InfoBanner>
            {header && <PRSummaryCard header={header} />}
            <SectionLabel>Your Action</SectionLabel>
            <Field label="Remarks / Notes" required>
              <StyledInput value={remarks} onChangeText={setRemarks}
                placeholder="e.g. Approved for procurement. Forward to BAC." multiline />
            </Field>
          </ScrollView>
        )}
        <ModalFooter
          onCancel={onClose} onConfirm={handleSign}
          confirmLabel="Sign & Forward to BAC" confirmingLabel="Signing…"
          disabled={!remarks.trim() || loading} saving={saving} color={meta.accentColor}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── BAC Modal (role_id = 3 · Step 3) ────────────────────────────────────────

function BACModal({ visible, record, onClose, onProcessed }: Omit<ProcessPRModalProps, "roleId">) {
  const meta                = ROLE_META[3];
  const { header, loading } = usePRFetch(visible, record, onClose);
  const [assignedPR, setAssignedPR] = useState("");
  const [appNo,       setAppNo]     = useState("");
  const [certNotes, setCertNotes] = useState("");
  const [saving,    setSaving]    = useState(false);

  useEffect(() => { if (visible) { setAssignedPR(""); setAppNo(""); setCertNotes(""); } }, [visible]);

  const handleCertify = async () => {
    if (!record || !assignedPR.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("purchase_requests")
        .update({ status: meta.nextStatus, pr_no: assignedPR.trim(), app_no: appNo.trim() || null })
        .eq("id", record.id);
      if (error) throw error;
      onProcessed(record.id, meta.nextStatus);
      onClose();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not certify the PR.");
    } finally { setSaving(false); }
  };

  if (!record) return null;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView className="flex-1 bg-white" behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ModalHeader meta={meta} prNo={record.prNo} onClose={onClose} />
        {loading ? <LoadingBody color={meta.accentColor} /> : (
          <ScrollView className="flex-1 bg-gray-50"
            contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <InfoBanner bg={meta.bannerBg} border={meta.bannerBorder}>
              As <Text className="font-bold">BAC</Text>, assign the PR number and certify inclusion
              in the Annual Procurement Plan before forwarding to Budget (Step 4).
            </InfoBanner>
            {header && <PRSummaryCard header={header} />}
            <SectionLabel>BAC Action</SectionLabel>
            <Field label="PR Number" required>
              <StyledInput value={assignedPR} onChangeText={setAssignedPR} placeholder="e.g. 2026-PR-0042" />
            </Field>
            <Field label="APP Number">
              <StyledInput value={appNo} onChangeText={setAppNo} placeholder="e.g. 2026-APP-0042" />
            </Field>
            <Field label="Certification Notes">
              <StyledInput value={certNotes} onChangeText={setCertNotes}
                placeholder="e.g. Included in APP Q1 2026. Forwarding to Budget." multiline />
            </Field>
          </ScrollView>
        )}
        <ModalFooter
          onCancel={onClose} onConfirm={handleCertify}
          confirmLabel="Assign PR & Forward to Budget" confirmingLabel="Certifying…"
          disabled={!assignedPR.trim() || loading} saving={saving} color={meta.accentColor}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Budget Modal (role_id = 4 · Step 4) ─────────────────────────────────────

function BudgetModal({ visible, record, onClose, onProcessed }: Omit<ProcessPRModalProps, "roleId">) {
  const meta                = ROLE_META[4];
  const { header, loading } = usePRFetch(visible, record, onClose);
  const [budgetNo,    setBudgetNo]    = useState("");
  const [papCode,     setPapCode]     = useState("");
  const [earmarkNote, setEarmarkNote] = useState("");
  const [saving,      setSaving]      = useState(false);

  // Reset on open
  useEffect(() => { if (visible) { setBudgetNo(""); setPapCode(""); setEarmarkNote(""); } }, [visible]);

  // Pre-fill existing values once loaded
  useEffect(() => {
    if (!header) return;
    if (header.budget_number) setBudgetNo(header.budget_number);
    if (header.pap_code)      setPapCode(header.pap_code);
  }, [header]);

  const handleEarmark = async () => {
    if (!record || !budgetNo.trim() || !papCode.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("purchase_requests")
        .update({ status: meta.nextStatus, budget_number: budgetNo.trim(), pap_code: papCode.trim() })
        .eq("id", record.id);
      if (error) throw error;
      onProcessed(record.id, meta.nextStatus);
      onClose();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not earmark the PR.");
    } finally { setSaving(false); }
  };

  if (!record) return null;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView className="flex-1 bg-white" behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ModalHeader meta={meta} prNo={record.prNo} onClose={onClose} />
        {loading ? <LoadingBody color={meta.accentColor} /> : (
          <ScrollView className="flex-1 bg-gray-50"
            contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <InfoBanner bg={meta.bannerBg} border={meta.bannerBorder}>
              As <Text className="font-bold">Budget Office</Text>, record the PPMP budget number and
              PAP/Activity code to earmark funds, then forward to PARPO for approval (Step 5).
            </InfoBanner>
            {header && <PRSummaryCard header={header} />}
            <SectionLabel>Earmarking Details</SectionLabel>
            <Field label="Budget Number (from PPMP)" required>
              <StyledInput value={budgetNo} onChangeText={setBudgetNo} placeholder="e.g. 2026-PPMP-0042" />
            </Field>
            <Field label="PAP / Activity Code" required>
              <StyledInput value={papCode} onChangeText={setPapCode} placeholder="e.g. ARBDSP-2026-001" />
            </Field>
            <Field label="Earmarking Notes">
              <StyledInput value={earmarkNote} onChangeText={setEarmarkNote}
                placeholder="e.g. Funds available under MFO 2. Forwarding to PARPO." multiline />
            </Field>
          </ScrollView>
        )}
        <ModalFooter
          onCancel={onClose} onConfirm={handleEarmark}
          confirmLabel="Earmark & Forward to PARPO" confirmingLabel="Recording…"
          disabled={!budgetNo.trim() || !papCode.trim() || loading} saving={saving} color={meta.accentColor}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── PARPO Modal (role_id = 5 · Step 5) ───────────────────────────────────────

function PARPOModal({ visible, record, onClose, onProcessed }: Omit<ProcessPRModalProps, "roleId">) {
  const meta                = ROLE_META[5];
  const { header, loading } = usePRFetch(visible, record, onClose);
  const [notes, setNotes]   = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (visible) setNotes(""); }, [visible]);

  const handleApprove = async () => {
    if (!record) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("purchase_requests")
        .update({ status: meta.nextStatus })
        .eq("id", record.id);
      if (error) throw error;
      onProcessed(record.id, meta.nextStatus);
      onClose();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not approve the PR.");
    } finally { setSaving(false); }
  };

  if (!record) return null;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView className="flex-1 bg-white" behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ModalHeader meta={meta} prNo={record.prNo} onClose={onClose} />
        {loading ? <LoadingBody color={meta.accentColor} /> : (
          <ScrollView className="flex-1 bg-gray-50"
            contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <InfoBanner bg={meta.bannerBg} border={meta.bannerBorder}>
              As <Text className="font-bold">PARPO</Text>, review and approve this PR to complete Phase 1 and
              advance to Canvassing (Steps 6–10).
            </InfoBanner>
            {header && <PRSummaryCard header={header} />}
            <SectionLabel>Approval</SectionLabel>
            <Field label="Approval Notes">
              <StyledInput value={notes} onChangeText={setNotes} placeholder="e.g. Approved. Proceed to canvassing." multiline />
            </Field>
          </ScrollView>
        )}
        <ModalFooter
          onCancel={onClose} onConfirm={handleApprove}
          confirmLabel="Approve PR" confirmingLabel="Approving…"
          disabled={loading} saving={saving} color={meta.accentColor}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Root export — routes to the correct modal by role_id ─────────────────────

export default function ProcessPRModal({ roleId, ...rest }: ProcessPRModalProps) {
  if (roleId === 2) return <DivisionHeadModal {...rest} />;
  if (roleId === 3) return <BACModal          {...rest} />;
  if (roleId === 4) return <BudgetModal       {...rest} />;
  if (roleId === 5) return <PARPOModal        {...rest} />;
  return null;
}
