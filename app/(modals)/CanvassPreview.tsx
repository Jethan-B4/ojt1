/**
 * CanvassPreview.tsx
 *
 * Generates an HTML string that mirrors the official DAR canvass / RFQ form
 * (DARCS1-QF-STO-009 Rev 01).  The output is consumed by CanvassPreviewModal
 * via a WebView — keeping the same pattern as PRPreview.tsx.
 *
 * Data accepted:
 *   pr          – the CanvassingPR header (prNo, officeSection, date, purpose, items)
 *   quotationNo – BAC canvass number (bacNo from BACView)
 *   deadline    – deadline date string (computed as 7 days after today by default)
 *   bacChairperson – name of the BAC chairperson (from BACMembers)
 *   canvasserNames – list of canvasser usernames to print at the bottom
 *   supplierName / supplierAddress – pre-filled if a single supplier is known
 */

export interface CanvassPreviewData {
  prNo:            string;
  quotationNo:     string;
  date:            string;           // issue date
  deadline:        string;           // submission deadline date
  bacChairperson:  string;
  officeSection:   string;
  purpose:         string;
  items: Array<{
    itemNo:       number;
    description:  string;
    qty:          number;
    unit:         string;
    unitPrice?:   string;            // blank on release; filled when collecting
  }>;
  canvasserNames:  string[];         // names listed at bottom-left
  supplierName?:   string;
  supplierAddress?: string;
}

// ─── CSS shared with PRPreview style ─────────────────────────────────────────

