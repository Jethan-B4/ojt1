/**
 * BACResolutionPreview.tsx
 *
 * Exports:
 *  - BACResolutionData  (TypeScript interface)
 *  - buildBACResolutionHTML(data)  → HTML string ready for WebView / expo-print
 *
 * Uses documentAssets for logo rendering so the document renders offline.
 * Import from BACResolutionPreviewModal.
 */

// ─── Import document assets ──────────────────────────────────────────────────────

import { getBagongPilipinasLogoHTML, getDARSquare2LogoHTML, getISOCertifiedLogoHTML } from "../lib/documentAssets";

// ─── Data shape ───────────────────────────────────────────────────────────────

export interface BACResolutionData {
  /** e.g. "2025-001" */
  resolutionNo: string;
  /** e.g. "January 15, 2025" */
  resolvedDate: string;
  /** e.g. "Camarines Sur Provincial Office" */
  provincialOffice: string;
  /** Full project title */
  projectTitle: string;
  /** e.g. "Public Bidding" */
  procurementMode: string;
  /** Approved Budget for the Contract */
  approvedBudget: string;
  /** BAC members list */
  bacMembers?: BACMember[];
  /** Supplier details */
  supplier?: string;
  /** Awarded amount */
  awardedAmount?: string;
}

export interface BACMember {
  name: string;
  title: string;
  role?: string;
}

// ─── HTML Builder ─────────────────────────────────────────────────────────────

/**
 * Build complete HTML for the BAC Resolution document.
 * @param data - Document data
 * @param template - If true, shows empty template for printing
 * @returns Complete HTML string
 */
