/**
 * AAAPreview.tsx
 *
 * Generates an HTML string matching the official DAR Abstract of Price Quotations
 * document (as shown in the sample image), consumed by AAAPreviewModal via WebView.
 *
 * Document structure (top → bottom, from sample):
 *   1. Top-right reference block  — BAC No. / PR No. / Resolution No. / Date
 *   2. Title block                — "ABSTRACT OF PRICE QUOTATIONS…"
 *   3. Column header row          — ITEM NO. | QTY | UNIT | PARTICULARS | [Dealer columns]
 *   4. Job-order description row  — spans Particulars column, no prices
 *   5. Item rows                  — one per PR line item, with checkmarks on winners
 *   6. Summary rows               — TOTAL MATERIAL COST / TOTAL LABOR COST / X-X-X / TOTAL
 */

import React from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";

// ─── Data types ───────────────────────────────────────────────────────────────

export interface AAAPreviewData {
  /** Reference block (top-right) */
  rfqNo:         string;
  prNo:          string;
  resolutionNo:  string;
  date:          string;

  /** Document title sub-line — office/requestor name */
  office:        string;

  /** Job-order description that appears as the first row in the table */
  particulars:   string;

  /** Up to 3 dealer/supplier names */
  suppliers:     string[];

  /** One entry per PR line item */
  rows: Array<{
    itemNo:   number;
    qty:      number;
    unit:     string;
    desc:     string;
    /** keyed by supplier name → unit price (0 if not quoted) */
    prices:   Record<string, number>;
    /** name of the winning supplier for this item, or null */
    winner:   string | null;
  }>;

