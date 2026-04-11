import { supabase } from "./client";

export async function insertAAAForSession(
  sessionId: string | number,
  payload: {
    aaa_no: string;
    prepared_by: number;
    prepared_at?: string | null;
    file_url?: string | null;
    particulars?: string | null;
  },
) {
  const sid = String(sessionId);
  const { data, error } = await supabase
    .from("aaa_documents")
    .insert({ ...payload, session_id: sid })
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
  sessionId: string | number,
  payload: Partial<{
    aaa_no: string;
    prepared_by: number;
    prepared_at?: string | null;
    file_url?: string | null;
    particulars?: string | null;
  }>,
) {
  const sid = String(sessionId);
  const { data, error } = await supabase
    .from("aaa_documents")
    .update(payload)
    .eq("session_id", sid)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchAAAForSession(sessionId: string | number) {
  const sid = String(sessionId);
  const { data, error } = await supabase
    .from("aaa_documents")
    .select("*")
    .eq("session_id", sid)
    .order("prepared_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as any) ?? null;
}
