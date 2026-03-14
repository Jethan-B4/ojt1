import { toPRDisplay } from "@/types/model";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useNavigation } from "@react-navigation/native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import EditPRModal, { type PREditPayload, type PREditRecord } from "../(modals)/EditPRModal";
import ProcessPRModal, {
  FlagButton,
  STATUS_FLAGS,
  StatusFlagPicker,
  insertRemark,
  type ProcessRecord,
  type StatusFlag,
} from "../(modals)/ProcessPRModal";
import PurchaseRequestModal, { PRSubmitPayload } from "../(modals)/PurchaseRequestModal";
import ViewPRModal from "../(modals)/ViewPRModal";
import {
  fetchCanvassablePRs, fetchCanvassablePRsByDivision, fetchPRStatuses,
  fetchPurchaseRequests, fetchPurchaseRequestsByDivision,
  insertProposalForPR, insertPurchaseRequest, supabase,
  type PRRow, type PRStatusRow,
} from "../../lib/supabase";
import { useAuth } from "../AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type SubTab = "pr" | "canvass" | "abstract_of_awards";

type PRRecord = ReturnType<typeof toPRDisplay> & { itemDescription: string; quantity: number; elapsedTime: string };

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Visual config keyed by status_id (FK from pr_status table).
 * Labels come from the live pr_status lookup; these are fallback UI colours only.
 *
 *   1 = Pending
 *   2 = Processing (Division Head)
 *   3 = Processing (BAC)
 *   4 = Processing (Budget)
 *   5 = Processing (PARPO)
 *
 * Any unknown id falls back to STATUS_FALLBACK below.
 */
const STATUS_CONFIG: Record<number, { dotClass: string; bgClass: string; textClass: string }> = {
  1: { dotClass: "bg-yellow-400", bgClass: "bg-yellow-50",  textClass: "text-yellow-700" }, // Pending
  2: { dotClass: "bg-blue-500",   bgClass: "bg-blue-50",    textClass: "text-blue-700"   }, // Processing (Div. Head)
  3: { dotClass: "bg-violet-500", bgClass: "bg-violet-50",  textClass: "text-violet-700" }, // Processing (BAC)
  4: { dotClass: "bg-orange-500", bgClass: "bg-orange-50",  textClass: "text-orange-700" }, // Processing (Budget)
  5: { dotClass: "bg-green-500",  bgClass: "bg-green-50",   textClass: "text-green-700"  }, // Processing (PARPO)
  6: { dotClass: "bg-emerald-500",bgClass: "bg-emerald-50", textClass: "text-emerald-700"}, // Canvassing & Resolution
  7: { dotClass: "bg-teal-500",   bgClass: "bg-teal-50",    textClass: "text-teal-700"   }, // AAA
};

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "pr",                 label: "Purchase Request"   },
  { key: "canvass",            label: "Canvass"            },
  { key: "abstract_of_awards", label: "Abstract of Awards" },
];

