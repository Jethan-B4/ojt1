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
  body { font-family: Arial, sans-serif; font-size: 10px; color: #111; padding: 20px; }
  h1 { font-size: 15px; text-align: center; margin-bottom: 1px; letter-spacing: 1px; }
  .subtitle { font-size: 9px; text-align: center; color: #555; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 1px solid #888; padding: 4px 6px; vertical-align: middle; }
  .label { background: #f0f0f0; font-weight: bold; white-space: nowrap; width: 130px; }
  .num { text-align: right; font-family: 'Courier New', monospace; }
  .section-header { background: #064E3B; color: #fff; font-size: 9px; font-weight: bold;
                    letter-spacing: 1px; text-transform: uppercase; padding: 4px 6px; }
  .tbl-head th { background: #1a4d2e; color: #fff; font-size: 9px; text-align: center; }
  .sig-block { text-align: center; padding-top: 6px; font-size: 9px; }
  .sig-name { font-weight: bold; font-size: 10px; border-top: 1px solid #333;
              display: inline-block; min-width: 160px; padding-top: 3px; margin-top: 20px; }
  .status-pill { display: inline-block; padding: 2px 8px; border-radius: 20px;
                 font-weight: bold; font-size: 9px;
                 background: ${sBg}; color: ${sColor};
                 border: 1px solid ${sColor}; }
  .mono { font-family: 'Courier New', monospace; }
</style>
</head>
<body>
  <h1>OBLIGATION REQUEST AND STATUS</h1>
  <p class="subtitle">Appendix 11</p>

  <!-- Top meta row -->
  <table style="margin-bottom:8px">
    <tr>
      <td class="label">Entity Name</td>
      <td colspan="3">${entityName}</td>
      <td class="label" style="width:90px">Fund Cluster</td>
      <td class="mono">${fundCluster}</td>
    </tr>
    <tr>
      <td class="label">Serial No.</td>
      <td class="mono" style="font-weight:bold">${orsNo}</td>
      <td class="label">PR No.</td>
      <td class="mono">${prNo}</td>
      <td class="label">Date</td>
      <td>${dateCreated}</td>
    </tr>
    <tr>
      <td class="label">Office / Division</td>
      <td colspan="3">${divisionName}</td>
      <td class="label">Fiscal Year</td>
      <td>${fiscalYear}</td>
    </tr>
    <tr>
      <td class="label">Responsibility Center</td>
      <td colspan="3">${responsibilityCenter}</td>
      <td class="label">Status</td>
      <td><span class="status-pill">${status}</span></td>
    </tr>
  </table>

  <!-- Obligation details -->
  <table style="margin-bottom:8px">
    <tr>
      <td colspan="6" class="section-header">A. Obligation Details</td>
    </tr>
    <thead class="tbl-head">
      <tr>
        <th style="width:120px">Particulars</th>
        <th style="width:80px">MFO / PAP</th>
        <th style="width:100px">UACS Object Code</th>
        <th style="width:100px">Amount (₱)</th>
        <th>Payee</th>
        <th>Address</th>
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

  <!-- Certification A -->
  <table style="margin-bottom:8px">
    <tr>
      <td class="section-header" colspan="2">
        B. Charges to appropriation / allotment are necessary, lawful and under my direct supervision
      </td>
    </tr>
    <tr>
      <td style="width:50%;padding:16px 10px">
        <div class="sig-block">
          <div class="sig-name">${preparedByName || "________________________________"}</div><br/>
          <span>${preparedByDesig}</span><br/>
          <span style="color:#666">Head, Requesting Office / Authorized Representative</span><br/>
          <span style="color:#999">Date: ______________________</span>
        </div>
      </td>
      <td style="width:50%;padding:16px 10px">
        <div class="sig-block">
          <div class="sig-name">${approvedByName || "________________________________"}</div><br/>
          <span>${approvedByDesig}</span><br/>
          <span style="color:#666">Head, Budget Division / Authorized Representative</span><br/>
          <span style="color:#999">Date: ______________________</span>
        </div>
      </td>
    </tr>
  </table>

  <!-- Certification C -->
  <table style="margin-bottom:8px">
    <tr>
      <td class="section-header">C. Allotment available and obligated for the purpose indicated above</td>
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

  <!-- Status of Obligation -->
  <table>
    <tr>
      <td colspan="8" class="section-header">D. Status of Obligation</td>
    </tr>
    <thead class="tbl-head">
      <tr>
        <th>Date</th>
        <th>Particulars</th>
        <th>ORS / JEV / Check / ADA / TRA No.</th>
        <th>Obligation (a)</th>
        <th>Payable (b)</th>
        <th>Not Yet Due (a-b)</th>
        <th>Due &amp; Demandable (c)</th>
        <th>Balance (b-c)</th>
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
