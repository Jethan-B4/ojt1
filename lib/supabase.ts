import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import "react-native-url-polyfill/auto";

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  "https://yqfoykznqmdvgxsoassm.supabase.co";
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxZm95a3pucW1kdmd4c29hc3NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMTA5NjEsImV4cCI6MjA4Njg4Njk2MX0.NOtDkXus6fb2l-gXAruCCgNV4JjtYzieFmyv_qtb_4I";

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
 *  ┌─ id              int8        PK  identity
 *  ├─ pr_no           text        UNIQUE NOT NULL
 *  ├─ entity_name     text
 *  ├─ fund_cluster    text
 *  ├─ office_section  text        NOT NULL
 *  ├─ resp_code       text
 *  ├─ purpose         text        NOT NULL
 *  ├─ total_cost      int8        NOT NULL
 *  ├─ is_high_value   boolean     NOT NULL default false
 *  ├─ status_id       int8        FK → pr_status(id)  NOT NULL default 1
 *  ├─ budget_number   text
 *  ├─ pap_code        text
 *  ├─ proposal_file   text
 *  ├─ proposal_no     text        NOT NULL
 *  ├─ req_name        text
 *  ├─ req_desig       text
 *  ├─ app_name        text
 *  ├─ app_desig       text
 *  ├─ app_no          text
 *  ├─ division_id     int8        FK → divisions(division_id)
 *  └─ created_at      timestamptz default now()
 *
 *  pr_status
 *  ┌─ id              int8        PK identity
 *  └─ status_name     text        NOT NULL
 *     (1=Pending, 2=Processing(Division Head), 3=Processing(BAC),
 *      4=Processing(Budget), 5=Processing(PARPO),
 *      6=Canvassing & Resolution, 7=AAA)
 *
 *  purchase_request_items
 *  ┌─ id           int8     PK  identity
 *  ├─ pr_id        int8     FK → purchase_requests(id) ON DELETE CASCADE
 *  ├─ description  text     NOT NULL
 *  ├─ stock_no     text
 *  ├─ unit         text
 *  ├─ quantity     numeric  NOT NULL
 *  ├─ unit_price   numeric  NOT NULL
 *  └─ subtotal     numeric  NOT NULL
 *
 *  divisions
 *  ┌─ division_id    int8   PK identity
 *  └─ division_name  text   NOT NULL
 *
 *  users
 *  ┌─ id          int8   PK identity
 *  ├─ username    text   NOT NULL
 *  ├─ email       text
 *  ├─ role_id     int8   FK → roles(role_id)
 *  └─ division_id int8   FK → divisions(division_id)
 *
 *  roles
 *  ┌─ role_id    int8  PK
 *  └─ role_name  text  NOT NULL
 *     (1=Admin, 2=Division Head, 3=BAC, 4=Budget, 5=PARPO, 6=End User, 7=Canvasser)
 *
 *  remarks
 *  ┌─ id           int8        PK identity
 *  ├─ pr_id        int8        FK → purchase_requests(id)   NOT NULL
 *  ├─ user_id      int8        FK → users(id)               NOT NULL
 *  ├─ remark       text        NOT NULL
 *  ├─ status_flag  text        CHECK(status_flag IN (
 *  │                'complete','incomplete_info','wrong_information',
 *  │                'needs_revision','on_hold','urgent'))   nullable
 *  └─ created_at   timestamptz default now()
 *
 *  division_budgets
 *  ┌─ id           int8        PK identity
 *  ├─ division_id  int8        FK → divisions(division_id)  NOT NULL
 *  ├─ fiscal_year  int4        NOT NULL
 *  ├─ allocated    numeric     NOT NULL default 0
 *  ├─ utilized     numeric     NOT NULL default 0  (auto via trigger from approved ORS)
 *  ├─ notes        text
 *  ├─ created_at   timestamptz default now()
 *  ├─ updated_at   timestamptz
 *  └─ UNIQUE(division_id, fiscal_year)
 *
 *  ors_entries
 *  ┌─ id           int8        PK identity
 *  ├─ ors_no       text        UNIQUE NOT NULL
 *  ├─ pr_id        int8        FK → purchase_requests(id)   nullable
 *  ├─ pr_no        text        nullable
 *  ├─ division_id  int8        FK → divisions(division_id)  nullable
 *  ├─ fiscal_year  int4        NOT NULL
 *  ├─ amount       numeric     NOT NULL
 *  ├─ status       text        CHECK('Pending'|'Processing'|'Approved'|'Rejected')
 *  ├─ prepared_by  int8        FK → users(id)               nullable
 *  ├─ approved_by  int8        FK → users(id)               nullable
 *  ├─ notes        text        nullable
 *  ├─ created_at   timestamptz default now()
 *  └─ updated_at   timestamptz
 */
