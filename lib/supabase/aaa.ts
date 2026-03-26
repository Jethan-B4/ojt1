import { supabase } from "./client";

export async function insertAAAForSession(
  sessionId: string,
  payload: {
    aaa_no: string;
    prepared_by: number;
    prepared_at?: string | null;
    file_url?: string | null;
    particulars?: string | null;
  },
) {
  const { data, error } = await supabase
    .from("aaa_documents")
    .insert({ ...payload, session_id: sessionId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Upsert an AAA document for a session — delete-then-insert so re-saving
 * never creates duplicate rows and doesn't throw when no row exists yet.
 */
export async function updateAAAForSession(
  sessionId: string,
  payload: Partial<{
    aaa_no: string;
    prepared_by: number;
    prepared_at?: string | null;
    file_url?: string | null;
    particulars?: string | null;
  }>,
) {
  // Delete any existing row first (idempotent)
  await supabase.from("aaa_documents").delete().eq("session_id", sessionId);
  const { data, error } = await supabase
    .from("aaa_documents")
    .insert({ ...payload, session_id: sessionId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Alias for updateAAAForSession — preferred name for upsert semantics.
 */
export const upsertAAAForSession = updateAAAForSession;

export async function fetchAAAForSession(sessionId: string) {
  const { data, error } = await supabase
    .from("aaa_documents")
    .select("*")
    .eq("session_id", sessionId)
    .order("prepared_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as any) ?? null;
}
