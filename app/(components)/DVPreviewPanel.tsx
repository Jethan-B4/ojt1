import { getDARSquare2LogoHTML } from "@/lib/documentAssets";
import React from "react";
import IARPreviewPanel from "./IARPreviewPanel";

export function buildDVHtml(d: {
  entityName?: string;
  fundCluster?: string;
  date?: string;
  dvNo?: string;
  payee?: string;
  tin?: string;
  orsNo?: string;
  address?: string;
  particulars?: string;
  responsibilityCenter?: string;
  mfoPap?: string;
  amountDue?: string;
  modeOfPayment?: string;
  certifiedBy?: string;
  certifiedByTitle?: string;
  approvedBy?: string;
  approvedByTitle?: string;
  provincialOffice?: string;
  checkAdaNo?: string;
  bankName?: string;
  jevNo?: string;
  receiptNo?: string;
}) {
  const mop = (d.modeOfPayment ?? "").toLowerCase();
  const chk = (v: string) => (mop.includes(v) ? "&#10003;" : "&nbsp;");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Disbursement Voucher</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Times New Roman", Times, serif;
    font-size: 8.5pt;
    color: #000;
    background: #fff;
    padding: 6mm 9mm;
  }
  table { width: 100%; border-collapse: collapse; }
  td, th {
    border: 1px solid #000;
    padding: 2px 4px;
    vertical-align: top;
    font-family: "Times New Roman", Times, serif;
    font-size: 8.5pt;
  }
  .nb  { border: none !important; }
  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: bold; }
  .xs { font-size: 7.5pt; }
  .sm { font-size: 8pt; }
  .lbl { font-size: 7.5pt; display: block; color: #333; }
  .val { font-weight: bold; display: block; min-height: 11px; }
  .chk {
    display: inline-block;
    width: 9px; height: 9px;
    border: 1px solid #000;
    text-align: center;
    font-size: 7pt;
    vertical-align: middle;
    line-height: 9px;
    margin-right: 2px;
  }
  .sig-line {
    border-top: 1px solid #000;
    margin-top: 2px;
    padding-top: 1px;
    text-align: center;
    font-weight: bold;
    font-size: 8pt;
  }
</style>
</head>
<body>

<!-- ── Appendix ──────────────────────────────────────────────────────── -->
<div style="text-align:right; font-size:8pt; font-style:italic; margin-bottom:1px;">Appendix 32</div>

<!-- ── Header: logo | Entity + Title | Fund/Date/DV ─────────────────── -->
<table style="margin-bottom:0;">
  <colgroup>
    <col style="width:13%"/>
    <col style="width:55%"/>
    <col style="width:32%"/>
  </colgroup>
  <tbody>
    <tr>
      <td rowspan="2" style="text-align:center; vertical-align:middle; padding:4px;">
        ${getDARSquare2LogoHTML(46)}
      </td>
      <td style="text-align:center; vertical-align:middle; border-bottom:none; padding:3px 6px;">
        <span class="bold" style="font-size:9pt;">${d.entityName ?? "Entity Name"}</span>
      </td>
      <td style="vertical-align:top; padding:3px 5px;">
        <span class="lbl">Fund Cluster :</span>
        <span class="val">${d.fundCluster ?? ""}</span>
      </td>
    </tr>
    <tr>
      <td style="text-align:center; vertical-align:middle; padding:3px 6px;">
        <div class="bold" style="font-size:12pt; letter-spacing:0.3px;">DISBURSEMENT VOUCHER</div>
      </td>
      <td style="vertical-align:top; padding:3px 5px;">
        <span class="lbl">Date :</span>
        <span class="val">${d.date ?? ""}</span>
        <span class="lbl" style="margin-top:1px;">DV No. :</span>
        <span class="val">${d.dvNo ?? ""}</span>
      </td>
    </tr>
  </tbody>
</table>

<!-- ── Mode of Payment ──────────────────────────────────────────────── -->
<table>
  <tr>
    <td style="width:13%;" class="bold xs">Mode of<br/>Payment</td>
    <td style="width:87%;">
      <span class="chk">${chk("mds")}</span> MDS Check &nbsp;
      <span class="chk">${chk("commercial")}</span> Commercial Check &nbsp;
      <span class="chk">${chk("ada")}</span> ADA &nbsp;
      <span class="chk">${chk("others")}</span> Others (Please specify) ___________
    </td>
  </tr>
</table>

<!-- ── Payee / TIN / ORS / Address ──────────────────────────────────── -->
<table>
  <colgroup>
    <col style="width:8%"/><col style="width:34%"/>
    <col style="width:15%"/><col style="width:21%"/>
    <col style="width:11%"/><col style="width:11%"/>
  </colgroup>
  <tr>
    <td class="bold xs">Payee</td>
    <td>${d.payee ?? ""}</td>
    <td class="xs">TIN/Employee No.:</td>
    <td>${d.tin ?? ""}</td>
    <td class="xs right">ORS/BURS No.:</td>
    <td>${d.orsNo ?? ""}</td>
  </tr>
  <tr>
    <td class="bold xs">Address</td>
    <td colspan="5">${d.address ?? ""}</td>
  </tr>
</table>

<!-- ── Particulars ───────────────────────────────────────────────────── -->
<table>
  <colgroup>
    <col style="width:42%"/>
    <col style="width:22%"/>
    <col style="width:14%"/>
    <col style="width:22%"/>
  </colgroup>
  <thead>
    <tr>
      <th class="center xs">Particulars</th>
      <th class="center xs">Responsibility Center</th>
      <th class="center xs">MFO/PAP</th>
      <th class="center xs">Amount</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="height:22mm;">${d.particulars ?? ""}</td>
      <td>${d.responsibilityCenter ?? ""}</td>
      <td>${d.mfoPap ?? ""}</td>
      <td class="right">${d.amountDue ?? ""}</td>
    </tr>
    <tr>
      <td colspan="3" class="right bold xs">Amount Due</td>
      <td class="right bold">${d.amountDue ?? ""}</td>
    </tr>
  </tbody>
</table>

<!-- ── A. Certified ──────────────────────────────────────────────────── -->
<table>
  <tr>
    <td style="height:12mm;">
      <span class="bold xs">A.</span>
      <span class="xs"> Certified: Expenses/Cash Advance necessary, lawful and incurred under my direct supervision.</span>
    </td>
  </tr>
</table>

<!-- ── B. Accounting Entry ───────────────────────────────────────────── -->
<table>
  <colgroup>
    <col style="width:34%"/>
    <col style="width:22%"/>
    <col style="width:22%"/>
    <col style="width:22%"/>
  </colgroup>
  <thead>
    <tr>
      <th colspan="4" class="xs" style="text-align:left;"><span class="bold">B.</span> Accounting Entry:</th>
    </tr>
    <tr>
      <th class="center xs">Account Title</th>
      <th class="center xs">UACS Code</th>
      <th class="center xs">Debit</th>
      <th class="center xs">Credit</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="height:6mm;"></td><td></td><td></td><td></td></tr>
    <tr><td style="height:6mm;"></td><td></td><td></td><td></td></tr>
    <tr><td style="height:6mm;"></td><td></td><td></td><td></td></tr>
  </tbody>
</table>

<!-- ── C. Certified | D. Approved ───────────────────────────────────── -->
<table>
  <colgroup><col style="width:50%"/><col style="width:50%"/></colgroup>
  <tr>
    <td style="vertical-align:top; padding:3px 6px;">
      <div class="bold xs">C. Certified:</div>
      <div class="xs" style="margin:2px 0; line-height:1.6;">
        <span class="chk">&nbsp;</span> Cash available<br/>
        <span class="chk">&nbsp;</span> Subject to Authority to Debit Account (when applicable)<br/>
        <span class="chk">&nbsp;</span> Supporting documents complete and amount claimed proper
      </div>
    </td>
    <td style="vertical-align:top; padding:3px 6px;">
      <div class="bold xs">D. Approved for Payment</div>
    </td>
  </tr>
  <tr>
    <td style="padding:3px 6px; vertical-align:bottom;">
      <div class="xs">Signature</div>
      <div style="height:10mm;"></div>
      <div class="xs">Printed Name</div>
      <div class="sig-line">${d.certifiedBy ?? ""}</div>
      <div class="xs">Position &nbsp; ${d.certifiedByTitle ?? ""}</div>
      <div class="xs" style="margin-top:2px;">Head, Accounting Unit/Authorized Representative</div>
      <div class="xs" style="margin-top:3px;">Date</div>
    </td>
    <td style="padding:3px 6px; vertical-align:bottom;">
      <div class="xs">Signature</div>
      <div style="height:10mm;"></div>
      <div class="xs">Printed Name</div>
      <div class="sig-line">${d.approvedBy ?? ""}</div>
      <div class="xs">Position &nbsp; ${d.approvedByTitle ?? ""}</div>
      <div class="xs" style="margin-top:2px;">Agency Head/Authorized Representative</div>
      <div class="xs" style="margin-top:3px;">Date</div>
    </td>
  </tr>
</table>

<!-- ── E. Receipt of Payment ─────────────────────────────────────────── -->
<table>
  <colgroup>
    <col style="width:13%"/>
    <col style="width:22%"/>
    <col style="width:7%"/>
    <col style="width:36%"/>
    <col style="width:11%"/>
    <col style="width:11%"/>
  </colgroup>
  <tr>
    <td colspan="6" class="bold xs" style="background:#f0f0f0; padding:2px 5px;">E. Receipt of Payment</td>
  </tr>
  <tr>
    <td class="xs">Check/<br/>ADA No. :</td>
    <td>${d.checkAdaNo ?? ""}</td>
    <td class="xs">Date :</td>
    <td class="xs">Bank Name &amp; Account Number: ${d.bankName ?? ""}</td>
    <td class="xs" colspan="2">JEV No. ${d.jevNo ?? ""}</td>
  </tr>
  <tr>
    <td class="xs">Signature :</td>
    <td></td>
    <td class="xs">Date :</td>
    <td class="xs">Printed Name:</td>
    <td class="xs" colspan="2">Date</td>
  </tr>
  <tr>
    <td colspan="6" class="xs">Official Receipt No. &amp; Date/Other Documents: ${d.receiptNo ?? ""}</td>
  </tr>
</table>

</body>
</html>`;
}

interface DVPreviewPanelProps {
  html?: string;
  data?: Parameters<typeof buildDVHtml>[0];
}

export default function DVPreviewPanel({ html, data }: DVPreviewPanelProps) {
  const finalHtml = React.useMemo(() => {
    if (html) return html;
    if (!data)
      return "<html><body style='text-align:center;padding:40px;'>Loading...</body></html>";
    return buildDVHtml(data);
  }, [html, data]);

  const templateHtml = React.useMemo(() => buildDVHtml({}), []);

  return <IARPreviewPanel html={finalHtml} templateHtml={templateHtml} />;
}
