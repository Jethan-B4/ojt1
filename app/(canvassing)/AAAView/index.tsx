/**
 * AAAView — Step 10: Abstract of Price Quotations preparation.
 *
 * Input fields mirror the sample DAR document:
 *   • Top-right reference block  → BAC No. (read-only), PR No. (read-only),
 *                                   Resolution No. (read-only), Date (today, read-only)
 *   • AAA No.                    → editable, required
 *   • Particulars / Job Order    → editable — the description text shown as the
 *                                   first row in the abstract table
 *
 * Abstract table (read-only, built from canvass_entries):
 *   ITEM NO. | QTY | UNIT | PARTICULARS | [Supplier 1] | [Supplier 2] | [Supplier 3]
 *   Lowest price per item is auto-marked as winner.
 *   BAC can tap any price cell to manually override the winner.
 *
 * On submit: upserts the aaa_documents row and advances PR status to 11.
 */

import {
  CANVASS_PR_STATUS,
  fetchAAAForSession,
  fetchBACResolutionForSession,
  fetchCanvassSessionById,
  fetchPRIdByNo,
  fetchPRWithItemsById,
  fetchQuotesForSession,
  setItemWinningSupplier,
  updateCanvassSessionMeta,
  updatePRStatus,
  upsertAAAForSession,
} from "@/lib/supabase";
import type { CanvassingPR, CanvassingPRItem } from "@/types/canvassing";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { AAAPreviewData } from "../../(components)/AAAPreview";
import { buildAAAPreviewHTML } from "../../(components)/AAAPreview";
import AAAPreviewModal from "../../(modals)/AAAPreviewModal";
import { useAuth } from "../../AuthContext";
import { CompletedBanner, StepHeader, StepNav } from "../BACView/components";
import { MONO } from "../BACView/constants";
import { Banner, Card, Divider, Field, Input } from "../BACView/ui";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AAAViewProps {
  sessionId:    string;
  pr:           CanvassingPR;
  bacNo:        string;
  resolutionNo: string;
  mode:         string;
  onComplete?:  (payload: any) => void;
  onBack?:      () => void;
}

interface EntryRow {
  item_no:       number;
  supplier_name: string;
  unit_price:    number;
  is_winning?:   boolean | null;
}

// ─── Atoms ────────────────────────────────────────────────────────────────────

const MONO_FONT = Platform.OS === "ios" ? "Courier New" : "monospace";

const fmt = (n: number) =>
  n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Abstract table (native, read-only + winner toggle) ───────────────────────