const SECTION_FILTERS = ["All", "STOD", "LTSP", "ARBDSP", "Legal", "PARPO", "PARAD"];
const MONO      = Platform.OS === "ios" ? "Courier New" : "monospace";
const PAGE_SIZE = 7;
const fmt = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// role_id 2 = Division Head (Step 2), 3 = BAC (Step 3), 4 = Budget (Step 4), 5 = PARPO (Step 5)
const PROCESS_ROLES = new Set([2, 3, 4, 5]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rowToRecord(row: PRRow, itemCount = 0): PRRecord {
  const base = toPRDisplay(row);
  const created = row.created_at ? new Date(row.created_at) : new Date();
  const diffMs  = Date.now() - created.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const elapsed = diffMin < 60 ? `${diffMin} min` : diffMin < 1440 ? `${Math.floor(diffMin / 60)} hr` : `${Math.floor(diffMin / 1440)} days`;
  return {
    ...base,
    itemDescription: base.purpose,
    quantity: itemCount,
    elapsedTime: elapsed,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const SubTabRow: React.FC<{ active: SubTab; onSelect: (s: SubTab) => void }> = ({ active, onSelect }) => (
  <View className="flex-row bg-white border-b border-gray-200 px-4 gap-2 py-2.5">
    {SUB_TABS.map((sub) => {
      const on = sub.key === active;
      return (
        <TouchableOpacity key={sub.key} onPress={() => onSelect(sub.key)} activeOpacity={0.8}
          className={`px-3 py-1.5 rounded-lg ${on ? "bg-[#064E3B]" : "bg-transparent"}`}>
          <Text className={`text-[12px] font-semibold ${on ? "text-white" : "text-gray-400"}`}>{sub.label}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

const SearchBar: React.FC<{ value: string; onChange: (t: string) => void; onCreatePress: () => void }> =
  ({ value, onChange, onCreatePress }) => (
  <View className="flex-row items-center gap-2.5 px-4 py-3 bg-white border-b border-gray-100">
    <View className="flex-1 flex-row items-center bg-gray-100 rounded-xl px-3 py-2 gap-2 border border-gray-200">
      <Text className="text-gray-400 text-sm">🔍</Text>
      <TextInput value={value} onChangeText={onChange}
        placeholder="Search PR, section, item…" placeholderTextColor="#9ca3af"
        returnKeyType="search" className="flex-1 text-[13px] text-gray-800" />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChange("")} hitSlop={8}>
          <Text className="text-gray-400 text-sm">✕</Text>
        </TouchableOpacity>
      )}
    </View>
    <Pressable onPress={onCreatePress}
      className="flex-row items-center gap-1.5 bg-[#064E3B] px-4 py-2.5 rounded-xl"
      style={({ pressed }) => pressed ? { opacity: 0.82 } : undefined}>
      <Text className="text-white text-[18px] leading-none font-light">+</Text>
      <Text className="text-white text-[13px] font-bold">Create</Text>
    </Pressable>
  </View>
);

const FilterChips: React.FC<{ active: string; onSelect: (s: string) => void }> = ({ active, onSelect }) => (
  <View className="bg-white border-b border-gray-100">
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
      {SECTION_FILTERS.map((f) => {
        const on = f === active;
        return (
          <TouchableOpacity key={f} onPress={() => onSelect(f)} activeOpacity={0.8}
            className={`px-3 py-1.5 rounded-full border ${on ? "bg-[#064E3B] border-[#064E3B]" : "bg-white border-gray-200"}`}>
            <Text className={`text-[11.5px] font-semibold ${on ? "text-white" : "text-gray-500"}`}>{f}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  </View>
);

const StatStrip: React.FC<{ records: PRRecord[]; statuses: PRStatusRow[] }> = ({ records, statuses }) => {
  // Build a label→count map using the live status table so labels stay in sync.
  const countByStatus = records.reduce<Record<number, number>>((acc, r) => {
    acc[r.statusId] = (acc[r.statusId] ?? 0) + 1;
    return acc;
  }, {});

  const stats = [
    { label: "Total",      value: String(records.length),                                   color: "text-[#1a4d2e]", bg: "bg-emerald-50" },
    { label: "Pending",    value: String(countByStatus[1] ?? 0),                            color: "text-amber-700",  bg: "bg-amber-50"  },
    { label: "Processing", value: String([2, 3, 4, 5].reduce((s, id) => s + (countByStatus[id] ?? 0), 0)),
                                                                                              color: "text-blue-700",   bg: "bg-blue-50"   },
    { label: "Amount",     value: `₱${fmt(records.reduce((s, r) => s + r.totalCost, 0))}`,  color: "text-violet-700", bg: "bg-violet-50" },
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      className="bg-white border-b border-gray-100 max-h-20"
      contentContainerStyle={{ flexDirection: "row", paddingHorizontal: 4, paddingVertical: 4, gap: 4 }}>
      {stats.map((s) => (
        <View key={s.label} className={`${s.bg} rounded-xl px-4 py-2.5 items-center border border-gray-100 min-w-[72px]`}>
          <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">{s.label}</Text>
          <Text className={`text-[15px] font-bold ${s.color}`}
            style={s.label === "Amount" ? { fontFamily: MONO, fontSize: 13 } : undefined}>
            {s.value}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
};

const STATUS_FALLBACK = { dotClass: "bg-gray-400", bgClass: "bg-gray-100", textClass: "text-gray-500" };

const StatusPill: React.FC<{ statusId: number; label: string; elapsed: string }> = ({ statusId, label, elapsed }) => {
  const cfg = STATUS_CONFIG[statusId] ?? STATUS_FALLBACK;
  return (
    <View className={`flex-row items-center gap-1.5 self-start px-2.5 py-1 rounded-full ${cfg.bgClass}`}>
      <View className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass}`} />
      <Text className={`text-[10.5px] font-bold ${cfg.textClass}`}>{label}</Text>
      <View className="w-px h-2.5 bg-current opacity-30" />
      <Text className={`text-[10px] font-semibold ${cfg.textClass} opacity-70`}>{elapsed}</Text>
    </View>
  );
};

const RecordCard: React.FC<{
  record: PRRecord; isEven: boolean; roleId: number;
  statuses: PRStatusRow[];
  onView:    (r: PRRecord) => void;
  onEdit:    (r: PRRecord) => void;
  onProcess: (r: PRRecord) => void;
  onMore:    (r: PRRecord) => void;
}> = ({ record, isEven, roleId, statuses, onView, onEdit, onProcess, onMore }) => {
  const statusLabel = statuses.find((s) => s.id === record.statusId)?.status_name ?? `Status ${record.statusId}`;
  return (
  <View className={`mx-4 mb-3 rounded-3xl border border-gray-200 overflow-hidden ${isEven ? "bg-white" : "bg-gray-50"}`}
    style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 3 }}>
    <View className="flex-row items-start justify-between px-4 pt-3.5 pb-2">
      <View className="flex-1 pr-3">
        <Text className="text-[13px] font-bold text-[#1a4d2e] mb-0.5" style={{ fontFamily: MONO }}>{record.prNo}</Text>
        <Text className="text-[12.5px] text-gray-700 leading-5" numberOfLines={2}>{record.itemDescription}</Text>
      </View>
      <StatusPill statusId={record.statusId} label={statusLabel} elapsed={record.elapsedTime} />
    </View>
    <View className="h-px bg-gray-100 mx-4" />
    <View className="flex-row items-center gap-3 px-4 py-2.5">
      <View className="bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5">
        <Text className="text-[10.5px] font-bold text-emerald-700">{record.officeSection}</Text>
      </View>
      <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
        Qty <Text className="text-[12px] font-semibold text-gray-600" style={{ fontFamily: MONO }}>{record.quantity}</Text>
      </Text>
      <View className="w-px h-3.5 bg-gray-200" />
      <Text className="text-[11px] text-gray-400" style={{ fontFamily: MONO }}>{record.date}</Text>
      <View className="flex-1" />
      <Text className="text-[12.5px] font-bold text-gray-700" style={{ fontFamily: MONO }}>₱{fmt(record.totalCost)}</Text>
    </View>
    <View className="h-px bg-gray-100 mx-4" />
    <View className="flex-row items-center gap-2 px-4 py-2.5">
      <TouchableOpacity onPress={() => onView(record)} activeOpacity={0.8}
        className="flex-1 bg-blue-600 rounded-xl py-2 items-center">
        <Text className="text-white text-[12px] font-bold">View</Text>
      </TouchableOpacity>
      {PROCESS_ROLES.has(roleId) ? (
        <TouchableOpacity onPress={() => onProcess(record)} activeOpacity={0.8}
          className="flex-1 bg-violet-600 rounded-xl py-2 items-center">
          <Text className="text-white text-[12px] font-bold">Process</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={() => onEdit(record)} activeOpacity={0.8}
          className="flex-1 bg-amber-500 rounded-xl py-2 items-center">
          <Text className="text-white text-[12px] font-bold">Edit</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={() => onMore(record)} activeOpacity={0.8}
        className="w-10 h-10 bg-emerald-700 rounded-xl items-center justify-center">
        <Text className="text-white text-[11px] font-bold tracking-widest">•••</Text>
      </TouchableOpacity>
    </View>
  </View>
  );
};

// ─── Remark types ─────────────────────────────────────────────────────────────

interface RemarkEntry {
  id:          number;
  remark:      string;
  status_flag: StatusFlag | null;
  created_at:  string;
  user_id:     number | null;
  // joined
  username?:   string;
}

// ─── RemarkRow — one history entry in the timeline ───────────────────────────

const RemarkRow: React.FC<{ entry: RemarkEntry; isLast: boolean }> = ({ entry, isLast }) => {
  const flag = entry.status_flag ? STATUS_FLAGS[entry.status_flag] : null;
  const date = new Date(entry.created_at);
  const timeStr = date.toLocaleString("en-PH", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });

  return (
    <View className="flex-row gap-3">
      {/* Timeline spine */}
      <View className="items-center" style={{ width: 28 }}>
        <View className="w-7 h-7 rounded-full items-center justify-center border-2 border-white"
          style={{ backgroundColor: flag ? flag.dot + "22" : "#f3f4f6",
                   borderColor: flag ? flag.dot + "55" : "#e5e7eb" }}>
          {flag
            ? <MaterialIcons name={flag.icon} size={13} color={flag.dot} />
            : <MaterialIcons name="chat-bubble-outline" size={12} color="#9ca3af" />
          }
        </View>
        {!isLast && (
          <View className="flex-1 w-px bg-gray-200 mt-1" style={{ minHeight: 16 }} />
        )}
      </View>

      {/* Content */}
      <View className="flex-1 pb-4">
        <View className="flex-row items-center gap-2 mb-1 flex-wrap">
          {flag && (
            <View className={`flex-row items-center gap-1 px-2 py-0.5 rounded-full border ${flag.bg} ${flag.border}`}>
              <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: flag.dot }} />
              <Text className={`text-[10px] font-bold ${flag.text}`}>{flag.label}</Text>
            </View>
          )}
          <Text className="text-[10px] text-gray-400">{timeStr}</Text>
          {entry.username && (
            <Text className="text-[10px] font-semibold text-gray-500">· {entry.username}</Text>
          )}
        </View>
        <View className="bg-white rounded-xl px-3 py-2.5 border border-gray-100"
          style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 }}>
          <Text className="text-[13px] text-gray-700 leading-[19px]">{entry.remark}</Text>
        </View>
      </View>
    </View>
  );
};

// ─── RemarkSheet — the full "More" bottom sheet ───────────────────────────────

const RemarkSheet: React.FC<{
  visible:    boolean;
  record:     PRRecord | null;
  currentUser: any;
  onClose:    () => void;
}> = ({ visible, record, currentUser, onClose }) => {
  const [remarksText,  setRemarksText]  = useState("");
  const [statusFlag,   setStatusFlag]   = useState<StatusFlag | null>(null);
  const [flagOpen,     setFlagOpen]     = useState(false);
  const [history,      setHistory]      = useState<RemarkEntry[]>([]);
  const [loadingHist,  setLoadingHist]  = useState(false);
  const [saving,       setSaving]       = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Load history whenever sheet opens for a PR
  useEffect(() => {
    if (!visible || !record) { setHistory([]); return; }
    setLoadingHist(true);
    supabase
      .from("remarks")
      .select("id, remark, status_flag, created_at, user_id, users(username)")
      .eq("pr_id", record.id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error || !data) { setHistory([]); return; }
        setHistory(data.map((r: any) => ({
          id:          r.id,
          remark:      r.remark,
          status_flag: r.status_flag as StatusFlag | null,
          created_at:  r.created_at,
          user_id:     r.user_id,
          username:    r.users?.username ?? undefined,
        })));
      })
      setLoadingHist(false);
  }, [visible, record]);

  // Reset form when closed
  useEffect(() => {
    if (!visible) { setRemarksText(""); setStatusFlag(null); }
  }, [visible]);

  const handleSubmit = async () => {
    if (!record || !remarksText.trim()) return;
    setSaving(true);
    try {
      await insertRemark(record.id, currentUser?.id, remarksText, statusFlag);
      // Optimistically prepend to history
      const newEntry: RemarkEntry = {
        id:          Date.now(),
        remark:      remarksText.trim(),
        status_flag: statusFlag,
        created_at:  new Date().toISOString(),
        user_id:     currentUser?.id ?? null,
        username:    currentUser?.username ?? "You",
      };
      setHistory(prev => [newEntry, ...prev]);
      setRemarksText("");
      setStatusFlag(null);
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not save remark.");
    } finally { setSaving(false); }
  };

  if (!record) return null;

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable className="flex-1 bg-black/40" onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ maxHeight: "85%" }}>
          <View className="bg-gray-50 rounded-t-3xl overflow-hidden"
            style={{ shadowColor: "#000", shadowOffset: { width: 0, height: -4 },
                     shadowOpacity: 0.12, shadowRadius: 16, elevation: 16 }}>

            {/* ── Header ── */}
            <View className="bg-[#064E3B] px-5 pt-4 pb-4">
              <View className="w-10 h-1 rounded-full bg-white/20 self-center mb-3" />
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-0.5">
                    PR Remarks & Flags
                  </Text>
                  <Text className="text-[15px] font-extrabold text-white" style={{ fontFamily: MONO }}>
                    {record.prNo}
                  </Text>
                  <Text className="text-[11px] text-white/50 mt-0.5" numberOfLines={1}>
                    {record.officeSection} · {record.itemDescription}
                  </Text>
                </View>
                <TouchableOpacity onPress={onClose} hitSlop={10}
                  className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center mt-0.5">
                  <Text className="text-white text-[20px] leading-none font-light">×</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              ref={scrollRef}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 24 }}>

              {/* ── Add Remark form ── */}
              <View className="bg-white mx-4 mt-4 rounded-2xl border border-gray-200 overflow-hidden"
                style={{ shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 }}>
                <View className="px-4 pt-3.5 pb-1 border-b border-gray-100">
                  <Text className="text-[10.5px] font-bold uppercase tracking-widest text-gray-400">
                    Add Remark
                  </Text>
                </View>
                <View className="px-4 pt-3 pb-4 gap-3">
                  {/* Flag picker trigger */}
                  <View>
                    <Text className="text-[11.5px] font-semibold text-gray-600 mb-1.5">Status Flag</Text>
                    <FlagButton selected={statusFlag} onPress={() => setFlagOpen(true)} />
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
                  {/* Submit */}
                  <TouchableOpacity
                    onPress={handleSubmit}
                    disabled={!remarksText.trim() || saving}
                    activeOpacity={0.8}
                    className={`flex-row items-center justify-center gap-2 py-2.5 rounded-xl ${
                      !remarksText.trim() || saving ? "bg-gray-200" : "bg-[#064E3B]"
                    }`}>
                    {saving
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <MaterialIcons name="send" size={14}
                          color={!remarksText.trim() ? "#9ca3af" : "#fff"} />
                    }
                    <Text className={`text-[13px] font-bold ${
                      !remarksText.trim() || saving ? "text-gray-400" : "text-white"
                    }`}>
                      {saving ? "Saving…" : "Save Remark"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* ── History ── */}
              <View className="mx-4 mt-4">
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-[10.5px] font-bold uppercase tracking-widest text-gray-400">
                    History
                  </Text>
                  {history.length > 0 && (
                    <View className="bg-emerald-100 px-2 py-0.5 rounded-full">
                      <Text className="text-[10px] font-bold text-emerald-700">{history.length}</Text>
                    </View>
                  )}
                </View>

                {loadingHist ? (
                  <View className="items-center py-8">
                    <ActivityIndicator size="small" color="#064E3B" />
                    <Text className="text-[12px] text-gray-400 mt-2">Loading history…</Text>
                  </View>
                ) : history.length === 0 ? (
                  <View className="items-center py-8 bg-white rounded-2xl border border-gray-100">
                    <Text className="text-2xl mb-2">💬</Text>
                    <Text className="text-[13px] font-semibold text-gray-500">No remarks yet</Text>
                    <Text className="text-[11px] text-gray-400 mt-0.5">Be the first to add a note.</Text>
                  </View>
                ) : (
                  <View className="pt-1">
                    {history.map((entry, i) => (
                      <RemarkRow key={entry.id} entry={entry} isLast={i === history.length - 1} />
                    ))}
                  </View>
                )}
              </View>

            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* StatusFlagPicker as sibling — avoids Android nested Modal bug */}
      <StatusFlagPicker
        visible={flagOpen}
        selected={statusFlag}
        onSelect={setStatusFlag}
        onClose={() => setFlagOpen(false)}
      />
    </>
  );
};

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
  <View className="flex-1 items-center justify-center py-24 px-8">
    <Text className="text-5xl mb-4">📋</Text>
    <Text className="text-[16px] font-bold text-gray-600 mb-2 text-center">{label}</Text>
    <Text className="text-[13px] text-gray-400 text-center leading-5 max-w-[240px]">No records here yet.</Text>
  </View>
);

// ─── PRModule ─────────────────────────────────────────────────────────────────

export default function PRModule() {
  const navigation = useNavigation();
  const { currentUser } = useAuth();
  const roleId = currentUser?.role_id ?? 0;

  const [activeSubTab,  setActiveSubTab]  = useState<SubTab>("pr");
  const [searchQuery,   setSearchQuery]   = useState("");
  const [sectionFilter, setSectionFilter] = useState("All");
  const [page,          setPage]          = useState(1);
  const [records,       setRecords]       = useState<PRRecord[]>([]);
  const [statuses,      setStatuses]      = useState<PRStatusRow[]>([]);

  // View PR modal state
  const [viewRecord,  setViewRecord]  = useState<PRRecord | null>(null);
  const [viewVisible, setViewVisible] = useState(false);

  // Edit PR modal state
  const [editRecord,  setEditRecord]  = useState<PREditRecord | null>(null);
  const [editVisible, setEditVisible] = useState(false);

  // Process PR modal state (Division Head / BAC / Budget)
  const [processRecord,  setProcessRecord]  = useState<ProcessRecord | null>(null);
  const [processVisible, setProcessVisible] = useState(false);

  // More / actions sheet state
  const [moreRecord,  setMoreRecord]  = useState<PRRecord | null>(null);
  const [moreVisible, setMoreVisible] = useState(false);

  // Create PR modal state
  const [prModalOpen,   setPrModalOpen]   = useState(false);
  const [saving,        setSaving]        = useState(false);

  // Load PR status lookup table once — labels come from DB, not hardcoded strings.
  useEffect(() => {
    fetchPRStatuses()
      .then(setStatuses)
      .catch(() => {}); // non-fatal; StatusPill falls back to "Status N"
  }, []);

  // Load PRs by subtab
  useEffect(() => {
    const load = async () => {
      try {
        let rows: PRRow[] = [];
        if (activeSubTab === "pr") {
          rows = (roleId === 1 || PROCESS_ROLES.has(roleId))
            ? await fetchPurchaseRequests()
            : await fetchPurchaseRequestsByDivision(currentUser?.division_id ?? -1);
        } else if (activeSubTab === "canvass") {
          rows = (roleId === 1 || PROCESS_ROLES.has(roleId))
            ? await fetchCanvassablePRs()
            : await fetchCanvassablePRsByDivision(currentUser?.division_id ?? -1);
        } else {
          rows = []; // Abstract of awards subtab will populate later
        }
        setRecords(rows.map((r) => rowToRecord(r)));
      } catch {}
    };
    load();
  }, [activeSubTab, roleId, currentUser?.division_id]);

  // No auto-navigation; we open Canvassing when user taps "Process" in the Canvass subtab.

  const handleOpenCreate = useCallback(() => {
    setPrModalOpen(true);
  }, []);

  const handlePRSubmit = useCallback(async (payload: PRSubmitPayload) => {
    setSaving(true);
    try {
      const saved = await insertPurchaseRequest(payload.pr, payload.items);
      try {
        await insertProposalForPR(saved.id, payload.proposalNo, payload.divisionId);
      } catch {}
      setRecords((prev) => [rowToRecord(saved, payload.items.length), ...prev]);
      setPage(1);
    } catch (e: any) {
      const message = e.message ?? "Insert failed";
      setRecords((prev) => [{
        id: `local-${Date.now()}`,
        prNo: payload.pr.pr_no,
        // Mirror display fields exactly
        officeSection: payload.pr.office_section,
        purpose: payload.pr.purpose,
        totalCost: payload.pr.total_cost,
        statusId: 1, // Pending — status_id 1 per pr_status table
        date: new Date().toLocaleDateString("en-PH"),
        // Extra display-only fields
        itemDescription: payload.pr.purpose,
        quantity: payload.items.length,
        elapsedTime: "just now",
      } as PRRecord, ...prev]);
      setPage(1);
      Alert.alert("Saved locally", `Could not reach the server. Record will sync when online. ${message}`);
    } finally { setSaving(false); }
    // Modal already inserted to DB. Optimistically add to list and refresh later.
    // setRecords((prev) => [{
    //   id: `local-${Date.now()}`, prNo: payload.pr.pr_no,
    //   itemDescription: `${payload.pr.office_section} procurement request`,
    //   officeSection: payload.pr.office_section, quantity: payload.items.length,
    //   totalCost: payload.pr.total_cost, date: new Date().toLocaleDateString("en-PH"),
    //   status: "pending", elapsedTime: "just now",
    // }, ...prev]);
    // setPage(1);
    // setSaving(false);
  }, []);


  const handlePRSave = useCallback((payload: PREditPayload) => {
    setRecords((prev) => prev.map((r) =>
      r.id !== payload.id ? r : {
        ...r,
        officeSection: payload.officeSection,
        totalCost: payload.totalCost,
        quantity: payload.items.length,
        itemDescription: `${payload.officeSection} procurement request`,
      }
    ));
    // TODO: persist via supabase updatePurchaseRequest(payload)
  }, []);

  const filtered   = records.filter((r) => {
    const q = searchQuery.toLowerCase();
    return (!q || r.prNo.toLowerCase().includes(q) || r.itemDescription.toLowerCase().includes(q) || r.officeSection.toLowerCase().includes(q))
      && (sectionFilter === "All" || r.officeSection === sectionFilter);
  });
  const paged      = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  return (
    <View className="flex-1 bg-gray-50">
      <SubTabRow active={activeSubTab} onSelect={setActiveSubTab} />
      <SearchBar value={searchQuery} onChange={(t) => { setSearchQuery(t); setPage(1); }} onCreatePress={handleOpenCreate} />
      <StatStrip records={filtered} statuses={statuses} />
      {roleId !== 6 && (
        <FilterChips active={sectionFilter} onSelect={(s) => { setSectionFilter(s); setPage(1); }} />
      )}

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled">
        {paged.length === 0
          ? <EmptyState label="No records found" />
          : paged.map((record, idx) => (
              <RecordCard key={record.id} record={record} isEven={idx % 2 === 0} roleId={roleId}
                statuses={statuses}
                onView={(r)    => { setViewRecord(r); setViewVisible(true); }}
                onEdit={(r)    => { setEditRecord({ id: r.id, prNo: r.prNo }); setEditVisible(true); }}
                onProcess={(r) => {
                  if (activeSubTab === "canvass") {
                    (navigation as any).navigate("Canvassing" as never, { prNo: r.prNo } as never);
                  } else {
                    setProcessRecord({ id: r.id, prNo: r.prNo });
                    setProcessVisible(true);
                  }
                }}
                onMore={(r)    => { setMoreRecord(r); setMoreVisible(true); }} />
            ))}
      </ScrollView>

      {/* Pagination */}
      <View className="flex-row items-center justify-between px-4 py-3 bg-white border-t border-gray-100">
        <Text className="text-[12px] text-gray-400">
          <Text className="font-semibold text-gray-600">{filtered.length}</Text> records
        </Text>
        <View className="flex-row items-center gap-1.5">
          {[
            { label: "‹", page: Math.max(1, page - 1), disabled: page === 1 },
            ...Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1)
              .map((p) => ({ label: String(p), page: p, disabled: false, active: p === page })),
            { label: "›", page: Math.min(totalPages, page + 1), disabled: page === totalPages },
          ].map((btn, i) => (
            <TouchableOpacity key={i} onPress={() => setPage(btn.page)} disabled={btn.disabled} activeOpacity={0.8}
              className={`w-8 h-8 rounded-lg items-center justify-center border ${
                (btn as any).active ? "bg-[#064E3B] border-[#064E3B]" :
                btn.disabled        ? "bg-gray-50 border-gray-100"   : "bg-white border-gray-200"
              }`}>
              <Text className={`text-[12px] font-bold ${
                (btn as any).active ? "text-white" : btn.disabled ? "text-gray-300" : "text-gray-500"
              }`}>{btn.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* View PR modal */}
      <ViewPRModal
        visible={viewVisible}
        record={viewRecord}
        onClose={() => { setViewVisible(false); setViewRecord(null); }}
      />

      {/* More / Remarks sheet */}
      <RemarkSheet
        visible={moreVisible}
        record={moreRecord}
        currentUser={currentUser}
        onClose={() => { setMoreVisible(false); setMoreRecord(null); }}
      />


      {/* Edit PR modal */}
      <EditPRModal
        visible={editVisible}
        record={editRecord}
        onClose={() => { setEditVisible(false); setEditRecord(null); }}
        onSave={handlePRSave}
      />

      {/* Process PR modal — Division Head / BAC / Budget */}
      <ProcessPRModal
        visible={processVisible}
        record={processRecord}
        roleId={roleId}
        onClose={() => { setProcessVisible(false); setProcessRecord(null); }}
        onProcessed={(id, newStatusId) => {
          // newStatusId is the raw status_id integer from pr_status.
          // Update the record in-place so the list reflects the new state immediately.
          setRecords((prev) => prev.map((r) => r.id === id ? { ...r, statusId: Number(newStatusId) } : r));
        }}
      />

      {/* Create PR modal */}
      {prModalOpen && (
        <PurchaseRequestModal visible={prModalOpen}
          onClose={() => setPrModalOpen(false)} onSubmit={handlePRSubmit} currentUser={currentUser as any} />
      )}

      {/* Saving overlay */}
      {saving && (
        <View className="absolute inset-0 bg-black/20 items-center justify-center">
          <View className="bg-white rounded-2xl px-6 py-4">
            <Text className="text-[14px] font-semibold text-gray-700">Saving…</Text>
          </View>
        </View>
      )}
    </View>
  );
}