/**
 * Canvassing (Phase 2) — proposed tables (inputs and outputs)
 *
 * canvass_sessions
 * ┌─ id             int8      PK  identity
 * ├─ pr_id          int8      FK → purchase_requests.id
 * ├─ stage          text      ENUM-like: "pr_received" | "release_canvass" | "collect_canvass" | "bac_resolution" | "aaa_preparation"
 * ├─ released_by    int8      FK → users.id (BAC staff who released)
 * ├─ deadline       timestamptz  due date for canvass return (Step 7/8)
 * ├─ status         text      "open" | "closed" | "draft"
 * ├─ created_at     timestamptz default now()
 * ├─ updated_at     timestamptz
 *
 * canvasser_assignments
 * ┌─ id             int8      PK
 * ├─ session_id     int8      FK → canvass_sessions.id
 * ├─ division_id    int8      FK → divisions.division_id
 * ├─ canvasser_id   int8      FK → users.id (per division canvasser)
 * ├─ released_at    timestamptz (Step 7)
 * ├─ returned_at    timestamptz (Step 8)
 * ├─ status         text      "released" | "returned"
 *
 * canvass_entries  (supplier quotations)
 * ┌─ id             int8      PK
 * ├─ session_id     int8      FK → canvass_sessions.id
 * ├─ item_no        int8      index in PR items
 * ├─ description    text
 * ├─ unit           text
 * ├─ quantity       numeric
 * ├─ supplier_name  text
 * ├─ unit_price     numeric
 * ├─ total_price    numeric
 * ├─ is_winning     boolean   resolved at Step 9/10
 * ├─ created_at     timestamptz
 *
 * bac_resolution
 * ┌─ id             int8      PK
 * ├─ session_id     int8      FK → canvass_sessions.id
 * ├─ resolution_no  text
 * ├─ mode           text      ENUM-like: "SVP" | "Direct"
 * ├─ prepared_by    int8      FK → users.id
 * ├─ resolved_at    timestamptz (Step 9)
 * ├─ notes          text
 *
 * aaa_documents
 * ┌─ id             int8      PK
 * ├─ session_id     int8      FK → canvass_sessions.id
 * ├─ aaa_no         text
 * ├─ prepared_by    int8      FK → users.id
 * ├─ prepared_at    timestamptz (Step 10)
 * ├─ file_url       text (optional storage link)
 *
 * Inputs (from Phase 1 → Phase 2):
 *  • purchase_requests header (id, pr_no, purpose, division_id, items)
 * Outputs (Phase 2):
 *  • canvasser_assignments release records (Step 7/8)
 *  • canvass_entries supplier quotations (Step 8)
 *  • bac_resolution decision (Step 9)
 *  • aaa_documents prepared AAA (Step 10)
 */

// ─── Row types (mirror DB columns exactly) ────────────────────────────────────

/** Lookup row from the pr_status table. */
export interface PRStatusRow {
  id: number; // 1–5
  status_name: string; // e.g. "Pending", "Processing (Division Head)", …
}

export interface PRRow {
  id: string;
  pr_no: string;
  entity_name: string;
  fund_cluster: string;
  division_id?: number | null;
  office_section: string;
  resp_code: string;
  purpose: string;
  total_cost: number;
  is_high_value: boolean;
  /** FK → pr_status.id  (1=Pending, 2=Division Head, 3=BAC, 4=Budget, 5=PARPO) */
  status_id: number;
  budget_number: string | null;
  pap_code: string | null;
  proposal_file: string | null;
  /** Proposal number — always required regardless of PR value */
  proposal_no: string;
  req_name: string | null;
  req_desig: string | null;
  app_name: string | null;
  app_desig: string | null;
  app_no: string | null;
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
  const { data, error } = await supabase.from("purchase_requests").select("*");

  if (error) throw error;
  return data;
}

export async function fetchPurchaseRequestsByDivision(
  divisionId: number,
): Promise<PRRow[]> {
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("*")
    .eq("division_id", divisionId);

  if (error) throw error;
  return data;
}

export async function fetchCanvassablePRs(): Promise<PRRow[]> {
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("*")
    .gt("status_id", 5);
  if (error) throw error;
  return data as PRRow[];
}

export async function fetchCanvassablePRsByDivision(
  divisionId: number,
): Promise<PRRow[]> {
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("*")
    .gt("status_id", 5)
    .eq("division_id", divisionId);
  if (error) throw error;
  return data as PRRow[];
}

/**
 * Fetch all rows from the pr_status lookup table.
 * Used by any component that needs to display or resolve a status label.
 *
 * Returns rows ordered by id:
 *   1 → Pending
 *   2 → Processing (Division Head)
 *   3 → Processing (BAC)
 *   4 → Processing (Budget)
 *   5 → Processing (PARPO)
 */
export async function fetchPRStatuses(): Promise<PRStatusRow[]> {
  const { data, error } = await supabase
    .from("pr_status")
    .select("id, status_name")
    .order("id");
  if (error) throw error;
  return data as PRStatusRow[];
}

