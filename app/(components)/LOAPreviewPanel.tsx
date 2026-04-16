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
}) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4 portrait; margin: 22mm 20mm 20mm; }
    body { font-family: "Times New Roman", serif; font-size: 12pt; line-height: 1.4; margin: 0; color: #111; }
    .head { text-align: center; line-height: 1.35; margin-top: 4mm; }
    .head .rp { font-size: 11pt; }
    .head .agency { font-size: 14pt; font-weight: 700; letter-spacing: 0.2px; }
    .head .office { font-size: 11pt; }
    .title { text-align: center; margin: 18mm 0 12mm; font-size: 17pt; font-weight: 700; letter-spacing: 0.6px; }
    .para { text-align: justify; text-indent: 14mm; }
    .line { border-bottom: 1px solid #111; display: inline-block; min-width: 42mm; padding: 0 1mm; font-weight: 700; text-indent: 0; }
    .date-row { margin-top: 16mm; }
    .sig-wrap { margin-top: 24mm; text-align: center; }
    .sig-line { width: 78mm; margin: 0 auto; border-top: 1px solid #111; }
    .sig-name { margin-top: 2mm; font-weight: 700; min-height: 6mm; }
    .muted { font-size: 10pt; }
    .footer-code { margin-top: 28mm; font-size: 9pt; }
  </style>
</head>
<body>
  <div class="head">
    <div class="rp">Republic of the Philippines</div>
    <div class="agency">DEPARTMENT OF AGRARIAN REFORM</div>
    <div class="office">Camarines Sur Provincial Office</div>
    <div class="office">2/FHL BLDG., CARNATION ST., BRGY. TRIANGULO, NAGA CITY</div>
  </div>
  <div class="title">LETTER OF ACCEPTANCE</div>
  <div class="para">
    I/WE hereby certify to have accepted each and every articles/services delivered rendered by
    <span class="line">${d.supplier ?? ""}</span> listed in the attached Invoice No.
    <span class="line">${d.invoiceNo ?? ""}</span> dated
    <span class="line">${d.invoiceDate ?? ""}</span> was/were found to be in accordance with
    the specifications stipulated under Order No. /Purchase Order No.
    <span class="line">${d.poNo ?? ""}</span> dated <span class="line">${d.poDate ?? ""}</span>.
  </div>
  <div class="date-row">Date: <span class="line">${d.acceptanceDate ?? ""}</span></div>
  <div class="sig-wrap">
    <div class="sig-line"></div>
    <div class="sig-name">${d.signatoryName ?? ""}</div>
    <div class="muted">(Printed Name &amp; Signature)</div>
    <div class="sig-name">${d.signatoryTitle ?? ""}</div>
    <div class="muted">(Head of Agency/Authorized Representative)</div>
  </div>
  <div class="footer-code">DAR CS1-QF-STO-016 REV 00</div>
</body>
</html>`;
}

export default function LOAPreviewPanel({ html }: { html: string }) {
  return <IARPreviewPanel html={html} />;
}

