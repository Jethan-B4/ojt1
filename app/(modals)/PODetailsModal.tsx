import { MaterialIcons } from "@expo/vector-icons";
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
      <View className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl">
        {/* Header */}
        <View className="bg-[#064E3B] px-4 py-4 rounded-t-3xl">
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-[10px] font-semibold tracking-widest uppercase text-white/40">
                Purchase Order Details
              </Text>
              <Text className="text-[16px] font-extrabold text-white">
                {poDetails?.poNo || "Loading..."}
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
        <View className="flex-1" style={{ maxHeight: 500 }}>
          {loading ? (
            <View className="flex-1 items-center justify-center py-8">
              <ActivityIndicator size="small" color="#064E3B" />
              <Text className="text-gray-500 mt-2 text-sm">Loading PO details...</Text>
            </View>
          ) : poDetails ? (
            <ScrollView className="flex-1 px-4 py-4">
              {/* PO Information */}
              <View className="bg-gray-50 rounded-xl p-4 mb-4">
                <Text className="text-sm font-bold text-gray-900 mb-3">
                  Purchase Order Information
                </Text>
                
                <View className="space-y-2">
                  <View className="flex-row">
                    <Text className="text-xs text-gray-500 w-24">PO Number:</Text>
                    <Text className="text-xs font-semibold text-gray-900 flex-1">
                      {poDetails.poNo}
                    </Text>
                  </View>
                  
                  <View className="flex-row">
                    <Text className="text-xs text-gray-500 w-24">PR Number:</Text>
                    <Text className="text-xs font-semibold text-gray-900 flex-1">
                      {poDetails.prNo || "—"}
                    </Text>
                  </View>
                  
                  <View className="flex-row">
                    <Text className="text-xs text-gray-500 w-24">Supplier:</Text>
                    <Text className="text-xs font-semibold text-gray-900 flex-1">
                      {poDetails.supplier}
                    </Text>
                  </View>
                  
                  <View className="flex-row">
                    <Text className="text-xs text-gray-500 w-24">Office Section:</Text>
                    <Text className="text-xs font-semibold text-gray-900 flex-1">
                      {poDetails.officeSection}
                    </Text>
                  </View>
                  
                  <View className="flex-row">
                    <Text className="text-xs text-gray-500 w-24">Date:</Text>
                    <Text className="text-xs font-semibold text-gray-900 flex-1">
                      {poDetails.date}
                    </Text>
                  </View>
                  
                  <View className="flex-row">
                    <Text className="text-xs text-gray-500 w-24">Status:</Text>
                    <Text className="text-xs font-semibold text-gray-900 flex-1">
                      {poDetails.status}
                    </Text>
                  </View>
                  
                  {poDetails.amount && (
                    <View className="flex-row">
                      <Text className="text-xs text-gray-500 w-24">Amount:</Text>
                      <Text className="text-xs font-semibold text-gray-900 flex-1">
                        ₱{poDetails.amount.toLocaleString("en-PH", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Description */}
              {poDetails.description && (
                <View className="bg-gray-50 rounded-xl p-4 mb-4">
                  <Text className="text-sm font-bold text-gray-900 mb-2">
                    Description
                  </Text>
                  <Text className="text-xs text-gray-700 leading-relaxed">
                    {poDetails.description}
                  </Text>
                </View>
              )}

              {/* Close button */}
              <TouchableOpacity
                onPress={onClose}
                activeOpacity={0.8}
                className="bg-[#064E3B] rounded-xl px-4 py-3 mt-4 mb-4 flex-row items-center justify-center"
              >
                <MaterialIcons name="check" size={18} color="white" />
                <Text className="text-white font-semibold text-sm ml-1">
                  Close
                </Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <View className="flex-1 items-center justify-center py-8">
              <MaterialIcons name="error-outline" size={32} color="#d1d5db" />
              <Text className="text-gray-500 text-sm mt-2">No PO details found</Text>
              <TouchableOpacity
                onPress={onClose}
                className="mt-4 px-4 py-2 bg-gray-200 rounded-lg"
              >
                <Text className="text-gray-700 text-sm font-medium">Close</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
