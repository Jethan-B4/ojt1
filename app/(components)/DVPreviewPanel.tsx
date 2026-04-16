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
  approvedBy?: string;
}) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: "Times New Roman", serif; font-size: 10.5pt; margin: 0; line-height: 1.2; color: #111; }
    .appendix { text-align: right; font-size: 9pt; margin-bottom: 1mm; }
    .title { text-align: center; font-size: 14pt; font-weight: 700; margin: 0 0 2mm; letter-spacing: 0.3px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    td, th { border: 1px solid #111; padding: 3px 5px; vertical-align: top; }
    .top td { height: 8mm; }
    .label { font-size: 9pt; color: #222; display: block; }
    .value { font-weight: 700; }
    .mt { margin-top: 1.6mm; }
    .particulars th { text-align: center; font-size: 9pt; }
    .particulars .row td { height: 20mm; }
    .acct th { text-align: center; font-size: 9pt; }
    .acct td { height: 6mm; }
    .cert td { height: 42mm; }
    .sig { margin-top: 8mm; border-top: 1px solid #111; text-align: center; padding-top: 1.5mm; font-weight: 700; }
    .small { font-size: 9pt; }
    .pay td { height: 8mm; }
  </style>
</head>
<body>
  <div class="appendix">Appendix 32</div>
  <div class="title">DISBURSEMENT VOUCHER</div>
  <table class="top">
    <tr>
      <td><span class="label">Entity Name</span><span class="value">${d.entityName ?? ""}</span></td>
      <td><span class="label">Fund Cluster</span><span class="value">${d.fundCluster ?? ""}</span></td>
    </tr>
    <tr>
      <td><span class="label">Date</span><span class="value">${d.date ?? ""}</span></td>
      <td><span class="label">DV No.</span><span class="value">${d.dvNo ?? ""}</span></td>
    </tr>
    <tr>
      <td><span class="label">Payee</span><span class="value">${d.payee ?? ""}</span></td>
      <td><span class="label">TIN/Employee No.</span><span class="value">${d.tin ?? ""}</span></td>
    </tr>
    <tr>
      <td><span class="label">Address</span><span class="value">${d.address ?? ""}</span></td>
      <td><span class="label">ORS/BURS No.</span><span class="value">${d.orsNo ?? ""}</span></td>
    </tr>
    <tr>
      <td><span class="label">Mode of Payment</span><span class="value">${d.modeOfPayment ?? ""}</span></td>
      <td><span class="label">Amount Due</span><span class="value">${d.amountDue ?? ""}</span></td>
    </tr>
  </table>
  <table class="particulars mt">
    <tr>
      <th style="width:42%">Particulars</th>
      <th style="width:20%">Responsibility Center</th>
      <th style="width:18%">MFO/PAP</th>
      <th style="width:20%">Amount</th>
    </tr>
    <tr class="row">
      <td>${d.particulars ?? ""}</td>
      <td>${d.responsibilityCenter ?? ""}</td>
      <td>${d.mfoPap ?? ""}</td>
      <td style="text-align:right">${d.amountDue ?? ""}</td>
    </tr>
  </table>
  <table class="acct mt">
    <tr>
      <th style="width:34%">Account Title</th>
      <th style="width:22%">UACS Code</th>
      <th style="width:22%">Debit</th>
      <th style="width:22%">Credit</th>
    </tr>
    <tr><td></td><td></td><td></td><td></td></tr>
    <tr><td></td><td></td><td></td><td></td></tr>
  </table>
  <table class="cert mt">
    <tr>
      <td style="width:50%">
        <b>C. Certified:</b> Expenses/Cash Advance necessary, lawful and incurred under my direct supervision.
        <div class="sig">${d.certifiedBy ?? ""}</div>
        <div class="small" style="text-align:center">Head, Accounting Unit/Authorized Representative</div>
      </td>
      <td style="width:50%">
        <b>D. Approved for Payment</b>
        <div class="sig">${d.approvedBy ?? ""}</div>
        <div class="small" style="text-align:center">Agency Head/Authorized Representative</div>
      </td>
    </tr>
  </table>
  <table class="pay mt">
    <tr>
      <td style="width:50%">Check/ADA No. : </td>
      <td style="width:50%">Date : Bank Name &amp; Account Number:</td>
    </tr>
    <tr>
      <td>Signature : Date :</td>
      <td>Official Receipt No. &amp; Date/Other Documents</td>
    </tr>
  </table>
</body>
</html>`;
}

export default function DVPreviewPanel({ html }: { html: string }) {
  return <IARPreviewPanel html={html} />;
}

