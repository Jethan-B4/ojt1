/**
 * PaymentRemarkSheet.tsx
 *
 * Unified remarks bottom-sheet for a Payment.
 * Shows a merged, chronological timeline of:
 *   • PR remarks
 *   • PO remarks
 *   • Delivery remarks
 *   • Payment remarks
 *
 * Submission tags the remark with [PAYMENT].
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as DocumentPicker from "expo-document-picker";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  FlagButton,
  STATUS_FLAGS,
  StatusFlagPicker,
  type StatusFlag,
} from "../(modals)/ProcessPRModal";
import {
  buildRemotePath,
  guessContentType,
  supabase,
  uploadPRFile,
} from "../../lib/supabase";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface PaymentRemarkSheetRecord {
  id: number;
  deliveryNo: string;
  poNo: string;
  supplier: string;
  poId: number | null;
  prId: string | null;
  prNo: string;
}

// ─── Flag helpers ─────────────────────────────────────────────────────────────

const FLAG_TO_ID: Record<StatusFlag, number> = {
  complete: 2,
  incomplete_info: 3,
  wrong_information: 4,
  needs_revision: 5,
  on_hold: 6,
  urgent: 7,
};

const ID_TO_FLAG: Record<number, StatusFlag> = {
  2: "complete",
  3: "incomplete_info",
  4: "wrong_information",
  5: "needs_revision",
  6: "on_hold",
  7: "urgent",
};

function getStatusFlagId(flag: StatusFlag | null): number | null {
  return flag ? FLAG_TO_ID[flag] : null;
}

function getFlagFromId(id: number | null): StatusFlag | null {
  return id ? (ID_TO_FLAG[id] ?? null) : null;
}

// ─── Unified remark entry ─────────────────────────────────────────────────────

interface UnifiedRemark {
  id: number;
  remark: string;
  status_flag_id: number | null;
  created_at: string;
  user_id: number | null;
  username?: string;
  phase: "pr" | "po" | "delivery" | "payment";
}

function phaseFromRemark(
  raw: string,
  prId: string | null,
  poId: number | null,
): "pr" | "po" | "delivery" | "payment" {
  const m = raw.match(/^\s*\[(DELIVERY|PAYMENT|PO)\]\s*/i);
  if (m) {
    const tag = m[1].toUpperCase();
    if (tag === "DELIVERY") return "delivery";
    if (tag === "PAYMENT") return "payment";
    return "po";
  }
  // Fallback if no tag: if it has po_id but no tag, it's likely a PO remark
  // If it only has pr_id, it's a PR remark
  return poId ? "po" : "pr";
}

function cleanRemarkText(raw: string): string {
  return raw.replace(/^\s*\[(DELIVERY|PAYMENT|PO)\]\s*/i, "").trimStart();
}

function phaseBadge(phase: string) {
  if (phase === "pr")
    return { bg: "#eff6ff", dot: "#3b82f6", text: "#1d4ed8", label: "PR" };
  if (phase === "delivery")
    return {
      bg: "#ecfeff",
      dot: "#06b6d4",
      text: "#0e7490",
      label: "Delivery",
    };
  if (phase === "payment")
    return { bg: "#faf5ff", dot: "#a855f7", text: "#6d28d9", label: "Payment" };
  return { bg: "#f0fdf4", dot: "#10b981", text: "#065f46", label: "PO" };
}

// ─── Attachment helpers ───────────────────────────────────────────────────────

function encodeAttachment(filename: string, url: string): string {
  return `[${filename}](${url})`;
}

interface ParsedAttachment {
  filename: string;
  url: string;
}

