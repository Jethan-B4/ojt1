/**
 * PORemarkSheet.tsx
 *
 * Unified remarks bottom-sheet for a Purchase Order.
 * Shows a merged, chronological timeline of:
 *   • PR remarks  (from public.remarks WHERE pr_id = linked_pr_id)
 *   • PO remarks  (from public.remarks WHERE po_id = po.id)
 *
 * New remarks submitted here are written to public.remarks with both
 * po_id AND pr_id (when the PO has a linked PR), so the full audit trail
 * is connected in the database.
 *
 * Interface mirrors RemarkSheet.tsx exactly so POModule can swap it in
 * without changing its props API.
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
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

export interface PORemarkSheetRecord {
  /** purchase_orders.id */
  id: string;
  poNo: string;
  supplier: string;
  /** purchase_orders.pr_id — FK to purchase_requests.id; null if manual PR entry */
  linkedPrId: string | null;
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
  /** "po" = from remarks table (with po_id); "pr" = from remarks table (without po_id) */
  source: "po" | "pr";
}

type RemarkPhase = "pr" | "po" | "delivery" | "payment";

function phaseFromRemark(entry: UnifiedRemark): {
  phase: RemarkPhase;
  cleanRemark: string;
} {
  const raw = entry.remark ?? "";
  if (entry.source === "pr") return { phase: "pr", cleanRemark: raw };

  const m = raw.match(/^\s*\[(DELIVERY|PAYMENT|PO)\]\s*/i);
  if (!m) return { phase: "po", cleanRemark: raw };
  const tag = String(m[1] ?? "").toUpperCase();
  const phase: RemarkPhase =
    tag === "DELIVERY" ? "delivery" : tag === "PAYMENT" ? "payment" : "po";
  return { phase, cleanRemark: raw.replace(m[0], "").trimStart() };
}

function phaseBadge(phase: RemarkPhase) {
  if (phase === "pr")
    return { bg: "#eff6ff", dot: "#3b82f6", text: "#1d4ed8", label: "PR" };
  if (phase === "delivery")
    return { bg: "#ecfeff", dot: "#06b6d4", text: "#0e7490", label: "Delivery" };
  if (phase === "payment")
    return { bg: "#faf5ff", dot: "#a855f7", text: "#6d28d9", label: "Payment" };
  return { bg: "#f0fdf4", dot: "#10b981", text: "#065f46", label: "PO" };
}

// ─── Attachment helpers (verbatim from RemarkSheet) ───────────────────────────

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
  text = text.replace(LEGACY_RE, (_, url: string) => {
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

function guessMime(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    heic: "image/heic",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    zip: "application/zip",
  };
  return map[ext] ?? "application/octet-stream";
}

function guessUTI(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "com.adobe.pdf",
    jpg: "public.jpeg",
    jpeg: "public.jpeg",
    png: "public.png",
    gif: "com.compuserve.gif",
    webp: "org.webmproject.webp",
    doc: "com.microsoft.word.doc",
    docx: "org.openxmlformats.wordprocessingml.document",
    xls: "com.microsoft.excel.xls",
    xlsx: "org.openxmlformats.spreadsheetml.sheet",
    zip: "public.zip-archive",
  };
  return map[ext] ?? "public.data";
}

// ─── AttachmentChip ───────────────────────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

