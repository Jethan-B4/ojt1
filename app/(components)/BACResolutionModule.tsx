import type { BACResolutionData } from "@/app/(components)/BACResolutionPreview";
import BACResolutionPreviewModal from "@/app/(modals)/BACResolutionPreviewModal";
import {
  fetchBACResolutionsByDivision,
  insertStandaloneBACResolution,
} from "@/lib/supabase/bac";
import { supabase } from "@/lib/supabase/client";
import { fetchCanvassablePRsByDivision } from "@/lib/supabase/pr";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

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

  const load = useCallback(async () => {
    if (!divisionId) return;
    setLoading(true);
    try {
      const [list, valid] = await Promise.all([
        fetchBACResolutionsByDivision(divisionId),
        fetchCanvassablePRsByDivision(divisionId),
      ]);
      setRows(list);
      setPool(valid);
    } finally {
      setLoading(false);
    }
  }, [divisionId]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const newRow = useMemo<PRRow>(
    () => ({
      key: `manual-${Date.now()}`,
      prId: null,
      prNo: "",
      date: "",
      estimatedCost: "",
      endUser: "",
      procMode: mode,
    }),
    [mode],
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
    setSource("valid");
    setPrs([]);
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
        if (Number(data.division_id) !== Number(divisionId)) {
          throw new Error(`PR ${r.prNo} is from another division.`);
        }
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
    bacMembers: ["BAC Member", "BAC Member"],
    approvedBy: "PARPO II",
    approvedByDesig: "HOPE",
    procurementModeTitle: String(r.mode ?? "").toUpperCase(),
  });

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
        <View className="flex-1 bg-gray-50">
          <View className="px-4 py-3 bg-white border-b border-gray-200 flex-row items-center justify-between">
            <Text className="text-[15px] font-extrabold text-[#064E3B]">Create BAC Resolution</Text>
            <TouchableOpacity onPress={() => setOpen(false)}>
              <MaterialIcons name="close" size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 28 }}>
            <TextInput value={resNo} onChangeText={setResNo} placeholder="Resolution No." className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 mb-2" />
            <TextInput value={resolvedAt} onChangeText={setResolvedAt} placeholder="Resolved At" className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 mb-2" />
            <TextInput value={whereas1} onChangeText={setWhereas1} placeholder="WHEREAS #1" className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 mb-2" />
            <TextInput value={whereas2} onChangeText={setWhereas2} placeholder="WHEREAS #2" className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 mb-2" />
            <TextInput value={whereas3} onChangeText={setWhereas3} placeholder="WHEREAS #3" className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 mb-2" />
            <TextInput value={nowTherefore} onChangeText={setNowTherefore} placeholder="NOW THEREFORE text" className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 mb-2" />
            <View className="flex-row gap-2 mb-2">
              <TouchableOpacity onPress={() => setSource("valid")} className={`px-3 py-2 rounded-xl border ${source === "valid" ? "bg-emerald-50 border-emerald-300" : "bg-white border-gray-200"}`}>
                <Text className="text-[11px] font-bold text-gray-700">Choose Valid PRs</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSource("manual")} className={`px-3 py-2 rounded-xl border ${source === "manual" ? "bg-emerald-50 border-emerald-300" : "bg-white border-gray-200"}`}>
                <Text className="text-[11px] font-bold text-gray-700">Manual Entry</Text>
              </TouchableOpacity>
            </View>
            {source === "valid" &&
              pool.slice(0, 12).map((p) => {
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
                                endUser: p.office_section ?? "",
                                procMode: mode,
                              },
                            ],
                      )
                    }
                    className={`px-3 py-2 rounded-xl border mb-1 ${on ? "bg-emerald-50 border-emerald-300" : "bg-white border-gray-200"}`}
                  >
                    <Text className="text-[11.5px] font-semibold text-gray-700">{p.pr_no} · {p.office_section ?? "—"}</Text>
                  </TouchableOpacity>
                );
              })}
            {prs.map((r) => (
              <View key={r.key} className="border border-gray-200 rounded-xl p-2 mb-2 bg-white">
                <TextInput value={r.prNo} onChangeText={(v) => setPrs((prev) => prev.map((x) => x.key === r.key ? { ...x, prNo: v } : x))} placeholder="PR Number" className="border border-gray-200 rounded-lg px-2.5 py-2 mb-1.5" />
                <TextInput value={r.date} onChangeText={(v) => setPrs((prev) => prev.map((x) => x.key === r.key ? { ...x, date: v } : x))} placeholder="Date" className="border border-gray-200 rounded-lg px-2.5 py-2 mb-1.5" />
                <TextInput value={r.estimatedCost} onChangeText={(v) => setPrs((prev) => prev.map((x) => x.key === r.key ? { ...x, estimatedCost: v } : x))} placeholder="Estimated Cost" keyboardType="decimal-pad" className="border border-gray-200 rounded-lg px-2.5 py-2 mb-1.5" />
                <TextInput value={r.endUser} onChangeText={(v) => setPrs((prev) => prev.map((x) => x.key === r.key ? { ...x, endUser: v } : x))} placeholder="End User" className="border border-gray-200 rounded-lg px-2.5 py-2 mb-1.5" />
                <TextInput value={r.procMode} onChangeText={(v) => setPrs((prev) => prev.map((x) => x.key === r.key ? { ...x, procMode: v } : x))} placeholder="Recommended Mode" className="border border-gray-200 rounded-lg px-2.5 py-2" />
              </View>
            ))}
            <TouchableOpacity onPress={() => setPrs((prev) => [...prev, { ...newRow, key: `${newRow.key}-${prev.length}` }])} className="px-3 py-2 rounded-xl border border-dashed border-gray-300 bg-white mb-2">
              <Text className="text-[11.5px] text-center font-bold text-gray-600">+ Add PR Row</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => save().catch((e) => Alert.alert("Save failed", e?.message ?? "Could not save resolution."))} className="px-3 py-2.5 rounded-xl bg-[#064E3B]">
              <Text className="text-[12px] font-bold text-white text-center">Save BAC Resolution</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

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

