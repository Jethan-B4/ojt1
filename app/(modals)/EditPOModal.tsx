/**
 * EditPOModal.tsx — Edit Purchase Order Modal
 *
 * Same field layout as CreatePOModal (Appendix 61) but:
 *   - Fetches the existing PO header + items on open
 *   - Calls updatePO() with correctly mapped snake_case fields
 *   - Header subtitle shows "Edit Purchase Order · {poNo}"
 *   - Tab labels: "Edit" | "Preview"
 *   - Footer button: "Save Changes"
 *
 * Only accessible from POModule's RecordCard Edit button.
 * Edit button shown to Supply (role_id = 8) when statusId <= 4.
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
import CalendarModal from "../(modals)/CalendarModal";
import { supabase } from "../../lib/supabase/client";
import {
  fetchPOWithItemsById,
  updatePO,
  type POItemRow,
} from "../../lib/supabase/po";
import { fetchPRIdByNo, fetchPurchaseRequests } from "../../lib/supabase/pr";

// ─── Exported types ───────────────────────────────────────────────────────────

export interface POEditRecord {
  id: string;
  poNo: string;
}

export interface POEditPayload {
  id: string;
  poNo: string;
  prNo: string;
  supplier: string;
  address: string;
  tin: string;
  procurementMode: string;
  deliveryPlace: string;
  deliveryTerm: string;
  dateOfDelivery: string;
  paymentTerm: string;
  date: string;
  officeSection: string;
  fundCluster: string;
  orsNo: string;
  orsDate: string;
  fundsAvailable: string;
  orsAmount: number;
  totalAmount: number;
  officialName: string;
  officialDesig: string;
  accountantName: string;
  accountantDesig: string;
  prId: string | null;
  items: POItemRow[];
}

interface EditPOModalProps {
  visible: boolean;
  record: POEditRecord | null;
  onClose: () => void;
  onSave: (payload: POEditPayload) => void;
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
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const fmt = (n: number) =>
  n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Convert a JS Date to the long Philippine locale format used in PO documents. */
function formatDate(d: Date): string {
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Normalise a date string that might be in ISO "YYYY-MM-DD" format
 * (stored by ProcessPOModal) to the long locale format expected by the form.
 */
function normalizeDateString(s: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + "T00:00:00");
    if (!isNaN(d.getTime())) return formatDate(d);
  }
  return s;
}