// Fetch PR header and items by header id
export async function fetchPRWithItemsById(
  prId: string,
): Promise<{ header: PRRow; items: PRItemRow[] }> {
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
  const header = headerResp.data as PRRow;
  const { data: items, error: iErr } = await supabase
    .from("purchase_request_items")
    .select(
      "id, stock_no, unit, description, quantity, unit_price, subtotal, pr_id",
    )
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
  items: Omit<PRItemRow, "id" | "pr_id">[],
): Promise<PRRow> {
  // Build payload with only defined, non-empty fields to avoid 400 from unknown/invalid values
  const base: Record<string, any> = {
    pr_no: pr.pr_no,
    office_section: pr.office_section,
    purpose: pr.purpose,
    total_cost: pr.total_cost,
    is_high_value: pr.is_high_value,
    status_id: pr.status_id, // FK → pr_status.id (1 = Pending on creation)
    proposal_no: pr.proposal_no, // always required
    division_id: pr.division_id,
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

  if (items.length > 0) {
    const parentId = (data as any).id ?? (data as any).pr_id;
    if (!parentId)
      throw new Error(
        "Insert succeeded but no primary key was returned for purchase_requests",
      );
    const { error: itemsError } = await supabase
      .from("purchase_request_items")
      .insert(items.map((item) => ({ ...item, pr_id: parentId })));

    if (itemsError) throw itemsError;
  }

  return data;
}

export async function insertProposalForPR(
  prId: string,
  proposalNo: string,
  divisionId?: number,
): Promise<void> {
  if (!proposalNo) return;
  const payload: Record<string, any> = { pr_id: prId, proposal_no: proposalNo };
  if (typeof divisionId === "number") payload.division_id = divisionId;
  const { error } = await supabase.from("proposals").insert(payload);
  if (error) throw error;
}

export async function setPRNumber(prId: string, prNo: string): Promise<PRRow> {
  const { data, error } = await supabase
    .from("purchase_requests")
    .update({ pr_no: prNo })
    .eq("id", prId)
    .select()
    .single();
  if (error) throw error;
  return data as PRRow;
}

// ─── Update PR header + replace line items ────────────────────────────────────

export async function updatePurchaseRequest(
  id: string,
  pr: Partial<Omit<PRRow, "id" | "pr_no" | "created_at">>,
  items: Omit<PRItemRow, "id" | "pr_id">[],
): Promise<PRRow> {
  // Build update payload — only include defined, non-empty fields
  const patch: Record<string, any> = {};
  if (pr.division_id !== undefined) patch.division_id = pr.division_id;
  if (pr.entity_name !== undefined) patch.entity_name = pr.entity_name || null;
  if (pr.fund_cluster !== undefined)
    patch.fund_cluster = pr.fund_cluster || null;
  if (pr.office_section !== undefined) patch.office_section = pr.office_section;
  if (pr.resp_code !== undefined) patch.resp_code = pr.resp_code || null;
  if (pr.purpose !== undefined) patch.purpose = pr.purpose;
  if (pr.total_cost !== undefined) patch.total_cost = pr.total_cost;
  if (pr.is_high_value !== undefined) patch.is_high_value = pr.is_high_value;
  if (pr.status_id !== undefined) patch.status_id = pr.status_id; // FK → pr_status.id
  if (pr.proposal_no !== undefined) patch.proposal_no = pr.proposal_no;
  if (pr.budget_number !== undefined)
    patch.budget_number = pr.budget_number || null;
  if (pr.pap_code !== undefined) patch.pap_code = pr.pap_code || null;
  if (pr.proposal_file !== undefined)
    patch.proposal_file = pr.proposal_file || null;
  if (pr.req_name !== undefined) patch.req_name = pr.req_name || null;
  if (pr.req_desig !== undefined) patch.req_desig = pr.req_desig || null;
  if (pr.app_name !== undefined) patch.app_name = pr.app_name || null;
  if (pr.app_desig !== undefined) patch.app_desig = pr.app_desig || null;
  if (pr.app_no !== undefined) patch.app_no = pr.app_no || null;
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

// ─── Canvassing · Types & Helpers (Phase 2 scaffolding) ───────────────────────

export interface CanvassSessionRow {
  id: string;
  pr_id: string;
  stage: string;
  status: string;
  released_by?: number | null;
  deadline?: string | null;
  bac_no?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CanvasserAssignmentRow {
  id: string;
  session_id: string;
  division_id: number;
  canvasser_id?: number | null;
  released_at?: string | null;
  returned_at?: string | null;
  status: "released" | "returned";
}

export interface CanvassEntryRow {
  id: string;
  session_id: string;
  item_no: number;
  description: string;
  unit: string;
  quantity: number;
  supplier_name: string;
  unit_price: number;
  total_price: number;
  is_winning?: boolean | null;
  created_at?: string;
}

export interface BACResolutionRow {
  id: string;
  session_id: string;
  resolution_no: string;
  prepared_by: number;
  mode?: string | null;
  resolved_at?: string | null;
  notes?: string | null;
}

export interface AAADocumentRow {
  id: string;
  session_id: string;
  aaa_no: string;
  prepared_by: number;
  prepared_at?: string | null;
  file_url?: string | null;
  particulars?: string | null;
}

export async function fetchPRIdByNo(prNo: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("id")
    .eq("pr_no", prNo)
    .single();
  if (error) return null;
  return (data as any)?.id ?? null;
}

/**
 * Fetch a PR's id and current status_id in a single query.
 * Used by BACView on mount so it can cache the prId AND restore
 * the correct canvass stage from pr_status.id without a second query.
 */
export async function fetchPRMetaByNo(
  prNo: string,
): Promise<{ id: string; status_id: number } | null> {
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("id, status_id")
    .eq("pr_no", prNo)
    .single();
  if (error || !data) return null;
  return {
    id: String((data as any).id),
    status_id: Number((data as any).status_id),
  };
}

/**
 * Maps each canvass stage to its corresponding pr_status.id in the DB.
 * Values come from the pr_status table (see DB_PR_Status.png):
 *
 *   6  = Canvassing (Reception)  ← BAC receives & assigns canvass number
 *   8  = Canvassing (Releasing)  ← RFQ released to canvassers
 *   9  = Canvassing (Collection) ← BAC collecting filled canvass sheets
 *   10 = BAC Resolution          ← resolution signed and recorded
 *   11 = AAA Issuance            ← abstract of awards finalised
 */
export const CANVASS_PR_STATUS: Record<string, number> = {
  pr_received: 6,
  release_canvass: 8,
  collect_canvass: 9,
  bac_resolution: 10,
  aaa_preparation: 11,
};

/**
 * Update only the status_id of a purchase_request row.
 * Used by the canvassing workflow to advance the PR's visible status
 * in the PR list as each canvass step is completed.
 *
 * Deliberately separate from updatePurchaseRequest so it never
 * accidentally mutates items or other fields.
 */
export async function updatePRStatus(
  prId: string,
  statusId: number,
): Promise<void> {
  const { error } = await supabase
    .from("purchase_requests")
    .update({ status_id: statusId })
    .eq("id", prId);
  if (error) throw error;
}

export async function ensureCanvassSession(
  prId: string,
  initial?: Partial<CanvassSessionRow>,
): Promise<CanvassSessionRow> {
  const { data, error } = await supabase
    .from("canvass_sessions")
    .select("*")
    .eq("pr_id", prId);
  if (error) throw error;
  if (Array.isArray(data) && data.length > 0)
    return data[0] as CanvassSessionRow;
  const payload: Record<string, any> = {
    pr_id: prId,
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
  return created as CanvassSessionRow;
}

export async function updateCanvassStage(
  sessionId: string,
  stage: string,
): Promise<CanvassSessionRow> {
  const { data, error } = await supabase
    .from("canvass_sessions")
    .update({ stage, updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .select()
    .single();
  if (error) throw error;
  return data as CanvassSessionRow;
}

export async function updateCanvassSessionMeta(
  sessionId: string,
  patch: Partial<Pick<CanvassSessionRow, "deadline" | "bac_no" | "status">>,
): Promise<CanvassSessionRow> {
  const { data, error } = await supabase
    .from("canvass_sessions")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .select()
    .single();
  if (error) throw error;
  return data as CanvassSessionRow;
}

export async function fetchDivisionIdByName(
  name: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("divisions")
    .select("division_id")
    .eq("division_name", name)
    .single();
  if (error) return null;
  return (data as any)?.division_id ?? null;
}

export async function insertAssignmentsForDivisions(
  sessionId: string,
  assignments: Array<{
    division_id: number;
    canvasser_id?: number;
    released_at?: string;
  }>,
): Promise<CanvasserAssignmentRow[]> {
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
  return data as CanvasserAssignmentRow[];
}

export async function markAssignmentReturned(
  sessionId: string,
  division_id: number,
  returned_at?: string,
): Promise<CanvasserAssignmentRow> {
  const { data, error } = await supabase
    .from("canvasser_assignments")
    .update({
      returned_at: returned_at ?? new Date().toISOString(),
      status: "returned",
    })
    .eq("session_id", sessionId)
    .eq("division_id", division_id)
    .select()
    .single();
  if (error) throw error;
  return data as CanvasserAssignmentRow;
}

export async function insertAssignmentReleased(
  sessionId: string,
  division_id: number,
  canvasser_id?: number | null,
  released_at?: string,
): Promise<CanvasserAssignmentRow> {
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
  return data as CanvasserAssignmentRow;
}

export async function updateAssignmentReleased(
  sessionId: string,
  division_id: number,
  canvasser_id?: number | null,
  released_at?: string,
): Promise<CanvasserAssignmentRow> {
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
    .select()
    .single();
  if (error) throw error;
  return data as CanvasserAssignmentRow;
}

/**
 * Insert supplier quotes for a session.
 *
 * Uses a plain INSERT — callers that need idempotent behaviour should use
 * replaceSupplierQuotesForSession instead.
 */
export async function insertSupplierQuotesForSession(
  sessionId: string,
  quotes: Array<Omit<CanvassEntryRow, "id" | "session_id">>,
): Promise<CanvassEntryRow[]> {
  if (!quotes.length) return [];
  const rows = quotes.map((q) => ({ ...q, session_id: sessionId }));
  const { data, error } = await supabase
    .from("canvass_entries")
    .insert(rows)
    .select();
  if (error) throw error;
  return data as CanvassEntryRow[];
}

/**
 * Replace ALL quotes for a session with the provided list.
 *
 * This is the correct function to call when:
 *   - The BAC encodes/submits quotations for the first time (Step 8)
 *   - The BAC edits and re-submits existing quotations (via CompletedBanner → Edit)
 *
 * It deletes every existing canvass_entries row for the session first, then
 * inserts the new set — so re-submitting never creates duplicate rows.
 */
export async function replaceSupplierQuotesForSession(
  sessionId: string,
  quotes: Array<Omit<CanvassEntryRow, "id" | "session_id">>,
): Promise<CanvassEntryRow[]> {
  // Step 1: delete all existing quotes for this session
  const { error: delError } = await supabase
    .from("canvass_entries")
    .delete()
    .eq("session_id", sessionId);
  if (delError) throw delError;

  // Step 2: insert the fresh set (if any)
  if (!quotes.length) return [];
  return insertSupplierQuotesForSession(sessionId, quotes);
}

export async function fetchAssignmentsForSession(
  sessionId: string,
): Promise<CanvasserAssignmentRow[]> {
  const { data, error } = await supabase
    .from("canvasser_assignments")
    .select("*")
    .eq("session_id", sessionId);
  if (error) throw error;
  return data as CanvasserAssignmentRow[];
}

/**
 * Fetch canvasser assignments for a session with resolved names.
 * Joins `divisions(division_name)` and `users(fullname)` so callers
 * never have to display raw numeric IDs.
 */
export interface EnrichedAssignmentRow extends CanvasserAssignmentRow {
  division_name: string | null;
  canvasser_name: string | null;
}

export async function fetchAssignmentsWithDetails(
  sessionId: string,
): Promise<EnrichedAssignmentRow[]> {
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
  })) as EnrichedAssignmentRow[];
}

export async function fetchQuotesForSession(
  sessionId: string,
): Promise<CanvassEntryRow[]> {
  const { data, error } = await supabase
    .from("canvass_entries")
    .select("*")
    .eq("session_id", sessionId);
  if (error) throw error;
  return data as CanvassEntryRow[];
}

export async function setItemWinningSupplier(
  sessionId: string,
  itemNo: number,
  supplierName: string,
): Promise<void> {
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

export async function insertBACResolution(
  sessionId: string,
  payload: Omit<BACResolutionRow, "id" | "session_id">,
): Promise<BACResolutionRow> {
  const { data, error } = await supabase
    .from("bac_resolution")
    .insert({ ...payload, session_id: sessionId })
    .select()
    .single();
  if (error) throw error;
  return data as BACResolutionRow;
}

export async function fetchBACResolutionForSession(
  sessionId: string,
): Promise<BACResolutionRow | null> {
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

export async function insertAAAForSession(
  sessionId: string,
  payload: Omit<AAADocumentRow, "id" | "session_id">,
): Promise<AAADocumentRow> {
  const { data, error } = await supabase
    .from("aaa_documents")
    .insert({ ...payload, session_id: sessionId })
    .select()
    .single();
  if (error) throw error;
  return data as AAADocumentRow;
}

/**
 * Upsert an AAA document for a session — delete-then-insert so that
 * re-saving never creates duplicate rows in aaa_documents.
 */
export async function updateAAAForSession(
  sessionId: string,
  payload: Partial<Omit<AAADocumentRow, "id" | "session_id">>,
): Promise<AAADocumentRow> {
  const { data, error } = await supabase
    .from("aaa_documents")
    .update(payload)
    .eq("session_id", sessionId)
    .select()
    .single();
  if (error) throw error;
  return data as AAADocumentRow;
}

export async function fetchAAAForSession(
  sessionId: string,
): Promise<AAADocumentRow | null> {
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

export async function fetchCanvassSessionById(
  sessionId: string,
): Promise<CanvassSessionRow | null> {
  const { data, error } = await supabase
    .from("canvass_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (error) return null;
  return data as CanvassSessionRow;
}

// ─── Budget Module · Types & Helpers ─────────────────────────────────────────

export interface DivisionBudgetRow {
  id: string;
  division_id: number;
  fiscal_year: number;
  allocated: number;
  utilized: number; // auto-updated by DB trigger from approved ORS entries
  notes: string | null;
  created_at?: string;
  updated_at?: string;
  // Joined from divisions table (select with division_name)
  division_name?: string;
}

export interface OrsEntryRow {
  id: string;
  ors_no: string; // e.g. ORS-2026-0145
  pr_id: string | null;
  pr_no: string | null;
  division_id: number | null;
  fiscal_year: number;
  amount: number;
  status: "Pending" | "Processing" | "Approved" | "Rejected";
  prepared_by: number | null;
  approved_by: number | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
  // Joined
  division_name?: string;
}

// ── Fetch all budget rows for a fiscal year, joined with division name ────────

export async function fetchBudgets(
  fiscalYear: number,
): Promise<DivisionBudgetRow[]> {
  const { data, error } = await supabase
    .from("division_budgets")
    .select("*, divisions(division_name)")
    .eq("fiscal_year", fiscalYear)
    .order("division_id");
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    ...r,
    division_name: r.divisions?.division_name ?? null,
  })) as DivisionBudgetRow[];
}

export async function fetchBudgetByDivision(
  divisionId: number,
  fiscalYear: number,
): Promise<DivisionBudgetRow | null> {
  const { data, error } = await supabase
    .from("division_budgets")
    .select("*, divisions(division_name)")
    .eq("division_id", divisionId)
    .eq("fiscal_year", fiscalYear)
    .single();
  if (error) return null;
  return {
    ...(data as any),
    division_name: (data as any).divisions?.division_name ?? null,
  };
}

// ── Upsert a division's allocated budget (Budget / Admin only) ────────────────

/** Create a brand-new division budget allocation row (from CreateAllocModal). */
export async function insertDivisionBudget(
  divisionId: number,
  fiscalYear: number,
  allocated: number,
  notes?: string,
): Promise<DivisionBudgetRow> {
  const { data, error } = await supabase
    .from("division_budgets")
    .insert({
      division_id: divisionId,
      fiscal_year: fiscalYear,
      allocated,
      notes: notes ?? null,
    })
    .select("*, divisions(division_name)")
    .single();
  if (error) throw error;
  return {
    ...(data as any),
    division_name: (data as any).divisions?.division_name ?? null,
  };
}

/** Update an existing allocation row by its primary key (from AllocModal). */
export async function updateDivisionBudget(
  id: string,
  fiscalYear: number,
  allocated: number,
  notes?: string,
): Promise<DivisionBudgetRow> {
  const { data, error } = await supabase
    .from("division_budgets")
    .update({
      fiscal_year: fiscalYear,
      allocated,
      notes: notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*, divisions(division_name)")
    .single();
  if (error) throw error;
  return {
    ...(data as any),
    division_name: (data as any).divisions?.division_name ?? null,
  };
}

// ── ORS helpers ───────────────────────────────────────────────────────────────

export async function fetchOrsEntries(
  fiscalYear: number,
  divisionId?: number,
): Promise<OrsEntryRow[]> {
  let q = supabase
    .from("ors_entries")
    .select("*, divisions(division_name)")
    .eq("fiscal_year", fiscalYear)
    .order("created_at", { ascending: false });
  if (divisionId !== undefined) q = q.eq("division_id", divisionId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    ...r,
    division_name: r.divisions?.division_name ?? null,
  })) as OrsEntryRow[];
}

export async function insertOrsEntry(
  entry: Omit<
    OrsEntryRow,
    "id" | "created_at" | "updated_at" | "division_name"
  >,
): Promise<OrsEntryRow> {
  const { data, error } = await supabase
    .from("ors_entries")
    .insert(entry)
    .select("*, divisions(division_name)")
    .single();
  if (error) throw error;
  return {
    ...(data as any),
    division_name: (data as any).divisions?.division_name ?? null,
  };
}

export async function updateOrsStatus(
  orsId: string,
  status: OrsEntryRow["status"],
  approvedBy?: number,
): Promise<OrsEntryRow> {
  const patch: Record<string, any> = { status };
  if (approvedBy !== undefined) patch.approved_by = approvedBy;
  const { data, error } = await supabase
    .from("ors_entries")
    .update(patch)
    .eq("id", orsId)
    .select("*, divisions(division_name)")
    .single();
  if (error) throw error;
  return {
    ...(data as any),
    division_name: (data as any).divisions?.division_name ?? null,
  };
}

export async function updateOrsEntry(
  orsId: string,
  patch: Partial<
    Pick<
      OrsEntryRow,
      "ors_no" | "pr_no" | "amount" | "status" | "notes" | "approved_by"
    >
  >,
): Promise<OrsEntryRow> {
  const { data, error } = await supabase
    .from("ors_entries")
    .update(patch)
    .eq("id", orsId)
    .select("*, divisions(division_name)")
    .single();
  if (error) throw error;
  return {
    ...(data as any),
    division_name: (data as any).divisions?.division_name ?? null,
  };
}

export async function deleteOrsEntry(orsId: string): Promise<void> {
  const { error } = await supabase.from("ors_entries").delete().eq("id", orsId);
  if (error) throw error;
}

// ── Generate next ORS number for current year ─────────────────────────────────

export async function generateOrsNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const { count, error } = await supabase
    .from("ors_entries")
    .select("*", { count: "exact", head: true })
    .like("ors_no", `ORS-${year}-%`);
  if (error) throw error;
  const seq = String((count ?? 0) + 1).padStart(4, "0");
  return `ORS-${year}-${seq}`;
}

// ─── Divisions ────────────────────────────────────────────────────────────────

export interface DivisionRow {
  division_id: number;
  division_name: string | null;
}

/** Fetch all divisions ordered by name. Used by CreateAllocModal and any
 *  component that needs the full division list regardless of budget data. */
export async function fetchAllDivisions(): Promise<DivisionRow[]> {
  const { data, error } = await supabase
    .from("divisions")
    .select("division_id, division_name")
    .order("division_name");
  if (error) throw error;
  return (data ?? []) as DivisionRow[];
}

// ─── Canvass user helpers ─────────────────────────────────────────────────────

/**
 * A user row enriched with their division name, used for canvass assignment.
 * role_id 6 = End User (the submitting division rep)
 * role_id 7 = Canvasser (designated canvass collector per division)
 */
export interface CanvassUserRow {
  id: number;
  username: string;
  role_id: number;
  division_id: number | null;
  division_name: string | null;
}

/**
 * Fetch users whose role_id is in the provided list, joined with their division name.
 * Used by BACView to populate the release/return canvass assignment table
 * with actual End Users (role 6) and Canvassers (role 7) from the DB.
 */
export async function fetchUsersByRole(
  roleIds: number[],
): Promise<CanvassUserRow[]> {
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
  })) as CanvassUserRow[];
}

