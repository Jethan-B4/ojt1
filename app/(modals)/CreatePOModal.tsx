/**
 * CreatePOModal.tsx — Create Purchase Order Modal
 *
 * Fields match the Appendix 61 PO template:
 *   Header   : Supplier, Address, TIN, Mode of Procurement,
 *              Place of Delivery, Delivery Term,
 *              Date of Delivery, Payment Term, PO No., Date
 *   ORS      : Fund Cluster, ORS No., Date of ORS, Funds Available, ORS Amount
 *   Items    : Stock/Property No., Unit, Description, Quantity, Unit Cost
 *   Signatories: Authorized Official, Chief Accountant
 *
 * Only accessible to Supply role (role_id = 8) — enforced by POModule.
 * After a successful save the real DB row is passed back via onCreated.
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import POPreviewPanel, {
  buildPOHtml,
  toWords,
  usePOPreviewActions,
  type POPreviewData,
} from "../(components)/POPreviewPanel";
import {
  insertPurchaseOrder,
  type POItemRow,
  type PORow,
} from "../../lib/supabase/po";
import { fetchPRIdByNo, fetchPurchaseRequests } from "../../lib/supabase/pr";

// ─── Exported types ───────────────────────────────────────────────────────────

/** Payload returned to POModule after a successful create. Matches PORow shape. */
export type POCreatePayload = PORow;

interface CreatePOModalProps {
  visible: boolean;
  onClose: () => void;
  /** Called with the real DB row after a successful insert. */
  onCreated: (row: POCreatePayload) => void;
  divisionId?: number | null;
}

// ─── PR suggestion row ────────────────────────────────────────────────────────

interface PRSuggestion {
  id: string;
  pr_no: string;
  office_section: string | null;
  purpose: string | null;
  total_cost: number | null;
  fund_cluster: string | null;
  app_name: string | null;
  app_desig: string | null;
  /** status_id from public.status — only PRs at 11 (AAA Issuance) are eligible */
  status_id: number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const fmt = (n: number) =>
  n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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

// ─── Item row ─────────────────────────────────────────────────────────────────

function ItemRow({
  item,
  index,
  onChange,
  onRemove,
}: {
  item: POItemRow;
  index: number;
  onChange: (i: number, f: keyof POItemRow, v: string) => void;
  onRemove: (i: number) => void;
}) {
  const amount = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
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
        <FieldLabel>Stock / Property No.</FieldLabel>
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
            value={String(item.quantity || "")}
            onChangeText={(v) => onChange(index, "quantity", v)}
            placeholder="0"
            placeholderTextColor="#9ca3af"
            keyboardType="numeric"
            mono
          />
        </View>
        <View style={{ flex: 1.4 }}>
          <FieldLabel required>Unit Cost</FieldLabel>
          <StyledInput
            value={String(item.unit_price || "")}
            onChangeText={(v) => onChange(index, "unit_price", v)}
            placeholder="0.00"
            placeholderTextColor="#9ca3af"
            keyboardType="decimal-pad"
            mono
          />
        </View>
      </View>

      <View className="flex-row justify-end items-center gap-1.5">
        <Text className="text-[11px] text-gray-400">Amount</Text>
        <Text
          className="text-[13px] font-bold text-[#064E3B]"
          style={{ fontFamily: MONO }}
        >
          ₱{fmt(amount)}
        </Text>
      </View>
    </View>
  );
}

// ─── PR Picker Modal ──────────────────────────────────────────────────────────

