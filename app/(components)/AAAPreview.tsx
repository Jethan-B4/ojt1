import React from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";

export interface AAAPreviewData {
  prNo: string;
  date: string;
  office: string;
  suppliers: string[];
  particulars?: string;
  rows: Array<{
    itemNo: number;
    unit: string;
    qty: number;
    desc: string;
    prices: Record<string, number>;
    winner?: string | null;
  }>;
}

function buildCurrency(n: number) {
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function buildAAAPreviewHTML(data: AAAPreviewData) {
  const supplierHeaders = data.suppliers
    .map((s) => `<td class="header-td"><div class="supplier-header">Supplier:</div><div class="supplier-name">${s}</div></td>`)
    .join("");

  const bodyRows = data.rows
    .map((r) => {
      const priceTds = data.suppliers
        .map((s) => {
          const p = r.prices[s] ?? 0;
          const isWin = r.winner && r.winner === s && p > 0;
          return `<td class="td ${isWin ? "winner" : ""}">${
            p ? buildCurrency(p) : ""
          }</td>`;
        })
        .join("");
      return `<tr>
        <td class="td item-no">${r.itemNo}</td>
        <td class="td qty">${r.qty}</td>
        <td class="td unit">${r.unit}</td>
        <td class="td description">${r.desc}</td>
        ${priceTds}
      </tr>`;
    })
    .join("");

  const totals = data.suppliers.map((s) => {
    const t = data.rows.reduce((sum, r) => sum + (r.prices[s] ?? 0) * r.qty, 0);
    return `<td class="td total-cell">${t ? buildCurrency(t) : ""}</td>`;
  }).join("");

  const html = `<!doctype html>
  <html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { 
        font-family: Arial, sans-serif; 
        color: #000; 
        padding: 20px;
        font-size: 11px;
        line-height: 1.2;
      }
      .document { width: 100%; }
      .header-section {
        text-align: center;
        margin-bottom: 15px;
        border-bottom: 2px solid #000;
        padding-bottom: 10px;
      }
      .department { font-size: 10px; font-weight: bold; }
      .doc-title { font-size: 14px; font-weight: bold; margin: 8px 0; }
      .doc-subtitle { font-size: 10px; margin: 4px 0; }
      .info-row { display: flex; justify-content: space-between; margin: 5px 0; font-size: 10px; }
      .info-label { font-weight: bold; }
      
      table { 
        width: 100%; 
        border-collapse: collapse; 
        margin: 15px 0;
        table-layout: fixed;
      }
      
      th, td { 
        border: 1px solid #000; 
        padding: 4px 3px;
        text-align: center;
        vertical-align: middle;
        word-wrap: break-word;
      }
      
      .header-row { background-color: #f0f0f0; }
      .header-td { padding: 3px; }
      .supplier-header { font-weight: bold; font-size: 9px; }
      .supplier-name { font-weight: bold; font-size: 10px; }
      
      .item-no { width: 4%; }
      .qty { width: 5%; }
      .unit { width: 6%; }
      .description { width: 20%; text-align: left; padding-left: 5px; }
      
      td.winner { font-weight: bold; background-color: #fff3cd; }
      .total-cell { font-weight: bold; }
      
      .remarks { margin-top: 15px; font-size: 10px; }
      .remarks-label { font-weight: bold; }
      
      .signature-section { 
        margin-top: 20px; 
        padding-top: 15px; 
        border-top: 1px solid #000;
        display: flex;
        justify-content: space-around;
      }
      
      .signature-line { 
        width: 30%;
        text-align: center;
        font-size: 9px;
      }
      
      .signature-blank { 
        border-top: 1px solid #000; 
        height: 30px; 
        margin: 5px 0;
      }
      
      .signature-name { margin-top: 3px; font-weight: bold; }
      .signature-title { font-size: 8px; margin-top: 2px; }
      
      .approval-section {
        margin-top: 15px;
        padding: 10px;
        border: 1px solid #000;
        font-size: 9px;
      }
      
      .approval-title { font-weight: bold; margin-bottom: 5px; }
    </style>
  </head>
  <body>
    <div class="document">
      <div class="header-section">
        <div class="department">DEPARTMENT OF BUDGET AND MANAGEMENT</div>
        <div class="doc-title">ABSTRACT OF AWARDS</div>
        <div class="doc-subtitle">For Competitive Bidding</div>
      </div>
      
      <div class="info-row">
        <div><span class="info-label">PR No.:</span> ${data.prNo}</div>
        <div><span class="info-label">Office:</span> ${data.office}</div>
        <div><span class="info-label">Date:</span> ${data.date}</div>
      </div>
      
      <table>
        <thead>
          <tr class="header-row">
            <th style="width:4%;">Item</th>
            <th style="width:5%;">Qty</th>
            <th style="width:6%;">Unit</th>
            <th style="width:20%;text-align:left;padding-left:5px;">Particulars/Description</th>
            ${supplierHeaders}
          </tr>
        </thead>
        <tbody>
          ${bodyRows}
          <tr style="font-weight:bold;">
            <td colspan="4" style="text-align:right;padding-right:5px;">TOTAL</td>
            ${totals}
          </tr>
        </tbody>
      </table>
      
      <div class="remarks">
        <span class="remarks-label">Remarks/Particulars:</span> ${data.particulars || "Items marked with selection criteria met."}
      </div>
      
      <div class="signature-section">
        <div class="signature-line">
          <div class="signature-blank"></div>
          <div class="signature-name">Chair, BAC</div>
          <div class="signature-title">Procurement Office</div>
        </div>
        <div class="signature-line">
          <div class="signature-blank"></div>
          <div class="signature-name">Vice-Chair, BAC</div>
          <div class="signature-title">Finance Unit</div>
        </div>
        <div class="signature-line">
          <div class="signature-blank"></div>
          <div class="signature-name">Secretary, BAC</div>
          <div class="signature-title">Admin Department</div>
        </div>
      </div>
      
      <div class="approval-section">
        <div class="approval-title">APPROVED BY:</div>
        <div style="margin-top:8px;">
          <div class="signature-blank" style="width:40%;margin-left:0;"></div>
          <div style="font-weight:bold;margin-top:3px;">Department Head</div>
        </div>
      </div>
    </div>
  </body>
  </html>`;
  return html;
}

export default function AAAPreview({ html }: { html: string }) {
  return (
    <View style={{ flex: 1 }}>
      <WebView 
        originWhitelist={["*"]} 
        source={{ html }} 
        style={{ flex: 1 }} 
      />
    </View>
  );
}