/** Row from the status_flag lookup table. */
export interface StatusFlagRow {
  id: number;
  flag_name: string;
}

/** Valid status_flag values — kept for backward compatibility. */
export type StatusFlag =
  | "complete"
  | "incomplete_info"
  | "wrong_information"
  | "needs_revision"
  | "on_hold"
  | "urgent";

export interface RemarkRow {
  id: number;
  pr_id: number | string; // FK → purchase_requests.id
  user_id: number; // FK → users.id
  remark: string;
  status_flag_id: number | null; // FK → status_flag.id (new)
  created_at: string;
  // Joined from users table when fetched with select("*, users(username)")
  username?: string;
  // Joined from status_flag table when fetched with select("*, status_flag(...)")
  status_flag?: StatusFlagRow;
}

/**
 * Insert a single remark for a PR.
 * Called by ProcessPRModal (on process/sign) and PRModule RemarkSheet (ad-hoc).
 */
export async function insertRemark(
  prId: number | string,
  userId: number | string,
  remark: string,
  status_flag_Id: number | null,
): Promise<RemarkRow> {
  const { data, error } = await supabase
    .from("remarks")
    .insert({
      pr_id: prId,
      user_id: userId,
      remark: remark.trim(),
      status_flag_id: status_flag_Id ?? null,
    })
    .select(
      "id, pr_id, user_id, remark, status_flag_id, created_at, status_flag(*)",
    )
    .single();
  if (error) throw error;
  return {
    id: (data as any).id,
    pr_id: (data as any).pr_id,
    user_id: (data as any).user_id,
    remark: (data as any).remark,
    status_flag_id: (data as any).status_flag_id,
    created_at: (data as any).created_at,
    status_flag: (data as any).status_flag ?? undefined,
  };
}

