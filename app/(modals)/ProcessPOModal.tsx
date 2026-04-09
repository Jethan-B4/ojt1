/**
 * ProcessPOModal.tsx — Role-gated PO processing modal
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase/client";
import {
  fetchPOWithItemsById,
  updatePO,
  updatePOStatus,
} from "../../lib/supabase/po";
import { useAuth } from "../AuthContext";
import CalendarPickerModal from "./CalendarModal";
import {
  FlagButton,
  STATUS_FLAGS,
  StatusFlagPicker,
  type StatusFlag,
} from "./ProcessPRModal";

export interface ProcessPORecord {
  id: string;
  poNo: string;
  prNo: string;
  statusId: number;
}

export { STATUS_FLAGS, type StatusFlag };

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function normalizeDateString(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (!Number.isNaN(d.getTime())) return formatDate(d);
  return dateStr;
}

function DatePickerButton({
  value,
  onChange,
  placeholder = "Select date…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
        className="bg-gray-50 rounded-[10px] border border-gray-200 px-3 py-2.5 flex-row items-center justify-between"
        style={{ minHeight: 42 }}
      >
        <Text
          className="text-sm flex-1 mr-2"
          style={{ color: value ? "#111827" : "#9ca3af" }}
        >
          {value || placeholder}
        </Text>
        <MaterialIcons name="calendar-today" size={15} color="#064E3B" />
      </TouchableOpacity>
      <CalendarPickerModal
        visible={open}
        onClose={() => setOpen(false)}
        onSelectDate={(date) => {
          onChange(formatDate(date));
          setOpen(false);
        }}
      />
    </>
  );
}

function getStatusFlagId(flag: StatusFlag | null): number | null {
  if (!flag) return null;
  if (flag === "complete") return 2;
  if (flag === "incomplete_info") return 3;
  if (flag === "wrong_information") return 4;
  if (flag === "needs_revision") return 5;
  if (flag === "on_hold") return 6;
  if (flag === "urgent") return 7;
  return null;
}

export function canRoleProcessPO(roleId: number, statusId: number) {
  if (roleId === 1) return true;
  if (roleId === 8) return statusId === 12 || statusId === 13;
  if (roleId === 4) return statusId === 14;
  return false;
}

async function insertPORemark(
  poId: string,
  prId: string | null,
  userId: string | number | null,
  remark: string,
  statusFlagId: number | null,
): Promise<void> {
  const trimmed = remark.trim();
  if (!trimmed) return;
  const { error } = await supabase.from("remarks").insert({
    po_id: poId,
    pr_id: prId,
    user_id: userId ? String(userId) : null,
    remark: trimmed,
    status_flag_id: statusFlagId,
    created_at: new Date().toISOString(),
  });
  if (error) throw error;
}

interface ProcessPOModalProps {
  visible: boolean;
  record: ProcessPORecord | null;
  roleId: number;
  onClose: () => void;
  onProcessed: (poId: string, newStatusId: number) => void;
}

function Header({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
}) {
  return (
    <View className="px-5 pt-4 pb-3 bg-[#064E3B]">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-white/60 text-[11px] font-bold tracking-widest uppercase">
            {subtitle}
          </Text>
          <Text className="text-white text-[18px] font-extrabold">{title}</Text>
        </View>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={10}
          className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center"
        >
          <MaterialIcons name="close" size={18} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-3.5">
      <Text className="text-[11px] font-bold text-gray-500 mb-1">
        {label}
        {required ? <Text className="text-red-500"> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}

function Input({
  value,
  onChangeText,
  placeholder,
  mono,
  keyboardType,
  multiline,
}: {
  value: string;
  onChangeText?: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  keyboardType?: any;
  multiline?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#9ca3af"
      keyboardType={keyboardType}
      multiline={multiline}
      className="bg-gray-50 rounded-[10px] border border-gray-200 px-3 py-2.5 text-sm text-gray-900"
      style={[
        mono
          ? { fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace" }
          : {},
      ]}
    />
  );
}

function BudgetModal({
  visible,
  record,
  onClose,
  onProcessed,
}: Omit<ProcessPOModalProps, "roleId">) {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [headerPrId, setHeaderPrId] = useState<string | null>(null);
  const [orsNo, setOrsNo] = useState("");
  const [orsDate, setOrsDate] = useState("");
  const [orsAmount, setOrsAmount] = useState("");
  const [fundsAvailable, setFundsAvailable] = useState("");
  const [remarks, setRemarks] = useState("");
  const [statusFlag, setStatusFlag] = useState<StatusFlag | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);

  useEffect(() => {
    if (!visible || !record) return;
    setLoading(true);
    setSaving(false);
    setRemarks("");
    setStatusFlag(null);
    (async () => {
      try {
        const { header } = await fetchPOWithItemsById(record.id);
        setHeaderPrId((header as any)?.pr_id ?? null);
        setOrsNo((header as any)?.ors_no ?? "");
        setOrsDate(normalizeDateString((header as any)?.ors_date ?? ""));
        setOrsAmount(
          (header as any)?.ors_amount
            ? String((header as any)?.ors_amount)
            : "",
        );
        setFundsAvailable((header as any)?.funds_available ?? "");
      } catch (e: any) {
        Alert.alert("Load failed", e?.message ?? "Could not load PO details.");
      } finally {
        setLoading(false);
      }
    })();
  }, [visible, record]);

  const submit = useCallback(async () => {
    if (!record) return;
    setSaving(true);
    try {
      await insertPORemark(
        record.id,
        headerPrId,
        currentUser?.id ?? null,
        remarks,
        getStatusFlagId(statusFlag),
      );

      await updatePO(record.id, {
        ors_no: orsNo.trim() || null,
        ors_date: orsDate.trim() ? normalizeDateString(orsDate.trim()) : null,
        ors_amount: orsAmount.trim() ? Number(orsAmount) || 0 : null,
        funds_available: fundsAvailable.trim() || null,
      });

      const targetStatusId = 15;
      await updatePOStatus(record.id, targetStatusId);
      onProcessed(record.id, targetStatusId);
      onClose();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not update PO status.");
    } finally {
      setSaving(false);
    }
  }, [
    record,
    headerPrId,
    currentUser?.id,
    remarks,
    statusFlag,
    orsNo,
    orsDate,
    orsAmount,
    fundsAvailable,
    onProcessed,
    onClose,
  ]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-gray-50">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <Header
            title="Process ORS"
            subtitle={`Budget · ${record?.poNo ?? ""}`}
            onClose={onClose}
          />
          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
              <Text className="text-[12px] text-gray-400 mt-2">Loading…</Text>
            </View>
          ) : (
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            >
              <View
                className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
                style={{ elevation: 2 }}
              >
                <View className="px-4 pt-3 pb-3">
                  <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    ORS Details
                  </Text>

                  <Field label="ORS No." required>
                    <Input
                      value={orsNo}
                      onChangeText={setOrsNo}
                      placeholder="e.g. ORS-2026-001"
                      mono
                    />
                  </Field>

                  <Field label="ORS Date" required>
                    <DatePickerButton
                      value={orsDate}
                      onChange={setOrsDate}
                      placeholder="Select ORS date…"
                    />
                  </Field>

                  <Field label="ORS Amount">
                    <Input
                      value={orsAmount}
                      onChangeText={setOrsAmount}
                      placeholder="e.g. 150000.00"
                      keyboardType="numeric"
                      mono
                    />
                  </Field>

                  <Field label="Funds Available">
                    <Input
                      value={fundsAvailable}
                      onChangeText={setFundsAvailable}
                      placeholder="Optional"
                    />
                  </Field>
                </View>
              </View>

              <View
                className="bg-white rounded-2xl border border-gray-200 overflow-hidden mt-3"
                style={{ elevation: 2 }}
              >
                <View className="px-4 pt-3 pb-3">
                  <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    Remark & Flag
                  </Text>

                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-[11px] font-bold text-gray-500">
                      Status flag
                    </Text>
                    <FlagButton
                      selected={statusFlag}
                      onPress={() => setFlagOpen(true)}
                    />
                  </View>

                  <Field label="Remark">
                    <Input
                      value={remarks}
                      onChangeText={setRemarks}
                      placeholder="Optional remark for this ORS step…"
                      multiline
                    />
                  </Field>
                </View>
              </View>

              <TouchableOpacity
                onPress={submit}
                disabled={saving || !orsNo.trim() || !orsDate.trim()}
                activeOpacity={0.85}
                className={`mt-4 rounded-2xl py-3 items-center ${
                  saving || !orsNo.trim() || !orsDate.trim()
                    ? "bg-gray-300"
                    : "bg-[#064E3B]"
                }`}
              >
                <Text className="text-[13.5px] font-extrabold text-white">
                  {saving ? "Saving…" : "Finalize ORS"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          <StatusFlagPicker
            visible={flagOpen}
            selected={statusFlag}
            onSelect={setStatusFlag}
            onClose={() => setFlagOpen(false)}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function SupplyModal({
  visible,
  record,
  onClose,
  onProcessed,
}: Omit<ProcessPOModalProps, "roleId">) {
  const { currentUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [headerPrId, setHeaderPrId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");
  const [statusFlag, setStatusFlag] = useState<StatusFlag | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);

  useEffect(() => {
    if (!visible || !record) return;
    setSaving(false);
    setRemarks("");
    setStatusFlag(null);
    (async () => {
      try {
        const { header } = await fetchPOWithItemsById(record.id);
        setHeaderPrId((header as any)?.pr_id ?? null);
      } catch {}
    })();
  }, [visible, record]);

  const submit = useCallback(async () => {
    if (!record) return;
    setSaving(true);
    try {
      await insertPORemark(
        record.id,
        headerPrId,
        currentUser?.id ?? null,
        remarks,
        getStatusFlagId(statusFlag),
      );
      const targetStatusId = record.statusId === 12 ? 13 : 14;
      await updatePOStatus(record.id, targetStatusId);
      onProcessed(record.id, targetStatusId);
      onClose();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not update PO status.");
    } finally {
      setSaving(false);
    }
  }, [
    record,
    headerPrId,
    currentUser?.id,
    remarks,
    statusFlag,
    onProcessed,
    onClose,
  ]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-gray-50">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <Header
            title="Process PO"
            subtitle={`Supply · ${record?.poNo ?? ""}`}
            onClose={onClose}
          />
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          >
            <View
              className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
              style={{ elevation: 2 }}
            >
              <View className="px-4 pt-3 pb-3">
                <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                  Remark & Flag
                </Text>
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-[11px] font-bold text-gray-500">
                    Status flag
                  </Text>
                  <FlagButton
                    selected={statusFlag}
                    onPress={() => setFlagOpen(true)}
                  />
                </View>
                <Field label="Remark">
                  <Input
                    value={remarks}
                    onChangeText={setRemarks}
                    placeholder="Optional remark for this step…"
                    multiline
                  />
                </Field>
              </View>
            </View>

            <TouchableOpacity
              onPress={submit}
              disabled={saving}
              activeOpacity={0.85}
              className={`mt-4 rounded-2xl py-3 items-center ${saving ? "bg-gray-300" : "bg-[#064E3B]"}`}
            >
              <Text className="text-[13.5px] font-extrabold text-white">
                {saving
                  ? "Saving…"
                  : record?.statusId === 12
                    ? "Advance to Allocation"
                    : "Forward to Budget"}
              </Text>
            </TouchableOpacity>
          </ScrollView>

          <StatusFlagPicker
            visible={flagOpen}
            selected={statusFlag}
            onSelect={setStatusFlag}
            onClose={() => setFlagOpen(false)}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function AdminModal(props: Omit<ProcessPOModalProps, "roleId">) {
  return <SupplyModal {...props} />;
}

export default function ProcessPOModal({
  roleId,
  ...rest
}: ProcessPOModalProps) {
  if (!rest.visible) return null;
  if (!rest.record) return null;
  if (roleId === 1) return <AdminModal {...rest} />;
  if (roleId === 4) return <BudgetModal {...rest} />;
  if (roleId === 8) return <SupplyModal {...rest} />;
  return null;
}
