export type PRStatusRow = { id: number; status_name: string };
export type PRRow = Record<string, any>;
export type RemarkRow = Record<string, any>;

export interface PRItemRow {
  id?: string;
  pr_id?: string;
  stock_no: string | null;
  unit: string;
  description: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface CanvasserAssignmentRow {
  id: number;
  session_id: string | number;
  division_id: number;
  canvasser_id?: number | null;
  /** RFQ "Quotation No." (assigned by BAC during release) */
  quotation_no?: string | null;
  /** Sequence number within a session (1..N) */
  rfq_index?: number | null;
  released_at?: string | null;
  returned_at?: string | null;
  status: "released" | "returned";
}

export interface CanvassEntryRow {
  id: number;
  session_id: string | number;
  /** Nullable: when set, ties the row to a specific canvasser assignment return */
  assignment_id?: number | null;
  item_no: number;
  description: string;
  unit: string;
  quantity: number;
  supplier_name: string;
  tin_no?: string | null;
  delivery_days?: string | null;
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

export interface CanvassUserRow {
  id: number;
  username: string;
  role_id: number;
  division_id: number | null;
  division_name: string | null;
}

export interface EnrichedAssignmentRow extends CanvasserAssignmentRow {
  division_name: string | null;
  canvasser_name: string | null;
}

/**
 * lib/supabase/types.ts
 * Shared domain types for the Procurement system.
 */

export type StatusFlag =
  | "all"
  | "no_flag"
  | "complete"
  | "incomplete_info"
  | "wrong_information"
  | "needs_revision"
  | "on_hold"
  | "urgent"
  | "cancelled";

export const STATUS_FLAGS: StatusFlag[] = [
  "all",
  "no_flag",
  "complete",
  "incomplete_info",
  "wrong_information",
  "needs_revision",
  "on_hold",
  "urgent",
  "cancelled",
];

// Mapping helper if you need to convert string flags to DB IDs
export const FLAG_TO_ID: Record<StatusFlag, number | null> = {
  all: null,
  no_flag: 1,
  complete: 2,
  incomplete_info: 3,
  wrong_information: 4,
  needs_revision: 5,
  on_hold: 6,
  urgent: 7,
  cancelled: 8,
};
