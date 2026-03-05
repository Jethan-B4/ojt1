import type { PRItem, PRRecord } from "./types";

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function emptyItem(): PRItem {
  return { id: uid(), stockNo: "", unit: "", description: "", quantity: "", unitCost: "" };
}

export function emptyRecord(): PRRecord {
  return {
    id: uid(),
    savedAt: new Date().toISOString(),
    entityName: "",
    fundCluster: "",
    office: "",
    prNumber: "",
    date: new Date().toISOString().slice(0, 10),
    respCode: "",
    purpose: "",
    items: [emptyItem()],
    reqName: "",
    reqDesig: "",
    appName: "",
    appDesig: "",
    status: "Pending",
  };
}

export function getItemTotal(item: PRItem) {
  return (parseFloat(item.quantity) || 0) * (parseFloat(item.unitCost) || 0);
}

export function getGrandTotal(items: PRItem[]) {
  return items.reduce((s, i) => s + getItemTotal(i), 0);
}

export function buildPRHtml(pr: PRRecord): string {
  const itemRows = [...pr.items];
  while (itemRows.length < 30) itemRows.push(emptyItem());
  const td = `border:1px solid black;font-size:8pt;padding:1px 3px;font-family:'Times New Roman',Times,serif;color:#000;`;

  const rows = itemRows
    .map((it) => {
      const tot = getItemTotal(it);
      return `<tr style="height:16px">
      <td style="${td}text-align:center">${it.stockNo}</td>
      <td style="${td}text-align:center">${it.unit}</td>
      <td style="${td}text-align:left;padding:1px 4px">${it.description}</td>
      <td style="${td}text-align:center">${it.quantity}</td>
      <td style="${td}text-align:right">${it.unitCost ? parseFloat(it.unitCost).toFixed(2) : ""}</td>
      <td style="${td}text-align:right">${tot > 0 ? tot.toFixed(2) : ""}</td>
    </tr>`;
    })
    .join("");

  return `
  <div style="font-family:'Times New Roman',Times,serif;font-size:9pt;color:#000">
    <table style="width:100%;border-collapse:collapse;color:#000;table-layout:fixed">
      <colgroup>
        <col style="width:12%"/>
        <col style="width:8%"/>
        <col style="width:40%"/>
        <col style="width:10%"/>
        <col style="width:15%"/>
        <col style="width:15%"/>
      </colgroup>
      <tbody>
        <tr style="height:27px"><td colspan="6" style="text-align:right;font-size:10pt;padding-right:4px;font-family:'Times New Roman',serif;color:#000">Appendix 60</td></tr>
        <tr style="height:34px"><td colspan="6" style="text-align:center;font-weight:bold;font-size:12pt;font-family:'Times New Roman',serif;color:#000">PURCHASE REQUEST</td></tr>
        <tr style="height:21px">
          <td colspan="2" style="border-bottom:1px solid black;font-size:8pt;padding:2px 4px;font-family:'Times New Roman',serif;font-weight:bold;color:#000">
            Entity Name: <span style="font-weight:normal">${pr.entityName}</span></td>
          <td style="border-bottom:1px solid black"></td>
          <td colspan="3" style="border-bottom:1px solid black;font-size:8pt;padding:2px 4px;font-family:'Times New Roman',serif;font-weight:bold;color:#000">
            Fund Cluster: <span style="font-weight:normal">${pr.fundCluster}</span></td>
        </tr>
        <tr style="height:14px">
          <td rowspan="2" colspan="2" style="border:1px solid black;font-size:8pt;vertical-align:top;padding:2px 4px;font-family:'Times New Roman',serif;color:#000">
            Office/Section :<br/>${pr.office}</td>
          <td colspan="2" style="border-top:1px solid black;border-left:1px solid black;border-right:1px solid black;font-size:8pt;font-weight:bold;padding:2px 4px;font-family:'Times New Roman',serif;color:#000">
            PR No.: <span style="font-weight:normal">${pr.prNumber}</span></td>
          <td rowspan="2" colspan="2" style="border:1px solid black;font-size:8pt;font-weight:bold;vertical-align:top;padding:2px 4px;font-family:'Times New Roman',serif;color:#000">
            Date:<br/><span style="font-weight:normal">${pr.date}</span></td>
        </tr>
        <tr style="height:15px">
          <td colspan="2" style="border-bottom:1px solid black;border-left:1px solid black;font-size:8pt;font-weight:bold;padding:2px 4px;font-family:'Times New Roman',serif;color:#000">
            Responsibility Center Code : <span style="font-weight:normal">${pr.respCode}</span></td>
        </tr>
        <tr style="height:22.5px">
          <th style="${td}text-align:center">Stock/<br/>Property No.</th>
          <th style="${td}text-align:center">Unit</th>
          <th style="${td}text-align:center">Item Description</th>
          <th style="${td}text-align:center">Quantity</th>
          <th style="${td}text-align:center">Unit Cost</th>
          <th style="${td}text-align:center">Total Cost</th>
        </tr>
        ${rows}
        <tr style="height:17px">
          <td colspan="6" style="border-top:1px solid black;border-left:1px solid black;border-right:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif;color:#000">
            <b>Purpose:</b> ${pr.purpose}</td>
        </tr>
        <tr style="height:30px">
          <td colspan="6" style="border-bottom:1px solid black;border-left:1px solid black;border-right:1px solid black"></td>
        </tr>
        <tr style="height:12px">
          <td style="border-top:1px solid black;border-left:1px solid black;font-family:'Times New Roman',serif;color:#000"></td>
          <td colspan="2" style="border-top:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif;color:#000"><i>Requested by:</i></td>
          <td colspan="2" style="border-top:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif;color:#000"><i>Approved by:</i></td>
          <td style="border-top:1px solid black;border-right:1px solid black"></td>
        </tr>
        <tr style="height:12px">
          <td colspan="2" style="border-left:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif;color:#000">Signature :</td>
          <td></td><td></td><td></td>
          <td style="border-right:1px solid black"></td>
        </tr>
        <tr style="height:12px">
          <td colspan="2" style="border-left:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif;color:#000">Printed Name :</td>
          <td style="font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif;color:#000">${pr.reqName}</td>
          <td colspan="2" style="font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif;color:#000">${pr.appName}</td>
          <td style="border-right:1px solid black"></td>
        </tr>
        <tr style="height:14.75px">
          <td colspan="2" style="border-bottom:1px solid black;border-left:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif;color:#000">Designation :</td>
          <td style="border-bottom:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif;color:#000">${pr.reqDesig}</td>
          <td colspan="2" style="border-bottom:1px solid black;font-size:8.5pt;padding:2px 4px;font-family:'Times New Roman',serif;color:#000">${pr.appDesig}</td>
          <td style="border-bottom:1px solid black;border-right:1px solid black"></td>
        </tr>
      </tbody>
    </table>
  </div>`;
}

