import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase/client";

interface PORecord {
  id: string | number;
  poNo: string;
  supplier: string;
  officeSection: string;
  date: string;
  status: string;
  amount?: number;
  prNo?: string;
  description?: string;
}

interface PODetailsModalProps {
  visible: boolean;
  onClose: () => void;
  deliveryId: string | number | null;
}

export function PODetailsModal({
  visible,
  onClose,
  deliveryId,
}: PODetailsModalProps) {
  const [loading, setLoading] = useState(false);
  const [poDetails, setPODetails] = useState<PORecord | null>(null);

  useEffect(() => {
    if (visible && deliveryId) {
      loadPODetails();
    }
  }, [visible, deliveryId]);

  const loadPODetails = async () => {
    if (!deliveryId) return;
    
    setLoading(true);
    try {
      // Fetch PO details linked to this delivery
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          id,
          po_no,
          pr_no,
          supplier,
          office_section,
          date,
          status,
          amount,
          description
        `)
        .eq('delivery_id', deliveryId)
        .single();
      
      if (error) {
        console.error("Failed to load PO details:", error);
        Alert.alert("Error", "Failed to load PO details. Please try again.");
        onClose();
        return;
      }
      
      const poRecord: PORecord = {
        id: data.id,
        poNo: data.po_no,
        prNo: data.pr_no,
        supplier: data.supplier,
        officeSection: data.office_section,
        date: data.date,
        status: data.status,
        amount: data.amount,
        description: data.description
      };
      
      setPODetails(poRecord);
    } catch (error) {
      console.error("Failed to load PO details:", error);
      Alert.alert("Error", "Failed to load PO details. Please try again.");
      onClose();
    } finally {
      setLoading(false);
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
              <Text className="text-white font-bold text-lg">PO Details</Text>
              <TouchableOpacity onPress={onClose}>
                <MaterialIcons name="close" size={24} color="white" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Content */}
          {loading ? (
            <View className="p-8 items-center">
              <ActivityIndicator size="large" color="#064E3B" />
              <Text className="mt-4 text-gray-600">Loading PO details...</Text>
            </View>
          ) : poDetails ? (
            <ScrollView className="p-4">
              <View className="bg-gray-50 rounded-xl p-4 mb-4">
                <Text className="text-sm text-gray-500 mb-1">PO Number</Text>
                <Text className="text-lg font-bold text-gray-900">{poDetails.poNo}</Text>
              </View>

              <View className="bg-gray-50 rounded-xl p-4 mb-4">
                <Text className="text-sm text-gray-500 mb-1">PR Number</Text>
                <Text className="text-lg font-semibold text-gray-900">{poDetails.prNo || 'N/A'}</Text>
              </View>

              <View className="bg-gray-50 rounded-xl p-4 mb-4">
                <Text className="text-sm text-gray-500 mb-1">Supplier</Text>
                <Text className="text-lg font-semibold text-gray-900">{poDetails.supplier}</Text>
              </View>

              <View className="bg-gray-50 rounded-xl p-4 mb-4">
                <Text className="text-sm text-gray-500 mb-1">Office Section</Text>
                <Text className="text-lg font-semibold text-gray-900">{poDetails.officeSection}</Text>
              </View>

              <View className="bg-gray-50 rounded-xl p-4 mb-4">
                <Text className="text-sm text-gray-500 mb-1">Date</Text>
                <Text className="text-lg font-semibold text-gray-900">{poDetails.date}</Text>
              </View>

              <View className="bg-gray-50 rounded-xl p-4 mb-4">
                <Text className="text-sm text-gray-500 mb-1">Status</Text>
                <Text className="text-lg font-semibold text-gray-900">{poDetails.status}</Text>
              </View>

              {poDetails.amount && (
                <View className="bg-gray-50 rounded-xl p-4 mb-4">
                  <Text className="text-sm text-gray-500 mb-1">Amount</Text>
                  <Text className="text-lg font-semibold text-gray-900">₱{poDetails.amount.toLocaleString()}</Text>
                </View>
              )}

              {poDetails.description && (
                <View className="bg-gray-50 rounded-xl p-4 mb-4">
                  <Text className="text-sm text-gray-500 mb-1">Description</Text>
                  <Text className="text-base text-gray-900">{poDetails.description}</Text>
                </View>
              )}
            </ScrollView>
          ) : (
            <View className="p-8 items-center">
              <MaterialIcons name="error" size={48} color="#ef4444" />
              <Text className="mt-4 text-gray-600 text-center">No PO details found for this delivery.</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
