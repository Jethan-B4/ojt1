/**
 * ViewDeliveryDocumentsModal.tsx — Shows PO, IAR, LOA, DV documents for a delivery
 */

import DVPreviewPanel, { buildDVHtml } from "@/app/(components)/DVPreviewPanel";
import IARPreviewPanel, { buildIARHtml } from "@/app/(components)/IARPreviewPanel";
import LOAPreviewPanel, { buildLOAHtml } from "@/app/(components)/LOAPreviewPanel";
import POPreviewPanel, { buildPOHtml, type POPreviewData } from "@/app/(components)/POPreviewPanel";
import { preloadLogos } from "@/app/lib/documentAssets";
import {
  fetchDVByDelivery,
  fetchDeliveryById,
  fetchIARByDelivery,
  fetchLOAByDelivery,
} from "@/lib/supabase/delivery";
import { fetchPOWithItemsById, type POItemRow, type PORow } from "@/lib/supabase/po";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Platform, Text, TouchableOpacity, View } from "react-native";

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const fmt = (n: number) =>
  n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ViewDeliveryDocumentsModal({
  visible,
  onClose,
  deliveryId,
  initialTab,
}: {
  visible: boolean;
  onClose: () => void;
  deliveryId?: string | number | null;
  initialTab?: "po" | "iar" | "loa" | "dv";
}) {
  const [tab, setTab] = useState<"po" | "iar" | "loa" | "dv">(initialTab ?? "po");
  const [delivery, setDelivery] = useState<any>(null);
  const [iar, setIar] = useState<any>(null);
  const [loa, setLoa] = useState<any>(null);
  const [dv, setDv] = useState<any>(null);
  const [poHeader, setPoHeader] = useState<PORow | null>(null);
  const [poItems, setPoItems] = useState<POItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    preloadLogos();
  }, []);

  useEffect(() => {
    if (visible && deliveryId) {
      setLoading(true);
      const id = Number(deliveryId);
      Promise.all([
        fetchDeliveryById(id),
        fetchIARByDelivery(id),
        fetchLOAByDelivery(id),
        fetchDVByDelivery(id),
      ])
        .then(async ([deliveryData, iarData, loaData, dvData]) => {
          setDelivery(deliveryData);
          setIar(iarData);
          setLoa(loaData);
          setDv(dvData);
          
          // Fetch PO details if delivery has po_id
          if (deliveryData?.po_id) {
            try {
              const po = await fetchPOWithItemsById(String(deliveryData.po_id));
              setPoHeader(po.header);
              setPoItems(po.items);
            } catch (e) {
              console.error("Failed to load PO details:", e);
            }
          }
          setLoading(false);
        })
        .catch(() => {
          setLoading(false);
        });
    }
  }, [visible, deliveryId]);

  // Build PO preview data
  const poPreviewData: POPreviewData | null = poHeader
    ? {
        poNo: poHeader.po_no ?? undefined,
        prNo: poHeader.pr_no ?? undefined,
        supplier: poHeader.supplier ?? undefined,
        address: poHeader.address ?? undefined,
        tin: poHeader.tin ?? undefined,
        procurementMode: poHeader.procurement_mode ?? undefined,
        deliveryPlace: poHeader.delivery_place ?? undefined,
        deliveryTerm: poHeader.delivery_term ?? undefined,
        dateOfDelivery: poHeader.delivery_date ?? undefined,
        paymentTerm: poHeader.payment_term ?? undefined,
        date: poHeader.date ?? undefined,
        fundCluster: poHeader.fund_cluster ?? undefined,
        orsNo: poHeader.ors_no ?? undefined,
        orsDate: poHeader.ors_date ?? undefined,
        fundsAvailable: poHeader.funds_available ?? undefined,
        orsAmount: Number(poHeader.ors_amount) || 0,
        officeSection: poHeader.office_section ?? undefined,
        totalAmount: Number(poHeader.total_amount) || 0,
        officialName: poHeader.official_name ?? undefined,
        officialDesig: poHeader.official_desig ?? undefined,
        accountantName: poHeader.accountant_name ?? undefined,
        accountantDesig: poHeader.accountant_desig ?? undefined,
        items: poItems,
      }
    : null;

  const poHtml = poPreviewData ? buildPOHtml(poPreviewData) : "";
  const poTemplateHtml = poPreviewData ? buildPOHtml(poPreviewData, { template: true }) : "";
  if (!visible) return null;

  const tabs = [
    { key: "po", label: "PO", icon: "receipt" as const },
    { key: "iar", label: "IAR", icon: "inventory" as const },
    { key: "loa", label: "LOA", icon: "check-circle" as const },
    { key: "dv", label: "DV", icon: "payment" as const },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-white">
        {/* Header */}
        <View className="bg-[#064E3B] px-5 pt-5 pb-0">
          <View className="flex-row items-start justify-between mb-4">
            <View className="flex-1 pr-3">
              <Text className="text-[10px] font-bold tracking-widest uppercase text-white/40">
                Delivery Documents
              </Text>
              <Text className="text-[18px] font-black text-white mt-0.5" style={{ fontFamily: MONO }}>
                {delivery?.delivery_no ?? "—"}
              </Text>
              <Text className="text-[11.5px] text-white/60 mt-0.5">
                PO {delivery?.po_no} · {delivery?.supplier}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={10}
              className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center"
            >
              <MaterialIcons name="close" size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Tab toggle */}
          <View className="flex-row bg-black/20 rounded-xl p-1">
            {tabs.map((t) => (
              <TouchableOpacity
                key={t.key}
                onPress={() => setTab(t.key as any)}
                activeOpacity={0.8}
                className={`flex-1 py-2 rounded-lg items-center flex-row justify-center gap-1 ${tab === t.key ? "bg-white" : ""}`}
              >
                <MaterialIcons
                  name={t.icon}
                  size={14}
                  color={tab === t.key ? "#064E3B" : "rgba(255,255,255,0.5)"}
                />
                <Text
                  className={`text-[12px] font-bold ${tab === t.key ? "text-[#064E3B]" : "text-white/50"}`}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Loading */}
        {loading && (
          <View className="flex-1 items-center justify-center gap-3">
            <ActivityIndicator size="large" color="#064E3B" />
            <Text className="text-[13px] text-gray-400">Loading documents...</Text>
          </View>
        )}

        {/* PO Tab */}
        {!loading && tab === "po" && poPreviewData && (
          <POPreviewPanel html={poHtml} templateHtml={poTemplateHtml} showActions />
        )}
        {!loading && tab === "po" && !poPreviewData && (
          <View className="flex-1 items-center justify-center p-8">
            <MaterialIcons name="receipt-long" size={48} color="#9ca3af" />
            <Text className="mt-4 text-gray-500 text-center">No PO document available</Text>
          </View>
        )}

        {/* IAR Tab */}
        {!loading && tab === "iar" && (
          <IARPreviewPanel
            html={buildIARHtml({
              entityName: "DEPARTMENT OF AGRARIAN REFORM-CAM SUR 1",
              supplier: delivery?.supplier,
              iarNo: iar?.iar_no,
              poNo: delivery?.po_no,
              invoiceNo: iar?.invoice_no,
              invoiceDate: iar?.invoice_date,
              requisitioningOffice: delivery?.office_section,
              dateInspected: iar?.inspected_at,
              dateReceived: iar?.received_at,
            })}
          />
        )}

        {/* LOA Tab */}
        {!loading && tab === "loa" && (
          <LOAPreviewPanel
            html={buildLOAHtml({
              supplier: delivery?.supplier,
              invoiceNo: loa?.invoice_no,
              poNo: delivery?.po_no,
              acceptanceDate: loa?.accepted_at,
              signatoryName: loa?.accepted_by_name,
              signatoryTitle: loa?.accepted_by_title,
              provincialOffice: "DARPO-CAMARINES SUR I",
            })}
          />
        )}

        {/* DV Tab */}
        {!loading && tab === "dv" && (
          <DVPreviewPanel
            html={buildDVHtml({
              entityName: "DEPARTMENT OF AGRARIAN REFORM-CAM SUR 1",
              dvNo: dv?.dv_no,
              payee: delivery?.supplier,
              particulars: dv?.particulars,
              amountDue: dv?.amount_due,
              modeOfPayment: dv?.mode_of_payment,
              provincialOffice: "DARPO-CAMARINES SUR I",
            })}
          />
        )}
      </View>
    </Modal>
  );
}
