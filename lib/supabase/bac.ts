import { supabase } from "./client";

type BACPRPayload = {
  pr_id?: number | null;
  pr_no: string;
  pr_date?: string | null;
  estimated_cost?: number | null;
  end_user?: string | null;
  recommended_mode?: string | null;
};

async function insertResolutionRows(resolutionId: number, prs: BACPRPayload[]) {
  if (prs.length === 0) return;
  const rows = prs.map((r) => ({
    resolution_id: resolutionId,
    pr_id: r.pr_id ?? null,
    pr_no: r.pr_no,
    pr_date: r.pr_date ?? null,
    estimated_cost: r.estimated_cost ?? 0,
    end_user: r.end_user ?? null,
    recommended_mode: r.recommended_mode ?? null,
  }));
  const { error: rowErr } = await supabase.from("bac_resolution_prs").insert(rows);
  if (rowErr) throw rowErr;
}

export async function insertBACResolution(
  sessionId: string,
  payload: {
    resolution_no: string;
    prepared_by: number;
    division_id?: number | null;
    mode?: string | null;
    resolved_at?: string | null;
    resolved_at_place?: string | null;
    whereas_1?: string | null;
    whereas_2?: string | null;
    whereas_3?: string | null;
    now_therefore_text?: string | null;
    notes?: string | null;
    prs?: BACPRPayload[];
  },
) {
  const { prs = [], ...core } = payload;
  const { data, error } = await supabase
    .from("bac_resolution")
    .insert({ ...core, session_id: sessionId })
    .select()
    .single();
  if (error) throw error;
  await insertResolutionRows(Number((data as any).id), prs);
  return data;
}

export async function insertStandaloneBACResolution(payload: {
  resolution_no: string;
  prepared_by: number;
  division_id?: number | null;
  mode?: string | null;
  resolved_at?: string | null;
  resolved_at_place?: string | null;
  whereas_1?: string | null;
  whereas_2?: string | null;
  whereas_3?: string | null;
  now_therefore_text?: string | null;
  notes?: string | null;
  prs?: BACPRPayload[];
}) {
  const { prs = [], ...core } = payload;
  const { data, error } = await supabase
    .from("bac_resolution")
    .insert({ ...core, session_id: null })
    .select()
    .single();
  if (error) throw error;
  await insertResolutionRows(Number((data as any).id), prs);
  return data;
}

/**
 * Upsert a BAC Resolution for a session — delete-then-insert so re-saving
 * never creates duplicate rows.
 */
export async function upsertBACResolution(
  sessionId: string,
  payload: {
    resolution_no: string;
    prepared_by?: number;
    mode?: string | null;
    resolved_at?: string | null;
    notes?: string | null;
  },
) {
  await supabase.from("bac_resolution").delete().eq("session_id", sessionId);
  const { data, error } = await supabase
    .from("bac_resolution")
    .insert({ ...payload, session_id: sessionId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchBACResolutionForSession(sessionId: string) {
  const { data, error } = await supabase
    .from("bac_resolution")
    .select("*, bac_resolution_prs(*)")
    .eq("session_id", sessionId)
    .order("resolved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as any) ?? null;
}

export async function fetchBACResolutionsByDivision(divisionId: number) {
  const { data, error } = await supabase
    .from("bac_resolution")
    .select("*, bac_resolution_prs(*), users(fullname), divisions(division_name)")
    .eq("division_id", divisionId)
    .order("resolved_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
