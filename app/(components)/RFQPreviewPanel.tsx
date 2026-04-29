/**
 * RFQPreviewPanel.tsx — Shared RFQ PDF preview module
 *
 * Renders the Request for Quotation form.
 */

import React from "react";
import {
  type ViewStyle,
} from "react-native";
import { getBagongPilipinasLogoHTML, getDARSquare2LogoHTML, getISOCertifiedLogoHTML } from "../lib/documentAssets";
import DocumentPreviewPanel from "./DocumentPreviewPanel";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RFQPreviewData {
  prNo?: string;
  date?: string;
  supplier?: string;
  items?: RFQLineItem[];
}

export interface RFQLineItem {
  description?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
}

// ─── buildRFQHtml ────────────────────────────────────────────────────────────

export function buildRFQHtml(
  data: RFQPreviewData,
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

  const items = template ? [] : data.items || [];
  const rows = items
    .map(
      (it, idx) => `
    <tr>
      <td style="border:1px solid black;font-size:9pt;padding:4px;text-align:center">${idx + 1}</td>
      <td style="border:1px solid black;font-size:9pt;padding:4px">${it.description || ""}</td>
      <td style="border:1px solid black;font-size:9pt;padding:4px;text-align:center">${it.quantity || ""}</td>
      <td style="border:1px solid black;font-size:9pt;padding:4px;text-align:center">${it.unit || ""}</td>
      <td style="border:1px solid black;font-size:9pt;padding:4px;text-align:right">${it.unitPrice ? fmtNum(it.unitPrice) : ""}</td>
      <td style="border:1px solid black;font-size:9pt;padding:4px;text-align:right">${(it.quantity && it.unitPrice) ? fmtNum(it.quantity * it.unitPrice) : ""}</td>
    </tr>
  `
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Times New Roman',Times,serif;font-size:10pt;color:#000;background:#fff;padding:20px}table{width:100%;border-collapse:collapse;color:#000}@media print{body{padding:8mm}@page{margin:6mm}}</style>
</head><body>
${`
<!-- ── RFQ/Canvass Letterhead ─────────────────────────────────────────── -->
<table style="margin-bottom: 8px; width:100%;">
  <colgroup>
    <col style="width: 15%"/>
    <col style="width: 70%"/>
    <col style="width: 15%"/>
  </colgroup>
  <tbody>
    <tr>
      <td style="vertical-align: middle; text-align: center; padding:6px;">
        ${getDARSquare2LogoHTML(50)}
      </td>
      <td style="text-align: center; vertical-align: middle; padding:4px;">
        <div style="font-size: 9pt; line-height: 1.3; margin-bottom:2px; font-weight: bold;">
          REPUBLIC OF THE PHILIPPINES
        </div>
        <div style="font-size: 12pt; font-weight: bold; line-height: 1.2; color: #064E3B;">
          DEPARTMENT OF AGRARIAN REFORM
        </div>
        <div style="font-size: 8pt; line-height: 1.3; color: #555; margin-top:2px;">
          REGIONAL OFFICE NO. V
        </div>
      </td>
      <td style="vertical-align: middle; text-align: center; padding:6px;">
        ${getBagongPilipinasLogoHTML(50)}
      </td>
    </tr>
  </tbody>
</table>

<table style="margin-bottom: 12px; width:100%;">
  <colgroup>
    <col style="width: 85%"/>
    <col style="width: 15%"/>
  </colgroup>
  <tbody>
    <tr>
      <td style="text-align: center; vertical-align: middle; padding:4px;">
        <div style="font-size: 14pt; font-weight: bold; letter-spacing: 0.5px;">
          REQUEST FOR QUOTATION
        </div>
      </td>
      <td style="vertical-align: middle; text-align: center; padding:4px;">
        ${getISOCertifiedLogoHTML(35)}
      </td>
    </tr>
  </tbody>
</table>

<hr style="border: none; border-top: 1.5px solid #000; margin: 8px 0 12px 0;"/>
`}
<table><tbody>
<tr><td colspan="3" style="padding:4px 0"><b>PR No.:</b> ${template ? "" : data.prNo || ""}</td><td colspan="3" style="padding:4px 0;text-align:right"><b>Date:</b> ${today}</td></tr>
<tr><td colspan="6" style="padding:4px 0"><b>Supplier:</b> ${template ? "_______________________________" : data.supplier || "_______________________________"}</td></tr>
<tr><td colspan="6" style="padding:8px 0">We would like to request for the submission of your quotation for the following:</td></tr>
</tbody></table>

<table style="margin-top:12px"><colgroup><col style="width:5%"/><col style="width:45%"/><col style="width:10%"/><col style="width:10%"/><col style="width:15%"/><col style="width:15%"/></colgroup>
<tbody>
<tr style="background:#f5f5f5">
  <th style="border:1px solid black;font-size:9pt;padding:4px;text-align:center;font-weight:bold">No.</th>
  <th style="border:1px solid black;font-size:9pt;padding:4px;text-align:center;font-weight:bold">Description</th>
  <th style="border:1px solid black;font-size:9pt;padding:4px;text-align:center;font-weight:bold">Qty</th>
  <th style="border:1px solid black;font-size:9pt;padding:4px;text-align:center;font-weight:bold">Unit</th>
  <th style="border:1px solid black;font-size:9pt;padding:4px;text-align:center;font-weight:bold">Unit Price</th>
  <th style="border:1px solid black;font-size:9pt;padding:4px;text-align:center;font-weight:bold">Total</th>
</tr>
${rows}
</tbody></table>

<table style="margin-top:24px"><tbody>
<tr><td colspan="6" style="padding:8px 0">Please submit your quotation in a sealed envelope addressed to the undersigned on or before _______________.</td></tr>
<tr><td colspan="6" style="padding:8px 0">Very truly yours,</td></tr>
<tr><td colspan="6" style="padding-top:24px">_______________________________</td></tr>
<tr><td colspan="6" style="font-size:9pt">BAC Chairman / Authorized Representative</td></tr>
</tbody></table>
</body></html>`;
}

// ─── RFQPreviewPanel (default export) ────────────────────────────────────────

interface RFQPreviewPanelProps {
  html: string;
  templateHtml?: string;
  initialMode?: "filled" | "template";
  showActions: boolean;
  style?: ViewStyle;
}

export default function RFQPreviewPanel({
  html,
  templateHtml,
  initialMode,
  showActions,
  style,
}: RFQPreviewPanelProps) {
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