function parseAttachments(remark: string): {
  text: string;
  attachments: ParsedAttachment[];
} {
  const attachments: ParsedAttachment[] = [];
  const TOKEN_RE = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let text = remark.replace(TOKEN_RE, (_, filename, url) => {
    attachments.push({ filename: filename.trim(), url: url.trim() });
    return "";
  });
  const LEGACY_RE = /^Attachment:\s*(https?:\/\/\S+)/gim;
  text = text.replace(LEGACY_RE, (_: string, url: string) => {
    const cleanUrl = url.trim();
    const rawSegment = decodeURIComponent(cleanUrl.split("/").pop() ?? "");
    const filename =
      rawSegment.replace(/^\d+-/, "") || rawSegment || "attachment";
    attachments.push({ filename, url: cleanUrl });
    return "";
  });
  text = text.replace(/\n{2,}/g, "\n").trim();
  return { text, attachments };
}

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

const AttachmentChip: React.FC<{ attachment: ParsedAttachment }> = ({
  attachment,
}) => {
  const { filename, url } = attachment;
  const handleView = async () => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Error", "Could not open attachment.");
    }
  };
  return (
    <TouchableOpacity
      onPress={handleView}
      activeOpacity={0.7}
      className="flex-row items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-1.5 mt-2"
    >
      <MaterialIcons name="attach-file" size={14} color="#2563eb" />
      <Text
        className="text-[11px] font-semibold text-blue-700 flex-1"
        numberOfLines={1}
      >
        {filename}
      </Text>
    </TouchableOpacity>
  );
};

// ─── RemarkTimelineItem ───────────────────────────────────────────────────────

const RemarkTimelineItem: React.FC<{
  entry: UnifiedRemark;
  isLast: boolean;
}> = ({ entry, isLast }) => {
  const p = phaseBadge(entry.phase);
  const flagKey = getFlagFromId(entry.status_flag_id);
  const flag = flagKey ? STATUS_FLAGS[flagKey] : null;
  const date = new Date(entry.created_at);
  const timeStr = date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const { text, attachments } = parseAttachments(cleanRemarkText(entry.remark));

  return (
    <View className="flex-row gap-3 px-5">
      <View className="items-center" style={{ width: 28 }}>
        <View
          className="w-7 h-7 rounded-full items-center justify-center border-2 border-white shadow-sm"
          style={{
            backgroundColor: flag ? flag.dot + "22" : p.bg,
            borderColor: flag ? flag.dot + "55" : p.dot + "55",
          }}
        >
          <MaterialIcons
            name={
              flag
                ? flag.icon
                : entry.phase === "pr"
                  ? "receipt-long"
                  : "chat-bubble-outline"
            }
            size={12}
            color={flag ? flag.dot : p.dot}
          />
        </View>
        {!isLast && <View className="flex-1 w-px bg-gray-200 mt-1" />}
      </View>
      <View className="flex-1 pb-5">
        <View className="flex-row items-center gap-2 mb-1.5 flex-wrap">
          <View
            className="flex-row items-center gap-1 px-2 py-0.5 rounded-full"
            style={{ backgroundColor: p.bg }}
          >
            <View
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: p.dot }}
            />
            <Text className="text-[10px] font-bold" style={{ color: p.text }}>
              {p.label}
            </Text>
          </View>
          {flag && (
            <View
              className="flex-row items-center gap-1 px-2 py-0.5 rounded-full border"
              style={{ backgroundColor: flag.bg, borderColor: flag.dot + "40" }}
            >
              <Text
                className="text-[10px] font-bold"
                style={{ color: flag.text }}
              >
                {flag.label}
              </Text>
            </View>
          )}
          <Text className="text-[10px] text-gray-400">{timeStr}</Text>
          {entry.username && (
            <Text className="text-[10px] font-semibold text-gray-500">
              · {entry.username}
            </Text>
          )}
        </View>
        <View className="bg-white rounded-2xl px-3.5 py-3 border border-gray-100 shadow-sm">
          <Text className="text-[13px] text-gray-700 leading-[20px]">
            {text || "No text provided."}
          </Text>
          {attachments.map((att, i) => (
            <AttachmentChip key={i} attachment={att} />
          ))}
        </View>
      </View>
    </View>
  );
};