  /** Optional separate totals (material vs labour+rental) */
  totalMaterial?: number;
  totalLabour?:   number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cur(n: number) {
  return n > 0
    ? n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "";
}

// ─── HTML generator ───────────────────────────────────────────────────────────

export function buildAAAPreviewHTML(
  d: AAAPreviewData,
  opts?: { template?: boolean },
): string {
  const template = !!opts?.template;
  const suppliers =
    d.suppliers.length > 0
      ? template
        ? d.suppliers.map(() => "")
        : d.suppliers
      : template
        ? ["", "", ""]
        : ["—"];
  const supplierCount = suppliers.length || 1;
  // Each supplier column gets roughly equal width; fixed layout manages the rest
  const supplierColPct = Math.floor(50 / supplierCount);

  // ── Top-right reference block ────────────────────────────────────────────
  const refBlock = `
    <table class="ref-table">
      <tr><td class="ref-label">RFQ No.</td><td class="ref-td">${template ? "" : d.rfqNo}</td></tr>
      <tr><td class="ref-label">PR No.</td><td class="ref-td">${template ? "" : d.prNo}</td></tr>
      <tr><td class="ref-label">Resolution No.</td><td class="ref-td">${template ? "" : d.resolutionNo}</td></tr>
      <tr><td class="ref-label">Date</td><td class="ref-td">${template ? "" : d.date}</td></tr>
    </table>`;

  // ── Supplier column headers ──────────────────────────────────────────────
  const supplierHeaders = suppliers
    .map((s) => `<th style="width:${supplierColPct}%;">${s || "&nbsp;"}</th>`)
    .join("");

  // ── Job-order description row ────────────────────────────────────────────
  const jobOrderRow = `
    <tr>
      <td colspan="4" class="job-order-cell">
        <strong>JOB ORDER</strong><br/>
        ${template ? "" : (d.particulars || "").replace(/\n/g, "<br/>")}
      </td>
      ${suppliers.map(() => "<td></td>").join("")}
    </tr>`;

  // ── Item rows ────────────────────────────────────────────────────────────
  const rowsSrc = template
    ? Array.from({ length: 12 }).map((_, i) => ({
        itemNo: i + 1,
        qty: 0,
        unit: "",
        desc: "",
        prices: {},
        winner: null,
      }))
    : d.rows;

  const itemRows = rowsSrc
    .map((r) => {
      const priceCells = template
        ? suppliers.map(() => `<td class="price-td"></td>`).join("")
        : suppliers
            .map((s) => {
              const p = r.prices[s] ?? 0;
              const isWin = r.winner === s && p > 0;
              return `<td class="price-td${isWin ? " winner" : ""}">
            ${cur(p)}${isWin ? '<span class="check">✓</span>' : ""}
          </td>`;
            })
            .join("");
      return `
        <tr>
          <td class="center-td">${r.itemNo}</td>
          <td class="center-td">${template ? "" : r.qty || ""}</td>
          <td class="center-td">${template ? "" : r.unit}</td>
          <td class="desc-td">${template ? "" : r.desc}</td>
          ${priceCells}
        </tr>`;
    })
    .join("");

  // ── Summary rows ─────────────────────────────────────────────────────────
  // Grand totals per supplier (all item prices × qty)
  const supplierGrandTotals = template
    ? suppliers.map(() => 0)
    : suppliers.map((s) =>
        d.rows.reduce((sum, r) => sum + (r.prices[s] ?? 0) * r.qty, 0),
      );

  const matCells = template
    ? suppliers.map(() => `<td class="price-td"></td>`).join("")
    : suppliers
        .map((_, i) =>
          d.totalMaterial !== undefined
            ? `<td class="price-td">${i === 0 ? cur(d.totalMaterial) : ""}</td>`
            : `<td></td>`,
        )
        .join("");

  const labCells = suppliers.map(() => `<td></td>`).join("");

  const xCells = suppliers.map(() => `<td class="x-row"></td>`).join("");

  const totalCells = supplierGrandTotals
    .map((t) => `<td class="price-td total-td">${cur(t)}</td>`)
    .join("");

  const summaryRows = `
    <tr class="summary-row">
      <td colspan="4" class="summary-label">TOTAL MATERIAL COST</td>
      ${matCells}
    </tr>
    <tr class="summary-row">
      <td colspan="4" class="summary-label">TOTAL LABOR COST AND MACHINE RENTAL</td>
      ${labCells}
    </tr>
    <tr class="summary-row">
      <td colspan="4" class="x-row">X-X-X-X-X-X-X-X-X-X-X-X-X-X-X</td>
      ${xCells}
    </tr>
    <tr class="summary-row total-row">
      <td colspan="3" class="summary-label"></td>
      <td class="summary-label">TOTAL</td>
      ${totalCells}
    </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Abstract of Price Quotations</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9pt;
      color: #000;
      background: #fff;
      padding: 10mm 10mm 8mm 10mm;
    }

    /* Reference block (top-right) */
    .page-header {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 6px;
    }
    .ref-table { border-collapse: collapse; }
    .ref-label {
      font-size: 8pt;
      text-align: left;
      padding: 0 6px 0 0;
      white-space: nowrap;
      color: #374151;
    }
    .ref-td {
      font-size: 8.5pt;
      text-align: right;
      padding: 0 2px;
      border-bottom: 1px solid #000;
      min-width: 120px;
    }

    /* Title */
    .title-block {
      text-align: center;
      margin-bottom: 10px;
    }
    .title-main {
      font-size: 10.5pt;
      font-weight: bold;
      line-height: 1.4;
    }
    .title-sub { font-size: 9pt; line-height: 1.3; }

    /* Main table */
    table.main {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin-bottom: 0;
    }
    table.main th,
    table.main td {
      border: 1px solid #000;
      font-size: 8.5pt;
      vertical-align: middle;
      padding: 2px 3px;
      word-wrap: break-word;
    }
    /* Column widths */
    .col-item   { width: 5%;  }
    .col-qty    { width: 5%;  }
    .col-unit   { width: 8%;  }
    .col-desc   { width: 32%; }
    /* Supplier columns fill remaining ~50% */

    /* Header rows */
    .dealers-header th {
      background: #f0f0f0;
      font-weight: bold;
      font-size: 9pt;
      text-align: center;
    }
    .col-header th {
      background: #f8f8f8;
      font-weight: bold;
      font-size: 8pt;
      text-align: center;
    }

    /* Job order description row */
    .job-order-cell {
      font-size: 8.5pt;
      text-align: left;
      padding: 4px 6px;
      line-height: 1.4;
    }

    /* Item price cells */
    .center-td { text-align: center; }
    .desc-td   { text-align: left; padding-left: 4px; }
    .price-td  { text-align: right; padding-right: 4px; }
    .price-td.winner {
      font-weight: bold;
      background-color: #fff9c4;
    }
    .check {
      display: inline-block;
      margin-left: 3px;
      font-weight: bold;
      color: #1a6b3c;
    }

    /* Summary rows */
    .summary-row td { font-size: 8.5pt; }
    .summary-label {
      text-align: right;
      font-weight: bold;
      padding-right: 6px;
    }
    .total-row .summary-label { font-size: 9.5pt; }
    .total-td { font-weight: bold; font-size: 9.5pt; }
    .x-row { text-align: center; letter-spacing: 1px; }
  </style>
</head>
<body>

  <!-- Reference block -->
  <div class="page-header">
    ${refBlock}
  </div>

  <!-- Title -->
  <div class="title-block">
    <div class="title-main">ABSTRACT OF PRICE QUOTATIONS OFFERED FOR VARIOUS OFFICE SUPPLIES</div>
    <div class="title-main">AND MATERIALS CALLED FOR ON REQUEST FROM ${d.office.toUpperCase()}</div>
    <div class="title-sub">PROVINCIAL OFFICE OFFERED BY DIFFERENT LEADING DEALERS</div>
  </div>

  <!-- Main table -->
  <table class="main">
    <colgroup>
      <col class="col-item"/>
      <col class="col-qty"/>
      <col class="col-unit"/>
      <col class="col-desc"/>
      ${d.suppliers.map(() => `<col style="width:${supplierColPct}%;"/>`).join("")}
    </colgroup>
    <thead>
      <!-- "NAME OF DEALERS" spanning supplier columns -->
      <tr class="dealers-header">
        <th colspan="4" style="border:1px solid #000;"></th>
        <th colspan="${supplierCount}" style="text-align:center;">NAME OF DEALERS</th>
      </tr>
      <!-- Column labels -->
      <tr class="col-header">
        <th>ITEM NO.</th>
        <th>QTY</th>
        <th>UNIT</th>
        <th style="text-align:left;padding-left:4px;">PARTICULARS</th>
        ${supplierHeaders}
      </tr>
    </thead>
    <tbody>
      ${jobOrderRow}
      ${itemRows}
      ${summaryRows}
    </tbody>
  </table>

</body>
</html>`;
}

// ─── WebView wrapper (used by AAAPreviewModal) ────────────────────────────────

export default function AAAPreview({ html }: { html: string }) {
  return (
    <View style={{ flex: 1 }}>
      <WebView
        originWhitelist={["*"]}
        source={{ html }}
        style={{ flex: 1 }}
        scrollEnabled
        showsVerticalScrollIndicator
      />
    </View>
  );
}
