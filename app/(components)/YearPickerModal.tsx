import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import {
    Modal,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useFiscalYear } from "../contexts/FiscalYearContext";

interface YearPickerModalProps {
  visible: boolean;
  onClose: () => void;
}

export function YearPickerModal({ visible, onClose }: YearPickerModalProps) {
  const { year, setYear, YEAR_RANGE, CURRENT_YEAR } = useFiscalYear();

  const handleSelectYear = (selectedYear: number) => {
    setYear(selectedYear);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/50">
        <View className="bg-white rounded-t-3xl">
          {/* Header */}
          <View className="bg-[#064E3B] px-4 py-3">
            <Text className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-0.5">
              Fiscal Year
            </Text>
            <Text className="text-[16px] font-extrabold text-white">
              Select Year
            </Text>
          </View>

          {/* Year list */}
          <ScrollView className="max-h-80">
            {YEAR_RANGE.map((y) => {
              const isSelected = y === year;
              const isFuture = y > CURRENT_YEAR;
              return (
                <TouchableOpacity
                  key={y}
                  onPress={() => handleSelectYear(y)}
                  disabled={isFuture}
                  activeOpacity={0.75}
                  className={`flex-row items-center justify-between px-4 py-3 border-b border-gray-100 ${
                    isFuture ? "opacity-50" : ""
                  }`}
                >
                  <View className="flex-row items-center gap-3">
                    <View
                      className={`w-5 h-5 rounded-full border-2 items-center justify-center ${
                        isSelected
                          ? "bg-[#064E3B] border-[#064E3B]"
                          : "border-gray-300"
                      }`}
                    >
                      {isSelected && (
                        <MaterialIcons name="check" size={12} color="white" />
                      )}
                    </View>
                    <Text
                      className={`text-[15px] font-semibold ${
                        isSelected ? "text-[#064E3B]" : "text-gray-700"
                      }`}
                    >
                      {y}
                    </Text>
                    {y === CURRENT_YEAR && (
                      <View className="bg-emerald-100 px-1.5 py-0.5 rounded-md">
                        <Text className="text-[9px] font-bold text-emerald-700">
                          Current
                        </Text>
                      </View>
                    )}
                  </View>
                  {isFuture && (
                    <Text className="text-[11px] text-gray-400 italic">
                      Future
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Footer */}
          <View className="px-4 py-3 bg-gray-50 border-t border-gray-200">
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.8}
              className="bg-gray-200 rounded-xl px-4 py-2.5 flex-row items-center justify-center"
            >
              <Text className="text-gray-700 font-semibold text-sm">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
