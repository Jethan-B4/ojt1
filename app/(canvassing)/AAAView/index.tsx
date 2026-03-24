/**
 * AAAView — AAA (Abstract of Awards) preparation module, Step 10.
 *
 * Handles the final step of the canvassing process where the BAC prepares
 * and records the Abstract of Awards before forwarding to the Supply Section.
 */

import {
  CANVASS_PR_STATUS,
  fetchAAAForSession,
  fetchBACResolutionForSession,
  fetchCanvassSessionById,
  fetchPRIdByNo,
  fetchPRWithItemsById,
  fetchQuotesForSession,
  insertAAAForSession,
  setItemWinningSupplier,
  updateCanvassSessionMeta,
  updatePRStatus,
} from "@/lib/supabase";
import type { CanvassingPR, CanvassingPRItem } from "@/types/canvassing";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { buildAAAPreviewHTML } from "../../(components)/AAAPreview";
import AAAPreviewModal from "../../(modals)/AAAPreviewModal";
import { useAuth } from "../../AuthContext";
import { CompletedBanner, StepHeader, StepNav } from "../BACView/components";
import { MONO } from "../BACView/constants";
import { Card, Divider, Field, Input } from "../BACView/ui";

interface AAAViewProps {
  sessionId: string;
  pr: CanvassingPR;
  bacNo: string;
  resolutionNo: string;
  mode: string;
  onComplete?: (payload: any) => void;
  onBack?: () => void;
}

