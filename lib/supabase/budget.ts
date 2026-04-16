import { supabase } from "./client";

export interface DivisionBudgetRow {
  id: string;
  division_id: number;
  fiscal_year: number;
  allocated: number;
  utilized: number;
  notes?: string | null;
  division_name?: string | null;
}

export type OrsStatus = "Pending" | "Processing" | "Approved" | "Rejected";

export interface OrsEntryRow {
  id: string;
  ors_no: string;
  pr_id?: string | null;
  pr_no?: string | null;
  division_id?: number | null;
  fiscal_year: number;
  amount: number;
  status: OrsStatus;
  prepared_by?: number | null;
  approved_by?: number | null;
  notes?: string | null;
  created_at?: string | null;
}

export async function fetchBudgets(year: number): Promise<DivisionBudgetRow[]> {
  const { data, error } = await supabase
    .from("division_budgets")
    .select("id, division_id, fiscal_year, allocated, utilized, notes, divisions(division_name)")
    .eq("fiscal_year", year)
    .order("division_id");
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    division_id: r.division_id,
    fiscal_year: r.fiscal_year,
    allocated: r.allocated ?? 0,
    utilized: r.utilized ?? 0,
    notes: r.notes ?? null,
    division_name: r.divisions?.division_name ?? null,
  }));
}

export async function insertDivisionBudget(
  division_id: number,
  fiscal_year: number,
  allocated: number,
  notes?: string,
): Promise<DivisionBudgetRow> {
  const { data, error } = await supabase
    .from("division_budgets")
    .insert({
      division_id,
      fiscal_year,
      allocated,
      utilized: 0,
      notes: notes?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as DivisionBudgetRow;
}

export async function updateDivisionBudget(
  id: string,
  fiscal_year: number,
  allocated: number,
  notes?: string,
): Promise<DivisionBudgetRow> {
  const { data, error } = await supabase
    .from("division_budgets")
    .update({
      fiscal_year,
      allocated,
      notes: notes?.trim() || null,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as DivisionBudgetRow;
}

export async function fetchOrsEntries(
  year: number,
  divisionId?: number,
): Promise<OrsEntryRow[]> {
  let query = supabase.from("ors_entries").select("*").eq("fiscal_year", year);
  if (typeof divisionId === "number") {
    query = query.eq("division_id", divisionId);
  }
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as OrsEntryRow[];
}

export async function fetchOrsEntryByNo(orsNo: string): Promise<OrsEntryRow | null> {
  const { data, error } = await supabase
    .from("ors_entries")
    .select("*")
    .eq("ors_no", orsNo)
    .maybeSingle();
  if (error) throw error;
  return (data as any) ?? null;
}

export async function insertOrsEntry(entry: Omit<OrsEntryRow, "id">): Promise<OrsEntryRow> {
  const { data, error } = await supabase.from("ors_entries").insert(entry).select().single();
  if (error) throw error;
  return data as OrsEntryRow;
}

export async function updateOrsEntry(
  id: string,
  patch: Partial<Omit<OrsEntryRow, "id">>,
): Promise<OrsEntryRow> {
  const { data, error } = await supabase
    .from("ors_entries")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as OrsEntryRow;
}

export async function deleteOrsEntry(id: string): Promise<void> {
  const { error } = await supabase.from("ors_entries").delete().eq("id", id);
  if (error) throw error;
}

export async function generateOrsNumber(): Promise<string> {
  const y = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `ORS-${y}-${rand}`;
}
