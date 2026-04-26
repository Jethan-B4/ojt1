import DVPreviewPanel, { buildDVHtml } from "@/app/(components)/DVPreviewPanel";
import IARPreviewPanel, { buildIARHtml } from "@/app/(components)/IARPreviewPanel";
import LOAPreviewPanel, { buildLOAHtml } from "@/app/(components)/LOAPreviewPanel";
import React from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";

export default function ViewDeliveryModal({
  visible,
  onClose,
  viewTab,
  setViewTab,
  active,
  iar,
  loa,
  dv,
}: {
  visible: boolean;
  onClose: () => void;
  viewTab: "iar" | "loa" | "dv";
  setViewTab: (v: "iar" | "loa" | "dv") => void;
  active: any;
  iar: any;
  loa: any;
  dv: any;
}) {
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
            html={buildLOAHtml({
              supplier: active?.supplier,
              invoiceNo: loa?.invoice_no,
              poNo: active?.po_no,
              acceptanceDate: loa?.accepted_at,
              signatoryName: loa?.accepted_by_name,
              signatoryTitle: loa?.accepted_by_title,
            })}
          />
        )}
        {viewTab === "dv" && (
          <DVPreviewPanel
            html={buildDVHtml({
              entityName: "DEPARTMENT OF AGRARIAN REFORM-CAM SUR 1",
              dvNo: dv?.dv_no,
              payee: active?.supplier,
              particulars: dv?.particulars,
              amountDue: dv?.amount_due,
              modeOfPayment: dv?.mode_of_payment,
            })}
          />
        )}
      </View>
    </Modal>
  );
}

