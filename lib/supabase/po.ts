/**
 * lib/supabase/po.ts — Purchase Order data layer
 *
 * Table: purchase_orders
 * Columns mirror the Supabase schema exactly (snake_case).
 *
 * PO lifecycle status_id values (from public.status table):
 *   12 → PO (Creation)      ← default starting status on insert (Supply logs receipt)
 *   13 → PO (Allocation)    ← Supply assigns PO # and prepares document
 *   14 → ORS (Creation)     ← Budget prepares ORS, assigns ORS number
 *   15 → ORS (Processing)   ← Budget officer signs; forwards to Accounting
 *
 * 🔔 Notifications are fired (fire-and-forget) after every mutating operation:
 *    insertPurchaseOrder  → notifyPOCreated
 *    updatePO             → notifyPOEdited
 *    updatePOStatus       → notifyPOStatusChanged  (resolves label from public.status)
 */

import {
    notifyPOCreated,
    notifyPOEdited,
    notifyPOStatusChanged,
} from "@/lib/supabase/notifications";
import { assertOnline } from "@/lib/network";
import { supabase, withTimeout } from "./client";

// ─── Row types ────────────────────────────────────────────────────────────────

export interface PORow {
  id: string;
  po_no: string | null;
  pr_no: string | null;
  pr_id: string | null;
  supplier: string | null;
  address: string | null;
  tin: string | null;
  procurement_mode: string | null;
  delivery_place: string | null;
  delivery_term: string | null;
  delivery_date: string | null;
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
  official_name: string | null;
  official_desig: string | null;
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

/** Columns written on insert / update (everything except id, created_at, updated_at). */
export type POInsertPayload = Omit<PORow, "id" | "created_at" | "updated_at">;
export type POPatchPayload = Partial<POInsertPayload>;

// ─── Queries ──────────────────────────────────────────────────────────────────

/** Fetch all purchase orders (admin / privileged roles). */
export async function fetchPurchaseOrders(): Promise<PORow[]> {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as PORow[];
}

/** Fetch purchase orders scoped to a specific division. */
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

/** Fetch purchase orders for a specific fiscal year. */
export async function fetchPurchaseOrdersByYear(
  year: number,
): Promise<PORow[]> {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("*")
    .gte("created_at", `${year}-01-01T00:00:00Z`)
    .lte("created_at", `${year}-12-31T23:59:59Z`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as PORow[];
}

/** Fetch purchase orders for a specific fiscal year and division. */
export async function fetchPurchaseOrdersByYearAndDivision(
  year: number,
  divisionId: number,
): Promise<PORow[]> {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("*")
    .eq("division_id", divisionId)
    .gte("created_at", `${year}-01-01T00:00:00Z`)
    .lte("created_at", `${year}-12-31T23:59:59Z`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as PORow[];
}

/** Fetch a single PO with its line items. */
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

// ─── Status label helper ──────────────────────────────────────────────────────

/**
 * Resolve a status_id to its human-readable label.
 * Falls back to "Status <id>" if the row is not found.
 * Used internally to build notification bodies.
 */
async function resolveStatusLabel(statusId: number): Promise<string> {
  try {
    const { data } = await supabase
      .from("status")
      .select("status_name")
      .eq("id", statusId)
      .maybeSingle();
    return (data as any)?.status_name ?? `Status ${statusId}`;
  } catch {
    return `Status ${statusId}`;
  }
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Advance (or revert) the status_id of a PO.
 * 🔔 Fires notifyPOStatusChanged after a successful update.
 */
export async function updatePOStatus(
  poId: string,
  statusId: number,
): Promise<void> {
  await assertOnline("update PO status");
  // Fetch the PO's po_no for the notification body before mutating.
  const { data: poRow } = await supabase
    .from("purchase_orders")
    .select("po_no")
    .eq("id", poId)
    .maybeSingle();

  const { error } = await supabase
    .from("purchase_orders")
    .update({ status_id: statusId, updated_at: new Date().toISOString() })
    .eq("id", poId);
  if (error) throw error;

  // Resolve label and fire notification (non-blocking).
  resolveStatusLabel(statusId).then((label) => {
    notifyPOStatusChanged((poRow as any)?.po_no ?? null, label);
  });
}

/**
 * Full header + items update (used by EditPOModal).
 * Patches the header row then delete-and-reinserts items when provided.
 * 🔔 Fires notifyPOEdited after a successful update.
 */
export async function updatePO(
  poId: string,
  patch: POPatchPayload,
  items?: Omit<POItemRow, "id" | "po_id">[],
): Promise<void> {
  await assertOnline("update PO");
  // Grab po_no for notification (prefer patch value, fall back to DB).
  let poNo: string | null = patch.po_no ?? null;
  if (!poNo) {
    const { data } = await supabase
      .from("purchase_orders")
      .select("po_no")
      .eq("id", poId)
      .maybeSingle();
    poNo = (data as any)?.po_no ?? null;
  }

  const { error: hErr } = await withTimeout(
    supabase
      .from("purchase_orders")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", poId),
    "update PO header",
  );
  if (hErr) throw hErr;

  if (items !== undefined) {
    const { error: delErr } = await withTimeout(
      supabase.from("purchase_order_items").delete().eq("po_id", poId),
      "replace PO items (delete)",
    );
    if (delErr) throw delErr;

    if (items.length > 0) {
      const { error: insErr } = await withTimeout(
        supabase
          .from("purchase_order_items")
          .insert(items.map((i) => ({ ...i, po_id: poId }))),
        "replace PO items (insert)",
      );
      if (insErr) throw insErr;
    }
  }

  // Fire notification after all DB operations succeed.
  notifyPOEdited(poNo);
}

/**
 * Insert a new PO header + items (used by CreatePOModal).
 * Returns the full inserted row (including server-generated id).
 * Default status_id is 11 (PO Creation) when payload omits status_id.
 * 🔔 Fires notifyPOCreated after a successful insert.
 */
export async function insertPurchaseOrder(
  po: POInsertPayload,
  items: Omit<POItemRow, "id" | "po_id">[],
): Promise<PORow> {
  await assertOnline("create PO");
  const now = new Date().toISOString();
  const initialStatus =
    po.status_id != null && Number(po.status_id) > 0
      ? Number(po.status_id)
      : 11;
  const { data, error } = await withTimeout(
    supabase
      .from("purchase_orders")
      .insert({
        ...po,
        status_id: initialStatus,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single(),
    "create PO header",
  );
  if (error) throw error;

  const inserted = data as PORow;

  if (items.length > 0) {
    const { error: iErr } = await withTimeout(
      supabase
        .from("purchase_order_items")
        .insert(items.map((i) => ({ ...i, po_id: inserted.id }))),
      "create PO items",
    );
    if (iErr) throw iErr;
  }

  // Fire notification after everything succeeds.
  notifyPOCreated(inserted.po_no);

  return inserted;
}

// ─── Lookups ──────────────────────────────────────────────────────────────────

/**
 * Fetch PO-lifecycle status rows from public.status for label lookups.
 *
 * Full Phase 2 lifecycle (from public.status table):
 *   11 = PO (Creation)    — Supply receives Abstract, logs receipt
 *   12 = PO (Allocation)  — Supply assigns PO # and prepares document
 *   13 = ORS (Creation)   — Budget prepares ORS, assigns ORS number
 *   14 = ORS (Processing) — Budget officer signs; forwards to Accounting
 *   15 = PO (Accounting)  — Accounting incoming check / document completeness
 *   16 = PO (PARPO)       — PARPO II reviews and signs PO
 *   17 = PO (Serving)     — Supply serves PO to suppliers
 */
export async function fetchPOStatuses(): Promise<
  { id: number; status_name: string }[]
> {
  const { data, error } = await supabase
    .from("status")
    .select("id, status_name")
    // PO lifecycle only (exclude delivery/payment ids between 17 and 34)
    .in("id", [11, 12, 13, 14, 15, 16, 17, 34])
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []) as { id: number; status_name: string }[];
}

/**
 * Fetch the single most-recent remark for a PO from the remarks table.
 * Returns null if the PO has no remarks yet.
 */
export async function fetchLatestRemarkByPO(
  poId: string,
): Promise<import("@/lib/supabase-types").RemarkRow | null> {
  const { data, error } = await supabase
    .from("remarks")
    .select(
      "id, po_id, remark, status_flag_id, created_at, user_id, users(fullname)",
    )
    .eq("po_id", poId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as import("@/lib/supabase-types").RemarkRow | null;
}
