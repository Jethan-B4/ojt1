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
