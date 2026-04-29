/**
 * CreatePOModal.tsx — Create Purchase Order Modal
 *
 * Field layout mirrors EditPOModal (Appendix 61). Inserts purchase_orders +
 * purchase_order_items and returns the inserted PORow to POModule.
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
    type POPreviewData,
} from "../(components)/POPreviewPanel";
import CalendarPickerModal from "../(modals)/CalendarModal";
import {
    insertPurchaseOrder,
    type POInsertPayload,
    type POItemRow,
    type PORow,
} from "../../lib/supabase/po";
import {
    fetchPRIdByNo,
    fetchPRWithItemsById,
    fetchPurchaseRequests,
} from "../../lib/supabase/pr";

export type POCreatePayload = PORow;

interface CreatePOModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated: (row: POCreatePayload) => void;
  divisionId: number | null;
}

interface PRSuggestion {
  id: string;
  pr_no: string;
  office_section: string | null;
  purpose: string | null;
  total_cost: number | null;
  fund_cluster: string | null;
  app_name: string | null;
  app_desig: string | null;
}

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const fmt = (n: number) =>
  n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function normalizeDateString(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (!Number.isNaN(d.getTime())) return formatDate(d);
  return dateStr;
}

function StyledInput({
  mono,
  style,
  ...props
}: React.ComponentProps<typeof TextInput> & {
  mono?: boolean;
  style?: any;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...props}
      autoCapitalize={props.autoCapitalize ?? "none"}
      autoCorrect={props.autoCorrect ?? false}
      spellCheck={props.spellCheck ?? false}
      placeholderTextColor="#9ca3af"
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

function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="text-[11px] font-bold text-gray-500 mb-1">{children}</Text>
  );
}

function DatePickerButton({
  value,
  onChange,
  placeholder = "Select date…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
        className="bg-gray-50 rounded-[10px] border border-gray-200 px-3 py-2.5 flex-row items-center justify-between"
        style={{ minHeight: 42 }}
      >
        <Text
          className="text-sm flex-1 mr-2"
          style={{ color: value ? "#111827" : "#9ca3af" }}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
        <MaterialIcons name="calendar-today" size={15} color="#064E3B" />
      </TouchableOpacity>
      <CalendarPickerModal
        visible={open}
        onClose={() => setOpen(false)}
        onSelectDate={(date) => {
          onChange(formatDate(date));
          setOpen(false);
        }}
      />
    </>
  );
}

function PRPicker({
  open,
  onOpen,
  prNo,
  suggestions,
  loading,
  onSelect,
  onClose,
}: {
  open: boolean;
  onOpen: () => void;
  prNo: string;
  suggestions: PRSuggestion[];
  loading: boolean;
  onSelect: (pr: PRSuggestion) => void;
  onClose: () => void;
}) {
  return (
    <>
      <TouchableOpacity
        onPress={onOpen}
        activeOpacity={0.85}
        className="bg-gray-50 rounded-[10px] border border-gray-200 px-3 py-2.5 flex-row items-center justify-between"
      >
        <Text
          className="text-sm font-semibold text-gray-800"
          style={{ fontFamily: MONO }}
        >
          {prNo || "Select PR…"}
        </Text>
        <MaterialIcons name="search" size={16} color="#6b7280" />
      </TouchableOpacity>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
      >
        <SafeAreaView className="flex-1 bg-white">
          <View className="px-5 pt-4 pb-3 border-b border-gray-100 flex-row items-center justify-between">
            <View>
              <Text className="text-[12px] font-bold text-gray-400">
                Select Purchase Request
              </Text>
              <Text className="text-[15px] font-extrabold text-gray-900">
                Link this PO to a PR
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={10}
              className="w-8 h-8 rounded-xl bg-gray-100 items-center justify-center"
            >
              <MaterialIcons name="close" size={18} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
              <Text className="text-[12px] text-gray-400 mt-2">
                Loading PRs…
              </Text>
            </View>
          ) : (
            <FlatList
              data={suggestions}
              keyExtractor={(i) => i.id}
              contentContainerStyle={{ padding: 16 }}
              ItemSeparatorComponent={() => <View className="h-2" />}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => onSelect(item)}
                  activeOpacity={0.85}
                  className="rounded-2xl border border-gray-200 bg-white px-4 py-3"
                >
                  <View className="flex-row items-center justify-between">
                    <Text
                      className="text-[13px] font-extrabold text-gray-900"
                      style={{ fontFamily: MONO }}
                    >
                      {item.pr_no}
                    </Text>
                    <Text
                      className="text-[11px] font-bold text-emerald-700"
                      style={{ fontFamily: MONO }}
                    >
                      <Text>₱</Text>
                      {fmt(Number(item.total_cost) || 0)}
                    </Text>
                  </View>
                  {!!item.office_section && (
                    <Text
                      className="text-[11px] text-gray-500 mt-1"
                      numberOfLines={1}
                    >
                      {item.office_section}
                    </Text>
                  )}
                  {!!item.purpose && (
                    <Text
                      className="text-[11px] text-gray-400 mt-0.5"
                      numberOfLines={2}
                    >
                      {item.purpose}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}

export default function CreatePOModal({
  visible,
  onClose,
  onCreated,
  divisionId,
}: CreatePOModalProps) {
  const [tab, setTab] = useState<"create" | "preview">("create");
  const [saving, setSaving] = useState(false);

  const [prNo, setPrNo] = useState("");
  const [linkedPrId, setLinkedPrId] = useState<string | null>(null);
  const [prPickerOpen, setPrPickerOpen] = useState(false);
  const [prLoadingDB, setPrLoadingDB] = useState(false);
  const [prSuggestions, setPrSuggestions] = useState<PRSuggestion[]>([]);

  const [poNo, setPoNo] = useState("");
  const [supplier, setSupplier] = useState("");
  const [address, setAddress] = useState("");
  const [tin, setTin] = useState("");
  const [procurementMode, setProcurementMode] = useState("");
  const [deliveryPlace, setDeliveryPlace] = useState("");
  const [deliveryTerm, setDeliveryTerm] = useState("");
  const [dateOfDelivery, setDateOfDelivery] = useState("");
  const [paymentTerm, setPaymentTerm] = useState("");
  const [date, setDate] = useState(formatDate(new Date()));
  const [officeSection, setOfficeSection] = useState("");
  const [fundCluster, setFundCluster] = useState("");
  const [orsNo, setOrsNo] = useState("");
  const [orsDate, setOrsDate] = useState("");
  const [fundsAvailable, setFundsAvailable] = useState("");
  const [orsAmount, setOrsAmount] = useState("");
  const [officialName, setOfficialName] = useState("");
  const [officialDesig, setOfficialDesig] = useState("");
  const [accountantName, setAccountantName] = useState("");
  const [accountantDesig, setAccountantDesig] = useState("");

  const [items, setItems] = useState<
    {
      id: string;
      stock_no: string;
      unit: string;
      description: string;
      quantity: string;
      unit_price: string;
    }[]
  >([
    {
      id: "1",
      stock_no: "",
      unit: "",
      description: "",
      quantity: "",
      unit_price: "",
    },
  ]);

  const totalAmount = useMemo(() => {
    return items.reduce((sum, it) => {
      const q = Number(it.quantity) || 0;
      const p = Number(it.unit_price) || 0;
      return sum + q * p;
    }, 0);
  }, [items]);

  useEffect(() => {
    if (!visible) return;
    setTab("create");
    setSaving(false);

    setPrNo("");
    setLinkedPrId(null);

    setPoNo("");
    setSupplier("");
    setAddress("");
    setTin("");
    setProcurementMode("");
    setDeliveryPlace("");
    setDeliveryTerm("");
    setDateOfDelivery("");
    setPaymentTerm("");
    setDate(formatDate(new Date()));
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
    setItems([
      {
        id: "1",
        stock_no: "",
        unit: "",
        description: "",
        quantity: "",
        unit_price: "",
      },
    ]);
  }, [visible]);

  const openPRPicker = useCallback(async () => {
    setPrPickerOpen(true);
    setPrLoadingDB(true);
    try {
      const list = await fetchPurchaseRequests();
      // PO creation can link only to PRs completed in the prior phase.
      const eligible = (list ?? []).filter(
        (p: any) => Number(p.status_id) === 33,
      );
      setPrSuggestions(eligible as any);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not load PRs.");
      setPrSuggestions([]);
    } finally {
      setPrLoadingDB(false);
    }
  }, []);

  const handleSelectPR = useCallback((pr: PRSuggestion) => {
    setPrNo(pr.pr_no);
    setLinkedPrId(pr.id);
    if (pr.office_section) setOfficeSection(pr.office_section);
    if (pr.fund_cluster) setFundCluster(pr.fund_cluster);
    if (pr.app_name) setOfficialName(pr.app_name);
    if (pr.app_desig) setOfficialDesig(pr.app_desig);
    setPrPickerOpen(false);
    fetchPRWithItemsById(String(pr.id))
      .then(({ items: prItems }) => {
        const next = (prItems ?? []).map((it: any, idx: number) => ({
          id: String(idx + 1),
          stock_no: String(it.stock_no ?? ""),
          unit: String(it.unit ?? ""),
          description: String(it.description ?? ""),
          quantity: String(it.quantity ?? ""),
          unit_price: String(it.unit_price ?? ""),
        }));
        setItems(
          next.length
            ? next
            : [
                {
                  id: "1",
                  stock_no: "",
                  unit: "",
                  description: "",
                  quantity: "",
                  unit_price: "",
                },
              ],
        );
      })
      .catch(() => {});
  }, []);

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
        stock_no: it.stock_no || null,
        unit: it.unit,
        description: it.description,
        quantity: Number(it.quantity) || 0,
        unit_price: Number(it.unit_price) || 0,
        subtotal: (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
      })),
    }),
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

  const html = useMemo(() => buildPOHtml(previewData), [previewData]);
  const templateHtml = useMemo(
    () => buildPOHtml(previewData, { template: true }),
    [previewData],
  );

  const submit = useCallback(async () => {
    setSaving(true);
    try {
      if (!poNo.trim()) {
        Alert.alert("Missing", "PO Number is required.");
        return;
      }

      let finalPrId = linkedPrId;
      if (!finalPrId && prNo.trim()) {
        finalPrId = await fetchPRIdByNo(prNo.trim());
      }

      const lineItems: Omit<POItemRow, "id" | "po_id">[] = items
        .map((it) => {
          const q = Number(it.quantity) || 0;
          const p = Number(it.unit_price) || 0;
          return {
            stock_no: it.stock_no.trim() ? it.stock_no.trim() : null,
            unit: it.unit,
            description: it.description,
            quantity: q,
            unit_price: p,
            subtotal: q * p,
          };
        })
        .filter(
          (it) => it.description.trim() || it.quantity > 0 || it.unit_price > 0,
        );
      const hasValidItem = lineItems.some(
        (it) =>
          it.description.trim().length > 0 && it.quantity > 0 && it.unit_price > 0,
      );
      if (!hasValidItem) {
        Alert.alert(
          "Missing",
          "Add at least one item with Description, Quantity, and Unit Price.",
        );
        return;
      }

      const payload: POInsertPayload = {
        po_no: poNo.trim() || null,
        pr_no: prNo.trim() || null,
        pr_id: finalPrId ?? null,
        supplier: supplier.trim() || null,
        address: address.trim() || null,
        tin: tin.trim() || null,
        procurement_mode: procurementMode.trim() || null,
        delivery_place: deliveryPlace.trim() || null,
        delivery_term: deliveryTerm.trim() || null,
        delivery_date: dateOfDelivery.trim()
          ? normalizeDateString(dateOfDelivery.trim())
          : null,
        payment_term: paymentTerm.trim() || null,
        date: date.trim() ? normalizeDateString(date.trim()) : null,
        office_section: officeSection.trim() || null,
        fund_cluster: fundCluster.trim() || null,
        ors_no: orsNo.trim() || null,
        ors_date: orsDate.trim() ? normalizeDateString(orsDate.trim()) : null,
        funds_available: fundsAvailable.trim() || null,
        ors_amount: orsAmount.trim() ? Number(orsAmount) || 0 : null,
        total_amount: totalAmount,
        status_id: 11,
        division_id: divisionId ?? null,
        official_name: officialName.trim() || null,
        official_desig: officialDesig.trim() || null,
        accountant_name: accountantName.trim() || null,
        accountant_desig: accountantDesig.trim() || null,
      };

      const inserted = await insertPurchaseOrder(payload, lineItems);
      onCreated(inserted);
      onClose();
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? "Could not create PO.");
    } finally {
      setSaving(false);
    }
  }, [
    linkedPrId,
    prNo,
    poNo,
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
    divisionId,
    officialName,
    officialDesig,
    accountantName,
    accountantDesig,
    items,
    onCreated,
    onClose,
  ]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-gray-50">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <View className="px-5 pt-4 pb-3 bg-[#064E3B]">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-white/60 text-[11px] font-bold tracking-widest uppercase">
                  Create Purchase Order
                </Text>
                <Text className="text-white text-[18px] font-extrabold">
                  Appendix 61
                </Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={10}
                className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center"
              >
                <MaterialIcons name="close" size={18} color="#ffffff" />
              </TouchableOpacity>
            </View>

            <View className="flex-row bg-black/20 rounded-xl p-1 mt-3">
              {(["create", "preview"] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setTab(t)}
                  activeOpacity={0.85}
                  className={`flex-1 items-center py-2 rounded-xl ${tab === t ? "bg-white" : "bg-transparent"}`}
                >
                  <Text
                    className={`text-[12px] font-bold ${tab === t ? "text-[#064E3B]" : "text-white/70"}`}
                  >
                    {t === "create" ? "Create" : "Preview"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {tab === "preview" ? (
            <POPreviewPanel
              html={html}
              templateHtml={templateHtml}
              showActions
            />
          ) : (
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
              keyboardShouldPersistTaps="handled"
            >
              <View
                className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
                style={{ elevation: 2 }}
              >
                <View className="px-4 pt-3 pb-3">
                  <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    Link to PR
                  </Text>
                  <View className="mb-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                    <Text className="text-[11px] font-semibold text-emerald-800">
                      Prior-phase rule: only PRs marked{" "}
                      <Text className="font-extrabold">Completed (PR Phase)</Text>{" "}
                      can be linked to a new PO.
                    </Text>
                    <Text className="text-[10.5px] text-emerald-700 mt-1">
                      You can still create a semi-independent PO manually by
                      leaving PR linkage blank.
                    </Text>
                  </View>
                  <FieldLabel>PR No.</FieldLabel>
                  <PRPicker
                    open={prPickerOpen}
                    onOpen={openPRPicker}
                    prNo={prNo}
                    suggestions={prSuggestions}
                    loading={prLoadingDB}
                    onSelect={handleSelectPR}
                    onClose={() => setPrPickerOpen(false)}
                  />
                  <Text className="text-[10px] text-gray-400 mt-1">
                    Selecting a PR stores both pr_no and pr_id in the PO record.
                  </Text>
                </View>
              </View>

              <View
                className="bg-white rounded-2xl border border-gray-200 overflow-hidden mt-3"
                style={{ elevation: 2 }}
              >
                <View className="px-4 pt-3 pb-3">
                  <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    PO Details
                  </Text>
                  <View className="flex-row gap-2.5">
                    <View className="flex-1">
                      <FieldLabel>PO No.</FieldLabel>
                      <StyledInput
                        value={poNo}
                        onChangeText={setPoNo}
                        placeholder="e.g. 2026-001"
                        mono
                      />
                    </View>
                    <View className="flex-1">
                      <FieldLabel>Date</FieldLabel>
                      <DatePickerButton
                        value={date}
                        onChange={setDate}
                        placeholder="Select date…"
                      />
                    </View>
                  </View>

                  <View className="mt-3">
                    <FieldLabel>Supplier</FieldLabel>
                    <StyledInput
                      value={supplier}
                      onChangeText={setSupplier}
                      placeholder="Supplier name"
                    />
                  </View>
                  <View className="mt-3">
                    <FieldLabel>Address</FieldLabel>
                    <StyledInput
                      value={address}
                      onChangeText={setAddress}
                      placeholder="Supplier address"
                    />
                  </View>
                  <View className="mt-3">
                    <FieldLabel>TIN</FieldLabel>
                    <StyledInput
                      value={tin}
                      onChangeText={setTin}
                      placeholder="TIN"
                      mono
                    />
                  </View>
                  <View className="mt-3">
                    <FieldLabel>Procurement Mode</FieldLabel>
                    <StyledInput
                      value={procurementMode}
                      onChangeText={setProcurementMode}
                      placeholder="e.g. SVP/Canvass"
                    />
                  </View>
                  <View className="mt-3">
                    <FieldLabel>Office / Section</FieldLabel>
                    <StyledInput
                      value={officeSection}
                      onChangeText={setOfficeSection}
                      placeholder="Office / Section"
                    />
                  </View>
                </View>
              </View>

              <View
                className="bg-white rounded-2xl border border-gray-200 overflow-hidden mt-3"
                style={{ elevation: 2 }}
              >
                <View className="px-4 pt-3 pb-3">
                  <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    Delivery & Payment
                  </Text>
                  <View className="flex-row gap-2.5">
                    <View className="flex-1">
                      <FieldLabel>Place of Delivery</FieldLabel>
                      <StyledInput
                        value={deliveryPlace}
                        onChangeText={setDeliveryPlace}
                        placeholder="e.g. DAR Office"
                      />
                    </View>
                    <View className="flex-1">
                      <FieldLabel>Delivery Term</FieldLabel>
                      <StyledInput
                        value={deliveryTerm}
                        onChangeText={setDeliveryTerm}
                        placeholder="e.g. 7 days"
                      />
                    </View>
                  </View>
                  <View className="flex-row gap-2.5 mt-3">
                    <View className="flex-1">
                      <FieldLabel>Date of Delivery</FieldLabel>
                      <DatePickerButton
                        value={dateOfDelivery}
                        onChange={setDateOfDelivery}
                        placeholder="Select delivery date…"
                      />
                    </View>
                    <View className="flex-1">
                      <FieldLabel>Payment Term</FieldLabel>
                      <StyledInput
                        value={paymentTerm}
                        onChangeText={setPaymentTerm}
                        placeholder="e.g. Full payment"
                      />
                    </View>
                  </View>
                </View>
              </View>

              <View
                className="bg-white rounded-2xl border border-gray-200 overflow-hidden mt-3"
                style={{ elevation: 2 }}
              >
                <View className="px-4 pt-3 pb-3">
                  <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    ORS
                  </Text>
                  <View className="flex-row gap-2.5">
                    <View className="flex-1">
                      <FieldLabel>Fund Cluster</FieldLabel>
                      <StyledInput
                        value={fundCluster}
                        onChangeText={setFundCluster}
                        placeholder="e.g. 01"
                        mono
                      />
                    </View>
                    <View className="flex-1">
                      <FieldLabel>ORS No.</FieldLabel>
                      <StyledInput
                        value={orsNo}
                        onChangeText={setOrsNo}
                        placeholder="ORS No."
                        mono
                      />
                    </View>
                  </View>
                  <View className="flex-row gap-2.5 mt-3">
                    <View className="flex-1">
                      <FieldLabel>Date of ORS</FieldLabel>
                      <DatePickerButton
                        value={orsDate}
                        onChange={setOrsDate}
                        placeholder="Select ORS date…"
                      />
                    </View>
                    <View className="flex-1">
                      <FieldLabel>ORS Amount</FieldLabel>
                      <StyledInput
                        value={orsAmount}
                        onChangeText={setOrsAmount}
                        placeholder="0.00"
                        mono
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                  <View className="mt-3">
                    <FieldLabel>Funds Available</FieldLabel>
                    <StyledInput
                      value={fundsAvailable}
                      onChangeText={setFundsAvailable}
                      placeholder="Funds available"
                    />
                  </View>
                </View>
              </View>

              <View
                className="bg-white rounded-2xl border border-gray-200 overflow-hidden mt-3"
                style={{ elevation: 2 }}
              >
                <View className="px-4 pt-3 pb-3">
                  <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    Items
                  </Text>

                  {items.map((it, idx) => {
                    const q = Number(it.quantity) || 0;
                    const p = Number(it.unit_price) || 0;
                    const sub = q * p;
                    return (
                      <View
                        key={it.id}
                        className="mb-3 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3"
                      >
                        <View className="flex-row items-center justify-between mb-2">
                          <Text className="text-[11px] font-bold text-gray-500">
                            Item {idx + 1}
                          </Text>
                          {items.length > 1 && (
                            <TouchableOpacity
                              onPress={() =>
                                setItems((prev) =>
                                  prev.filter((x) => x.id !== it.id),
                                )
                              }
                              hitSlop={10}
                              className="w-8 h-8 rounded-xl bg-white items-center justify-center border border-gray-200"
                            >
                              <MaterialIcons
                                name="delete"
                                size={16}
                                color="#ef4444"
                              />
                            </TouchableOpacity>
                          )}
                        </View>
                        <View className="flex-row gap-2.5">
                          <View className="flex-1">
                            <FieldLabel>Stock / Property No.</FieldLabel>
                            <StyledInput
                              value={it.stock_no}
                              onChangeText={(v) =>
                                setItems((prev) =>
                                  prev.map((x) =>
                                    x.id === it.id ? { ...x, stock_no: v } : x,
                                  ),
                                )
                              }
                              placeholder="Optional"
                              mono
                            />
                          </View>
                          <View className="w-24">
                            <FieldLabel>Unit</FieldLabel>
                            <StyledInput
                              value={it.unit}
                              onChangeText={(v) =>
                                setItems((prev) =>
                                  prev.map((x) =>
                                    x.id === it.id ? { ...x, unit: v } : x,
                                  ),
                                )
                              }
                              placeholder="pcs"
                            />
                          </View>
                        </View>
                        <View className="mt-3">
                          <FieldLabel>Description</FieldLabel>
                          <StyledInput
                            value={it.description}
                            onChangeText={(v) =>
                              setItems((prev) =>
                                prev.map((x) =>
                                  x.id === it.id ? { ...x, description: v } : x,
                                ),
                              )
                            }
                            placeholder="Item description"
                          />
                        </View>
                        <View className="flex-row gap-2.5 mt-3">
                          <View className="flex-1">
                            <FieldLabel>Quantity</FieldLabel>
                            <StyledInput
                              value={it.quantity}
                              onChangeText={(v) =>
                                setItems((prev) =>
                                  prev.map((x) =>
                                    x.id === it.id ? { ...x, quantity: v } : x,
                                  ),
                                )
                              }
                              placeholder="0"
                              keyboardType="numeric"
                              mono
                            />
                          </View>
                          <View className="flex-1">
                            <FieldLabel>Unit Cost</FieldLabel>
                            <StyledInput
                              value={it.unit_price}
                              onChangeText={(v) =>
                                setItems((prev) =>
                                  prev.map((x) =>
                                    x.id === it.id
                                      ? { ...x, unit_price: v }
                                      : x,
                                  ),
                                )
                              }
                              placeholder="0.00"
                              keyboardType="numeric"
                              mono
                            />
                          </View>
                          <View className="flex-1">
                            <FieldLabel>Subtotal</FieldLabel>
                            <View
                              className="bg-white rounded-[10px] border border-gray-200 px-3 py-2.5"
                              style={{ minHeight: 42 }}
                            >
                              <Text
                                className="text-sm font-bold text-gray-700"
                                style={{ fontFamily: MONO }}
                              >
                                <Text>₱</Text>
                                {fmt(sub)}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  })}

                  <TouchableOpacity
                    onPress={() =>
                      setItems((prev) => [
                        ...prev,
                        {
                          id: String(Date.now()),
                          stock_no: "",
                          unit: "",
                          description: "",
                          quantity: "",
                          unit_price: "",
                        },
                      ])
                    }
                    activeOpacity={0.85}
                    className="flex-row items-center justify-center gap-2 py-3 rounded-2xl border border-gray-200 bg-white"
                  >
                    <MaterialIcons name="add" size={16} color="#064E3B" />
                    <Text className="text-[13px] font-bold text-gray-700">
                      Add item
                    </Text>
                  </TouchableOpacity>

                  <View className="mt-3 px-1">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-[11px] font-bold text-gray-500">
                        Total
                      </Text>
                      <Text
                        className="text-[14px] font-extrabold text-[#064E3B]"
                        style={{ fontFamily: MONO }}
                      >
                        <Text>₱</Text>
                        {fmt(totalAmount)}
                      </Text>
                    </View>
                    <Text className="text-[10px] text-gray-400 mt-1">
                      {toWords(totalAmount)}
                    </Text>
                  </View>
                </View>
              </View>

              <View
                className="bg-white rounded-2xl border border-gray-200 overflow-hidden mt-3"
                style={{ elevation: 2 }}
              >
                <View className="px-4 pt-3 pb-3">
                  <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    Signatories
                  </Text>
                  <View className="flex-row gap-2.5">
                    <View className="flex-1">
                      <FieldLabel>Authorized Official</FieldLabel>
                      <StyledInput
                        value={officialName}
                        onChangeText={setOfficialName}
                        placeholder="Name"
                      />
                    </View>
                    <View className="flex-1">
                      <FieldLabel>Designation</FieldLabel>
                      <StyledInput
                        value={officialDesig}
                        onChangeText={setOfficialDesig}
                        placeholder="Designation"
                      />
                    </View>
                  </View>
                  <View className="flex-row gap-2.5 mt-3">
                    <View className="flex-1">
                      <FieldLabel>Chief Accountant</FieldLabel>
                      <StyledInput
                        value={accountantName}
                        onChangeText={setAccountantName}
                        placeholder="Name"
                      />
                    </View>
                    <View className="flex-1">
                      <FieldLabel>Designation</FieldLabel>
                      <StyledInput
                        value={accountantDesig}
                        onChangeText={setAccountantDesig}
                        placeholder="Designation"
                      />
                    </View>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                disabled={saving}
                onPress={submit}
                activeOpacity={0.85}
                className={`mt-4 rounded-2xl py-3 items-center ${saving ? "bg-gray-300" : "bg-[#064E3B]"}`}
              >
                <Text className="text-[13.5px] font-extrabold text-white">
                  {saving ? "Saving…" : "Create PO"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
