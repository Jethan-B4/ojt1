/**
 * cancelPR.ts
 *
 * Admin-only (role_id = 1) helpers for cancelling a PR and all connected
 * records (canvass session + canvass entries + assignments + remarks).
 *
 * ─── HOW TO USE ───────────────────────────────────────────────────────────────
 * Add these two exports to lib/supabase/pr.ts  OR keep as a separate file and
 * re-export everything from lib/supabase/index.ts:
 *
 *   export * from "./cancelPR";
 *
 * ─── DATABASE CONVENTION ──────────────────────────────────────────────────────
 * Cancellation is a soft-delete: we stamp status_id = 0 on the PR row.
 * You should add a row in `pr_status` ( id = 0, status_name = 'Cancelled' )
 * so StatusPill / label lookups display it correctly.
 *
 * All child records (canvass_sessions, canvass_entries, canvasser_assignments,
 * remarks) are preserved for the audit trail — none are hard-deleted.
 * The canvass_session's `status` column is set to 'cancelled' so downstream
 * canvassing screens can gate on it.
 *
 * Update CANCELLED_STATUS_ID below if your schema uses a different value.
 */

import { supabase } from "./client";

/** pr_status.id that represents a cancelled PR in your schema. */
export const CANCELLED_STATUS_ID = 0;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CancelPRResult {
  prId: string;
  cancelledAt: string;
  /** Canvass session id that was cancelled, or null if none existed. */
  sessionId: string | null;
}

export interface CancelPRPreview {
  prNo: string;
  officeSection: string;
  purpose: string;
  totalCost: number;
  currentStatusId: number;
  remarkCount: number;
  sessionId: string | null;
  sessionStage: string | null;
  canvassEntryCount: number;
  assignmentCount: number;
}

// ─── fetchPRCancelPreview ─────────────────────────────────────────────────────

/**
 * Fetch a lightweight summary of the PR and its connected data so the
 * confirmation dialog can show exactly what will be cancelled before committing.
 */
export async function fetchPRCancelPreview(
  prId: string,
): Promise<CancelPRPreview> {
  // PR header
  const { data: pr, error: prErr } = await supabase
    .from("purchase_requests")
    .select("id, pr_no, office_section, purpose, total_cost, status_id")
    .eq("id", prId)
    .single();
  if (prErr || !pr) throw prErr ?? new Error("PR not found.");

  // Remark count (non-fatal)
  const { count: remarkCount } = await supabase
    .from("remarks")
    .select("id", { count: "exact", head: true })
    .eq("pr_id", prId);

  // Canvass session (may not exist yet)
  const { data: session } = await supabase
    .from("canvass_sessions")
    .select("id, stage, status")
    .eq("pr_id", prId)
    .limit(1)
    .maybeSingle();

  let canvassEntryCount = 0;
  let assignmentCount = 0;

  if (session) {
    const { count: ec } = await supabase
      .from("canvass_entries")
      .select("id", { count: "exact", head: true })
      .eq("session_id", session.id);
    canvassEntryCount = ec ?? 0;

    const { count: ac } = await supabase
      .from("canvasser_assignments")
      .select("id", { count: "exact", head: true })
      .eq("session_id", session.id);
    assignmentCount = ac ?? 0;
  }

  return {
    prNo: pr.pr_no,
    officeSection: pr.office_section,
    purpose: pr.purpose,
    totalCost: pr.total_cost ?? 0,
    currentStatusId: pr.status_id,
    remarkCount: remarkCount ?? 0,
    sessionId: session?.id ?? null,
    sessionStage: session?.stage ?? null,
    canvassEntryCount,
    assignmentCount,
  };
}

// ─── cancelPurchaseRequest ────────────────────────────────────────────────────

/**
 * Cancel a PR and its connected canvass session (if any).
 *
 * Steps
 * ─────
 *  1. Set purchase_requests.status_id = CANCELLED_STATUS_ID
 *  2. If a canvass_session exists, set its status = 'cancelled'
 *  3. Insert a system remark recording who cancelled it and why
 *
 * Throws on any Supabase error so the caller can surface it to the user.
 */
export async function cancelPurchaseRequest(
  prId: string,
  cancelledByUserId: number | null,
  reason: string,
): Promise<CancelPRResult> {
  const now = new Date().toISOString();

  // 1. Mark PR as cancelled
  const { error: prErr } = await supabase
    .from("purchase_requests")
    .update({ status_id: CANCELLED_STATUS_ID })
    .eq("id", prId);
  if (prErr) throw prErr;

  // 2. Cancel the linked canvass session if one exists
  const { data: session } = await supabase
    .from("canvass_sessions")
    .select("id")
    .eq("pr_id", prId)
    .limit(1)
    .maybeSingle();

  if (session?.id) {
    const { error: sessErr } = await supabase
      .from("canvass_sessions")
      .update({ status: "cancelled", updated_at: now })
      .eq("id", session.id);
    if (sessErr) throw sessErr;
  }

  // 3. Append an audit remark so the history trail is complete
  const remarkText = `[CANCELLED] ${reason.trim()}`;
  const { error: remarkErr } = await supabase.from("remarks").insert({
    pr_id: prId,
    user_id: cancelledByUserId,
    remark: remarkText,
    status_flag_id: null,
  });
  if (remarkErr) throw remarkErr;

  return {
    prId,
    cancelledAt: now,
    sessionId: session?.id ?? null,
  };
}
