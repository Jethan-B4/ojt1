import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useState } from "react";
import {
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MONO } from "./constants";

/**
 * UI Atom: Divider — section separator with label
 */
export const Divider = ({ label }: { label: string }) => (
  <View className="flex-row items-center gap-2 mb-2.5 mt-1">
    <Text className="text-[12px] font-bold tracking-widest uppercase text-gray-400">
      {label}
    </Text>
    <View className="flex-1 h-px bg-gray-200" />
  </View>
);

/**
 * UI Atom: Card — container with shadow and rounded corners
 */
export const Card = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <View
    className={`bg-white rounded-3xl border border-gray-200 mb-3 overflow-hidden ${className ?? ""}`}
    style={{
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.07,
      shadowRadius: 6,
      elevation: 3,
    }}
  >
    {children}
  </View>
);

/**
 * UI Atom: Field — form field with label
 */
export const Field = ({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) => (
  <View className="mb-3">
    <View className="flex-row items-center gap-1 mb-1">
      <Text className="text-[14px] font-semibold text-gray-700">{label}</Text>
      {required && (
        <Text className="text-[14px] font-bold text-red-500">*</Text>
      )}
    </View>
    {children}
  </View>
);

/**
 * UI Atom: Input — text input field
 */
export const Input = ({
  value,
  onChange,
  placeholder,
  readonly,
  numeric,
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  readonly?: boolean;
  numeric?: boolean;
}) => {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor="#9ca3af"
      editable={!readonly}
      keyboardType={numeric ? "decimal-pad" : "default"}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={`rounded-xl px-3 py-2.5 text-[15px] ${
        readonly ? "bg-gray-50 text-gray-400" : "bg-white text-gray-900"
      }`}
      style={{
        borderWidth: 1.5,
        borderColor: readonly ? "#e5e7eb" : focused ? "#10b981" : "#e5e7eb",
        fontFamily: readonly ? MONO : undefined,
      }}
    />
  );
};

/**
 * UI Atom: PickerField — dropdown selector with modal
 */
export const PickerField = ({
  title,
  options,
  value,
  onSelect,
}: {
  title: string;
  options: string[];
  value: string;
  onSelect: (v: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
        className="flex-row items-center justify-between bg-white rounded-xl px-3 py-2.5"
        style={{ borderWidth: 1.5, borderColor: "#e5e7eb" }}
      >
        <Text
          className={`text-[13px] flex-1 ${value ? "text-gray-900" : "text-gray-400"}`}
        >
          {value || "Select…"}
        </Text>
        <MaterialIcons name="keyboard-arrow-down" size={18} color="#6b7280" />
      </TouchableOpacity>
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <TouchableOpacity
          className="flex-1 bg-black/50"
          activeOpacity={1}
          onPress={() => setOpen(false)}
        />
        <View className="bg-white rounded-t-3xl">
          <View className="items-center py-3">
            <View className="w-10 h-1 rounded-full bg-gray-300" />
          </View>
          <View className="flex-row justify-between items-center px-5 pb-3 border-b border-gray-100">
            <Text className="text-[15px] font-bold text-gray-900">{title}</Text>
            <TouchableOpacity onPress={() => setOpen(false)} hitSlop={8}>
              <Text className="text-[13px] font-semibold text-emerald-700">
                Done
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            style={{ maxHeight: 300 }}
            keyboardShouldPersistTaps="handled"
          >
            {options.map((opt) => (
              <TouchableOpacity
                key={opt}
                onPress={() => {
                  onSelect(opt);
                  setOpen(false);
                }}
                activeOpacity={0.7}
                className={`flex-row justify-between items-center px-5 py-3.5 border-b border-gray-50 ${
                  opt === value ? "bg-emerald-50" : ""
                }`}
              >
                <Text
                  className={`text-[16px] ${
                    opt === value ? "font-bold text-[#1a4d2e]" : "text-gray-700"
                  }`}
                >
                  {opt}
                </Text>
                {opt === value && (
                  <MaterialIcons name="check" size={16} color="#10b981" />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View className="h-6" />
        </View>
      </Modal>
    </View>
  );
};

/**
 * UI Atom: Banner — info/warning notification
 */
export const Banner = ({
  type,
  text,
}: {
  type: "info" | "warning";
  text: string;
}) => (
  <View
    className={`flex-row gap-2.5 rounded-xl p-3 mb-3 ${
      type === "info" ? "bg-emerald-50" : "bg-amber-50"
    }`}
    style={{
      borderLeftWidth: 4,
      borderLeftColor: type === "info" ? "#10b981" : "#f59e0b",
    }}
  >
    <MaterialIcons
      name={type === "info" ? "info" : "warning"}
      size={18}
      color={type === "info" ? "#065f46" : "#92400e"}
      style={{ marginTop: 1 }}
    />
    <Text
      className={`flex-1 text-[14px] leading-6 ${
        type === "info" ? "text-emerald-900" : "text-amber-900"
      }`}
    >
      {text}
    </Text>
  </View>
);

/**
 * UI Atom: Btn — action button
 */
export const Btn = ({
  label,
  onPress,
  disabled,
  ghost,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  ghost?: boolean;
}) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.8}
    className={`px-5 py-2.5 rounded-xl ${
      ghost
        ? "bg-transparent border border-gray-200"
        : disabled
          ? "bg-gray-300"
          : "bg-[#064E3B]"
    }`}
  >
    <Text
      className={`text-[15px] font-bold ${ghost ? "text-gray-400" : "text-white"}`}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

/**
 * UI Atom: StepBadge — step number display
 */
export const StepBadge = ({ step }: { step: number }) => (
  <View className="bg-[#064E3B] rounded-xl px-3 py-2 items-center">
    <Text
      className="text-[22px] font-bold text-white"
      style={{ fontFamily: MONO, lineHeight: 26 }}
    >
      {String(step).padStart(2, "0")}
    </Text>
    <Text className="text-[8px] font-bold tracking-widest uppercase text-white/50 mt-0.5">
      STEP
    </Text>
  </View>
);
