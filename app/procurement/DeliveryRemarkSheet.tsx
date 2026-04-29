import MaterialIcons from "@expo/vector-icons/MaterialIcons";
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
import { supabase } from "../../lib/supabase/client";

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

interface DeliveryRemark {
  id: string;
  delivery_id: string | number;
  user_id: string;
  user_name: string;
  remark: string;
  created_at: string;
}

export function DeliveryRemarkSheet({
  visible,
  record,
  currentUser,
  onClose,
}: DeliveryRemarkSheetProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deliveryRemarks, setDeliveryRemarks] = useState<DeliveryRemark[]>([]);
  const [newRemark, setNewRemark] = useState("");

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
      const { data, error } = await supabase
        .from('delivery_remarks')
        .select('*')
        .eq('delivery_id', record.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error("Failed to load delivery remarks:", error);
      } else {
        setDeliveryRemarks(data || []);
      }
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

      const { error } = await supabase
        .from('delivery_remarks')
        .insert(remarkData);
      
      if (error) {
        console.error("Failed to add remark:", error);
        Alert.alert("Error", "Failed to add remark. Please try again.");
      } else {
        setNewRemark("");
        await loadDeliveryRemarks(); // Reload remarks
      }
    } catch (error) {
      console.error("Failed to add remark:", error);
      Alert.alert("Error", "Failed to add remark. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <View className="absolute inset-0 bg-black/50 z-50">
      <View className="flex-1 justify-end">
        <View className="bg-white rounded-t-3xl">
          {/* Header */}
          <View className="bg-[#064E3B] px-4 py-4 rounded-t-3xl">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-white font-bold text-lg">Delivery Remarks</Text>
                {record && (
                  <Text className="text-white/80 text-sm">{record.deliveryNo}</Text>
                )}
              </View>
              <TouchableOpacity onPress={onClose}>
                <MaterialIcons name="close" size={24} color="white" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Add Remark Section */}
          <View className="p-4 border-b border-gray-200">
            <View className="flex-row gap-2">
              <TextInput
                value={newRemark}
                onChangeText={setNewRemark}
                placeholder="Add a remark..."
                className="flex-1 bg-gray-100 rounded-lg px-3 py-2 text-base"
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                onPress={handleAddRemark}
                disabled={!newRemark.trim() || saving}
                className="bg-[#064E3B] px-4 py-2 rounded-lg items-center justify-center disabled:opacity-50"
              >
                {saving ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <MaterialIcons name="send" size={20} color="white" />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Remarks List */}
          <ScrollView className="flex-1 max-h-96">
            {loading ? (
              <View className="p-8 items-center">
                <ActivityIndicator size="large" color="#064E3B" />
                <Text className="mt-4 text-gray-600">Loading remarks...</Text>
              </View>
            ) : deliveryRemarks.length > 0 ? (
              deliveryRemarks.map((remark) => (
                <View key={remark.id} className="p-4 border-b border-gray-100">
                  <View className="flex-row justify-between items-start mb-2">
                    <Text className="font-semibold text-gray-900">{remark.user_name}</Text>
                    <Text className="text-xs text-gray-500">
                      {new Date(remark.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text className="text-gray-700">{remark.remark}</Text>
                </View>
              ))
            ) : (
              <View className="p-8 items-center">
                <MaterialIcons name="chat-bubble-outline" size={48} color="#9ca3af" />
                <Text className="mt-4 text-gray-500 text-center">No remarks yet. Add the first remark above.</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}
