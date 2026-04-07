/**
 * lib/supabase/ors.ts — ORS (Obligation Request and Status) data layer
 *
 * Supplements the existing ORS helpers in lib/supabase/index.ts.
 * Adds support for the extended document fields used by the refined
 * ORSModule (fund_cluster, particulars, mfo_pap, uacs_code, signatories).
 *
 * ors_entries table columns (from DB schema):
 *   id            int8   PK
 *   ors_no        text   unique serial
 *   pr_id         int8   FK → purchase_requests.id (nullable)
 *   pr_no         text   (denormalised for display)
 *   division_id   int8   FK → divisions.division_id
 *   fiscal_year   int8
 *   amount        float8
 *   status        text   Pending | Processing | Approved | Rejected
 *   prepared_by   int8   FK → users.id
 *   approved_by   int8   FK → users.id (nullable)
 *   notes         text   (nullable)
 *   created_at    timestamptz
 *   updated_at    timestamptz
 *
 * Extended fields stored in a companion table `ors_entry_details`
 * (or as extra columns if you run the migration below).
 *
 * ─── Optional migration ──────────────────────────────────────────────────────
 * Run this once in Supabase SQL editor to add the document-level columns:
 *
 *   ALTER TABLE ors_entries
 *     ADD COLUMN IF NOT EXISTS fund_cluster         text,
 *     ADD COLUMN IF NOT EXISTS responsibility_center text,
 *     ADD COLUMN IF NOT EXISTS particulars          text,
 *     ADD COLUMN IF NOT EXISTS mfo_pap              text,
 *     ADD COLUMN IF NOT EXISTS uacs_code            text,
 *     ADD COLUMN IF NOT EXISTS prepared_by_name     text,
 *     ADD COLUMN IF NOT EXISTS prepared_by_desig    text,
 *     ADD COLUMN IF NOT EXISTS approved_by_name     text,
 *     ADD COLUMN IF NOT EXISTS approved_by_desig    text,
 *     ADD COLUMN IF NOT EXISTS date_created         text;
 *
 * Until the migration is run the extended fields are gracefully ignored
 * on insert/update (Supabase silently discards unknown columns).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { supabase } from "./client";

// ─── Extended row type ────────────────────────────────────────────────────────

/** Core ORS row — mirrors the existing ors_entries table exactly. */
export interface OrsEntryRow {
  id: string;
  ors_no: string;
  pr_id: string | null;
  pr_no: string | null;
  division_id: number | null;
  fiscal_year: number;
  amount: number;
  status: "Pending" | "Processing" | "Approved" | "Rejected";
  prepared_by: string | number | null;
  approved_by: string | number | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  // ── Extended document fields (optional; require migration above) ──
  fund_cluster?: string | null;
  responsibility_center?: string | null;
  particulars?: string | null;
  mfo_pap?: string | null;
  uacs_code?: string | null;
  prepared_by_name?: string | null;
  prepared_by_desig?: string | null;
  approved_by_name?: string | null;
  approved_by_desig?: string | null;
  date_created?: string | null;
}

/** Columns accepted on insert (omit server-generated fields). */
export type OrsInsertPayload = Omit<OrsEntryRow, "id" | "created_at" | "updated_at">;

/** Columns accepted on update. */
export type OrsPatchPayload = Partial<OrsInsertPayload>;

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Fetch ORS entries for a given fiscal year.
 * Optionally filter by division_id (for End User role) or pr_no.
 */
export async function fetchOrsEntries(
  fiscalYear: number,
  opts: { divisionId?: number; prNo?: string } = {},
): Promise<OrsEntryRow[]> {
  let q = supabase
    .from("ors_entries")
    .select("*")
    .eq("fiscal_year", fiscalYear)
    .order("created_at", { ascending: false });

  if (opts.divisionId != null) q = q.eq("division_id", opts.divisionId);
  if (opts.prNo) q = q.eq("pr_no", opts.prNo);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as OrsEntryRow[];
}

/** Fetch a single ORS entry by its primary key. */
export async function fetchOrsEntryById(id: string): Promise<OrsEntryRow> {
  const { data, error } = await supabase
    .from("ors_entries")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) throw error ?? new Error("ORS entry not found");
  return data as OrsEntryRow;
}

/** Generate the next ORS serial number for the current fiscal year. */
export async function generateOrsNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from("ors_entries")
    .select("id", { count: "exact", head: true })
    .eq("fiscal_year", year);
  const seq = String((count ?? 0) + 1).padStart(4, "0");
  return `ORS-${year}-${seq}`;
}

/** Insert a new ORS entry. Returns the inserted row. */
export async function insertOrsEntry(
  payload: OrsInsertPayload,
): Promise<OrsEntryRow> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("ors_entries")
    .insert({ ...payload, created_at: now, updated_at: now })
    .select()
    .single();
  if (error) throw error;
  return data as OrsEntryRow;
}

/** Patch an existing ORS entry. */
export async function updateOrsEntry(
  id: string,
  patch: OrsPatchPayload,
): Promise<void> {
  const { error } = await supabase
    .from("ors_entries")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Hard-delete an ORS entry. */
export async function deleteOrsEntry(id: string): Promise<void> {
  const { error } = await supabase.from("ors_entries").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Advance the ORS status.
 * Convenience wrapper around updateOrsEntry for status-only changes.
 */
export async function updateOrsStatus(
  id: string,
  status: OrsEntryRow["status"],
): Promise<void> {
  await updateOrsEntry(id, { status });
}
