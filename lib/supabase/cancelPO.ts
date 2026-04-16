/**
 * lib/supabase/cancelPO.ts
 *
 * Admin-only (role_id = 1) helpers for cancelling a Purchase Order and
 * stamping an audit remark.
 *
 * ─── DATABASE CONVENTION ─────────────────────────────────────────────────────
 * Cancellation is a soft-delete: status_id is set to CANCELLED_STATUS_ID (0).
 * Ensure a row exists in `status` ( id = 0, status_name = 'Cancelled' ) so
 * that StatusPill / label lookups display it correctly.
 *
 * The DB schema (from DB_PO_Process.png) shows the following tables touched
 * by a PO cancel:
 *
 *   purchase_orders        → status_id = 0, updated_at = now
 *   purchase_order_items   → preserved (audit trail)
 *   ors_entries            → linked ORS entry status set to 'Rejected' if
 *                            one exists (pr_no match), preserving all columns
 *   remarks                → system cancel remark inserted (po_id, pr_id,
 *                            user_id, remark, status_flag_id = null)
 *
 * ─── HOW TO USE ──────────────────────────────────────────────────────────────
 * Re-export from lib/supabase/index.ts:
 *
 *   export * from "./cancelPO";
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { supabase } from "./client";

export const CANCELLED_STATUS_NAME = "Cancelled";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CancelPOResult {
  poId: string;
  cancelledAt: string;
  /** ORS entry id that was voided, or null if none existed. */
  orsEntryId: string | null;
}

export interface CancelPOPreview {
  poNo: string | null;
  prNo: string | null;
  supplier: string | null;
  officeSection: string | null;
  totalAmount: number;
  currentStatusId: number;
  /** Human-readable label of the current status, e.g. "PO (Allocation)". */
  currentStatusLabel: string;
  /** Number of remarks already attached to this PO. */
  remarkCount: number;
  /** Number of line items on the PO. */
  itemCount: number;
  /** Linked ORS entry id, or null if none exists yet. */
  orsEntryId: string | null;
  /** ORS number if an ORS entry is linked. */
  orsNo: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve a status_id to its human-readable label from the `status` table.
 * Falls back to "Status <id>" when the row is not found.
 */
async function resolveStatusLabel(statusId: number | null): Promise<string> {
  if (statusId === null) return "Unknown";
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

// ─── fetchPOCancelPreview ─────────────────────────────────────────────────────

/**
 * Fetch a lightweight summary of the PO and its connected records so the
 * confirmation dialog can show exactly what will be cancelled before committing.
 *
 * All counts are non-fatal: a Supabase error on a count query returns 0
 * instead of bubbling up.
 */
export async function fetchPOCancelPreview(
  poId: string,
): Promise<CancelPOPreview> {
  // ── PO header ──
  const { data: po, error: poErr } = await supabase
    .from("purchase_orders")
    .select(
      "id, po_no, pr_no, pr_id, supplier, office_section, total_amount, status_id, ors_no",
    )
    .eq("id", poId)
    .single();
  if (poErr || !po) throw poErr ?? new Error("PO not found.");

  const poRow = po as any;

  // ── Status label ──
  const currentStatusLabel = await resolveStatusLabel(poRow.status_id);

  // ── Remark count (non-fatal) ──
  const { count: remarkCount } = await supabase
    .from("remarks")
    .select("id", { count: "exact", head: true })
    .eq("po_id", poId);

  // ── Item count (non-fatal) ──
  const { count: itemCount } = await supabase
    .from("purchase_order_items")
    .select("id", { count: "exact", head: true })
    .eq("po_id", poId);

  // ── Linked ORS entry via pr_no (non-fatal) ──
  let orsEntryId: string | null = null;
  let orsNo: string | null = poRow.ors_no ?? null;

  if (poRow.pr_no) {
    const { data: orsRow } = await supabase
      .from("ors_entries")
      .select("id, ors_no")
      .eq("pr_no", poRow.pr_no)
      .maybeSingle();
    if (orsRow) {
      orsEntryId = (orsRow as any).id ?? null;
      orsNo = (orsRow as any).ors_no ?? orsNo;
    }
  }

  return {
    poNo: poRow.po_no ?? null,
    prNo: poRow.pr_no ?? null,
    supplier: poRow.supplier ?? null,
    officeSection: poRow.office_section ?? null,
    totalAmount: Number(poRow.total_amount) || 0,
    currentStatusId: Number(poRow.status_id) || 0,
    currentStatusLabel,
    remarkCount: remarkCount ?? 0,
    itemCount: itemCount ?? 0,
    orsEntryId,
    orsNo,
  };
}

// ─── cancelPurchaseOrder ──────────────────────────────────────────────────────

/**
 * Cancel a PO (admin only).
 *
 * Steps
 * ─────
 *  1. Set purchase_orders.status_id = CANCELLED_PO_STATUS_ID and stamp updated_at
 *  2. If a linked ors_entries row exists (matched by pr_no), set its status
 *     to 'Rejected' so the ORS module reflects the void
 *  3. Insert a system remark in `remarks` recording who cancelled it and why
 *     (po_id, pr_id, user_id, remark)
 *
 * Throws on any Supabase error so the caller can surface it to the user.
 * purchase_order_items are intentionally left untouched for the audit trail.
 */
export async function cancelPurchaseOrder(
  poId: string,
  cancelledByUserId: number | string | null,
  reason: string,
): Promise<CancelPOResult> {
  const now = new Date().toISOString();

  const { data: statusRow, error: statusErr } = await supabase
    .from("status")
    .select("id")
    .ilike("status_name", CANCELLED_STATUS_NAME)
    .limit(1)
    .maybeSingle();
  if (statusErr) throw statusErr;
  const cancelledStatusId = (statusRow as any)?.id ?? null;
  if (!cancelledStatusId) {
    throw new Error(
      "Cancelled status not found in public.status. Add a status row named 'Cancelled' and try again.",
    );
  }

  // ── 1. Soft-delete the PO ──
  const { error: poErr } = await supabase
    .from("purchase_orders")
    .update({ status_id: cancelledStatusId, updated_at: now })
    .eq("id", poId);
  if (poErr) throw poErr;

  // ── Resolve pr_id and pr_no for downstream steps ──
  const { data: poRow } = await supabase
    .from("purchase_orders")
    .select("pr_id, pr_no")
    .eq("id", poId)
    .maybeSingle();

  const prId: string | null = (poRow as any)?.pr_id ?? null;
  const prNo: string | null = (poRow as any)?.pr_no ?? null;

  // ── 2. Void linked ORS entry if one exists ──
  let orsEntryId: string | null = null;
  if (prNo) {
    const { data: orsRow } = await supabase
      .from("ors_entries")
      .select("id")
      .eq("pr_no", prNo)
      .maybeSingle();

    if (orsRow?.id) {
      orsEntryId = String(orsRow.id);
      const { error: orsErr } = await supabase
        .from("ors_entries")
        .update({ status: "Rejected", updated_at: now })
        .eq("id", orsRow.id);
      if (orsErr) throw orsErr;
    }
  }

  // ── 3. Audit remark ──
  const remarkText = `[CANCELLED] ${reason.trim()}`;
  const { error: remarkErr } = await supabase.from("remarks").insert({
    po_id: poId,
    pr_id: prId,
    user_id: cancelledByUserId ? String(cancelledByUserId) : null,
    remark: remarkText,
    status_flag_id: null,
    created_at: now,
  });
  if (remarkErr) throw remarkErr;

  return { poId, cancelledAt: now, orsEntryId };
}
