import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useMemo, useState } from "react";
import {
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import CalendarPickerModal from "./CalendarModal";

function formatDateLong(d: Date): string {
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function formatDateDisplay(v: string): string {
  if (!v) return "";
  const parsed = new Date(v);
  if (Number.isNaN(parsed.getTime())) return v;
  return formatDateLong(parsed);
}

export default function CreateDeliveryModal({
  visible,
  deliveryNo,
  setDeliveryNo,
  expectedDeliveryDate,
  setExpectedDeliveryDate,
  poOptions,
  selectedPoId,
  setSelectedPoId,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  deliveryNo: string;
  setDeliveryNo: (v: string) => void;
  expectedDeliveryDate: string;
  setExpectedDeliveryDate: (v: string) => void;
  poOptions: any[];
  selectedPoId: number | null;
  setSelectedPoId: (v: number) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [poSearch, setPoSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("All");
  const selectedPo = useMemo(
    () => poOptions.find((p) => Number(p.id) === Number(selectedPoId)),
    [poOptions, selectedPoId],
  );
  const sections = useMemo(() => {
    return [
      "All",
      ...new Set(
        (poOptions ?? [])
          .map((p) => String(p.office_section ?? ""))
          .filter(Boolean),
      ),
    ].sort();
  }, [poOptions]);
  const filteredPOs = useMemo(() => {
    const q = poSearch.trim().toLowerCase();
    return (poOptions ?? []).filter((p) => {
      const section = String(p.office_section ?? "");
      if (sectionFilter !== "All" && section !== sectionFilter) return false;
      if (!q) return true;
      const hay = [
        p.po_no,
        p.pr_no,
        p.supplier,
        p.office_section,
        p.division_id,
      ]
        .map((x) => String(x ?? ""))
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [poOptions, poSearch, sectionFilter]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-white">
        <View className="px-5 pt-4 pb-3 bg-[#064E3B]">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-[10px] font-bold uppercase tracking-widest text-white/60">
                Phase 3 · Create Delivery
              </Text>
              <Text className="text-[16px] font-extrabold text-white">
                Log Delivery
              </Text>
              <Text className="text-[12px] font-semibold text-white/70 mt-0.5">
                Choose a served PO and encode delivery details.
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={10}
              className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center"
            >
              <MaterialIcons name="close" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          className="flex-1 bg-gray-50"
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="bg-white rounded-2xl border border-gray-200 p-4 mb-3">
            <Text className="text-[10.5px] font-bold uppercase tracking-widest text-gray-400 mb-2">
              Delivery Details
            </Text>
            <Text className="text-[12px] font-semibold text-gray-700 mb-1.5">
              Delivery No.
            </Text>
            <TextInput
              value={deliveryNo}
              onChangeText={setDeliveryNo}
              placeholder="e.g. DEL-2026-0012"
              placeholderTextColor="#9ca3af"
              autoCapitalize="characters"
              className="border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13.5px] text-gray-800 bg-white"
            />

            <Text className="text-[12px] font-semibold text-gray-700 mt-3 mb-1.5">
              Expected Delivery Date
            </Text>
            <TouchableOpacity
              onPress={() => setCalendarOpen(true)}
              activeOpacity={0.85}
              className="border border-gray-200 rounded-xl px-3.5 py-2.5 flex-row items-center justify-between bg-white"
            >
              <Text
                className="text-[13px]"
                style={{ color: expectedDeliveryDate ? "#111827" : "#9ca3af" }}
              >
                {expectedDeliveryDate
                  ? formatDateDisplay(expectedDeliveryDate)
                  : "Select expected delivery date"}
              </Text>
              <MaterialIcons name="calendar-today" size={16} color="#064E3B" />
            </TouchableOpacity>
          </View>

          <View className="bg-white rounded-2xl border border-gray-200 p-4">
            <Text className="text-[10.5px] font-bold uppercase tracking-widest text-gray-400 mb-2">
              PO Candidates (Served)
            </Text>

            <View className="flex-row items-center bg-gray-100 rounded-xl px-3 py-2 gap-2 border border-gray-200 mb-3">
              <MaterialIcons name="search" size={16} color="#9ca3af" />
              <TextInput
                value={poSearch}
                onChangeText={setPoSearch}
                placeholder="Search PO No., PR No., supplier, section…"
                placeholderTextColor="#9ca3af"
                returnKeyType="search"
                className="flex-1 text-[13px] text-gray-800"
              />
              {poSearch.length > 0 && (
                <TouchableOpacity onPress={() => setPoSearch("")} hitSlop={8}>
                  <MaterialIcons name="close" size={16} color="#9ca3af" />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexDirection: "row", gap: 6 }}
              className="mb-3"
            >
              {sections.map((s) => {
                const active = sectionFilter === s;
                return (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setSectionFilter(s)}
                    activeOpacity={0.75}
                    className="rounded-full px-3 py-1.5"
                    style={{
                      backgroundColor: active ? "#064E3B" : "#ffffff",
                      borderWidth: 1.5,
                      borderColor: active ? "#064E3B" : "#e5e7eb",
                    }}
                  >
                    <Text
                      className="text-[11.5px] font-bold"
                      style={{ color: active ? "#ffffff" : "#6b7280" }}
                    >
                      {s}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text className="text-[11px] text-gray-400 mb-2">
              <Text className="font-semibold text-gray-500">
                {filteredPOs.length}
              </Text>{" "}
              results
            </Text>

            <View className="max-h-[320px]">
              <ScrollView showsVerticalScrollIndicator={false}>
                {filteredPOs.map((p) => {
                  const selected = Number(selectedPoId) === Number(p.id);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => setSelectedPoId(Number(p.id))}
                      activeOpacity={0.85}
                      className={`p-3 rounded-2xl border mb-2 ${
                        selected
                          ? "border-[#064E3B] bg-emerald-50"
                          : "border-gray-200 bg-white"
                      }`}
                    >
                      <View className="flex-row items-start justify-between gap-2">
                        <View className="flex-1">
                          <Text className="text-[13px] font-extrabold text-gray-800">
                            {p.po_no}
                          </Text>
                          <Text className="text-[11.5px] text-gray-500 mt-0.5">
                            {p.supplier ?? "—"}
                          </Text>
                          <Text className="text-[11px] text-gray-400 mt-1">
                            {p.office_section ?? "—"}
                            {p.pr_no ? ` · PR ${p.pr_no}` : ""}
                          </Text>
                        </View>
                        {selected && (
                          <MaterialIcons
                            name="check-circle"
                            size={18}
                            color="#064E3B"
                          />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>

        {selectedPo && (
          <View className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 gap-1.5">
            <Text className="text-[11px] font-bold uppercase tracking-widest text-emerald-700">
              PO Preview
            </Text>
            <Text className="text-[13px] font-extrabold text-gray-800">
              PO {selectedPo.po_no}
            </Text>
            {!!selectedPo.pr_no && (
              <Text className="text-[11.5px] text-gray-600">PR {selectedPo.pr_no}</Text>
            )}
            <Text className="text-[11.5px] text-gray-600">
              Supplier: {selectedPo.supplier || "—"}
            </Text>
            <Text className="text-[11.5px] text-gray-600">
              Office/Section: {selectedPo.office_section || "—"}
            </Text>
          </View>
        )}
        </ScrollView>

        <View className="px-4 pb-4 pt-3 bg-white border-t border-gray-100">
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.85}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-white"
            >
              <Text className="text-[12px] font-bold text-gray-700 text-center">
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onSubmit}
              activeOpacity={0.85}
              className="flex-1 px-4 py-2.5 rounded-xl bg-[#064E3B]"
            >
              <Text className="text-[12px] font-bold text-white text-center">
                Create
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <CalendarPickerModal
        visible={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        onSelectDate={(date) => {
          setExpectedDeliveryDate(toIsoDate(date));
          setCalendarOpen(false);
        }}
      />
    </Modal>
  );
}