/**
 * Fetch all remarks for a given PR, newest first.
 * Joins users(username) and status_flag table.
 */
export async function fetchRemarksByPR(
  prId: number | string,
): Promise<RemarkRow[]> {
  const { data, error } = await supabase
    .from("remarks")
    .select(
      "id, pr_id, user_id, remark, status_flag_id, created_at, users(fullname), status_flag(*)",
    )
    .eq("pr_id", prId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    pr_id: r.pr_id,
    user_id: r.user_id,
    remark: r.remark,
    status_flag_id: r.status_flag_id,
    created_at: r.created_at,
    username: r.users?.fullname ?? undefined,
    status_flag: r.status_flag ?? undefined,
  })) as RemarkRow[];
}

/**
 * Fetch the most recent remark for a PR (e.g. to show the latest flag on a card).
 * Returns null if none exist.
 */
export async function fetchLatestRemarkByPR(
  prId: number | string,
): Promise<RemarkRow | null> {
  const { data, error } = await supabase
    .from("remarks")
    .select(
      "id, pr_id, user_id, remark, status_flag_id, created_at, users(fullname), status_flag(*)",
    )
    .eq("pr_id", prId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: (data as any).id,
    pr_id: (data as any).pr_id,
    user_id: (data as any).user_id,
    remark: (data as any).remark,
    status_flag_id: (data as any).status_flag_id,
    created_at: (data as any).created_at,
    username: (data as any).users?.fullname ?? undefined,
    status_flag: (data as any).status_flag ?? undefined,
  };
}

