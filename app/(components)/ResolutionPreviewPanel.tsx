/**
 * ResolutionPreviewPanel.tsx — Shared Resolution PDF preview module
 *
 * Renders the Resolution of Award / BAC Resolution form.
 */

import React from "react";
import {
  type ViewStyle,
} from "react-native";
import DocumentPreviewPanel from "./DocumentPreviewPanel";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResolutionPreviewData {
  prNo?: string;
  date?: string;
  supplier?: string;
  amount?: number;
  description?: string;
  bacMembers?: string[];
}

// ─── buildResolutionHtml ─────────────────────────────────────────────────────

export function buildResolutionHtml(
  data: ResolutionPreviewData,
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

  const bacMembers =
    (template ? undefined : data.bacMembers) || [
      "____________________",
      "____________________",
      "____________________",
    ];
  const bacRows = bacMembers
    .map(
      (member) => `
    <tr>
      <td style="padding:12px 0;width:50%">
        <div style="border-bottom:1px solid black;width:80%;margin:0 auto 4px 0"></div>
        <div style="font-size:9pt;text-align:center;width:80%">${member}</div>
        <div style="font-size:8pt;text-align:center;width:80%;color:#666">BAC Member</div>
      </td>
    </tr>
  `
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Times New Roman',Times,serif;font-size:10pt;color:#000;background:#fff;padding:24px}table{width:100%;border-collapse:collapse;color:#000}@media print{body{padding:10mm}@page{margin:8mm}}</style>
</head><body>
<table><tbody>
<tr><td style="text-align:center;font-weight:bold;font-size:14pt;padding-bottom:8px">RESOLUTION OF AWARD</td></tr>
<tr><td style="text-align:center;font-size:9pt;padding-bottom:16px">Bids and Awards Committee</td></tr>
</tbody></table>

<table style="margin-top:12px"><tbody>
<tr><td style="padding:4px 0"><b>PR No.:</b> ${template ? "" : data.prNo || ""}</td></tr>
<tr><td style="padding:4px 0"><b>Date:</b> ${today}</td></tr>
<tr><td style="padding:4px 0"><b>Description:</b> ${template ? "" : data.description || ""}</td></tr>
</tbody></table>

<table style="margin-top:16px"><tbody>
<tr><td style="padding:8px 0">WHEREAS, the Bids and Awards Committee (BAC) has conducted a competitive bidding for the above-mentioned procurement;</td></tr>
<tr><td style="padding:8px 0">WHEREAS, the evaluation of bids has been completed in accordance with the Government Procurement Reform Act;</td></tr>
<tr><td style="padding:8px 0">WHEREAS, <b>${template ? "_______________________" : data.supplier || "_______________________"}</b> has been found to be the lowest calculated and responsive bidder;</td></tr>
<tr><td style="padding:8px 0">NOW THEREFORE, the BAC RESOLVES to recommend the award of contract to the said bidder in the amount of <b>₱${!template && data.amount ? fmtNum(data.amount) : "___________"}</b>;</td></tr>
</tbody></table>

<table style="margin-top:24px"><tbody>
<tr><td colspan="2" style="font-weight:bold;padding-bottom:8px">Signed by the BAC Members:</td></tr>
${bacRows}
</tbody></table>
</body></html>`;
}

// ─── ResolutionPreviewPanel (default export) ───────────────────────────────────

interface ResolutionPreviewPanelProps {
  html: string;
  templateHtml?: string;
  initialMode?: "filled" | "template";
  showActions: boolean;
  style?: ViewStyle;
}

export default function ResolutionPreviewPanel({
  html,
  templateHtml,
  initialMode,
  showActions,
  style,
}: ResolutionPreviewPanelProps) {
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