/** Fetch all division names from the divisions table, sorted alphabetically. */
async function fetchDivisionNames(): Promise<string[]> {
  const { data } = await supabase
    .from("divisions")
    .select("division_name")
    .order("division_name");
  return (data ?? [])
    .map((r: any) => r.division_name as string)
    .filter(Boolean);
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
      autoCapitalize={rest.autoCapitalize ?? "none"}
      autoCorrect={rest.autoCorrect ?? false}
      spellCheck={rest.spellCheck ?? false}
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

/**
 * DatePickerButton — tappable field that opens the app's CalendarModal.
 * Displays the current value as formatted text; calls onChange with the
 * long Philippine locale string (e.g. "January 15, 2025") on selection.
 */
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
      <CalendarModal
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

/**
 * SectionSuggestInput — TextInput for Office / Section with division name chips.
 * Chips are fetched from the divisions table and filtered as the user types.
 * Tapping a chip instantly fills the field.
 */
function SectionSuggestInput({
  value,
  onChangeText,
  divisions,
}: {
  value: string;
  onChangeText: (v: string) => void;
  divisions: string[];
}) {
  const [focused, setFocused] = useState(false);
  const filtered = divisions.filter(
    (d) => !value.trim() || d.toLowerCase().includes(value.toLowerCase()),
  );

  return (
    <View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="e.g. Finance Division"
        placeholderTextColor="#9ca3af"
        className={`bg-gray-50 rounded-[10px] border px-3 py-2.5 text-sm text-gray-900 ${
          focused ? "border-[#064E3B]" : "border-gray-200"
        }`}
      />
      {divisions.length > 0 && filtered.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          contentContainerStyle={{ gap: 5, paddingVertical: 5 }}
        >
          {filtered.slice(0, 10).map((d) => {
            const selected = value === d;
            return (
              <TouchableOpacity
                key={d}
                onPress={() => {
                  onChangeText(d);
                  setFocused(false);
                }}
                activeOpacity={0.75}
                className="rounded-full px-2.5 py-1"
                style={{
                  backgroundColor: selected ? "#064E3B" : "#f3f4f6",
                  borderWidth: 1,
                  borderColor: selected ? "#064E3B" : "#e5e7eb",
                }}
              >
                <Text
                  className="text-[10.5px] font-semibold"
                  style={{ color: selected ? "#ffffff" : "#374151" }}
                  numberOfLines={1}
                >
                  {d}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
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
          <Text style={{ fontFamily: undefined }}>{"\u20B1"}</Text>
          {fmt(amount)}
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
                Change PR Link
              </Text>
              <Text className="text-[16px] font-black text-white mt-0.5">
                Select Purchase Request
              </Text>
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
            <Text className="text-[13px] text-gray-400 text-center">
              {query
                ? "No PRs match your search."
                : "No purchase requests found."}
            </Text>
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

// ─── EditPOModal ──────────────────────────────────────────────────────────────

export default function EditPOModal({
  visible,
  record,
  onClose,
  onSave,
}: EditPOModalProps) {
  const [tab, setTab] = useState<"edit" | "preview">("edit");

  // ── PR picker state ─────────────────────────────────────────────────────
  const [showPicker, setShowPicker] = useState(false);
  const [prSuggestions, setPrSuggestions] = useState<PRSuggestion[]>([]);
  const [prLoadingDB, setPrLoadingDB] = useState(false);
  const [linkedPrNo, setLinkedPrNo] = useState<string | null>(null);
  const [linkedPrId, setLinkedPrId] = useState<string | null>(null);

  // ── PO editable fields ──────────────────────────────────────────────────
  const [prNo, setPrNo] = useState("");
  const [supplier, setSupplier] = useState("");
  const [address, setAddress] = useState("");
  const [tin, setTin] = useState("");
  const [procurementMode, setProcurementMode] = useState("");
  const [deliveryPlace, setDeliveryPlace] = useState("");
  const [deliveryTerm, setDeliveryTerm] = useState("");
  const [dateOfDelivery, setDateOfDelivery] = useState("");
  const [paymentTerm, setPaymentTerm] = useState("");
  const [date, setDate] = useState("");
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
  const [items, setItems] = useState<POItemRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Division names for Office / Section suggestions (loaded once on mount)
  const [divisions, setDivisions] = useState<string[]>([]);
  useEffect(() => {
    fetchDivisionNames()
      .then(setDivisions)
      .catch(() => {});
  }, []);

  // Fetch existing PO on open
  useEffect(() => {
    if (!visible || !record) return;
    setTab("edit");
    setLoading(true);
    setError(null);
    setLinkedPrNo(null);
    setLinkedPrId(null);

    fetchPOWithItemsById(record.id)
      .then(({ header: h, items: rows }) => {
        setPrNo(h.pr_no ?? "");
        setLinkedPrNo(h.pr_no ?? null);
        setLinkedPrId(h.pr_id ?? null);
        setSupplier(h.supplier ?? "");
        setAddress(h.address ?? "");
        setTin(h.tin ?? "");
        setProcurementMode(h.procurement_mode ?? "");
        setDeliveryPlace(h.delivery_place ?? "");
        setDeliveryTerm(h.delivery_term ?? "");
        setDateOfDelivery(normalizeDateString(h.delivery_date ?? ""));
        setPaymentTerm(h.payment_term ?? "");
        setDate(normalizeDateString(h.date ?? ""));
        setOfficeSection(h.office_section ?? "");
        setFundCluster(h.fund_cluster ?? "");
        setOrsNo(h.ors_no ?? "");
        setOrsDate(normalizeDateString(h.ors_date ?? ""));
        setFundsAvailable(h.funds_available ?? "");
        setOrsAmount(h.ors_amount != null ? String(h.ors_amount) : "");
        setOfficialName(h.official_name ?? "");
        setOfficialDesig(h.official_desig ?? "");
        setAccountantName(h.accountant_name ?? "");
        setAccountantDesig(h.accountant_desig ?? "");
        setItems(
          rows.map((i) => ({
            id: i.id,
            po_id: i.po_id,
            stock_no: i.stock_no ?? null,
            unit: i.unit ?? "",
            description: i.description ?? "",
            quantity: Number(i.quantity) || 0,
            unit_price: Number(i.unit_price) || 0,
            subtotal: Number(i.subtotal) || 0,
          })),
        );
      })
      .catch((e: any) => setError(e.message ?? "Failed to load PO."))
      .finally(() => setLoading(false));
  }, [visible, record]);

  // ── PR picker handlers ──────────────────────────────────────────────────

  const openPRPicker = async () => {
    setPrLoadingDB(true);
    setShowPicker(true);
    try {
      const rows = await fetchPurchaseRequests();
      setPrSuggestions(
        (rows ?? []).map((r: any) => ({
          id: String(r.id),
          pr_no: r.pr_no ?? "",
          office_section: r.office_section ?? null,
          purpose: r.purpose ?? null,
          total_cost: r.total_cost ?? null,
          fund_cluster: r.fund_cluster ?? null,
          app_name: r.app_name ?? null,
          app_desig: r.app_desig ?? null,
        })),
      );
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not load purchase requests.");
      setShowPicker(false);
    } finally {
      setPrLoadingDB(false);
    }
  };

  const handleSelectPR = (pr: PRSuggestion) => {
    setPrNo(pr.pr_no);
    setLinkedPrNo(pr.pr_no);
    setLinkedPrId(pr.id);
    if (pr.office_section) setOfficeSection(pr.office_section);
    if (pr.fund_cluster) setFundCluster(pr.fund_cluster);
    if (pr.app_name) setOfficialName(pr.app_name);
    if (pr.app_desig) setOfficialDesig(pr.app_desig);
    setShowPicker(false);
  };

  // ── Item handlers ───────────────────────────────────────────────────────

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

  const totalAmount = items.reduce(
    (s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0),
    0,
  );

  // ── Preview data ────────────────────────────────────────────────────────

  const previewData: POPreviewData = useMemo(
    () => ({
      poNo: record?.poNo,
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
      record?.poNo,
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
    if (!record) return;
    if (!prNo.trim()) return setError("PR Number is required.");
    if (!supplier.trim()) return setError("Supplier is required.");
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

      await updatePO(
        record.id,
        {
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
          official_name: officialName || null,
          official_desig: officialDesig || null,
          accountant_name: accountantName || null,
          accountant_desig: accountantDesig || null,
        },
        lineItems,
      );

      const payload: POEditPayload = {
        id: record.id,
        poNo: record.poNo,
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
        prId: finalPrId ?? null,
        items: lineItems as POItemRow[],
      };

      onSave(payload);
      onClose();
    } catch (e: any) {
      setError(e.message ?? "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  if (!visible || !record) return null;

  return (
    <>
      <Modal visible animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView className="flex-1 bg-white">
          {/* ── Header ── */}
          <View className="bg-[#064E3B] px-5 pt-5 pb-0">
            <View className="flex-row items-start justify-between mb-4">
              <View className="flex-1 pr-3">
                <Text className="text-[10px] font-bold tracking-widest uppercase text-white/40">
                  Edit Purchase Order
                </Text>
                <Text
                  className="text-[18px] font-black text-white mt-0.5"
                  style={{ fontFamily: MONO }}
                >
                  {record.poNo}
                </Text>
                {linkedPrNo ? (
                  <View className="flex-row items-center gap-1.5 mt-1">
                    <MaterialIcons
                      name="link"
                      size={11}
                      color="rgba(255,255,255,0.5)"
                    />
                    <Text className="text-[11px] text-white/50">
                      Re-linked to {linkedPrNo}
                    </Text>
                  </View>
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

            {/* Tab toggle */}
            <View className="flex-row bg-black/20 rounded-xl p-1 mb-0">
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
          </View>

          {/* Loading overlay */}
          {loading && (
            <View className="flex-1 items-center justify-center gap-3">
              <ActivityIndicator size="large" color="#064E3B" />
              <Text className="text-[13px] text-gray-400">
                Loading PO data…
              </Text>
            </View>
          )}

          {/* Error banner */}
          {!loading && error ? (
            <View className="mx-4 mt-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 flex-row items-center gap-2">
              <MaterialIcons name="error-outline" size={15} color="#dc2626" />
              <Text className="text-[12.5px] text-red-600 flex-1">{error}</Text>
              <TouchableOpacity onPress={() => setError(null)} hitSlop={6}>
                <MaterialIcons name="close" size={14} color="#dc2626" />
              </TouchableOpacity>
            </View>
          ) : null}

          {!loading && tab === "preview" ? (
            <POPreviewPanel
              html={previewHtml}
              showActions
              onPrint={handlePrint}
              onDownload={handleDownload}
            />
          ) : !loading ? (
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
                      <FieldLabel>PO No. (read-only)</FieldLabel>
                      <View className="bg-gray-100 rounded-[10px] border border-gray-200 px-3 py-2.5">
                        <Text
                          className="text-sm text-gray-500"
                          style={{ fontFamily: MONO }}
                        >
                          {record.poNo}
                        </Text>
                      </View>
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
                          onPress={openPRPicker}
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
                      <DatePickerButton
                        value={date}
                        onChange={setDate}
                        placeholder="Select PO date…"
                      />
                    </View>
                    <View className="flex-1">
                      <FieldLabel>Office / Section</FieldLabel>
                      <SectionSuggestInput
                        value={officeSection}
                        onChangeText={setOfficeSection}
                        divisions={divisions}
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
                    className={`flex-[2] rounded-[10px] py-3 flex-row items-center justify-center gap-2 ${saving ? "bg-gray-400" : "bg-[#064E3B]"}`}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <MaterialIcons name="save" size={16} color="#fff" />
                    )}
                    <Text className="text-sm font-bold text-white">
                      {saving ? "Saving…" : "Save Changes"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          ) : null}
        </SafeAreaView>
      </Modal>

      {/* PR picker rendered outside main modal */}
      <PRPickerModal
        visible={showPicker}
        suggestions={prSuggestions}
        loading={prLoadingDB}
        onSelect={handleSelectPR}
        onDismiss={() => setShowPicker(false)}
      />
    </>
  );
}