/**
 * Delete a remark by id. Only the author or an Admin should call this;
 * enforce that in the UI layer — RLS handles it on the DB side.
 */
export async function deleteRemark(remarkId: number): Promise<void> {
  const { error } = await supabase.from("remarks").delete().eq("id", remarkId);
  if (error) throw error;
}

// ─── Storage: Upload PR-related files ─────────────────────────────────────────

/**
 * Upload a local file (file:// or content:// URI) to the 'pr_files' bucket
 * and return its public URL.
 *
 * Approach:
 *   1. Read the file as a base64 string via expo-file-system (avoids fetch(file://…) issues).
 *   2. Decode base64 → ArrayBuffer via `base64-arraybuffer`'s `decode()`.
 *      This is the officially recommended pattern for Supabase + Expo uploads
 *      and sidesteps the broken `fetch("data:…")` behaviour in React Native.
 *   3. Upload the ArrayBuffer directly to Supabase Storage.
 *
 * Dependencies (add if missing):
 *   npx expo install expo-file-system
 *   npm install base64-arraybuffer
 *
 * Note: Uses `expo-file-system/legacy` — required for Expo SDK 51+.
 *   The top-level `expo-file-system` namespace deprecated `getInfoAsync`,
 *   `readAsStringAsync`, and `EncodingType` in favour of the new File/Directory
 *   class API. Importing from `/legacy` restores the old functional API.
 *
 * @param localUri    - Expo file URI, e.g. `file:///data/…/document.pdf`
 * @param remotePath  - Destination path inside the bucket, e.g.
 *                      `${prNo}/${Date.now()}-proposal.pdf`
 *                      Must be unique per upload — always include a timestamp
 *                      or UUID to prevent silent overwrites.
 * @param contentType - MIME type, e.g. `"application/pdf"` or `"image/jpeg"`.
 *                      Defaults to `"application/octet-stream"`.
 * @param onProgress  - Optional callback fired at key stages (values: 10, 30, 100).
 */
