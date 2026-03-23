/**
 * BACResolutionPreview.tsx
 *
 * Generates an HTML string that mirrors the official DAR BAC Resolution form
 * as seen in the sample document (DARPO-Camarines Sur I, Provincial BAC).
 *
 * Structure (top → bottom, matching the sample):
 *   1. Republic / DAR letterhead + certification badge
 *   2. Title: "RESOLUTION RECOMMENDING THE PROCUREMENT BY ALTERNATIVE MODE..."
 *   3. Resolution number line
 *   4. WHEREAS clauses (3 paragraphs)
 *   5. PR table — PR Number | Date | Estimated Cost | End User | Recommended Mode
 *   6. NOW THEREFORE / RESOLVED clause
 *   7. Signature block — Chairperson (right) | Vice-Chairperson (left) | 2 Members | Approved By
 *
 * Consumed by BACResolutionPreviewModal via WebView.
 */

export interface BACResolutionData {
  /** e.g. "2025-231" */
  resolutionNo: string;
  /** ISO or locale date string, e.g. "August 06, 2025" */
  resolvedDate: string;
  /** Physical location, e.g. "HL Bldg. Carnation St. Triangulo Naga City" */
  location: string;

  /** PR entries in the table (usually just one) */
  prEntries: {
    prNo:         string;
    date:         string;
    estimatedCost: string;  // formatted, e.g. "337,390.00"
    endUser:      string;
    procMode:     string;   // e.g. "SVP/Canvass"
  }[];

  /** WHEREAS body text – free-form, inserted verbatim */
  whereasText: string;

  /** Name of the office/division that requested the items */
  requestingOffice: string;

  /** Provincial/regional office label */
  provincialOffice: string;  // e.g. "DARPO-CAMARINES SUR I"

  /** BAC signatories */
  bacChairperson:    string;   // right side
  bacViceChairperson: string;  // left side
  bacMembers:        string[]; // 2 members bottom row
  approvedBy:        string;   // bottom-left "Approved by:"
  approvedByDesig:   string;   // e.g. "HOPE"

  /** Optional: procurement mode short label for title */
  procurementModeTitle?: string; // e.g. "SMALL VALUE PROCUREMENT (SVP)"
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 9.5pt;
    color: #000;
    background: #fff;
    padding: 12mm 14mm 10mm 14mm;
  }
  table { border-collapse: collapse; width: 100%; }
  td, th {
    font-family: 'Times New Roman', Times, serif;
    color: #000;
    font-size: 9pt;
    padding: 3px 5px;
    word-wrap: break-word;
    white-space: normal;
  }
  .border-all { border: 1px solid #000; }
  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: bold; }
  .italic { font-style: italic; }
  .underline { text-decoration: underline; }
  .small  { font-size: 8pt; }
  p { margin-bottom: 6px; line-height: 1.5; text-align: justify; }
  .indent { text-indent: 2em; }
