import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { FLAG_TO_ID, STATUS_FLAGS, type StatusFlag } from "@/lib/supabase-types";
import { insertRemark } from "@/lib/supabase";

const FLAG_META: Partial<
  Record<
    StatusFlag,
    { label: string; icon: keyof typeof MaterialIcons.glyphMap; color: string }
  >
> = {
  no_flag: { label: "No flag", icon: "flag", color: "#9ca3af" },
  complete: { label: "Complete", icon: "check-circle", color: "#22c55e" },
  incomplete_info: { label: "Incomplete", icon: "info", color: "#3b82f6" },
  wrong_information: { label: "Wrong info", icon: "error", color: "#ef4444" },
  needs_revision: { label: "Needs revision", icon: "edit", color: "#f97316" },
  on_hold: { label: "On hold", icon: "pause-circle", color: "#9ca3af" },
  urgent: { label: "Urgent", icon: "warning", color: "#f59e0b" },
  cancelled: { label: "Cancelled", icon: "cancel", color: "#ef4444" },
};

function FlagPicker({
  visible,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  value: StatusFlag;
  onSelect: (v: StatusFlag) => void;
  onClose: () => void;
}) {
  const options = useMemo(
    () => STATUS_FLAGS.filter((f) => f !== "all"),
    [],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/50 items-center justify-center px-4" onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl w-full max-w-sm overflow-hidden"
          style={{ elevation: 10 }}
        >
          <View className="px-4 py-3 bg-[#064E3B]">
            <Text className="text-white text-[13px] font-bold">Status flag</Text>
          </View>
          <ScrollView className="max-h-[360px]">
            {options.map((f) => {
              const meta = FLAG_META[f];
              const active = value === f;
              return (
                <TouchableOpacity
                  key={f}
                  activeOpacity={0.8}
                  onPress={() => {
                    onSelect(f);
                    onClose();
                  }}
                  className={`flex-row items-center gap-3 px-4 py-3 border-b border-gray-100 ${active ? "bg-emerald-50" : "bg-white"}`}
                >
                  <MaterialIcons
                    name={meta?.icon ?? "flag"}
                    size={18}
                    color={meta?.color ?? "#9ca3af"}
                  />
                  <Text className="text-[13px] font-semibold text-gray-800">
                    {meta?.label ?? f}
                  </Text>
                  {active && (
                    <MaterialIcons name="check" size={18} color="#059669" style={{ marginLeft: "auto" as any }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function StageRemarkBox({
  prId,
  userId,
  stageKey,
  stageLabel,
}: {
  prId: string;
  userId: string;
  stageKey: string;
  stageLabel: string;
}) {
  const [text, setText] = useState("");
  const [flag, setFlag] = useState<StatusFlag>("no_flag");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const meta = FLAG_META[flag] ?? FLAG_META.no_flag!;

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const full = `Canvassing · ${stageKey} · ${stageLabel}: ${trimmed}`;
      await insertRemark(prId, userId, full, FLAG_TO_ID[flag]);
      setText("");
      setFlag("no_flag");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not save remark.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm" style={{ elevation: 2 }}>
      <View className="px-4 pt-3 pb-2">
        <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
          Remarks & Flag
        </Text>
        <View className="flex-row items-center gap-2 mt-2">
          <TouchableOpacity
            onPress={() => setPickerOpen(true)}
            activeOpacity={0.85}
            className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50"
          >
            <MaterialIcons name={meta.icon} size={16} color={meta.color} />
            <Text className="text-[12px] font-bold text-gray-700">{meta.label}</Text>
            <MaterialIcons name="keyboard-arrow-down" size={18} color="#9ca3af" />
          </TouchableOpacity>
          <View className="flex-1" />
          <TouchableOpacity
            onPress={submit}
            disabled={saving || !text.trim()}
            activeOpacity={0.85}
            className={`flex-row items-center gap-1.5 px-3 py-2 rounded-xl ${saving || !text.trim() ? "bg-gray-300" : "bg-[#064E3B]"}`}
          >
            {saving ? (
              <Text className="text-[12px] font-bold text-white">Saving…</Text>
            ) : (
              <>
                <MaterialIcons name="send" size={14} color="#ffffff" />
                <Text className="text-[12px] font-bold text-white">Add</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        <View className="mt-2">
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={`Add a remark for ${stageLabel}…`}
            placeholderTextColor="#9ca3af"
            multiline
            className="min-h-[44px] text-[13px] text-gray-800"
            style={{
              borderWidth: 1,
              borderColor: "#e5e7eb",
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: "#ffffff",
            }}
          />
        </View>
      </View>
      <FlagPicker
        visible={pickerOpen}
        value={flag}
        onSelect={setFlag}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}