export async function uploadPRFile(
  localUri: string,
  remotePath: string,
  contentType?: string,
  onProgress?: (percent: number) => void,
): Promise<{ path: string; publicUrl: string }> {
  // ── 1. Resolve MIME type once ─────────────────────────────────────────────
  const mimeType = contentType ?? "application/octet-stream";

  try {
    // ── 2. Validate: file must exist and be within the 20 MB limit ───────────
    const info = await FileSystem.getInfoAsync(localUri);
    if (!info.exists) {
      throw new Error("Selected file no longer exists.");
    }
    if (typeof info.size === "number" && info.size > 20 * 1024 * 1024) {
      throw new Error("File is too large. Maximum size is 20 MB.");
    }

    // ── 3. Read file as base64 string ────────────────────────────────────────
    //    `FileSystem.EncodingType.Base64` was removed from the namespace in
    //    expo-file-system v17+ (Expo SDK 51+). Use the string literal "base64"
    //    directly — it is always accepted and requires no extra import.
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: "base64" as any,
    });

    onProgress?.(10); // file read complete

    // ── 4. Decode base64 → ArrayBuffer ───────────────────────────────────────
    //    `decode()` from `base64-arraybuffer` is the Supabase-recommended way
    //    to prepare binary data for storage uploads in React Native / Expo.
    const arrayBuffer = decode(base64);

    onProgress?.(30); // buffer ready, upload starting

    // ── 5. Upload ArrayBuffer to Supabase Storage ─────────────────────────────
    //    `upsert: false` is intentional — it prevents silent overwrites.
    //    A 409 "already exists" error means `remotePath` is not unique; the
    //    caller should include a timestamp or UUID in the path.
    const { data, error: uploadError } = await supabase.storage
      .from("pr_files")
      .upload(remotePath, arrayBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      if (
        uploadError.message?.toLowerCase().includes("already exists") ||
        (uploadError as any).statusCode === 409
      ) {
        throw new Error(
          `A file already exists at "${remotePath}". ` +
            `Include a timestamp or UUID in the path to make it unique.`,
        );
      }
      throw uploadError;
    }

    onProgress?.(100); // upload complete

    // ── 6. Resolve and return the public URL ──────────────────────────────────
    const { data: urlData } = supabase.storage
      .from("pr_files")
      .getPublicUrl(remotePath);

    return { path: data.path, publicUrl: urlData.publicUrl };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    throw new Error(`Upload failed: ${msg}`);
  }
}

