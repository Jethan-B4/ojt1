import DVPreviewPanel from "@/app/(components)/DVPreviewPanel";
import IARPreviewPanel, {
    buildIARHtml,
} from "@/app/(components)/IARPreviewPanel";
import LOAPreviewPanel from "@/app/(components)/LOAPreviewPanel";
import { preloadLogos } from "@/app/lib/documentAssets";
import {
    fetchDVByDelivery,
    fetchDeliveryById,
    fetchIARByDelivery,
    fetchLOAByDelivery,
} from "@/lib/supabase/delivery";
import React, { useEffect, useState } from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";

export default function ViewDeliveryModal({
  visible,
  onClose,
  viewTab,
  setViewTab,
  deliveryId,
}: {
  visible: boolean;
  onClose: () => void;
  viewTab: "iar" | "loa" | "dv";
  setViewTab: (v: "iar" | "loa" | "dv") => void;
  deliveryId?: string | number | null;
}) {
  const [active, setActive] = useState<any>(null);
  const [iar, setIar] = useState<any>(null);
  const [loa, setLoa] = useState<any>(null);
  const [dv, setDv] = useState<any>(null);
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
        .then(([deliveryData, iarData, loaData, dvData]) => {
          setActive(deliveryData);
          setIar(iarData);
          setLoa(loaData);
          setDv(dvData);
          setLoading(false);
        })
        .catch(() => {
          setLoading(false);
        });
    }
  }, [visible, deliveryId]);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-white">
        <View className="flex-row p-2 gap-2">
          {(["iar", "loa", "dv"] as const).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setViewTab(t)}
              className={`px-3 py-2 rounded-xl ${viewTab === t ? "bg-[#064E3B]" : "bg-gray-100"}`}
            >
              <Text className={viewTab === t ? "text-white" : "text-gray-700"}>
                {t.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={onClose}
            className="ml-auto px-3 py-2 rounded-xl bg-gray-100"
          >
            <Text>Close</Text>
          </TouchableOpacity>
        </View>
        {viewTab === "iar" && (
          <IARPreviewPanel
            html={buildIARHtml({
              entityName: "DEPARTMENT OF AGRARIAN REFORM-CAM SUR 1",
              supplier: active?.supplier,
              iarNo: iar?.iar_no,
              poNo: active?.po_no,
              invoiceNo: iar?.invoice_no,
              invoiceDate: iar?.invoice_date,
              requisitioningOffice: active?.office_section,
              dateInspected: iar?.inspected_at,
            })}
          />
        )}
        {viewTab === "loa" && (
          <LOAPreviewPanel
            data={{
              supplier: active?.supplier,
              invoiceNo: loa?.invoice_no,
              poNo: active?.po_no,
              acceptanceDate: loa?.accepted_at,
              signatoryName: loa?.accepted_by_name,
              signatoryTitle: loa?.accepted_by_title,
              provincialOffice: "DARPO-CAMARINES SUR I",
            }}
          />
        )}
        {viewTab === "dv" && (
          <DVPreviewPanel
            data={{
              entityName: "DEPARTMENT OF AGRARIAN REFORM-CAM SUR 1",
              dvNo: dv?.dv_no,
              payee: active?.supplier,
              particulars: dv?.particulars,
              amountDue: dv?.amount_due,
              modeOfPayment: dv?.mode_of_payment,
              provincialOffice: "DARPO-CAMARINES SUR I",
            }}
          />
        )}
      </View>
    </Modal>
  );
}