const AttachmentChip: React.FC<{ attachment: ParsedAttachment }> = ({
  attachment,
}) => {
  const { filename, url } = attachment;
  const [saving, setSaving] = useState(false);
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const iconName: React.ComponentProps<typeof MaterialIcons>["name"] = [
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "heic",
  ].includes(ext)
    ? "image"
    : ext === "pdf"
      ? "picture-as-pdf"
      : ["doc", "docx"].includes(ext)
        ? "description"
        : ["xls", "xlsx"].includes(ext)
          ? "table-chart"
          : ["zip", "rar", "7z"].includes(ext)
            ? "folder-zip"
            : "attach-file";

  const handleView = useCallback(async () => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert("Cannot open", "No app available to open this file.");
        return;
      }
      await Linking.openURL(url);
    } catch (e: any) {
      Alert.alert("Open failed", e?.message ?? "Could not open file.");
    }
  }, [url]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!baseDir) {
        Alert.alert("Save failed", "No writable directory available.");
        return;
      }
      const { uri } = await FileSystem.downloadAsync(url, baseDir + filename);
      await Sharing.shareAsync(uri, {
        mimeType: guessMime(filename),
        dialogTitle: `Save ${filename}`,
        UTI: guessUTI(filename),
      });
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? "Could not save file.");
    } finally {
      setSaving(false);
    }
  }, [url, filename]);

  return (
    <View className="flex-row items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 mt-2">
      <TouchableOpacity
        onPress={handleView}
        activeOpacity={0.75}
        className="flex-1 flex-row items-center gap-2 pr-2"
      >
        <MaterialIcons name={iconName} size={16} color="#2563eb" />
        <Text
          className="flex-1 text-[12px] font-semibold text-blue-700"
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {filename}
        </Text>
      </TouchableOpacity>
      <View className="flex-row items-center gap-1.5">
        <TouchableOpacity
          onPress={handleView}
          activeOpacity={0.8}
          className="flex-row items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600"
        >
          <MaterialIcons name="open-in-new" size={11} color="#fff" />
          <Text className="text-[10.5px] font-bold text-white">View</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
          className={`flex-row items-center gap-1 px-2.5 py-1.5 rounded-lg ${saving ? "bg-gray-400" : "bg-emerald-600"}`}
        >
          {saving ? (
            <ActivityIndicator size={10} color="#fff" />
          ) : (
            <MaterialIcons name="download" size={11} color="#fff" />
          )}
          <Text className="text-[10.5px] font-bold text-white">
            {saving ? "…" : "Save"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ─── RemarkTimelineItem ───────────────────────────────────────────────────────

const RemarkTimelineItem: React.FC<{
  entry: UnifiedRemark;
  isLast: boolean;
}> = ({ entry, isLast }) => {
  const { phase, cleanRemark } = phaseFromRemark(entry);
  const p = phaseBadge(phase);
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
  const { text, attachments } = parseAttachments(cleanRemark);

  return (
    <View className="flex-row gap-3">
      {/* Timeline spine */}
      <View className="items-center" style={{ width: 28 }}>
        <View
          className="w-7 h-7 rounded-full items-center justify-center border-2 border-white"
          style={{
            backgroundColor: flag
              ? flag.dot + "22"
              : p.bg,
            borderColor: flag ? flag.dot + "55" : p.dot + "55",
          }}
        >
          {flag ? (
            <MaterialIcons name={flag.icon} size={13} color={flag.dot} />
          ) : (
            <MaterialIcons
              name={phase === "pr" ? "receipt-long" : "chat-bubble-outline"}
              size={12}
              color={p.dot}
            />
          )}
        </View>
        {!isLast && (
          <View
            className="flex-1 w-px bg-gray-200 mt-1"
            style={{ minHeight: 16 }}
          />
        )}
      </View>

      {/* Content bubble */}
      <View className="flex-1 pb-4">
        <View className="flex-row items-center gap-2 mb-1 flex-wrap">
          <View
            className="flex-row items-center gap-1 px-2 py-0.5 rounded-full"
            style={{ backgroundColor: p.bg }}
          >
            <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.dot }} />
            <Text className="text-[10px] font-bold" style={{ color: p.text }}>
              {p.label}
            </Text>
          </View>
          {/* Flag badge */}
          {flag && (
            <View
              className="flex-row items-center gap-1 px-2 py-0.5 rounded-full border"
              style={{ backgroundColor: flag.bg, borderColor: flag.dot + "40" }}
            >
              <View
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: flag.dot }}
              />
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
        <View
          className="bg-white rounded-xl px-3 py-2.5 border border-gray-100"
          style={{
            shadowColor: "#000",
            shadowOpacity: 0.04,
            shadowRadius: 4,
            elevation: 1,
          }}
        >
          {text.length > 0 && (
            <Text className="text-[13px] text-gray-700 leading-[19px]">
              {text}
            </Text>
          )}
          {attachments.map((att, i) => (
            <AttachmentChip key={att.url + i} attachment={att} />
          ))}
        </View>
      </View>
    </View>
  );
};

