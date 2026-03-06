import type { PRRecord } from "@/types/types";
import { emptyItem, getItemTotal } from "@/types/utils";
import type { CSSProperties, ReactElement } from "react";

const tdStyle: CSSProperties = {
  border: "1px solid black",
  fontSize: "8pt",
  padding: "1px 3px",
  fontFamily: "'Times New Roman', Times, serif",
  color: "#000",
  overflow: "hidden",
  wordWrap: "break-word",
  whiteSpace: "normal",
};

const thStyle: CSSProperties = {
  ...tdStyle,
  textAlign: "center",
  fontWeight: "bold",
};

export default function PRPreview({ pr }: { pr: PRRecord }): ReactElement {
  const itemRows = [...pr.items];
  while (itemRows.length < 30) itemRows.push(emptyItem());

  return (
    <div style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: "9pt", color: "#000" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", color: "#000", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "12%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "40%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "15%" }} />
          <col style={{ width: "15%" }} />
        </colgroup>
        <tbody>
          <tr style={{ height: "27px" }}>
            <td colSpan={6} style={{ textAlign: "right", fontSize: "10pt", paddingRight: "4px", fontFamily: "'Times New Roman', serif", color: "#000" }}>
              Appendix 60
            </td>
          </tr>
          <tr style={{ height: "34px" }}>
            <td colSpan={6} style={{ textAlign: "center", fontWeight: "bold", fontSize: "12pt", fontFamily: "'Times New Roman', serif", color: "#000" }}>
              PURCHASE REQUEST
            </td>
          </tr>
          <tr style={{ height: "21px" }}>
            <td colSpan={2} style={{ borderBottom: "1px solid black", fontSize: "8pt", padding: "2px 4px", fontFamily: "'Times New Roman', serif", fontWeight: "bold", color: "#000", overflow: "hidden", wordWrap: "break-word", whiteSpace: "normal" }}>
              Entity Name: <span style={{ fontWeight: "normal" }}>{pr.entityName}</span>
            </td>
            <td style={{ borderBottom: "1px solid black" }}></td>
            <td colSpan={3} style={{ borderBottom: "1px solid black", fontSize: "8pt", padding: "2px 4px", fontFamily: "'Times New Roman', serif", fontWeight: "bold", color: "#000", overflow: "hidden", wordWrap: "break-word", whiteSpace: "normal" }}>
              Fund Cluster: <span style={{ fontWeight: "normal" }}>{pr.fundCluster}</span>
            </td>
          </tr>
          <tr style={{ height: "14px" }}>
            <td rowSpan={2} colSpan={2} style={{ border: "1px solid black", fontSize: "8pt", verticalAlign: "top", padding: "2px 4px", fontFamily: "'Times New Roman', serif", color: "#000", overflow: "hidden", wordWrap: "break-word", whiteSpace: "normal" }}>
              Office/Section :<br />{pr.office}
            </td>
            <td colSpan={2} style={{ borderTop: "1px solid black", borderLeft: "1px solid black", borderRight: "1px solid black", fontSize: "8pt", fontWeight: "bold", padding: "2px 4px", fontFamily: "'Times New Roman', serif", color: "#000", overflow: "hidden", wordWrap: "break-word", whiteSpace: "normal" }}>
              PR No.: <span style={{ fontWeight: "normal" }}>{pr.prNumber}</span>
            </td>
            <td rowSpan={2} colSpan={2} style={{ border: "1px solid black", fontSize: "8pt", fontWeight: "bold", verticalAlign: "top", padding: "2px 4px", fontFamily: "'Times New Roman', serif", color: "#000", overflow: "hidden", wordWrap: "break-word", whiteSpace: "normal" }}>
              Date:<br /><span style={{ fontWeight: "normal" }}>{pr.date}</span>
            </td>
          </tr>
          <tr style={{ height: "15px" }}>
            <td colSpan={2} style={{ borderBottom: "1px solid black", borderLeft: "1px solid black", fontSize: "8pt", fontWeight: "bold", padding: "2px 4px", fontFamily: "'Times New Roman', serif", color: "#000", overflow: "hidden", wordWrap: "break-word", whiteSpace: "normal" }}>
              Responsibility Center Code : <span style={{ fontWeight: "normal" }}>{pr.respCode}</span>
            </td>
          </tr>
          <tr style={{ height: "22.5px" }}>
            <th style={thStyle}>Stock/<br />Property No.</th>
            <th style={thStyle}>Unit</th>
            <th style={thStyle}>Item Description</th>
            <th style={thStyle}>Quantity</th>
            <th style={thStyle}>Unit Cost</th>
            <th style={thStyle}>Total Cost</th>
          </tr>
          {itemRows.map((item, idx) => {
            const total = getItemTotal(item);
            return (
              <tr key={idx} style={{ height: "16px" }}>
                <td style={{ ...tdStyle, textAlign: "center" }}>{item.stockNo}</td>
                <td style={{ ...tdStyle, textAlign: "center" }}>{item.unit}</td>
                <td style={{ ...tdStyle, textAlign: "left", padding: "1px 4px" }}>{item.description}</td>
                <td style={{ ...tdStyle, textAlign: "center" }}>{item.quantity}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{item.unitCost ? parseFloat(item.unitCost).toFixed(2) : ""}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{total > 0 ? total.toFixed(2) : ""}</td>
              </tr>
            );
          })}
          <tr style={{ height: "17px" }}>
            <td colSpan={6} style={{ borderTop: "1px solid black", borderLeft: "1px solid black", borderRight: "1px solid black", fontSize: "8.5pt", padding: "2px 4px", fontFamily: "'Times New Roman', serif", color: "#000", overflow: "hidden", wordWrap: "break-word", whiteSpace: "normal" }}>
              <b>Purpose:</b> {pr.purpose}
            </td>
          </tr>
          <tr style={{ height: "30px" }}>
            <td colSpan={6} style={{ borderBottom: "1px solid black", borderLeft: "1px solid black", borderRight: "1px solid black" }}></td>
          </tr>
          <tr style={{ height: "12px" }}>
            <td style={{ borderTop: "1px solid black", borderLeft: "1px solid black", fontFamily: "'Times New Roman', serif", color: "#000" }}></td>
            <td colSpan={2} style={{ borderTop: "1px solid black", fontSize: "8.5pt", padding: "2px 4px", fontFamily: "'Times New Roman', serif", color: "#000" }}>
              <i>Requested by:</i>
            </td>
            <td colSpan={2} style={{ borderTop: "1px solid black", fontSize: "8.5pt", padding: "2px 4px", fontFamily: "'Times New Roman', serif", color: "#000" }}>
              <i>Approved by:</i>
            </td>
            <td style={{ borderTop: "1px solid black", borderRight: "1px solid black" }}></td>
          </tr>
          <tr style={{ height: "12px" }}>
            <td colSpan={2} style={{ borderLeft: "1px solid black", fontSize: "8.5pt", padding: "2px 4px", fontFamily: "'Times New Roman', serif", color: "#000" }}>
              Signature :
            </td>
            <td></td><td></td><td></td>
            <td style={{ borderRight: "1px solid black" }}></td>
          </tr>
          <tr style={{ height: "12px" }}>
            <td colSpan={2} style={{ borderLeft: "1px solid black", fontSize: "8.5pt", padding: "2px 4px", fontFamily: "'Times New Roman', serif", color: "#000" }}>
              Printed Name :
            </td>
            <td style={{ fontSize: "8.5pt", padding: "2px 4px", fontFamily: "'Times New Roman', serif", color: "#000" }}>{pr.reqName}</td>
            <td colSpan={2} style={{ fontSize: "8.5pt", padding: "2px 4px", fontFamily: "'Times New Roman', serif", color: "#000" }}>{pr.appName}</td>
            <td style={{ borderRight: "1px solid black" }}></td>
          </tr>
          <tr style={{ height: "14.75px" }}>
            <td colSpan={2} style={{ borderBottom: "1px solid black", borderLeft: "1px solid black", fontSize: "8.5pt", padding: "2px 4px", fontFamily: "'Times New Roman', serif", color: "#000" }}>
              Designation :
            </td>
            <td style={{ borderBottom: "1px solid black", fontSize: "8.5pt", padding: "2px 4px", fontFamily: "'Times New Roman', serif", color: "#000" }}>{pr.reqDesig}</td>
            <td colSpan={2} style={{ borderBottom: "1px solid black", fontSize: "8.5pt", padding: "2px 4px", fontFamily: "'Times New Roman', serif", color: "#000" }}>{pr.appDesig}</td>
            <td style={{ borderBottom: "1px solid black", borderRight: "1px solid black" }}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
