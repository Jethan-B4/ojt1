import { supabase } from "./client";

export async function insertBACResolution(
  sessionId: string,
  payload: {
    resolution_no: string;
    prepared_by: number;
    mode?: string | null;
    resolved_at?: string | null;
    notes?: string | null;
  },
) {
  const { data, error } = await supabase
    .from("bac_resolution")
    .insert({ ...payload, session_id: sessionId })
    .select()
    .single();
  if (error) throw error;
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
    .select("*")
    .eq("session_id", sessionId)
    .order("resolved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as any) ?? null;
}