// ─── PORemarkSheet ────────────────────────────────────────────────────────────

interface PORemarkSheetProps {
  visible: boolean;
  record: PORemarkSheetRecord | null;
  currentUser: any;
  onClose: () => void;
}

const PORemarkSheet: React.FC<PORemarkSheetProps> = ({
  visible,
  record,
  currentUser,
  onClose,
}) => {
  const [remarksText, setRemarksText] = useState("");
  const [statusFlag, setStatusFlag] = useState<StatusFlag | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [history, setHistory] = useState<UnifiedRemark[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string>("application/octet-stream");

  // ── Load unified history ───────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    if (!record) return;
    setLoadingHist(true);
    try {
      // Fetch unified remarks from the remarks table
      const query = supabase
        .from("remarks")
        .select(
          "id, remark, status_flag_id, created_at, user_id, po_id, pr_id, users(fullname)",
        )
        .order("created_at", { ascending: false });

      if (record.linkedPrId) {
        // If linked to a PR, show both PR-level and PO-level remarks
        query.or(`po_id.eq.${record.id},pr_id.eq.${record.linkedPrId}`);
      } else {
        // Otherwise only PO-level remarks
        query.eq("po_id", record.id);
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
        // If it has a po_id, we treat it as a PO remark for UI purposes
        source: r.po_id ? ("po" as const) : ("pr" as const),
      }));

      setHistory(unified);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not load remarks.");
      setHistory([]);
    } finally {
      setLoadingHist(false);
    }
  }, [record]);

  useEffect(() => {
    if (visible && record) {
      loadHistory();
    } else {
      setHistory([]);
    }
  }, [visible, record, loadHistory]);

  // Reset form on close
  useEffect(() => {
    if (!visible) {
      setRemarksText("");
      setStatusFlag(null);
      setFileName(null);
      setFileUri(null);
      setFileType("application/octet-stream");
    }
  }, [visible]);

  const clearFile = useCallback(() => {
    setFileName(null);
    setFileUri(null);
    setFileType("application/octet-stream");
  }, []);

  // ── File picker ────────────────────────────────────────────────────────────

  const handlePickFile = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const f = res.assets[0];
      setFileName(f.name ?? "attachment");
      setFileUri(f.uri);
      setFileType(f.mimeType ?? "application/octet-stream");
    } catch (e: any) {
      Alert.alert("File error", e?.message ?? "Could not pick file.");
    }
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!record || !remarksText.trim()) return;
    setSaving(true);
    try {
      let finalRemark = remarksText.trim();

      // Upload attachment if provided
      if (fileUri && fileName) {
        const remote = buildRemotePath(record.poNo ?? "PO", fileName);
        const ct = fileType ?? guessContentType(fileName);
        const uploaded = await uploadPRFile(fileUri, remote, ct);
        finalRemark += `\n${encodeAttachment(fileName, uploaded.publicUrl)}`;
      }

      // Insert into remarks table — always links to po_id, also stores pr_id for cross-reference
      const { error: insertErr } = await supabase.from("remarks").insert({
        po_id: record.id,
        pr_id: record.linkedPrId ?? null,
        user_id: currentUser?.id ?? null,
        remark: finalRemark,
        status_flag_id: getStatusFlagId(statusFlag),
        created_at: new Date().toISOString(),
      });
      if (insertErr) throw insertErr;

      // Optimistically prepend to history
      const newEntry: UnifiedRemark = {
        id: Date.now(),
        remark: finalRemark,
        status_flag_id: getStatusFlagId(statusFlag),
        created_at: new Date().toISOString(),
        user_id: currentUser?.id ?? null,
        username: currentUser?.fullname ?? "You",
        source: "po",
      };
      setHistory((prev) => [newEntry, ...prev]);
      setRemarksText("");
      setStatusFlag(null);
      clearFile();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not save remark.");
    } finally {
      setSaving(false);
    }
  }, [
    record,
    remarksText,
    fileUri,
    fileName,
    fileType,
    statusFlag,
    currentUser,
    clearFile,
  ]);

  if (!record) return null;
  const canSubmit = remarksText.trim().length > 0 && !saving;
  const hasLinkedPr = !!record.linkedPrId;

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }}
          onPress={onClose}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View
            className="bg-gray-50 rounded-t-3xl overflow-hidden"
            style={{
              flex: 1,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -4 },
              shadowOpacity: 0.12,
              shadowRadius: 16,
              elevation: 16,
            }}
          >
            {/* ── Header ── */}
            <View className="bg-[#064E3B] px-5 pt-4 pb-4">
              <View className="w-10 h-1 rounded-full bg-white/20 self-center mb-3" />
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-0.5">
                    PO Remarks & Flags
                  </Text>
                  <Text
                    className="text-[15px] font-extrabold text-white"
                    style={{ fontFamily: MONO }}
                  >
                    {record.poNo}
                  </Text>
                  <Text
                    className="text-[11px] text-white/50 mt-0.5"
                    numberOfLines={1}
                  >
                    {record.supplier}
                  </Text>
                  {/* PR link badge */}
                  {hasLinkedPr ? (
                    <View className="flex-row items-center gap-1.5 mt-1.5 bg-blue-500/20 self-start rounded-full px-2.5 py-0.5">
                      <MaterialIcons
                        name="link"
                        size={10}
                        color="rgba(147,197,253,1)"
                      />
                      <Text className="text-[10px] font-bold text-blue-200">
                        PR {record.prNo} remarks included
                      </Text>
                    </View>
                  ) : (
                    <View className="flex-row items-center gap-1.5 mt-1.5 bg-white/10 self-start rounded-full px-2.5 py-0.5">
                      <MaterialIcons
                        name="link-off"
                        size={10}
                        color="rgba(255,255,255,0.4)"
                      />
                      <Text className="text-[10px] text-white/40">
                        No linked PR — PO remarks only
                      </Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  hitSlop={10}
                  className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center mt-0.5"
                >
                  <Text className="text-white text-[20px] leading-none font-light">
                    ×
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <FlatList
              data={history}
              keyExtractor={(item) => `${item.source}-${item.id}`}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 32 }}
              ListHeaderComponent={
                <>
                  {/* ── Add Remark form ── */}
                  <View
                    className="bg-white mx-4 mt-4 rounded-2xl border border-gray-200 overflow-hidden"
                    style={{
                      shadowColor: "#000",
                      shadowOpacity: 0.05,
                      shadowRadius: 6,
                      elevation: 2,
                    }}
                  >
                    <View className="px-4 pt-3.5 pb-1 border-b border-gray-100">
                      <Text className="text-[10.5px] font-bold uppercase tracking-widest text-gray-400">
                        Add PO Remark
                      </Text>
                    </View>
                    <View className="px-4 pt-3 pb-4 gap-3">
                      <View>
                        <Text className="text-[11.5px] font-semibold text-gray-600 mb-1.5">
                          Status Flag
                        </Text>
                        <FlagButton
                          selected={statusFlag}
                          onPress={() => setFlagOpen(true)}
                        />
                      </View>
                      <View>
                        <Text className="text-[11.5px] font-semibold text-gray-600 mb-1.5">
                          Remark <Text className="text-red-400">*</Text>
                        </Text>
                        <TextInput
                          value={remarksText}
                          onChangeText={setRemarksText}
                          placeholder="Add a note about this PO…"
                          placeholderTextColor="#9ca3af"
                          multiline
                          className="bg-gray-50 rounded-xl px-3.5 py-2.5 text-[13.5px] text-gray-800 border border-gray-200"
                          style={{ minHeight: 72, textAlignVertical: "top" }}
                        />
                      </View>
                      <TouchableOpacity
                        onPress={handlePickFile}
                        activeOpacity={0.8}
                        className={`flex-row items-center gap-2.5 rounded-xl border px-3.5 py-3 ${fileName ? "border-emerald-400 bg-emerald-50" : "border-gray-200 bg-white"}`}
                      >
                        <MaterialIcons
                          name={fileName ? "attach-file" : "upload-file"}
                          size={15}
                          color={fileName ? "#10b981" : "#9ca3af"}
                        />
                        <Text
                          className={`flex-1 text-[13px] font-semibold ${fileName ? "text-emerald-700" : "text-gray-400"}`}
                          numberOfLines={1}
                          ellipsizeMode="middle"
                        >
                          {fileName ?? "Attach a file (optional)"}
                        </Text>
                        {fileName && (
                          <TouchableOpacity onPress={clearFile} hitSlop={8}>
                            <Text className="text-[11px] text-red-500 font-semibold">
                              Remove
                            </Text>
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleSubmit}
                        disabled={!canSubmit}
                        activeOpacity={0.8}
                        className={`flex-row items-center justify-center gap-2 py-2.5 rounded-xl ${canSubmit ? "bg-[#064E3B]" : "bg-gray-200"}`}
                      >
                        {saving ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <MaterialIcons
                            name="send"
                            size={14}
                            color={canSubmit ? "#fff" : "#9ca3af"}
                          />
                        )}
                        <Text
                          className={`text-[13px] font-bold ${canSubmit ? "text-white" : "text-gray-400"}`}
                        >
                          {saving ? "Saving…" : "Save Remark"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* ── History header ── */}
                  <View className="mx-4 mt-5 mb-3 flex-row items-center justify-between">
                    <Text className="text-[10.5px] font-bold uppercase tracking-widest text-gray-400">
                      History
                    </Text>
                    <View className="flex-row items-center gap-2">
                      {hasLinkedPr && (
                        <View className="flex-row items-center gap-1 bg-blue-50 px-2 py-0.5 rounded-full">
                          <View className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                          <Text className="text-[9.5px] font-bold text-blue-500">
                            PR
                          </Text>
                        </View>
                      )}
                      <View className="flex-row items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full">
                        <View className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <Text className="text-[9.5px] font-bold text-emerald-600">
                          PO
                        </Text>
                      </View>
                      {history.length > 0 && (
                        <View className="bg-gray-100 px-2 py-0.5 rounded-full">
                          <Text className="text-[10px] font-bold text-gray-500">
                            {history.length}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </>
              }
              renderItem={({ item, index }) => (
                <View className="mx-4">
                  <RemarkTimelineItem
                    entry={item}
                    isLast={index === history.length - 1}
                  />
                </View>
              )}
              ListEmptyComponent={
                loadingHist ? (
                  <View className="items-center py-8">
                    <ActivityIndicator size="small" color="#064E3B" />
                    <Text className="text-[12px] text-gray-400 mt-2">
                      Loading history…
                    </Text>
                  </View>
                ) : (
                  <View className="items-center py-8 bg-white mx-4 rounded-2xl border border-gray-100">
                    <Text className="text-2xl mb-2">💬</Text>
                    <Text className="text-[13px] font-semibold text-gray-500">
                      No remarks yet
                    </Text>
                    <Text className="text-[11px] text-gray-400 mt-0.5">
                      Be the first to add a note.
                    </Text>
                  </View>
                )
              }
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <StatusFlagPicker
        visible={flagOpen}
        selected={statusFlag}
        onSelect={setStatusFlag}
        onClose={() => setFlagOpen(false)}
      />
    </>
  );
};

export default PORemarkSheet;
