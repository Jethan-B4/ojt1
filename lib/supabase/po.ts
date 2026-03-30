/**
 * lib/supabase/po.ts — Purchase Order data layer
 *
 * Mirrors pr.ts conventions.
 *
 * Table: purchase_orders
 * Columns: id, po_no, pr_no, pr_id, supplier, address, tin,
 *          mode_of_procurement, place_of_delivery, delivery_term,
 *          date_of_delivery, payment_term, date, office_section,
 *          fund_cluster, ors_no, ors_date, funds_available, ors_amount,
 *          total_amount, status_id, division_id,
 *          authorized_official_name, authorized_official_desig,
 *          accountant_name, accountant_desig,
 *          created_at, updated_at
 */

import { supabase } from "./client";

// ─── Row types ────────────────────────────────────────────────────────────────

export interface PORow {
  id: string | number;
  po_no: string | null;
  pr_no: string | null;
  pr_id: string | null;
  supplier: string | null;
  address: string | null;
  tin: string | null;
  mode_of_procurement: string | null;
  place_of_delivery: string | null;
  delivery_term: string | null;
  date_of_delivery: string | null;
  payment_term: string | null;
  date: string | null;
  office_section: string | null;
  fund_cluster: string | null;
  ors_no: string | null;
  ors_date: string | null;
  funds_available: string | null;
  ors_amount: number | null;
  total_amount: number | null;
  status_id: number | null;
  division_id: number | null;
  authorized_official_name: string | null;
  authorized_official_desig: string | null;
  accountant_name: string | null;
  accountant_desig: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface POItemRow {
  id?: string;
  po_id?: string;
  stock_no: string | null;
  unit: string;
  description: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function fetchPurchaseOrders(): Promise<PORow[]> {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as PORow[];
}

export async function fetchPurchaseOrdersByDivision(
  divisionId: number,
): Promise<PORow[]> {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("*")
    .eq("division_id", divisionId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as PORow[];
}

export async function fetchPOWithItemsById(
  poId: string,
): Promise<{ header: PORow; items: POItemRow[] }> {
  const { data: header, error: hErr } = await supabase
    .from("purchase_orders")
    .select("*")
    .eq("id", poId)
    .single();
  if (hErr || !header) throw hErr ?? new Error("PO not found");

  const { data: items, error: iErr } = await supabase
    .from("purchase_order_items")
    .select(
      "id, po_id, stock_no, unit, description, quantity, unit_price, subtotal",
    )
    .eq("po_id", poId);
  if (iErr) throw iErr;

  return { header: header as PORow, items: (items ?? []) as POItemRow[] };
}

/** Advance status only (used by POModule process handler). */
export async function updatePOStatus(
  poId: string,
  statusId: number,
): Promise<void> {
  const { error } = await supabase
    .from("purchase_orders")
    .update({ status_id: statusId, updated_at: new Date().toISOString() })
    .eq("id", poId);
  if (error) throw error;
}

/**
 * Full header + items update (used by EditPOModal).
 * Mirrors updatePurchaseRequest: patch header, then delete-and-reinsert items.
 */
export async function updatePO(
  poId: string,
  patch: Partial<Omit<PORow, "id" | "created_at" | "updated_at">>,
  items?: Omit<POItemRow, "id" | "po_id">[],
): Promise<void> {
  const now = new Date().toISOString();
  const { error: hErr } = await supabase
    .from("purchase_orders")
    .update({ ...patch, updated_at: now })
    .eq("id", poId);
  if (hErr) throw hErr;

  if (items !== undefined) {
    const { error: delErr } = await supabase
      .from("purchase_order_items")
      .delete()
      .eq("po_id", poId);
    if (delErr) throw delErr;

    if (items.length > 0) {
      const { error: insErr } = await supabase
        .from("purchase_order_items")
        .insert(items.map((i) => ({ ...i, po_id: poId })));
      if (insErr) throw insErr;
    }
  }
}

/** Insert a new PO header + items (used by CreatePOModal). */
export async function insertPurchaseOrder(
  po: Omit<PORow, "id" | "created_at" | "updated_at">,
  items: Omit<POItemRow, "id" | "po_id">[],
): Promise<PORow> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("purchase_orders")
    .insert({ ...po, created_at: now, updated_at: now })
    .select()
    .single();
  if (error) throw error;
  const parentId = (data as any).id;
  if (items.length > 0) {
    const { error: iErr } = await supabase
      .from("purchase_order_items")
      .insert(items.map((i) => ({ ...i, po_id: parentId })));
    if (iErr) throw iErr;
  }
  return data as PORow;
}