// ─── PaymentRemarkSheet ──────────────────────────────────────────────────────

interface PaymentRemarkSheetProps {
  visible: boolean;
  record: PaymentRemarkSheetRecord | null;
  currentUser: any;
  onClose: () => void;
}

export function PaymentRemarkSheet({
  visible,
  record,
  currentUser,
  onClose,
}: PaymentRemarkSheetProps) {
  const [remarksText, setRemarksText] = useState("");
  const [statusFlag, setStatusFlag] = useState<StatusFlag | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [history, setHistory] = useState<UnifiedRemark[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileUri, setFileUri] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!record) return;
    setLoading(true);
    try {
      const query = supabase
        .from("remarks")
        .select(
          "id, remark, status_flag_id, created_at, user_id, po_id, pr_id, users(fullname)",
        )
        .order("created_at", { ascending: false });

      const filters = [];
      if (record.poId) filters.push(`po_id.eq.${record.poId}`);
      if (record.prId) filters.push(`pr_id.eq.${record.prId}`);

      if (filters.length > 0) {
        query.or(filters.join(","));
      } else {
        // Fallback (should not happen if record is valid)
        setHistory([]);
        setLoading(false);
        return;
      }

      const { data, error } = await query;
      if (error) throw error;

      const unified: UnifiedRemark[] = (data ?? []).map((r: any) => ({
        id: r.id,
        remark: r.remark ?? "",
        status_flag_id: r.status_flag_id as number | null,
        created_at: r.created_at,
        user_id: r.user_id,
        username: r.users?.fullname ?? undefined,
        phase: phaseFromRemark(r.remark ?? "", r.pr_id, r.po_id),
      }));

      setHistory(unified);
    } catch (e: any) {
      console.error("Load history error:", e);
    } finally {
      setLoading(false);
    }
  }, [record?.poId, record?.prId]);

  useEffect(() => {
    if (visible && record) loadHistory();
  }, [visible, record, loadHistory]);

  const handlePickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "*/*" });
      if (res.canceled) return;
      setFileName(res.assets[0].name);
      setFileUri(res.assets[0].uri);
    } catch {
      Alert.alert("Error", "Could not pick file.");
    }
  };

  const handleSubmit = async () => {
    if (!record || !remarksText.trim() || saving) return;
    setSaving(true);
    try {
      let finalRemark = `[PAYMENT] ${remarksText.trim()}`;
      if (fileUri && fileName) {
        const remote = buildRemotePath(`PAY-${record.deliveryNo}`, fileName);
        const uploaded = await uploadPRFile(
          fileUri,
          remote,
          guessContentType(fileName),
        );
        finalRemark += `\n${encodeAttachment(fileName, uploaded.publicUrl)}`;
      }

      const { error } = await supabase.from("remarks").insert({
        po_id: record.poId,
        pr_id: record.prId ? Number(record.prId) : null,
        user_id: currentUser?.id,
        remark: finalRemark,
        status_flag_id: getStatusFlagId(statusFlag),
        created_at: new Date().toISOString(),
      });

      if (error) throw error;

      setRemarksText("");
      setStatusFlag(null);
      setFileName(null);
      setFileUri(null);
      await loadHistory();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to save remark.");
    } finally {
      setSaving(false);
    }
  };

  if (!visible || !record) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/40 justify-end">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1 justify-end"
        >
          <Pressable className="flex-1" onPress={onClose} />
          <View className="bg-gray-50 rounded-t-3xl overflow-hidden h-[85%]">
            <View className="bg-[#7c3aed] px-5 pt-4 pb-4">
              <View className="w-10 h-1 rounded-full bg-white/20 self-center mb-3" />
              <View className="flex-row items-start justify-between">
                <View className="flex-1">
                  <Text className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-0.5">
                    Payment Remarks & Flags
                  </Text>
                  <Text
                    className="text-[16px] font-extrabold text-white"
                    style={{ fontFamily: MONO }}
                  >
                    {record.deliveryNo}
                  </Text>
                  <Text className="text-[11px] text-white/60 mt-0.5">
                    PO {record.poNo} · {record.supplier}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center"
                >
                  <MaterialIcons name="close" size={20} color="white" />
                </TouchableOpacity>
              </View>
            </View>

            <FlatList
              data={history}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ paddingTop: 20, paddingBottom: 40 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              ListHeaderComponent={
                <View className="bg-white mx-4 mb-6 rounded-2xl border border-gray-200 p-4 shadow-sm">
                  <Text className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">
                    Add Payment Remark
                  </Text>

                  <View className="mb-3">
                    <Text className="text-[12px] font-bold text-gray-600 mb-1.5">
                      Status Flag
                    </Text>
                    <FlagButton
                      selected={statusFlag}
                      onPress={() => setFlagOpen(true)}
                    />
                  </View>

                  <View className="mb-3">
                    <Text className="text-[12px] font-bold text-gray-600 mb-1.5">
                      Remark <Text className="text-red-500">*</Text>
                    </Text>
                    <TextInput
                      value={remarksText}
                      onChangeText={setRemarksText}
                      placeholder="Add a note about this payment..."
                      multiline
                      className="bg-gray-50 rounded-xl px-3.5 py-2.5 text-[14px] text-gray-800 border border-gray-200 min-h-[80px]"
                      style={{ textAlignVertical: "top" }}
                    />
                  </View>

                  <TouchableOpacity
                    onPress={handlePickFile}
                    className={`flex-row items-center gap-2 rounded-xl border px-3.5 py-2.5 mb-3 ${fileName ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-200"}`}
                  >
                    <MaterialIcons
                      name="attach-file"
                      size={16}
                      color={fileName ? "#10b981" : "#9ca3af"}
                    />
                    <Text
                      className={`text-[13px] flex-1 ${fileName ? "text-emerald-700 font-bold" : "text-gray-400"}`}
                      numberOfLines={1}
                    >
                      {fileName ?? "Attach a file (optional)"}
                    </Text>
                    {fileName && (
                      <TouchableOpacity
                        onPress={() => {
                          setFileName(null);
                          setFileUri(null);
                        }}
                      >
                        <Text className="text-[11px] text-red-500 font-bold">
                          Clear
                        </Text>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleSubmit}
                    disabled={!remarksText.trim() || saving}
                    className={`flex-row items-center justify-center gap-2 py-3 rounded-xl ${remarksText.trim() && !saving ? "bg-[#7c3aed]" : "bg-gray-200"}`}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <MaterialIcons name="send" size={16} color="white" />
                    )}
                    <Text className="text-white font-bold text-[14px]">
                      {saving ? "Saving..." : "Save Remark"}
                    </Text>
                  </TouchableOpacity>
                </View>
              }
              renderItem={({ item, index }) => (
                <RemarkTimelineItem
                  entry={item}
                  isLast={index === history.length - 1}
                />
              )}
              ListEmptyComponent={
                !loading ? (
                  <View className="items-center py-10">
                    <MaterialIcons
                      name="chat-bubble-outline"
                      size={40}
                      color="#d1d5db"
                    />
                    <Text className="text-gray-400 mt-2 font-medium">
                      No remarks found for this thread.
                    </Text>
                  </View>
                ) : null
              }
              ListFooterComponent={
                loading ? (
                  <ActivityIndicator
                    size="small"
                    color="#7c3aed"
                    className="py-4"
                  />
                ) : null
              }
            />
          </View>
        </KeyboardAvoidingView>
      </View>

      <StatusFlagPicker
        visible={flagOpen}
        selected={statusFlag}
        onSelect={(f) => {
          setStatusFlag(f);
          setFlagOpen(false);
        }}
        onClose={() => setFlagOpen(false)}
      />
    </Modal>
  );
}
