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

import React from "react";
import { type ViewStyle } from "react-native";
import DocumentPreviewPanel from "./DocumentPreviewPanel";

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

/** Returns the full Appendix 11 ORS HTML string, strictly matching the official form. */
export function buildORSHtml(
  data: ORSPreviewData,
  opts?: { template?: boolean },
): string {
  const template = !!opts?.template;
  const src = template ? ({} as ORSPreviewData) : data;
  const defaultYear = template ? ("" as any) : new Date().getFullYear();
  const {
    orsNo = "",
    prNo = "",
    divisionName = "",
    entityName = "Department of Agrarian Reform",
    fundCluster = "",
    responsibilityCenter = "",
    uacsCode = "",
    fiscalYear = defaultYear,
    amount = 0,
    particulars = "",
    mfoPap = "",
    preparedByName = "",
    preparedByDesig = "Budget Officer",
    approvedByName = "",
    approvedByDesig = "Head, Budget Division",
    dateCreated = "",
    notes = "",
    obligationRows = [],
  } = src;

  // STATUS OF OBLIGATION rows
  const BLANK_ROWS = 6;
  const obligationBody = template
    ? Array.from({ length: BLANK_ROWS })
        .map(
          () => `
        <tr style="height:22px">
          <td></td><td></td><td></td>
          <td class="num"></td><td class="num"></td>
          <td class="num"></td><td class="num"></td><td class="num"></td>
        </tr>`,
        )
        .join("")
    : obligationRows.length
      ? obligationRows
          .map(
            (r) => `
        <tr style="height:22px">
          <td>${r.date}</td>
          <td>${r.particulars}</td>
          <td>${r.referenceNo}</td>
          <td class="num">${fmtHtml(r.amount)}</td>
          <td class="num"></td>
          <td class="num"></td>
          <td class="num"></td>
          <td class="num"></td>
        </tr>`,
          )
          .join("")
      : Array.from({ length: BLANK_ROWS })
          .map(
            () => `
        <tr style="height:22px">
          <td></td><td></td><td></td>
          <td class="num"></td><td class="num"></td>
          <td class="num"></td><td class="num"></td><td class="num"></td>
        </tr>`,
          )
          .join("");

  const amountDisplay = !template && amount ? `&#x20B1;${fmtHtml(amount)}` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>ORS ${orsNo}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Times New Roman", Times, serif;
    font-size: 9pt;
    color: #000;
    padding: 14px 18px;
    background: #fff;
  }
  .form-title {
    text-align: center;
    font-size: 11pt;
    font-weight: bold;
    letter-spacing: 0.5px;
    margin-bottom: 1px;
  }
  .form-appendix {
    text-align: center;
    font-size: 8pt;
    margin-bottom: 8px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  td, th {
    border: 1px solid #000;
    padding: 3px 5px;
    vertical-align: top;
    font-size: 8.5pt;
    word-wrap: break-word;
  }
  th {
    font-weight: bold;
    text-align: center;
    font-size: 7.5pt;
    vertical-align: middle;
    background: #fff;
  }
  .label {
    font-size: 7.5pt;
    color: #333;
    display: block;
    margin-bottom: 1px;
  }
  .value {
    font-size: 9pt;
    font-weight: normal;
    display: block;
    min-height: 14px;
  }
  .num { text-align: right; font-family: "Courier New", Courier, monospace; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .section-header {
    background: #fff;
    font-weight: bold;
    font-size: 8pt;
    border-bottom: 1px solid #000;
    padding: 3px 5px;
  }
  .no-border { border: none !important; }
  .no-top { border-top: none !important; }
  .no-bottom { border-bottom: none !important; }
  .no-left { border-left: none !important; }
  .no-right { border-right: none !important; }
</style>
</head>
<body>

  <!-- ── FORM TITLE ── -->
  <div class="form-title">OBLIGATION REQUEST AND STATUS</div>
  <div class="form-appendix">Appendix 11</div>

  <!-- ── TOP HEADER TABLE: Entity Name / Fund Cluster / Serial / Date / Office / Responsibility Center ── -->
  <table style="margin-bottom:0">
    <colgroup>
      <col style="width:18%"/>
      <col style="width:36%"/>
      <col style="width:18%"/>
      <col style="width:28%"/>
    </colgroup>
    <tbody>
      <tr>
        <td style="border-bottom:none">
          <span class="label">Entity Name</span>
          <span class="value">${entityName}</span>
        </td>
        <td colspan="1" style="border-bottom:none">
          <span class="label">&nbsp;</span>
          <span class="value">&nbsp;</span>
        </td>
        <td style="border-bottom:none">
          <span class="label">Fund Cluster :</span>
          <span class="value">${fundCluster}</span>
        </td>
        <td style="border-bottom:none">
          <span class="label">&nbsp;</span>
          <span class="value">${fundCluster ? "" : ""}&nbsp;</span>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="border-top:none; border-bottom:none">
          <span class="label">&nbsp;</span>
        </td>
        <td style="border-top:none; border-bottom:none">
          <span class="label">Serial No. :</span>
          <span class="value bold">${orsNo}</span>
        </td>
        <td style="border-top:none; border-bottom:none">
          <span class="label">Date :</span>
          <span class="value">${dateCreated}</span>
        </td>
      </tr>
      <tr>
        <td style="border-top:none; border-bottom:none">
          <span class="label">Office</span>
        </td>
        <td style="border-top:none; border-bottom:none">
          <span class="value">${divisionName}</span>
        </td>
        <td style="border-top:none; border-bottom:none">
          <span class="label">Responsibility Center</span>
        </td>
        <td style="border-top:none; border-bottom:none">
          <span class="value">${responsibilityCenter}</span>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- ── OBLIGATION REQUEST TABLE ── -->
  <table style="margin-top:0; margin-bottom:0">
    <colgroup>
      <col style="width:28%"/>
      <col style="width:13%"/>
      <col style="width:16%"/>
      <col style="width:15%"/>
      <col style="width:16%"/>
      <col style="width:12%"/>
    </colgroup>
    <thead>
      <tr>
        <th>Particulars</th>
        <th>MFO/PAP</th>
        <th>UACS Object Code</th>
        <th>Amount</th>
        <th>Payee</th>
        <th>Address</th>
      </tr>
    </thead>
    <tbody>
      <tr style="height:40px">
        <td>${particulars || "&nbsp;"}</td>
        <td>${mfoPap || "&nbsp;"}</td>
        <td style="font-family:'Courier New',monospace;text-align:center">${uacsCode || "&nbsp;"}</td>
        <td class="num" style="font-weight:bold">${amountDisplay}</td>
        <td>${divisionName || "&nbsp;"}</td>
        <td>&nbsp;</td>
      </tr>
      <tr>
        <td colspan="3" style="text-align:right; font-weight:bold; font-size:8pt">Total</td>
        <td class="num bold">${amountDisplay}</td>
        <td colspan="2">&nbsp;</td>
      </tr>
    </tbody>
  </table>

  ${notes ? `<div style="border:1px solid #ccc;border-top:none;padding:4px 6px;font-size:8pt;color:#444"><strong>Notes:</strong> ${notes}</div>` : ""}

  <!-- ── CERTIFICATION BLOCK A + B ── -->
  <table style="margin-top:6px; margin-bottom:0">
    <colgroup>
      <col style="width:50%"/>
      <col style="width:50%"/>
    </colgroup>
    <tbody>
      <tr>
        <td colspan="2" class="section-header">
          A. Charges to appropriation/allotment are necessary, lawful and under my direct supervision; and
        </td>
      </tr>
      <tr>
        <td style="height:80px; vertical-align:bottom; padding-bottom:6px; border-right:none">
          <div style="border-top:1px solid #000; width:75%; margin-bottom:2px"></div>
          <div style="font-size:8.5pt; font-weight:bold">${preparedByName || "________________________________"}</div>
          <div style="font-size:7.5pt">${preparedByDesig}</div>
          <div style="font-size:7.5pt">Head, Requesting Office/Authorized Representative</div>
          <div style="font-size:7.5pt; margin-top:4px">Date : ____________________</div>
        </td>
        <td style="height:80px; vertical-align:bottom; padding-bottom:6px; border-left:1px solid #000">
          <div style="border-top:1px solid #000; width:75%; margin-bottom:2px"></div>
          <div style="font-size:8.5pt; font-weight:bold">${approvedByName || "________________________________"}</div>
          <div style="font-size:7.5pt">${approvedByDesig}</div>
          <div style="font-size:7.5pt">Head, Budget Division/Unit/Authorized Representative</div>
          <div style="font-size:7.5pt; margin-top:4px">Date : ____________________</div>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- ── CERTIFICATION BLOCK C ── -->
  <table style="margin-top:0; margin-bottom:6px">
    <tbody>
      <tr>
        <td class="section-header">
          C. Certified: Allotment available and obligated for the purpose/adjustment indicated above as supporting documents valid, proper and legal
        </td>
      </tr>
      <tr>
        <td style="height:70px; vertical-align:bottom; padding-bottom:6px">
          <div style="border-top:1px solid #000; width:38%; margin-bottom:2px"></div>
          <div style="font-size:8pt">Signature : ______________________________</div>
          <div style="font-size:8pt">Printed Name : ${approvedByName || "______________________________"}</div>
          <div style="font-size:8pt">Position : ${approvedByDesig || "______________________________"}</div>
          <div style="font-size:8pt">Date : ____________________________</div>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- ── STATUS OF OBLIGATION TABLE ── -->
  <table>
    <colgroup>
      <col style="width:10%"/>
      <col style="width:22%"/>
      <col style="width:18%"/>
      <col style="width:10%"/>
      <col style="width:10%"/>
      <col style="width:10%"/>
      <col style="width:10%"/>
      <col style="width:10%"/>
    </colgroup>
    <thead>
      <tr>
        <th colspan="8" style="text-align:left; font-size:8pt; padding:3px 5px; background:#fff">
          STATUS OF OBLIGATION
        </th>
      </tr>
      <tr>
        <th rowspan="2">Date</th>
        <th rowspan="2">Particulars</th>
        <th rowspan="2">ORS/JEV/Check/<br/>ADA/TRA No.<br/><span style="font-weight:normal;font-size:7pt">Reference</span></th>
        <th rowspan="2">Amount</th>
        <th colspan="2">Payment</th>
        <th rowspan="2">Not Yet Due<br/>(a-b)</th>
        <th rowspan="2">Balance<br/>(b-c)</th>
      </tr>
      <tr>
        <th>Obligation<br/><span style="font-weight:normal;font-size:7pt">(a)</span></th>
        <th>Payable<br/><span style="font-weight:normal;font-size:7pt">(b)</span></th>
      </tr>
    </thead>
    <tbody>
      ${obligationBody}
      <tr style="font-weight:bold">
        <td colspan="3" style="text-align:right; font-size:8pt">Total</td>
        <td class="num">${amountDisplay}</td>
        <td class="num"></td>
        <td class="num"></td>
        <td class="num"></td>
        <td class="num"></td>
      </tr>
    </tbody>
  </table>

</body>
</html>`;
}

// ─── ORSPreviewPanel (default export) ────────────────────────────────────────

interface ORSPreviewPanelProps {
  html: string;
  templateHtml?: string;
  initialMode?: "filled" | "template";
  showActions: boolean;
  style?: ViewStyle;
}

export default function ORSPreviewPanel({
  html,
  templateHtml,
  initialMode,
  showActions,
  style,
}: ORSPreviewPanelProps) {
  return (
    <DocumentPreviewPanel
      html={html}
      templateHtml={templateHtml}
      initialMode={initialMode}
      showActions={showActions}
      style={style}
    />
  );
}