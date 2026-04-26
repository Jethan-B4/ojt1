import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React from "react";
import { Alert, Text, TouchableOpacity, View } from "react-native";
import WebView from "react-native-webview";

export function buildIARHtml(d: {
  entityName?: string;
  supplier?: string;
  iarNo?: string;
  poNo?: string;
  poDate?: string;
  requisitioningOffice?: string;
  invoiceNo?: string;
  invoiceDate?: string;
  responsibilityCenter?: string;
  dateInspected?: string;
  dateReceived?: string;
}) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    body { font-family: "Times New Roman", serif; font-size: 11pt; line-height: 1.25; margin: 0; color: #111; }
    .topnote { text-align: right; font-size: 9pt; margin-bottom: 2mm; }
    .title { text-align: center; font-size: 14pt; font-weight: 700; letter-spacing: 0.3px; margin: 0 0 2mm; }
    table { width: 100%; border-collapse: collapse; }
    .meta td, .meta th, .items td, .items th, .foot td { border: 1px solid #111; padding: 4px 6px; vertical-align: top; }
    .meta { margin-bottom: 2mm; }
    .meta td { height: 8mm; }
    .items th { text-align: center; font-size: 9.5pt; }
    .items td { height: 9mm; font-size: 10pt; }
    .desc-col { width: 38%; }
    .num { text-align: right; }
    .center { text-align: center; }
    .section-head { font-weight: 700; margin-bottom: 2mm; }
    .foot { margin-top: 2mm; table-layout: fixed; }
    .foot .panel { height: 48mm; }
    .spacer { height: 8mm; }
    .sig { margin-top: 10mm; text-align: center; font-weight: 700; }
    .small { font-size: 9.5pt; }
  </style>
</head>
<body>
  <div class="topnote">Appendix 62</div>
  <div class="title">INSPECTION AND ACCEPTANCE REPORT</div>
  <table class="meta">
    <tr>
      <td>Entity Name : ${d.entityName ?? ""}</td>
      <td>Fund Cluster :</td>
    </tr>
    <tr>
      <td>Supplier : ${d.supplier ?? ""}</td>
      <td>IAR No. : ${d.iarNo ?? ""}</td>
    </tr>
    <tr>
      <td>PO No./Date : ${d.poNo ?? ""} ${d.poDate ?? ""}</td>
      <td>Date : ${d.invoiceDate ?? ""}</td>
    </tr>
    <tr>
      <td>Requisitioning Office/Dept. : ${d.requisitioningOffice ?? ""}</td>
      <td>Invoice No. : ${d.invoiceNo ?? ""}</td>
    </tr>
    <tr>
      <td>Responsibility Center Code : ${d.responsibilityCenter ?? ""}</td>
      <td>Date : ${d.invoiceDate ?? ""}</td>
    </tr>
  </table>
  <table class="items">
    <tr>
      <th>Stock/Property No.</th>
      <th>Unit</th>
      <th class="desc-col">Description</th>
      <th>Quantity</th>
      <th>Unit Cost</th>
      <th>Amount</th>
    </tr>
    <tr><td>&nbsp;</td><td></td><td></td><td class="num"></td><td class="num"></td><td class="num"></td></tr>
    <tr><td>&nbsp;</td><td></td><td></td><td class="num"></td><td class="num"></td><td class="num"></td></tr>
    <tr><td>&nbsp;</td><td></td><td></td><td class="num"></td><td class="num"></td><td class="num"></td></tr>
    <tr><td>&nbsp;</td><td></td><td></td><td class="num"></td><td class="num"></td><td class="num"></td></tr>
  </table>
  <table class="foot">
    <tr>
      <td class="panel">
        <div class="section-head">INSPECTION</div>
        <div class="small">Inspected, verified and found in order as to quantity and specifications</div>
        <div class="spacer"></div>
        <div>Date Inspected : ${d.dateInspected ?? ""}</div>
        <div class="sig">Inspection Officer/Inspection Committee</div>
      </td>
      <td class="panel">
        <div class="section-head">ACCEPTANCE</div>
        <div class="small">Complete</div>
        <div class="small">Partial (pls. specify quantity)</div>
        <div class="spacer"></div>
        <div>Date Received : ${d.dateReceived ?? ""}</div>
        <div class="sig">ARPT/SUPPLY OFFICER</div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export default function IARPreviewPanel({ html }: { html: string }) {
  const onPrint = async () => {
    try { await Print.printAsync({ html }); } catch {}
  };
  const onDownload = async () => {
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
      else Alert.alert("Saved", uri);
    } catch {}
  };
  return (
    <View style={{ flex: 1 }}>
      <View className="flex-row gap-2 px-3 py-2 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={onPrint} className="flex-1 bg-gray-100 rounded-xl py-2 items-center"><Text>Print</Text></TouchableOpacity>
        <TouchableOpacity onPress={onDownload} className="flex-1 bg-[#064E3B] rounded-xl py-2 items-center"><Text className="text-white">Download PDF</Text></TouchableOpacity>
      </View>
      <WebView source={{ html }} style={{ flex: 1 }} originWhitelist={["*"]} />
    </View>
  );
}

