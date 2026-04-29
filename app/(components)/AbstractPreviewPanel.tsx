/**
 * AbstractPreviewPanel.tsx — Shared Abstract of Bids PDF preview module
 *
 * Renders the Abstract of Bids / Abstract of Quotations form.
 */

import React from "react";
import {
  type ViewStyle,
} from "react-native";
import DocumentPreviewPanel from "./DocumentPreviewPanel";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AbstractPreviewData {
  prNo?: string;
  date?: string;
  items?: AbstractLineItem[];
  bidders?: Bidder[];
}

export interface AbstractLineItem {
  description?: string;
  quantity?: number;
  unit?: string;
}

export interface Bidder {
  name?: string;
  items?: { price: number; remarks?: string }[];
}

// ─── buildAbstractHtml ─────────────────────────────────────────────────────────

export function buildAbstractHtml(
  data: AbstractPreviewData,
  opts?: { template?: boolean },
): string {
  const template = !!opts?.template;
  const fmtNum = (n: number) =>
    n.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const today =
    (template ? "" : data.date) ||
    new Date().toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const bidders = template ? [{}, {}, {}] : data.bidders || [];
  const bidderHeaders = bidders
    .map(
      (b) => `<th style="border:1px solid black;font-size:8pt;padding:4px;text-align:center;font-weight:bold" colspan="2">${b.name || "Bidder"}</th>`
    )
    .join("");

  const items = template ? [] : data.items || [];
  const padded = [...items];
  while (padded.length < 12)
    padded.push({ description: "", quantity: undefined, unit: "" });
  const rows = padded
    .map((it, idx) => {
      const bidderCells = bidders
        .map((bidder) => {
          const price = bidder.items?.[idx]?.price;
          const remarks = bidder.items?.[idx]?.remarks;
          return `<td style="border:1px solid black;font-size:8pt;padding:4px;text-align:right">${price ? fmtNum(price) : ""}</td><td style="border:1px solid black;font-size:8pt;padding:4px;text-align:center">${remarks || ""}</td>`;
        })
        .join("");
      return `<tr>
      <td style="border:1px solid black;font-size:8pt;padding:4px;text-align:center">${idx + 1}</td>
      <td style="border:1px solid black;font-size:8pt;padding:4px">${it.description || ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:4px;text-align:center">${it.quantity || ""}</td>
      <td style="border:1px solid black;font-size:8pt;padding:4px;text-align:center">${it.unit || ""}</td>
      ${bidderCells}
    </tr>`;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Times New Roman',Times,serif;font-size:10pt;color:#000;background:#fff;padding:24px}table{width:100%;border-collapse:collapse;color:#000}@media print{body{padding:10mm}@page{margin:8mm}}</style>
</head><body>
<table><tbody>
<tr><td colspan="${4 + bidders.length * 2}" style="text-align:center;font-weight:bold;font-size:14pt;padding-bottom:16px">ABSTRACT OF BIDS / QUOTATIONS</td></tr>
<tr><td colspan="${4 + bidders.length * 2}" style="padding:4px 0"><b>PR No.:</b> ${template ? "" : data.prNo || ""} &nbsp;&nbsp;&nbsp;&nbsp; <b>Date:</b> ${today}</td></tr>
</tbody></table>

<table style="margin-top:12px">
<colgroup><col style="width:5%"/><col style="width:35%"/><col style="width:10%"/><col style="width:10%"/>${bidders.map(() => `<col style="width:15%"/><col style="width:10%"/>`).join("")}</colgroup>
<tbody>
<tr>
  <th style="border:1px solid black;font-size:8pt;padding:4px;text-align:center;font-weight:bold" rowspan="2">No.</th>
  <th style="border:1px solid black;font-size:8pt;padding:4px;text-align:center;font-weight:bold" rowspan="2">Description</th>
  <th style="border:1px solid black;font-size:8pt;padding:4px;text-align:center;font-weight:bold" rowspan="2">Qty</th>
  <th style="border:1px solid black;font-size:8pt;padding:4px;text-align:center;font-weight:bold" rowspan="2">Unit</th>
  ${bidderHeaders}
</tr>
<tr>
  ${bidders.map(() => `<th style="border:1px solid black;font-size:8pt;padding:4px;text-align:center;font-weight:bold">Price</th><th style="border:1px solid black;font-size:8pt;padding:4px;text-align:center;font-weight:bold">Remarks</th>`).join("")}
</tr>
${rows}
</tbody></table>

<table style="margin-top:24px"><tbody>
<tr><td colspan="${4 + bidders.length * 2}" style="padding:8px 0"><i>Remarks: _________________________________________________________</i></td></tr>
<tr><td colspan="${4 + bidders.length * 2}" style="padding-top:24px">Prepared by: _________________________________</td></tr>
<tr><td colspan="${4 + bidders.length * 2}" style="font-size:9pt">BAC Chairman / Authorized Representative</td></tr>
</tbody></table>
</body></html>`;
}

// ─── AbstractPreviewPanel (default export) ─────────────────────────────────────

interface AbstractPreviewPanelProps {
  html: string;
  templateHtml?: string;
  initialMode?: "filled" | "template";
  showActions: boolean;
  style?: ViewStyle;
}

export default function AbstractPreviewPanel({
  html,
  templateHtml,
  initialMode,
  showActions,
  style,
}: AbstractPreviewPanelProps) {
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
