/**
 * RemarkSheet.tsx
 *
 * Bottom-sheet for viewing and adding PR remarks with attachments.
 * The sheet uses a full-height modal layout:
 *   • Fixed header (PR info + close)
 *   • Fixed "Add Remark" card
 *   • Flex-1 FlatList so the history section grows to fill all remaining space
 *     regardless of how many remarks exist.
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
  insertRemark,
  supabase,
  uploadPRFile,
} from "../../lib/supabase";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface RemarkSheetRecord {
  id: string;
  prNo: string;
  officeSection: string;
  itemDescription: string;
}

export interface RemarkEntry {
  id: number;
  remark: string | null;
  status_flag_id: number | null;
  created_at: string;
  user_id: number | null;
  username?: string;
  po_id?: string | null;
}

// ─── Flag ID helpers ──────────────────────────────────────────────────────────

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

type RemarkPhase = "pr" | "po" | "delivery" | "payment";

function phaseFromRemark(entry: RemarkEntry): { phase: RemarkPhase; cleanRemark: string } {
  const raw = entry.remark ?? "";
  if (!entry.po_id) return { phase: "pr", cleanRemark: raw };
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

// ─── Attachment encoding / decoding ──────────────────────────────────────────

export function encodeAttachment(filename: string, url: string): string {
  return `[${filename}](${url})`;
}

interface ParsedAttachment {
  filename: string;
  url: string;
}

export function parseAttachments(remark: string | null | undefined): {
  text: string;
  attachments: ParsedAttachment[];
} {
  if (!remark) return { text: "", attachments: [] };
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

// ─── MIME / UTI helpers ───────────────────────────────────────────────────────

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

const AttachmentChip: React.FC<{ attachment: ParsedAttachment }> = ({
  attachment,
}) => {
  const { filename, url } = attachment;
  const [saving, setSaving] = useState(false);

  const handleView = useCallback(async () => {
    // Avoid Linking.canOpenURL — deprecated/unreliable on Android 11+ without
    // manifest <queries> declarations. Just attempt openURL and catch.
    try {
      await Linking.openURL(url);
    } catch (e: any) {
      Alert.alert(
        "Open failed",
        e?.message ?? "No app available to open this file.",
      );
    }
  }, [url]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!baseDir) {
        Alert.alert(
          "Save failed",
          "No writable directory available on this device.",
        );
        return;
      }

      // Sanitize filename: replace spaces and URI-unsafe characters so the
      // local path is a valid file:// URI. Preserve the extension intact.
      const safeFilename = filename.trim().replace(/[^a-zA-Z0-9._\-]/g, "_");
      const destUri = baseDir + safeFilename;

      const { uri } = await FileSystem.downloadAsync(url, destUri);

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(
          "Sharing unavailable",
          "File saved to cache but sharing is not supported on this device.",
        );
        return;
      }

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
            <ActivityIndicator size="small" color="#fff" />
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

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

const RemarkTimelineItem: React.FC<{ entry: RemarkEntry; isLast: boolean }> = ({
  entry,
  isLast,
}) => {
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
            backgroundColor: flag ? flag.dot + "22" : "#f3f4f6",
            borderColor: flag ? flag.dot + "55" : "#e5e7eb",
          }}
        >
          {flag ? (
            <MaterialIcons name={flag.icon} size={13} color={flag.dot} />
          ) : (
            <MaterialIcons
              name="chat-bubble-outline"
              size={12}
              color="#9ca3af"
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
          {flag && (
            <View
              className={`flex-row items-center gap-1 px-2 py-0.5 rounded-full border ${flag.bg} ${flag.border}`}
            >
              <View
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: flag.dot }}
              />
              <Text className={`text-[10px] font-bold ${flag.text}`}>
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

// ─── RemarkSheet ──────────────────────────────────────────────────────────────

interface RemarkSheetProps {
  visible: boolean;
  record: RemarkSheetRecord | null;
  currentUser: any;
  onClose: () => void;
}

const RemarkSheet: React.FC<RemarkSheetProps> = ({
  visible,
  record,
  currentUser,
  onClose,
}) => {
  const [remarksText, setRemarksText] = useState("");
  const [statusFlag, setStatusFlag] = useState<StatusFlag | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [history, setHistory] = useState<RemarkEntry[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string>("application/octet-stream");

  // ── Load history when sheet opens ────────────────────────────────────────
  useEffect(() => {
    if (!visible || !record) {
      setHistory([]);
      return;
    }
    setLoadingHist(true);
    supabase
      .from("remarks")
      .select(
        "id, remark, status_flag_id, created_at, user_id, po_id, users(fullname)",
      )
      .eq("pr_id", record.id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error || !data) {
          setHistory([]);
          setLoadingHist(false);
          return;
        }
        setHistory(
          data.map((r: any) => ({
            id: r.id,
            remark: r.remark,
            status_flag_id: r.status_flag_id as number | null,
            created_at: r.created_at,
            user_id: r.user_id,
            po_id: r.po_id != null ? String(r.po_id) : null,
            username: r.users?.fullname ?? undefined,
          })),
        );
        setLoadingHist(false);
      });
  }, [visible, record]);

  // ── Reset form on close ───────────────────────────────────────────────────
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

  // ── File picker ───────────────────────────────────────────────────────────
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

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!record || !remarksText.trim()) return;
    setSaving(true);
    try {
      let finalRemark = remarksText.trim();
      if (fileUri && fileName) {
        const remote = buildRemotePath(record.prNo ?? "PR", fileName);
        const ct = fileType ?? guessContentType(fileName);
        const uploaded = await uploadPRFile(fileUri, remote, ct);
        finalRemark += `\n${encodeAttachment(fileName, uploaded.publicUrl)}`;
      }
      await insertRemark(
        record.id,
        currentUser?.id,
        finalRemark,
        getStatusFlagId(statusFlag),
      );
      const newEntry: RemarkEntry = {
        id: Date.now(),
        remark: finalRemark,
        status_flag_id: getStatusFlagId(statusFlag),
        created_at: new Date().toISOString(),
        user_id: currentUser?.id ?? null,
        username: currentUser?.fullname ?? "You",
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

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        {/* Scrim — tapping it closes the sheet */}
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }}
          onPress={onClose}
        />

        {/*
          The sheet sits in a KeyboardAvoidingView that fills the remaining space
          after the scrim. Using flex:1 here instead of maxHeight lets the history
          list grow freely to fill the screen while still being pushed up by the
          keyboard.
        */}
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
            {/* ── Header ─────────────────────────────────────────────────── */}
            <View className="bg-[#064E3B] px-5 pt-4 pb-4">
              <View className="w-10 h-1 rounded-full bg-white/20 self-center mb-3" />
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-0.5">
                    PR Remarks & Flags
                  </Text>
                  <Text
                    className="text-[15px] font-extrabold text-white"
                    style={{ fontFamily: MONO }}
                  >
                    {record.prNo}
                  </Text>
                  <Text
                    className="text-[11px] text-white/50 mt-0.5"
                    numberOfLines={1}
                  >
                    {record.officeSection} · {record.itemDescription}
                  </Text>
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

            {/*
              FlatList takes flex:1, filling all remaining height.
              The "Add Remark" form lives in ListHeaderComponent so it scrolls
              with the list and stays logically above the history entries.
            */}
            <FlatList
              data={history}
              keyExtractor={(item) => String(item.id)}
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
                        Add Remark
                      </Text>
                    </View>
                    <View className="px-4 pt-3 pb-4 gap-3">
                      {/* Status flag */}
                      <View>
                        <Text className="text-[11.5px] font-semibold text-gray-600 mb-1.5">
                          Status Flag
                        </Text>
                        <FlagButton
                          selected={statusFlag}
                          onPress={() => setFlagOpen(true)}
                        />
                      </View>

                      {/* Remark text */}
                      <View>
                        <Text className="text-[11.5px] font-semibold text-gray-600 mb-1.5">
                          Remark <Text className="text-red-400">*</Text>
                        </Text>
                        <TextInput
                          value={remarksText}
                          onChangeText={setRemarksText}
                          placeholder="Add a note about this PR…"
                          placeholderTextColor="#9ca3af"
                          multiline
                          className="bg-gray-50 rounded-xl px-3.5 py-2.5 text-[13.5px] text-gray-800 border border-gray-200"
                          style={{ minHeight: 72, textAlignVertical: "top" }}
                        />
                      </View>

                      {/* Attachment */}
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

                      {/* Submit */}
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
                    {history.length > 0 && (
                      <View className="bg-emerald-100 px-2 py-0.5 rounded-full">
                        <Text className="text-[10px] font-bold text-emerald-700">
                          {history.length}
                        </Text>
                      </View>
                    )}
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

      {/* StatusFlagPicker as Modal sibling to avoid Android nested-Modal bug */}
      <StatusFlagPicker
        visible={flagOpen}
        selected={statusFlag}
        onSelect={setStatusFlag}
        onClose={() => setFlagOpen(false)}
      />
    </>
  );
};

export default RemarkSheet;