const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 9pt;
    color: #000;
    background: #fff;
    padding: 10mm 12mm;
  }
  table { border-collapse: collapse; width: 100%; }
  td, th {
    font-family: 'Times New Roman', Times, serif;
    color: #000;
    font-size: 8pt;
    padding: 2px 4px;
    word-wrap: break-word;
    white-space: normal;
    overflow: hidden;
  }
  .border-all { border: 1px solid #000; }
  .border-t   { border-top: 1px solid #000; }
  .border-b   { border-bottom: 1px solid #000; }
  .border-l   { border-left: 1px solid #000; }
  .border-r   { border-right: 1px solid #000; }
  .center     { text-align: center; }
  .right      { text-align: right; }
  .bold       { font-weight: bold; }
  .italic     { font-style: italic; }
  .underline  { text-decoration: underline; }
  .small      { font-size: 7.5pt; }
`;

// ─── HTML generator ───────────────────────────────────────────────────────────

export function buildCanvassHTML(data: CanvassPreviewData): string {
  const {
    prNo, quotationNo, date, deadline, bacChairperson,
    officeSection, purpose, items, canvasserNames,
    supplierName = "", supplierAddress = "",
  } = data;

  // Pad item rows to at least 8 lines (form always has blank rows)
  const MIN_ROWS = 8;
  const itemRows = [...items];
  while (itemRows.length < MIN_ROWS) {
    itemRows.push({ itemNo: 0, description: "", qty: 0, unit: "", unitPrice: "" });
  }

  const canvasserBlock = canvasserNames.join(" / ") || "—";

  const itemRowsHTML = itemRows.map((item) => `
    <tr style="height:18px;">
      <td class="border-all center">${item.itemNo > 0 ? item.itemNo : ""}</td>
      <td class="border-all" style="padding:2px 6px;">${item.description ?? ""}</td>
      <td class="border-all center">${item.qty > 0 ? item.qty : ""}</td>
      <td class="border-all center">${item.unit ?? ""}</td>
      <td class="border-all right">${item.unitPrice ?? ""}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Canvass / RFQ — ${quotationNo}</title>
  <style>${BASE_CSS}</style>
</head>
<body>

<!-- ── Top header ─────────────────────────────────────────────── -->
<table style="margin-bottom:4px;">
  <colgroup>
    <col style="width:55%"/>
    <col style="width:45%"/>
  </colgroup>
  <tbody>
    <tr>
      <!-- Left: Republic + agency name -->
      <td style="vertical-align:top; padding-left:0;">
        <div style="font-size:7.5pt; text-align:center; line-height:1.4;">
          REPUBLIC OF THE PHILIPPINES<br/>
          <span class="bold" style="font-size:9pt;">DEPARTMENT OF AGRARIAN REFORM</span><br/>
          <span class="italic" style="font-size:7.5pt;">
            Tunay na Pagbabago sa Repormang Agraryo
          </span>
        </div>
      </td>
      <!-- Right: Date + Quotation No. -->
      <td style="vertical-align:bottom; text-align:right; font-size:8pt; padding-right:0;">
        <table style="width:100%; border-collapse:collapse; float:right; font-size:8pt;">
          <tr>
            <td style="text-align:right; padding:1px 4px;">
              Revised on May 24, 2004
            </td>
            <td style="text-align:right; border-bottom:1px solid #000; padding:1px 4px; min-width:100px;">
              Date: ${date}
            </td>
          </tr>
          <tr>
            <td></td>
            <td style="text-align:right; border-bottom:1px solid #000; padding:1px 4px;">
              Quotation No. ${quotationNo}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </tbody>
</table>

<!-- ── Agency / procuring entity ─────────────────────────────── -->
<div style="text-align:center; font-weight:bold; font-size:10pt; margin-bottom:2px;">
  DEPARTMENT OF AGRARIAN REFORM
</div>
<div style="text-align:center; font-size:8.5pt; margin-bottom:6px;">
  Agency/Procuring Entity
</div>

<!-- ── Supplier lines ─────────────────────────────────────────── -->
<table style="margin-bottom:4px;">
  <tr>
    <td style="border-bottom:1px solid #000; font-size:8pt; min-width:260px; padding:1px 2px;">
      ${supplierName}
    </td>
    <td style="width:50%;"></td>
  </tr>
  <tr>
    <td style="font-size:7.5pt; color:#555; padding:0 2px;">(Company Name)</td>
    <td></td>
  </tr>
  <tr>
    <td style="border-bottom:1px solid #000; font-size:8pt; padding:1px 2px;">
      ${supplierAddress}
    </td>
    <td></td>
  </tr>
  <tr>
    <td style="font-size:7.5pt; color:#555; padding:0 2px;">(Address)</td>
    <td></td>
  </tr>
</table>

<!-- ── Instruction paragraph ──────────────────────────────────── -->
<div style="font-size:8pt; margin-bottom:4px; line-height:1.4;">
  &nbsp;&nbsp;&nbsp;Please quote your lowest price on the item/s listed below, subject to the General
  Conditions indicated below, stating the shortest time of delivery and submit your quotation
  duly signed by you or your duly authorized representative not later than
  <span class="underline bold">${deadline}</span>
</div>

<!-- ── BAC Chairperson ────────────────────────────────────────── -->
<div style="text-align:right; margin-bottom:6px;">
  <div class="bold underline" style="font-size:9pt;">${bacChairperson}</div>
  <div style="font-size:7.5pt;">BAC Chairperson</div>
</div>

<!-- ── Notes (two-column) ─────────────────────────────────────── -->
<table style="margin-bottom:6px; font-size:7.5pt;">
  <colgroup>
    <col style="width:4%"/>
    <col style="width:46%"/>
    <col style="width:4%"/>
    <col style="width:46%"/>
  </colgroup>
  <tbody>
    <tr><td class="bold">NOTE:</td><td colspan="3"></td></tr>
    <tr>
      <td class="bold" style="vertical-align:top;">1.</td>
      <td>ALL ENTRIES MUST BE WRITTEN LEGIBLY.</td>
      <td class="bold" style="vertical-align:top;">5.</td>
      <td>DELIVERY PERIOD WITHIN <span class="bold underline">SEVEN (7) DAYS</span> UPON RECEIPT OF PURCHASE ORDER.</td>
    </tr>
    <tr>
      <td class="bold" style="vertical-align:top;">2.</td>
      <td>QUOTATION MUST BE RETURNED IN A SEALED ENVELOPE NO LONGER THAN THREE (3) DAYS UPON RECEIPT.</td>
      <td class="bold" style="vertical-align:top;">6.</td>
      <td>WARRANTY SHALL BE FOR A PERIOD OF SIX (6) MONTHS FOR SUPPLIES &amp; MATERIALS, ONE (1) YEAR FOR EQUIPMENT FROM DATE OF ACCEPTANCE BY THE PROCURING ENTITY.</td>
    </tr>
    <tr>
      <td class="bold" style="vertical-align:top;">3.</td>
      <td>PRICE QUOTATIONS MUST INDICATE PRICE/S, SERVICE/DELIVERY CHARGES INCLUSIVE OF VAT/OTHER CHARGES. IF NON-INCLUSIVE, PLEASE INDICATE FIGURES FOR VAT.</td>
      <td class="bold" style="vertical-align:top;">7.</td>
      <td>I / WE ARE BOUND TO DELIVER THE ITEM/S PER OUR QUOTATION, PURSUANT TO THE PROVISIONS OR SANCTIONS UNDER RA 9184.</td>
    </tr>
    <tr>
      <td class="bold" style="vertical-align:top;">4.</td>
      <td>PRICE VALIDITY SHALL BE FOR A PERIOD OF <span class="bold underline">180 CALENDAR DAYS</span>.</td>
      <td></td><td></td>
    </tr>
  </tbody>
</table>

<!-- ── Item table ─────────────────────────────────────────────── -->
<table style="margin-bottom:4px;">
  <colgroup>
    <col style="width:8%"/>
    <col style="width:56%"/>
    <col style="width:8%"/>
    <col style="width:12%"/>
    <col style="width:16%"/>
  </colgroup>
  <thead>
    <tr style="height:22px;">
      <th class="border-all center bold" style="font-size:8pt;">ITEM<br/>NO.</th>
      <th class="border-all center bold" style="font-size:8pt;">ITEM(S) &amp; DESCRIPTION(S)</th>
      <th class="border-all center bold" style="font-size:8pt;">QTY</th>
      <th class="border-all center bold" style="font-size:8pt;">UNIT</th>
      <th class="border-all center bold" style="font-size:8pt;">UNIT<br/>PRICE</th>
    </tr>
  </thead>
  <tbody>
    ${itemRowsHTML}
    <!-- TOTAL row -->
    <tr style="height:18px;">
      <td class="border-all" colspan="4" style="text-align:right; font-weight:bold; padding-right:6px;">
        TOTAL
      </td>
      <td class="border-all right"></td>
    </tr>
  </tbody>
</table>

<!-- ── Acceptance statement ───────────────────────────────────── -->
<div class="italic bold" style="font-size:8pt; margin-bottom:8px;">
  AFTER HAVING CAREFULLY READ AND ACCEPTED YOUR GENERAL CONDITIONS, I / WE QUOTE YOU ON THE ITEM AT PRICES NOTED ABOVE.
</div>

<!-- ── Signature / supplier info block ───────────────────────── -->
<table style="font-size:8pt; margin-bottom:4px;">
  <colgroup>
    <col style="width:50%"/>
    <col style="width:50%"/>
  </colgroup>
  <tbody>
    <tr style="height:14px;">
      <td>Served by:</td>
      <td style="border-bottom:1px solid #000;">PRINTED NAME/SIGNATURE</td>
    </tr>
    <tr style="height:20px;">
      <td></td>
      <td style="border-bottom:1px solid #000; font-size:7.5pt; color:#555;">
        Tel No./Cellphone No./Email Address
      </td>
    </tr>
    <tr style="height:8px;"><td colspan="2"></td></tr>
    <!-- Canvassers listed at left -->
    <tr>
      <td style="vertical-align:top; font-size:8pt; line-height:1.5;">
        <span class="bold">${canvasserBlock}</span>
      </td>
      <td style="border-bottom:1px solid #000; font-size:7.5pt; color:#555;">
        PhilGeps Registration Number
      </td>
    </tr>
    <tr style="height:8px;"><td colspan="2"></td></tr>
    <tr>
      <td style="font-size:7.5pt;">CANVASSER</td>
      <td style="border-bottom:1px solid #000; font-size:7.5pt; color:#555;">
        BIR-TIN
      </td>
    </tr>
    <tr style="height:8px;"><td colspan="2"></td></tr>
    <tr>
      <td style="font-size:8pt; color:#555;">${quotationNo}</td>
      <td>
        <table style="width:100%; border:1px solid #000; font-size:8pt;">
          <tr>
            <td class="center bold" style="border-right:1px solid #000; padding:2px 8px;">VAT</td>
            <td class="center bold" style="padding:2px 8px;">NON-VAT</td>
          </tr>
          <tr>
            <td colspan="2" class="center italic small" style="border-top:1px solid #000; padding:2px;">
              (Please check - VAT or NON-VAT)
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </tbody>
</table>

<!-- ── Form code ──────────────────────────────────────────────── -->
<div style="text-align:right; font-size:7pt; margin-top:6px; color:#444;">
  DARCS1-QF-STO-009 Rev 01
</div>

</body>
</html>`;
}
