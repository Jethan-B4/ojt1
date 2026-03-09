import type { PRItemRow, PRRow } from "../lib/supabase";

// Minimal, canonical PR header for UI and PDFs.
// statusId is the FK integer from pr_status (1=Pending … 5=Processing(PARPO)).
// The human-readable label is resolved at render time from the live pr_status lookup.
export interface PRDisplay {
  id: string;
  prNo: string;
  officeSection: string;
  purpose: string;
  totalCost: number;
  /** FK → pr_status.id  (1=Pending, 2=Div Head, 3=BAC, 4=Budget, 5=PARPO) */
  statusId: number;
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
  return {
    id: (row as any).id ?? (row as any).pr_id ?? "",
    prNo: row.pr_no,
    officeSection: row.office_section,
    purpose: row.purpose,
    totalCost: row.total_cost,
    statusId: row.status_id,
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