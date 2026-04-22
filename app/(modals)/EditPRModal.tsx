/**
 * EditPRModal.tsx — Edit Purchase Request Modal
 *
 * Two-tab layout (Edit | Preview) matching ViewPRModal's tab pattern.
 * The Preview tab renders a live WebView of the PR form using the same
 * buildPRHtml() function as ViewPRModal, so what you see = what prints.
 *
 * Styles: NativeWind (className). Inline style= kept only for:
 *   - fontFamily (no Tailwind equivalent in RN)
 *   - elevation (Android-only, no Tailwind equivalent)
 *   - runtime hex colors from STATUS_CONFIG
 *   - minHeight / textAlignVertical (RN-specific)
 *   - flex: 1.4 (Tailwind only supports integer flex)
 */

import {
  fetchPRWithItemsById,
  updatePurchaseRequest,
  type PRItemRow,
} from "@/lib/supabase";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
import WebView from "react-native-webview";

// ─── Exported types ───────────────────────────────────────────────────────────

export interface PREditRecord {
  id: string;
  prNo: string;
}

export interface PREditPayload {
  id: string;
  officeSection: string;
  purpose: string;
  totalCost: number;
  items: Array<{
    stock_no?: string | null;
    unit: string;
    description: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
}

interface EditPRModalProps {
  visible: boolean;
  record: PREditRecord | null;
  onClose: () => void;
  onSave: (payload: PREditPayload) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const fmt = (n: number) =>
  n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// ─── PR HTML builder (mirrors ViewPRModal's buildPRHtml exactly) ──────────────

function buildPRHtml(fields: {
  prNo: string;
  officeSection: string;
  purpose: string;
  date: string;
  entityName: string;
  fundCluster: string;
  respCode: string;
  reqName: string;
  reqDesig: string;
  appName: string;
  appDesig: string;
  items: PRItemRow[];
}): string {
  const fmtNum = (n: number) =>
    n.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const padded = [...fields.items];
  while (padded.length < 30)
    padded.push({
      stock_no: null,
      unit: "",
      description: "",
      quantity: 0,
      unit_price: 0,
      subtotal: 0,
    });

  const rows = padded
    .map((it) => {
      const qty = Number(it.quantity) || 0;
      const price = Number(it.unit_price) || 0;
      const total = qty * price;
      return `<tr>
      <td style="border:1px solid black;font-size:8pt;padding:1px 3px;text-align:center;font-family:'Times New Roman',serif;height:16px">${it.stock_no || ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:1px 3px;text-align:center;font-family:'Times New Roman',serif">${it.unit || ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:1px 4px;text-align:left;font-family:'Times New Roman',serif">${it.description || ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:1px 3px;text-align:center;font-family:'Times New Roman',serif">${qty || ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:1px 3px;text-align:right;font-family:'Times New Roman',serif">${price ? fmtNum(price) : ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:1px 3px;text-align:right;font-family:'Times New Roman',serif">${total > 0 ? fmtNum(total) : ""}</td>
    </tr>`;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Times New Roman',Times,serif;font-size:9pt;color:#000;background:#fff;padding:24px}table{width:100%;border-collapse:collapse;table-layout:fixed;color:#000}@media print{body{padding:10mm}@page{margin:8mm}}</style>
</head><body>
<table>
  <colgroup>
    <col style="width:12%"/><col style="width:8%"/><col style="width:40%"/>
    <col style="width:10%"/><col style="width:15%"/><col style="width:15%"/>
  </colgroup>
  <tbody>
    <tr style="height:27px"><td colspan="6" style="text-align:right;font-size:10pt;padding-right:4px;font-family:'Times New Roman',serif">Appendix 60</td></tr>
    <tr style="height:34px"><td colspan="6" style="text-align:center;font-weight:bold;font-size:12pt;font-family:'Times New Roman',serif">PURCHASE REQUEST</td></tr>
    <tr style="height:21px">
      <td colspan="2" style="border-bottom:1px solid black;font-size:8pt;padding:2px 4px;font-family:'Times New Roman',serif;font-weight:bold">Entity Name: <span style="font-weight:normal">${fields.entityName || "DAR — CARAGA Region"}</span></td>
      <td style="border-bottom:1px solid black"></td>
      <td colspan="3" style="border-bottom:1px solid black;font-size:8pt;padding:2px 4px;font-family:'Times New Roman',serif;font-weight:bold">Fund Cluster: <span style="font-weight:normal">${fields.fundCluster || ""}</span></td>
    </tr>
    <tr style="height:14px">
      <td rowspan="2" colspan="2" style="border:1px solid black;font-size:8pt;vertical-align:top;padding:2px 4px;font-family:'Times New Roman',serif">Office/Section:<br/>${fields.officeSection || ""}</td>
      <td colspan="2" style="border-top:1px solid black;border-left:1px solid black;border-right:1px solid black;font-size:8pt;font-weight:bold;padding:2px 4px;font-family:'Times New Roman',serif">PR No.: <span style="font-weight:normal">${fields.prNo || ""}</span></td>
      <td rowspan="2" colspan="2" style="border:1px solid black;font-size:8pt;font-weight:bold;vertical-align:top;padding:2px 4px;font-family:'Times New Roman',serif">Date:<br/><span style="font-weight:normal">${fields.date}</span></td>
    </tr>
    <tr style="height:15px">
      <td colspan="2" style="border-bottom:1px solid black;border-left:1px solid black;font-size:8pt;font-weight:bold;padding:2px 4px;font-family:'Times New Roman',serif">Responsibility Center Code: <span style="font-weight:normal">${fields.respCode || ""}</span></td>
    </tr>
    <tr style="height:22.5px">
      <th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;text-align:center;font-weight:bold">Stock/Property No.</th>
      <th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;text-align:center;font-weight:bold">Unit</th>
      <th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;text-align:center;font-weight:bold">Item Description</th>
      <th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;text-align:center;font-weight:bold">Quantity</th>
      <th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;text-align:center;font-weight:bold">Unit Cost</th>
      <th style="border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',serif;text-align:center;font-weight:bold">Total Cost</th>
    </tr>
    ${rows}
    <tr style="height:17px"><td colspan="6" style="border-top:1px solid black;border-left:1px solid black;border-right:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif"><b>Purpose:</b> ${fields.purpose || ""}</td></tr>
    <tr style="height:30px"><td colspan="6" style="border-bottom:1px solid black;border-left:1px solid black;border-right:1px solid black"></td></tr>
    <tr style="height:12px">
      <td style="border-top:1px solid black;border-left:1px solid black"></td>
      <td colspan="2" style="border-top:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif"><i>Requested by:</i></td>
      <td colspan="2" style="border-top:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif"><i>Approved by:</i></td>
      <td style="border-top:1px solid black;border-right:1px solid black"></td>
    </tr>
    <tr style="height:12px">
      <td colspan="2" style="border-left:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif">Signature:</td>
      <td></td><td></td><td></td>
      <td style="border-right:1px solid black"></td>
    </tr>
    <tr style="height:12px">
      <td colspan="2" style="border-left:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif">Printed Name:</td>
      <td style="font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif">${fields.reqName || ""}</td>
      <td colspan="2" style="font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif">${fields.appName || ""}</td>
      <td style="border-right:1px solid black"></td>
    </tr>
    <tr style="height:14.75px">
      <td colspan="2" style="border-bottom:1px solid black;border-left:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif">Designation:</td>
      <td style="border-bottom:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif">${fields.reqDesig || ""}</td>
      <td colspan="2" style="border-bottom:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif">${fields.appDesig || ""}</td>
      <td style="border-bottom:1px solid black;border-right:1px solid black"></td>
    </tr>
  </tbody>
</table>
</body></html>`;
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">
      {children}
    </Text>
  );
}

function FieldLabel({
  children,
  required,
}: {
  children: string;
  required?: boolean;
}) {
  return (
    <Text className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
      {children}
      {required && <Text className="text-red-500"> *</Text>}
    </Text>
  );
}

function Divider() {
  return <View className="h-px bg-gray-100 my-1.5 mb-3.5" />;
}

function StyledInput(
  props: React.ComponentProps<typeof TextInput> & { mono?: boolean },
) {
  const { mono, style, ...rest } = props;
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...rest}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      className={`bg-gray-50 rounded-[10px] border px-3 py-2.5 text-sm text-gray-900 ${
        focused ? "border-[#064E3B]" : "border-gray-200"
      }`}
      style={[mono ? { fontFamily: MONO } : {}, style ?? {}]}
    />
  );
}

// ─── ItemRow ──────────────────────────────────────────────────────────────────

function ItemRow({
  item,
  index,
  onChange,
  onRemove,
}: {
  item: PRItemRow;
  index: number;
  onChange: (i: number, f: keyof PRItemRow, v: string) => void;
  onRemove: (i: number) => void;
}) {
  const subtotal =
    (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
  return (
    <View className="bg-gray-50 border border-gray-200 rounded-[10px] p-3 mb-2.5 gap-2">
      <View className="flex-row items-center justify-between mb-0.5">
        <Text className="text-[11px] font-bold text-gray-500">
          ITEM {index + 1}
        </Text>
        <TouchableOpacity
          onPress={() => onRemove(index)}
          hitSlop={8}
          className="w-6 h-6 rounded-md bg-red-50 items-center justify-center"
        >
          <MaterialIcons name="close" size={14} color="#dc2626" />
        </TouchableOpacity>
      </View>

      <View>
        <FieldLabel>Stock No.</FieldLabel>
        <StyledInput
          value={item.stock_no ?? ""}
          onChangeText={(v) => onChange(index, "stock_no", v)}
          placeholder="Optional"
          placeholderTextColor="#9ca3af"
          mono
        />
      </View>

      <View>
        <FieldLabel required>Description</FieldLabel>
        <StyledInput
          value={item.description}
          onChangeText={(v) => onChange(index, "description", v)}
          placeholder="Item description"
          placeholderTextColor="#9ca3af"
          multiline
          style={{ minHeight: 60, textAlignVertical: "top" }}
        />
      </View>

      <View className="flex-row gap-2">
        <View className="flex-1">
          <FieldLabel required>Unit</FieldLabel>
          <StyledInput
            value={item.unit}
            onChangeText={(v) => onChange(index, "unit", v)}
            placeholder="pcs"
            placeholderTextColor="#9ca3af"
          />
        </View>
        <View className="flex-1">
          <FieldLabel required>Qty</FieldLabel>
          <StyledInput
            value={String(item.quantity ?? "")}
            onChangeText={(v) => onChange(index, "quantity", v)}
            placeholder="0"
            placeholderTextColor="#9ca3af"
            keyboardType="numeric"
            mono
          />
        </View>
        <View style={{ flex: 1.4 }}>
          <FieldLabel required>Unit Price</FieldLabel>
          <StyledInput
            value={String(item.unit_price ?? "")}
            onChangeText={(v) => onChange(index, "unit_price", v)}
            placeholder="0.00"
            placeholderTextColor="#9ca3af"
            keyboardType="decimal-pad"
            mono
          />
        </View>
      </View>

      <View className="flex-row justify-end items-center gap-1.5">
        <Text className="text-[11px] text-gray-400">Subtotal</Text>
        <Text
          className="text-[13px] font-bold text-[#064E3B]"
          style={{ fontFamily: MONO }}
        >
          ₱{fmt(subtotal)}
        </Text>
      </View>
    </View>
  );
}

// ─── EditPRModal ──────────────────────────────────────────────────────────────

export default function EditPRModal({
  visible,
  record,
  onClose,
  onSave,
}: EditPRModalProps) {
  const [tab, setTab] = useState<"edit" | "preview">("edit");

  // Form fields
  const [officeSection, setOfficeSection] = useState("");
  const [purpose, setPurpose] = useState("");
  const [entityName, setEntityName] = useState("");
  const [fundCluster, setFundCluster] = useState("");
  const [respCode, setRespCode] = useState("");
  const [reqName, setReqName] = useState("");
  const [reqDesig, setReqDesig] = useState("");
  const [appName, setAppName] = useState("");
  const [appDesig, setAppDesig] = useState("");
  const [items, setItems] = useState<PRItemRow[]>([]);
  const [prDate, setPrDate] = useState("");

  // UI state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomLevel] = useState(0.5);
  const webRef = useRef<WebView>(null);

  // Fetch full PR on open
  useEffect(() => {
    if (!visible || !record) return;
    setTab("edit");
    setLoading(true);
    setError(null);
    fetchPRWithItemsById(record.id)
      .then(({ header, items: rows }) => {
        setOfficeSection(header.office_section ?? "");
        setPurpose(header.purpose ?? "");
        setEntityName(header.entity_name ?? "");
        setFundCluster(header.fund_cluster ?? "");
        setRespCode(header.resp_code ?? "");
        setReqName(header.req_name ?? "");
        setReqDesig(header.req_desig ?? "");
        setAppName(header.app_name ?? "");
        setAppDesig(header.app_desig ?? "");
        setPrDate(
          header.created_at
            ? new Date(header.created_at).toLocaleDateString("en-PH", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : new Date().toLocaleDateString("en-PH", {
                year: "numeric",
                month: "long",
                day: "numeric",
              }),
        );
        setItems(
          (rows ?? []).map((i: any) => ({
            id: i.id,
            pr_id: i.pr_id,
            stock_no: i.stock_no ?? null,
            unit: i.unit ?? "",
            description: i.description ?? "",
            quantity: Number(i.quantity) || 0,
            unit_price: Number(i.unit_price) || 0,
            subtotal: Number(i.subtotal) || 0,
          })),
        );
      })
      .catch((e: any) => setError(e.message ?? "Failed to load PR."))
      .finally(() => setLoading(false));
  }, [visible, record]);

  useEffect(() => {
    if (tab === "preview" && webRef.current) {
      setTimeout(() => {
        webRef.current?.injectJavaScript(`document.body.style.zoom = '${zoomLevel}'`);
      }, 100);
    }
  }, [tab, zoomLevel]);

  // Item helpers
  const handleItemChange = (
    index: number,
    field: keyof PRItemRow,
    value: string,
  ) =>
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const next = { ...item, [field]: value };
        if (field === "quantity" || field === "unit_price") {
          next.subtotal =
            (Number(field === "quantity" ? value : next.quantity) || 0) *
            (Number(field === "unit_price" ? value : next.unit_price) || 0);
        }
        return next;
      }),
    );

  const handleAddItem = () =>
    setItems((p) => [
      ...p,
      {
        stock_no: null,
        unit: "",
        description: "",
        quantity: 0,
        unit_price: 0,
        subtotal: 0,
      },
    ]);

  const handleRemoveItem = (index: number) =>
    setItems((p) => p.filter((_, i) => i !== index));

  const totalCost = items.reduce(
    (s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0),
    0,
  );

  // Live HTML for preview tab — recomputed whenever any field changes
  const previewHtml = useMemo(
    () =>
      buildPRHtml({
        prNo: record?.prNo ?? "",
        officeSection,
        purpose,
        date: prDate,
        entityName,
        fundCluster,
        respCode,
        reqName,
        reqDesig,
        appName,
        appDesig,
        items,
      }),
    [
      record?.prNo,
      officeSection,
      purpose,
      prDate,
      entityName,
      fundCluster,
      respCode,
      reqName,
      reqDesig,
      appName,
      appDesig,
      items,
    ],
  );

  // PDF actions (same as ViewPRModal)
  const handlePrint = async () => {
    try {
      await Print.printAsync({ html: previewHtml });
    } catch {}
  };
  const handleDownload = async () => {
    try {
      const { uri } = await Print.printToFileAsync({ html: previewHtml });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare)
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
        });
      else Alert.alert("Saved", `PDF saved at: ${uri}`);
    } catch (e: any) {
      Alert.alert("Download failed", e?.message ?? String(e));
    }
  };

  // Validate & save
  const handleSave = async () => {
    if (!record) return;
    if (!officeSection.trim()) return setError("Office / Section is required.");
    if (!purpose.trim()) return setError("Purpose is required.");
    if (!items.length) return setError("At least one line item is required.");
    if (items.some((it) => !it.description.trim() || !it.unit.trim()))
      return setError("All items must have a description and unit.");

    setSaving(true);
    setError(null);
    const normalized = items.map((it) => ({
      stock_no: it.stock_no ?? null,
      unit: it.unit,
      description: it.description,
      quantity: Number(it.quantity) || 0,
      unit_price: Number(it.unit_price) || 0,
      subtotal: (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
    }));

    try {
      await updatePurchaseRequest(
        record.id,
        {
          office_section: officeSection,
          purpose,
          total_cost: totalCost,
          entity_name: entityName || null,
          fund_cluster: fundCluster || null,
          resp_code: respCode || null,
          req_name: reqName || null,
          req_desig: reqDesig || null,
          app_name: appName || null,
          app_desig: appDesig || null,
        },
        normalized,
      );
      onSave({
        id: record.id,
        officeSection,
        purpose,
        totalCost,
        items: normalized,
      });
      onClose();
    } catch (e: any) {
      setError(e.message ?? "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  if (!visible || !record) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView className="flex-1 bg-white">
        {/* ── Header (matches ViewPRModal header structure) ── */}
        <View className="bg-[#064E3B] px-5 pt-5 pb-0">
          <View className="flex-row items-start justify-between mb-4">
            <View className="flex-1 pr-3">
              <Text className="text-[10px] font-bold tracking-widest uppercase text-white/40">
                Edit Purchase Request
              </Text>
              <Text
                className="text-[18px] font-black text-white mt-0.5"
                style={{ fontFamily: MONO }}
              >
                {record.prNo}
              </Text>
              {officeSection ? (
                <Text className="text-[11.5px] text-white/60 mt-0.5">
                  {officeSection}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={10}
              className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center"
            >
              <Text className="text-white text-[20px] leading-none font-light">
                ×
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab toggle (mirrors ViewPRModal's tab row exactly) */}
          <View className="flex-row bg-black/20 rounded-xl p-1">
            {(["edit", "preview"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setTab(t)}
                activeOpacity={0.8}
                className={`flex-1 py-2 rounded-lg items-center ${tab === t ? "bg-white" : ""}`}
              >
                <Text
                  className={`text-[12.5px] font-bold ${tab === t ? "text-[#064E3B]" : "text-white/50"}`}
                >
                  {t === "edit" ? "Edit" : "Preview"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* PDF actions — visible on preview tab only */}
          {tab === "preview" && (
            <View className="flex-row justify-end gap-2.5 pt-2 pb-1">
              <TouchableOpacity
                onPress={handlePrint}
                activeOpacity={0.8}
                className="px-3.5 py-2 rounded-xl bg-white/10 border border-white/20"
              >
                <Text className="text-[12px] font-bold text-white">Print</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDownload}
                activeOpacity={0.8}
                className="px-3.5 py-2 rounded-xl bg-white"
              >
                <Text className="text-[12px] font-bold text-[#064E3B]">
                  Download PDF
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── Body ── */}
        {loading ? (
          <View className="flex-1 items-center justify-center gap-3">
            <ActivityIndicator size="large" color="#064E3B" />
            <Text className="text-[13px] text-gray-400">
              Loading PR details…
            </Text>
          </View>
        ) : tab === "preview" ? (
          /* ── Preview tab: live WebView (same as ViewPRModal) ── */
          <WebView
            ref={webRef}
            source={{ html: previewHtml }}
            style={{ flex: 1 }}
            originWhitelist={["*"]}
            showsVerticalScrollIndicator={false}
            onLoad={() => {
              setTimeout(() => {
                webRef.current?.injectJavaScript(`document.body.style.zoom = '${zoomLevel}'`);
              }, 100);
            }}
          />
        ) : (
          /* ── Edit tab ── */
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1"
          >
            <View className="flex-1">
              <ScrollView
                className="flex-1"
                contentContainerStyle={{
                  paddingHorizontal: 20,
                  paddingTop: 20,
                  paddingBottom: 16,
                }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Error banner */}
                {error && (
                  <View className="bg-red-50 border border-red-200 rounded-[10px] px-3 py-2.5 mb-4 flex-row items-center gap-2">
                    <MaterialIcons
                      name="error-outline"
                      size={15}
                      color="#dc2626"
                    />
                    <Text className="text-red-600 text-[12.5px] flex-1">
                      {error}
                    </Text>
                  </View>
                )}

                {/* ── Request Details ── */}
                <SectionLabel>Request Details</SectionLabel>
                <View className="mb-3.5">
                  <FieldLabel required>Office / Section</FieldLabel>
                  <StyledInput
                    value={officeSection}
                    readOnly
                    onChangeText={setOfficeSection}
                    placeholder="e.g. Finance Division"
                    placeholderTextColor="#9ca3af"
                  />
                </View>
                <View className="mb-3.5">
                  <FieldLabel required>Purpose</FieldLabel>
                  <StyledInput
                    value={purpose}
                    onChangeText={setPurpose}
                    placeholder="Purpose of the request"
                    placeholderTextColor="#9ca3af"
                    multiline
                    style={{ minHeight: 70, textAlignVertical: "top" }}
                  />
                </View>

                <Divider />

                {/* ── Administrative Fields ── */}
                <SectionLabel>Administrative</SectionLabel>
                <View className="mb-3.5">
                  <FieldLabel>Entity Name</FieldLabel>
                  <StyledInput
                    value={entityName}
                    onChangeText={setEntityName}
                    placeholder="DAR — CARAGA Region"
                    placeholderTextColor="#9ca3af"
                  />
                </View>
                <View className="flex-row gap-2.5 mb-3.5">
                  <View className="flex-1">
                    <FieldLabel>Fund Cluster</FieldLabel>
                    <StyledInput
                      value={fundCluster}
                      onChangeText={setFundCluster}
                      placeholder="—"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                  <View className="flex-1">
                    <FieldLabel>Resp. Code</FieldLabel>
                    <StyledInput
                      value={respCode}
                      onChangeText={setRespCode}
                      placeholder="—"
                      placeholderTextColor="#9ca3af"
                      mono
                    />
                  </View>
                </View>

                <Divider />

                {/* ── Signatories ── */}
                <SectionLabel>Signatories</SectionLabel>
                <View className="flex-row gap-2.5 mb-3.5">
                  <View className="flex-1">
                    <FieldLabel>Requested By</FieldLabel>
                    <StyledInput
                      value={reqName}
                      onChangeText={setReqName}
                      placeholder="Full name"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                  <View className="flex-1">
                    <FieldLabel>Designation</FieldLabel>
                    <StyledInput
                      value={reqDesig}
                      onChangeText={setReqDesig}
                      placeholder="Title / position"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                </View>
                <View className="flex-row gap-2.5 mb-3.5">
                  <View className="flex-1">
                    <FieldLabel>Approved By</FieldLabel>
                    <StyledInput
                      value={appName}
                      onChangeText={setAppName}
                      placeholder="Full name"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                  <View className="flex-1">
                    <FieldLabel>Designation</FieldLabel>
                    <StyledInput
                      value={appDesig}
                      onChangeText={setAppDesig}
                      placeholder="Title / position"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                </View>

                <Divider />

                {/* ── Line Items ── */}
                <View className="flex-row items-center justify-between mb-2.5">
                  <SectionLabel>{`Line Items (${items.length})`}</SectionLabel>
                  <TouchableOpacity
                    onPress={handleAddItem}
                    className="flex-row items-center gap-1 bg-emerald-50 rounded-lg px-2.5 py-1.5"
                  >
                    <MaterialIcons name="add" size={14} color="#064E3B" />
                    <Text className="text-[11.5px] font-bold text-[#064E3B]">
                      Add Item
                    </Text>
                  </TouchableOpacity>
                </View>

                {items.map((item, idx) => (
                  <ItemRow
                    key={idx}
                    item={item}
                    index={idx}
                    onChange={handleItemChange}
                    onRemove={handleRemoveItem}
                  />
                ))}

                {!items.length && (
                  <View
                    className="items-center py-6 bg-gray-50 rounded-[10px] border border-gray-200 mb-3.5"
                    style={{ borderStyle: "dashed" }}
                  >
                    <Text className="text-gray-400 text-[13px]">
                      No items yet — tap Add Item
                    </Text>
                  </View>
                )}

                {/* Total */}
                <View className="bg-[#064E3B] rounded-2xl px-5 py-4 flex-row items-center justify-between mt-1 mb-1.5">
                  <Text className="text-[11px] font-bold uppercase tracking-widest text-white/50">
                    Total Cost
                  </Text>
                  <Text
                    className="text-[20px] font-black text-white"
                    style={{ fontFamily: MONO }}
                  >
                    ₱{fmt(totalCost)}
                  </Text>
                </View>
              </ScrollView>

              {/* ── Footer ── */}
              <View className="px-5 py-3.5 flex-row gap-2.5 border-t border-gray-100 bg-white">
                <TouchableOpacity
                  onPress={onClose}
                  className="flex-1 bg-gray-100 rounded-[10px] py-3 items-center"
                >
                  <Text className="text-sm font-bold text-gray-500">
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSave}
                  disabled={saving}
                  className={`flex-[2] rounded-[10px] py-3 flex-row items-center justify-center gap-2 ${
                    saving ? "bg-gray-400" : "bg-[#064E3B]"
                  }`}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MaterialIcons name="check" size={16} color="#fff" />
                  )}
                  <Text className="text-sm font-bold text-white">
                    {saving ? "Saving…" : "Save Changes"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </Modal>
  );
}
