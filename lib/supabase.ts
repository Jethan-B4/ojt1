import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import 'react-native-url-polyfill/auto';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://yqfoykznqmdvgxsoassm.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxZm95a3pucW1kdmd4c29hc3NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMTA5NjEsImV4cCI6MjA4Njg4Njk2MX0.NOtDkXus6fb2l-gXAruCCgNV4JjtYzieFmyv_qtb_4I';


// Accesses the Supabase Auth client
// export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
//   auth: {
//     storage: ExpoSecureStoreAdapter,
//     autoRefreshToken: true,
//     persistSession: true,
//     detectSessionInUrl: false,
//   },
// });


// Accesses the Supabase Database client
// We have disabled auth persistence since we are using custom local auth with the 'users' table
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    persistSession: false, // Disable session persistence
    autoRefreshToken: false, // Disable auto refresh
    detectSessionInUrl: false,
  },
});

/**
 * lib/supabase.ts
 *
 * Supabase client + typed DB helpers for the Purchase Request module.
 *
 * Setup:
 *   npx expo install @supabase/supabase-js @react-native-async-storage/async-storage
 *
 * Add to .env:
 *   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
 *
 * ── Required Supabase tables ─────────────────────────────────────────────────
 *
 *  purchase_requests
 *  ┌─ pr_id              uuid        PK  default gen_random_uuid()
 *  ├─ pr_no           text        UNIQUE NOT NULL
 *  ├─ office_section  text        NOT NULL
 *  ├─ resp_code       text
 *  ├─ purpose         text        NOT NULL
 *  ├─ total_cost      numeric     NOT NULL
 *  ├─ is_high_value   boolean     NOT NULL default false
 *  ├─ status          text        NOT NULL default 'pending'
 *  ├─ budget_number   text
 *  ├─ pap_code        text
 *  ├─ proposal_file   text
 *  └─ created_at      timestamptz default now()
 *
 *  purchase_request_items
 *  ┌─ pr_item_id           uuid    PK  default gen_random_uuid()
 *  ├─ pr_id        uuid    NOT NULL references purchase_requests(pr_id) on delete cascade
 *  ├─ description  text    NOT NULL
 *  ├─ stock_no     text
 *  ├─ unit         text
 *  ├─ quantity     numeric NOT NULL
 *  ├─ unit_price   numeric NOT NULL
 *  └─ subtotal     numeric NOT NULL
 */

// ─── Row types (mirror DB columns exactly) ────────────────────────────────────

export interface PRRow {
  id: string;
  pr_no: string;
  office_section: string;
  resp_code: string;
  purpose: string;
  total_cost: number;
  is_high_value: boolean;
  status: "draft" | "pending" | "approved" | "overdue" | "processing";
  budget_number: string | null;
  pap_code: string | null;
  proposal_file: string | null;
  created_at?: string;
}