export function downloadPDF(pr: PRRecord) {
  const html = buildPRHtml(pr);
  const full = `<!DOCTYPE html><html><head>
    <meta charset="UTF-8"/>
    <title>PR_${pr.prNumber}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:'Times New Roman',Times,serif;font-size:9pt;color:#000;}
      table{width:100%;border-collapse:collapse;}
      @page{size:A4;margin:1.5cm;}
      @media print{body{-webkit-print-color-adjust:exact;color-adjust:exact;}}
    </style>
  </head><body>${html}<script>
    window.onload=function(){setTimeout(function(){window.print();},300);};
  <\/script></body></html>`;

  const blob = new Blob([full], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) {
    const a = document.createElement("a");
    a.href = url; a.download = `PR_${pr.prNumber || "export"}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function downloadXLSX(pr: PRRecord) {
  const XLSX = (window as any).XLSX;
  if (!XLSX) { alert("XLSX library not loaded."); return; }
  const tnr = "Times New Roman";
  const thin = () => ({ style: "thin", color: { rgb: "000000" } });
  const noB = () => ({ style: null });
  const bdr = (t?: any, b?: any, l?: any, r?: any) => ({ top: t || noB(), bottom: b || noB(), left: l || noB(), right: r || noB() });
  const allT = () => bdr(thin(), thin(), thin(), thin());
  const ws: any = {};

  function sc(r: number, c: number, v: any, bold = false, sz = 10, ha: "left" | "center" | "right" = "left", va: "top" | "center" | "bottom" = "bottom", bd: any = {}, wrap = false) {
    const addr = XLSX.utils.encode_cell({ r, c });
    ws[addr] = {
      v: v ?? "", t: typeof v === "number" ? "n" : "s",
      s: { font: { name: tnr, bold, sz }, alignment: { horizontal: ha, vertical: va, wrapText: wrap }, border: bd }
    };
  }

  sc(0, 5, "Appendix 60", false, 10, "center");
  sc(1, 2, "PURCHASE REQUEST", true, 10, "left");
  sc(2, 0, "Entity Name:", true, 8, "left", "bottom", bdr(null, thin()));
  sc(2, 1, pr.entityName, false, 8, "left", "bottom", bdr(null, thin()));
  sc(2, 2, "", false, 8, "left", "bottom", bdr(null, thin()));
  sc(2, 3, "Fund Cluster: " + pr.fundCluster, true, 8, "left", "bottom", bdr(null, thin()));
  sc(2, 4, "", false, 8, "left", "bottom", bdr(null, thin()));
  sc(2, 5, "", false, 8, "left", "bottom", bdr(null, thin()));
  sc(3, 0, "Office/Section :\n" + pr.office, false, 8, "left", "top", bdr(thin(), thin(), thin(), thin()), true);
  sc(3, 2, "PR No.: " + pr.prNumber, true, 8, "left", "bottom", bdr(thin(), null, thin(), thin()));
  sc(3, 4, "Date:\n" + pr.date, true, 8, "left", "top", bdr(thin(), thin(), thin(), thin()), true);
  sc(4, 2, "Responsibility Center Code : " + pr.respCode, true, 8, "left", "bottom", bdr(null, thin(), thin(), null));

  const hdrs = ["Stock/\nProperty No.", "Unit", "Item Description", "Quantity", "Unit Cost", "Total Cost"];
  for (let c = 0; c < 6; c++) sc(5, c, hdrs[c], c !== 0, c === 0 ? 10 : 8, "center", "center", allT(), c === 0);

  const padded = [...pr.items];
  while (padded.length < 30) padded.push(emptyItem());
  padded.forEach((item, i) => {
    const r = 6 + i;
    const q = parseFloat(item.quantity) || null;
    const uc = parseFloat(item.unitCost) || null;
    const tot = q && uc ? q * uc : null;
    sc(r, 0, item.stockNo || "", false, 8, "center", "center", allT());
    sc(r, 1, item.unit || "", false, 8, "center", "center", allT());
    sc(r, 2, item.description || "", false, 8, "left", "center", allT());
    sc(r, 3, q ?? "", false, 8, "center", "center", allT());
    sc(r, 4, uc ?? "", false, 8, "right", "center", allT());
    sc(r, 5, tot ?? "", false, 8, "right", "center", allT());
  });

  sc(36, 0, "Purpose:", false, 8.5, "left", "bottom", bdr(thin(), null, thin(), null));
  sc(36, 1, pr.purpose, false, 8.5, "left", "bottom", bdr(thin(), null, null, null));
  for (let c = 2; c < 5; c++) sc(36, c, "", false, 8, "left", "bottom", bdr(thin(), null, null, null));
  sc(36, 5, "", false, 8, "left", "bottom", bdr(thin(), null, null, thin()));
  sc(37, 0, "", false, 8, "left", "bottom", bdr(null, thin(), thin(), null));
  sc(37, 5, "", false, 8, "left", "bottom", bdr(null, thin(), null, thin()));
  sc(38, 0, "", false, 8.5, "left", "bottom", bdr(thin(), null, thin(), null));
  sc(38, 1, "Requested by:", false, 8.5, "left", "bottom", bdr(thin(), null, null, null));
  sc(38, 2, "", false, 8, "left", "bottom", bdr(thin(), null, null, null));
  sc(38, 3, "Approved by:", false, 8.5, "left", "bottom", bdr(thin(), null, null, null));
  sc(38, 4, "", false, 8, "left", "bottom", bdr(thin(), null, null, null));
  sc(38, 5, "", false, 8, "left", "bottom", bdr(thin(), null, null, thin()));
  sc(39, 0, "Signature :", false, 8.5, "left", "bottom", bdr(null, null, thin(), null));
  sc(39, 5, "", false, 8, "left", "bottom", bdr(null, null, null, thin()));
  sc(40, 0, "Printed Name :", false, 8.5, "left", "bottom", bdr(null, null, thin(), null));
  sc(40, 2, pr.reqName, false, 8.5);
  sc(40, 3, pr.appName, false, 8.5);
  sc(40, 5, "", false, 8, "left", "bottom", bdr(null, null, null, thin()));
  sc(41, 0, "Designation :", false, 8.5, "left", "bottom", bdr(null, thin(), thin(), null));
  sc(41, 1, "", false, 8, "left", "bottom", bdr(null, thin(), null, null));
  sc(41, 2, pr.reqDesig, false, 8.5, "left", "bottom", bdr(null, thin(), null, null));
  sc(41, 3, pr.appDesig, false, 8.5, "left", "bottom", bdr(null, thin(), null, null));
  sc(41, 4, "", false, 8, "left", "bottom", bdr(null, thin(), null, null));
  sc(41, 5, "", false, 8, "left", "bottom", bdr(null, thin(), null, thin()));

  ws["!ref"] = "A1:F42";
  ws["!cols"] = [{ wch: 12.67 }, { wch: 15.11 }, { wch: 45.33 }, { wch: 15.11 }, { wch: 10.44 }, { wch: 16.22 }];
  ws["!rows"] = [27, 34, 21, 14, 15, 22.5, ...Array(30).fill(11), 17, 30, 12, 12, 12, 14.75].map(h => ({ hpt: h }));
  ws["!merges"] = [
    { s: { r: 2, c: 3 }, e: { r: 2, c: 5 } }, { s: { r: 3, c: 0 }, e: { r: 4, c: 1 } },
    { s: { r: 3, c: 2 }, e: { r: 3, c: 3 } }, { s: { r: 3, c: 4 }, e: { r: 4, c: 5 } },
    { s: { r: 4, c: 2 }, e: { r: 4, c: 3 } }, { s: { r: 37, c: 0 }, e: { r: 37, c: 5 } },
    { s: { r: 39, c: 0 }, e: { r: 39, c: 1 } }, { s: { r: 39, c: 3 }, e: { r: 39, c: 4 } },
    { s: { r: 40, c: 0 }, e: { r: 40, c: 1 } }, { s: { r: 40, c: 3 }, e: { r: 40, c: 4 } },
    { s: { r: 41, c: 0 }, e: { r: 41, c: 1 } }, { s: { r: 41, c: 3 }, e: { r: 41, c: 4 } },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Table 1");
  XLSX.writeFile(wb, `PR_${pr.prNumber || "export"}.xlsx`);
}
