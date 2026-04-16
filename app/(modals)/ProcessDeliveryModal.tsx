import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-[10.5px] font-bold uppercase tracking-widest text-gray-400 mb-2">
      {children}
    </Text>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-3">
      <View className="flex-row items-center gap-1 mb-1.5">
        <Text className="text-[12px] font-semibold text-gray-700">{label}</Text>
        {required && <Text className="text-[12px] font-bold text-red-500">*</Text>}
      </View>
      {children}
    </View>
  );
}

function StyledInput({
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  mono,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: any;
  mono?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#9ca3af"
      multiline={multiline}
      keyboardType={keyboardType}
      className={`rounded-xl px-3.5 py-2.5 text-[13.5px] text-gray-800 border bg-white border-gray-200 ${
        multiline ? "min-h-[88px]" : ""
      }`}
      style={[
        multiline ? { textAlignVertical: "top" } : undefined,
        mono ? { fontFamily: MONO } : undefined,
      ]}
    />
  );
}

export default function ProcessDeliveryModal({
  visible,
  onClose,
  onSubmit,
  active,
  statusLabel,
  drNo,
  setDrNo,
  soaNo,
  setSoaNo,
  notes,
  setNotes,
  iar,
  setIar,
  loa,
  setLoa,
  dv,
  setDv,
}: any) {
  const deliveryNo = active?.delivery_no ?? "—";
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        className="flex-1 bg-white"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View className="px-5 pt-4 pb-3 bg-[#064E3B]">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-[10px] font-bold uppercase tracking-widest text-white/60">
                Phase 3 · Delivery Process
              </Text>
              <Text className="text-[16px] font-extrabold text-white">
                {deliveryNo}
              </Text>
              <Text className="text-[12px] font-semibold text-white/70 mt-0.5">
                {statusLabel}
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
          {(active?.status_id === 16 || active?.status_id === 17) && (
            <>
              <SectionLabel>Delivery Receipt</SectionLabel>
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Field label="Delivery Receipt No. (DR No.)" required>
                    <StyledInput
                      value={drNo}
                      onChangeText={setDrNo}
                      placeholder="e.g. DR-2026-0012"
                      mono
                    />
                  </Field>
                </View>
                <View className="flex-1">
                  <Field label="Statement of Account (SOA No.)">
                    <StyledInput
                      value={soaNo}
                      onChangeText={setSoaNo}
                      placeholder="e.g. SOA-2026-0008"
                      mono
                    />
                  </Field>
                </View>
              </View>
            </>
          )}

          {(active?.status_id === 17 || active?.status_id === 19) && (
            <>
              <SectionLabel>Inspection & Acceptance Report (IAR)</SectionLabel>
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Field label="IAR No.">
                    <StyledInput
                      value={iar?.iar_no ?? ""}
                      onChangeText={(v) =>
                        setIar((p: any) => ({ ...(p ?? {}), iar_no: v }))
                      }
                      placeholder="e.g. IAR-2026-0015"
                      mono
                    />
                  </Field>
                </View>
                <View className="flex-1">
                  <Field label="Invoice No.">
                    <StyledInput
                      value={iar?.invoice_no ?? ""}
                      onChangeText={(v) =>
                        setIar((p: any) => ({ ...(p ?? {}), invoice_no: v }))
                      }
                      placeholder="e.g. INV-2026-0042"
                      mono
                    />
                  </Field>
                </View>
              </View>
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Field label="Invoice Date">
                    <StyledInput
                      value={iar?.invoice_date ?? ""}
                      onChangeText={(v) =>
                        setIar((p: any) => ({ ...(p ?? {}), invoice_date: v }))
                      }
                      placeholder="YYYY-MM-DD"
                      mono
                    />
                  </Field>
                </View>
                <View className="flex-1">
                  <Field label="Date Inspected">
                    <StyledInput
                      value={iar?.inspected_at ?? ""}
                      onChangeText={(v) =>
                        setIar((p: any) => ({ ...(p ?? {}), inspected_at: v }))
                      }
                      placeholder="YYYY-MM-DD"
                      mono
                    />
                  </Field>
                </View>
              </View>
            </>
          )}

          {active?.status_id === 20 && (
            <>
              <SectionLabel>Acceptance (LOA)</SectionLabel>
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Field label="LOA No.">
                    <StyledInput
                      value={loa?.loa_no ?? ""}
                      onChangeText={(v) =>
                        setLoa((p: any) => ({ ...(p ?? {}), loa_no: v }))
                      }
                      placeholder="e.g. LOA-2026-0003"
                      mono
                    />
                  </Field>
                </View>
                <View className="flex-1">
                  <Field label="Invoice No.">
                    <StyledInput
                      value={loa?.invoice_no ?? ""}
                      onChangeText={(v) =>
                        setLoa((p: any) => ({ ...(p ?? {}), invoice_no: v }))
                      }
                      placeholder="e.g. INV-2026-0042"
                      mono
                    />
                  </Field>
                </View>
              </View>
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Field label="Accepted By (Name)">
                    <StyledInput
                      value={loa?.accepted_by_name ?? ""}
                      onChangeText={(v) =>
                        setLoa((p: any) => ({
                          ...(p ?? {}),
                          accepted_by_name: v,
                        }))
                      }
                      placeholder="Printed name"
                    />
                  </Field>
                </View>
                <View className="flex-1">
                  <Field label="Accepted By (Title/Designation)">
                    <StyledInput
                      value={loa?.accepted_by_title ?? ""}
                      onChangeText={(v) =>
                        setLoa((p: any) => ({
                          ...(p ?? {}),
                          accepted_by_title: v,
                        }))
                      }
                      placeholder="Position title"
                    />
                  </Field>
                </View>
              </View>

              <SectionLabel>Disbursement Voucher (DV)</SectionLabel>
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Field label="DV No.">
                    <StyledInput
                      value={dv?.dv_no ?? ""}
                      onChangeText={(v) =>
                        setDv((p: any) => ({ ...(p ?? {}), dv_no: v }))
                      }
                      placeholder="e.g. DV-2026-0009"
                      mono
                    />
                  </Field>
                </View>
                <View className="flex-1">
                  <Field label="Amount Due">
                    <StyledInput
                      value={dv?.amount_due ?? ""}
                      onChangeText={(v) =>
                        setDv((p: any) => ({ ...(p ?? {}), amount_due: v }))
                      }
                      placeholder="0.00"
                      keyboardType="numeric"
                      mono
                    />
                  </Field>
                </View>
              </View>
              <Field label="Mode of Payment">
                <StyledInput
                  value={dv?.mode_of_payment ?? ""}
                  onChangeText={(v) =>
                    setDv((p: any) => ({ ...(p ?? {}), mode_of_payment: v }))
                  }
                  placeholder="e.g. MDS Check / ADA / Cash"
                />
              </Field>
              <Field label="Particulars">
                <StyledInput
                  value={dv?.particulars ?? ""}
                  onChangeText={(v) =>
                    setDv((p: any) => ({ ...(p ?? {}), particulars: v }))
                  }
                  placeholder="Brief description of payment"
                  multiline
                />
              </Field>
            </>
          )}

          <SectionLabel>Notes</SectionLabel>
          <Field label="Notes / Remarks">
            <StyledInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Add notes for this delivery record…"
              multiline
            />
          </Field>
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
                Save & Next Step
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