function PRPickerModal({
  visible,
  suggestions,
  loading,
  onSelect,
  onDismiss,
}: {
  visible: boolean;
  suggestions: PRSuggestion[];
  loading: boolean;
  onSelect: (pr: PRSuggestion) => void;
  onDismiss: () => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suggestions;
    return suggestions.filter(
      (pr) =>
        pr.pr_no.toLowerCase().includes(q) ||
        (pr.office_section ?? "").toLowerCase().includes(q) ||
        (pr.purpose ?? "").toLowerCase().includes(q),
    );
  }, [query, suggestions]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      transparent={false}
    >
      <SafeAreaView className="flex-1 bg-white">
        <View className="bg-[#064E3B] px-5 pt-5 pb-4">
          <View className="flex-row items-center justify-between mb-3">
            <View>
              <Text className="text-[10px] font-bold tracking-widest uppercase text-white/40">
                Select a Purchase Request
              </Text>
              <Text className="text-[16px] font-black text-white mt-0.5">
                Link PR to this PO
              </Text>
              <View className="flex-row items-center gap-1.5 mt-1.5 bg-white/10 self-start rounded-full px-2.5 py-0.5">
                <View className="w-1.5 h-1.5 rounded-full bg-amber-300" />
                <Text className="text-[10.5px] font-bold text-white/70">
                  AAA Issuance (status 11) only
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onDismiss}
              hitSlop={10}
              className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center"
            >
              <Text className="text-white text-[20px] leading-none font-light">
                ×
              </Text>
            </TouchableOpacity>
          </View>
          <View className="flex-row items-center bg-white/10 rounded-[10px] px-3 gap-2">
            <MaterialIcons
              name="search"
              size={16}
              color="rgba(255,255,255,0.5)"
            />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by PR No., section, purpose…"
              placeholderTextColor="rgba(255,255,255,0.35)"
              className="flex-1 py-2.5 text-sm text-white"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery("")} hitSlop={6}>
                <MaterialIcons
                  name="close"
                  size={14}
                  color="rgba(255,255,255,0.5)"
                />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center gap-3">
            <ActivityIndicator size="large" color="#064E3B" />
            <Text className="text-[13px] text-gray-400">
              Loading purchase requests…
            </Text>
          </View>
        ) : filtered.length === 0 ? (
          <View className="flex-1 items-center justify-center gap-2 px-8">
            <MaterialIcons name="inbox" size={36} color="#d1d5db" />
            <Text className="text-[13px] font-semibold text-gray-500 text-center">
              {query ? "No PRs match your search." : "No eligible PRs found."}
            </Text>
            {!query && (
              <Text className="text-[11.5px] text-gray-400 text-center leading-5">
                Only PRs at{" "}
                <Text className="font-bold text-amber-600">AAA Issuance</Text>{" "}
                (status 11) can be linked to a PO. Ask BAC to complete the AAA
                step first.
              </Text>
            )}
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
            ItemSeparatorComponent={() => <View className="h-2" />}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => onSelect(item)}
                activeOpacity={0.75}
                className="bg-white border border-gray-200 rounded-xl p-3.5 gap-1"
                style={{ elevation: 1 }}
              >
                <View className="flex-row items-center justify-between gap-2">
                  <View className="bg-[#064E3B]/10 rounded-lg px-2.5 py-1">
                    <Text
                      className="text-[12px] font-black text-[#064E3B]"
                      style={{ fontFamily: MONO }}
                    >
                      {item.pr_no}
                    </Text>
                  </View>
                  {item.office_section ? (
                    <Text
                      className="text-[11px] text-gray-400 flex-1 text-right"
                      numberOfLines={1}
                    >
                      {item.office_section}
                    </Text>
                  ) : null}
                </View>
                {item.purpose ? (
                  <Text
                    className="text-[12.5px] text-gray-700 mt-0.5"
                    numberOfLines={2}
                  >
                    {item.purpose}
                  </Text>
                ) : null}
                <View className="flex-row items-center justify-between mt-1">
                  {item.total_cost != null ? (
                    <Text
                      className="text-[11.5px] font-bold text-[#064E3B]"
                      style={{ fontFamily: MONO }}
                    >
                      ₱{fmt(item.total_cost)}
                    </Text>
                  ) : (
                    <View />
                  )}
                  {item.fund_cluster ? (
                    <Text className="text-[10px] text-gray-400">
                      {item.fund_cluster}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ─── PR Input Method Prompt ───────────────────────────────────────────────────

function PRInputMethodSheet({
  visible,
  onChooseFromDB,
  onEnterManually,
  onCancel,
}: {
  visible: boolean;
  onChooseFromDB: () => void;
  onEnterManually: () => void;
  onCancel: () => void;
}) {
  if (!visible) return null;
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View className="flex-1 bg-black/40 items-center justify-end">
        <View className="bg-white rounded-t-3xl w-full px-5 pt-6 pb-8">
          <View className="w-10 h-1 bg-gray-200 rounded-full self-center mb-5" />
          <Text className="text-[15px] font-black text-gray-800 mb-1">
            Link a Purchase Request
          </Text>
          <Text className="text-[12.5px] text-gray-400 mb-5 leading-5">
            A PR No. is required for every Purchase Order.{"\n"}
            How would you like to provide it?
          </Text>

          <TouchableOpacity
            onPress={onChooseFromDB}
            activeOpacity={0.8}
            className="flex-row items-center gap-3.5 bg-[#064E3B] rounded-2xl px-4 py-4 mb-3"
          >
            <View className="w-9 h-9 rounded-xl bg-white/10 items-center justify-center">
              <MaterialIcons name="list-alt" size={19} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="text-[13px] font-bold text-white">
                Choose from Database
              </Text>
              <Text className="text-[11px] text-white/60 mt-0.5">
                Browse approved PRs and auto-fill details
              </Text>
            </View>
            <MaterialIcons
              name="chevron-right"
              size={18}
              color="rgba(255,255,255,0.5)"
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onEnterManually}
            activeOpacity={0.8}
            className="flex-row items-center gap-3.5 bg-gray-100 rounded-2xl px-4 py-4 mb-3"
          >
            <View className="w-9 h-9 rounded-xl bg-gray-200 items-center justify-center">
              <MaterialIcons name="edit" size={19} color="#374151" />
            </View>
            <View className="flex-1">
              <Text className="text-[13px] font-bold text-gray-800">
                Enter PR No. Manually
              </Text>
              <Text className="text-[11px] text-gray-400 mt-0.5">
                Type the PR number and fill in all details
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={18} color="#9ca3af" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onCancel}
            activeOpacity={0.7}
            className="items-center py-3"
          >
            <Text className="text-[13px] font-bold text-gray-400">Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── CreatePOModal ────────────────────────────────────────────────────────────

export default function CreatePOModal({
  visible,
  onClose,
  onCreated,
  divisionId,
}: CreatePOModalProps) {
  const [tab, setTab] = useState<"create" | "preview">("create");

  type Stage = "prompt" | "picker" | "form";
  const [stage, setStage] = useState<Stage>("prompt");
  const [prSuggestions, setPrSuggestions] = useState<PRSuggestion[]>([]);
  const [prLoadingDB, setPrLoadingDB] = useState(false);
  const [linkedPrNo, setLinkedPrNo] = useState<string | null>(null);
  /** The purchase_requests.id of the PR chosen from DB — stored as pr_id on insert */
  const [linkedPrId, setLinkedPrId] = useState<string | null>(null);

  // ── PO header fields ────────────────────────────────────────────────────
  const [poNo, setPoNo] = useState("");
  const [prNo, setPrNo] = useState("");
  const [supplier, setSupplier] = useState("");
  const [address, setAddress] = useState("");
  const [tin, setTin] = useState("");
  const [procurementMode, setProcurementMode] = useState("");
  const [deliveryPlace, setDeliveryPlace] = useState("");
  const [deliveryTerm, setDeliveryTerm] = useState("");
  const [dateOfDelivery, setDateOfDelivery] = useState("");
  const [paymentTerm, setPaymentTerm] = useState("");
  const [date, setDate] = useState(
    new Date().toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
  );
  const [officeSection, setOfficeSection] = useState("");

  // ── ORS / Funds fields ──────────────────────────────────────────────────
  const [fundCluster, setFundCluster] = useState("");
  const [orsNo, setOrsNo] = useState("");
  const [orsDate, setOrsDate] = useState("");
  const [fundsAvailable, setFundsAvailable] = useState("");
  const [orsAmount, setOrsAmount] = useState("");

  // ── Signatories ─────────────────────────────────────────────────────────
  const [officialName, setOfficialName] = useState("");
  const [officialDesig, setOfficialDesig] = useState("");
  const [accountantName, setAccountantName] = useState("");
  const [accountantDesig, setAccountantDesig] = useState("");

  // ── Line items ──────────────────────────────────────────────────────────
  const [items, setItems] = useState<POItemRow[]>([]);

  // ── UI state ────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalAmount = items.reduce(
    (s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0),
    0,
  );

  // Reset to prompt stage whenever the modal opens
  useEffect(() => {
    if (visible) {
      setStage("prompt");
      setLinkedPrNo(null);
    }
  }, [visible]);

  // ── PR picker handlers ──────────────────────────────────────────────────

  const handleChooseFromDB = async () => {
    setPrLoadingDB(true);
    setStage("picker");
    try {
      const rows = await fetchPurchaseRequests();
      // Only PRs at status_id 11 (AAA Issuance) are eligible to be linked to a PO
      const eligible = (rows ?? []).filter(
        (r: any) => Number(r.status_id) === 11,
      );
      setPrSuggestions(
        eligible.map((r: any) => ({
          id: String(r.id),
          pr_no: r.pr_no ?? "",
          office_section: r.office_section ?? null,
          purpose: r.purpose ?? null,
          total_cost: r.total_cost ?? null,
          fund_cluster: r.fund_cluster ?? null,
          app_name: r.app_name ?? null,
          app_desig: r.app_desig ?? null,
          status_id: Number(r.status_id) ?? null,
        })),
      );
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not load purchase requests.");
      setStage("prompt");
    } finally {
      setPrLoadingDB(false);
    }
  };

  const handleSelectPR = (pr: PRSuggestion) => {
    setPrNo(pr.pr_no);
    setLinkedPrNo(pr.pr_no);
    setLinkedPrId(pr.id); // ← store the DB id for pr_id FK on insert
    if (pr.office_section) setOfficeSection(pr.office_section);
    if (pr.fund_cluster) setFundCluster(pr.fund_cluster);
    if (pr.app_name) setOfficialName(pr.app_name);
    if (pr.app_desig) setOfficialDesig(pr.app_desig);
    setStage("form");
  };

  const handleEnterManually = () => {
    setLinkedPrNo(null);
    setLinkedPrId(null);
    setStage("form");
  };

  // ── Item helpers ────────────────────────────────────────────────────────

  const handleItemChange = (
    index: number,
    field: keyof POItemRow,
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

  // ── Preview data ────────────────────────────────────────────────────────

  const previewData: POPreviewData = useMemo(
    () => ({
      poNo,
      prNo,
      supplier,
      address,
      tin,
      procurementMode,
      deliveryPlace,
      deliveryTerm,
      dateOfDelivery,
      paymentTerm,
      date,
      officeSection,
      fundCluster,
      orsNo,
      orsDate,
      fundsAvailable,
      orsAmount: Number(orsAmount) || 0,
      totalAmount,
      officialName,
      officialDesig,
      accountantName,
      accountantDesig,
      items: items.map((it) => ({
        stock_no: it.stock_no ?? null,
        unit: it.unit,
        description: it.description,
        quantity: Number(it.quantity) || 0,
        unit_price: Number(it.unit_price) || 0,
        subtotal: (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
      })),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      poNo,
      prNo,
      supplier,
      address,
      tin,
      procurementMode,
      deliveryPlace,
      deliveryTerm,
      dateOfDelivery,
      paymentTerm,
      date,
      officeSection,
      fundCluster,
      orsNo,
      orsDate,
      fundsAvailable,
      orsAmount,
      totalAmount,
      officialName,
      officialDesig,
      accountantName,
      accountantDesig,
      items,
    ],
  );

  const previewHtml = useMemo(() => buildPOHtml(previewData), [previewData]);
  const { handlePrint, handleDownload } = usePOPreviewActions(previewHtml);

  // ── Save ────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!prNo.trim()) return setError("PR Number is required.");
    if (!supplier.trim()) return setError("Supplier is required.");
    if (!poNo.trim()) return setError("PO Number is required.");
    if (!items.length) return setError("At least one line item is required.");
    if (items.some((it) => !it.description.trim() || !it.unit.trim()))
      return setError("All items must have a description and unit.");

    setSaving(true);
    setError(null);

    try {
      // If entered manually (linkedPrId is null), try to resolve the ID from DB
      let finalPrId = linkedPrId;
      if (!finalPrId && prNo.trim()) {
        finalPrId = await fetchPRIdByNo(prNo.trim());
      }

      const lineItems = items.map((it) => ({
        stock_no: it.stock_no ?? null,
        unit: it.unit,
        description: it.description,
        quantity: Number(it.quantity) || 0,
        unit_price: Number(it.unit_price) || 0,
        subtotal: (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
      }));

      const inserted = await insertPurchaseOrder(
        {
          po_no: poNo || null,
          pr_no: prNo || null,
          pr_id: finalPrId ?? null, // ← Resolved ID
          supplier: supplier || null,
          address: address || null,
          tin: tin || null,
          procurement_mode: procurementMode || null,
          delivery_place: deliveryPlace || null,
          delivery_term: deliveryTerm || null,
          delivery_date: dateOfDelivery || null,
          payment_term: paymentTerm || null,
          date: date || null,
          office_section: officeSection || null,
          fund_cluster: fundCluster || null,
          ors_no: orsNo || null,
          ors_date: orsDate || null,
          funds_available: fundsAvailable || null,
          ors_amount: Number(orsAmount) || null,
          total_amount: totalAmount,
          status_id: 12,
          division_id: divisionId ?? null,
          official_name: officialName || null,
          official_desig: officialDesig || null,
          accountant_name: accountantName || null,
          accountant_desig: accountantDesig || null,
        },
        lineItems,
      );
      onCreated(inserted);
      onClose();
      resetForm();
    } catch (e: any) {
      setError(e.message ?? "Failed to create PO.");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setTab("create");
    setStage("prompt");
    setLinkedPrNo(null);
    setLinkedPrId(null);
    setPoNo("");
    setPrNo("");
    setSupplier("");
    setAddress("");
    setTin("");
    setProcurementMode("");
    setDeliveryPlace("");
    setDeliveryTerm("");
    setDateOfDelivery("");
    setPaymentTerm("");
    setOfficeSection("");
    setFundCluster("");
    setOrsNo("");
    setOrsDate("");
    setFundsAvailable("");
    setOrsAmount("");
    setOfficialName("");
    setOfficialDesig("");
    setAccountantName("");
    setAccountantDesig("");
    setItems([]);
    setError(null);
  };

  if (!visible) return null;

  return (
    <>
      {/* Step 1: Input-method prompt */}
      <PRInputMethodSheet
        visible={stage === "prompt"}
        onChooseFromDB={handleChooseFromDB}
        onEnterManually={handleEnterManually}
        onCancel={() => {
          resetForm();
          onClose();
        }}
      />

      {/* Step 2: PR database picker */}
      <PRPickerModal
        visible={stage === "picker"}
        suggestions={prSuggestions}
        loading={prLoadingDB}
        onSelect={handleSelectPR}
        onDismiss={() => setStage("prompt")}
      />

      {/* Step 3: Main PO form */}
      <Modal
        visible={stage === "form"}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView className="flex-1 bg-white">
          {/* ── Header ── */}
          <View className="bg-[#064E3B] px-5 pt-5 pb-0">
            <View className="flex-row items-start justify-between mb-4">
              <View className="flex-1 pr-3">
                <Text className="text-[10px] font-bold tracking-widest uppercase text-white/40">
                  New Purchase Order
                </Text>
                <Text
                  className="text-[18px] font-black text-white mt-0.5"
                  style={{ fontFamily: MONO }}
                >
                  {poNo || "PO-XXXX"}
                </Text>
                {linkedPrNo ? (
                  <View className="flex-row items-center gap-1.5 mt-1">
                    <MaterialIcons
                      name="link"
                      size={11}
                      color="rgba(255,255,255,0.5)"
                    />
                    <Text className="text-[11px] text-white/50">
                      Linked to {linkedPrNo}
                    </Text>
                  </View>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={() => {
                  resetForm();
                  onClose();
                }}
                hitSlop={10}
                className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center"
              >
                <Text className="text-white text-[20px] leading-none font-light">
                  ×
                </Text>
              </TouchableOpacity>
            </View>

            {/* Tab toggle */}
            <View className="flex-row bg-black/20 rounded-xl p-1 mb-0">
              {(["create", "preview"] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setTab(t)}
                  activeOpacity={0.8}
                  className={`flex-1 py-2 rounded-lg items-center ${tab === t ? "bg-white" : ""}`}
                >
                  <Text
                    className={`text-[12.5px] font-bold ${tab === t ? "text-[#064E3B]" : "text-white/50"}`}
                  >
                    {t === "create" ? "Create" : "Preview"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Error banner */}
          {error ? (
            <View className="mx-4 mt-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 flex-row items-center gap-2">
              <MaterialIcons name="error-outline" size={15} color="#dc2626" />
              <Text className="text-[12.5px] text-red-600 flex-1">{error}</Text>
              <TouchableOpacity onPress={() => setError(null)} hitSlop={6}>
                <MaterialIcons name="close" size={14} color="#dc2626" />
              </TouchableOpacity>
            </View>
          ) : null}

          {tab === "preview" ? (
            <POPreviewPanel
              html={previewHtml}
              showActions
              onPrint={handlePrint}
              onDownload={handleDownload}
            />
          ) : (
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={{ flex: 1 }}
            >
              <View style={{ flex: 1 }}>
                <ScrollView
                  className="flex-1 px-5"
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingTop: 16, paddingBottom: 12 }}
                >
                  {/* ── PO Identification ── */}
                  <SectionLabel>PO Identification</SectionLabel>
                  <View className="flex-row gap-2.5 mb-3.5">
                    <View className="flex-1">
                      <FieldLabel required>PO No.</FieldLabel>
                      <StyledInput
                        value={poNo}
                        onChangeText={setPoNo}
                        placeholder="PO-2025-001"
                        placeholderTextColor="#9ca3af"
                        mono
                      />
                    </View>
                    <View className="flex-1">
                      <FieldLabel required>PR No.</FieldLabel>
                      <View className="flex-row items-center gap-1.5">
                        <View className="flex-1">
                          <StyledInput
                            value={prNo}
                            onChangeText={setPrNo}
                            placeholder="PR-2025-001"
                            placeholderTextColor="#9ca3af"
                            mono
                          />
                        </View>
                        <TouchableOpacity
                          onPress={handleChooseFromDB}
                          className="w-9 h-9 rounded-[10px] bg-[#064E3B]/10 items-center justify-center"
                        >
                          <MaterialIcons
                            name="list-alt"
                            size={16}
                            color="#064E3B"
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                  <View className="flex-row gap-2.5 mb-3.5">
                    <View className="flex-1">
                      <FieldLabel>Date</FieldLabel>
                      <StyledInput
                        value={date}
                        onChangeText={setDate}
                        placeholder="January 1, 2025"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                    <View className="flex-1">
                      <FieldLabel>Office / Section</FieldLabel>
                      <StyledInput
                        value={officeSection}
                        onChangeText={setOfficeSection}
                        placeholder="e.g. Finance Division"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                  </View>

                  <Divider />

                  {/* ── Supplier Details ── */}
                  <SectionLabel>Supplier Details</SectionLabel>
                  <View className="mb-3.5">
                    <FieldLabel required>Supplier Name</FieldLabel>
                    <StyledInput
                      value={supplier}
                      onChangeText={setSupplier}
                      placeholder="Business / company name"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                  <View className="mb-3.5">
                    <FieldLabel>Address</FieldLabel>
                    <StyledInput
                      value={address}
                      onChangeText={setAddress}
                      placeholder="Street, City, Province"
                      placeholderTextColor="#9ca3af"
                      multiline
                      style={{ minHeight: 52, textAlignVertical: "top" }}
                    />
                  </View>
                  <View className="flex-row gap-2.5 mb-3.5">
                    <View className="flex-1">
                      <FieldLabel>TIN</FieldLabel>
                      <StyledInput
                        value={tin}
                        onChangeText={setTin}
                        placeholder="000-000-000"
                        placeholderTextColor="#9ca3af"
                        keyboardType="numeric"
                        mono
                      />
                    </View>
                    <View className="flex-1">
                      <FieldLabel>Mode of Procurement</FieldLabel>
                      <StyledInput
                        value={procurementMode}
                        onChangeText={setProcurementMode}
                        placeholder="Public Bidding…"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                  </View>

                  <Divider />

                  {/* ── Delivery ── */}
                  <SectionLabel>Delivery</SectionLabel>
                  <View className="flex-row gap-2.5 mb-3.5">
                    <View className="flex-1">
                      <FieldLabel>Place of Delivery</FieldLabel>
                      <StyledInput
                        value={deliveryPlace}
                        onChangeText={setDeliveryPlace}
                        placeholder="Address / warehouse"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                    <View className="flex-1">
                      <FieldLabel>Delivery Term</FieldLabel>
                      <StyledInput
                        value={deliveryTerm}
                        onChangeText={setDeliveryTerm}
                        placeholder="30 days, FOB…"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                  </View>
                  <View className="flex-row gap-2.5 mb-3.5">
                    <View className="flex-1">
                      <FieldLabel>Date of Delivery</FieldLabel>
                      <StyledInput
                        value={dateOfDelivery}
                        onChangeText={setDateOfDelivery}
                        placeholder="February 15, 2025"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                    <View className="flex-1">
                      <FieldLabel>Payment Term</FieldLabel>
                      <StyledInput
                        value={paymentTerm}
                        onChangeText={setPaymentTerm}
                        placeholder="30 days, COD…"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                  </View>

                  <Divider />

                  {/* ── ORS / Funds ── */}
                  <SectionLabel>ORS &amp; Funds</SectionLabel>
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
                      <FieldLabel>ORS No.</FieldLabel>
                      <StyledInput
                        value={orsNo}
                        onChangeText={setOrsNo}
                        placeholder="ORS-2025-001"
                        placeholderTextColor="#9ca3af"
                        mono
                      />
                    </View>
                  </View>
                  <View className="flex-row gap-2.5 mb-3.5">
                    <View className="flex-1">
                      <FieldLabel>Date of ORS</FieldLabel>
                      <StyledInput
                        value={orsDate}
                        onChangeText={setOrsDate}
                        placeholder="January 10, 2025"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                    <View className="flex-1">
                      <FieldLabel>ORS Amount</FieldLabel>
                      <StyledInput
                        value={orsAmount}
                        onChangeText={setOrsAmount}
                        placeholder="0.00"
                        placeholderTextColor="#9ca3af"
                        keyboardType="decimal-pad"
                        mono
                      />
                    </View>
                  </View>
                  <View className="mb-3.5">
                    <FieldLabel>Funds Available</FieldLabel>
                    <StyledInput
                      value={fundsAvailable}
                      onChangeText={setFundsAvailable}
                      placeholder="Yes / No / Partial"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>

                  <Divider />

                  {/* ── Signatories ── */}
                  <SectionLabel>Signatories</SectionLabel>
                  <View className="flex-row gap-2.5 mb-3.5">
                    <View className="flex-1">
                      <FieldLabel>Authorized Official</FieldLabel>
                      <StyledInput
                        value={officialName}
                        onChangeText={setOfficialName}
                        placeholder="Full name"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                    <View className="flex-1">
                      <FieldLabel>Designation</FieldLabel>
                      <StyledInput
                        value={officialDesig}
                        onChangeText={setOfficialDesig}
                        placeholder="Title"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                  </View>
                  <View className="flex-row gap-2.5 mb-3.5">
                    <View className="flex-1">
                      <FieldLabel>Chief Accountant</FieldLabel>
                      <StyledInput
                        value={accountantName}
                        onChangeText={setAccountantName}
                        placeholder="Full name"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                    <View className="flex-1">
                      <FieldLabel>Designation</FieldLabel>
                      <StyledInput
                        value={accountantDesig}
                        onChangeText={setAccountantDesig}
                        placeholder="Title"
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

                  {/* Total bar */}
                  <View className="bg-[#064E3B] rounded-2xl px-5 py-4 flex-row items-center justify-between mt-1 mb-1.5">
                    <View>
                      <Text className="text-[11px] font-bold uppercase tracking-widest text-white/50">
                        Total Amount
                      </Text>
                      <Text
                        className="text-[9px] text-white/30 mt-0.5"
                        numberOfLines={2}
                        style={{ maxWidth: 180 }}
                      >
                        {toWords(totalAmount)}
                      </Text>
                    </View>
                    <Text
                      className="text-[20px] font-black text-white"
                      style={{ fontFamily: MONO }}
                    >
                      ₱{fmt(totalAmount)}
                    </Text>
                  </View>
                </ScrollView>

                {/* Footer */}
                <View className="px-5 py-3.5 flex-row gap-2.5 border-t border-gray-100 bg-white">
                  <TouchableOpacity
                    onPress={() => {
                      resetForm();
                      onClose();
                    }}
                    className="flex-1 bg-gray-100 rounded-[10px] py-3 items-center"
                  >
                    <Text className="text-sm font-bold text-gray-500">
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSave}
                    disabled={saving}
                    className={`flex-[2] rounded-[10px] py-3 flex-row items-center justify-center gap-2 ${saving ? "bg-gray-400" : "bg-[#064E3B]"}`}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <MaterialIcons name="add" size={16} color="#fff" />
                    )}
                    <Text className="text-sm font-bold text-white">
                      {saving ? "Creating…" : "Create PO"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          )}
        </SafeAreaView>
      </Modal>

      {/* Re-render PR picker when tapped from within the form */}
      <PRPickerModal
        visible={stage === "picker" && prSuggestions.length > 0}
        suggestions={prSuggestions}
        loading={prLoadingDB}
        onSelect={handleSelectPR}
        onDismiss={() => setStage("form")}
      />
    </>
  );
}
