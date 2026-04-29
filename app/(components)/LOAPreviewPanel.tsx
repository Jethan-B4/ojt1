import { getDARSquare2LogoHTML } from "@/app/lib/documentAssets";
import React from "react";
import IARPreviewPanel from "./IARPreviewPanel";

export function buildLOAHtml(d: {
  supplier?: string;
  invoiceNo?: string;
  invoiceDate?: string;
  poNo?: string;
  poDate?: string;
  acceptanceDate?: string;
  signatoryName?: string;
  signatoryTitle?: string;
  provincialOffice?: string;
  address?: string;
}) {
  const officeAddress =
    d.address ?? "2/FHL BLDG., CARNATION ST., BRGY. TRIANGULO, NAGA CITY";

  const ul = (val?: string) =>
    `<span style="display:inline-block; min-width:58mm; border-bottom:1px solid #000; font-weight:bold; padding:0 2px; vertical-align:bottom;">${val ?? "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"}</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Letter of Acceptance</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Times New Roman", Times, serif;
    font-size: 12pt;
    color: #000;
    background: #fff;
    padding: 14mm 18mm 18mm 18mm;
    line-height: 1.5;
  }
  table { border-collapse: collapse; width: 100%; }
  td { border: none; vertical-align: middle; padding: 2px 4px; }
  .hr-line { border: none; border-top: 1.5px solid #000; margin: 6px 0 18px 0; }
  .title {
    text-align: center;
    font-size: 14pt;
    font-weight: bold;
    letter-spacing: 0.5px;
    margin-bottom: 18mm;
  }
</style>
</head>
<body>

<!-- ── Letterhead ──────────────────────────────────────────────────────── -->
<table style="margin-bottom:4px;">
  <colgroup>
    <col style="width:15%"/>
    <col style="width:85%"/>
  </colgroup>
  <tr>
    <td style="text-align:center; vertical-align:middle; padding:4px 8px 4px 0;">
      ${getDARSquare2LogoHTML(62)}
    </td>
    <td style="vertical-align:middle; padding:2px 4px;">
      <div style="font-size:10pt; line-height:1.4;">Republic of the Philippines</div>
      <div style="font-size:13pt; font-weight:bold; line-height:1.3;">DEPARTMENT OF AGRARIAN REFORM</div>
      <div style="font-size:10pt; line-height:1.4;">Camarines Sur Provincial Office</div>
      <div style="font-size:10pt; line-height:1.4;">${officeAddress}</div>
    </td>
  </tr>
</table>

<hr class="hr-line"/>

<!-- ── Title ──────────────────────────────────────────────────────────── -->
<div class="title">LETTER OF ACCEPTANCE</div>

<!-- ── Date — top right ───────────────────────────────────────────────── -->
<div style="text-align:right; margin-bottom:14mm;">
  <div style="display:inline-block; text-align:center; min-width:58mm;">
    <div style="border-top:1px solid #000; padding-top:2px; font-weight:bold; min-height:16px;">
      ${d.acceptanceDate ?? "&nbsp;"}
    </div>
    <div style="font-size:10pt; color:#333;">Date</div>
  </div>
</div>

<!-- ── Body paragraph ─────────────────────────────────────────────────── -->
<div style="text-align:justify; line-height:2.1; margin-bottom:14mm;">
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  I/WE &nbsp;hereby &nbsp;certify &nbsp;to &nbsp;have &nbsp;accepted &nbsp;each &nbsp;and &nbsp;every &nbsp;articles/services &nbsp;delivered
  &nbsp;rendered &nbsp;by &nbsp;${ul(d.supplier)}
  &nbsp;listed &nbsp;in &nbsp;the &nbsp;attached &nbsp;Invoice &nbsp;No.&nbsp;${ul(d.invoiceNo)}&nbsp;dated
  &nbsp;${ul(d.invoiceDate)}&nbsp;was/were &nbsp;found &nbsp;to &nbsp;be &nbsp;in &nbsp;accordance &nbsp;with &nbsp;the &nbsp;specifications
  &nbsp;stipulated &nbsp;under &nbsp;Order &nbsp;No.&nbsp;/Purchase &nbsp;Order &nbsp;No.&nbsp;${ul(d.poNo)}&nbsp;dated&nbsp;${ul(d.poDate)}.
</div>

<!-- ── Date field ─────────────────────────────────────────────────────── -->
<div style="margin-bottom:20mm;">
  Date: <span style="display:inline-block; min-width:52mm; border-bottom:1px solid #000; font-weight:bold; padding:0 2px; vertical-align:bottom;">${d.acceptanceDate ?? "&nbsp;"}</span>
</div>

<!-- ── Signature block (right-aligned) ───────────────────────────────── -->
<div style="float:right; width:54%; text-align:center;">
  <div style="height:18mm;"></div>
  <div style="border-top:1px solid #000; padding-top:2px; font-weight:bold; min-height:16px;">
    ${d.signatoryName ?? ""}
  </div>
  <div style="font-size:10pt; color:#333; margin-bottom:8px;">(Printed Name &amp; Signature)</div>
  <div style="border-top:1px solid #000; padding-top:2px; font-weight:bold; min-height:16px; margin-top:6px;">
    ${d.signatoryTitle ?? ""}
  </div>
  <div style="font-size:10pt; color:#333;">(Official Title)</div>
  <div style="font-size:10pt; color:#333;">(Head of Agency/Authorized Representative)</div>
</div>

<!-- ── Footer ─────────────────────────────────────────────────────────── -->
<div style="clear:both; padding-top:26mm; text-align:right; font-size:10pt; font-weight:bold;">
  DAR CS1-QF-STO-016 REV 00
</div>

</body>
</html>`;
}

interface LOAPreviewPanelProps {
  html?: string;
  data?: Parameters<typeof buildLOAHtml>[0];
}

export default function LOAPreviewPanel({ html, data }: LOAPreviewPanelProps) {
  const finalHtml = React.useMemo(() => {
    if (html) return html;
    if (!data)
      return "<html><body style='text-align:center;padding:40px;'>Loading...</body></html>";
    return buildLOAHtml(data);
  }, [html, data]);

  const templateHtml = React.useMemo(() => buildLOAHtml({}), []);

  return <IARPreviewPanel html={finalHtml} templateHtml={templateHtml} />;
}
