import React from "react";
import { ScrollView, Text, View } from "react-native";

export default function DeliveryModule() {
  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 16 }}>
      <View className="items-center justify-center py-24">
        <Text className="text-5xl mb-4">📦</Text>
        <Text className="text-[16px] font-bold text-gray-700 mb-2">Delivery & Inspection</Text>
        <Text className="text-[13px] text-gray-500 text-center leading-5 max-w-[280px]">
          Track deliveries and inspection reports here.
        </Text>
      </View>
    </ScrollView>
  );
}
