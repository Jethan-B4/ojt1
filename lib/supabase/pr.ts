/**
 * lib/supabase/pr.ts — Purchase Request data layer
 *
 * 🔔 Notifications are fired (fire-and-forget) after every mutating operation:
 *    insertPurchaseRequest  → notifyPRCreated
 *    updatePurchaseRequest  → notifyPREdited
 *    updatePRStatus         → notifyPRStatusChanged  (resolves label from public.status)
 */

import {
  notifyPRCreated,
  notifyPREdited,
  notifyPRStatusChanged,
} from "@/lib/supabase/notifications";
import { supabase } from "./client";

// ─── Status label helper ──────────────────────────────────────────────────────

/**
 * Resolve a status_id to its human-readable label from public.status.
 * Falls back to "Status <id>" on any error.
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

// ─── Queries (unchanged) ──────────────────────────────────────────────────────

export async function fetchPRStatuses() {
  const { data, error } = await supabase
    .from("status")
    .select("id, status_name")
    .order("id");
  if (error) throw error;
  return data;
}

export async function fetchPurchaseRequests() {
  const { data, error } = await supabase.from("purchase_requests").select("*");
  if (error) throw error;
  return data;
}

export async function fetchPurchaseRequestsByDivision(divisionId: number) {
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("*")
    .eq("division_id", divisionId);
  if (error) throw error;
  return data;
}

export async function fetchCanvassablePRs() {
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("*")
    .gt("status_id", 5);
  if (error) throw error;
  return data;
}

export async function fetchCanvassablePRsByDivision(divisionId: number) {
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("*")
    .gt("status_id", 5)
    .eq("division_id", divisionId);
  if (error) throw error;
  return data;
}

export async function fetchRemarksByPR(prId: string | number) {
  const { data, error } = await supabase
    .from("remarks")
    .select(
      "id, pr_id, remark, status_flag_id, created_at, users(fullname), status_flag(*)",
    )
    .eq("pr_id", prId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    ...r,
    username: r.users?.fullname ?? null,
  }));
}

export async function fetchLatestRemarkByPR(prId: string | number) {
  const { data, error } = await supabase
    .from("remarks")
    .select(
      "id, pr_id, remark, status_flag_id, created_at, users(fullname), status_flag(*)",
    )
    .eq("pr_id", prId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function insertRemark(
  prId: string | number,
  userId: string | number | null,
  remark: string,
  statusFlagId?: number | null,
) {
  const payload: Record<string, any> = {
    pr_id: prId,
    remark,
    user_id: userId,
    status_flag_id: statusFlagId ?? null,
  };
  const { error } = await supabase.from("remarks").insert(payload);
  if (error) throw error;
}

export async function fetchPRIdByNo(prNo: string) {
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("id")
    .eq("pr_no", prNo)
    .single();
  if (error) return null;
  return (data as any)?.id ?? null;
}

export async function fetchPRWithItemsById(prId: string) {
  let headerResp = await supabase
    .from("purchase_requests")
    .select("*")
    .eq("id", prId)
    .single();
  if (headerResp.error) {
    headerResp = await supabase
      .from("purchase_requests")
      .select("*")
      .eq("pr_id", prId)
      .single();
  }
  if (headerResp.error || !headerResp.data)
    throw headerResp.error ?? new Error("PR not found");
  const header = headerResp.data as any;
  const { data: items, error: iErr } = await supabase
    .from("purchase_request_items")
    .select(
      "id, stock_no, unit, description, quantity, unit_price, subtotal, pr_id",
    )
    .eq("pr_id", (header as any).id ?? (header as any).pr_id);
  if (iErr) throw iErr;
  return { header, items };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Update a PR's status_id (forward, approve, return, etc.).
 * 🔔 Fires notifyPRStatusChanged after a successful update.
 *
 * @param prId     purchase_requests.id (UUID)
 * @param statusId New status_id from public.status
 */
export async function updatePRStatus(prId: string | number, statusId: number) {
  // Prefetch pr_no so the notification body is human-readable.
  const { data: prRow } = await supabase
    .from("purchase_requests")
    .select("pr_no")
    .eq("id", prId)
    .maybeSingle();

  const { error } = await supabase
    .from("purchase_requests")
    .update({ status_id: statusId, updated_at: new Date().toISOString() })
    .eq("id", prId);
  if (error) throw error;

  // Resolve label and fire notification (non-blocking).
  resolveStatusLabel(statusId).then((label) => {
    notifyPRStatusChanged((prRow as any)?.pr_no ?? null, label);
  });
}

/**
 * Insert a new Purchase Request header + items.
 * 🔔 Fires notifyPRCreated after a successful insert.
 */
