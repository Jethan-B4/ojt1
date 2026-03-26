import { supabase } from "./client";

export async function fetchCanvassSessionById(sessionId: string | number) {
  const sid = String(sessionId);
  const { data, error } = await supabase
    .from("canvass_sessions")
    .select("*")
    .eq("id", sid)
    .single();
  if (error) return null;
  return data;
}

export async function updateCanvassSessionMeta(
  sessionId: string | number,
  patch: Partial<{
    deadline: string | null;
    bac_no: string | null;
    status: string;
  }>,
) {
  const sid = String(sessionId);
  const { data, error } = await supabase
    .from("canvass_sessions")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", sid)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCanvassStage(
  sessionId: string | number,
  stage: string,
) {
  const sid = String(sessionId);
  const { data, error } = await supabase
    .from("canvass_sessions")
    .update({ stage, updated_at: new Date().toISOString() })
    .eq("id", sid)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function ensureCanvassSession(
  prId: string | number,
  initial?: Partial<Record<string, any>>,
) {
  // maybeSingle() returns null (not an error) when no row matches
  const pid = String(prId);
  const { data: existing, error: selErr } = await supabase
    .from("canvass_sessions")
    .select("*")
    .eq("pr_id", pid)
    .limit(1)
    .maybeSingle();

  if (selErr) throw selErr;
  if (existing) return existing;

  // No session yet — create one
  const payload: Record<string, any> = {
    pr_id: pid,
    stage: initial?.stage ?? "pr_received",
    status: initial?.status ?? "open",
  };
  if (initial?.released_by !== undefined)
    payload.released_by = initial.released_by;
  if (initial?.deadline !== undefined) payload.deadline = initial.deadline;
  if (initial?.bac_no !== undefined) payload.bac_no = initial.bac_no;

  const { data: created, error: insErr } = await supabase
    .from("canvass_sessions")
    .insert(payload)
    .select()
    .single();
  if (insErr) throw insErr;
  return created;
}

export async function fetchQuotesForSession(sessionId: string) {
  const { data, error } = await supabase
    .from("canvass_entries")
    .select("*")
    .eq("session_id", sessionId);
  if (error) throw error;
  return data;
}

export async function insertSupplierQuotesForSession(
  sessionId: string,
  quotes: Array<Record<string, any>>,
) {
  if (!quotes.length) return [];
  const rows = quotes.map((q) => ({ ...q, session_id: sessionId }));
  const { data, error } = await supabase
    .from("canvass_entries")
    .insert(rows)
    .select();
  if (error) throw error;
  return data;
}

export async function replaceSupplierQuotesForSession(
  sessionId: string,
  quotes: Array<Record<string, any>>,
) {
  const { error: delError } = await supabase
    .from("canvass_entries")
    .delete()
    .eq("session_id", sessionId);
  if (delError) throw delError;
  if (quotes.length === 0) return [];
  const rows = quotes.map((q) => ({ ...q, session_id: sessionId }));
  const { data, error } = await supabase
    .from("canvass_entries")
    .insert(rows)
    .select();
  if (error) throw error;
  return data;
}

export async function setItemWinningSupplier(
  sessionId: string,
  itemNo: number,
  supplierName: string,
) {
  const { error: clearError } = await supabase
    .from("canvass_entries")
    .update({ is_winning: false })
    .eq("session_id", sessionId)
    .eq("item_no", itemNo);
  if (clearError) throw clearError;
  const { error: setError } = await supabase
    .from("canvass_entries")
    .update({ is_winning: true })
    .eq("session_id", sessionId)
    .eq("item_no", itemNo)
    .eq("supplier_name", supplierName);
  if (setError) throw setError;
}

export async function fetchAssignmentsForSession(sessionId: string) {
  const { data, error } = await supabase
    .from("canvasser_assignments")
    .select("*")
    .eq("session_id", sessionId);
  if (error) throw error;
  return data;
}

export async function insertAssignmentsForDivisions(
  sessionId: string,
  assignments: Array<{
    division_id: number;
    canvasser_id?: number;
    released_at?: string;
  }>,
) {
  if (!assignments.length) return [];
  const rows = assignments.map((a) => ({
    session_id: sessionId,
    division_id: a.division_id,
    canvasser_id: a.canvasser_id ?? null,
    released_at: a.released_at ?? new Date().toISOString(),
    status: "released" as const,
  }));
  const { data, error } = await supabase
    .from("canvasser_assignments")
    .insert(rows)
    .select();
  if (error) throw error;
  return data;
}

export async function insertAssignmentReleased(
  sessionId: string,
  division_id: number,
  canvasser_id?: number | null,
  released_at?: string,
) {
  const now = released_at ?? new Date().toISOString();
  const { data, error } = await supabase
    .from("canvasser_assignments")
    .insert({
      session_id: sessionId,
      division_id,
      canvasser_id: canvasser_id ?? null,
      released_at: now,
      returned_at: null,
      status: "released" as const,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAssignmentReleased(
  sessionId: string,
  division_id: number,
  canvasser_id?: number | null,
  released_at?: string,
) {
  const now = released_at ?? new Date().toISOString();
  const { data, error } = await supabase
    .from("canvasser_assignments")
    .update({
      canvasser_id: canvasser_id ?? null,
      released_at: now,
      returned_at: null,
      status: "released" as const,
    })
    .eq("session_id", sessionId)
    .eq("division_id", division_id)
    .select();
  if (error) throw error;
  return data;
}

export async function markAssignmentReturned(
  sessionId: string,
  division_id: number,
  returned_at?: string,
) {
  const { data, error } = await supabase
    .from("canvasser_assignments")
    .update({
      returned_at: returned_at ?? new Date().toISOString(),
      status: "returned",
    })
    .eq("session_id", sessionId)
    .eq("division_id", division_id)
    .select();
  if (error) throw error;
  return data;
}

export async function fetchAssignmentsWithDetails(sessionId: string) {
  const { data, error } = await supabase
    .from("canvasser_assignments")
    .select("*, divisions(division_name), users(fullname)")
    .eq("session_id", sessionId);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    session_id: r.session_id,
    division_id: r.division_id,
    canvasser_id: r.canvasser_id ?? null,
    released_at: r.released_at ?? null,
    returned_at: r.returned_at ?? null,
    status: r.status,
    division_name: r.divisions?.division_name ?? null,
    canvasser_name: r.users?.fullname ?? null,
  }));
}

export async function fetchUsersByRole(roleIds: number[]) {
  const { data, error } = await supabase
    .from("users")
    .select("id, fullname, role_id, division_id, divisions(division_name)")
    .in("role_id", roleIds)
    .order("fullname");
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    username: r.fullname,
    role_id: r.role_id,
    division_id: r.division_id ?? null,
    division_name: r.divisions?.division_name ?? null,
  }));
}