`;

// ─── Generator ────────────────────────────────────────────────────────────────

export function buildBACResolutionHTML(d: BACResolutionData): string {
  const procTitle = d.procurementModeTitle ?? "SMALL VALUE PROCUREMENT (SVP)";

  const prRowsHTML = d.prEntries.map((p) => `
    <tr>
      <td class="border-all center" style="padding:5px 4px; font-size:9pt;">${p.prNo}</td>
      <td class="border-all center" style="padding:5px 4px; font-size:9pt;">${p.date}</td>
      <td class="border-all right"  style="padding:5px 8px; font-size:9pt;">${p.estimatedCost}</td>
      <td class="border-all center" style="padding:5px 4px; font-size:9pt;">${p.endUser}</td>
      <td class="border-all center" style="padding:5px 4px; font-size:9pt;">${p.procMode}</td>
    </tr>`).join("");

  const member0 = d.bacMembers[0] ?? "";
  const member1 = d.bacMembers[1] ?? "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>BAC Resolution ${d.resolutionNo}</title>
  <style>${CSS}</style>
</head>
<body>

<!-- ── Letterhead ──────────────────────────────────────────────────── -->
<table style="margin-bottom: 6px;">
  <colgroup>
    <col style="width: 15%"/>
    <col style="width: 70%"/>
    <col style="width: 15%"/>
  </colgroup>
  <tbody>
    <tr>
      <td style="vertical-align: middle; text-align: center;">
        <!-- Bagong Pilipinas / DAR seal placeholder -->
        <div style="width:50px; height:50px; border:1px solid #999; border-radius:50%;
          display:inline-flex; align-items:center; justify-content:center;
          font-size:6pt; color:#555; text-align:center; padding:4px;">
          BAGONG<br/>PILIPINAS
        </div>
      </td>
      <td style="text-align: center; vertical-align: middle;">
        <div style="font-size: 8.5pt; line-height: 1.4;">
          REPUBLIC OF THE PHILIPPINES
        </div>
        <div style="font-size: 13pt; font-weight: bold; line-height: 1.3;">
          DEPARTMENT OF AGRARIAN REFORM
        </div>
        <div style="font-size: 8pt; font-style: italic; line-height: 1.3;">
          Tunay na Pagbabago sa Repormang Agraryo
        </div>
        <div style="font-size: 8.5pt; font-weight: bold; margin-top: 3px;">
          ${d.provincialOffice}
        </div>
      </td>
      <td style="vertical-align: middle; text-align: center;">
        <!-- Certified / DAR badge placeholder -->
        <div style="width:50px; height:50px; border:2px solid #064E3B; border-radius:50%;
          display:inline-flex; align-items:center; justify-content:center;
          font-size:6pt; color:#064E3B; text-align:center; padding:4px; font-weight:bold;">
          DAR<br/>CERTIFIED
        </div>
      </td>
    </tr>
  </tbody>
</table>

<hr style="border: 1.5px solid #000; margin-bottom: 8px;"/>

<!-- ── BAC label ────────────────────────────────────────────────────── -->
<div style="text-align: center; font-size: 9pt; font-weight: bold; margin-bottom: 2px;">
  PROVINCIAL BIDS AND AWARDS COMMITTEE OF
</div>
<div style="text-align: center; font-size: 9pt; font-weight: bold; margin-bottom: 8px;">
  ${d.provincialOffice}
</div>

<!-- ── Title ────────────────────────────────────────────────────────── -->
<div style="text-align: center; font-size: 9pt; font-weight: bold; margin-bottom: 2px;">
  &ldquo;RESOLUTION RECOMMENDING THE PROCUREMENT BY ALTERNATIVE MODE OF PROCUREMENT (${procTitle})
</div>
<div style="text-align: center; font-size: 9pt; font-weight: bold; margin-bottom: 2px;">
  OF ONE (1) APPROVED PURCHASE REQUEST/S&rdquo;
</div>

<!-- ── Resolution No. ───────────────────────────────────────────────── -->
<div style="text-align: right; font-size: 9pt; margin-bottom: 10px;">
  Resolution No. ${d.resolutionNo}
</div>

<!-- ── WHEREAS clauses ──────────────────────────────────────────────── -->
<p class="indent">
  <span class="bold">WHEREAS</span>, the ARBDSP Division the of the Department of Agrarian Reform,
  ${d.provincialOffice} Office has requested for supply, labor and materials of the net house
  installation for ${d.requestingOffice} Agribusiness Development Adopting Value Chain Approach
  for comfort room which is urgently needed by the office;
</p>

<p class="indent">
  <span class="bold">WHEREAS</span>, the requested supply, labor and materials of the net house installation
  for ${d.requestingOffice} Nursery Establishment which have fund earmarked for the estimated cost as
  certified by the Budget Officer, Ms. Agnes S. Argamusa and approved by the Head of Procuring Entity
  (HOPE)/ PARPO II, Ricardo C. Garcia;
</p>

<p class="indent" style="margin-bottom: 10px;">
  <span class="bold">WHEREAS</span>, the requested supply, labor and materials of the net house installation for
  ${d.requestingOffice} Nursery Establishment under the Phase II of the Climate Smart Agricultural Productivity
  and Nursery Establishment which as stated in the Purchase Request have been evaluated by the members of
  the Bid and Awards Committee (BAC) and is hereby recommended for procurement by SVP method, to wit:
</p>

<!-- ── PR Table ─────────────────────────────────────────────────────── -->
<div style="margin-bottom: 10px;">
  <div style="text-align: center; font-style: italic; font-size: 8.5pt; margin-bottom: 4px;">
    Please see attached purchase request/s.
  </div>
  <table style="width: 80%; margin: 0 auto;">
    <thead>
      <tr>
        <th class="border-all center bold" style="font-size: 8.5pt; padding: 4px; width: 22%;">PR NUMBER</th>
        <th class="border-all center bold" style="font-size: 8.5pt; padding: 4px; width: 15%;">DATE</th>
        <th class="border-all center bold" style="font-size: 8.5pt; padding: 4px; width: 18%;">ESTIMATED COST<br/>(Php)</th>
        <th class="border-all center bold" style="font-size: 8.5pt; padding: 4px; width: 18%;">END USER</th>
        <th class="border-all center bold" style="font-size: 8.5pt; padding: 4px; width: 27%;">RECOMMENDED<br/>PROCUREMENT MODE</th>
      </tr>
    </thead>
    <tbody>
      ${prRowsHTML}
    </tbody>
  </table>
</div>

<!-- ── NOW THEREFORE / RESOLVED ────────────────────────────────────── -->
<p class="indent">
  <span class="bold">NOW, THEREFORE</span>, we, the members of the Bids and Awards Committee, hereby
  <span class="bold">RESOLVE</span>, as it is hereby <span class="bold">RESOLVED</span>, to recommend
  to the Head of Procuring Entity the procurement of items through SVP method.
</p>

<p style="margin-bottom: 14px;">
  <span class="bold">RESOLVED</span> at the ${d.location}, this ${d.resolvedDate}.
</p>

<!-- ── Signature block ──────────────────────────────────────────────── -->
<table style="width: 100%; margin-bottom: 16px;">
  <colgroup>
    <col style="width: 50%"/>
    <col style="width: 50%"/>
  </colgroup>
  <tbody>
    <!-- Row 1: Vice-Chairperson (left) | Chairperson (right) -->
    <tr>
      <td style="text-align: center; vertical-align: bottom; padding: 0 20px 4px 20px;">
        <div style="border-bottom: 1px solid #000; min-height: 28px; margin-bottom: 2px;"></div>
        <div style="font-size: 9.5pt; font-weight: bold; text-transform: uppercase; text-decoration: underline;">
          ${d.bacViceChairperson}
        </div>
        <div style="font-size: 8.5pt;">BAC Vice-Chairperson</div>
      </td>
      <td style="text-align: center; vertical-align: bottom; padding: 0 20px 4px 20px;">
        <div style="border-bottom: 1px solid #000; min-height: 28px; margin-bottom: 2px;"></div>
        <div style="font-size: 9.5pt; font-weight: bold; text-transform: uppercase; text-decoration: underline;">
          ${d.bacChairperson}
        </div>
        <div style="font-size: 8.5pt;">BAC Chairperson</div>
      </td>
    </tr>
  </tbody>
</table>

<!-- BAC Members row -->
<table style="width: 100%; margin-bottom: 20px;">
  <colgroup>
    <col style="width: 50%"/>
    <col style="width: 50%"/>
  </colgroup>
  <tbody>
    <tr>
      <td style="text-align: center; vertical-align: bottom; padding: 0 20px 4px 20px;">
        <div style="border-bottom: 1px solid #000; min-height: 28px; margin-bottom: 2px;"></div>
        <div style="font-size: 9.5pt; font-weight: bold; text-transform: uppercase; text-decoration: underline;">
          ${member0}
        </div>
        <div style="font-size: 8.5pt;">BAC Member</div>
      </td>
      <td style="text-align: center; vertical-align: bottom; padding: 0 20px 4px 20px;">
        <div style="border-bottom: 1px solid #000; min-height: 28px; margin-bottom: 2px;"></div>
        <div style="font-size: 9.5pt; font-weight: bold; text-transform: uppercase; text-decoration: underline;">
          ${member1}
        </div>
        <div style="font-size: 8.5pt;">BAC Member</div>
      </td>
    </tr>
  </tbody>
</table>

<!-- Approved by -->
<table style="width: 100%;">
  <colgroup>
    <col style="width: 50%"/>
    <col style="width: 50%"/>
  </colgroup>
  <tbody>
    <tr>
      <td style="vertical-align: bottom; padding: 0 20px 4px 20px;">
        <div style="font-size: 8.5pt; margin-bottom: 4px;">Approved by:</div>
        <div style="border-bottom: 1px solid #000; min-height: 28px; margin-bottom: 2px;"></div>
        <div style="font-size: 9.5pt; font-weight: bold; text-transform: uppercase; text-decoration: underline;">
          ${d.approvedBy}
        </div>
        <div style="font-size: 8.5pt;">${d.approvedByDesig}</div>
      </td>
      <td></td>
    </tr>
  </tbody>
</table>

</body>
</html>`;
}