export async function insertPurchaseRequest(
  pr: Record<string, any>,
  items: Record<string, any>[],
) {
  const now = new Date().toISOString();
  const base: Record<string, any> = {
    pr_no: pr.pr_no,
    office_section: pr.office_section,
    purpose: pr.purpose,
    total_cost: pr.total_cost,
    is_high_value: pr.is_high_value,
    status_id: pr.status_id,
    proposal_no: pr.proposal_no,
    division_id: pr.division_id,
    updated_at: now,
  };
  if (pr.entity_name) base.entity_name = pr.entity_name;
  if (pr.fund_cluster) base.fund_cluster = pr.fund_cluster;
  if (pr.resp_code) base.resp_code = pr.resp_code;
  if (pr.budget_number) base.budget_number = pr.budget_number;
  if (pr.pap_code) base.pap_code = pr.pap_code;
  if (pr.proposal_file) base.proposal_file = pr.proposal_file;
  if (pr.req_name) base.req_name = pr.req_name;
  if (pr.req_desig) base.req_desig = pr.req_desig;
  if (pr.app_name) base.app_name = pr.app_name;
  if (pr.app_desig) base.app_desig = pr.app_desig;

  const { data, error } = await supabase
    .from("purchase_requests")
    .insert(base)
    .select()
    .single();
  if (error) throw error;

  const parentId = (data as any).id ?? (data as any).pr_id;
  if (items.length > 0) {
    const { error: itemsError } = await supabase
      .from("purchase_request_items")
      .insert(items.map((item) => ({ ...item, pr_id: parentId })));
    if (itemsError) throw itemsError;
  }

  // Fire notification after everything succeeds.
  notifyPRCreated((data as any).pr_no ?? null);

  return data;
}

/**
 * Update editable PR header fields + replace all line items.
 * Stamps updated_at so "Last Processed" sort reflects the edit.
 * 🔔 Fires notifyPREdited after a successful update.
 *
 * @param prId  purchase_requests.id (UUID)
 * @param patch Editable header fields
 * @param items Full replacement item list (delete-then-insert)
 */
export async function updatePurchaseRequest(
  prId: string,
  patch: {
    office_section?: string;
    purpose?: string;
    total_cost?: number;
    is_high_value?: boolean;
    req_name?: string | null;
    req_desig?: string | null;
    app_name?: string | null;
    app_desig?: string | null;
    entity_name?: string | null;
    fund_cluster?: string | null;
    resp_code?: string | null;
    budget_number?: string | null;
    pap_code?: string | null;
    proposal_no?: string | null;
  },
  items?: Array<{
    stock_no?: string | null;
    unit: string;
    description: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>,
): Promise<void> {
  const now = new Date().toISOString();

  // Prefetch pr_no for the notification body.
  const { data: prRow } = await supabase
    .from("purchase_requests")
    .select("pr_no")
    .eq("id", prId)
    .maybeSingle();

  // 1. Update header
  const { error: headerErr } = await supabase
    .from("purchase_requests")
    .update({ ...patch, updated_at: now })
    .eq("id", prId);
  if (headerErr) throw headerErr;

  // 2. Replace items only when caller provides a new list
  if (items !== undefined) {
    const { error: delErr } = await supabase
      .from("purchase_request_items")
      .delete()
      .eq("pr_id", prId);
    if (delErr) throw delErr;

    if (items.length > 0) {
      const { error: insErr } = await supabase
        .from("purchase_request_items")
        .insert(items.map((i) => ({ ...i, pr_id: prId })));
      if (insErr) throw insErr;
    }
  }

  // Fire notification after all DB operations succeed.
  notifyPREdited((prRow as any)?.pr_no ?? null);
}

export async function insertProposalForPR(
  prId: string,
  proposalNo: string,
  divisionId?: number,
) {
  if (!proposalNo) return;
  const payload: Record<string, any> = { pr_id: prId, proposal_no: proposalNo };
  if (typeof divisionId === "number") payload.division_id = divisionId;
  const { error } = await supabase.from("proposals").insert(payload);
  if (error) throw error;
}

export async function cancelPurchaseRequest(
  prId: string,
  reason?: string | null,
) {
  // Gather related canvass session IDs
  const { data: sessions, error: sessErr } = await supabase
    .from("canvass_sessions")
    .select("id")
    .eq("pr_id", prId);
  if (sessErr) throw sessErr;
  const sessionIds = (sessions ?? []).map((s: any) => s.id);

  // Delete dependent records first
  if (sessionIds.length > 0) {
    const { error: delEntriesErr } = await supabase
      .from("canvass_entries")
      .delete()
      .in("session_id", sessionIds);
    if (delEntriesErr) throw delEntriesErr;

    const { error: delBACErr } = await supabase
      .from("bac_resolution")
      .delete()
      .in("session_id", sessionIds);
    if (delBACErr) throw delBACErr;

    const { error: delAAAErr } = await supabase
      .from("aaa_documents")
      .delete()
      .in("session_id", sessionIds);
    if (delAAAErr) throw delAAAErr;

    const { error: delAssignErr } = await supabase
      .from("canvasser_assignments")
      .delete()
      .in("session_id", sessionIds);
    if (delAssignErr) throw delAssignErr;
  }

  const { error: delSessErr } = await supabase
    .from("canvass_sessions")
    .delete()
    .eq("pr_id", prId);
  if (delSessErr) throw delSessErr;

  const { error: delRemarksErr } = await supabase
    .from("remarks")
    .delete()
    .eq("pr_id", prId);
  if (delRemarksErr) throw delRemarksErr;

  const { error: delItemsErr } = await supabase
    .from("purchase_request_items")
    .delete()
    .eq("pr_id", prId);
  if (delItemsErr) throw delItemsErr;

  const { error: delPRErr } = await supabase
    .from("purchase_requests")
    .delete()
    .eq("id", prId);
  if (delPRErr) throw delPRErr;

  return { id: prId, deleted: true };
}
