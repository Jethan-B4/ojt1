import {
  buildBACResolutionHTML,
  type BACResolutionData,
} from "@/app/(components)/BACResolutionPreview";
import BACResolutionPreviewModal from "@/app/(modals)/BACResolutionPreviewModal";
import CalendarModalSheet from "@/app/(modals)/CalendarModal";
import {
  fetchBACResolutionsByDivision,
  insertStandaloneBACResolution,
} from "@/lib/supabase/bac";
import { supabase } from "@/lib/supabase/client";
import { fetchCanvassablePRs } from "@/lib/supabase/pr";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import WebView from "react-native-webview";
import { preloadLogos } from "../../lib/documentAssets";

type PRRow = {
  key: string;
  prId: number | null;
  prNo: string;
  date: string;
  estimatedCost: string;
  endUser: string;
  procMode: string;
};

const PROC_MODES = [
  "Small Value Procurement (SVP)",
  "Competitive Bidding",
  "Direct Contracting",
  "Shopping",
  "Negotiated Procurement",
];

export default function BACResolutionModule({
  currentUserId,
  divisionId,
}: {
  currentUserId?: number | null;
  divisionId?: number | null;
}) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [pool, setPool] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<BACResolutionData | null>(null);
  const [logosLoaded, setLogosLoaded] = useState(false);

  const [resNo, setResNo] = useState("");
  const [mode, setMode] = useState(PROC_MODES[0]);
  const [resolvedAt, setResolvedAt] = useState("HL Bldg. Carnation St, Triangulo Naga City");
  const [whereas1, setWhereas1] = useState("");
  const [whereas2, setWhereas2] = useState("");
  const [whereas3, setWhereas3] = useState("");
  const [nowTherefore, setNowTherefore] = useState(
    "to recommend to the Head of Procuring Entity the procurement of items through SVP method.",
  );
  const [source, setSource] = useState<"valid" | "manual">("valid");
  const [prs, setPrs] = useState<PRRow[]>([]);
  const [poolQuery, setPoolQuery] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarKey, setCalendarKey] = useState<string | null>(null);

  const todayStr = useMemo(
    () =>
      new Date().toLocaleDateString("en-PH", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    [],
  );
  const [tab, setTab] = useState<"form" | "pdf">("form");
  const [previewMode, setPreviewMode] = useState<"filled" | "template">(
    "filled",
  );

  const load = useCallback(async () => {
    if (!divisionId) return;
    setLoading(true);
    try {
      const [list, valid] = await Promise.all([
        fetchBACResolutionsByDivision(divisionId),
        fetchCanvassablePRs(),
      ]);
      setRows(list);
      setPool(valid ?? []);
    } finally {
      setLoading(false);
    }
  }, [divisionId]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  useEffect(() => {
    preloadLogos()
      .catch(() => {})
      .finally(() => setLogosLoaded(true));
  }, []);

  const newRow = useMemo<PRRow>(
    () => ({
      key: `manual-${Date.now()}`,
      prId: null,
      prNo: "",
      date: todayStr,
      estimatedCost: "",
      endUser: "",
      procMode: mode,
    }),
    [mode, todayStr],
  );

  const openCreate = () => {
    setResNo("");
    setMode(PROC_MODES[0]);
    setResolvedAt("HL Bldg. Carnation St, Triangulo Naga City");
    setWhereas1("");
    setWhereas2("");
    setWhereas3("");
    setNowTherefore(
      "to recommend to the Head of Procuring Entity the procurement of items through SVP method.",
    );
    setSource(pool.length > 0 ? "valid" : "manual");
    setPrs([]);
    setPoolQuery("");
    setTab("form");
    setOpen(true);
  };

  const save = async () => {
    if (!divisionId || !currentUserId) return;
    const clean = prs
      .map((r) => ({ ...r, prNo: r.prNo.trim(), endUser: r.endUser.trim() }))
      .filter((r) => r.prNo && r.endUser && r.procMode);
    if (!resNo.trim() || !whereas1.trim() || !whereas2.trim() || !whereas3.trim() || !nowTherefore.trim()) {
      Alert.alert("Required", "Fill all required BAC resolution fields.");
      return;
    }
    if (clean.length === 0) {
      Alert.alert("Required", "Add at least one PR row.");
      return;
    }

    const linked: {
      pr_id?: number | null;
      pr_no: string;
      pr_date?: string | null;
      estimated_cost?: number | null;
      end_user?: string | null;
      recommended_mode?: string | null;
    }[] = [];

    for (const r of clean) {
      let prId = r.prId ?? null;
      if (!prId) {
        const { data } = await supabase
          .from("purchase_requests")
          .select("id, division_id")
          .eq("pr_no", r.prNo)
          .maybeSingle();
        if (!data) throw new Error(`PR ${r.prNo} not found.`);
        prId = Number(data.id);
      }
      linked.push({
        pr_id: prId,
        pr_no: r.prNo,
        pr_date: r.date || null,
        estimated_cost: Number(r.estimatedCost || "0") || 0,
        end_user: r.endUser || null,
        recommended_mode: r.procMode || null,
      });
    }

    await insertStandaloneBACResolution({
      resolution_no: resNo,
      prepared_by: Number(currentUserId),
      division_id: Number(divisionId),
      mode,
      resolved_at: new Date().toISOString(),
      resolved_at_place: resolvedAt,
      whereas_1: whereas1,
      whereas_2: whereas2,
      whereas_3: whereas3,
      now_therefore_text: nowTherefore,
      prs: linked,
    });
    setOpen(false);
    await load();
  };

  const toPreview = (r: any): BACResolutionData => ({
    resolutionNo: r.resolution_no ?? "—",
    resolvedDate: r.resolved_at
      ? new Date(r.resolved_at).toLocaleDateString("en-PH", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : new Date().toLocaleDateString("en-PH"),
    location: r.resolved_at_place || "HL Bldg. Carnation St, Triangulo Naga City",
    projectTitle: r.project_title ?? "—",
    procurementMode: r.mode ?? PROC_MODES[0],
    approvedBudget: r.approved_budget ?? "0.00",
    prEntries: (r.bac_resolution_prs ?? []).map((p: any) => ({
      prNo: p.pr_no,
      date: p.pr_date ?? "",
      estimatedCost: Number(p.estimated_cost ?? 0).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      endUser: p.end_user ?? "",
      procMode: p.recommended_mode ?? r.mode ?? "",
    })),
    whereas1: r.whereas_1 ?? "",
    whereas2: r.whereas_2 ?? "",
    whereas3: r.whereas_3 ?? "",
    nowThereforeText: r.now_therefore_text ?? "",
    provincialOffice: "DARPO-CAMARINES SUR I",
    bacChairperson: "BAC Chairperson",
    bacViceChairperson: "BAC Vice-Chairperson",
    bacMembers: [
      { name: "BAC Member", title: "BAC Member" },
      { name: "BAC Member", title: "BAC Member" },
    ],
    approvedBy: "PARPO II",
    approvedByDesig: "HOPE",
    procurementModeTitle: String(r.mode ?? "").toUpperCase(),
  });

  const draftPreview = useMemo<BACResolutionData>(
    () => ({
      resolutionNo: resNo || "—",
      resolvedDate: new Date().toLocaleDateString("en-PH", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
      location: resolvedAt || "HL Bldg. Carnation St, Triangulo Naga City",
      projectTitle: prs.length > 0 ? prs[0].endUser : "—",
      procurementMode: mode,
      approvedBudget: prs
        .reduce((sum, p) => sum + (Number(p.estimatedCost) || 0), 0)
        .toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      prEntries:
        prs.length > 0
          ? prs.map((p) => ({
              prNo: p.prNo || "—",
              date: p.date || "",
              estimatedCost: Number(p.estimatedCost || 0).toLocaleString(
                "en-PH",
                { minimumFractionDigits: 2, maximumFractionDigits: 2 },
              ),
              endUser: p.endUser || "",
              procMode: p.procMode || mode,
            }))
          : [
              {
                prNo: "—",
                date: "",
                estimatedCost: "0.00",
                endUser: "",
                procMode: mode,
              },
            ],
      whereas1: whereas1 || "—",
      whereas2: whereas2 || "—",
      whereas3: whereas3 || "—",
      nowThereforeText: nowTherefore || "—",
      provincialOffice: "DARPO-CAMARINES SUR I",
      bacChairperson: "BAC Chairperson",
      bacViceChairperson: "BAC Vice-Chairperson",
      bacMembers: [
        { name: "BAC Member", title: "BAC Member" },
        { name: "BAC Member", title: "BAC Member" },
      ],
      approvedBy: "PARPO II",
      approvedByDesig: "HOPE",
      procurementModeTitle: mode.toUpperCase(),
    }),
    [resNo, resolvedAt, prs, whereas1, whereas2, whereas3, nowTherefore, mode],
  );

  const draftHtml = useMemo(() => {
    if (!logosLoaded) return "";
    return buildBACResolutionHTML(draftPreview, previewMode === "template");
  }, [draftPreview, logosLoaded, previewMode]);

  const ensureLogos = useCallback(async () => {
    if (logosLoaded) return;
    try {
      await preloadLogos();
    } finally {
      setLogosLoaded(true);
    }
  }, [logosLoaded]);

  const handlePrint = useCallback(async () => {
    try {
      await ensureLogos();
      await Print.printAsync({
        html: buildBACResolutionHTML(draftPreview, previewMode === "template"),
      });
    } catch {}
  }, [ensureLogos, draftPreview, previewMode]);

  const handleDownload = useCallback(async () => {
    try {
      await ensureLogos();
      const { uri } = await Print.printToFileAsync({
        html: buildBACResolutionHTML(draftPreview, previewMode === "template"),
      });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert("Saved", `PDF created at: ${uri}`);
      }
    } catch (e: any) {
      Alert.alert("Export failed", e?.message ?? "Could not export BAC Resolution.");
    }
  }, [ensureLogos, draftPreview, previewMode]);

  return (
    <View className="flex-1 bg-gray-50">
      <View className="px-4 py-3 bg-white border-b border-gray-200 flex-row items-center justify-between">
        <View>
          <Text className="text-[15px] font-extrabold text-[#064E3B]">
            BAC Resolution Module
          </Text>
          <Text className="text-[11px] text-gray-400">
            Standalone creation outside single PR session
          </Text>
        </View>
        <TouchableOpacity onPress={openCreate} className="px-3 py-2 rounded-xl bg-[#064E3B]">
          <Text className="text-[12px] font-bold text-white">New Resolution</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center gap-2">
          <ActivityIndicator size="large" color="#064E3B" />
          <Text className="text-[12px] text-gray-400">Loading resolutions…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 26 }}>
          {rows.map((r) => (
            <View key={r.id} className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 mb-2">
              <Text className="text-[12.5px] font-bold text-gray-800">{r.resolution_no}</Text>
              <Text className="text-[10.5px] text-gray-400">
                {(r.bac_resolution_prs ?? []).length} PR(s) linked
              </Text>
              <View className="items-end mt-1">
                <TouchableOpacity onPress={() => setPreview(toPreview(r))}>
                  <Text className="text-[11px] font-bold text-[#064E3B]">Preview</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {rows.length === 0 && (
            <View className="items-center py-12">
              <Text className="text-[12px] text-gray-400">No BAC resolutions yet.</Text>
            </View>
          )}
        </ScrollView>
      )}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView
          className="flex-1 bg-white"
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View className="px-5 pt-5 pb-2 bg-[#064E3B]">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-[16px] font-extrabold text-white">Create BAC Resolution</Text>
              <TouchableOpacity onPress={() => setOpen(false)} className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center">
                <MaterialIcons name="close" size={18} color="#ffffff" />
              </TouchableOpacity>
            </View>
            <View className="flex-row bg-black/20 rounded-xl p-1">
              {(["form", "pdf"] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setTab(t)}
                  className={`flex-1 py-2 rounded-lg items-center ${tab === t ? "bg-white" : ""}`}
                >
                  <Text className={`text-[12px] font-bold ${tab === t ? "text-[#064E3B]" : "text-white/70"}`}>
                    {t === "form" ? "Resolution Form" : "PDF Preview"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {tab === "pdf" && (
              <View className="flex-row justify-end gap-2 pt-2">
                <TouchableOpacity
                  onPress={() =>
                    setPreviewMode((prev) =>
                      prev === "filled" ? "template" : "filled",
                    )
                  }
                  className={`px-3 py-1.5 rounded-lg border ${previewMode === "template" ? "bg-white border-white" : "bg-white/10 border-white/20"}`}
                >
                  <Text
                    className={`text-[11.5px] font-bold ${previewMode === "template" ? "text-[#064E3B]" : "text-white"}`}
                  >
                    {previewMode === "template" ? "Template" : "Filled"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handlePrint} className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20">
                  <Text className="text-white text-[11.5px] font-bold">Print</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDownload} className="px-3 py-1.5 rounded-lg bg-white">
                  <Text className="text-[#064E3B] text-[11.5px] font-bold">Download PDF</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {tab === "pdf" ? (
            logosLoaded ? (
              <WebView
                source={{ html: draftHtml }}
                style={{ flex: 1 }}
                originWhitelist={["*"]}
              />
            ) : (
              <View className="flex-1 items-center justify-center gap-2">
                <ActivityIndicator size="large" color="#064E3B" />
                <Text className="text-[12px] text-gray-400">
                  Loading document assets…
                </Text>
              </View>
            )
          ) : (
            <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
              <View className="bg-white border border-gray-200 rounded-2xl p-3 mb-3">
                <Text className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                  Resolution Details
                </Text>
                <Text className="text-[11.5px] font-semibold text-gray-700 mb-1">
                  Resolution No.
                </Text>
                <TextInput value={resNo} onChangeText={setResNo} placeholder="e.g. BAC-RES-2026-001" className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 mb-2" />
                <Text className="text-[11.5px] font-semibold text-gray-700 mb-1">
                  Resolved At
                </Text>
                <TextInput value={resolvedAt} onChangeText={setResolvedAt} placeholder="Location of resolution signing" className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 mb-2" />

                <Text className="text-[11.5px] font-semibold text-gray-700 mb-1">
                  Mode of Procurement
                </Text>
                <View className="flex-row flex-wrap gap-2 mb-2">
                  {PROC_MODES.map((m) => {
                    const active = mode === m;
                    return (
                      <TouchableOpacity
                        key={m}
                        onPress={() => {
                          setMode(m);
                          setPrs((prev) =>
                            prev.map((x) => ({ ...x, procMode: x.procMode || m })),
                          );
                        }}
                        className={`px-2.5 py-1.5 rounded-lg border ${active ? "bg-emerald-50 border-emerald-300" : "bg-white border-gray-200"}`}
                      >
                        <Text className={`text-[10.5px] font-bold ${active ? "text-emerald-700" : "text-gray-600"}`}>
                          {m}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text className="text-[11.5px] font-semibold text-gray-700 mb-1">
                  WHEREAS #1
                </Text>
                <TextInput value={whereas1} onChangeText={setWhereas1} placeholder="WHEREAS #1" className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 mb-2" />
                <Text className="text-[11.5px] font-semibold text-gray-700 mb-1">
                  WHEREAS #2
                </Text>
                <TextInput value={whereas2} onChangeText={setWhereas2} placeholder="WHEREAS #2" className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 mb-2" />
                <Text className="text-[11.5px] font-semibold text-gray-700 mb-1">
                  WHEREAS #3
                </Text>
                <TextInput value={whereas3} onChangeText={setWhereas3} placeholder="WHEREAS #3" className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 mb-2" />
                <Text className="text-[11.5px] font-semibold text-gray-700 mb-1">
                  NOW THEREFORE / RESOLVED text
                </Text>
                <TextInput value={nowTherefore} onChangeText={setNowTherefore} placeholder="NOW THEREFORE / RESOLVED text" className="bg-white border border-gray-200 rounded-xl px-3 py-2.5" />
              </View>

              <View className="bg-white border border-gray-200 rounded-2xl p-3 mb-3">
                <Text className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                  Resolution PR Table Entries
                </Text>
                <View className="flex-row gap-2 mb-2">
                <TouchableOpacity
                  onPress={() => pool.length > 0 && setSource("valid")}
                  activeOpacity={0.85}
                  className={`px-3 py-2 rounded-xl border ${
                    source === "valid"
                      ? "bg-emerald-50 border-emerald-300"
                      : "bg-white border-gray-200"
                  } ${pool.length === 0 ? "opacity-50" : ""}`}
                >
                  <Text className="text-[11px] font-bold text-gray-700">
                    Choose Valid PRs
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setSource("manual")}
                  activeOpacity={0.85}
                  className={`px-3 py-2 rounded-xl border ${
                    source === "manual"
                      ? "bg-emerald-50 border-emerald-300"
                      : "bg-white border-gray-200"
                  }`}
                >
                  <Text className="text-[11px] font-bold text-gray-700">
                    Manual Entry
                  </Text>
                </TouchableOpacity>
              </View>

              {source === "valid" && (
                <>
                  {pool.length === 0 ? (
                    <View className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-2">
                      <Text className="text-[11.5px] font-semibold text-amber-800">
                        No valid PRs available.
                      </Text>
                      <Text className="text-[10.5px] text-amber-700 mt-0.5">
                        Only PRs that already passed Canvassing (collection) are listed.
                      </Text>
                    </View>
                  ) : (
                    <>
                      <TextInput
                        value={poolQuery}
                        onChangeText={setPoolQuery}
                        placeholder="Search PR No. or Division"
                        className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 mb-2"
                      />
                      {pool
                        .filter((p: any) => {
                          const q = poolQuery.trim().toLowerCase();
                          if (!q) return true;
                          const prNo = String(p.pr_no ?? "").toLowerCase();
                          const div = String(
                            p.division_name ?? p.divisions?.division_name ?? "",
                          ).toLowerCase();
                          return prNo.includes(q) || div.includes(q);
                        })
                        .map((p: any) => {
                  const on = prs.some((r) => r.prNo === p.pr_no);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() =>
                        setPrs((prev) =>
                          on
                            ? prev.filter((x) => x.prNo !== p.pr_no)
                            : [
                                ...prev,
                                {
                                  key: `pool-${p.id}`,
                                  prId: Number(p.id),
                                  prNo: p.pr_no,
                                  date: p.created_at
                                    ? new Date(p.created_at).toLocaleDateString("en-PH")
                                    : "",
                                  estimatedCost: String(p.total_cost ?? 0),
                                  endUser:
                                    p.division_name ??
                                    p.divisions?.division_name ??
                                    p.office_section ??
                                    "",
                                  procMode: mode,
                                },
                              ],
                        )
                      }
                      className={`px-3 py-2 rounded-xl border mb-1 ${on ? "bg-emerald-50 border-emerald-300" : "bg-white border-gray-200"}`}
                    >
                      <Text className="text-[11.5px] font-semibold text-gray-700">
                        {p.pr_no} ·{" "}
                        {p.division_name ?? p.divisions?.division_name ?? "—"} · Status{" "}
                        {p.status_id}
                      </Text>
                    </TouchableOpacity>
                  );
                        })}
                    </>
                  )}
                </>
              )}
              {prs.map((r) => (
                <View key={r.key} className="border border-gray-200 rounded-xl p-2 mb-2 bg-white">
                  <TextInput value={r.prNo} onChangeText={(v) => setPrs((prev) => prev.map((x) => x.key === r.key ? { ...x, prNo: v } : x))} placeholder="PR Number" className="border border-gray-200 rounded-lg px-2.5 py-2 mb-1.5" />
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      setCalendarKey(r.key);
                      setCalendarOpen(true);
                    }}
                    className="border border-gray-200 rounded-lg px-2.5 py-2 mb-1.5 bg-white"
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="text-[12.5px] text-gray-800">
                        {r.date || todayStr}
                      </Text>
                      <MaterialIcons name="calendar-today" size={14} color="#6b7280" />
                    </View>
                  </TouchableOpacity>
                  <TextInput value={r.estimatedCost} onChangeText={(v) => setPrs((prev) => prev.map((x) => x.key === r.key ? { ...x, estimatedCost: v } : x))} placeholder="Estimated Cost" keyboardType="decimal-pad" className="border border-gray-200 rounded-lg px-2.5 py-2 mb-1.5" />
                  <TextInput value={r.endUser} onChangeText={(v) => setPrs((prev) => prev.map((x) => x.key === r.key ? { ...x, endUser: v } : x))} placeholder="End User" className="border border-gray-200 rounded-lg px-2.5 py-2 mb-1.5" />
                  <TextInput value={r.procMode} onChangeText={(v) => setPrs((prev) => prev.map((x) => x.key === r.key ? { ...x, procMode: v } : x))} placeholder="Recommended Mode" className="border border-gray-200 rounded-lg px-2.5 py-2" />
                  <View className="items-end mt-2">
                    <TouchableOpacity
                      onPress={() =>
                        setPrs((prev) => prev.filter((x) => x.key !== r.key))
                      }
                      activeOpacity={0.8}
                    >
                      <Text className="text-[11px] font-bold text-red-500">
                        Remove
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <TouchableOpacity onPress={() => setPrs((prev) => [...prev, { ...newRow, key: `${newRow.key}-${prev.length}` }])} className="px-3 py-2 rounded-xl border border-dashed border-gray-300 bg-white mb-1">
                <Text className="text-[11.5px] text-center font-bold text-gray-600">+ Add PR Row</Text>
              </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => save().catch((e) => Alert.alert("Save failed", e?.message ?? "Could not save resolution."))} className="px-3 py-2.5 rounded-xl bg-[#064E3B]">
                <Text className="text-[12px] font-bold text-white text-center">Save BAC Resolution</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </Modal>

      <CalendarModalSheet
        visible={calendarOpen}
        initialDate={new Date()}
        onClose={() => {
          setCalendarOpen(false);
          setCalendarKey(null);
        }}
        onSelectDate={(date) => {
          if (!calendarKey) return;
          const v = date.toLocaleDateString("en-PH", {
            month: "long",
            day: "numeric",
            year: "numeric",
          });
          setPrs((prev) =>
            prev.map((x) => (x.key === calendarKey ? { ...x, date: v } : x)),
          );
        }}
      />

      {preview && (
        <BACResolutionPreviewModal
          visible={!!preview}
          data={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </View>
  );
}
