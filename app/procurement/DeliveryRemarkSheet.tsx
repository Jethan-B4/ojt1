import { MaterialIcons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { api } from "../services/api";

interface DeliveryRecord {
  id: string | number;
  deliveryNo: string;
  remarks?: string;
}

interface DeliveryRemarkSheetProps {
  visible: boolean;
  record: DeliveryRecord | null;
  currentUser: any;
  onClose: () => void;
}

export function DeliveryRemarkSheet({
  visible,
  record,
  currentUser,
  onClose,
}: DeliveryRemarkSheetProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newRemark, setNewRemark] = useState("");
  const [deliveryRemarks, setDeliveryRemarks] = useState<any[]>([]);

  // Load delivery remarks when sheet opens
  useEffect(() => {
    if (visible && record) {
      loadDeliveryRemarks();
    }
  }, [visible, record]);

  const loadDeliveryRemarks = async () => {
    if (!record) return;
    
    setLoading(true);
    try {
      // Fetch delivery-specific remarks
      const response = await api.get(`/procurement/deliveries/${record.id}/remarks`);
      setDeliveryRemarks(response.data || []);
    } catch (error) {
      console.error("Failed to load delivery remarks:", error);
      setDeliveryRemarks([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRemark = async () => {
    if (!newRemark.trim() || !record || !currentUser) return;

    setSaving(true);
    try {
      const remarkData = {
        delivery_id: record.id,
        user_id: currentUser.id,
        user_name: `${currentUser.first_name} ${currentUser.last_name}`,
        remark: newRemark.trim(),
        created_at: new Date().toISOString(),
      };

      await api.post(`/procurement/deliveries/${record.id}/remarks`, remarkData);
      
      // Refresh remarks list
      await loadDeliveryRemarks();
      setNewRemark("");
    } catch (error) {
      console.error("Failed to add delivery remark:", error);
      Alert.alert("Error", "Failed to add remark. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <View className="absolute inset-0 bg-black/50 z-50">
      <View className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl">
        {/* Header */}
        <View className="bg-[#064E3B] px-4 py-4 rounded-t-3xl">
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-[10px] font-semibold tracking-widest uppercase text-white/40">
                Delivery Remarks
              </Text>
              <Text className="text-[16px] font-extrabold text-white">
                {record?.deliveryNo || "Unknown Delivery"}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="w-8 h-8 bg-white/10 rounded-full items-center justify-center"
            >
              <MaterialIcons name="close" size={18} color="white" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Content */}
        <View className="flex-1" style={{ maxHeight: 400 }}>
          {loading ? (
            <View className="flex-1 items-center justify-center py-8">
              <ActivityIndicator size="small" color="#064E3B" />
              <Text className="text-gray-500 mt-2 text-sm">Loading remarks...</Text>
            </View>
          ) : (
            <ScrollView className="flex-1 px-4 py-4">
              {/* Existing remarks */}
              {deliveryRemarks.length > 0 ? (
                <View className="space-y-3 mb-4">
                  {deliveryRemarks.map((remark, index) => (
                    <View key={index} className="bg-gray-50 rounded-xl p-3">
                      <View className="flex-row items-start justify-between mb-2">
                        <View className="flex-1">
                          <Text className="text-sm font-semibold text-gray-900">
                            {remark.user_name}
                          </Text>
                          <Text className="text-xs text-gray-500">
                            {new Date(remark.created_at).toLocaleString()}
                          </Text>
                        </View>
                      </View>
                      <Text className="text-sm text-gray-700 leading-relaxed">
                        {remark.remark}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View className="items-center py-6">
                  <MaterialIcons name="chat-bubble-outline" size={32} color="#d1d5db" />
                  <Text className="text-gray-500 text-sm mt-2">No remarks yet</Text>
                </View>
              )}

              {/* Add new remark */}
              <View className="border-t border-gray-100 pt-4">
                <Text className="text-sm font-semibold text-gray-700 mb-2">
                  Add Remark
                </Text>
                <View className="bg-gray-50 rounded-xl p-3">
                  <TextInput
                    value={newRemark}
                    onChangeText={setNewRemark}
                    placeholder="Enter your remark..."
                    multiline
                    numberOfLines={3}
                    className="text-sm text-gray-900 placeholder-gray-400"
                    style={{ textAlignVertical: "top" }}
                  />
                </View>
                <TouchableOpacity
                  onPress={handleAddRemark}
                  disabled={!newRemark.trim() || saving}
                  activeOpacity={0.8}
                  className="bg-[#064E3B] rounded-xl px-4 py-2.5 mt-3 flex-row items-center justify-center"
                  style={{ opacity: newRemark.trim() && !saving ? 1 : 0.5 }}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <>
                      <MaterialIcons name="add" size={18} color="white" />
                      <Text className="text-white font-semibold text-sm ml-1">
                        Add Remark
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </View>
  );
}