function AbstractTable({
  items,
  suppliers,
  entries,
  sessionId,
  onWinnerChanged,
}: {
  items:          CanvassingPRItem[];
  suppliers:      string[];
  entries:        EntryRow[];
  sessionId:      string;
  onWinnerChanged: () => void;
}) {
  if (suppliers.length === 0 || items.length === 0) {
    return (
      <View className="items-center py-8 bg-white rounded-2xl border border-dashed border-gray-300 mb-3">
        <MaterialIcons name="pending" size={28} color="#d1d5db" />
        <Text className="text-[12.5px] text-gray-400 mt-2 text-center px-6">
          No quotations have been submitted yet.{"\n"}The abstract will appear once canvassers return their forms.
        </Text>
      </View>
    );
  }

  const priceFor = (itemId: number, supplier: string) =>
    entries.find((e) => e.item_no === itemId && e.supplier_name === supplier)?.unit_price ?? 0;

  const winnerFor = (itemId: number): string => {
    // Prefer DB-flagged winner; fall back to lowest price
    const dbWinner = entries.find((e) => e.item_no === itemId && e.is_winning === true);
    if (dbWinner) return dbWinner.supplier_name;
    const byItem = entries.filter((e) => e.item_no === itemId && e.unit_price > 0);
    if (byItem.length === 0) return "";
    return byItem.reduce((b, e) => (e.unit_price < b.unit_price ? e : b)).supplier_name;
  };

  const handleToggleWinner = async (itemId: number, supplier: string) => {
    try {
      await setItemWinningSupplier(sessionId, itemId, supplier);
      onWinnerChanged();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not update winner");
    }
  };

  // Column widths (flex values)
  const FLEX = { item: 0.4, qty: 0.4, unit: 0.7, desc: 2 };
  const supplierFlex = 1;

  return (
    <Card>
      <View className="px-3 pt-3 pb-3">
        <Divider label="Abstract of Price Quotations" />

        {/* Scrollable horizontal table */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            {/* "NAME OF DEALERS" spanning header */}
            <View className="flex-row">
              <View style={{ width: 200 }} />
              <View
                className="border border-gray-300 bg-gray-100 items-center py-1"
                style={{ width: suppliers.length * 100 }}
              >
                <Text className="text-[9px] font-bold uppercase tracking-widest text-gray-600">
                  Name of Dealers
                </Text>
              </View>
            </View>

            {/* Column headers */}
            <View className="flex-row bg-[#064E3B]">
              {[
                { label: "No.",   w: 32 },
                { label: "Qty",   w: 36 },
                { label: "Unit",  w: 52 },
                { label: "Particulars", w: 180 },
              ].map((col) => (
                <View key={col.label}
                  className="items-center justify-center py-1.5 border-r border-white/20"
                  style={{ width: col.w }}>
                  <Text className="text-[8px] font-bold uppercase text-white/80 text-center">
                    {col.label}
                  </Text>
                </View>
              ))}
              {suppliers.map((s, i) => (
                <View key={s}
                  className={`items-center justify-center py-1.5 ${i < suppliers.length - 1 ? "border-r border-white/20" : ""}`}
                  style={{ width: 100 }}>
                  <Text className="text-[7.5px] font-bold text-white/80 text-center px-1" numberOfLines={2}>
                    {s}
                  </Text>
                </View>
              ))}
            </View>

            {/* Item rows */}
            {items.map((item, rowIdx) => {
              const winner = winnerFor(item.id);
              return (
                <View
                  key={item.id}
                  className={`flex-row ${rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
                  style={{ borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}
                >
                  <View className="items-center justify-center border-r border-gray-200" style={{ width: 32 }}>
                    <Text className="text-[10px] text-gray-500" style={{ fontFamily: MONO_FONT }}>
                      {rowIdx + 1}
                    </Text>
                  </View>
                  <View className="items-center justify-center border-r border-gray-200 px-1" style={{ width: 36 }}>
                    <Text className="text-[10px] text-gray-700" style={{ fontFamily: MONO_FONT }}>
                      {item.qty}
                    </Text>
                  </View>
                  <View className="items-center justify-center border-r border-gray-200 px-1" style={{ width: 52 }}>
                    <Text className="text-[10px] text-gray-500 text-center">{item.unit}</Text>
                  </View>
                  <View className="justify-center border-r border-gray-200 px-2 py-1.5" style={{ width: 180 }}>
                    <Text className="text-[10.5px] text-gray-700 leading-[14px]" numberOfLines={3}>
                      {item.desc}
                    </Text>
                  </View>
                  {suppliers.map((s, i) => {
                    const price = priceFor(item.id, s);
                    const isWin = winner === s && price > 0;
                    return (
                      <TouchableOpacity
                        key={s}
                        onPress={() => price > 0 ? handleToggleWinner(item.id, s) : undefined}
                        activeOpacity={price > 0 ? 0.7 : 1}
                        className={`items-end justify-center px-2 py-1.5 ${
                          isWin ? "bg-emerald-50" : ""
                        } ${i < suppliers.length - 1 ? "border-r border-gray-200" : ""}`}
                        style={{ width: 100 }}
                      >
                        <Text
                          className={`text-[10px] ${isWin ? "font-bold text-emerald-700" : "text-gray-700"}`}
                          style={{ fontFamily: MONO_FONT }}
                        >
                          {price > 0 ? fmt(price) : "—"}
                        </Text>
                        {isWin && (
                          <Text className="text-[9px] font-bold text-emerald-600 mt-0.5">✓</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}

            {/* Totals row */}
            <View className="flex-row bg-emerald-50" style={{ borderTopWidth: 2, borderTopColor: "#bbf7d0" }}>
              <View style={{ width: 32 + 36 + 52 }} />
              <View className="justify-center px-2 py-2 border-r border-gray-200" style={{ width: 180 }}>
                <Text className="text-[9px] font-bold uppercase text-emerald-800 text-right">
                  Total
                </Text>
              </View>
              {suppliers.map((s, i) => {
                const total = items.reduce((sum, item) => sum + priceFor(item.id, s) * item.qty, 0);
                return (
                  <View
                    key={s}
                    className={`items-end justify-center px-2 py-2 ${i < suppliers.length - 1 ? "border-r border-gray-200" : ""}`}
                    style={{ width: 100 }}
                  >
                    <Text className="text-[10.5px] font-bold text-emerald-800" style={{ fontFamily: MONO_FONT }}>
                      {total > 0 ? fmt(total) : "—"}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>

        {/* Tap-to-mark hint */}
        {suppliers.length > 1 && (
          <View className="flex-row items-center gap-1.5 mt-2.5 px-1">
            <MaterialIcons name="touch-app" size={12} color="#9ca3af" />
            <Text className="text-[10px] text-gray-400">
              Tap a price cell to manually mark it as the winner for that item.
            </Text>
          </View>
        )}
      </View>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AAAView({
  sessionId,
  pr,
  bacNo: bacNoProp,
  resolutionNo: resolutionNoProp,
  mode: modeProp,
  onComplete,
  onBack,
}: AAAViewProps) {
  const { currentUser } = useAuth();

  // ── Editable fields ─────────────────────────────────────────────────────────
  const [aaaNo,       setAaaNo]       = useState("");
  const [particulars, setParticulars] = useState("");

  // ── Read-only reference fields (hydrated from DB) ───────────────────────────
  const [bacNo,       setBacNo]       = useState(bacNoProp);
  const [resolutionNo, setResolutionNo] = useState(resolutionNoProp);
  const [date,        setDate]        = useState(new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" }));
  const [office,      setOffice]      = useState(pr.officeSection);

  // ── Data state ──────────────────────────────────────────────────────────────
  const [liveItems,  setLiveItems]  = useState<CanvassingPRItem[]>((pr.items as any) ?? []);
  const [entries,    setEntries]    = useState<EntryRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // ── Load all data ────────────────────────────────────────────────────────────
  const loadEntries = useCallback(async () => {
    const rows = await fetchQuotesForSession(sessionId);
    setEntries(rows.map((r) => ({
      item_no:       r.item_no,
      supplier_name: r.supplier_name ?? "",
      unit_price:    r.unit_price ?? 0,
      is_winning:    r.is_winning ?? null,
    })));
  }, [sessionId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // PR items
        const prId = await fetchPRIdByNo(pr.prNo);
        if (prId) {
          const { header: h, items } = await fetchPRWithItemsById(prId);
          setOffice(h.office_section ?? pr.officeSection);
          setDate(
            h.created_at
              ? new Date(h.created_at).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })
              : date,
          );
          setLiveItems(items.map((i: any) => ({
            id:       parseInt(String(i.id)),
            desc:     i.description,
            stock:    i.stock_no,
            unit:     i.unit,
            qty:      i.quantity,
            unitCost: i.unit_price,
          })));
        }

        // Session meta
        const sess = await fetchCanvassSessionById(sessionId);
        if (sess?.bac_no) setBacNo(sess.bac_no);

        // Resolution
        const res = await fetchBACResolutionForSession(sessionId);
        if (res?.resolution_no) setResolutionNo(res.resolution_no);

        // Existing AAA doc
        const aaa = await fetchAAAForSession(sessionId);
        if (aaa?.aaa_no) {
          setAaaNo(aaa.aaa_no);
          setIsSubmitted(true);
        }
        if (aaa?.particulars) setParticulars(aaa.particulars);

        // Quotes
        await loadEntries();
      } catch {
        // silently fall back to props
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId, pr.prNo]);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const suppliers = useMemo(
    () => [...new Set(entries.map((e) => e.supplier_name).filter(Boolean))].slice(0, 3),
    [entries],
  );

  const winnerFor = (itemId: number): string => {
    const dbWinner = entries.find((e) => e.item_no === itemId && e.is_winning === true);
    if (dbWinner) return dbWinner.supplier_name;
    const byItem = entries.filter((e) => e.item_no === itemId && e.unit_price > 0);
    if (byItem.length === 0) return "";
    return byItem.reduce((b, e) => (e.unit_price < b.unit_price ? e : b)).supplier_name;
  };

  const priceFor = (itemId: number, supplier: string) =>
    entries.find((e) => e.item_no === itemId && e.supplier_name === supplier)?.unit_price ?? 0;

  // ── Submit ────────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!sessionId || !aaaNo.trim()) return;
    try {
      const prId = await fetchPRIdByNo(pr.prNo);
      if (!prId) throw new Error("PR not found");

      await upsertAAAForSession(sessionId, {
        aaa_no:      aaaNo.trim(),
        particulars: particulars.trim() || null,
        prepared_by: currentUser?.id ?? 0,
        prepared_at: new Date().toISOString(),
        file_url:    null,
      });

      await updateCanvassSessionMeta(sessionId, { status: "closed" });
      await updatePRStatus(prId, CANVASS_PR_STATUS.aaa_preparation);

      setIsSubmitted(true);

      onComplete?.({
        pr_no:          pr.prNo,
        bac_no:         bacNo,
        resolution_no:  resolutionNo,
        aaa_no:         aaaNo,
      });

      Alert.alert("✅ Canvassing Complete", "Abstract of Awards recorded. Forward to Supply Section.");
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? "Could not record AAA");
    }
  }, [sessionId, pr.prNo, aaaNo, particulars, currentUser?.id, bacNo, resolutionNo, onComplete]);

  // ── Preview data ──────────────────────────────────────────────────────────────
  const buildPreviewData = (): AAAPreviewData => ({
    bacNo,
    prNo:         pr.prNo,
    resolutionNo,
    date,
    office,
    particulars:  particulars.trim(),
    suppliers,
    rows: liveItems.map((item, idx) => {
      const prices: Record<string, number> = {};
      suppliers.forEach((s) => { prices[s] = priceFor(item.id, s); });
      return {
        itemNo: idx + 1,
        qty:    item.qty,
        unit:   item.unit,
        desc:   item.desc,
        prices,
        winner: winnerFor(item.id) || null,
      };
    }),
  });

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-gray-50">
        <ActivityIndicator size="large" color="#064E3B" />
        <Text className="text-[12px] text-gray-400">Loading AAA data…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-gray-50"
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <StepHeader
          stage="aaa_preparation"
          title="Abstract of Price Quotations"
          desc="Prepare the AAA and finalize the canvassing process."
        />

        {/* ── Reference block (top-right on printed form) ── */}
        <Card>
          <View className="px-4 pt-3 pb-3">
            <Divider label="Document References" />
            {/* Row 1: BAC No + Resolution No */}
            <View className="flex-row gap-2.5">
              <View className="flex-1">
                <Field label="BAC No.">
                  <Input value={bacNo} readonly />
                </Field>
              </View>
              <View className="flex-1">
                <Field label="Resolution No.">
                  <Input value={resolutionNo} readonly />
                </Field>
              </View>
            </View>
            {/* Row 2: PR No + Date */}
            <View className="flex-row gap-2.5">
              <View className="flex-1">
                <Field label="PR No.">
                  <Input value={pr.prNo} readonly />
                </Field>
              </View>
              <View className="flex-1">
                <Field label="Date">
                  <Input value={date} readonly />
                </Field>
              </View>
            </View>
          </View>
        </Card>

        {/* ── AAA Number (the only required editable field) ── */}
        <Card>
          <View className="px-4 pt-3 pb-3">
            <Divider label="AAA Details" />
            <Field label="AAA No." required>
              <Input
                value={aaaNo}
                onChange={setAaaNo}
                placeholder="e.g. 2025-08-390"
              />
            </Field>
            {/* Particulars = job order description shown in the abstract table */}
            <Field label="Particulars / Job Order Description">
              <View
                style={{
                  borderWidth: 1.5,
                  borderColor: "#e5e7eb",
                  borderRadius: 12,
                  minHeight: 80,
                  backgroundColor: "#fff",
                  padding: 10,
                }}
              >
                <TextInput
                  value={particulars}
                  onChangeText={setParticulars}
                  placeholder={
                    "e.g. REQUEST FOR SUPPLY, LABOR AND MATERIALS OF THE NETHOUSE INSTALLATION FOR SPFARBA'S PILI NURSERY ESTABLISHMENT..."
                  }
                  placeholderTextColor="#9ca3af"
                  multiline
                  textAlignVertical="top"
                  style={{ fontSize: 13, color: "#111827", lineHeight: 20 }}
                />
              </View>
              <Text className="text-[10px] text-gray-400 mt-1 px-1">
                This text appears as the Job Order row at the top of the abstract table.
              </Text>
            </Field>
          </View>
        </Card>

        {/* ── Abstract table ── */}
        <AbstractTable
          items={liveItems}
          suppliers={suppliers}
          entries={entries}
          sessionId={sessionId}
          onWinnerChanged={loadEntries}
        />

        {/* ── Preview / Print button ── */}
        {suppliers.length > 0 && (
          <TouchableOpacity
            onPress={() => setPreviewOpen(true)}
            activeOpacity={0.8}
            className="flex-row items-center justify-center gap-2 bg-[#064E3B] rounded-2xl py-3 mb-3"
          >
            <MaterialIcons name="description" size={16} color="#fff" />
            <Text className="text-[13px] font-bold text-white">
              Preview / Print Abstract
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Completed state ── */}
        {isSubmitted && (
          <CompletedBanner
            label={`AAA No. ${aaaNo} prepared. Forwarded to Supply.`}
            onResubmit={() => setIsSubmitted(false)}
          />
        )}

        {/* ── Submit nav ── */}
        <StepNav
          stage="aaa_preparation"
          done={new Set(isSubmitted ? (["aaa_preparation"] as any) : [])}
          onPrev={() => onBack?.()}
          onNext={() => {}}
          canSubmit={!isSubmitted && !!aaaNo.trim()}
          submitLabel="Finalize & Forward to Supply →"
          onSubmit={handleSubmit}
        />
      </ScrollView>

      {/* ── Preview modal ── */}
      <AAAPreviewModal
        visible={previewOpen}
        html={buildAAAPreviewHTML(buildPreviewData())}
        aaaNo={aaaNo || "—"}
        prNo={pr.prNo}
        date={date}
        office={office}
        onClose={() => setPreviewOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}