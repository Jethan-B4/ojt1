import { supabase } from "./client";

export async function insertAAAForSession(
  sessionId: string,
  payload: { aaa_no: string; prepared_by: number; prepared_at?: string | null; file_url?: string | null; particulars?: string | null },
) {
  const { data, error } = await supabase
    .from("aaa_documents")
    .insert({ ...payload, session_id: sessionId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAAAForSession(
  sessionId: string,
  payload: Partial<{ aaa_no: string; prepared_by: number; prepared_at?: string | null; file_url?: string | null; particulars?: string | null }>,
) {
  const { data, error } = await supabase
    .from("aaa_documents")
    .update(payload)
    .eq("session_id", sessionId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

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