export interface PRItemRow {
  id: string;
  pr_id: string;
  description: string;
  stock_no: string;
  unit: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

/**
 * Fetch all purchase requests from the database.
 *
 * @returns A promise that resolves to an array of PRRow objects.
 */
export async function fetchPurchaseRequests(): Promise<PRRow[]> {
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("*");

  if (error) throw error;
  return data;
}

export async function fetchPurchaseRequestsByDivision(divisionId: number): Promise<PRRow[]> {
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("*")
    .eq("division_id", divisionId);

  if (error) throw error;
  return data;
}

// Fetch PR header and items by header id
export async function fetchPRWithItemsById(prId: string): Promise<{ header: PRRow; items: PRItemRow[] }> {
  let headerResp = await supabase.from("purchase_requests").select("*").eq("id", prId).single();
  if (headerResp.error) {
    headerResp = await supabase.from("purchase_requests").select("*").eq("pr_id", prId).single();
  }
  if (headerResp.error || !headerResp.data) throw headerResp.error ?? new Error("PR not found");
  const header = headerResp.data as PRRow;
  const { data: items, error: iErr } = await supabase
    .from("purchase_request_items")
    .select("id, stock_no, unit, description, quantity, unit_price, subtotal, pr_id")
    .eq("pr_id", (header as any).id ?? (header as any).pr_id);
  if (iErr) throw iErr;
  return { header, items };
}

// ─── Generate next sequential PR number: YYYY-PR-XXXX ─────────────────────────

export async function generatePRNumber(): Promise<string> {
  const year = new Date().getFullYear();

  const { count, error } = await supabase
    .from("purchase_requests")
    .select("*", { count: "exact", head: true })
    .like("pr_no", `${year}-PR-%`);

  if (error) throw error;

  const seq = String((count ?? 0) + 1).padStart(4, "0");
  return `${year}-PR-${seq}`;
}

// ─── Insert PR header + line items atomically ─────────────────────────────────

export async function insertPurchaseRequest(
  pr: Omit<PRRow, "id" | "created_at">,
  items: Omit<PRItemRow, "id" | "pr_id">[]
): Promise<PRRow> {
  // Build payload with only defined, non-empty fields to avoid 400 from unknown/invalid values
  const base: Record<string, any> = {
    pr_no: pr.pr_no,
    office_section: pr.office_section,
    purpose: pr.purpose,
    total_cost: pr.total_cost,
    is_high_value: pr.is_high_value,
    status: pr.status,
  };
  if (pr.resp_code)       base.resp_code = pr.resp_code;
  if (pr.budget_number)   base.budget_number = pr.budget_number;
  if (pr.pap_code)        base.pap_code = pr.pap_code;
  if (pr.proposal_file)   base.proposal_file = pr.proposal_file;

  const { data, error } = await supabase
    .from("purchase_requests")
    .insert(base)
    .select()
    .single();

  if (error) throw error;

  if (items.length > 0) {
    const parentId = (data as any).id ?? (data as any).pr_id;
    if (!parentId) throw new Error("Insert succeeded but no primary key was returned for purchase_requests");
    const { error: itemsError } = await supabase
      .from("purchase_request_items")
      .insert(items.map((item) => ({ ...item, pr_id: parentId })));

    if (itemsError) throw itemsError;
  }

  return data;
}

// ─── Update PR header + replace line items ────────────────────────────────────

export async function updatePurchaseRequest(
  id: string,
  pr: Partial<Omit<PRRow, "id" | "pr_no" | "created_at">>,
  items: Omit<PRItemRow, "id" | "pr_id">[]
): Promise<PRRow> {
  // Build update payload — only include defined, non-empty fields
  const patch: Record<string, any> = {};
  if (pr.office_section !== undefined) patch.office_section = pr.office_section;
  if (pr.resp_code      !== undefined) patch.resp_code      = pr.resp_code;
  if (pr.purpose        !== undefined) patch.purpose        = pr.purpose;
  if (pr.total_cost     !== undefined) patch.total_cost     = pr.total_cost;
  if (pr.is_high_value  !== undefined) patch.is_high_value  = pr.is_high_value;
  if (pr.budget_number  !== undefined) patch.budget_number  = pr.budget_number  || null;
  if (pr.pap_code       !== undefined) patch.pap_code       = pr.pap_code       || null;
  if (pr.proposal_file  !== undefined) patch.proposal_file  = pr.proposal_file  || null;

  const { data, error } = await supabase
    .from("purchase_requests")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  // Replace all existing items for this PR, then re-insert the updated set
  const { error: deleteError } = await supabase
    .from("purchase_request_items")
    .delete()
    .eq("pr_id", id);

  if (deleteError) throw deleteError;

  if (items.length > 0) {
    const { error: insertError } = await supabase
      .from("purchase_request_items")
      .insert(items.map((item) => ({ ...item, pr_id: id })));

    if (insertError) throw insertError;
  }

  return data;
}