export default function AAAView({
  sessionId,
  pr,
  bacNo,
  resolutionNo: resolutionNoProp,
  mode: modeProp,
  onComplete,
  onBack,
}: AAAViewProps) {
  const { currentUser } = useAuth();
  const [aaaNo, setAaaNo] = useState("");
  const [particulars, setParticulars] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [resolutionNo, setResolutionNo] = useState(resolutionNoProp);
  const [mode, setMode] = useState(modeProp);
  const sessionRef = useRef({
    bac_no: bacNo,
    resolution_no: resolutionNoProp,
    mode: modeProp,
    aaa_no: "",
    particulars: "",
  });

  // ── Hydrate PR header/items and session metadata from DB ─────────────────────
  const [header, setHeader] = useState({
    prNo: pr.prNo,
    date: pr.date,
    office: pr.officeSection,
  });
  const [liveItems, setLiveItems] = useState<CanvassingPRItem[]>(
    (pr.items as any) ?? [],
  );

  useEffect(() => {
    (async () => {
      try {
        // PR header + items
        const prId = await fetchPRIdByNo(pr.prNo);
        if (prId) {
          const { header: h, items } = await fetchPRWithItemsById(prId);
          setHeader({
            prNo: pr.prNo,
            date: new Date(h.created_at as any).toLocaleDateString("en-PH"),
            office: h.office_section ?? pr.officeSection,
          });
          setLiveItems(
            items.map((i: any) => ({
              id: parseInt(String(i.id)),
              desc: i.description,
              stock: i.stock_no,
              unit: i.unit,
              qty: i.quantity,
              unitCost: i.unit_price,
            })),
          );
        }

        // Session meta (bac_no, etc.)
        const sess = await fetchCanvassSessionById(sessionId);
        if (sess?.bac_no) sessionRef.current.bac_no = sess.bac_no;

        // Resolution
        const res = await fetchBACResolutionForSession(sessionId);
        if (res?.resolution_no) {
          setResolutionNo(res.resolution_no);
          sessionRef.current.resolution_no = res.resolution_no;
        }
        if (res?.mode) {
          setMode(res.mode);
          sessionRef.current.mode = res.mode;
        }

        // AAA doc (prefill)
        const aaa = await fetchAAAForSession(sessionId);
        if (aaa?.aaa_no) {
          setAaaNo(aaa.aaa_no);
          setIsSubmitted(true);
          sessionRef.current.aaa_no = aaa.aaa_no;
        }
        if (aaa?.particulars) {
          setParticulars(aaa.particulars);
          sessionRef.current.particulars = aaa.particulars;
        }
      } catch {
        // ignore hydration errors; UI will fallback to provided props
      }
    })();
  }, [sessionId, pr.prNo]);

  const handleSubmit = useCallback(async () => {
    if (!sessionId || !aaaNo) return;
    try {
      const prId = await fetchPRIdByNo(pr.prNo);
      if (!prId) throw new Error("PR not found");

      sessionRef.current.aaa_no = aaaNo;
      sessionRef.current.particulars = particulars;

      // Record AAA in database
      await insertAAAForSession(sessionId, {
        aaa_no: aaaNo,
        particulars: particulars || null,
        prepared_by: currentUser?.id ?? 0,
        prepared_at: new Date().toISOString(),
        file_url: null,
      });

      // Close session and update PR status
      await updateCanvassSessionMeta(sessionId, { status: "closed" });
      await updatePRStatus(prId, CANVASS_PR_STATUS.aaa_preparation);

      setIsSubmitted(true);

      // Notify parent component
      onComplete?.({
        pr_no: pr.prNo,
        bac_no: sessionRef.current.bac_no,
        resolution_no: sessionRef.current.resolution_no,
        mode,
        aaa_no: aaaNo,
      });

      Alert.alert("✅ Canvassing Complete", "Forward to Supply Section");
    } catch (e: any) {
      Alert.alert("AAA failed", e?.message ?? "Could not record AAA");
    }
  }, [
    sessionId,
    pr.prNo,
    aaaNo,
    particulars,
    currentUser?.id,
    mode,
    onComplete,
  ]);

  const handleResubmit = () => {
    setIsSubmitted(false);
    setAaaNo("");
    setParticulars("");
  };

  // ── Abstract table data (read-only from quotations) ─────────────────────────
  const [entries, setEntries] = useState<
    { item_no: number; supplier_name: string; unit_price: number }[]
  >([]);

  useEffect(() => {
    (async () => {
      if (!sessionId) return;
      try {
        const rows = await fetchQuotesForSession(sessionId);
        setEntries(
          rows.map((r) => ({
            item_no: r.item_no,
            supplier_name: r.supplier_name ?? "",
            unit_price: r.unit_price ?? 0,
          })),
        );
      } catch {}
    })();
  }, [sessionId]);

  const suppliers = useMemo(() => {
    const names = Array.from(
      new Set(entries.map((e) => e.supplier_name).filter(Boolean)),
    );
    return names.slice(0, 3);
  }, [entries]);

  const priceFor = (itemId: number, supplier: string) =>
    entries.find((e) => e.item_no === itemId && e.supplier_name === supplier)
      ?.unit_price ?? 0;

  const winningSupplierFor = (itemId: number) => {
    const byItem = entries.filter(
      (e) => e.item_no === itemId && e.unit_price > 0,
    );
    if (byItem.length === 0) return "";
    return byItem.reduce((best, e) =>
      e.unit_price < best.unit_price ? e : best,
    ).supplier_name;
  };

  const ItemsAbstract = ({
    items,
    suppliers,
  }: {
    items: CanvassingPRItem[];
    suppliers: string[];
  }) => (
    <Card>
      <View className="px-4 pt-3 pb-3">
        <Divider label="Abstract of Awards" />
        <View className="rounded-xl overflow-hidden border border-gray-100">
          {/* Header */}
          <View className="flex-row bg-[#064E3B] px-2.5 py-1.5">
            {["Item", "Qty", "Unit", "Particulars", ...suppliers].map(
              (h, i) => (
                <Text
                  key={h}
                  className="text-[9.5px] font-bold uppercase tracking-wide text-white/70"
                  style={{ flex: i === 3 ? 2 : 1 }}>
                  {i >= 4 ? `Supplier: ${h}` : h}
                </Text>
              ),
            )}
          </View>
          {/* Rows */}
          {items.map((item, i) => {
            const winner = winningSupplierFor(item.id);
            return (
              <View
                key={item.id}
                className={`flex-row px-2.5 py-2 ${i % 2 ? "bg-gray-50" : "bg-white"}`}
                style={{ borderTopWidth: 1, borderTopColor: "#f3f4f6" }}>
                <Text
                  className="flex-1 text-[12px] text-gray-700"
                  style={{ fontFamily: MONO }}>
                  {i + 1}
                </Text>
                <Text
                  className="flex-1 text-[12px] text-gray-700"
                  style={{ fontFamily: MONO }}>
                  {item.qty}
                </Text>
                <Text className="flex-1 text-[12px] text-gray-500">
                  {item.unit}
                </Text>
                <Text className="flex-[2] text-[12px] text-gray-700">
                  {item.desc}
                </Text>
                {suppliers.map((s) => {
                  const price = priceFor(item.id, s);
                  const isWin = winner === s && price > 0;
                  return (
                    <View key={s} style={{ flex: 1, alignItems: "flex-end" }}>
                      <Text
                        className={`text-[12px] ${isWin ? "font-extrabold text-emerald-700" : "text-gray-700"}`}
                        style={{ fontFamily: MONO }}>
                        ₱
                        {price.toLocaleString("en-PH", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </Text>
                      <TouchableOpacity
                        onPress={async () => {
                          if (!sessionId || price <= 0) return;
                          try {
                            await setItemWinningSupplier(sessionId, item.id, s);
                            // Refresh entries
                            const rows = await fetchQuotesForSession(sessionId);
                            setEntries(
                              rows.map((r) => ({
                                item_no: r.item_no,
                                supplier_name: r.supplier_name ?? "",
                                unit_price: r.unit_price ?? 0,
                              })),
                            );
                          } catch {}
                        }}
                        activeOpacity={0.7}
                        style={{ marginTop: 2 }}>
                        <Text
                          className={`text-[10px] font-bold ${isWin ? "text-emerald-700" : "text-gray-400"}`}>
                          {isWin ? "✓ Winner" : "Mark"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      </View>
    </Card>
  );

  const [previewOpen, setPreviewOpen] = useState(false);
  const buildPreviewHTML = () => {
    const rows = (pr.items as any as CanvassingPRItem[]).map((item, idx) => {
      const prices: Record<string, number> = {};
      suppliers.forEach((s) => {
        prices[s] = priceFor(item.id, s);
      });
      return {
        itemNo: idx + 1,
        unit: item.unit,
        qty: item.qty,
        desc: item.desc,
        prices,
        winner: winningSupplierFor(item.id) || null,
      };
    });
    return buildAAAPreviewHTML({
      prNo: pr.prNo,
      date: pr.date,
      office: pr.officeSection,
      suppliers,
      particulars,
      rows,
    });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-white">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16 }}>
        <StepHeader
          stage="aaa_preparation"
          title="Abstract of Awards"
          desc="Prepare the AAA and finalize the canvassing process."
        />

        {/* PR Summary */}
        <Card>
          <View className="bg-[#064E3B] px-4 pt-3.5 pb-3">
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-2">
                <Text className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-1">
                  Purchase Request
                </Text>
                <Text
                  className="text-[16px] font-extrabold text-white"
                  style={{ fontFamily: MONO }}>
                  {pr.prNo}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-1">
                  BAC No.
                </Text>
                <Text
                  className="text-[15px] font-extrabold text-white"
                  style={{ fontFamily: MONO }}>
                  {bacNo}
                </Text>
              </View>
            </View>
          </View>
        </Card>

        {/* AAA Details Form */}
        <Card>
          <View className="px-4 pt-3 pb-2">
            <Divider label="AAA Details" />
            <View className="flex-row gap-2.5">
              <View className="flex-1">
                <Field label="AAA No." required>
                  <Input
                    value={aaaNo}
                    onChange={setAaaNo}
                    placeholder="e.g. AAA-2026-0001"
                  />
                </Field>
              </View>
              <View className="flex-1">
                <Field label="PR Reference">
                  <Input value={pr.prNo} readonly />
                </Field>
              </View>
              <View className="flex-1">
                <Field label="Date Prepared">
                  <Input
                    value={new Date().toLocaleDateString("en-PH")}
                    readonly
                  />
                </Field>
              </View>
            </View>
            <View className="mt-3">
              <Field label="Particulars">
                <Input
                  value={particulars}
                  onChange={setParticulars}
                  placeholder="e.g. Items awarded based on competitive bidding"
                  multiline
                />
              </Field>
            </View>
          </View>
        </Card>

        {/* Resolution Reference */}
        <Card>
          <View className="px-4 py-3">
            <Divider label="Resolution Reference" />
            <View className="flex-row gap-2.5 mt-2">
              <View className="flex-1">
                <Field label="Resolution No.">
                  <Input value={resolutionNo} readonly />
                </Field>
              </View>
              <View className="flex-1">
                <Field label="Procurement Mode">
                  <Input value={mode} readonly />
                </Field>
              </View>
            </View>
          </View>
        </Card>

        {/* Abstract of Awards table */}
        <ItemsAbstract items={liveItems as any} suppliers={suppliers} />
        <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
          <TouchableOpacity
            onPress={() => setPreviewOpen(true)}
            activeOpacity={0.85}
            className="items-center justify-center bg-emerald-600 rounded-xl py-3">
            <Text className="text-white text-[13px] font-extrabold">
              Preview / Print Abstract
            </Text>
          </TouchableOpacity>
        </View>

        {isSubmitted && (
          <CompletedBanner
            label={`AAA No. ${aaaNo} prepared. Forwarded to Supply.`}
            onResubmit={handleResubmit}
          />
        )}

        {/* Minimal footer only */}

        <StepNav
          stage="aaa_preparation"
          done={new Set(isSubmitted ? ["aaa_preparation"] : [])}
          onPrev={() => onBack?.()}
          onNext={() => {}}
          canSubmit={!isSubmitted && !!aaaNo}
          submitLabel="Finalize & Forward to Supply →"
          onSubmit={handleSubmit}
        />
      </ScrollView>
      <AAAPreviewModal
        visible={previewOpen}
        html={buildPreviewHTML()}
        onClose={() => setPreviewOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}
