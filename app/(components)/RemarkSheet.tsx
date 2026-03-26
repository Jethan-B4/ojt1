/**
 * RemarkSheet.tsx
 *
 * Self-contained bottom-sheet for viewing and adding PR remarks with attachments.
 *
 * Attachment encoding
 * ───────────────────
 * Attachments are stored inside the remark text as a markdown-style token:
 *
 *   [filename.pdf](https://…/storage/…/filename.pdf)
 *
 * This keeps the URL out of plain sight — only the filename is displayed —
 * while preserving the URL for View / Save actions. The helper `parseAttachments`
 * extracts all such tokens so the render layer never has to touch raw URLs.
 *
 * Usage
 * ─────
 *   import RemarkSheet from "@/components/RemarkSheet";
 *
 *   <RemarkSheet
 *     visible={moreVisible}
 *     record={moreRecord}          // { id, prNo, officeSection, itemDescription }
 *     currentUser={currentUser}
 *     onClose={() => setMoreVisible(false)}
 *   />
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
  View
} from "react-native";
import {
  FlagButton,
  STATUS_FLAGS,
  StatusFlagPicker,
  type StatusFlag,
} from "../(modals)/ProcessPRModal";
import { insertRemark, supabase, uploadPRFile } from "../../lib/supabase";

// ─── Public types ─────────────────────────────────────────────────────────────

/** Minimal PR shape that RemarkSheet needs — no full PRRecord dependency. */
export interface RemarkSheetRecord {
  id: string;
  prNo: string;
  officeSection: string;
  itemDescription: string;
}

