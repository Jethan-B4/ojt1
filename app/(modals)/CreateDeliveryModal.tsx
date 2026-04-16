import React from "react";
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";

export default function CreateDeliveryModal({
  visible,
  deliveryNo,
  setDeliveryNo,
  poOptions,
  selectedPoId,
  setSelectedPoId,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  deliveryNo: string;
  setDeliveryNo: (v: string) => void;
  poOptions: any[];
  selectedPoId: number | null;
  setSelectedPoId: (v: number) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-white p-4 gap-3">
        <Text className="text-lg font-bold">Log Delivery</Text>
        <TextInput
          value={deliveryNo}
          onChangeText={setDeliveryNo}
          placeholder="Delivery No."
          className="border border-gray-300 rounded-xl px-3 py-2.5"
        />
        <Text className="text-xs text-gray-500">Select PO (served status)</Text>
        <ScrollView className="max-h-56">
          {poOptions.map((p) => (
            <TouchableOpacity
              key={p.id}
              onPress={() => setSelectedPoId(Number(p.id))}
              className={`p-3 rounded-xl border mb-2 ${
                Number(selectedPoId) === Number(p.id)
                  ? "border-[#064E3B] bg-green-50"
                  : "border-gray-200"
              }`}
            >
              <Text className="font-semibold">{p.po_no}</Text>
              <Text className="text-xs text-gray-500">{p.supplier}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View className="flex-row gap-2 mt-auto">
          <TouchableOpacity
            onPress={onClose}
            className="flex-1 bg-gray-100 py-3 rounded-xl items-center"
          >
            <Text>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onSubmit}
            className="flex-1 bg-[#064E3B] py-3 rounded-xl items-center"
          >
            <Text className="text-white">Create</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

