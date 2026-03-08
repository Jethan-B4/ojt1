import type { PRItemRow, PRRow } from "../lib/supabase";

// Canonical PR status as stored in DB
export type PRStatus = "draft" | "pending" | "approved" | "overdue" | "processing";

// Minimal, canonical PR header for UI and PDFs
export interface PRDisplay {
  id: string;
  prNo: string;
  officeSection: string;
  purpose: string;
  totalCost: number;
  status: PRStatus;
  date: string; // Derived from created_at (MM-DD-YYYY)
}

// Canonical line item shape for UI and PDFs
export interface PRLineItem {
  stock_no: string;
  unit: string;
  description: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

// Map DB header → display header
export function toPRDisplay(row: PRRow): PRDisplay {
  const created = row.created_at ? new Date(row.created_at) : new Date();
  const status: PRStatus =
    (row as any).status
      ? (row as any).status
      : (row.status_id === 1
          ? "pending"
          : (row.status_id === 2 || row.status_id === 3 || row.status_id === 4 || row.status_id === 5)
              ? "processing"
              : "approved");
  return {
    id: (row as any).id ?? (row as any).pr_id ?? "",
    prNo: row.pr_no,
    officeSection: row.office_section,
    purpose: row.purpose,
    totalCost: row.total_cost,
    status,
    date: created.toLocaleDateString("en-PH", { month: "2-digit", day: "2-digit", year: "numeric" }),
  };
}

// Map DB line item → display line item
export function toLineItemDisplay(item: PRItemRow): PRLineItem {
  return {
    stock_no: item.stock_no,
    unit: item.unit,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    subtotal: item.subtotal,
  };
}
