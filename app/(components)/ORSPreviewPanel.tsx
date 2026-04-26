/**
 * ORSPreviewPanel.tsx — Shared ORS PDF preview module
 *
 * Mirrors the pattern of POPreviewPanel.tsx but renders the
 * Obligation Request and Status (ORS) form — Appendix 11.
 *
 * Exports:
 *   buildORSHtml(data: ORSPreviewData): string
 *     — Pure function; returns the full HTML string for the Appendix 11 form.
 *
 *   useORSPreviewActions(html: string)
 *     — Returns { handlePrint, handleDownload } bound to expo-print.
 *
 *   ORSPreviewPanel (default export)
 *     — Drop-in WebView panel with Print + Download PDF action buttons.
 */

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useRef } from "react";
import {
  Alert,
  Platform,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import WebView from "react-native-webview";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * All fields optional — works from both add and edit flows.
 * Field names mirror the ors_entries DB columns (camelCase here).
 */
export interface ORSPreviewData {
  /** Serial number / ORS No.  e.g. "ORS-2026-0001" */
  orsNo?: string;
  /** Linked PR No. */
  prNo?: string;
  /** Division / office name */
  divisionName?: string;
  /** Entity name (DAR / regional office) */
  entityName?: string;
  /** Fund cluster */
  fundCluster?: string;
  /** Responsibility center */
  responsibilityCenter?: string;
  /** UACS object code */
  uacsCode?: string;
  /** Fiscal year */
  fiscalYear?: number | string;
  /** Amount obligated */
  amount?: number;
  /** Status: Pending | Processing | Approved | Rejected */
  status?: string;
  /** Short description of the obligation purpose */
  particulars?: string;
  /** MFO/PAP code */
  mfoPap?: string;
  /** Name of preparer (Budget officer) */
  preparedByName?: string;
  preparedByDesig?: string;
  /** Name of approver (Head, Budget Division) */
  approvedByName?: string;
  approvedByDesig?: string;
  /** Date the ORS was prepared */
  dateCreated?: string;
  /** Optional notes / remarks */
  notes?: string;
  /** Obligation status table rows — for STATUS OF OBLIGATION section */
  obligationRows?: ObligationRow[];
}

export interface ObligationRow {
  date: string;
  particulars: string;
  referenceNo: string;
  amount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtHtml = (n: number) =>
  n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// ─── buildORSHtml ─────────────────────────────────────────────────────────────

/** Returns the full Appendix 11 ORS HTML string. */
export function buildORSHtml(data: ORSPreviewData): string {
  const {
    orsNo = "",
    prNo = "",
    divisionName = "",
    entityName = "Department of Agrarian Reform",
    fundCluster = "",
    responsibilityCenter = "",
    uacsCode = "",
    fiscalYear = new Date().getFullYear(),
    amount = 0,
    status = "Pending",
    particulars = "",
    mfoPap = "",
    preparedByName = "",
    preparedByDesig = "Budget Officer",
    approvedByName = "",
    approvedByDesig = "Head, Budget Division",
    dateCreated = "",
    notes = "",
    obligationRows = [],
  } = data;

  const obligationBody = obligationRows.length
    ? obligationRows
        .map(
          (r) => `
        <tr>
          <td>${r.date}</td>
          <td>${r.particulars}</td>
          <td>${r.referenceNo}</td>
          <td class="num">${fmtHtml(r.amount)}</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>`,
        )
        .join("")
    : `<tr>
        <td colspan="8" style="text-align:center;color:#999;padding:8px">
          No obligation entries recorded.
        </td>
      </tr>`;

  const statusColor: Record<string, string> = {
    Pending: "#f59e0b",
    Processing: "#3b82f6",
    Approved: "#10b981",
    Rejected: "#ef4444",
  };
  const statusBg: Record<string, string> = {
    Pending: "#fffbeb",
    Processing: "#eff6ff",
    Approved: "#ecfdf5",
    Rejected: "#fef2f2",
  };
  const sColor = statusColor[status] ?? "#6b7280";
  const sBg = statusBg[status] ?? "#f9fafb";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>ORS ${orsNo}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Times New Roman", serif; font-size: 9.5pt; color: #000; padding: 18px; }
  h1 { font-size: 12pt; text-align: center; margin-bottom: 2px; }
  .subtitle { font-size: 8.5pt; text-align: center; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  td, th { border: 1px solid #000; padding: 3px 4px; vertical-align: middle; }
  .nob { border: none !important; }
  .num { text-align: right; font-family: "Courier New", monospace; }
  .bold { font-weight: bold; }
  .small { font-size: 8pt; }
  .center { text-align: center; }
  .status-pill { display: inline-block; padding: 2px 8px; border-radius: 20px; font-weight: bold; font-size: 8pt; background: ${sBg}; color: ${sColor}; border: 1px solid ${sColor}; }
</style>
</head>
<body>
  <h1>OBLIGATION REQUEST AND STATUS</h1>
  <p class="subtitle">Appendix 11</p>

  <table class="nob" style="margin-bottom:6px">
    <tr><td class="nob center bold">OBLIGATION REQUEST AND STATUS</td></tr>
    <tr><td class="nob center small">Appendix 11</td></tr>
  </table>

  <table style="margin-bottom:8px">
    <tr>
      <td class="bold" style="width:20%">Entity Name</td>
      <td style="width:46%">${entityName}</td>
      <td class="bold" style="width:17%">Fund Cluster :</td>
      <td style="width:17%">${fundCluster}</td>
    </tr>
    <tr>
      <td class="bold">Serial No. :</td>
      <td class="num bold">${orsNo}</td>
      <td class="bold">Date :</td>
      <td>${dateCreated}</td>
    </tr>
    <tr>
      <td class="bold">Office</td>
      <td>${divisionName}</td>
      <td class="bold">Responsibility Center</td>
      <td>${responsibilityCenter}</td>
    </tr>
  </table>

  <table style="margin-bottom:8px">
    <thead>
      <tr>
        <th class="small">Particulars</th>
        <th class="small">MFO/PAP</th>
        <th class="small">UACS Object Code</th>
        <th class="small">Amount</th>
        <th class="small">Payee</th>
        <th class="small">Address</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${particulars || "—"}</td>
        <td>${mfoPap}</td>
        <td class="mono">${uacsCode}</td>
        <td class="num" style="font-weight:bold">₱${fmtHtml(amount)}</td>
        <td>${divisionName}</td>
        <td></td>
      </tr>
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3" style="text-align:right;font-weight:bold;background:#f0fdf4">TOTAL</td>
        <td class="num" style="font-weight:bold;background:#f0fdf4">₱${fmtHtml(amount)}</td>
        <td colspan="2" style="background:#f0fdf4"></td>
      </tr>
    </tfoot>
  </table>

  ${notes ? `<div style="border:1px solid #ddd;border-radius:4px;padding:6px 8px;margin-bottom:8px;font-size:9px;color:#555"><strong>Notes:</strong> ${notes}</div>` : ""}

  <table style="margin-bottom:8px">
    <tr>
      <td colspan="2" class="small bold">A. Charges to appropriation/allotment are necessary, lawful and under my direct supervision; and</td>
    </tr>
    <tr>
      <td style="width:50%;padding:16px 10px">
        <div class="sig-block">
          <div class="sig-name">${preparedByName || "________________________________"}</div><br/>
          <span>${preparedByDesig}</span><br/>
          <span style="color:#666">Head, Requesting Office/Authorized Representative</span><br/>
          <span style="color:#999">Date: ______________________</span>
        </div>
      </td>
      <td style="width:50%;padding:16px 10px">
        <div class="sig-block">
          <div class="sig-name">${approvedByName || "________________________________"}</div><br/>
          <span>${approvedByDesig}</span><br/>
          <span style="color:#666">Head, Budget Division/Unit/Authorized Representative</span><br/>
          <span style="color:#999">Date: ______________________</span>
        </div>
      </td>
    </tr>
  </table>

  <table style="margin-bottom:8px">
    <tr>
      <td class="small bold">C. Certified: Allotment available and obligated for the purpose indicated above</td>
    </tr>
    <tr>
      <td style="padding:12px 10px">
        <div class="sig-block">
          <div class="sig-name">${approvedByName || "________________________________"}</div><br/>
          <span>${approvedByDesig}</span><br/>
          <span style="color:#666">Signature / Printed Name / Position / Date</span>
        </div>
      </td>
    </tr>
  </table>

  <table>
    <tr>
      <td colspan="8" class="small bold">STATUS OF OBLIGATION</td>
    </tr>
    <thead>
      <tr>
        <th class="small">Date</th>
        <th class="small">Particulars</th>
        <th class="small">ORS/JEV/Check/ADA/TRA No.</th>
        <th class="small">Obligation (a)</th>
        <th class="small">Payable (b)</th>
        <th class="small">Not Yet Due (a-b)</th>
        <th class="small">Due and Demandable (c)</th>
        <th class="small">Balance (b-c)</th>
      </tr>
    </thead>
    <tbody>
      ${obligationBody}
      <tr style="font-weight:bold;background:#f0fdf4">
        <td colspan="3" style="text-align:right">TOTAL</td>
        <td class="num">₱${fmtHtml(amount)}</td>
        <td></td><td></td><td></td><td></td>
      </tr>
    </tbody>
  </table>

</body>
</html>`;
}

// ─── useORSPreviewActions ─────────────────────────────────────────────────────

/** Returns print and download handlers bound to the provided ORS HTML. */
export function useORSPreviewActions(html: string) {
  const handlePrint = async () => {
    try {
      await Print.printAsync({ html });
    } catch (e: any) {
      Alert.alert("Print failed", e?.message ?? "Could not open print dialog.");
    }
  };

  const handleDownload = async () => {
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert("Saved", `PDF saved to:\n${uri}`);
      }
    } catch (e: any) {
      Alert.alert("Download failed", e?.message ?? "Could not generate PDF.");
    }
  };

  return { handlePrint, handleDownload };
}

// ─── ORSPreviewPanel (default export) ────────────────────────────────────────

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

interface ORSPreviewPanelProps {
  html: string;
  onPrint?: () => void;
  onDownload?: () => void;
  showActions: boolean;
  style?: ViewStyle;
}

export default function ORSPreviewPanel({
  html,
  onPrint,
  onDownload,
  showActions,
  style,
}: ORSPreviewPanelProps) {
  const webRef = useRef<WebView>(null);
  const { handlePrint, handleDownload } = useORSPreviewActions(html);

  return (
    <View style={[{ flex: 1 }, style]}>
      {showActions && (
        <View
          className="flex-row gap-2 px-4 py-2.5 bg-white border-b border-gray-100"
          style={{ elevation: 2 }}
        >
          <TouchableOpacity
            onPress={onPrint ?? handlePrint}
            activeOpacity={0.8}
            className="flex-1 flex-row items-center justify-center gap-1.5 bg-gray-100 rounded-xl py-2.5"
          >
            <Text className="text-[13px] font-bold text-gray-700">
              🖨 Print
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onDownload ?? handleDownload}
            activeOpacity={0.8}
            className="flex-1 flex-row items-center justify-center gap-1.5 bg-[#064E3B] rounded-xl py-2.5"
          >
            <Text className="text-[13px] font-bold text-white">
              ⬇ Download PDF
            </Text>
          </TouchableOpacity>
        </View>
      )}
      <WebView
        ref={webRef}
        source={{ html }}
        originWhitelist={["*"]}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