export function buildBACResolutionHTML(
  data: BACResolutionData,
  template: boolean = false
): string {
  // Helper to format currency
  const formatCurrency = (amount: string) => {
    if (!amount || template) return "";
    const num = parseFloat(amount.replace(/[^0-9.]/g, ""));
    return isNaN(num) ? amount : `₱${num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Office address (you can make this configurable if needed)
  const officeAddress = "Capitol Complex, Pili, Camarines Sur";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 10pt;
      color: #000;
      background: #fff;
      padding: 20px;
      line-height: 1.4;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      color: #000;
    }
    .bold { font-weight: bold; }
    .center { text-align: center; }
    .right { text-align: right; }
    .title {
      font-size: 16pt;
      font-weight: bold;
      text-align: center;
      margin: 12px 0;
      letter-spacing: 1px;
    }
    .subtitle {
      font-size: 11pt;
      text-align: center;
      margin-bottom: 8px;
      font-style: italic;
    }
    .res-no {
      text-align: center;
      font-size: 10pt;
      margin-bottom: 16px;
    }
    .hr {
      border: none;
      border-top: 1.5px solid #000;
      margin: 8px 0;
    }
    .section-title {
      font-weight: bold;
      font-size: 11pt;
      margin: 16px 0 8px 0;
      text-decoration: underline;
    }
    .resolution-text {
      text-align: justify;
      margin: 12px 0;
      line-height: 1.6;
    }
    .signature-block {
      margin-top: 40px;
    }
    .signature-line {
      border-bottom: 1px solid #000;
      width: 200px;
      margin: 8px 0;
    }
    @media print {
      body { padding: 8mm; }
      @page { margin: 6mm; }
    }
  </style>
</head>
<body>

<!-- ── Letterhead ── -->
<table style="margin-bottom:4px;">
  <colgroup>
    <col style="width:13%"/>
    <col style="width:74%"/>
    <col style="width:13%"/>
  </colgroup>
  <tr>
    <td style="text-align:center; vertical-align:middle; padding:4px 6px 4px 0;">
      ${getDARSquare2LogoHTML(62)}
    </td>
    <td style="vertical-align:middle; text-align:center; padding:2px 4px;">
      <div style="font-size:10pt; line-height:1.4;">Republic of the Philippines</div>
      <div style="font-size:13pt; font-weight:bold; line-height:1.3;">DEPARTMENT OF AGRARIAN REFORM</div>
      <div style="font-size:10pt; line-height:1.4;">${template ? "" : data.provincialOffice}</div>
      <div style="font-size:9.5pt; line-height:1.4;">${officeAddress}</div>
    </td>
    <td style="text-align:center; vertical-align:middle; padding:4px 0 4px 6px;">
      ${getBagongPilipinasLogoHTML(62)}
    </td>
  </tr>
</table>

<hr class="hr"/>

<!-- ── Document title ── -->
<div class="title">BAC Resolution</div>
<div class="subtitle">Bids and Awards Committee</div>
<div class="res-no">
  <span class="bold">Resolution No. ${template ? "" : data.resolutionNo}</span>
  &nbsp;&nbsp;|&nbsp;&nbsp;
  ${template ? "" : data.resolvedDate}
</div>

<!-- ── Subject / project info strip ── -->
<table style="margin-bottom:14px; font-size:10pt;">
  <tr>
    <td style="width:22%; font-weight:bold; padding:2px 6px 2px 0; vertical-align:top;">Subject&nbsp;:</td>
    <td style="padding:2px 0; vertical-align:top;">${template ? "" : data.projectTitle}</td>
  </tr>
  <tr>
    <td style="font-weight:bold; padding:2px 6px 2px 0; vertical-align:top;">Mode&nbsp;:</td>
    <td style="padding:2px 0;">${template ? "" : data.procurementMode}</td>
  </tr>
  <tr>
    <td style="font-weight:bold; padding:2px 6px 2px 0; vertical-align:top;">ABC&nbsp;:</td>
    <td style="padding:2px 0;">${formatCurrency(data.approvedBudget)}</td>
  </tr>
</table>

<!-- ── Resolution content ── -->
<div class="section-title">RESOLUTION</div>

<div class="resolution-text">
  <p style="margin-bottom: 8px;">
    <strong>WHEREAS,</strong> the Department of Agrarian Reform, ${template ? "" : data.provincialOffice}, 
    intends to procure the following project through ${template ? "" : data.procurementMode}:
  </p>
  <p style="margin: 8px 0; padding-left: 20px;">
    <strong>${template ? "" : data.projectTitle}</strong><br>
    <em>Approved Budget for the Contract: ${formatCurrency(data.approvedBudget)}</em>
  </p>
  <p style="margin: 8px 0;">
    <strong>WHEREAS,</strong> pursuant to the provisions of Republic Act No. 9184 and its 
    Implementing Rules and Regulations, the Bids and Awards Committee has conducted 
    the necessary procurement proceedings;
  </p>
  <p style="margin: 8px 0;">
    <strong>WHEREAS,</strong> after evaluation of bids and post-qualification, the 
    Committee has determined the winning bidder;
  </p>
  <p style="margin: 8px 0;">
    <strong>NOW, THEREFORE,</strong> on motion duly seconded, be it
  </p>
  <p style="margin: 8px 0; padding-left: 20px;">
    <strong>RESOLVED,</strong> as it is hereby resolved, that the Bids and Awards 
    Committee hereby awards the contract to:
  </p>
  <p style="margin: 8px 0; padding-left: 40px;">
    <strong>${template ? "_______________________________" : data.supplier || "_______________________________"}</strong><br>
    <em>with the awarded amount of ${formatCurrency(data.awardedAmount || "")}</em>
  </p>
  <p style="margin: 8px 0;">
    <strong>RESOLVED FURTHER,</strong> that the appropriate documents be prepared 
    to implement this resolution.
  </p>
</div>

<!-- ── Certification section ── -->
<div style="margin-top: 30px; text-align: center;">
  <div style="margin-bottom: 8px;">
    ${getISOCertifiedLogoHTML(30)}
  </div>
  <div style="font-size: 9pt; color: #666;">
    Certified in accordance with ISO 9001:2015 Quality Management System
  </div>
</div>

<!-- ── Signatures ── -->
<div class="signature-block">
  <table style="width: 100%; margin-top: 20px;">
    <colgroup>
      <col style="width: 33%"/>
      <col style="width: 33%"/>
      <col style="width: 33%"/>
    </colgroup>
    <tbody>
      <tr>
        <td style="text-align: center; vertical-align: top;">
          <div style="margin-bottom: 40px;">
            <div class="signature-line"></div>
            <div style="font-size: 9pt; margin-top: 4px;">${template ? "" : (data.bacMembers?.[0]?.name || "___________________")}</div>
            <div style="font-size: 8pt; color: #666;">Chairman</div>
          </div>
        </td>
        <td style="text-align: center; vertical-align: top;">
          <div style="margin-bottom: 40px;">
            <div class="signature-line"></div>
            <div style="font-size: 9pt; margin-top: 4px;">${template ? "" : (data.bacMembers?.[1]?.name || "___________________")}</div>
            <div style="font-size: 8pt; color: #666;">Vice Chairman</div>
          </div>
        </td>
        <td style="text-align: center; vertical-align: top;">
          <div style="margin-bottom: 40px;">
            <div class="signature-line"></div>
            <div style="font-size: 9pt; margin-top: 4px;">${template ? "" : (data.bacMembers?.[2]?.name || "___________________")}</div>
            <div style="font-size: 8pt; color: #666;">Member</div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="text-align: center; vertical-align: top;">
          <div>
            <div class="signature-line"></div>
            <div style="font-size: 9pt; margin-top: 4px;">${template ? "" : (data.bacMembers?.[3]?.name || "___________________")}</div>
            <div style="font-size: 8pt; color: #666;">Member</div>
          </div>
        </td>
        <td style="text-align: center; vertical-align: top;">
          <div>
            <div class="signature-line"></div>
            <div style="font-size: 9pt; margin-top: 4px;">${template ? "" : (data.bacMembers?.[4]?.name || "___________________")}</div>
            <div style="font-size: 8pt; color: #666;">Member</div>
          </div>
        </td>
        <td style="text-align: center; vertical-align: top;">
          <div>
            <div class="signature-line"></div>
            <div style="font-size: 9pt; margin-top: 4px;">${template ? "" : (data.bacMembers?.[5]?.name || "___________________")}</div>
            <div style="font-size: 8pt; color: #666;">Member</div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</div>

<!-- ── Attestation ── -->
<div style="margin-top: 40px; text-align: center;">
  <div style="margin-bottom: 8px;">Attested by:</div>
  <div class="signature-line" style="margin: 0 auto; width: 200px;"></div>
  <div style="font-size: 9pt; margin-top: 4px;">${template ? "" : (data.bacMembers?.[6]?.name || "___________________")}</div>
  <div style="font-size: 8pt; color: #666;">BAC Secretariat</div>
</div>

</body>
</html>
`;
}