export interface RemarkEntry {
  id: number;
  remark: string;
  status_flag_id: number | null;
  created_at: string;
  user_id: number | null;
  username?: string;
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

// ─── Attachment encoding / decoding ──────────────────────────────────────────

/**
 * Encode an uploaded file as a markdown link token appended to the remark.
 * The URL is stored but hidden from display.
 *
 *   encodeAttachment("proposal.pdf", "https://…/proposal.pdf")
 *   → "[proposal.pdf](https://…/proposal.pdf)"
 */
export function encodeAttachment(filename: string, url: string): string {
  return `[${filename}](${url})`;
}

interface ParsedAttachment {
  filename: string;
  url: string;
}

/**
 * Extract attachments from a remark string.
 *
 * Handles two formats for backwards compatibility:
 *
 *   New (token):  [filename.pdf](https://…)
 *   Old (legacy): Attachment: https://…/filename.pdf
 *
 * Returns the cleaned display text (all attachment tokens/lines removed)
 * alongside a list of parsed { filename, url } pairs.
 */
export function parseAttachments(remark: string): {
  text: string;
  attachments: ParsedAttachment[];
} {
  const attachments: ParsedAttachment[] = [];

  // ── Pass 1: new token format  [filename](url) ──────────────────────────────
  const TOKEN_RE = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let text = remark.replace(TOKEN_RE, (_, filename, url) => {
    attachments.push({ filename: filename.trim(), url: url.trim() });
    return "";
  });

  // ── Pass 2: legacy format  Attachment: https://… ──────────────────────────
  // Matches lines like "Attachment: https://…" (case-insensitive prefix)
  const LEGACY_RE = /^Attachment:\s*(https?:\/\/\S+)/gim;
  text = text.replace(LEGACY_RE, (_, url: string) => {
    const cleanUrl = url.trim();
    // Derive a display filename from the URL path segment after the last "/"
    // e.g. "2024-PR-0001/1700000000-proposal_draft.pdf" → "proposal_draft.pdf"
    const rawSegment = decodeURIComponent(cleanUrl.split("/").pop() ?? "");
    // Strip the leading timestamp prefix if present: "1700000000-filename" → "filename"
    const filename =
      rawSegment.replace(/^\d+-/, "") || rawSegment || "attachment";
    attachments.push({ filename, url: cleanUrl });
    return "";
  });

  // Collapse runs of blank lines left by removed tokens/lines
  text = text.replace(/\n{2,}/g, "\n").trim();

  return { text, attachments };
}

// ─── MIME / UTI helpers for Sharing.shareAsync ───────────────────────────────

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

/** iOS UTI hint for Sharing.shareAsync — ignored on Android */
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

// ─── AttachmentChip — renders one file as a tappable filename chip ────────────

const AttachmentChip: React.FC<{ attachment: ParsedAttachment }> = ({
  attachment,
}) => {
  const { filename, url } = attachment;
  const [saving, setSaving] = useState(false);

  // ── View: open in system browser / viewer ───────────────────────────────────
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

  // ── Save: download to device cache then share / save via OS sheet ───────────
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
      // Use the display filename for the local file so the share sheet shows it clearly
      const dest = baseDir + filename;
      const { uri } = await FileSystem.downloadAsync(url, dest);
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

  // ── Icon by extension ────────────────────────────────────────────────────────
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
      {/* Icon + filename (tapping also opens the file) */}
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

      {/* View + Save action buttons */}
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

// ─── RemarkTimelineItem — one history entry ───────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

const RemarkTimelineItem: React.FC<{
  entry: RemarkEntry;
  isLast: boolean;
}> = ({ entry, isLast }) => {
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

  const { text, attachments } = parseAttachments(entry.remark);

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
        {/* Meta row — flag badge, timestamp, author */}
        <View className="flex-row items-center gap-2 mb-1 flex-wrap">
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
          {/* Remark text — URLs stripped, only clean prose shown */}
          {text.length > 0 && (
            <Text className="text-[13px] text-gray-700 leading-[19px]">
              {text}
            </Text>
          )}

          {/* Attachment chips — filename only, URL hidden */}
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

  // ── Load history whenever the sheet opens for a PR ────────────────────────
  useEffect(() => {
    if (!visible || !record) {
      setHistory([]);
      return;
    }
    setLoadingHist(true);
    supabase
      .from("remarks")
      .select(
        "id, remark, status_flag_id, created_at, user_id, users(fullname)",
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
            username: r.users?.fullname ?? undefined,
          })),
        );
        setLoadingHist(false);
      });
  }, [visible, record]);

  // ── Reset form fields when sheet closes ───────────────────────────────────
  useEffect(() => {
    if (!visible) {
      setRemarksText("");
      setStatusFlag(null);
      clearFile();
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

  // ── Submit remark (+ optional attachment) ─────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!record || !remarksText.trim()) return;
    setSaving(true);
    try {
      let finalRemark = remarksText.trim();

      if (fileUri && fileName) {
        // Build a sanitized, unique storage path
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const prNoSafe = (record.prNo ?? "PR").replace(/[^a-zA-Z0-9._-]/g, "_");
        const remote = `${prNoSafe}/${Date.now()}-${safeName}`;

        const uploaded = await uploadPRFile(fileUri, remote, fileType);

        // Encode as [filename](url) — URL is stored but never shown raw
        finalRemark += `\n${encodeAttachment(fileName, uploaded.publicUrl)}`;
      }

      await insertRemark(
        record.id,
        currentUser?.id,
        finalRemark,
        getStatusFlagId(statusFlag),
      );

      // Optimistically prepend to local history
      const newEntry: RemarkEntry = {
        id: Date.now(),
        remark: finalRemark,
        status_flag_id: getStatusFlagId(statusFlag),
        created_at: new Date().toISOString(),
        user_id: currentUser?.id ?? null,
        username: currentUser?.fullname ?? "You",
      };
      setHistory((prev) => [newEntry, ...prev]);

      // Reset form
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
        <Pressable className="flex-1 bg-black/40" onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ maxHeight: "85%" }}
        >
          <View
            className="bg-gray-50 rounded-t-3xl overflow-hidden"
            style={{
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

            <FlatList
              data={history}
              keyExtractor={(item) => String(item.id)}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 24 }}
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
                      {/* Status flag picker */}
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
                          style={{ minHeight: 80, textAlignVertical: "top" }}
                        />
                      </View>

                      {/* Attachment picker */}
                      <View>
                        <Text className="text-[11.5px] font-semibold text-gray-600 mb-1.5">
                          Attachment{" "}
                          <Text className="text-gray-400 font-normal">
                            (optional)
                          </Text>
                        </Text>
                        <TouchableOpacity
                          onPress={handlePickFile}
                          activeOpacity={0.8}
                          className={`rounded-xl border-2 border-dashed px-4 py-3 items-center ${
                            fileName
                              ? "border-emerald-400 bg-emerald-50"
                              : "border-gray-300 bg-gray-50"
                          }`}
                        >
                          {fileName ? (
                            <View className="flex-row items-center gap-2">
                              <MaterialIcons
                                name="attach-file"
                                size={14}
                                color="#10b981"
                              />
                              <Text
                                className="text-[12.5px] font-semibold text-emerald-700 flex-1"
                                numberOfLines={1}
                                ellipsizeMode="middle"
                              >
                                {fileName}
                              </Text>
                            </View>
                          ) : (
                            <View className="flex-row items-center gap-2">
                              <MaterialIcons
                                name="upload-file"
                                size={14}
                                color="#9ca3af"
                              />
                              <Text className="text-[12.5px] font-semibold text-gray-400">
                                Tap to attach a file
                              </Text>
                            </View>
                          )}
                          {fileName && (
                            <TouchableOpacity
                              onPress={clearFile}
                              hitSlop={8}
                              className="mt-1.5"
                            >
                              <Text className="text-[10.5px] text-red-500 font-semibold">
                                Remove
                              </Text>
                            </TouchableOpacity>
                          )}
                        </TouchableOpacity>
                      </View>

                      {/* Submit button */}
                      <TouchableOpacity
                        onPress={handleSubmit}
                        disabled={!canSubmit}
                        activeOpacity={0.8}
                        className={`flex-row items-center justify-center gap-2 py-2.5 rounded-xl ${
                          canSubmit ? "bg-[#064E3B]" : "bg-gray-200"
                        }`}
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
                          className={`text-[13px] font-bold ${
                            canSubmit ? "text-white" : "text-gray-400"
                          }`}
                        >
                          {saving ? "Saving…" : "Save Remark"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* ── History header ── */}
                  <View className="mx-4 mt-4 flex-row items-center justify-between mb-3">
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

      {/* StatusFlagPicker rendered as a sibling to avoid Android nested-Modal bug */}
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