// ─── User Management ───────────────────────────────────────────────────────────

/**
 * Fetch all users with their division and role information.
 * Used by the user management screen.
 */
export interface UserRow {
  username: string; // login id
  id?: string;
  fullname: string;
  password: string;
  division_id: number | null;
  role_id: number;
  last_login: string | null;
  created_at?: string;
  // Joined data
  division_name?: string | null;
  role_name?: string | null;
}

export async function fetchAllUsers(): Promise<UserRow[]> {
  const { data, error } = await supabase
    .from("users")
    .select(
      `
      id,
      username,
      fullname,
      password,
      division_id,
      role_id,
      last_login,
      created_at,
      divisions(division_name),
      roles(role_name)
    `,
    )
    .order("fullname");

  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    id: r.id,
    username: r.username,
    fullname: r.fullname,
    password: r.password,
    division_id: r.division_id ?? null,
    role_id: r.role_id,
    last_login: r.last_login ?? null,
    created_at: r.created_at,
    division_name: r.divisions?.division_name ?? null,
    role_name: r.roles?.role_name ?? null,
  }));
}

/**
 * Update the last_login timestamp for a user.
 * Called after successful authentication.
 */
export async function updateLastLogin(userId: string): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({ last_login: new Date().toISOString() })
    .eq("username", userId);

  if (error) throw error;
}

// ─── Roles ────────────────────────────────────────────────────────────────────

export interface RoleRow {
  role_id: number;
  role_name: string;
}

export async function fetchAllRoles(): Promise<RoleRow[]> {
  const { data, error } = await supabase
    .from("roles")
    .select("role_id, role_name")
    .order("role_id");

  if (error) throw error;
  return data ?? [];
}

// ─── User CRUD Operations ─────────────────────────────────────────────────────

/**
 * Create a new user.
 */
export async function createUser(
  user: Omit<UserRow, "id" | "created_at" | "division_name" | "role_name">,
): Promise<UserRow> {
  const { data, error } = await supabase
    .from("users")
    .insert([
      {
        username: user.username,
        fullname: user.fullname,
        password: user.password,
        division_id: user.division_id ?? null,
        role_id: user.role_id,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update an existing user.
 */
/**
 * Update an existing user.
 * Supports updating all fields including user_id.
 */
export async function updateUser(
  userId: string,
  patch: Partial<
    Omit<UserRow, "id" | "created_at" | "division_name" | "role_name">
  >,
): Promise<UserRow> {
  const { data, error } = await supabase
    .from("users")
    .update(patch)
    .eq("username", userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a user by user_id.
 */
export async function deleteUser(userId: string): Promise<void> {
  const { error } = await supabase
    .from("users")
    .delete()
    .eq("username", userId);

  if (error) throw error;
}
